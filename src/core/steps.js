// Step-by-step solution builder for solved equation models.
import { evaluate, displayValue, displayUnitOf, ARGKEY } from './solver.js';
import { varsOf } from './parser.js';
import { eqLatex, toLatex, varLatex, fmtNum, unitLatex } from './latex.js';
import { fromSI, defaultUnitFor } from './units.js';
import { phaseName, fluidInfo } from './props.js';
import { textbookLookup } from './tables.js';

const ARG_KIND = { T: [0, 0, 0, 1, 0, 0], P: [-1, 1, -2, 0, 0, 0], h: [2, 0, -2, 0, 0, 0], u: [2, 0, -2, 0, 0, 0], s: [2, 0, -2, -1, 0, 0], v: [3, -1, 0, 0, 0, 0], rho: [-3, 1, 0, 0, 0, 0], x: null };
export function siToDisplay(kind, v, system = 'SI') {
  const d = ARG_KIND[kind]; if (!d) return { v, u: '' };
  const u = defaultUnitFor(d, system); return { v: fromSI(v, u), u };
}
export function qtyLatex(v, u) { return fmtNum(v, 5) + unitLatex(u); }

export function buildSteps(res, opts = {}) {
  const system = opts.system || 'SI'; const edu = !!opts.education;
  const { model } = res; const env = res.values;
  const sub = (name) => { if (env[name] === undefined) return null; const d = displayValue(name, env[name], model, system); return '{' + fmtNum(d.v, 5) + unitLatex(d.u) + '}'; };
  const steps = [];
  const given = [];
  for (const blk of res.blocks) {
    const eqs = blk.eqs.map(i => model.eqs[i]);
    if (blk.method === 'explicit') {
      const e = eqs[0]; const v = blk.vars[0];
      const rhs = (e.lhs.t === 'var' && e.lhs.name === v) ? e.rhs : e.lhs;
      const d = displayValue(v, env[v], model, system);
      const resultL = varLatex(v) + ' = ' + qtyLatex(d.v, d.u);
      if (varsOf(rhs).size === 0 && !hasProp(rhs)) { given.push({ name: v, latex: resultL, line: e.line }); continue; }
      const props = [];
      evaluate(rhs, env, { onProp: (ast, args, r) => props.push(propStep(ast, args, r, system, edu)) });
      const step = { kind: 'eq', line: e.line, var: v, symbolic: varLatex(v) + ' = ' + toLatex(rhs), props, result: resultL };
      if (!(rhs.t === 'prop')) step.substituted = varLatex(v) + ' = ' + toLatex(rhs, (n) => sub(n));
      steps.push(step);
    } else {
      const props = [];
      for (const e of eqs) { try { evaluate(e.lhs, env, { onProp: (a, args, r) => props.push(propStep(a, args, r, system, edu)) }); evaluate(e.rhs, env, { onProp: (a, args, r) => props.push(propStep(a, args, r, system, edu)) }); } catch {} }
      steps.push({
        kind: 'block', lines: eqs.map(e => e.line), iterations: blk.iterations, method: blk.method,
        symbolic: eqs.map(e => eqLatex(e)), props,
        results: blk.vars.map(v => { const d = displayValue(v, env[v], model, system); return varLatex(v) + ' = ' + qtyLatex(d.v, d.u); }),
      });
    }
  }
  return { given, steps };
}
function hasProp(n) { if (!n) return false; if (n.t === 'prop') return true; if (n.t === 'bin') return hasProp(n.a) || hasProp(n.b); if (n.t === 'neg' || n.t === 'par') return hasProp(n.a); if (n.t === 'call') return n.args.some(hasProp); return false; }

export function propStep(ast, args, r, system = 'SI', edu = false) {
  const f = (() => { try { return fluidInfo(ast.fluid); } catch { return null; } })();
  const argText = Object.entries(args).map(([k, v]) => { const d = siToDisplay(k, v, system); return (k === 'x' ? 'x' : k) + ' = ' + qtyLatex(d.v, d.u); }).join(',\\ ');
  const outKey = ast.out === 'Tsat' ? 'T' : ast.out === 'Psat' ? 'P' : ast.out;
  const od = siToDisplay(outKey, r, system);
  let phase = '';
  try { if (args.x === 0) phase = 'saturated liquid'; else if (args.x === 1) phase = 'saturated vapor'; else if (Object.keys(args).length === 2) phase = phaseName(ast.fluid, args); else if (ast.out === 'Tsat' || ast.out === 'Psat') phase = 'saturation'; } catch {}
  const st = { fluid: f ? f.label : ast.fluid, fluidId: f ? f.id : ast.fluid, out: outKey, argsLatex: argText, phase, valueLatex: (outKey === 'rho' ? '\\rho' : outKey) + ' = ' + qtyLatex(od.v, od.u), args, value: r };
  if (edu && f && !f.ideal && ['h', 's', 'v', 'u', 'x', 'T'].includes(outKey) && Object.keys(args).length === 2) {
    const tb = textbookLookup(f.id, outKey, args);
    if (tb) st.textbook = renderLookup(tb, outKey, system);
  }
  return st;
}
function renderLookup(tb, out, system) {
  const D = (k, v) => { const d = siToDisplay(k, v, system); return qtyLatex(d.v, d.u); };
  const Dn = (k, v) => fmtNum(siToDisplay(k, v, system).v, 6);
  const lines = [];
  for (const s of tb.steps) {
    if (s.type === 'satRow') lines.push({ text: `Read directly from the saturated table at ${s.by} = `, latex: D(s.by, s.row[s.by]) });
    if (s.type === 'satInterp') {
      const k = s.keys;
      lines.push({ text: `${s.by} is between two table rows; interpolate linearly:`, latex: `${s.by}_1 = ${D(s.by, s.r1[s.by])},\\ ${s.by}_2 = ${D(s.by, s.r2[s.by])}` });
      for (const key of k) {
        const base = key.replace(/fg$|f$|g$/, ''); const sfx = key.slice(base.length);
        lines.push({ latex: `${base}_{${sfx}} = ${Dn(base, s.r1[key])} + \\dfrac{${Dn(s.by, s.val)} - ${Dn(s.by, s.r1[s.by])}}{${Dn(s.by, s.r2[s.by])} - ${Dn(s.by, s.r1[s.by])}}\\left(${Dn(base, s.r2[key])} - ${Dn(base, s.r1[key])}\\right) = ${D(base, s.row[key])}` });
      }
    }
    if (s.type === 'quality') lines.push({ text: 'Inside the dome, so the state is a saturated mixture:', latex: `x = \\dfrac{${s.inKey} - ${s.inKey}_f}{${s.inKey}_{fg}} = \\dfrac{${Dn(s.inKey, s.given)} - ${Dn(s.inKey, s.f)}}{${Dn(s.inKey, s.fg)}} = ${fmtNum(s.x, 5)}` });
    if (s.type === 'mix') lines.push({ latex: `${s.out} = ${s.out}_f + x\\,${s.out}_{fg} = ${Dn(s.out, s.f)} + ${fmtNum(s.x, 5)}\\times${Dn(s.out, s.fg)} = ${D(s.out, s.value)}` });
    if (s.type === 'interp' && [s.r1, s.r2].some(r => Math.abs(r[s.inKey] - s.given) <= 1e-9 * Math.abs(s.given))) {
      const r = Math.abs(s.r1[s.inKey] - s.given) <= 1e-9 * Math.abs(s.given) ? s.r1 : s.r2;
      lines.push({ text: 'Read directly from the table at ', latex: `P = ${D('P', s.P)},\\ ${s.inKey} = ${D(s.inKey, r[s.inKey])}:\\quad ${out} = ${D(out, r[out])}` });
    } else if (s.type === 'interp') {
      lines.push({ text: `Table at P = `, latex: `${D('P', s.P)}:\\quad \\begin{array}{c|c} ${s.inKey} & ${out} \\\\ \\hline ${Dn(s.inKey, s.r1[s.inKey])}${s.r1.sat ? '\\ (\\text{sat})' : ''} & ${Dn(out, s.r1[out])} \\\\ ${Dn(s.inKey, s.r2[s.inKey])} & ${Dn(out, s.r2[out])} \\end{array}` });
      lines.push({ latex: `${out} = ${Dn(out, s.r1[out])} + \\dfrac{${Dn(s.inKey, s.given)} - ${Dn(s.inKey, s.r1[s.inKey])}}{${Dn(s.inKey, s.r2[s.inKey])} - ${Dn(s.inKey, s.r1[s.inKey])}}\\left(${Dn(out, s.r2[out])} - ${Dn(out, s.r1[out])}\\right) = ${D(out, s.value)}` });
    }
    if (s.type === 'interpP') lines.push({ text: 'Pressure is between two tables; interpolate between them:', latex: `${out} = ${Dn(out, s.y1)} + \\dfrac{${Dn('P', s.P)} - ${Dn('P', s.P1)}}{${Dn('P', s.P2)} - ${Dn('P', s.P1)}}\\left(${Dn(out, s.y2)} - ${Dn(out, s.y1)}\\right) = ${D(out, s.value)}` });
  }
  const diff = tb.exact ? (tb.value - tb.exact) / Math.abs(tb.exact) * 100 : 0;
  return { table: tb.table, lines, value: D(out, tb.value), exact: D(out, tb.exact), diffPct: diff };
}
