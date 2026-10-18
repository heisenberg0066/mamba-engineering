// EES-style simultaneous equation solver with units checking, structural analysis (DOF, matching, blocks) and trace recording.
import { splitEquations, parseEquation, varsOf, ParseError, PROP_FUNCS, CONST_UNITS } from './parser.js';
import { parseUnit, dimEq, dimMul, dimPow, dimIsZero, DIMLESS, defaultUnitFor, fromSI, dimToString } from './units.js';
import { prop, phaseName, fluidInfo, PropError } from './props.js';

const PDIM = {
  h: [2, 0, -2, 0, 0, 0], u: [2, 0, -2, 0, 0, 0], s: [2, 0, -2, -1, 0, 0], cp: [2, 0, -2, -1, 0, 0], cv: [2, 0, -2, -1, 0, 0],
  T: [0, 0, 0, 1, 0, 0], Tsat: [0, 0, 0, 1, 0, 0], Tcrit: [0, 0, 0, 1, 0, 0], P: [-1, 1, -2, 0, 0, 0], Psat: [-1, 1, -2, 0, 0, 0], Pcrit: [-1, 1, -2, 0, 0, 0],
  v: [3, -1, 0, 0, 0, 0], rho: [-3, 1, 0, 0, 0, 0], x: DIMLESS, Pr: DIMLESS, mu: [-1, 1, -1, 0, 0, 0], k: [1, 1, -3, -1, 0, 0], a: [1, 0, -1, 0, 0, 0], M: [0, 1, 0, 0, -1, 0],
};
export const ARGKEY = { t: 'T', p: 'P', h: 'h', s: 's', x: 'x', q: 'x', v: 'v', u: 'u', rho: 'rho', d: 'rho' };

export class SolveError extends Error {}

// ---------- evaluation ----------
export function evaluate(ast, env, hooks) {
  switch (ast.t) {
    case 'num': return ast.si;
    case 'const': return ast.v;
    case 'par': return evaluate(ast.a, env, hooks);
    case 'neg': return -evaluate(ast.a, env, hooks);
    case 'var': { const v = env[ast.name]; if (v === undefined || Number.isNaN(v)) throw new SolveError('Variable ' + ast.name + ' has no value'); return v; }
    case 'bin': {
      const a = evaluate(ast.a, env, hooks), b = evaluate(ast.b, env, hooks);
      switch (ast.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '^': return Math.pow(a, b); }
    }
    case 'call': {
      const x = ast.args.map(a => evaluate(a, env, hooks));
      const d = Math.PI / 180;
      switch (ast.fn) {
        case 'sin': return Math.sin(x[0]); case 'cos': return Math.cos(x[0]); case 'tan': return Math.tan(x[0]);
        case 'sind': return Math.sin(x[0] * d); case 'cosd': return Math.cos(x[0] * d); case 'tand': return Math.tan(x[0] * d);
        case 'arcsind': return Math.asin(x[0]) / d; case 'arccosd': return Math.acos(x[0]) / d; case 'arctand': return Math.atan(x[0]) / d;
        case 'asin': return Math.asin(x[0]); case 'acos': return Math.acos(x[0]); case 'atan': return Math.atan(x[0]); case 'atan2': return Math.atan2(x[0], x[1]);
        case 'sinh': return Math.sinh(x[0]); case 'cosh': return Math.cosh(x[0]); case 'tanh': return Math.tanh(x[0]);
        case 'exp': return Math.exp(x[0]); case 'ln': return Math.log(x[0]); case 'log10': return Math.log10(x[0]);
        case 'sqrt': return Math.sqrt(x[0]); case 'abs': return Math.abs(x[0]); case 'min': return Math.min(x[0], x[1]); case 'max': return Math.max(x[0], x[1]);
      }
      throw new SolveError('Unknown function ' + ast.fn);
    }
    case 'prop': {
      const args = {};
      for (const [k, a] of Object.entries(ast.named)) {
        const key = ARGKEY[k.toLowerCase()];
        if (!key) throw new PropError(`Unknown property argument "${k}" in ${ast.name}()`);
        args[key] = evaluate(a, env, hooks);
      }
      let r;
      if (ast.out === 'Tsat') r = prop('T', ast.fluid, { P: args.P, x: 0 });
      else if (ast.out === 'Psat') r = prop('P', ast.fluid, { T: args.T, x: 0 });
      else r = prop(ast.out, ast.fluid, args);
      if (ast.out === 'x' && !(r >= 0 && r <= 1)) {
        // outside the dome: EES returns 100 for superheated, -100 for subcooled; we return 1 / 0 bounded? keep EES convention
        const ph = phaseName(ast.fluid, args);
        r = ph.includes('liquid') ? -100 : 100;
      }
      if (hooks && hooks.onProp) hooks.onProp(ast, args, r);
      return r;
    }
  }
  throw new SolveError('Bad expression node ' + ast.t);
}

// ---------- dimensions ----------
// returns dim array, 'any' (plain number) or null (unknown)
function dimOf(ast, vd) {
  switch (ast.t) {
    case 'num': return ast.unit ? parseUnit(ast.unit).d : 'any';
    case 'const': return CONST_UNITS[ast.name] ? parseUnit(CONST_UNITS[ast.name]).d : 'any';
    case 'par': return dimOf(ast.a, vd);
    case 'neg': return dimOf(ast.a, vd);
    case 'var': return vd[ast.name] || null;
    case 'prop': return PDIM[ast.out] || null;
    case 'call': {
      if (['sqrt'].includes(ast.fn)) { const d = dimOf(ast.args[0], vd); return d === 'any' ? 'any' : d ? dimPow(d, 0.5) : null; }
      if (['abs', 'min', 'max'].includes(ast.fn)) { const d = dimOf(ast.args[0], vd); return d; }
      return DIMLESS;
    }
    case 'bin': {
      const a = dimOf(ast.a, vd), b = dimOf(ast.b, vd);
      if (ast.op === '+' || ast.op === '-') { if (a && a !== 'any') return a; if (b && b !== 'any') return b; if (a === 'any' && b === 'any') return 'any'; return null; }
      if (ast.op === '^') {
        if (a === 'any') return 'any';
        if (!a) return null;
        if (ast.b.t === 'num' && !ast.b.unit) return dimPow(a, ast.b.v);
        if (ast.b.t === 'neg' && ast.b.a.t === 'num') return dimPow(a, -ast.b.a.v);
        if (ast.b.t === 'par' && ast.b.a.t === 'bin' && ast.b.a.a.t === 'num' && ast.b.a.b.t === 'num' && ast.b.a.op === '/') return dimPow(a, ast.b.a.a.v / ast.b.a.b.v);
        return dimIsZero(a) ? DIMLESS : null;
      }
      const aa = a === 'any' ? DIMLESS : a, bb = b === 'any' ? DIMLESS : b;
      if (a === 'any' && b === 'any') return 'any';
      if (!aa || !bb) return null;
      return dimMul(aa, bb, ast.op === '*' ? 1 : -1);
    }
  }
  return null;
}
function inferInto(ast, expected, vd) {
  if (!expected || expected === 'any') return false;
  switch (ast.t) {
    case 'var': if (!vd[ast.name]) { vd[ast.name] = expected.slice(); return true; } return false;
    case 'par': case 'neg': return inferInto(ast.a, expected, vd);
    case 'bin': {
      if (ast.op === '+' || ast.op === '-') return inferInto(ast.a, expected, vd) | inferInto(ast.b, expected, vd);
      if (ast.op === '*' || ast.op === '/') {
        const a = dimOf(ast.a, vd), b = dimOf(ast.b, vd);
        if (a && !b) return inferInto(ast.b, ast.op === '*' ? dimMul(expected, a === 'any' ? DIMLESS : a, -1) : dimMul(a === 'any' ? DIMLESS : a, expected, -1), vd);
        if (b && !a) return inferInto(ast.a, ast.op === '*' ? dimMul(expected, b === 'any' ? DIMLESS : b, -1) : dimMul(expected, b === 'any' ? DIMLESS : b, 1), vd);
      }
      return false;
    }
  }
  return false;
}
function inferPropArgs(ast, vd) {
  // property-call arguments have known dimensions
  let ch = false;
  const walk = (n) => {
    if (!n) return;
    if (n.t === 'prop') for (const [k, a] of Object.entries(n.named)) { const key = ARGKEY[k.toLowerCase()]; if (key && PDIM[key]) ch = inferInto(a, PDIM[key], vd) || ch; walk(a); }
    else if (n.t === 'bin') { walk(n.a); walk(n.b); } else if (n.t === 'neg' || n.t === 'par') walk(n.a); else if (n.t === 'call') n.args.forEach(walk);
  };
  walk(ast); return ch;
}
function checkDims(ast, vd, issues) {
  // walk, return dim; push issues for inconsistent sums / function args
  const d = dimOf(ast, vd);
  const walk = (n) => {
    if (!n) return;
    if (n.t === 'bin') {
      walk(n.a); walk(n.b);
      if (n.op === '+' || n.op === '-') {
        const a = dimOf(n.a, vd), b = dimOf(n.b, vd);
        if (a && b && a !== 'any' && b !== 'any' && !dimEq(a, b)) issues.push(`terms of "${n.op}" have different units: [${dimToString(a)}] vs [${dimToString(b)}]`);
      }
      if (n.op === '^') { const b = dimOf(n.b, vd); if (b && b !== 'any' && !dimIsZero(b)) issues.push('exponent must be dimensionless'); }
    } else if (n.t === 'neg' || n.t === 'par') walk(n.a);
    else if (n.t === 'call') {
      n.args.forEach(walk);
      if (!['sqrt', 'abs', 'min', 'max'].includes(n.fn)) { const a = dimOf(n.args[0], vd); if (a && a !== 'any' && !dimIsZero(a)) issues.push(`argument of ${n.fn}() should be dimensionless, got [${dimToString(a)}]`); }
    } else if (n.t === 'prop') {
      for (const [k, a] of Object.entries(n.named)) {
        walk(a);
        const key = ARGKEY[k.toLowerCase()]; const da = dimOf(a, vd);
        if (key && PDIM[key] && da && da !== 'any' && !dimEq(da, PDIM[key])) issues.push(`${n.name}(): ${k}= has units [${dimToString(da)}], expected [${dimToString(PDIM[key])}]`);
      }
    }
  };
  walk(ast);
  return d;
}

// ---------- structural analysis ----------
function maxMatching(eqVars, nVars) {
  // eqVars: array of arrays of var indices; Kuhn's algorithm
  const matchVar = new Array(nVars).fill(-1), matchEq = new Array(eqVars.length).fill(-1);
  function tryEq(e, seen) {
    for (const v of eqVars[e]) {
      if (seen[v]) continue; seen[v] = 1;
      if (matchVar[v] < 0 || tryEq(matchVar[v], seen)) { matchVar[v] = e; matchEq[e] = v; return true; }
    }
    return false;
  }
  // heuristic order: equations with fewer vars first
  const order = eqVars.map((v, i) => i).sort((a, b) => eqVars[a].length - eqVars[b].length);
  for (const e of order) tryEq(e, new Uint8Array(nVars));
  return { matchVar, matchEq };
}
function tarjan(n, adj) {
  let index = 0; const idx = new Array(n).fill(-1), low = new Array(n), on = new Uint8Array(n), st = [], comps = [];
  function sc(v) {
    // iterative to avoid deep recursion
    const stack = [[v, 0]]; idx[v] = low[v] = index++; st.push(v); on[v] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1]; const [u, i] = top;
      if (i < adj[u].length) {
        top[1]++; const w = adj[u][i];
        if (idx[w] < 0) { idx[w] = low[w] = index++; st.push(w); on[w] = 1; stack.push([w, 0]); }
        else if (on[w]) low[u] = Math.min(low[u], idx[w]);
      } else {
        stack.pop();
        if (stack.length) { const p = stack[stack.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
        if (low[u] === idx[u]) { const c = []; let w; do { w = st.pop(); on[w] = 0; c.push(w); } while (w !== u); comps.push(c); }
      }
    }
  }
  for (let v = 0; v < n; v++) if (idx[v] < 0) sc(v);
  return comps; // reverse topological order of the condensation → dependencies first
}

function linsolve(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new SolveError('Singular Jacobian');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

function defaultGuess(dim) {
  if (!dim || dim === 'any') return 1;
  if (dimEq(dim, PDIM.T)) return 300;
  if (dimEq(dim, PDIM.P)) return 1e5;
  if (dimEq(dim, PDIM.h)) return 1e5;
  if (dimEq(dim, PDIM.s)) return 1000;
  return 1;
}

// ---------- model ----------
export function compile(source, options = {}) {
  const raw = splitEquations(source);
  const eqs = [], errors = [];
  raw.forEach((r) => {
    try { const pe = parseEquation(r.text, r.line); eqs.push({ ...r, ...pe, vars: [...new Set([...varsOf(pe.lhs), ...varsOf(pe.rhs)])] }); }
    catch (e) { errors.push({ line: r.line, msg: e.message, text: r.text }); }
  });
  // validate fluids
  const walkProps = (n, f) => { if (!n) return; if (n.t === 'prop') { f(n); Object.values(n.named).forEach(a => walkProps(a, f)); } else if (n.t === 'bin') { walkProps(n.a, f); walkProps(n.b, f); } else if (n.t === 'neg' || n.t === 'par') walkProps(n.a, f); else if (n.t === 'call') n.args.forEach(a => walkProps(a, f)); };
  for (const e of eqs) for (const side of [e.lhs, e.rhs]) walkProps(side, (n) => { try { fluidInfo(n.fluid); } catch (er) { errors.push({ line: e.line, msg: er.message, text: e.text }); } });
  const varNames = [...new Set(eqs.flatMap(e => e.vars))];
  // unit inference
  const vd = {};
  const displayUnit = {};
  for (const [name, info] of Object.entries(options.varInfo || {})) if (info.unit) { try { vd[name] = parseUnit(info.unit).d; displayUnit[name] = info.unit; } catch {} }
  for (const e of eqs) { // literal assignment var = number [unit]
    const lit = (a, b) => { if (a.t === 'var' && (b.t === 'num' && b.unit || (b.t === 'neg' && b.a.t === 'num' && b.a.unit))) { const u = b.t === 'num' ? b.unit : b.a.unit; if (!displayUnit[a.name]) displayUnit[a.name] = u; if (!vd[a.name]) vd[a.name] = parseUnit(u).d; } };
    lit(e.lhs, e.rhs); lit(e.rhs, e.lhs);
  }
  for (let pass = 0; pass < 8; pass++) {
    let ch = false;
    for (const e of eqs) {
      ch = inferPropArgs(e.lhs, vd) || ch; ch = inferPropArgs(e.rhs, vd) || ch;
      const a = dimOf(e.lhs, vd), b = dimOf(e.rhs, vd);
      if (a && a !== 'any') ch = inferInto(e.rhs, a, vd) || ch;
      if (b && b !== 'any') ch = inferInto(e.lhs, b, vd) || ch;
    }
    if (!ch) break;
  }
  const unitIssues = [];
  for (const e of eqs) {
    const iss = [];
    const a = checkDims(e.lhs, vd, iss), b = checkDims(e.rhs, vd, iss);
    if (a && b && a !== 'any' && b !== 'any' && !dimEq(a, b)) iss.push(`left side [${dimToString(a)}] ≠ right side [${dimToString(b)}]`);
    e.unitIssues = iss;
    if (iss.length) unitIssues.push({ line: e.line, text: e.text, issues: iss });
  }
  return { eqs, errors, varNames, vd, displayUnit, unitIssues };
}

export function analyse(model) {
  const { eqs, varNames } = model;
  const vi = new Map(varNames.map((v, i) => [v, i]));
  const eqVars = eqs.map(e => e.vars.map(v => vi.get(v)));
  const { matchVar, matchEq } = maxMatching(eqVars, varNames.length);
  const unmatchedEqs = matchEq.map((v, i) => v < 0 ? i : -1).filter(i => i >= 0);
  const unmatchedVars = matchVar.map((e, i) => e < 0 ? varNames[i] : null).filter(Boolean);
  return { nEq: eqs.length, nVar: varNames.length, matchVar, matchEq, unmatchedEqs, unmatchedVars, eqVars, vi };
}

export function solve(source, options = {}) {
  const t0 = Date.now();
  const model = compile(source, options);
  const res = { model, ok: false, values: {}, blocks: [], messages: [], counts: null, trace: [], ms: 0 };
  if (model.errors.length) { res.messages = model.errors.map(e => ({ type: 'error', line: e.line, msg: e.msg })); return res; }
  const an = analyse(model); res.counts = { equations: an.nEq, variables: an.nVar };
  if (an.nEq === 0) { res.messages.push({ type: 'info', msg: 'No equations yet.' }); return res; }
  if (an.nEq !== an.nVar || an.unmatchedEqs.length || an.unmatchedVars.length) {
    if (an.nEq < an.nVar) res.messages.push({ type: 'error', msg: `Under-specified: ${an.nVar} variables but only ${an.nEq} equations. Add ${an.nVar - an.nEq} more equation(s). Undetermined: ${an.unmatchedVars.slice(0, 12).join(', ')}` });
    else if (an.nEq > an.nVar) res.messages.push({ type: 'error', msg: `Over-specified: ${an.nEq} equations but only ${an.nVar} variables. Remove ${an.nEq - an.nVar} equation(s). Redundant candidates: lines ${an.unmatchedEqs.map(i => model.eqs[i].line).join(', ')}` });
    else res.messages.push({ type: 'error', msg: `Structurally singular: some equations over-determine a subset (lines ${an.unmatchedEqs.map(i => model.eqs[i].line).join(', ')}) while variables ${an.unmatchedVars.join(', ')} are not determined.` });
    return res;
  }
  // dependency graph between equations
  const n = an.nEq; const adj = Array.from({ length: n }, () => []);
  for (let e = 0; e < n; e++) for (const v of an.eqVars[e]) { const e2 = an.matchVar[v]; if (e2 !== e) adj[e].push(e2); }
  const comps = tarjan(n, adj);
  const env = {};
  for (const [k, c] of Object.entries(options.fixed || {})) env[k] = c;
  const info = options.varInfo || {};
  const tolerance = options.tolerance ?? 1e-9, maxIter = options.maxIter ?? 200;
  for (const comp of comps) {
    const blockEqs = comp.map(e => model.eqs[e]);
    const bVars = comp.map(e => model.varNames[an.matchEq[e]]);
    const blk = { eqs: comp, vars: bVars, method: '', iterations: 0 };
    try {
      if (comp.length === 1) {
        const e = blockEqs[0], v = bVars[0];
        const explicit = (lhs, rhs) => lhs.t === 'var' && lhs.name === v && !varsOf(rhs).has(v);
        if (explicit(e.lhs, e.rhs)) { env[v] = evaluate(e.rhs, env); blk.method = 'explicit'; }
        else if (explicit(e.rhs, e.lhs)) { env[v] = evaluate(e.lhs, env); blk.method = 'explicit'; }
        else { blk.method = 'newton1'; blk.iterations = newton([e], [v], env, model, info, tolerance, maxIter); }
      } else { blk.method = 'newton'; blk.iterations = newton(blockEqs, bVars, env, model, info, tolerance, maxIter); }
      for (const v of bVars) if (!Number.isFinite(env[v])) throw new SolveError(`${v} evaluated to ${env[v]}`);
    } catch (err) {
      blk.error = err.message;
      res.blocks.push(blk);
      res.messages.push({ type: 'error', line: blockEqs[0].line, msg: `Could not solve ${bVars.join(', ')} (line ${blockEqs.map(e => e.line).join(', ')}): ${err.message}` });
      res.values = env; res.ms = Date.now() - t0; return res;
    }
    res.blocks.push(blk);
  }
  res.values = env; res.ok = true;
  // residual check
  for (const e of model.eqs) {
    const l = evaluate(e.lhs, env), r = evaluate(e.rhs, env);
    const rel = Math.abs(l - r) / Math.max(1e-12, Math.abs(l) + Math.abs(r));
    if (rel > 1e-6 && Math.abs(l - r) > 1e-9) res.messages.push({ type: 'warn', line: e.line, msg: `Residual not small on line ${e.line}: ${(l - r).toExponential(3)}` });
  }
  for (const u of model.unitIssues) res.messages.push({ type: 'unit', line: u.line, msg: `Units (line ${u.line}): ${u.issues.join('; ')}` });
  res.ms = Date.now() - t0;
  return res;
}

function newton(eqs, vars, env, model, info, tol, maxIter) {
  const x = vars.map(v => info[v]?.guessSI ?? (env[v] !== undefined && Number.isFinite(env[v]) ? env[v] : defaultGuess(model.vd[v])));
  const lo = vars.map(v => info[v]?.lowerSI ?? (dimEq(model.vd[v] || DIMLESS, PDIM.T) && model.vd[v] ? 1 : dimEq(model.vd[v] || DIMLESS, PDIM.P) && model.vd[v] ? 1 : -Infinity));
  const hi = vars.map(v => info[v]?.upperSI ?? Infinity);
  const F = (xx) => { vars.forEach((v, i) => env[v] = xx[i]); return eqs.map(e => evaluate(e.lhs, env) - evaluate(e.rhs, env)); };
  const scale = (xx) => eqs.map(e => { try { return Math.max(1e-12, Math.abs(evaluate(e.lhs, env)) + Math.abs(evaluate(e.rhs, env))); } catch { return 1; } });
  const norm = (f, sc) => Math.sqrt(f.reduce((s, v, i) => s + (v / sc[i]) ** 2, 0));
  let f; try { f = F(x); } catch (e) { throw new SolveError('cannot evaluate at the guess values (' + e.message + '). Set better guesses in the Variables table.'); }
  let sc = scale(x);
  let it = 0;
  for (; it < maxIter; it++) {
    const nrm = norm(f, sc);
    if (nrm < tol) break;
    const J = [];
    for (let i = 0; i < eqs.length; i++) J.push(new Array(vars.length));
    for (let j = 0; j < vars.length; j++) {
      const h = 1e-7 * Math.max(Math.abs(x[j]), 1e-3);
      const xp = x.slice(); xp[j] += h;
      let fp; try { fp = F(xp); } catch { xp[j] = x[j] - h; fp = F(xp).map(v => v); for (let i = 0; i < eqs.length; i++) J[i][j] = (f[i] - fp[i]) / h; continue; }
      for (let i = 0; i < eqs.length; i++) J[i][j] = (fp[i] - f[i]) / h;
    }
    F(x);
    let dx; try { dx = linsolve(J, f.map(v => -v)); } catch { dx = x.map((xi, j) => -Math.sign(f[0] || 1) * 0.01 * Math.max(1, Math.abs(xi))); }
    let lam = 1, ok = false;
    for (let k = 0; k < 30; k++) {
      const xn = x.map((xi, j) => Math.min(hi[j], Math.max(lo[j], xi + lam * dx[j])));
      try { const fn = F(xn); if (fn.every(Number.isFinite) && (norm(fn, sc) < nrm || k > 25)) { x.splice(0, x.length, ...xn); f = fn; ok = true; break; } } catch {}
      lam /= 2;
    }
    if (!ok) throw new SolveError('Newton step failed (no decrease); try other guess values or bounds');
    sc = scale(x);
  }
  F(x);
  if (norm(f, scale(x)) > Math.max(tol * 1e3, 1e-6)) throw new SolveError(`did not converge in ${maxIter} iterations`);
  return it;
}

// ---------- display helpers ----------
export function displayUnitOf(name, model, system = 'SI') {
  if (model.displayUnit[name]) return model.displayUnit[name];
  return defaultUnitFor(model.vd[name], system);
}
export function displayValue(name, valueSI, model, system = 'SI') {
  const u = displayUnitOf(name, model, system);
  if (!u || u === '-' || u.includes('?')) return { v: valueSI, u: '' };
  try { return { v: fromSI(valueSI, u), u }; } catch { return { v: valueSI, u: dimToString(model.vd[name]) }; }
}
