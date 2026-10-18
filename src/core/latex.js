// AST → LaTeX, with optional substitution of values (in display units).
import { unitLabel } from './units.js';
const GREEK = { alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', Delta: '\\Delta', epsilon: '\\varepsilon', eps: '\\varepsilon', eta: '\\eta', theta: '\\theta', lambda: '\\lambda', mu: '\\mu', nu: '\\nu', rho: '\\rho', sigma: '\\sigma', tau: '\\tau', phi: '\\phi', omega: '\\omega', psi: '\\psi', xi: '\\xi', zeta: '\\zeta', kappa: '\\kappa', pi: '\\pi', DELTA: '\\Delta' };
export function varLatex(name) {
  let base = name, sub = '';
  const arr = name.match(/^(.*)\[([^\]]+)\]$/);
  if (arr) { base = arr[1]; sub = arr[2]; }
  const dm = base.match(/^([A-Za-z]{1,3}?)(\d+)$/); if (dm && !base.includes('_')) base = dm[1] + '_' + dm[2];
  const parts = base.split('_');
  let b = parts[0];
  let rest = parts.slice(1).join(',');
  if (/^dot$/.test(rest)) rest = '';
  if (GREEK[b]) b = GREEK[b]; else if (b.length > 1 && !/^[A-Z][a-z]?$/.test(b)) b = '\\mathrm{' + b.replace(/#/g, '') + '}';
  if (parts.includes('dot')) { b = '\\dot{' + b + '}'; rest = parts.slice(1).filter(p => p !== 'dot').join(','); }
  const s = [rest, sub].filter(Boolean).map(x => GREEK[x] || x.replace(/_/g, ',')).join(',');
  return s ? `${b}_{${s.length > 1 ? '\\mathrm{' + s + '}' : s}}` : b;
}
export function fmtNum(v, sig = 5) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) { const [m, e] = v.toExponential(sig - 1).split('e'); return `${(+m).toString()}\\times10^{${+e}}`; }
  let s = v.toPrecision(sig);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
export function fmtPlain(v, sig = 5) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-4) return v.toExponential(sig - 1);
  let s = v.toPrecision(sig);
  if (s.includes('.') && !s.includes('e')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
export function unitLatex(u) {
  if (!u || u === '-') return '';
  const l = unitLabel(u).replace(/°C/, '{}^{\\circ}\\mathrm{C}').replace(/°F/, '{}^{\\circ}\\mathrm{F}');
  if (l.includes('circ')) return '\\,' + l;
  return '\\,\\mathrm{' + l.replace(/-/g, '\\cdot ').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\^(-?\d+)/g, '^{$1}') + '}';
}
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
export function toLatex(ast, sub) {
  // sub: (name) => latex string for substituted value, or null
  const L = (n, parentPrec = 0) => {
    switch (n.t) {
      case 'num': return fmtNum(n.v, 6) + (n.unit ? unitLatex(n.unit) : '');
      case 'const': return n.name === 'pi' || n.name === 'pi#' ? '\\pi' : varLatex(n.name.replace('#', ''));
      case 'var': return sub ? (sub(n.name) ?? varLatex(n.name)) : varLatex(n.name);
      case 'par': return '\\left(' + L(n.a) + '\\right)';
      case 'neg': return '-' + L(n.a, 3);
      case 'bin': {
        const p = PREC[n.op];
        let s;
        if (n.op === '/') return '\\dfrac{' + L(n.a.t === 'par' ? n.a.a : n.a) + '}{' + L(n.b.t === 'par' ? n.b.a : n.b) + '}';
        if (n.op === '^') s = '{' + L(n.a, 4) + '}^{' + L(n.b.t === 'par' ? n.b.a : n.b) + '}';
        else if (n.op === '*') s = L(n.a, p) + (sub ? ' \\times ' : ' \\cdot ') + L(n.b, p + 0.5);
        else s = L(n.a, p) + ' ' + n.op + ' ' + L(n.b, p + 0.5);
        return p < parentPrec ? '\\left(' + s + '\\right)' : s;
      }
      case 'call': {
        if (n.fn === 'sqrt') return '\\sqrt{' + L(n.args[0]) + '}';
        if (n.fn === 'exp') return 'e^{' + L(n.args[0]) + '}';
        if (n.fn === 'abs') return '\\left|' + L(n.args[0]) + '\\right|';
        const nm = { ln: '\\ln', log10: '\\log_{10}', sin: '\\sin', cos: '\\cos', tan: '\\tan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh' }[n.fn] || '\\operatorname{' + n.fn + '}';
        return nm + '\\left(' + n.args.map(a => L(a)).join(', ') + '\\right)';
      }
      case 'prop': {
        const args = Object.entries(n.named).map(([k, a]) => k + '=' + L(a)).join(',\\ ');
        return '\\operatorname{' + n.out.replace('sat', '_{sat}') + '}\\!\\left(\\text{' + n.fluid + '};\\ ' + args + '\\right)';
      }
    }
    return '?';
  };
  return L(ast);
}
export function eqLatex(eq, sub) { return toLatex(eq.lhs, sub) + ' = ' + toLatex(eq.rhs, sub); }
