// Heat-transfer slice: composite wall / pipe insulation, lumped transient cooling, fins — each with an animated visual.
import { h, s, fmt, thermal, legendBar, animLoop } from '../ui.js';
import { t } from '../i18n.js';
import { makeCalcPage } from '../calcpage.js';
import { conduction, lumped, fin, MATERIALS } from '../../heat/calcs.js';
import { createPlot } from '../svgplot.js';

const uid = () => 'g' + Math.random().toString(36).slice(2, 8);
const norm = (T, a, b) => (T - a) / ((b - a) || 1);

// ---------------- composite wall / pipe ----------------
function layersEditor(v, changed) {
  const box = h('div', { class: 'layers' });
  const draw = () => {
    box.replaceChildren(h('div', { class: 'form-heading' }, t('Layers (inside → outside)')));
    v.layers.forEach((l, i) => {
      const mat = h('select', { onchange: () => { const m = MATERIALS.find(x => x[0] === mat.value); l.name = m[0]; if (m[0] !== 'Custom') l.k = m[1]; draw(); changed(); } }, MATERIALS.map(([n, k]) => h('option', { value: n, selected: n === l.name }, `${t(n)} (${k})`)));
      const k = h('input', { type: 'number', value: l.k, step: 'any', style: { width: '70px' }, oninput: () => { l.k = +k.value || l.k; changed(); } });
      const th = h('input', { type: 'number', value: l.t, step: 'any', style: { width: '70px' }, oninput: () => { l.t = +th.value || l.t; changed(); } });
      const del = h('button', { class: 'btn small', title: t('Remove layer'), onclick: () => { if (v.layers.length > 1) { v.layers.splice(i, 1); draw(); changed(); } } }, '✕');
      box.append(h('div', { class: 'layer-row' }, h('span', { class: 'layer-n' }, i + 1), mat, h('span', {}, 'k'), k, h('span', { class: 'unit' }, 'W/m·K'), h('span', {}, t('t')), th, h('span', { class: 'unit' }, 'mm'), del));
    });
    box.append(h('button', { class: 'btn small', onclick: () => { v.layers.push({ name: 'Mineral wool', k: 0.04, t: 50 }); draw(); changed(); } }, '+ ' + t('Add layer')));
  };
  draw();
  return box;
}
function conductionViz(el, out, v, ctl) {
  let loop, parts = [];
  const pic = h('div', {}), plots = h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'wrap' } });
  el.append(pic, plots);
  const draw = (o) => {
    const z = o.viz; pic.replaceChildren(); plots.replaceChildren(); parts = [];
    const allT = [z.Tin, z.Tout, ...z.surf]; const Tmin = Math.min(...allT), Tmax = Math.max(...allT);
    const W = 620, H = 280; const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', class: 'heat-svg' });
    const gid = uid(); const stops = [];
    const r0 = z.radii[0], rN = z.radii[z.radii.length - 1];
    for (let k = 0; k <= 40; k++) { const r = r0 + (rN - r0) * k / 40; stops.push({ f: k / 40, r, T: o.viz.profile(r) }); }
    if (z.geo === 'plane') {
      const x0 = 150, x1 = 470;
      svg.append(s('defs', {}, s('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, stops.map(p => s('stop', { offset: p.f, 'stop-color': thermal(norm(p.T, Tmin, Tmax)) })))));
      svg.append(s('rect', { x: 10, y: 36, width: x0 - 10, height: 200, fill: thermal(norm(z.Tin, Tmin, Tmax)), opacity: 0.25 }), s('rect', { x: x1, y: 36, width: W - 10 - x1, height: 200, fill: thermal(norm(z.Tout, Tmin, Tmax)), opacity: 0.25 }));
      svg.append(s('rect', { x: x0, y: 36, width: x1 - x0, height: 200, fill: `url(#${gid})` }));
      const X = (r) => x0 + (r - r0) / (rN - r0) * (x1 - x0);
      z.radii.forEach((r, i) => { svg.append(s('line', { x1: X(r), x2: X(r), y1: 36, y2: 236, stroke: '#1b2533', 'stroke-width': 1.5 })); if (i < z.layers.length) { const wpx = X(z.radii[i + 1]) - X(r), nm = (v.layers[i].name || ''); svg.append(s('text', { x: (X(r) + X(z.radii[i + 1])) / 2, y: 252 + (i % 2) * 14, 'text-anchor': 'middle', 'font-size': 11 }, wpx < 70 ? nm.split(/[ (\/]/)[0].slice(0, 10) : nm.slice(0, 20))); } });
      z.surf.forEach((T, i) => svg.append(s('text', { x: X(z.radii[i]), y: i % 2 ? 29 : 14, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600 }, fmt(T, 3) + ' °C')));
      // temperature profile line
      const Ymap = (T) => 226 - norm(T, Tmin, Tmax) * 180;
      svg.append(s('path', { d: stops.map((p, k) => (k ? 'L' : 'M') + X(p.r).toFixed(1) + ',' + Ymap(p.T).toFixed(1)).join(''), stroke: '#fff', 'stroke-width': 3, fill: 'none' }), s('path', { d: stops.map((p, k) => (k ? 'L' : 'M') + X(p.r).toFixed(1) + ',' + Ymap(p.T).toFixed(1)).join(''), stroke: '#1b2533', 'stroke-width': 1.5, fill: 'none' }));
      svg.append(s('text', { x: 20, y: 136, 'font-size': 12 }, (v.inner === 'conv' ? 'T∞,i = ' + fmt(z.Tin, 3) : 'Q̇ in') + ' °C'), s('text', { x: x1 + 12, y: 136, 'font-size': 12 }, 'T∞,o = ' + fmt(z.Tout, 3) + ' °C'));
      for (let k = 0; k < 26; k++) { const c = s('circle', { r: 3.2, class: 'particle', fill: '#ffcf33', stroke: '#a15c00', 'stroke-width': 0.8 }); svg.append(c); parts.push({ c, x: Math.random(), y: 46 + Math.random() * 180 }); }
      const dir = Math.sign(z.Q) || 1;
      loop?.stop(); loop = animLoop((dt) => { const sp = Math.min(0.6, 0.08 + Math.log10(1 + Math.abs(z.Q)) * 0.08); for (const p of parts) { p.x += dir * dt * sp; if (p.x > 1) p.x -= 1; if (p.x < 0) p.x += 1; p.c.setAttribute('cx', 10 + p.x * (W - 20)); p.c.setAttribute('cy', p.y); } });
    } else {
      const cx = 160, cy = 130, R = 115, Rs = (r) => r / rN * R * (r0 / rN < 0.15 ? 1 : 1);
      const scale = (r) => (r / rN) * R;
      svg.append(s('defs', {}, s('radialGradient', { id: gid, cx: 0.5, cy: 0.5, r: 0.5 }, stops.map(p => s('stop', { offset: p.r / rN, 'stop-color': thermal(norm(p.T, Tmin, Tmax)) })))));
      svg.append(s('rect', { x: 0, y: 0, width: 330, height: H, fill: thermal(norm(z.Tout, Tmin, Tmax)), opacity: 0.18 }));
      svg.append(s('circle', { cx, cy, r: R, fill: `url(#${gid})` }));
      svg.append(s('circle', { cx, cy, r: scale(r0), fill: v.inner === 'conv' ? thermal(norm(z.Tin, Tmin, Tmax)) : '#d0d6de', stroke: '#1b2533' }));
      z.radii.forEach((r) => svg.append(s('circle', { cx, cy, r: scale(r), fill: 'none', stroke: '#1b2533', 'stroke-width': 1.2 })));
      if (z.rcr) svg.append(s('circle', { cx, cy, r: Math.min(R * 1.12, scale(z.rcr)), fill: 'none', stroke: '#0a7', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }), s('text', { x: cx + Math.min(R * 1.12, scale(z.rcr)) * 0.72, y: cy - Math.min(R * 1.12, scale(z.rcr)) * 0.72 - 4, fill: '#0a7', 'font-size': 11 }, 'r_cr'));
      for (let k = 0; k < 36; k++) { const c = s('circle', { r: 3, class: 'particle', fill: '#ffcf33', stroke: '#a15c00', 'stroke-width': 0.8 }); svg.append(c); parts.push({ c, a: Math.random() * 2 * Math.PI, f: Math.random() }); }
      const f0 = scale(r0) / R;
      loop?.stop(); loop = animLoop((dt) => { const sp = Math.min(0.5, 0.06 + Math.log10(1 + Math.abs(z.Q)) * 0.07); for (const p of parts) { p.f += dt * sp; if (p.f > 1.1) { p.f = f0; p.a = Math.random() * 2 * Math.PI; } const rr = p.f * R; p.c.setAttribute('cx', cx + rr * Math.cos(p.a)); p.c.setAttribute('cy', cy + rr * Math.sin(p.a)); } });
      // radial profile mini-chart on right
      const pb = h('div', {}); const pl = createPlot(null, { width: 280, height: 240, xLabel: 'r [mm]', yLabel: 'T [°C]' });
      const pts = stops.map(p => [p.r * 1000, p.T]); pl.fit([{ pts }]); pl.setBackground([{ pts, color: '#e4572e', width: 2.2 }]); pl.setPoints(z.radii.map((r, i) => ({ x: r * 1000, y: z.surf[i], r: 3.5 })));
      const g = s('g', { transform: 'translate(335,10)' }); const inner = pl.svg; inner.setAttribute('width', 280); inner.setAttribute('height', 240); g.append(inner); svg.append(g);
      svg.append(s('text', { x: 10, y: 16, 'font-size': 12, 'font-weight': 600 }, z.geo === 'cylinder' ? t('Pipe cross-section') : t('Sphere cross-section')));
    }
    pic.append(svg, legendBar(Tmin, Tmax, '°C', 200));
    if (z.sweep) {
      const box = h('div', { class: 'viz-sub' }); const pl = createPlot(box, { width: 360, height: 220, xLabel: t('outer radius of last layer') + ' [mm]', yLabel: z.inner === 'Q' ? 'T₁ [°C]' : 'Q̇ [W]', title: t('Critical radius of insulation') });
      const pts = z.sweep.map(p => [p.r, z.inner === 'Q' ? p.T1 : p.Q]); if (z.inner === 'Q') pl.svg.querySelector('.axis-label') && 0;
      pl.fit([{ pts }]); pl.setBackground([{ pts, color: '#2a6fdb', width: 2 }]); pl.vline(z.rcr * 1000, '#0a7'); pl.marker(z.radii[z.radii.length - 1] * 1000, z.inner === 'Q' ? z.surf[0] : z.Q, '#e4572e', 5);
      plots.append(box);
    }
  };
  draw(out);
  return { update: (o) => draw(o), stop: () => loop?.stop() };
}
export const conductionPage = makeCalcPage({
  id: 'heat-wall', group: 'heat', icon: '🧱', title: 'Composite wall & pipe insulation',
  sub: 'Steady 1-D conduction through layered plane walls, cylinders (pipe/wire insulation) and spheres, with convection on both sides and the critical radius of insulation.',
  defaults: { geometry: 'plane', A: 1, L: 1, r_in: 25, inner: 'conv', T_in: 20, h_in: 8, Q: 50, outer: 'conv', T_out: -10, h_out: 25, layers: [{ name: 'Common brick', k: 0.72, t: 100 }, { name: 'Mineral wool', k: 0.04, t: 50 }, { name: 'Gypsum board', k: 0.17, t: 13 }] },
  schema: [
    { key: 'geometry', label: 'Geometry', type: 'select', options: [['plane', 'Plane wall'], ['cylinder', 'Cylinder (pipe / wire)'], ['sphere', 'Sphere (tank)']] },
    { key: 'A', label: 'Wall area A', unit: 'm²', show: (v) => v.geometry === 'plane' },
    { key: 'r_in', label: 'Inner radius r₁', unit: 'mm', slider: true, min: 0.5, max: 500, step: 0.5, show: (v) => v.geometry !== 'plane' },
    { key: 'L', label: 'Length L', unit: 'm', show: (v) => v.geometry === 'cylinder' },
    { key: 'inner', label: 'Inside boundary', type: 'select', options: [['conv', 'Fluid with convection (T∞, h)'], ['Q', 'Known heat rate (e.g. electric wire)']] },
    { key: 'T_in', label: 'Inside fluid temperature', unit: '°C', slider: true, min: -50, max: 600, step: 1, show: (v) => v.inner === 'conv' },
    { key: 'h_in', label: 'Inside h', unit: 'W/m²K', show: (v) => v.inner === 'conv' },
    { key: 'Q', label: 'Heat rate Q̇', unit: 'W', slider: true, min: 0, max: 1000, step: 1, show: (v) => v.inner === 'Q' },
    { key: 'T_out', label: 'Outside fluid temperature', unit: '°C', slider: true, min: -40, max: 100, step: 1 },
    { key: 'h_out', label: 'Outside h', unit: 'W/m²K', slider: true, min: 2, max: 200, step: 1 },
  ],
  extraInputs: (v, changed) => layersEditor(v, changed),
  reportInputs: (v) => v.layers.map((l, i) => [`${t('Layer')} ${i + 1}: ${l.name}`, `k = ${l.k} W/m·K, t = ${l.t} mm`, '']),
  compute: (v) => conduction({ ...v, outer: 'conv' }),
  viz: conductionViz, rebuildOn: ['geometry'],
  refNote: 'Validated: Çengel & Ghajar electric-wire insulation example (interface ≈ 105 °C, r_cr = 12.5 mm) and a 3-layer brick/mineral-wool/gypsum wall checked by hand.',
});

// ---------------- lumped transient ----------------
function lumpedViz(el, out, v, ctl) {
  let loop, time = 0, playing = true, z;
  const svg = s('svg', { viewBox: '0 0 300 240', width: 300 }); const pb = h('div', {});
  el.append(h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'wrap' } }, svg, pb));
  const btn = h('button', { class: 'btn small', onclick: () => { playing = !playing; btn.textContent = playing ? '❚❚' : '▶'; } }, '❚❚');
  const sl = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, oninput: () => { time = +sl.value * z.inp.t_end; playing = false; btn.textContent = '▶'; } });
  const lbl = h('span', { class: 'mono' });
  ctl.append(btn, sl, lbl);
  let body, txt, pl, mk, arrows = [];
  const draw = (o) => {
    z = o.viz; svg.replaceChildren(); arrows = [];
    svg.append(s('rect', { x: 0, y: 0, width: 300, height: 240, fill: thermal(norm(z.inp.T_inf, Math.min(z.inp.T_i, z.inp.T_inf), Math.max(z.inp.T_i, z.inp.T_inf))), opacity: 0.15 }));
    for (let k = 0; k < 7; k++) { const a = s('path', { d: 'M0,0 l26,0 m-6,-4 l6,4 l-6,4', stroke: '#2a6fdb', 'stroke-width': 1.6, fill: 'none', class: 'particle' }); svg.append(a); arrows.push({ a, x: Math.random() * 300, y: 20 + k * 32 }); }
    body = z.inp.shape === 'sphere' ? s('circle', { cx: 150, cy: 120, r: 60, stroke: '#1b2533', 'stroke-width': 2 }) : z.inp.shape === 'cylinder' ? s('rect', { x: 95, y: 70, width: 110, height: 100, rx: 50, ry: 14, stroke: '#1b2533', 'stroke-width': 2 }) : s('rect', { x: 135, y: 30, width: 30, height: 180, stroke: '#1b2533', 'stroke-width': 2 });
    txt = s('text', { x: 150, y: 125, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#fff', stroke: '#1b2533', 'stroke-width': 0.5 });
    svg.append(body, txt, s('text', { x: 8, y: 232, 'font-size': 11 }, `T∞ = ${z.inp.T_inf} °C, h = ${z.inp.h} W/m²K, Bi = ${fmt(z.Bi, 3)}`));
    pb.replaceChildren(); pl = createPlot(pb, { width: 380, height: 240, xLabel: 't [s]', yLabel: 'T [°C]', title: 'T(t)' });
    const pts = z.series.map(p => [p.t, p.T]); pl.fit([{ pts }], [{ x: 0, y: z.inp.T_target }]); pl.setBackground([{ pts, color: '#e4572e', width: 2.2 }, { pts: [[0, z.inp.T_inf], [z.inp.t_end, z.inp.T_inf]], color: '#2a6fdb', dash: '5 4', label: 'T∞' }]);
    if (Number.isFinite(z.tt) && z.tt <= z.inp.t_end) { pl.vline(z.tt, '#0a7'); pl.setPoints([{ x: z.tt, y: z.inp.T_target, label: 't = ' + fmt(z.tt, 3) + ' s', color: '#0a7', r: 4 }]); }
    mk = pl.marker(0, z.inp.T_i, '#1b2533', 6);
  };
  draw(out);
  const lo = Math.min(), period = 6;
  loop = animLoop((dt) => {
    if (!z) return;
    if (playing) time = (time + dt * z.inp.t_end / period) % (z.inp.t_end * 1.0001);
    const T = z.T(time), a = Math.min(z.inp.T_i, z.inp.T_inf), b = Math.max(z.inp.T_i, z.inp.T_inf);
    body.setAttribute('fill', thermal(norm(T, a, b))); txt.textContent = fmt(T, 4) + ' °C';
    mk.setAttribute('cx', pl.X(time)); mk.setAttribute('cy', pl.Y(T)); sl.value = time / z.inp.t_end; lbl.textContent = ` t = ${fmt(time, 3)} s`;
    for (const p of arrows) { p.x += dt * 60; if (p.x > 300) p.x = -30; p.a.setAttribute('transform', `translate(${p.x},${p.y})`); }
  });
  return { update: (o) => draw(o), stop: () => loop.stop() };
}
export const lumpedPage = makeCalcPage({
  id: 'heat-lumped', group: 'heat', icon: '⏱', title: 'Transient cooling (lumped capacitance)',
  sub: 'Heating or cooling of a small body in a fluid. Checks the Biot number, gives the time constant, time to a target temperature and the T(t) curve — with the body changing colour in time.',
  defaults: { shape: 'sphere', D: 1, Lcyl: 0, k: 35, rho: 8500, cp: 320, h: 210, T_i: 20, T_inf: 100, T_target: 99, t_end: 15 },
  schema: [
    { key: 'shape', label: 'Body shape', type: 'select', options: [['sphere', 'Sphere (diameter D)'], ['cylinder', 'Cylinder (diameter D, length L)'], ['plate', 'Plate (thickness D)']] },
    { key: 'D', label: 'Diameter / thickness D', unit: 'mm', slider: true, min: 0.1, max: 200, step: 0.1 },
    { key: 'Lcyl', label: 'Cylinder length L', unit: 'mm', show: (v) => v.shape === 'cylinder' },
    { key: 'k', label: 'Conductivity k', unit: 'W/m·K' }, { key: 'rho', label: 'Density ρ', unit: 'kg/m³' }, { key: 'cp', label: 'Specific heat cp', unit: 'J/kg·K' },
    { key: 'h', label: 'Convection coefficient h', unit: 'W/m²K', slider: true, min: 1, max: 2000, step: 1 },
    { key: 'T_i', label: 'Initial temperature Ti', unit: '°C', slider: true, min: -50, max: 1000, step: 1 },
    { key: 'T_inf', label: 'Fluid temperature T∞', unit: '°C', slider: true, min: -50, max: 1000, step: 1 },
    { key: 'T_target', label: 'Target temperature', unit: '°C' },
    { key: 't_end', label: 'Time span shown', unit: 's', slider: true, min: 1, max: 20000, step: 1 },
  ],
  compute: (v) => lumped(v), viz: lumpedViz,
  refNote: 'Validated: Çengel & Ghajar thermocouple-junction example (D = 1 mm, h = 210 W/m²K, 99 % of ΔT reached in ≈ 10 s).',
});

// ---------------- fin ----------------
function finViz(el, out, v, ctl) {
  let loop, arrows = [];
  const pic = h('div', {}), pb = h('div', {});
  el.append(h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'wrap' } }, pic, pb));
  const draw = (o) => {
    const z = o.viz; pic.replaceChildren(); pb.replaceChildren(); arrows = [];
    const Tb = z.inp.T_b, Ti = z.inp.T_inf; const W = 360, H = 240, x0 = 60, x1 = 330, th = z.inp.type === 'pin' ? 40 : 30;
    const gid = uid();
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W }, s('defs', {}, s('linearGradient', { id: gid, x1: 0, x2: 1 }, z.series.map((p, k) => s('stop', { offset: k / (z.series.length - 1), 'stop-color': thermal(norm(p.T, Ti, Tb)) })))));
    svg.append(s('rect', { x: 10, y: 20, width: x0 - 10, height: 200, fill: thermal(1), stroke: '#1b2533' }), s('text', { x: 14, y: 16, 'font-size': 11 }, `T_b = ${Tb} °C`));
    const y0 = 120 - th / 2;
    svg.append(z.inp.type === 'pin' ? s('rect', { x: x0, y: y0, width: x1 - x0, height: th, rx: th / 2.2, fill: `url(#${gid})`, stroke: '#1b2533' }) : s('rect', { x: x0, y: y0, width: x1 - x0, height: th, fill: `url(#${gid})`, stroke: '#1b2533' }));
    svg.append(s('text', { x: x1, y: y0 + th + 34, 'text-anchor': 'end', 'font-size': 11 }, `T_tip = ${fmt(o.results.T_tip.v, 4)} °C`), s('text', { x: 200, y: 232, 'text-anchor': 'middle', 'font-size': 11 }, `T∞ = ${Ti} °C, h = ${z.inp.h} W/m²K`));
    for (let k = 0; k < 16; k++) {
      const f = (k % 8 + 0.5) / 8, up = k < 8; const T = z.series[Math.round(f * (z.series.length - 1))].T; const mag = Math.max(0.05, norm(T, Ti, Tb));
      const a = s('path', { d: 'M0,0', stroke: '#e4572e', 'stroke-width': 1 + 2 * mag, fill: 'none', class: 'particle', 'stroke-linecap': 'round' });
      a.setAttribute('d', `M0,0 L0,${(up ? -1 : 1) * (18 * mag + 6)}`);
      svg.append(a); arrows.push({ a, x: x0 + f * (x1 - x0), y: up ? y0 - 2 : y0 + th + 2, up, ph: Math.random(), mag });
    }
    pic.append(svg, legendBar(Ti, Tb, '°C', 160));
    const pl = createPlot(pb, { width: 360, height: 240, xLabel: 'x [mm]', yLabel: 'T [°C]', title: 'T(x)' });
    const pts = z.series.map(p => [p.x, p.T]); pl.fit([{ pts }], [{ x: 0, y: Ti }]); pl.setBackground([{ pts, color: '#e4572e', width: 2.2 }, { pts: [[0, Ti], [z.inp.L, Ti]], color: '#2a6fdb', dash: '5 4', label: 'T∞' }]);
  };
  draw(out);
  loop = animLoop((dt) => { for (const p of arrows) { p.ph = (p.ph + dt * (0.4 + p.mag)) % 1; p.a.setAttribute('transform', `translate(${p.x},${p.y + (p.up ? -1 : 1) * p.ph * 16})`); p.a.setAttribute('opacity', 1 - p.ph); } });
  return { update: (o) => draw(o), stop: () => loop.stop() };
}
export const finPage = makeCalcPage({
  id: 'heat-fin', group: 'heat', icon: '🔥', title: 'Fins (extended surfaces)',
  sub: 'Pin and straight rectangular fins with infinite, adiabatic, convective or corrected-length tips. Fin efficiency, effectiveness and the temperature along the fin.',
  defaults: { type: 'pin', D: 5, w: 100, t: 2, L: 100, k: 200, h: 25, T_b: 100, T_inf: 25, tip: 'convective', N: 1 },
  schema: [
    { key: 'type', label: 'Fin type', type: 'select', options: [['pin', 'Pin fin (round)'], ['rect', 'Straight rectangular fin']] },
    { key: 'D', label: 'Pin diameter D', unit: 'mm', slider: true, min: 0.5, max: 30, step: 0.1, show: (v) => v.type === 'pin' },
    { key: 'w', label: 'Fin width w', unit: 'mm', show: (v) => v.type === 'rect' },
    { key: 't', label: 'Fin thickness t', unit: 'mm', slider: true, min: 0.2, max: 20, step: 0.1, show: (v) => v.type === 'rect' },
    { key: 'L', label: 'Fin length L', unit: 'mm', slider: true, min: 5, max: 500, step: 1 },
    { key: 'k', label: 'Conductivity k', unit: 'W/m·K', slider: true, min: 1, max: 400, step: 1 },
    { key: 'h', label: 'Convection coefficient h', unit: 'W/m²K', slider: true, min: 2, max: 500, step: 1 },
    { key: 'T_b', label: 'Base temperature Tb', unit: '°C', slider: true, min: 0, max: 400, step: 1 },
    { key: 'T_inf', label: 'Fluid temperature T∞', unit: '°C' },
    { key: 'tip', label: 'Tip condition', type: 'select', options: [['convective', 'Convective tip'], ['adiabatic', 'Adiabatic tip'], ['corrected', 'Corrected length (Lc)'], ['infinite', 'Infinitely long']] },
    { key: 'N', label: 'Number of fins', unit: '' },
  ],
  compute: (v) => fin(v), viz: finViz,
  refNote: 'Validated: closed-form fin solutions (Incropera Table 3.4) against an independent finite-difference solution of the fin equation (heat rate and tip temperature).',
});
