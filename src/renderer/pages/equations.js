// EES-style equation editor: syntax highlight, live equation/unknown count, units check, solve, steps, auto property diagram.
import { h, tabs, debounce, toast, fmt } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { compile, analyse, solve, displayValue, displayUnitOf, evaluate } from '../../core/solver.js';
import { buildSteps } from '../../core/steps.js';
import { eqStepsView } from '../ui.js';
import { PROP_FUNCS, MATH_FUNCS } from '../../core/parser.js';
import { parseUnit, toSI, fromSI, dimEq } from '../../core/units.js';
import { state as fullState, prop, FLUIDS } from '../../core/props.js';
import { propertyDiagram, drawCycle } from '../diagrams.js';
import { tableHTML, figHTML } from '../report.js';

export const EXAMPLES = {
  'Ideal Rankine cycle (Çengel & Boles)': `"Simple ideal Rankine cycle — Çengel & Boles example: 3 MPa, 350 °C, condenser 75 kPa"
"State 1: saturated liquid leaving the condenser"
P[1] = 75 [kPa]
x[1] = 0
h[1] = enthalpy(Water, P=P[1], x=x[1])
v[1] = volume(Water, P=P[1], x=x[1])
s[1] = entropy(Water, P=P[1], x=x[1])
"Pump (isentropic, incompressible)"
P[2] = 3000 [kPa]
w_pump = v[1]*(P[2] - P[1])
h[2] = h[1] + w_pump
s[2] = s[1]
"State 3: boiler exit"
P[3] = P[2]
T[3] = 350 [C]
h[3] = enthalpy(Water, P=P[3], T=T[3])
s[3] = entropy(Water, P=P[3], T=T[3])
"Turbine (isentropic)"
P[4] = P[1]
s[4] = s[3]
h[4] = enthalpy(Water, P=P[4], s=s[4])
x[4] = quality(Water, P=P[4], s=s[4])
"Performance"
q_in = h[3] - h[2]
q_out = h[4] - h[1]
w_net = q_in - q_out
eta_th = w_net/q_in
`,
  'Vapour-compression refrigerator, R-134a': `"Ideal vapour-compression refrigeration cycle with R-134a between 0.14 and 0.8 MPa"
m_dot = 0.05 [kg/s]
P[1] = 140 [kPa]; h[1] = enthalpy(R134a, P=P[1], x=1); s[1] = entropy(R134a, P=P[1], x=1)
P[2] = 800 [kPa]; s[2] = s[1]; h[2] = enthalpy(R134a, P=P[2], s=s[2])
P[3] = P[2]; h[3] = enthalpy(R134a, P=P[3], x=0)
P[4] = P[1]; h[4] = h[3] "throttling"
Q_dot_L = m_dot*(h[1] - h[4])
W_dot_in = m_dot*(h[2] - h[1])
COP_R = Q_dot_L/W_dot_in
`,
  'Steam nozzle (energy balance)': `"Adiabatic steam nozzle: inlet 3 MPa, 400 °C, 40 m/s; exit 2.5 MPa, 300 m/s. Find exit temperature."
P_1 = 3000 [kPa]; T_1 = 400 [C]; V_1 = 40 [m/s]
P_2 = 2500 [kPa]; V_2 = 300 [m/s]
h_1 = enthalpy(Water, P=P_1, T=T_1)
h_1 + V_1^2/2 = h_2 + V_2^2/2
T_2 = temperature(Water, P=P_2, h=h_2)
`,
  'Simultaneous equations (no properties)': `"Equations can be in any order; the solver finds blocks and solves them together"
x^2 + y = 11
x + y^2 = 7
z = x*y + 3 [m]/(2 [m])
`,
};

export function makeEquationsPage() {
  const page = { id: 'equations', group: 'thermo', icon: '∑', title: 'Equation editor', text: EXAMPLES['Ideal Rankine cycle (Çengel & Boles)'], varInfo: {}, res: null };
  page.serialize = () => ({ text: page.text, varInfo: page.varInfo });
  page.load = (d) => { page.text = d.text ?? page.text; page.varInfo = d.varInfo || {}; page.res = null; };
  page.reset = () => { page.text = EXAMPLES['Ideal Rankine cycle (Çengel & Boles)']; page.varInfo = {}; page.res = null; };
  page.varInfoSI = () => {
    const out = {};
    for (const [k, v] of Object.entries(page.varInfo)) {
      const o = { unit: v.unit || undefined };
      const cv = (x) => { if (x === '' || x === undefined || x === null || !Number.isFinite(+x)) return undefined; try { return v.unit ? toSI(+x, v.unit) : +x; } catch { return +x; } };
      o.guessSI = cv(v.guess); o.lowerSI = cv(v.lower); o.upperSI = cv(v.upper);
      out[k] = o;
    }
    return out;
  };
  page.solveNow = () => { page.res = solve(page.text, { varInfo: page.varInfoSI() }); return page.res; };
  page.render = (main) => {
    const gutter = h('div', { class: 'eq-gutter' });
    const pre = h('pre', {});
    const ta = h('textarea', { spellcheck: 'false', wrap: 'off' }); ta.value = page.text;
    const dof = h('span', { class: 'dof' });
    const msgs = h('div', { class: 'msgs' });
    const outVars = h('div', { class: 'scroll' }), outSteps = h('div', {}), outDiag = h('div', {}), outMsgs = h('div', {});
    const views = [outVars, outSteps, outDiag, outMsgs];
    const resTabs = tabs(['Solution', 'Step-by-step', 'Property diagram', 'Messages'], (i) => views.forEach((v, k) => v.style.display = k === i ? '' : 'none'), store.settings.mode === 'education' ? 1 : 0);
    views.forEach((v, k) => v.style.display = k === (store.settings.mode === 'education' ? 1 : 0) ? '' : 'none');
    let lineMarks = {};
    const highlight = () => {
      const src = ta.value;
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      let out = '';
      const re = /("[^"]*"?|\{[^}]*\}?|\/\/[^\n]*)|(\[[^\]\n]*\])|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([A-Za-z_][A-Za-z0-9_#]*)|([=+\-*/^(),;])|(\s+|.)/g;
      let m; const fns = new Set([...Object.keys(PROP_FUNCS), ...Object.keys(MATH_FUNCS)]); const fl = new Set(FLUIDS.flatMap(f => [f.id.toLowerCase(), ...(f.aliases || []).map(a => a.toLowerCase())]));
      while ((m = re.exec(src))) {
        if (m[1]) out += `<span class="hl-com">${esc(m[1])}</span>`; else if (m[2]) out += `<span class="hl-unit">${esc(m[2])}</span>`; else if (m[3]) out += `<span class="hl-num">${m[3]}</span>`;
        else if (m[4]) out += fns.has(m[4].toLowerCase()) ? `<span class="hl-fn">${m[4]}</span>` : esc(m[4]);
        else if (m[5]) out += fl.has(m[5].toLowerCase()) ? `<span class="hl-fl">${m[5]}</span>` : esc(m[5]);
        else if (m[6]) out += `<span class="hl-op">${esc(m[6])}</span>`; else out += esc(m[7]);
      }
      pre.innerHTML = out + '\n';
      const n = src.split('\n').length;
      gutter.innerHTML = Array.from({ length: n }, (_, i) => { const c = lineMarks[i + 1]; return c ? `<span class="${c}">${i + 1}</span>` : String(i + 1); }).join('\n');
    };
    const sync = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; };
    const liveCheck = debounce(() => {
      page.text = ta.value; lineMarks = {};
      const model = compile(page.text, { varInfo: page.varInfoSI() });
      msgs.replaceChildren();
      model.errors.forEach(e => { lineMarks[e.line] = 'err'; msgs.append(h('div', { class: 'msg error' }, `${t('Line')} ${e.line}: ${e.msg}`)); });
      model.unitIssues.forEach(u => { lineMarks[u.line] = lineMarks[u.line] || 'warn'; msgs.append(h('div', { class: 'msg unit' }, `${t('Units')} — ${t('line')} ${u.line}: ${u.issues.join('; ')}`)); });
      if (!model.errors.length) {
        const an = analyse(model);
        const ok = an.nEq === an.nVar && !an.unmatchedVars.length;
        dof.className = 'dof ' + (ok ? 'ok' : 'bad');
        dof.textContent = `${an.nEq} ${t('equations')} · ${an.nVar} ${t('variables')} ${ok ? '✔' : an.nEq < an.nVar ? '— ' + t('need') + ' ' + (an.nVar - an.nEq) + ' ' + t('more') : '— ' + (an.nEq - an.nVar) + ' ' + t('too many')}`;
      } else { dof.className = 'dof bad'; dof.textContent = t('syntax error'); }
      highlight();
    }, 250);
    ta.addEventListener('input', () => { highlight(); liveCheck(); });
    ta.addEventListener('scroll', sync);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s0 = ta.selectionStart; ta.setRangeText('    ', s0, ta.selectionEnd, 'end'); highlight(); }
      if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); doSolve(); }
    });
    const doSolve = () => {
      page.text = ta.value;
      const t0 = performance.now();
      const r = page.solveNow();
      const ms = Math.round(performance.now() - t0);
      outMsgs.replaceChildren(h('div', { class: 'msgs' }, r.messages.length ? r.messages.map(m => h('div', { class: 'msg ' + m.type }, m.msg)) : h('div', { class: 'msg info' }, t('Solved') + ` — ${r.blocks.length} ${t('blocks')}, ${ms} ms. ` + t('No warnings.'))));
      if (!r.ok) { toast(r.messages[0]?.msg || 'Not solved', 'error'); resTabs.children[3].click(); renderVars(r); return; }
      renderVars(r);
      outSteps.replaceChildren(eqStepsView(buildSteps(r, { education: store.settings.mode === 'education', system: store.settings.units })));
      renderDiagram(r);
      toast(`${t('Solved')}: ${r.counts.equations} ${t('equations')}, ${ms} ms`);
    };
    const renderVars = (r) => {
      const model = r.model; const names = [...model.varNames].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      const tb = h('table', { class: 'vars' }, h('tr', {}, ['Variable', 'Value', 'Unit', 'Guess', 'Lower', 'Upper'].map(c => h('th', {}, t(c)))));
      for (const n of names) {
        const vi = page.varInfo[n] || {};
        const val = r.values[n];
        const du = vi.unit || displayUnitOf(n, model, store.settings.units);
        let shown = val; try { if (du && du !== '-' && val !== undefined) shown = fromSI(val, du); } catch {}
        const inp = (key, w) => h('input', { type: 'text', value: vi[key] ?? '', style: { width: w || '70px' }, onchange: (e) => { page.varInfo[n] = { ...(page.varInfo[n] || {}), [key]: e.target.value }; if (!page.varInfo[n].unit && key !== 'unit') page.varInfo[n].unit = du; } });
        tb.append(h('tr', {}, h('td', {}, n), h('td', { class: 'num' }, val === undefined ? '—' : fmt(shown, 6)), h('td', {}, inp('unit', '90px')), h('td', {}, inp('guess')), h('td', {}, inp('lower')), h('td', {}, inp('upper'))));
        tb.lastChild.children[2].firstChild.placeholder = du;
      }
      outVars.replaceChildren(tb);
    };
    let diag = null;
    const renderDiagram = (r) => {
      const st = inferStates(r);
      outDiag.replaceChildren();
      if (!st) { outDiag.append(h('div', { class: 'ref-note' }, t('No fluid states found. Property calls such as enthalpy(Water, P=…, T=…) create state points automatically.'))); return; }
      const sel = h('div', { class: 'row' }); const box = h('div', {});
      let type = 'Ts';
      const draw = () => { diag = propertyDiagram(box, st.fluid, type, st.states, st.paths, null); drawCycle(diag, type, st.states, st.paths); };
      sel.append(...['Ts', 'Ph', 'Pv', 'hs'].map(k => h('button', { class: 'btn small', onclick: () => { type = k; draw(); } }, { Ts: 'T-s', Ph: 'P-h', Pv: 'P-v', hs: 'h-s' }[k])), h('span', { class: 'ref-note' }, `${st.fluid}: ${st.states.length} ${t('states inferred from property calls; processes classified as isentropic / isobaric / isenthalpic.')}`));
      outDiag.append(sel, box); draw();
    };
    const exSel = h('select', { onchange: () => { if (!exSel.value) return; ta.value = EXAMPLES[exSel.value]; page.varInfo = {}; highlight(); liveCheck(); exSel.value = ''; } }, h('option', { value: '' }, t('Load example…')), Object.keys(EXAMPLES).map(k => h('option', { value: k }, t(k))));
    main.append(
      h('h1', { class: 'page-title' }, t('Equation editor')),
      h('div', { class: 'page-sub' }, t('Write equations in any order, EES style. Units in [brackets], property functions such as enthalpy(Water, P=P1, T=T1). The solver counts equations and unknowns live, checks units, finds blocks, and solves simultaneous blocks with Newton–Raphson.')),
      h('div', { class: 'grid2', style: { gridTemplateColumns: 'minmax(420px, 1fr) 1fr' } },
        h('div', { class: 'stack' }, h('div', { class: 'panel' },
          h('h3', {}, t('Equations'), h('span', { class: 'row' }, exSel, h('button', { class: 'btn primary', onclick: doSolve, title: 'F2' }, '▶ ' + t('Solve') + ' (F2)'))),
          h('div', { class: 'row', style: { marginBottom: '8px' } }, dof),
          h('div', { class: 'eq-wrap' }, gutter, h('div', { class: 'eq-area' }, pre, ta)), h('div', { style: { marginTop: '8px' } }, msgs),
          h('div', { class: 'ref-note', style: { marginTop: '8px' } }, t('Functions: enthalpy, entropy, temperature, pressure, volume, density, intenergy, quality, cp, cv, viscosity, conductivity, prandtl, soundspeed, t_sat, p_sat. Arguments: T, P, h, s, x, v, u. Fluids: ') + FLUIDS.map(f => f.id).join(', ') + '. ' + t('Comments: "..." or {...}. Constants: pi, g#, R#, sigma#.')))),
        h('div', { class: 'stack' }, h('div', { class: 'panel' }, resTabs, ...views))));
    highlight(); liveCheck();
    if (page.res?.ok) { renderVars(page.res); outSteps.replaceChildren(eqStepsView(buildSteps(page.res, { education: store.settings.mode === 'education' }))); renderDiagram(page.res); }
    page.doSolve = doSolve;
    page.diagEl = outDiag;
  };
  page.getReport = () => {
    if (!page.res) page.solveNow();
    const r = page.res; if (!r.ok) return null;
    const names = [...r.model.varNames].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const rows = names.map(n => { const d = displayValue(n, r.values[n], r.model, store.settings.units); return [n, d.v, d.u]; });
    const st = buildSteps(r, { education: store.settings.mode === 'education' });
    const svg = page.diagEl?.querySelector('svg');
    return { title: t('Equation model'), subtitle: page.text.split('\n')[0].replace(/"/g, ''), sections: [
      { title: t('Equations'), html: `<pre>${page.text.replace(/</g, '&lt;')}</pre><p>${r.counts.equations} equations, ${r.counts.variables} unknowns.</p>` },
      { title: t('Solution'), html: tableHTML([t('Variable'), t('Value'), t('Unit')], rows) },
      ...(svg ? [{ title: t('Property diagram'), html: figHTML(svg, '') }] : []),
      { title: t('Step-by-step solution'), html: eqStepsView(st).outerHTML },
    ] };
  };
  return page;
}

// infer fluid states from the property calls of a solved model
export function inferStates(r) {
  const calls = [];
  const model = r.model;
  for (const e of model.eqs) for (const side of [e.lhs, e.rhs]) {
    try { evaluate(side, r.values, { onProp: (ast, args) => { if (Object.keys(args).length === 2) calls.push({ fluid: ast.fluid, args, ast }); } }); } catch {}
  }
  if (!calls.length) return null;
  const counts = {}; calls.forEach(c => counts[c.fluid.toLowerCase()] = (counts[c.fluid.toLowerCase()] || 0) + 1);
  const fluidKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const fl = calls.find(c => c.fluid.toLowerCase() === fluidKey).fluid;
  const map = new Map();
  for (const c of calls.filter(c => c.fluid.toLowerCase() === fluidKey)) {
    let label = null;
    for (const a of Object.values(c.ast.named)) { if (a.t === 'var') { const m = a.name.match(/\[(\d+)\]$/) || a.name.match(/^[A-Za-z]+_?(\d+)$/); if (m) { label = m[1]; break; } } }
    let st; try { st = fullState(fl, c.args); } catch { continue; }
    if (!Number.isFinite(st.T) || !Number.isFinite(st.s)) continue;
    const key = label ?? `${st.P.toPrecision(4)}|${st.h.toPrecision(4)}`;
    if (!map.has(key)) map.set(key, { id: label ?? String(map.size + 1), ...st });
  }
  // include states defined only through simple equalities (e.g. h[2] = h[1] + w): look for P[i] & h[i] pairs
  for (const n of model.varNames) {
    const m = n.match(/^h\[(\d+)\]$/); if (!m || map.has(m[1])) continue;
    const P = r.values[`P[${m[1]}]`]; const hh = r.values[n];
    if (Number.isFinite(P) && Number.isFinite(hh)) { try { map.set(m[1], { id: m[1], ...fullState(fl, { P, h: hh }) }); } catch {} }
  }
  const states = [...map.values()].sort((a, b) => (+a.id || 0) - (+b.id || 0));
  if (!states.length) return null;
  const paths = [];
  const ordered = states.filter(s => /^\d+$/.test(s.id));
  for (let i = 0; i < ordered.length && ordered.length > 1; i++) {
    const a = ordered[i], b = ordered[(i + 1) % ordered.length];
    if (i === ordered.length - 1 && ordered.length < 3) break;
    paths.push(pathBetween(fl, a, b));
  }
  return { fluid: fl, states, paths };
}
function pathBetween(fl, a, b, n = 24) {
  const pts = []; const close = (x, y) => Math.abs(x - y) <= 1e-4 * Math.max(Math.abs(x), Math.abs(y), 1);
  const mode = close(a.s, b.s) ? 's' : close(a.P, b.P) ? 'P' : close(a.h, b.h) ? 'h' : 'line';
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    try {
      let args;
      const P = Math.exp(Math.log(a.P) * (1 - f) + Math.log(b.P) * f);
      if (mode === 's') args = { P, s: a.s }; else if (mode === 'P') args = { P: a.P, h: a.h + (b.h - a.h) * f }; else if (mode === 'h') args = { P, h: a.h }; else args = { P, h: a.h + (b.h - a.h) * f };
      pts.push({ P: args.P, T: prop('T', fl, args), s: prop('s', fl, args), h: args.h ?? prop('h', fl, args), v: prop('v', fl, args) });
    } catch {}
  }
  return { pts, dashed: mode === 'h' || mode === 'line' };
}
