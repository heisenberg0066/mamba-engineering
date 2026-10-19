// Otto / Diesel / Dual air-standard cycles with an animated piston-cylinder synchronised to P-v and T-s diagrams.
import { h, s, buildForm, debounce, fmt, thermal, animLoop, eqStepsView, tabs, legendBar } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { solveIC, IC_DEFAULTS, IC_REFS } from '../../thermo/ic.js';
import { buildSteps } from '../../core/steps.js';
import { createPlot } from '../svgplot.js';
import { tableHTML, figHTML } from '../report.js';

export function makeEnginesPage() {
  const page = { id: 'engines', group: 'thermo', icon: '⛽', title: 'Engine cycles (Otto, Diesel, Dual)', kind: 'otto', vals: structuredClone(IC_DEFAULTS), res: null };
  page.serialize = () => ({ kind: page.kind, vals: page.vals });
  page.load = (d) => { page.kind = d.kind || 'otto'; page.vals = { ...structuredClone(IC_DEFAULTS), ...d.vals }; };
  page.reset = () => { page.kind = 'otto'; page.vals = structuredClone(IC_DEFAULTS); };
  page.render = (main) => {
    const v = page.vals[page.kind];
    const schema = [
      { key: 'fluid', label: 'Working fluid model', type: 'select', options: [['Air', 'Air, variable specific heats (CoolProp real-gas air)'], ['Air_cold', 'Cold-air standard (cp = 1.005, k = 1.4)']] },
      { key: 'r', label: 'Compression ratio r', slider: true, min: 4, max: 24, step: 0.1 },
      { key: 'P1', label: 'P1 (start of compression)', unit: 'kPa', slider: true, min: 50, max: 300, step: 1 },
      { key: 'T1', label: 'T1', unit: '°C', slider: true, min: -20, max: 150, step: 1 },
      ...(page.kind === 'dual' ? [{ key: 'rp', label: 'Pressure ratio of constant-volume part r_p', slider: true, min: 1, max: 3, step: 0.01 }] : []),
      { key: 'heatMode', label: 'Heat addition specified by', type: 'select', options: page.kind === 'otto' ? [['q', 'Heat input q_in'], ['T3', 'Maximum temperature T3']] : [['rc', 'Cut-off ratio r_c'], ['q', 'Heat input q_in'], ['T3', 'Maximum temperature T3']] },
      { key: 'q_in', label: page.kind === 'dual' ? 'Total heat input q_in' : 'Heat input q_in', unit: 'kJ/kg', slider: true, min: 100, max: 3000, step: 5, show: (x) => x.heatMode === 'q' },
      { key: 'T3', label: 'Maximum temperature T3', unit: 'K', slider: true, min: 800, max: 3000, step: 5, show: (x) => x.heatMode === 'T3' },
      { key: 'rc', label: 'Cut-off ratio r_c', slider: true, min: 1.05, max: 4, step: 0.01, show: (x) => x.heatMode === 'rc' },
    ];
    const res = h('div', {}), steps = h('div', {}), eqs = h('div', {}), msg = h('div', { class: 'msgs' });
    const engine = s('svg', { viewBox: '0 0 240 360', width: 240 });
    const pvBox = h('div', {}), tsBox = h('div', {});
    let pv, ts, anim = { theta: 0 }, cyc = null, legend = h('div', {});
    const build = () => {
      const r = solveIC(page.kind, v); page.res = r;
      msg.replaceChildren(...r.messages.filter(m => m.type === 'error').map(m => h('div', { class: 'msg error' }, m.msg)));
      if (!r.ok) return;
      const V = r.values;
      res.replaceChildren(h('div', { class: 'results-grid' }, [['Thermal efficiency η', V.eta_th * 100, '%'], ['Net work w_net', V.w_net / 1000, 'kJ/kg'], ['Heat in q_in', V.q_in / 1000, 'kJ/kg'], ['Heat out q_out', V.q_out / 1000, 'kJ/kg'], ['Max temperature T3', V['T[3]'], 'K'], ['Max pressure', V['P[3]'] / 1000, 'kPa'], ['MEP', V.MEP / 1000, 'kPa'], ...(V.r_c ? [['Cut-off ratio r_c', V.r_c, '']] : [])].map(([l, x, u]) => h('div', { class: 'result-card' }, h('div', { class: 'rc-label' }, t(l)), h('div', { class: 'rc-value' }, fmt(x, 4), h('span', { class: 'rc-unit' }, ' ' + u))))));
      steps.replaceChildren(eqStepsView(buildSteps(r, { education: store.settings.mode === 'education' })));
      eqs.replaceChildren(h('pre', { style: { fontSize: '12px', background: '#f6f8fa', padding: '8px', direction: 'ltr' } }, r.text));
      cyc = r.cycle;
      pvBox.replaceChildren(); tsBox.replaceChildren();
      pv = createPlot(pvBox, { width: 420, height: 320, xLabel: 'v [m³/kg]', yLabel: 'P [kPa]', title: 'P-v' });
      ts = createPlot(tsBox, { width: 420, height: 320, xLabel: 's [kJ/kg·K]', yLabel: 'T [K]', title: 'T-s' });
      const pvPts = cyc.pts.map(p => [p.v, p.P / 1000]), tsPts = cyc.pts.map(p => [p.s / 1000, p.T]);
      pv.fit([{ pts: pvPts }]); ts.fit([{ pts: tsPts }]);
      pv.setBackground([{ pts: pvPts, color: '#e4572e', width: 2.4, fill: 'rgba(228,87,46,0.08)' }]); ts.setBackground([{ pts: tsPts, color: '#e4572e', width: 2.4, fill: 'rgba(228,87,46,0.08)' }]);
      pv.setPoints(cyc.states.map(q => ({ x: q.v, y: q.P / 1000, label: q.id }))); ts.setPoints(cyc.states.map(q => ({ x: q.s / 1000, y: q.T, label: q.id })));
      pv.dot = pv.marker(pvPts[0][0], pvPts[0][1], '#1b2533', 7); ts.dot = ts.marker(tsPts[0][0], tsPts[0][1], '#1b2533', 7);
      legend.replaceChildren(legendBar(V['T[1]'], V['T[3]'], 'K', 160));
      buildEngine();
    };
    // ---- piston-crank geometry ----
    let parts = null;
    const buildEngine = () => {
      engine.replaceChildren();
      const cyl = s('rect', { x: 70, y: 20, width: 100, height: 190, fill: '#e9eef4', stroke: '#34465c', 'stroke-width': 3 });
      const gas = s('rect', { x: 73, y: 23, width: 94, height: 40, fill: '#9cc' });
      const piston = s('rect', { x: 72, y: 60, width: 96, height: 34, fill: '#8795a8', stroke: '#34465c', 'stroke-width': 2, rx: 3 });
      const rod = s('line', { stroke: '#34465c', 'stroke-width': 7, 'stroke-linecap': 'round' });
      const crank = s('circle', { cx: 120, cy: 290, r: 40, fill: 'none', stroke: '#b8c3d1', 'stroke-width': 2, 'stroke-dasharray': '4 3' });
      const pin = s('circle', { r: 7, fill: '#34465c' });
      const flame = s('path', { d: 'M100,24 Q110,60 120,30 Q130,64 140,24 Z', fill: '#ff8c1a', opacity: 0 });
      const head = page.kind === 'otto' ? s('g', {}, s('rect', { x: 114, y: 4, width: 12, height: 18, fill: '#c9a227' }), s('text', { x: 132, y: 16, 'font-size': 10, fill: '#34465c' }, t('spark plug'))) : s('g', {}, s('rect', { x: 112, y: 2, width: 16, height: 20, fill: '#5a6b80' }), s('text', { x: 132, y: 16, 'font-size': 10, fill: '#34465c' }, t('injector')));
      const lbl = s('text', { x: 120, y: 350, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: '#1b2533' });
      const tl = s('text', { x: 178, y: 120, 'font-size': 12, fill: '#34465c' });
      engine.append(cyl, gas, flame, piston, rod, crank, pin, head, lbl, tl, s('circle', { cx: 120, cy: 290, r: 5, fill: '#34465c' }));
      parts = { gas, piston, rod, pin, flame, lbl, tl };
    };
    const V = (th) => { // volume (relative 0..1 of stroke) from crank angle th (deg, 0 = BDC)
      const ph = (th - 180) * Math.PI / 180, R = 1, L = 3.5;
      const x = R * (1 - Math.cos(ph)) + L - Math.sqrt(L * L - R * R * Math.sin(ph) ** 2); return x / 2; // 0 at TDC, 1 at BDC
    };
    const pointAt = (th) => {
      // returns {p (cycle point), phase}
      const P = cyc.pts, n1 = 41; const vals = page.res.values; const v1 = vals['v[1]'], v2 = vals['v[2]'];
      const vv = v2 + (v1 - v2) * V(th);
      const seg = (a, b) => P.slice(a, b);
      const comp = seg(0, n1); const rest = P.slice(n1);
      const heatV = page.kind === 'otto' ? rest.slice(0, n1) : page.kind === 'dual' ? rest.slice(0, n1) : [];
      const heatP = page.kind === 'otto' ? [] : page.kind === 'dual' ? rest.slice(n1, 2 * n1) : rest.slice(0, n1);
      const off = heatV.length + heatP.length;
      const exp = rest.slice(off, off + n1), rej = rest.slice(off + n1, off + 2 * n1);
      const d = 10;
      const byV = (arr, vq) => { let best = arr[0], bd = Infinity; for (const q of arr) { const e = Math.abs(Math.log(q.v / vq)); if (e < bd) { bd = e; best = q; } } return best; };
      if (th < 180 - (heatV.length ? d : 0)) return { p: byV(comp, vv), phase: 'Compression 1→2 (isentropic)' };
      if (heatV.length && th < 180 + d) { const f = (th - (180 - d)) / (2 * d); return { p: heatV[Math.min(heatV.length - 1, Math.floor(f * heatV.length))], phase: page.kind === 'otto' ? 'Heat addition 2→3 (constant volume)' : 'Heat addition 2→x (constant volume)', fire: true }; }
      if (heatP.length && vv <= vals['v[3]']) return { p: byV(heatP, vv), phase: page.kind === 'dual' ? 'Heat addition x→3 (constant pressure)' : 'Heat addition 2→3 (constant pressure)', fire: true };
      if (th < 360 - d) return { p: byV(exp, vv), phase: 'Expansion 3→4 (isentropic)' };
      const f = (th - (360 - d)) / d; return { p: rej[Math.min(rej.length - 1, Math.floor(f * rej.length))], phase: 'Heat rejection 4→1 (constant volume)', cool: true };
    };
    const loop = animLoop((dt) => {
      if (!cyc || !parts || !page.res?.ok) return;
      anim.theta = (anim.theta + dt * 70 * speed) % 360;
      const th = anim.theta, x = V(th);
      const top = 23, stroke = 120, pistonTop = 23 + 18 + x * stroke;
      parts.piston.setAttribute('y', pistonTop); parts.gas.setAttribute('height', pistonTop - top);
      const ph = (th - 180) * Math.PI / 180; const cx = 120 + 40 * Math.sin(ph), cy = 290 - 40 * Math.cos(ph);
      parts.pin.setAttribute('cx', cx); parts.pin.setAttribute('cy', cy);
      parts.rod.setAttribute('x1', 120); parts.rod.setAttribute('y1', pistonTop + 17); parts.rod.setAttribute('x2', cx); parts.rod.setAttribute('y2', cy);
      const { p, phase, fire, cool } = pointAt(th);
      const vals = page.res.values;
      parts.gas.setAttribute('fill', thermal((p.T - vals['T[1]']) / (vals['T[3]'] - vals['T[1]'])));
      parts.flame.setAttribute('opacity', fire ? 0.9 : 0); parts.lbl.textContent = t(phase);
      parts.tl.textContent = `T = ${Math.round(p.T)} K`; parts.tl.setAttribute('y', 40);
      pv.dot.setAttribute('cx', pv.X(p.v)); pv.dot.setAttribute('cy', pv.Y(p.P / 1000)); ts.dot.setAttribute('cx', ts.X(p.s / 1000)); ts.dot.setAttribute('cy', ts.Y(p.T));
    });
    let speed = 1;
    const form = buildForm(schema, v, debounce(() => build(), 60));
    const kindSel = h('select', { onchange: () => { page.kind = kindSel.value; main.replaceChildren(); loop.stop(); page.render(main); } }, [['otto', 'Otto (spark ignition)'], ['diesel', 'Diesel (compression ignition)'], ['dual', 'Dual (limited pressure)']].map(([k, l]) => h('option', { value: k, selected: page.kind === k }, t(l))));
    const views = [steps, eqs];
    const tb = tabs(['Step-by-step solution', 'Equations'], (i) => views.forEach((x, k) => x.style.display = k === i ? '' : 'none'));
    eqs.style.display = 'none';
    main.append(
      h('h1', { class: 'page-title' }, t('Engine cycles (Otto, Diesel, Dual)')),
      h('div', { class: 'page-sub' }, t('Air-standard closed cycles. The piston, crank and gas colour (temperature) move in sync with the state point on the P-v and T-s diagrams.')),
      h('div', { class: 'grid2' },
        h('div', { class: 'stack' }, h('div', { class: 'panel' }, h('h3', {}, t('Inputs')), h('div', { class: 'form-row' }, h('label', {}, t('Cycle')), kindSel), form), h('div', { class: 'ref-note' }, '📘 ' + IC_REFS[page.kind])),
        h('div', { class: 'stack' },
          h('div', { class: 'panel' }, h('h3', {}, t('Interactive visual'), h('span', { class: 'row' }, legend, h('label', {}, t('Speed') + ' '), h('input', { type: 'range', min: 0, max: 3, step: 0.1, value: 1, oninput: (e) => speed = +e.target.value }))), h('div', { class: 'engine-anim' }, h('div', { class: 'viz-box' }, engine), h('div', { class: 'viz-box' }, pvBox), h('div', { class: 'viz-box' }, tsBox)), msg),
          h('div', { class: 'panel' }, h('h3', {}, t('Results')), res),
          h('div', { class: 'panel' }, tb, steps, eqs))));
    build();
    page.cleanup = () => loop.stop();
    page.figs = () => [engine, pvBox.querySelector('svg'), tsBox.querySelector('svg')];
  };
  page.getReport = () => {
    const r = page.res; if (!r?.ok) return null; const V = r.values;
    const st = [1, 2, ...(page.kind === 'dual' ? [5] : []), 3, 4].map(i => [i === 5 ? 'x' : i, V[`P[${i}]`] / 1000, V[`T[${i}]`], V[`v[${i}]`]]);
    return { title: t({ otto: 'Ideal Otto cycle', diesel: 'Ideal Diesel cycle', dual: 'Ideal Dual cycle' }[page.kind]), subtitle: IC_REFS[page.kind], sections: [
      { title: t('Inputs'), html: tableHTML([t('Quantity'), t('Value')], Object.entries(page.vals[page.kind]).map(([k, x]) => [k, x])) },
      { title: t('Results'), html: tableHTML([t('Quantity'), t('Value'), t('Unit')], [['η', V.eta_th * 100, '%'], ['w_net', V.w_net / 1000, 'kJ/kg'], ['q_in', V.q_in / 1000, 'kJ/kg'], ['q_out', V.q_out / 1000, 'kJ/kg'], ['MEP', V.MEP / 1000, 'kPa']]) + tableHTML(['State', 'P [kPa]', 'T [K]', 'v [m³/kg]'], st) },
      { title: t('Figures'), html: page.figs().map(f => figHTML(f, '')).join('') },
      { title: t('Equations'), html: `<pre>${r.text}</pre>` },
      { title: t('Step-by-step solution'), html: eqStepsView(buildSteps(r, { education: store.settings.mode === 'education' })).outerHTML },
    ] };
  };
  return page;
}
