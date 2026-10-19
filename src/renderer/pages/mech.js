// Machine-elements slice (MechWorkbench): each page = form + animated visual + step-by-step + PDF report.
import { h, s, fmt, thermal, animLoop, legendBar } from '../ui.js';
import { t } from '../i18n.js';
import { makeCalcPage } from '../calcpage.js';
import { mohr, fits, boltedJoint, shaft, bearing, spurGear, spring, BOLT_CLASSES, METRIC_COARSE, SPRING_MAT } from '../../mech/calcs.js';
import { createPlot } from '../svgplot.js';

const row = (...k) => h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' } }, ...k);
const arrow = (x1, y1, x2, y2, color = '#1b2533', w = 2) => { const a = Math.atan2(y2 - y1, x2 - x1), L = 8; return s('g', {}, s('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': w }), s('path', { d: `M${x2},${y2} L${x2 - L * Math.cos(a - 0.4)},${y2 - L * Math.sin(a - 0.4)} L${x2 - L * Math.cos(a + 0.4)},${y2 - L * Math.sin(a + 0.4)} Z`, fill: color })); };
const playCtl = (ctl, st) => { const b = h('button', { class: 'btn small', onclick: () => { st.play = !st.play; b.textContent = st.play ? '⏸' : '▶'; } }, '⏸'); const sp = h('input', { type: 'range', min: 0, max: 3, step: 0.1, value: 1, oninput: () => st.speed = +sp.value }); ctl.append(b, h('span', {}, t('Speed')), sp); return st; };

// ---------------- Mohr's circle ----------------
function mohrViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, th: 0 });
  const elSvg = s('svg', { viewBox: '0 0 260 260', width: 260 }); const pb = h('div', {});
  el.append(row(elSvg, pb));
  let z, pl, ptX, ptY, dia, lbl;
  const draw = (o) => {
    z = o.viz; pb.replaceChildren();
    pl = createPlot(pb, { width: 380, height: 300, xLabel: 'σ [MPa]', yLabel: 'τ [MPa] (cw ↑)', title: "Mohr's circle" });
    const R = z.R, C = z.C; const circ = []; for (let k = 0; k <= 120; k++) { const a = 2 * Math.PI * k / 120; circ.push([C + R * Math.cos(a), R * Math.sin(a)]); }
    const span = Math.max(R * 1.25, 1); pl.setRanges([C - span * 1.2, C + span * 1.2], [-span, span]);
    pl.setBackground([{ pts: circ, color: '#2a6fdb', width: 2 }, { pts: [[C - span * 2, 0], [C + span * 2, 0]], color: '#999' }, { pts: [[0, -span * 2], [0, span * 2]], color: '#999' }]);
    pl.setPoints([{ x: z.s1, y: 0, label: 'σ1', color: '#e4572e', r: 4 }, { x: z.s2, y: 0, label: 'σ2', color: '#e4572e', r: 4 }, { x: C, y: R, label: 'τmax', color: '#0a7', r: 4 }]);
    dia = s('line', { stroke: '#1b2533', 'stroke-width': 1.5 }); pl.svg.append(dia);
    ptX = pl.marker(0, 0, '#1b2533', 6); ptY = pl.marker(0, 0, '#888', 5);
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.th = (st.th + dt * 0.35 * st.speed) % Math.PI;
    const th = st.th, r = z.rot(th);
    // Mohr (Shigley convention): x-face point (σx', τ cw up) → plot τ_xy' as −τ for ccw-positive input
    ptX.setAttribute('cx', pl.X(r.sx)); ptX.setAttribute('cy', pl.Y(-r.txy)); ptY.setAttribute('cx', pl.X(r.sy)); ptY.setAttribute('cy', pl.Y(r.txy));
    dia.setAttribute('x1', pl.X(r.sx)); dia.setAttribute('y1', pl.Y(-r.txy)); dia.setAttribute('x2', pl.X(r.sy)); dia.setAttribute('y2', pl.Y(r.txy));
    // element
    elSvg.replaceChildren();
    const sc = 60 / Math.max(Math.abs(z.s1), Math.abs(z.s2), z.R, 1);
    const g = s('g', { transform: `translate(130,130) rotate(${-th * 180 / Math.PI})` });
    g.append(s('rect', { x: -40, y: -40, width: 80, height: 80, fill: '#e9eef4', stroke: '#1b2533', 'stroke-width': 2 }));
    const nx = r.sx * sc * 0.6, ny = r.sy * sc * 0.6, tt = r.txy * sc * 0.5;
    if (Math.abs(nx) > 2) { g.append(arrow(nx > 0 ? 42 : 42 + Math.abs(nx), 0, nx > 0 ? 42 + nx : 42, 0, '#e4572e', 2.5), arrow(nx > 0 ? -42 : -42 - Math.abs(nx), 0, nx > 0 ? -42 - nx : -42, 0, '#e4572e', 2.5)); }
    if (Math.abs(ny) > 2) { g.append(arrow(0, ny > 0 ? -42 : -42 - Math.abs(ny), 0, ny > 0 ? -42 - ny : -42, '#2a6fdb', 2.5), arrow(0, ny > 0 ? 42 : 42 + Math.abs(ny), 0, ny > 0 ? 42 + ny : 42, '#2a6fdb', 2.5)); }
    if (Math.abs(tt) > 2) { g.append(arrow(46, tt / 2, 46, -tt / 2, '#0a7'), arrow(-46, -tt / 2, -46, tt / 2, '#0a7'), arrow(-tt / 2, -46, tt / 2, -46, '#0a7'), arrow(tt / 2, 46, -tt / 2, 46, '#0a7')); }
    elSvg.append(s('line', { x1: 10, y1: 130, x2: 250, y2: 130, stroke: '#ccc', 'stroke-dasharray': '3 3' }), g,
      s('text', { x: 8, y: 16, 'font-size': 12, 'font-weight': 600 }, `θ = ${(th * 180 / Math.PI).toFixed(1)}°`),
      s('text', { x: 8, y: 236, 'font-size': 11, fill: '#e4572e' }, `σx' = ${fmt(r.sx, 4)}`), s('text', { x: 92, y: 236, 'font-size': 11, fill: '#2a6fdb' }, `σy' = ${fmt(r.sy, 4)}`), s('text', { x: 176, y: 236, 'font-size': 11, fill: '#0a7' }, `τ' = ${fmt(r.txy, 4)}`),
      s('text', { x: 8, y: 252, 'font-size': 10, fill: '#666' }, t('MPa — element rotates; the point moves 2θ on the circle')));
  });
  return { update: draw, stop: loop.stop };
}
export const mohrPage = makeCalcPage({
  id: 'mech-mohr', group: 'mech', icon: '◯', title: "Mohr's circle (plane stress)", sub: 'Stress transformation, principal stresses and maximum shear. The stress element rotates while its point travels around the circle.',
  defaults: { sx: 80, sy: 0, txy: -50, Sy: 0 },
  schema: [{ key: 'sx', label: 'σx', unit: 'MPa', slider: true, min: -300, max: 300, step: 1 }, { key: 'sy', label: 'σy', unit: 'MPa', slider: true, min: -300, max: 300, step: 1 }, { key: 'txy', label: 'τxy (ccw +)', unit: 'MPa', slider: true, min: -200, max: 200, step: 1 }, { key: 'Sy', label: 'Yield strength Sy (0 = skip check)', unit: 'MPa' }],
  compute: mohr, viz: mohrViz, refNote: "Validated: Shigley's MED Mohr's-circle example (σx = 80, τxy = 50 MPa cw → σ1 = 104, σ2 = −24, τmax = 64 MPa, θp = 25.7°).",
});

// ---------------- ISO 286 fits ----------------
function fitsViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, ph: 0 });
  const zone = s('svg', { viewBox: '0 0 300 300', width: 300 }), ass = s('svg', { viewBox: '0 0 340 300', width: 340 });
  el.append(row(zone, ass)); let z, shaftG, label;
  const draw = (o) => {
    z = o.viz; zone.replaceChildren(); ass.replaceChildren();
    const vals = [z.h.ES, z.h.EI, z.s.es, z.s.ei, 0]; const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.2 + 5;
    const Y = (u) => 260 - (u - (lo - pad)) / ((hi + pad) - (lo - pad)) * 230;
    zone.append(s('line', { x1: 30, x2: 290, y1: Y(0), y2: Y(0), stroke: '#1b2533', 'stroke-width': 2 }), s('text', { x: 32, y: Y(0) - 4, 'font-size': 10 }, t('zero line') + ` (Ø${z.D})`));
    zone.append(s('rect', { x: 70, y: Y(z.h.ES), width: 70, height: Y(z.h.EI) - Y(z.h.ES), fill: 'rgba(42,111,219,0.35)', stroke: '#2a6fdb' }), s('text', { x: 105, y: Y(z.h.ES) - 5, 'text-anchor': 'middle', 'font-size': 12, fill: '#2a6fdb', 'font-weight': 600 }, t('hole') + ' ' + v.holeL + v.holeG));
    zone.append(s('rect', { x: 170, y: Y(z.s.es), width: 70, height: Y(z.s.ei) - Y(z.s.es), fill: 'rgba(228,87,46,0.35)', stroke: '#e4572e' }), s('text', { x: 205, y: Y(z.s.es) - 5, 'text-anchor': 'middle', 'font-size': 12, fill: '#e4572e', 'font-weight': 600 }, t('shaft') + ' ' + v.shaftL + v.shaftG));
    for (const [x, u] of [[66, z.h.ES], [66, z.h.EI], [244, z.s.es], [244, z.s.ei]]) zone.append(s('text', { x, y: Y(u) + 4, 'text-anchor': x < 100 ? 'end' : 'start', 'font-size': 11 }, (u > 0 ? '+' : '') + u));
    zone.append(s('text', { x: 150, y: 290, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: z.type === 'clearance fit' ? '#0a7' : z.type === 'interference fit' ? '#c0392b' : '#b7791f' }, t(z.type) + ` (µm)`));
    // assembly: hole block + shaft sliding in (clearance exaggerated)
    const ex = 2.2; const cl = Math.max(-20, Math.min(30, (z.cmax + z.cmin) / 2)) * ex / 10; const holeR = 60, shaftR = holeR - cl;
    ass.append(s('rect', { x: 170, y: 150 - holeR - 50, width: 150, height: 50, fill: '#b8c3d1', stroke: '#34465c' }), s('rect', { x: 170, y: 150 + holeR, width: 150, height: 50, fill: '#b8c3d1', stroke: '#34465c' }), s('line', { x1: 170, x2: 320, y1: 150 - holeR, y2: 150 - holeR, stroke: '#34465c' }), s('line', { x1: 170, x2: 320, y1: 150 + holeR, y2: 150 + holeR, stroke: '#34465c' }));
    shaftG = s('g', {}, s('rect', { x: 0, y: 150 - shaftR, width: 170, height: 2 * shaftR, fill: '#e1b382', stroke: '#8a5a2b', rx: 6 }));
    ass.append(shaftG); label = s('text', { x: 10, y: 290, 'font-size': 11, fill: '#666' }, t('Assembly (radial gap exaggerated)'));
    ass.append(label);
  };
  draw(out);
  const loop = animLoop((dt) => { if (st.play) st.ph = (st.ph + dt * 0.25 * st.speed) % 1; const f = st.ph < 0.5 ? st.ph * 2 : 2 - st.ph * 2; const x = -40 + f * 150; shaftG.setAttribute('transform', `translate(${x},0)`); const press = z.cmin < 0 && x > 0; shaftG.firstChild.setAttribute('fill', press ? '#e4572e' : '#e1b382'); label.textContent = press ? t('Interference: press / shrink fit needed') : t('Assembly (radial gap exaggerated)'); });
  return { update: draw, stop: loop.stop };
}
const HOLES = ['H', 'JS', 'K', 'M', 'N', 'P', 'G', 'F', 'E', 'D'], SHAFTS = ['d', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p'], GR = [5, 6, 7, 8, 9, 10, 11];
export const fitsPage = makeCalcPage({
  id: 'mech-fits', group: 'mech', icon: '⊙', title: 'Limits and fits (ISO 286)', sub: 'Hole and shaft tolerance zones, limit deviations, clearance / interference and fit type, with an assembly animation.',
  defaults: { D: 25, holeL: 'H', holeG: 7, shaftL: 'g', shaftG: 6 },
  schema: [{ key: 'D', label: 'Nominal size D', unit: 'mm', slider: true, min: 1, max: 500, step: 1 }, { key: 'holeL', label: 'Hole deviation letter', type: 'select', options: HOLES.map(x => [x, x]) }, { key: 'holeG', label: 'Hole grade IT', type: 'select', numeric: true, options: GR.map(x => [x, 'IT' + x]) }, { key: 'shaftL', label: 'Shaft deviation letter', type: 'select', options: SHAFTS.map(x => [x, x]) }, { key: 'shaftG', label: 'Shaft grade IT', type: 'select', numeric: true, options: GR.map(x => [x, 'IT' + x]) }],
  compute: (v) => fits({ ...v, holeG: +v.holeG, shaftG: +v.shaftG }), viz: fitsViz,
  refNote: 'Validated against published ISO 286 values: IT grades, Ø25 H7/g6 (C_max 41, C_min 7 µm), H7/p6, N7, K7. Deviations come from the ISO 286 formulas; check critical fits against a licensed copy of the standard.',
});

// ---------------- bolted joint ----------------
function boltViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, ph: 0 });
  const sec = s('svg', { viewBox: '0 0 260 300', width: 260 }); const pb = h('div', {});
  el.append(row(sec, pb)); let z, pl, mb, mm, bolt, pA, pB, txt, maxF;
  const draw = (o) => {
    z = o.viz; pb.replaceChildren(); sec.replaceChildren();
    pl = createPlot(pb, { width: 380, height: 300, xLabel: t('deformation') + ' δ [µm]', yLabel: 'F [kN]', title: t('Joint diagram') });
    const db = z.Fi / z.kb * 1000, dm = z.Fi / z.km * 1000; // µm
    const Fmax = z.Fi + z.C * z.P; maxF = Fmax;
    pl.setRanges([0, (db + dm) * 1.15], [0, Math.max(Fmax, z.Fi) * 1.25 / 1000]);
    pl.setBackground([{ pts: [[0, 0], [db * 1.3, z.Fi * 1.3 / 1000]], color: '#e4572e', width: 2.2, label: t('bolt') + ' k_b' }, { pts: [[db - dm * 0.15, z.Fi * 1.15 / 1000], [db + dm, 0]], color: '#2a6fdb', width: 2.2, label: t('members') + ' k_m', labelAt: 0.7 }, { pts: [[0, z.Fi / 1000], [db + dm, z.Fi / 1000]], color: '#999', dash: '4 3', label: 'F_i' }]);
    mb = pl.marker(db, z.Fi / 1000, '#e4572e', 6); mm = pl.marker(db, z.Fi / 1000, '#2a6fdb', 6);
    // section
    sec.append(s('rect', { x: 40, y: 90, width: 180, height: 50, fill: '#c9d2dd', stroke: '#34465c' }), s('rect', { x: 40, y: 140, width: 180, height: 50, fill: '#b8c3d1', stroke: '#34465c' }));
    bolt = s('rect', { x: 118, y: 70, width: 24, height: 150, fill: '#999' });
    sec.append(bolt, s('rect', { x: 102, y: 56, width: 56, height: 16, fill: '#6b7a8f' }), s('rect', { x: 102, y: 218, width: 56, height: 16, fill: '#6b7a8f' }));
    pA = s('g', {}); pB = s('g', {}); txt = s('text', { x: 130, y: 290, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 });
    sec.append(pA, pB, txt, s('text', { x: 8, y: 16, 'font-size': 12, 'font-weight': 600 }, `M${z.d} × ${v.cls}, l = ${z.l} mm`));
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.ph = (st.ph + dt * 0.3 * st.speed) % 1; const f = 0.5 - 0.5 * Math.cos(2 * Math.PI * st.ph);
    const P = z.P * f, Fb = z.Fi + z.C * P, Fm = z.Fi - (1 - z.C) * P;
    const db = Fb / z.kb * 1000, dm0 = z.Fi / z.km * 1000, dmx = z.Fi / z.kb * 1000 + dm0;
    mb.setAttribute('cx', pl.X(db)); mb.setAttribute('cy', pl.Y(Fb / 1000));
    mm.setAttribute('cx', pl.X(dmx - Math.max(0, Fm) / z.km * 1000)); mm.setAttribute('cy', pl.Y(Math.max(0, Fm) / 1000));
    bolt.setAttribute('fill', thermal(Fb / (maxF * 1.05)));
    pA.replaceChildren(arrow(60, 85, 60, 85 - 40 * f), arrow(200, 85, 200, 85 - 40 * f)); pB.replaceChildren(arrow(60, 195, 60, 195 + 40 * f), arrow(200, 195, 200, 195 + 40 * f));
    txt.textContent = `P = ${fmt(P / 1000, 3)} kN → F_b = ${fmt(Fb / 1000, 4)} kN, F_m = ${fmt(-Fm / 1000, 4)} kN`;
  });
  return { update: draw, stop: loop.stop };
}
export const boltPage = makeCalcPage({
  id: 'mech-bolt', group: 'mech', icon: '🔩', title: 'Bolted joint (tension)', sub: 'Bolt and member stiffness (frustum), preload, tightening torque, yield, load, separation and fatigue factors — with the joint diagram animated as the external load cycles.',
  defaults: { d: 12, l: 40, cls: '8.8', Eb: 207, Em: 207, preMode: 'reuse', Fi: 30, K: 0.2, P: 10, nb: 1, fatigue: true, pitch: 1.75 },
  schema: [
    { key: 'd', label: 'Nominal diameter (metric coarse)', type: 'select', numeric: true, options: Object.keys(METRIC_COARSE).map(d => [d, 'M' + d])},
    { key: 'l', label: 'Grip length l', unit: 'mm', slider: true, min: 5, max: 200, step: 1 },
    { key: 'cls', label: 'Property class (ISO 898-1)', type: 'select', options: Object.keys(BOLT_CLASSES).map(c => [c, c]) },
    { key: 'Eb', label: 'Bolt modulus Eb', unit: 'GPa' }, { key: 'Em', label: 'Member modulus Em', unit: 'GPa' },
    { key: 'preMode', label: 'Preload', type: 'select', options: [['reuse', 'Reusable: Fi = 0.75 At Sp'], ['perm', 'Permanent: Fi = 0.90 At Sp'], ['value', 'Specified value']] },
    { key: 'Fi', label: 'Preload Fi', unit: 'kN', show: (v) => v.preMode === 'value' },
    { key: 'K', label: 'Torque coefficient K', unit: '' },
    { key: 'P', label: 'External tensile load (total)', unit: 'kN', slider: true, min: 0, max: 200, step: 0.5 },
    { key: 'nb', label: 'Number of bolts', unit: '' },
    { key: 'fatigue', label: 'Cyclic load 0 → P (fatigue check)', type: 'checkbox' },
  ],
  compute: (v) => boltedJoint({ ...v, d: +v.d }), viz: boltViz,
  refNote: 'Validated: tensile-stress areas M8–M20 (ISO 898-1 / Shigley Table 8-1), frustum member stiffness (Shigley eq. 8-22) and preload 0.75·At·Sp checked by hand.',
});

// ---------------- shaft ----------------
function shaftViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, a: 0 });
  const pic = s('svg', { viewBox: '0 0 330 200', width: 330 }); const pb = h('div', {});
  el.append(row(h('div', {}, pic), pb)); let z, dot, pl, stripes = [], trace, tr = [];
  const draw = (o) => {
    z = o.viz; pb.replaceChildren(); pic.replaceChildren(); stripes = [];
    pic.append(s('rect', { x: 20, y: 60, width: 150, height: 60, fill: '#c9d2dd', stroke: '#34465c' }), s('rect', { x: 170, y: 45, width: 140, height: 90, fill: '#c9d2dd', stroke: '#34465c' }), s('path', { d: 'M164,60 Q170,60 170,52', stroke: '#e4572e', fill: 'none', 'stroke-width': 3 }));
    for (let k = 0; k < 6; k++) { const l = s('line', { stroke: '#7d8ba0', 'stroke-width': 2 }); pic.append(l); stripes.push({ l, k }); }
    dot = s('circle', { r: 6, stroke: '#fff', 'stroke-width': 1.5 }); pic.append(dot);
    pic.append(s('text', { x: 20, y: 20, 'font-size': 12, 'font-weight': 600 }, `d = ${z.d} mm — ${t('point at the shoulder fillet')}`));
    trace = s('path', { stroke: '#e4572e', fill: 'none', 'stroke-width': 1.5 }); pic.append(s('line', { x1: 20, x2: 310, y1: 170, y2: 170, stroke: '#ccc' }), trace);
    pl = createPlot(pb, { width: 380, height: 300, xLabel: "σm' [MPa]", yLabel: "σa' [MPa]", title: t('Fatigue diagram (Goodman, Gerber, ASME, yield)') });
    const Sut = z.Sut, Sy = z.Sy, Se = z.Se; pl.setRanges([0, Sut * 1.05], [0, Math.max(Se, Sy) * 1.1]);
    const gerber = []; for (let k = 0; k <= 40; k++) { const m = Sut * k / 40; gerber.push([m, Se * (1 - (m / Sut) ** 2)]); }
    const asme = []; for (let k = 0; k <= 40; k++) { const m = Sy * k / 40; asme.push([m, Se * Math.sqrt(Math.max(0, 1 - (m / Sy) ** 2))]); }
    pl.setBackground([{ pts: [[0, Se], [Sut, 0]], color: '#e4572e', width: 2, label: 'Goodman', labelAt: 0.3 }, { pts: gerber, color: '#2a6fdb', label: 'Gerber', labelAt: 0.6 }, { pts: asme, color: '#0a7', dash: '6 3', label: 'ASME', labelAt: 0.8 }, { pts: [[0, Sy], [Sy, 0]], color: '#888', dash: '3 3', label: 'yield (Langer)', labelAt: 0.15 }, { pts: [[0, 0], [z.sm * 3, z.sa * 3]], color: '#1b2533', dash: '2 3' }]);
    pl.setPoints([{ x: z.sm, y: z.sa, label: `n = ${fmt(o.results.nG.v, 3)}`, color: '#1b2533' }]);
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.a = (st.a + dt * 3 * st.speed) % (2 * Math.PI);
    stripes.forEach(({ l, k }) => { const ph = st.a + k * Math.PI / 3; const y = 90 - 30 * Math.cos(ph); const vis = Math.sin(ph) > 0; l.setAttribute('x1', 20); l.setAttribute('x2', 170); l.setAttribute('y1', y); l.setAttribute('y2', y); l.setAttribute('opacity', vis ? 0.9 : 0.15); });
    const y = 90 - 30 * Math.cos(st.a); const sig = z.sm + z.sa * Math.cos(st.a);
    dot.setAttribute('cx', 166); dot.setAttribute('cy', y); dot.setAttribute('fill', thermal(0.5 + 0.5 * sig / Math.max(1e-9, Math.abs(z.sm) + Math.abs(z.sa))));
    tr.push(sig); if (tr.length > 290) tr.shift(); const mx = Math.abs(z.sm) + Math.abs(z.sa) || 1;
    trace.setAttribute('d', tr.map((q, i) => (i ? 'L' : 'M') + (20 + i) + ',' + (170 - 22 * q / mx).toFixed(1)).join(''));
  });
  return { update: draw, stop: loop.stop };
}
export const shaftPage = makeCalcPage({
  id: 'mech-shaft', group: 'mech', icon: '⟷', title: 'Shaft fatigue (DE criteria)', sub: 'Marin factors, stress concentration, DE-Goodman / Gerber / ASME-elliptic / Soderberg and first-cycle yield. A point at the fillet sees fully reversed bending as the shaft rotates.',
  defaults: { d: 28, Ma: 142.4, Mm: 0, Ta: 0, Tm: 124.3, Sut: 735, Sy: 574, surface: 'machined', rel: 99, Kf: 1.58, Kfs: 1.39, Kt: 0, Kts: 0, q: 0, qs: 0 },
  schema: [
    { key: 'd', label: 'Diameter d', unit: 'mm', slider: true, min: 5, max: 150, step: 0.5 },
    { key: 'Ma', label: 'Alternating moment Ma', unit: 'N·m', slider: true, min: 0, max: 2000, step: 0.1 }, { key: 'Mm', label: 'Mean moment Mm', unit: 'N·m' },
    { key: 'Ta', label: 'Alternating torque Ta', unit: 'N·m' }, { key: 'Tm', label: 'Mean torque Tm', unit: 'N·m', slider: true, min: 0, max: 2000, step: 0.1 },
    { key: 'Sut', label: 'Ultimate strength Sut', unit: 'MPa' }, { key: 'Sy', label: 'Yield strength Sy', unit: 'MPa' },
    { key: 'surface', label: 'Surface finish', type: 'select', options: [['ground', 'Ground'], ['machined', 'Machined / cold-drawn'], ['hotrolled', 'Hot-rolled'], ['forged', 'As forged']] },
    { key: 'rel', label: 'Reliability', type: 'select', numeric: true, options: [[50, '50 %'], [90, '90 %'], [95, '95 %'], [99, '99 %'], [99.9, '99.9 %'], [99.99, '99.99 %']] },
    { key: 'Kf', label: 'Kf bending (0 = from Kt, q)', unit: '' }, { key: 'Kfs', label: 'Kfs torsion (0 = from Kts, qs)', unit: '' },
    { key: 'Kt', label: 'Kt', unit: '', show: (v) => !(v.Kf > 0) }, { key: 'q', label: 'Notch sensitivity q', unit: '', show: (v) => !(v.Kf > 0) },
    { key: 'Kts', label: 'Kts', unit: '', show: (v) => !(v.Kfs > 0) }, { key: 'qs', label: 'Notch sensitivity qs', unit: '', show: (v) => !(v.Kfs > 0) },
  ],
  compute: (v) => shaft({ ...v, rel: +v.rel }), viz: shaftViz,
  refNote: "Validated: Shigley's MED shaft-shoulder example (d = 28 mm, M = 142.4 N·m, T = 124.3 N·m, Sut = 735 MPa, 99 %): Se ≈ 205 MPa, n_y ≈ 4.58.",
});

// ---------------- bearing ----------------
function bearingViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, a: 0 });
  const pic = s('svg', { viewBox: '0 0 260 260', width: 260 }); const pb = h('div', {});
  el.append(row(pic, pb)); let z, balls = [], cage, inner;
  const draw = (o) => {
    z = o.viz; pic.replaceChildren(); pb.replaceChildren(); balls = [];
    const cx = 130, cy = 125, Ro = 100, Ri = 62, Rb = 81, nb = 9;
    pic.append(s('circle', { cx, cy, r: Ro + 12, fill: '#b8c3d1', stroke: '#34465c' }), s('circle', { cx, cy, r: Ro, fill: '#f4f6f9', stroke: '#34465c' }));
    // load zone (±90° around the load direction, bottom)
    const lz = []; for (let k = 0; k <= 30; k++) { const a = Math.PI / 2 + (k / 30 - 0.5) * Math.PI; lz.push([cx + Ro * Math.cos(a), cy + Ro * Math.sin(a)]); }
    pic.append(s('path', { d: 'M' + lz.map(p => p.join(',')).join('L') + `L${cx},${cy}Z`, fill: 'rgba(228,87,46,0.15)' }));
    inner = s('g', {}, s('circle', { cx, cy, r: Ri, fill: '#c9d2dd', stroke: '#34465c' }), s('circle', { cx, cy, r: 30, fill: '#fff', stroke: '#34465c' }), s('line', { x1: cx, y1: cy - 30, x2: cx, y2: cy - Ri, stroke: '#34465c', 'stroke-width': 3 }));
    pic.append(inner);
    for (let k = 0; k < nb; k++) { const b = s('circle', { r: 15, stroke: '#34465c', 'stroke-width': 1.5 }); pic.append(b); balls.push({ b, k, nb, cx, cy, Rb }); }
    pic.append(arrow(cx, 10, cx, 26, '#e4572e', 3), s('text', { x: cx + 8, y: 18, 'font-size': 11, fill: '#e4572e' }, `P = ${fmt(z.P, 3)} kN`), s('text', { x: 8, y: 252, 'font-size': 11, fill: '#666' }, t('Rolling elements in the load zone carry the load (colour = load)')));
    const pl = createPlot(pb, { width: 380, height: 300, xLabel: 'P [kN]', yLabel: 'L10h [h]', yLog: true, title: t('Rating life vs. equivalent load') });
    const pexp = z.inp.type === 'ball' ? 3 : 10 / 3; const pts = []; for (let k = 1; k <= 60; k++) { const P = z.P * 3 * k / 60; pts.push([P, Math.pow(z.inp.C / P, pexp) * 1e6 / (60 * z.inp.n)]); }
    pl.fit([{ pts }]); pl.setBackground([{ pts, color: '#2a6fdb', width: 2, label: 'L10h' }, { pts: pts.map(p => [p[0], p[1] * z.Lnm / z.L10h]), color: '#0a7', dash: '5 3', label: 'Lnm', labelAt: 0.75 }]);
    const pts2 = [{ x: z.P, y: z.L10h, label: fmt(z.L10h, 3) + ' h' }]; if (z.inp.Lreq > 0) pts2.push({ x: z.P, y: z.inp.Lreq, label: t('required'), color: '#888', r: 4 });
    pl.setPoints(pts2);
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.a += dt * 2 * st.speed;
    inner.setAttribute('transform', `rotate(${st.a * 180 / Math.PI} 130 125)`);
    const cageA = st.a * 0.4;
    for (const q of balls) { const a = cageA + 2 * Math.PI * q.k / q.nb; const x = q.cx + q.Rb * Math.cos(a), y = q.cy + q.Rb * Math.sin(a); q.b.setAttribute('cx', x); q.b.setAttribute('cy', y); const c = Math.sin(a); q.b.setAttribute('fill', c > 0 ? thermal(0.5 + 0.5 * Math.pow(c, 1.5)) : '#d8dee6'); }
  });
  return { update: draw, stop: loop.stop };
}
export const bearingPage = makeCalcPage({
  id: 'mech-bearing', group: 'mech', icon: '◎', title: 'Rolling bearing life (ISO 281)', sub: 'Equivalent dynamic load (deep-groove X, Y table), basic rating life L10, reliability factor a1 and modified life, plus required dynamic capacity.',
  defaults: { type: 'ball', C: 30.7, C0: 19, Fr: 3, Fa: 0, X: 1, Y: 0, autoXY: true, n: 1000, rel: 90, aISO: 1, Lreq: 20000 },
  schema: [
    { key: 'type', label: 'Bearing type', type: 'select', options: [['ball', 'Ball bearing (p = 3)'], ['roller', 'Roller bearing (p = 10/3)']] },
    { key: 'C', label: 'Basic dynamic load rating C', unit: 'kN' }, { key: 'C0', label: 'Basic static load rating C0', unit: 'kN' },
    { key: 'Fr', label: 'Radial load Fr', unit: 'kN', slider: true, min: 0, max: 50, step: 0.1 }, { key: 'Fa', label: 'Axial load Fa', unit: 'kN', slider: true, min: 0, max: 20, step: 0.1 },
    { key: 'autoXY', label: 'X, Y from deep-groove table', type: 'checkbox', show: (v) => v.type === 'ball' },
    { key: 'X', label: 'X', unit: '', show: (v) => !(v.autoXY && v.type === 'ball') }, { key: 'Y', label: 'Y', unit: '', show: (v) => !(v.autoXY && v.type === 'ball') },
    { key: 'n', label: 'Speed n', unit: 'rpm', slider: true, min: 10, max: 10000, step: 10 },
    { key: 'rel', label: 'Reliability (a1)', type: 'select', numeric: true, options: [[90, '90 %'], [95, '95 %'], [96, '96 %'], [97, '97 %'], [98, '98 %'], [99, '99 %']] },
    { key: 'aISO', label: 'Life modification factor a_ISO', unit: '' }, { key: 'Lreq', label: 'Required life (0 = none)', unit: 'h' },
  ],
  compute: (v) => bearing({ ...v, rel: +v.rel }), viz: bearingViz,
  refNote: 'Validated: L10 = (C/P)^p and L10h checked analytically; reliability factor a1 = 0.25 at 99 % (ISO 281:2007 Table 12).',
});

// ---------------- spur gear ----------------
function gearPath(m, z, al, cx, cy) {
  const r = m * z / 2, rb = r * Math.cos(al), ra = r + m, rf = Math.max(0.2 * r, r - 1.25 * m);
  const inv = (a) => Math.tan(a) - a; const half = Math.PI / (2 * z) + inv(al);
  const psi = (rho) => half - inv(Math.acos(Math.min(1, rb / rho)));
  const r0 = Math.max(rb, rf); const prof = []; for (let k = 0; k <= 8; k++) { const rho = r0 + (ra - r0) * k / 8; prof.push([rho, psi(rho)]); }
  let d = '';
  for (let i = 0; i < z; i++) {
    const c = 2 * Math.PI * i / z; const P = (rho, a) => `${(cx + rho * Math.cos(a)).toFixed(2)},${(cy + rho * Math.sin(a)).toFixed(2)}`;
    const a0 = c - psi(r0);
    d += (i ? 'L' : 'M') + P(rf, a0) + 'L' + P(r0, a0);
    prof.forEach(([rho, p]) => d += 'L' + P(rho, c - p));
    [...prof].reverse().forEach(([rho, p]) => d += 'L' + P(rho, c + p));
    d += 'L' + P(rf, c + psi(r0));
    const next = 2 * Math.PI * (i + 1) / z - psi(r0); d += `A${rf},${rf} 0 0 1 ${P(rf, next)}`;
  }
  return d + 'Z';
}
function gearViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, a: 0 });
  const pic = s('svg', { viewBox: '0 0 560 320', width: '100%' }); el.append(pic); let z, g1, g2, c1, c2, sc;
  const draw = (o) => {
    z = o.viz; pic.replaceChildren();
    const r1 = z.m * z.z1 / 2, r2 = z.m * z.z2 / 2; sc = Math.min(250 / (r1 + r2 + 2 * z.m), 140 / (r2 + z.m), 140 / (r1 + z.m));
    c1 = [280 - (r1 + r2) * sc / 2 - 0, 160]; c2 = [c1[0] + (r1 + r2) * sc, 160];
    // shift whole pair to centre
    const shift = 280 - (c1[0] - r1 * sc + c2[0] + r2 * sc) / 2; c1[0] += shift; c2[0] += shift;
    g1 = s('g', {}, s('path', { d: gearPath(z.m * sc, z.z1, z.al, 0, 0), fill: '#e1b382', stroke: '#8a5a2b', 'stroke-width': 1 }), s('circle', { r: r1 * sc * 0.25, fill: '#fff', stroke: '#8a5a2b' }), s('line', { x1: 0, y1: 0, x2: r1 * sc * 0.7, y2: 0, stroke: '#8a5a2b', 'stroke-width': 2 }));
    g2 = s('g', {}, s('path', { d: gearPath(z.m * sc, z.z2, z.al, 0, 0), fill: '#b8c3d1', stroke: '#34465c', 'stroke-width': 1 }), s('circle', { r: r2 * sc * 0.15, fill: '#fff', stroke: '#34465c' }), s('line', { x1: 0, y1: 0, x2: -r2 * sc * 0.8, y2: 0, stroke: '#34465c', 'stroke-width': 2 }));
    const P = [c1[0] + r1 * sc, 160]; const L = 120; const la = z.al;
    pic.append(g1, g2,
      s('circle', { cx: c1[0], cy: 160, r: r1 * sc, fill: 'none', stroke: '#999', 'stroke-dasharray': '3 3' }), s('circle', { cx: c2[0], cy: 160, r: r2 * sc, fill: 'none', stroke: '#999', 'stroke-dasharray': '3 3' }),
      s('line', { x1: P[0] - L * Math.sin(la), y1: P[1] - L * Math.cos(la), x2: P[0] + L * Math.sin(la), y2: P[1] + L * Math.cos(la), stroke: '#e4572e', 'stroke-width': 1.5, 'stroke-dasharray': '6 3' }),
      s('text', { x: P[0] + L * Math.sin(la) + 4, y: P[1] + L * Math.cos(la), 'font-size': 11, fill: '#e4572e' }, t('line of action') + ` (${v.alpha}°)`),
      arrow(P[0], P[1], P[0], P[1] - 50, '#1b2533', 2.5), s('text', { x: P[0] + 6, y: P[1] - 46, 'font-size': 11 }, `W_t = ${fmt(z.Wt, 4)} N`),
      s('text', { x: 10, y: 18, 'font-size': 12, 'font-weight': 600 }, `z1 = ${z.z1}, z2 = ${z.z2}, m = ${fmt(z.m, 4)} mm, i = ${fmt(z.i, 4)}, a = ${fmt(z.a, 4)} mm`));
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.a += dt * 0.6 * st.speed;
    const a1 = st.a, a2 = -st.a * z.z1 / z.z2 + Math.PI + (z.z2 % 2 ? 0 : Math.PI / z.z2);
    g1.setAttribute('transform', `translate(${c1[0]},${c1[1]}) rotate(${a1 * 180 / Math.PI})`); g2.setAttribute('transform', `translate(${c2[0]},${c2[1]}) rotate(${a2 * 180 / Math.PI})`);
  });
  return { update: draw, stop: loop.stop };
}
export const gearPage = makeCalcPage({
  id: 'mech-gear', group: 'mech', icon: '⚙', title: 'Spur gear pair (Lewis)', sub: 'Geometry, contact ratio, transmitted and radial loads, Lewis bending stress with Barth dynamic factor, and the power rating — with involute gears meshing.',
  defaults: { m: 3, z1: 20, z2: 40, alpha: 20, b: 30, P: 5, n1: 1500, Sy: 300, nd: 2, profile: 'cut' },
  schema: [
    { key: 'm', label: 'Module m', unit: 'mm', slider: true, min: 0.5, max: 12, step: 0.25 }, { key: 'z1', label: 'Pinion teeth z1', unit: '', slider: true, min: 12, max: 60, step: 1 }, { key: 'z2', label: 'Gear teeth z2', unit: '', slider: true, min: 12, max: 150, step: 1 },
    { key: 'alpha', label: 'Pressure angle', type: 'select', numeric: true, options: [[20, '20°'], [25, '25°']] }, { key: 'b', label: 'Face width b', unit: 'mm' },
    { key: 'P', label: 'Transmitted power', unit: 'kW', slider: true, min: 0.1, max: 100, step: 0.1 }, { key: 'n1', label: 'Pinion speed n1', unit: 'rpm' },
    { key: 'Sy', label: 'Allowable / yield strength', unit: 'MPa' }, { key: 'nd', label: 'Design factor n_d', unit: '' },
    { key: 'profile', label: 'Tooth profile (Barth Kv)', type: 'select', options: [['cut', 'Cut or milled'], ['cast', 'Cast iron, cast profile'], ['hobbed', 'Hobbed or shaped']] },
  ],
  compute: (v) => spurGear({ ...v, alpha: +v.alpha }), viz: gearViz, rebuildOn: ['z1', 'z2', 'm', 'alpha'],
  refNote: "Validated: Shigley's MED Lewis-equation example (16 teeth, P = 8 teeth/in, F = 1.5 in, 1200 rev/min, n_d = 3, cut teeth → 6.93 hp) and the analytic contact ratio.",
});

// ---------------- spring ----------------
function springViz(el, out, v, ctl) {
  const st = playCtl(ctl, { play: true, speed: 1, ph: 0 });
  const pic = s('svg', { viewBox: '0 0 200 320', width: 200 }); const pb = h('div', {});
  el.append(row(pic, pb)); let z, coil, plate, mk, pl, txt;
  const draw = (o) => {
    z = o.viz; pic.replaceChildren(); pb.replaceChildren();
    pic.append(s('rect', { x: 30, y: 290, width: 140, height: 12, fill: '#6b7a8f' }));
    coil = s('path', { fill: 'none', stroke: '#2a6fdb', 'stroke-linecap': 'round' }); plate = s('rect', { x: 30, width: 140, height: 12, fill: '#6b7a8f' }); txt = s('text', { x: 100, y: 16, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 });
    pic.append(coil, plate, txt);
    pl = createPlot(pb, { width: 380, height: 300, xLabel: 'y [mm]', yLabel: 'F [N]', title: t('Spring characteristic') });
    const ys = z.L0 - z.Ls; pl.setRanges([0, ys * 1.1], [0, z.k * ys * 1.15]);
    pl.setBackground([{ pts: [[0, 0], [ys, z.k * ys]], color: '#2a6fdb', width: 2, label: 'F = k·y' }]);
    pl.setPoints([{ x: z.y, y: z.F, label: t('working'), color: '#e4572e' }, { x: ys, y: z.k * ys, label: t('solid'), color: '#888', r: 4 }]);
    mk = pl.marker(0, 0, '#1b2533', 6);
  };
  draw(out);
  const loop = animLoop((dt) => {
    if (st.play) st.ph = (st.ph + dt * 0.35 * st.speed) % 1; const f = 0.5 - 0.5 * Math.cos(2 * Math.PI * st.ph);
    const y = z.y * 1.0 * f + (st.ph > 0.999 ? 0 : 0); const L = z.L0 - y;
    const sc = 250 / z.L0, Hh = L * sc, base = 290, R = Math.min(60, z.D / 2 * sc * 1.0 + 10), w = Math.max(1.5, z.d * sc);
    let d = ''; const n = z.Nt, N = 240; for (let k = 0; k <= N; k++) { const ph = k / N * n * 2 * Math.PI; const x = 100 + R * Math.sin(ph); const yy = base - (k / N) * Hh; d += (k ? 'L' : 'M') + x.toFixed(1) + ',' + yy.toFixed(1); }
    coil.setAttribute('d', d); coil.setAttribute('stroke-width', w); coil.setAttribute('stroke', thermal(0.3 + 0.7 * (y * z.k) / Math.max(1e-9, z.Ssy * Math.PI * z.d ** 3 / (8 * z.D) )));
    plate.setAttribute('y', base - Hh - 12); txt.textContent = `F = ${fmt(z.k * y, 3)} N, L = ${fmt(L, 3)} mm`;
    mk.setAttribute('cx', pl.X(y)); mk.setAttribute('cy', pl.Y(z.k * y));
  });
  return { update: draw, stop: loop.stop };
}
export const springPage = makeCalcPage({
  id: 'mech-spring', group: 'mech', icon: '〰', title: 'Helical compression spring', sub: 'Rate, Bergsträsser-corrected shear stress, minimum tensile strength (A/d^m), safety at working load and when closed solid, free/solid length, buckling and natural frequency.',
  defaults: { mat: 'Music wire A228', d: 2, D: 16, Na: 10, ends: 'squaredGround', F: 50, L0: 0, fixed: true },
  schema: [
    { key: 'mat', label: 'Wire material', type: 'select', options: Object.keys(SPRING_MAT).map(k => [k, k]) },
    { key: 'd', label: 'Wire diameter d', unit: 'mm', slider: true, min: 0.2, max: 12, step: 0.05 }, { key: 'D', label: 'Mean coil diameter D', unit: 'mm', slider: true, min: 2, max: 120, step: 0.5 },
    { key: 'Na', label: 'Active coils Na', unit: '', slider: true, min: 2, max: 30, step: 0.5 },
    { key: 'ends', label: 'End type', type: 'select', options: [['plain', 'Plain'], ['plainGround', 'Plain and ground'], ['squared', 'Squared (closed)'], ['squaredGround', 'Squared and ground']] },
    { key: 'F', label: 'Working force F', unit: 'N', slider: true, min: 1, max: 2000, step: 1 }, { key: 'L0', label: 'Free length L0 (0 = auto)', unit: 'mm' },
    { key: 'fixed', label: 'Ends on parallel flat plates (buckling)', type: 'checkbox' },
  ],
  compute: spring, viz: springViz,
  refNote: 'Validated: rate k = d⁴G/(8D³Na) and the Bergsträsser-corrected shear stress checked analytically (Shigley ch. 10).',
});

export const MECH_PAGES = [mohrPage, fitsPage, boltPage, shaftPage, bearingPage, gearPage, springPage];
