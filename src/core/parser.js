// EES-style equation language parser.
// Comments: "..." , {...} , // to end of line. Separators: newline or ';'.
// Units: 800 [kPa]. Arrays: h[1]. Property calls: enthalpy(Water, P=P1, T=T1).
import { parseUnit, toSI } from './units.js';

export class ParseError extends Error { constructor(msg, line) { super(msg); this.line = line; } }

export function stripComments(src) {
  // keep line structure (replace comment chars by spaces, keep newlines)
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') { const j = src.indexOf('"', i + 1); const end = j < 0 ? src.length : j + 1; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '{') { const j = src.indexOf('}', i + 1); const end = j < 0 ? src.length : j + 1; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = src.length; out += ' '.repeat(j - i); i = j; continue; }
    out += c; i++;
  }
  return out;
}

export function splitEquations(src) {
  const clean = stripComments(src);
  const lines = clean.split('\n');
  const eqs = [];
  lines.forEach((ln, idx) => {
    // split on ';' but not inside brackets/parentheses
    let depth = 0, cur = '', startCol = 0;
    for (let k = 0; k < ln.length; k++) {
      const ch = ln[k];
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === ';' && depth === 0) { if (cur.trim()) eqs.push({ text: cur.trim(), line: idx + 1, rawLine: src.split('\n')[idx] }); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) eqs.push({ text: cur.trim(), line: idx + 1, rawLine: src.split('\n')[idx] });
  });
  return eqs;
}

function tokenize(s, line) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/);
      if (!m) throw new ParseError('Bad number near "' + s.slice(i, i + 8) + '"', line);
      t.push({ k: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*#?/);
      let name = m[0]; i += name.length;
      // array index directly attached: h[1] or h[i]
      if (s[i] === '[' && !name.endsWith('#')) {
        const j = s.indexOf(']', i);
        const inner = s.slice(i + 1, j).trim();
        if (/^[0-9,\s]+$/.test(inner)) { name += '[' + inner.replace(/\s/g, '') + ']'; i = j + 1; }
      }
      t.push({ k: 'id', v: name }); continue;
    }
    if (c === "'") { const j = s.indexOf("'", i + 1); if (j < 0) throw new ParseError('Unclosed quote', line); t.push({ k: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === '[') { const j = s.indexOf(']', i); if (j < 0) throw new ParseError('Unclosed [unit]', line); t.push({ k: 'unit', v: s.slice(i + 1, j).trim() }); i = j + 1; continue; }
    if ('+-*/^(),='.includes(c)) { t.push({ k: c }); i++; continue; }
    throw new ParseError(`Unexpected character "${c}"`, line);
  }
  return t;
}

export const PROP_FUNCS = {
  enthalpy: 'h', entropy: 's', temperature: 'T', pressure: 'P', volume: 'v', density: 'rho', intenergy: 'u', quality: 'x',
  cp: 'cp', cv: 'cv', viscosity: 'mu', conductivity: 'k', prandtl: 'Pr', soundspeed: 'a', molarmass: 'M',
  t_sat: 'Tsat', p_sat: 'Psat', t_crit: 'Tcrit', p_crit: 'Pcrit',
};
export const MATH_FUNCS = { sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1, exp: 1, ln: 1, log10: 1, sqrt: 1, abs: 1, min: 2, max: 2, atan2: 2, sind: 1, cosd: 1, tand: 1, arcsind: 1, arccosd: 1, arctand: 1 };
export const CONSTANTS = { 'pi': Math.PI, 'pi#': Math.PI, 'g#': 9.80665, 'R#': 8.314462618, 'sigma#': 5.670374419e-8, 'k#': 1.380649e-23 };
export const CONST_UNITS = { 'g#': 'm/s^2', 'R#': 'J/mol-K', 'sigma#': 'W/m^2-K^4', 'k#': 'J/K' };

function parseExpr(tokens, line) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (k) => { const tk = tokens[p]; if (!tk || (k && tk.k !== k)) throw new ParseError(`Expected "${k}" but found "${tk ? (tk.v ?? tk.k) : 'end of equation'}"`, line); p++; return tk; };
  function primary() {
    const tk = peek();
    if (!tk) throw new ParseError('Unexpected end of equation', line);
    if (tk.k === 'num') {
      p++; let unit = null;
      if (peek() && peek().k === 'unit') { unit = eat('unit').v; try { parseUnit(unit); } catch (e) { throw new ParseError(e.message, line); } }
      return { t: 'num', v: tk.v, unit, si: unit ? toSI(tk.v, unit) : tk.v };
    }
    if (tk.k === '(') { p++; const e = expr(); eat(')'); return { t: 'par', a: e }; }
    if (tk.k === '-') { p++; return { t: 'neg', a: power() }; }
    if (tk.k === '+') { p++; return power(); }
    if (tk.k === 'id') {
      p++;
      const name = tk.v; const lname = name.toLowerCase();
      if (peek() && peek().k === '(') {
        p++;
        if (PROP_FUNCS[lname]) {
          const ftk = eat(); if (ftk.k !== 'id' && ftk.k !== 'str') throw new ParseError('First argument of ' + name + ' must be a fluid name', line);
          const named = {};
          while (peek() && peek().k === ',') {
            p++;
            const key = eat('id').v; eat('='); named[key] = expr();
          }
          eat(')');
          return { t: 'prop', fn: lname, out: PROP_FUNCS[lname], fluid: ftk.v, named, name };
        }
        if (!MATH_FUNCS[lname]) throw new ParseError(`Unknown function "${name}"`, line);
        const args = [];
        if (peek() && peek().k !== ')') { args.push(expr()); while (peek() && peek().k === ',') { p++; args.push(expr()); } }
        eat(')');
        if (args.length !== MATH_FUNCS[lname]) throw new ParseError(`${name}() takes ${MATH_FUNCS[lname]} argument(s)`, line);
        return { t: 'call', fn: lname, args };
      }
      if (CONSTANTS[name] !== undefined) return { t: 'const', name, v: CONSTANTS[name] };
      return { t: 'var', name };
    }
    throw new ParseError(`Unexpected "${tk.v ?? tk.k}"`, line);
  }
  function power() {
    let a = primary();
    if (peek() && peek().k === '^') { p++; const b = unary(); a = { t: 'bin', op: '^', a, b }; }
    return a;
  }
  function unary() { if (peek() && peek().k === '-') { p++; return { t: 'neg', a: unary() }; } return power(); }
  function term() {
    let a = unary();
    while (peek() && (peek().k === '*' || peek().k === '/')) { const op = tokens[p++].k; const b = unary(); a = { t: 'bin', op, a, b }; }
    return a;
  }
  function expr() {
    let a = term();
    while (peek() && (peek().k === '+' || peek().k === '-')) { const op = tokens[p++].k; const b = term(); a = { t: 'bin', op, a, b }; }
    return a;
  }
  const e = expr();
  return { e, rest: tokens.slice(p) };
}

export function parseEquation(text, line = 0) {
  const tokens = tokenize(text, line);
  const eqIdx = tokens.findIndex(t => t.k === '=');
  if (eqIdx < 0) throw new ParseError('Equation needs "="', line);
  const L = parseExpr(tokens.slice(0, eqIdx), line);
  if (L.rest.length) throw new ParseError('Unexpected "' + (L.rest[0].v ?? L.rest[0].k) + '" on left side', line);
  const R = parseExpr(tokens.slice(eqIdx + 1), line);
  if (R.rest.length) throw new ParseError('Unexpected "' + (R.rest[0].v ?? R.rest[0].k) + '" (a second "=" or missing operator?)', line);
  return { lhs: L.e, rhs: R.e };
}

export function varsOf(ast, set = new Set()) {
  if (!ast) return set;
  switch (ast.t) {
    case 'var': set.add(ast.name); break;
    case 'bin': varsOf(ast.a, set); varsOf(ast.b, set); break;
    case 'neg': case 'par': varsOf(ast.a, set); break;
    case 'call': ast.args.forEach(a => varsOf(a, set)); break;
    case 'prop': Object.values(ast.named).forEach(a => varsOf(a, set)); break;
  }
  return set;
}
