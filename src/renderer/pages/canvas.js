// System canvas: drag-and-drop flowsheet → generated equations → solver → animated flow, live property diagrams, sweeps.
import { h, s, tabs, debounce, toast, fmt, thermal, legendBar, animLoop, eqStepsView, buildForm } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { COMPONENTS, TEMPLATES, solveFlowsheet, newComponent, resetIds } from '../../thermo/flowsheet.js';
import { FLUIDS, settings as propSettings } from '../../core/props.js';
import { buildSteps } from '../../core/steps.js';
import { propertyDiagram, drawCycle } from '../diagrams.js';
import { createPlot } from '../svgplot.js';
import { tableHTML, figHTML } from '../report.js';

const PRANGE = { pump: [50, 25000], compressor: [100, 5000], turbine: [1, 5000], valve: [20, 2000] };
function paramSchema(c, fluid) {
  const p = c.params; const ty = c.type;
  const sch = [];
  if (['pump', 'compressor', 'turbine', 'valve'].includes(ty)) {
    sch.push({ key: 'Pspec', label: 'Outlet pressure set by', type: 'select', options: [['P', 'Pressure'], ['Tsat', 'Saturation temperature'], ['ratio', 'Pressure ratio P_out/P_in']] });
    sch.push({ key: 'P', label: 'Outlet pressure', unit: 'kPa', slider: true, min: PRANGE[ty][0], max: PRANGE[ty][1], step: 1, show: (v) => v.Pspec === 'P' });
    sch.push({ key: 'Tsat', label: 'Outlet saturation temperature', unit: '°C', slider: true, min: -40, max: 300, step: 0.5, show: (v) => v.Pspec === 'Tsat' });
    sch.push({ key: 'ratio', label: 'Pressure ratio', unit: '', slider: true, min: ty === 'turbine' || ty === 'valve' ? 0.01 : 1.2, max: ty === 'turbine' || ty === 'valve' ? 0.95 : 40, step: 0.01, show: (v) => v.Pspec === 'ratio' });
    if (ty !== 'valve') sch.push({ key: 'eta', label: 'Isentropic efficiency', unit: '', slider: true, min: 0.3, max: 1, step: 0.01 });
  } else if (['boiler', 'heater', 'condenser', 'evaporator', 'cooler'].includes(ty)) {
    sch.push({ key: 'spec', label: 'Outlet condition', type: 'select', options: [['T', 'Outlet temperature'], ['x', 'Outlet quality'], ['dT', ty === 'condenser' || ty === 'cooler' ? 'Subcooling ΔT' : 'Superheat ΔT'], ['Q', 'Heat rate']] });
    const hot = ty === 'boiler' || ty === 'heater';
    sch.push({ key: 'T', label: 'Outlet temperature', unit: '°C', slider: true, min: hot ? 50 : -50, max: ty === 'heater' ? 1600 : hot ? 700 : 100, step: 1, show: (v) => v.spec === 'T' });
    sch.push({ key: 'x', label: 'Outlet quality', unit: '', slider: true, min: 0, max: 1, step: 0.01, show: (v) => v.spec === 'x' });
    sch.push({ key: 'dT', label: 'ΔT from saturation', unit: 'K', slider: true, min: 0, max: 40, step: 0.5, show: (v) => v.spec === 'dT' });
    sch.push({ key: 'Q', label: 'Heat rate (+ in)', unit: 'kW', show: (v) => v.spec === 'Q' });
    sch.push({ key: 'dP', label: 'Pressure drop', unit: 'kPa' });
  } else if (ty === 'splitter') {
    sch.push({ key: 'yMode', label: 'Fraction to branch 1', type: 'select', options: [['auto', 'Solve from mixer condition'], ['fixed', 'Fixed value']] });
    sch.push({ key: 'y', label: 'Fraction y', unit: '', slider: true, min: 0, max: 1, step: 0.005, show: (v) => v.yMode === 'fixed' });
  } else if (ty === 'mixer') sch.push({ key: 'outSpec', label: 'Outlet', type: 'select', options: [['satliq', 'Saturated liquid (open FWH)'], ['none', 'Adiabatic mixing']] });
  else if (ty === 'regenerator') sch.push({ key: 'eps', label: 'Effectiveness ε', unit: '', slider: true, min: 0, max: 0.98, step: 0.01 });
  return sch;
}

// ---- component symbols ----
function symbol(c) {
  const g = s('g', {});
  const st = { class: 'body', fill: '#fff', stroke: '#34465c', 'stroke-width': 2 };
  const rot = s('g', { class: 'rotor' });
  switch (c.type) {
    case 'pump': g.append(s('circle', { r: 24, ...st }), rot); rot.append(s('path', { d: 'M-12,-6 L12,0 L-12,6 Z', fill: '#2c6fbb' }), s('circle', { r: 3, fill: '#34465c' })); break;
    case 'compressor': g.append(s('path', { d: 'M-34,-30 L34,-14 L34,14 L-34,30 Z', ...st }), rot); for (let k = 0; k < 4; k++) rot.append(s('line', { x1: 0, y1: 0, x2: 14 * Math.cos(k * Math.PI / 2), y2: 14 * Math.sin(k * Math.PI / 2), stroke: '#2c6fbb', 'stroke-width': 3, 'stroke-linecap': 'round' })); break;
    case 'turbine': g.append(s('path', { d: 'M-34,-14 L34,-30 L34,30 L-34,14 Z', ...st }), rot); for (let k = 0; k < 6; k++) rot.append(s('path', { d: `M0,0 Q${8 * Math.cos(k * 1.047 + 0.6)},${8 * Math.sin(k * 1.047 + 0.6)} ${16 * Math.cos(k * 1.047)},${16 * Math.sin(k * 1.047)}`, stroke: '#c0392b', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' })); break;
    case 'boiler': case 'heater': g.append(s('rect', { x: -40, y: -24, width: 80, height: 48, rx: 6, ...st }), s('path', { class: 'flame', d: 'M-22,14 Q-18,-2 -12,8 Q-8,-12 0,6 Q6,-14 12,8 Q18,-4 22,14 Z', fill: '#ff8c1a', opacity: 0.9 })); break;
    case 'condenser': case 'cooler': g.append(s('rect', { x: -40, y: -24, width: 80, height: 48, rx: 6, ...st }), s('path', { d: 'M-30,0 l6,-10 l8,20 l8,-20 l8,20 l8,-20 l8,20 l8,-20 l6,10', fill: 'none', stroke: '#2c6fbb', 'stroke-width': 2.5 })); break;
    case 'evaporator': g.append(s('rect', { x: -40, y: -24, width: 80, height: 48, rx: 6, ...st, fill: '#eef7ff' }), s('path', { d: 'M-30,0 l6,-10 l8,20 l8,-20 l8,20 l8,-20 l8,20 l8,-20 l6,10', fill: 'none', stroke: '#5fb3e6', 'stroke-width': 2.5 }), s('text', { x: 0, y: -12, 'text-anchor': 'middle', 'font-size': 10, fill: '#5fb3e6' }, '❄')); break;
    case 'valve': g.append(s('path', { d: 'M-16,-22 L16,-22 L-16,22 L16,22 Z', ...st }), s('line', { x1: 0, y1: 0, x2: 22, y2: 0, stroke: '#34465c', 'stroke-width': 2 }), s('rect', { x: 22, y: -6, width: 10, height: 12, fill: '#34465c' })); break;
    case 'splitter': g.append(s('circle', { r: 10, ...st, fill: '#34465c' })); break;
    case 'mixer': g.append(s('rect', { x: -30, y: -26, width: 60, height: 52, rx: 8, ...st }), s('text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#34465c' }, 'FWH')); break;
    case 'regenerator': g.append(s('rect', { x: -36, y: -30, width: 72, height: 60, rx: 6, ...st }), s('line', { x1: -30, y1: 0, x2: 30, y2: 0, stroke: '#cfd7e2', 'stroke-width': 2 }), s('path', { d: 'M24,-18 L-24,-18 m6,-5 l-6,5 l6,5', stroke: '#c0392b', fill: 'none', 'stroke-width': 2 }), s('path', { d: 'M-24,18 L24,18 m-6,-5 l6,5 l-6,5', stroke: '#2c6fbb', fill: 'none', 'stroke-width': 2 })); break;
  }
  return { g, rot };
}
function iconFor(type) { const sv = s('svg', { width: 34, height: 26, viewBox: '-42 -32 84 64' }); sv.append(symbol({ type }).g); return sv; }

export function makeCanvasPage() {
  const page = { id: 'canvas', group: 'thermo', icon: '⚙', title: 'System canvas', fs: TEMPLATES.rankine(), res: null, sel: null, diagTypes: ['Ts', 'Ph'], sweep: null };
  resetIds(page.fs);
  page.serialize = () => ({ fs: page.fs, diagTypes: page.diagTypes });
  page.load = (d) => { page.fs = d.fs; resetIds(page.fs); page.diagTypes = d.diagTypes || page.diagTypes; page.res = null; };
  page.reset = () => { page.fs = TEMPLATES.rankine(); page.res = null; };
  page.solveNow = () => { page.res = solveFlowsheet(page.fs); return page.res; };
  page.render = (main) => {
    const fsv = page.fs;
    const svg = s('svg', { class: 'fs-canvas', viewBox: '0 0 760 520' });
    const gStreams = s('g', {}), gParticles = s('g', {}), gComps = s('g', {}), gLabels = s('g', {}), gTemp = s('g', {});
    svg.append(s('defs', {}, s('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#9aa9bb' }))), gStreams, gParticles, gComps, gLabels, gTemp);
    const inspector = h('div', { class: 'inspector' });
    const perf = h('div', {}), stateBox = h('div', { class: 'scroll' }), stepsBox = h('div', {}), eqBox = h('div', {}), sweepBox = h('div', {}), msgBox = h('div', { class: 'msgs' });
    const diagBoxes = [h('div', {}), h('div', {})]; const diagState = [null, null];
    const legend = h('div', {});
    const portPos = (c, name) => { const p = COMPONENTS[c.type].ports.find(q => q[0] === name); return [c.x + p[2], c.y + p[3], p[2], p[3]]; };
    const streamPath = (st) => {
      const a = fsv.components.find(c => c.id === st.from[0]), b = fsv.components.find(c => c.id === st.to[0]); if (!a || !b) return '';
      const [x1, y1, dx1, dy1] = portPos(a, st.from[1]), [x2, y2, dx2, dy2] = portPos(b, st.to[1]);
      const dir = (dx, dy) => Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
      const [ux1, uy1] = dir(dx1, dy1), [ux2, uy2] = dir(dx2, dy2);
      const L = Math.max(40, Math.hypot(x2 - x1, y2 - y1) * 0.4);
      return `M${x1},${y1} C${x1 + ux1 * L},${y1 + uy1 * L} ${x2 + ux2 * L},${y2 + uy2 * L} ${x2},${y2}`;
    };
    let particles = [];
    const pathEls = new Map(), rotors = new Map();
    const draw = () => {
      gStreams.replaceChildren(); gComps.replaceChildren(); gLabels.replaceChildren(); pathEls.clear(); rotors.clear();
      for (const st of fsv.streams) {
        const p = s('path', { d: streamPath(st), class: 'stream' + (page.sel === 's' + st.id ? ' sel' : ''), 'marker-end': 'url(#arr)', onpointerdown: (e) => { e.stopPropagation(); select('s' + st.id); } });
        gStreams.append(p); pathEls.set(st.id, p);
      }
      for (const c of fsv.components) {
        const { g, rot } = symbol(c);
        const grp = s('g', { class: 'comp' + (page.sel === c.id ? ' sel' : ''), transform: `translate(${c.x},${c.y})` }, g, s('text', { x: 0, y: c.type === 'splitter' ? -16 : (c.type === 'valve' ? -28 : 42), 'text-anchor': 'middle', class: 'lbl' }, t(COMPONENTS[c.type].label.split(' /')[0]) + ' ' + (c.id.match(/\d+$/)?.[0] || '')));
        rotors.set(c.id, rot);
        grp.addEventListener('pointerdown', (e) => startDrag(e, c));
        for (const [name, dir, dx, dy] of COMPONENTS[c.type].ports) {
          const port = s('circle', { cx: dx, cy: dy, r: 5, class: 'port', fill: dir === 'in' ? '#2c6fbb' : '#e4572e', stroke: '#fff', 'stroke-width': 1.5 });
          port.addEventListener('pointerdown', (e) => { e.stopPropagation(); startConnect(e, c, name, dir); });
          port.dataset.comp = c.id; port.dataset.port = name; port.dataset.dir = dir;
          grp.append(port);
        }
        gComps.append(grp);
      }
      drawLabels();
      initParticles();
    };
    const stateOf = (id) => page.res?.states?.find(x => x.id === id);
    const drawLabels = () => {
      gLabels.replaceChildren();
      for (const st of fsv.streams) {
        const p = pathEls.get(st.id); if (!p) continue; const L = p.getTotalLength(); const m = p.getPointAtLength(L * 0.5);
        const S = stateOf(st.id);
        gLabels.append(s('g', { class: 'badge', transform: `translate(${m.x},${m.y})` }, s('rect', { x: -9, y: -9, width: 18, height: 18, rx: 9 }), s('text', { x: 0, y: 4, 'text-anchor': 'middle' }, st.id)));
        if (S) gLabels.append(s('text', { x: m.x + 12, y: m.y - 8, class: 'slabel' }, `${fmt(S.T - 273.15, 4)} °C · ${fmt(S.P / 1000, 4)} kPa${Number.isFinite(S.x) ? ' · x=' + S.x.toFixed(3) : ''}`));
      }
      if (page.res?.ok) for (const c of fsv.components) {
        const W = page.res.values['W_dot_' + c.id], Q = page.res.values['Q_dot_' + c.id];
        const txt = W !== undefined ? `Ẇ = ${fmt(W / 1000, 4)} kW` : Q !== undefined && c.type !== 'regenerator' ? `Q̇ = ${fmt(Q / 1000, 4)} kW` : Q !== undefined ? `Q̇ = ${fmt(Q / 1000, 4)} kW` : null;
        if (txt) gLabels.append(s('text', { x: c.x, y: c.y + (c.type === 'valve' ? 40 : 56), 'text-anchor': 'middle', class: 'slabel', fill: W !== undefined ? '#6f42c1' : (Q > 0 ? '#c0392b' : '#2c6fbb') }, txt));
      }
    };
    // ---- particles ----
    let Trange = [300, 400], vrange = [1e-3, 1];
    const initParticles = () => {
      gParticles.replaceChildren(); particles = [];
      if (page.res?.states) { const Ts = page.res.states.map(x => x.T).filter(Number.isFinite), vs = page.res.states.map(x => x.v).filter(v => v > 0); Trange = [Math.min(...Ts), Math.max(...Ts)]; vrange = [Math.min(...vs), Math.max(...vs)]; legend.replaceChildren(legendBar(Trange[0] - 273.15, Trange[1] - 273.15, '°C')); }
      for (const st of fsv.streams) {
        const p = pathEls.get(st.id); if (!p) continue; const L = p.getTotalLength(); const n = Math.max(3, Math.round(L / 26));
        const S = stateOf(st.id);
        for (let k = 0; k < n; k++) {
          const two = S && Number.isFinite(S.x); const vap = S && (S.phase?.includes('vapor') || S.phase?.includes('gas') || S.phase?.includes('supercritical') || (two && Math.random() < S.x));
          const el = s('circle', { r: vap ? 4.2 : 2.8, class: 'particle', fill: S ? thermal((S.T - Trange[0]) / Math.max(1e-9, Trange[1] - Trange[0])) : '#9aa9bb', opacity: vap ? 0.75 : 1, stroke: vap ? '#fff' : 'none', 'stroke-width': 0.8 });
          gParticles.append(el); particles.push({ el, st, path: p, L, u: k / n, speed: S ? 25 + 70 * norm(Math.log(S.v), Math.log(vrange[0]), Math.log(vrange[1])) : 30 });
        }
      }
    };
    const norm = (v, a, b) => b > a ? (v - a) / (b - a) : 0.5;
    const loop = animLoop((dt, time) => {
      for (const pt of particles) { pt.u = (pt.u + pt.speed * dt / pt.L) % 1; const q = pt.path.getPointAtLength(pt.u * pt.L); pt.el.setAttribute('cx', q.x); pt.el.setAttribute('cy', q.y); }
      if (page.res?.ok) for (const c of fsv.components) { const r = rotors.get(c.id); const W = page.res.values['W_dot_' + c.id]; if (r && W !== undefined) { c._ang = ((c._ang || 0) + dt * (60 + Math.min(600, Math.abs(W) / 1000 * 0.4))) % 360; r.setAttribute('transform', `rotate(${c._ang})`); } }
      document.querySelectorAll('.flame').forEach((f, i) => f.setAttribute('transform', `scale(1,${0.85 + 0.15 * Math.sin(time * 9 + i)})`));
      if (tween) tween(performance.now());
    });
    // ---- interaction ----
    const svgPt = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    const startDrag = (e, c) => {
      e.stopPropagation(); select(c.id);
      const p0 = svgPt(e), x0 = c.x, y0 = c.y;
      const mv = (ev) => { const p = svgPt(ev); c.x = Math.round(x0 + p.x - p0.x); c.y = Math.round(y0 + p.y - p0.y); draw(); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    };
    const startConnect = (e, c, port, dir) => {
      const [x0, y0] = portPos(c, port);
      const line = s('line', { x1: x0, y1: y0, x2: x0, y2: y0, stroke: '#e4572e', 'stroke-width': 2, 'stroke-dasharray': '5 4' }); gTemp.append(line);
      const mv = (ev) => { const p = svgPt(ev); line.setAttribute('x2', p.x); line.setAttribute('y2', p.y); };
      const up = (ev) => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); line.remove();
        const tgt = document.elementFromPoint(ev.clientX, ev.clientY);
        if (tgt?.classList?.contains('port') && tgt.dataset.dir !== dir) {
          const from = dir === 'out' ? [c.id, port] : [tgt.dataset.comp, tgt.dataset.port];
          const to = dir === 'out' ? [tgt.dataset.comp, tgt.dataset.port] : [c.id, port];
          fsv.streams = fsv.streams.filter(s1 => !(s1.from[0] === from[0] && s1.from[1] === from[1]) && !(s1.to[0] === to[0] && s1.to[1] === to[1]));
          const id = Math.max(0, ...fsv.streams.map(s1 => s1.id)) + 1;
          fsv.streams.push({ id, from, to }); fsv.streams.sort((a, b) => a.id - b.id);
          if (!fsv.massFlow || !fsv.streams.find(x => x.id === fsv.massFlow.stream)) fsv.massFlow = { stream: id, value: fsv.massFlow?.value ?? 1 };
          draw(); resolve();
        }
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    };
    svg.addEventListener('pointerdown', () => select(null));
    svg.addEventListener('dragover', (e) => e.preventDefault());
    svg.addEventListener('drop', (e) => { e.preventDefault(); const ty = e.dataTransfer.getData('text/comp'); if (!COMPONENTS[ty]) return; const p = svgPt(e); const c = newComponent(ty, Math.round(p.x), Math.round(p.y)); fsv.components.push(c); select(c.id); draw(); resolve(); });
    const keyH = (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && page.sel && document.activeElement?.tagName !== 'INPUT') { deleteSel(); } };
    window.addEventListener('keydown', keyH);
    const deleteSel = () => {
      if (!page.sel) return;
      if (page.sel.startsWith('s') && !fsv.components.find(c => c.id === page.sel)) { const id = +page.sel.slice(1); fsv.streams = fsv.streams.filter(x => x.id !== id); }
      else { fsv.components = fsv.components.filter(c => c.id !== page.sel); fsv.streams = fsv.streams.filter(x => x.from[0] !== page.sel && x.to[0] !== page.sel); }
      page.sel = null; draw(); resolve(); renderInspector();
    };
    const select = (id) => { page.sel = id; draw(); renderInspector(); };
    // ---- inspector ----
    const renderInspector = () => {
      inspector.replaceChildren();
      const c = fsv.components.find(x => x.id === page.sel);
      if (c) {
        inspector.append(h('h3', {}, t(COMPONENTS[c.type].label) + ' ' + c.id.match(/\d+$/)?.[0], h('button', { class: 'btn small', onclick: deleteSel }, '🗑 ' + t('Delete'))));
        inspector.append(buildForm(paramSchema(c, fsv.fluid), c.params, () => { resolveFast(); }));
        const W = page.res?.values?.['W_dot_' + c.id], Q = page.res?.values?.['Q_dot_' + c.id];
        if (W !== undefined) inspector.append(h('div', { class: 'ref-note' }, `Ẇ = ${fmt(W / 1000, 5)} kW`)); if (Q !== undefined) inspector.append(h('div', { class: 'ref-note' }, `Q̇ = ${fmt(Q / 1000, 5)} kW`));
        return;
      }
      if (page.sel?.startsWith('s')) {
        const id = +page.sel.slice(1); const S = stateOf(id);
        inspector.append(h('h3', {}, t('Stream') + ' ' + id, h('button', { class: 'btn small', onclick: deleteSel }, '🗑 ' + t('Delete'))));
        if (S) inspector.append(h('table', { class: 'vars' }, [['P', S.P / 1000, 'kPa'], ['T', S.T - 273.15, '°C'], ['h', S.h / 1000, 'kJ/kg'], ['s', S.s / 1000, 'kJ/kg·K'], ['v', S.v, 'm³/kg'], ['x', S.x, ''], ['ṁ', S.m, 'kg/s']].map(([a, b, u]) => h('tr', {}, h('td', {}, a), h('td', { class: 'num' }, fmt(b, 5)), h('td', {}, u))), h('tr', {}, h('td', {}, t('phase')), h('td', { colspan: 2 }, t(S.phase)))));
        const isSpec = fsv.massFlow?.stream === id;
        inspector.append(h('div', { class: 'row', style: { marginTop: '8px' } }, h('label', {}, h('input', { type: 'checkbox', checked: isSpec, onchange: (e) => { if (e.target.checked) fsv.massFlow = { stream: id, value: fsv.massFlow?.value ?? 1 }; renderInspector(); resolve(); } }), ' ' + t('Mass flow specified on this stream'))));
        if (isSpec) inspector.append(buildForm([{ key: 'value', label: 'Mass flow rate', unit: 'kg/s' }], fsv.massFlow, () => resolveFast()));
        return;
      }
      inspector.append(h('h3', {}, t('System')));
      inspector.append(buildForm([{ key: 'fluid', label: 'Working fluid', type: 'select', options: FLUIDS.map(f => [f.id, f.label]) }, { key: 'kind', label: 'Cycle type', type: 'select', options: [['power', 'Power cycle (η)'], ['refrigeration', 'Refrigeration / heat pump (COP)']] }], fsv, () => resolve()));
      inspector.append(h('div', { class: 'ref-note', style: { marginTop: '8px' } }, t('Drag components from the palette onto the canvas. Drag from a red outlet port to a blue inlet port to connect a stream. Click a component or stream to edit it; Delete removes it. Every change re-solves the system.')));
      if (fsv.ref) inspector.append(h('div', { class: 'ref-note', style: { marginTop: '8px' } }, '📘 ' + fsv.ref));
    };
    // ---- solve + tween diagrams ----
    let tween = null; let prevStates = null, prevPaths = null;
    const resolve = () => {
      const r = solveFlowsheet(fsv); page.res = r;
      msgBox.replaceChildren(...(r.messages || []).filter(m => m.type !== 'info').slice(0, 6).map(m => h('div', { class: 'msg ' + m.type }, m.msg)));
      if (!r.ok) { perf.replaceChildren(h('div', { class: 'msg error' }, t('Not solved — see messages.'))); drawLabels(); return; }
      renderResults(); drawLabels(); initParticles(); renderInspectorValues();
      const ns = r.states, np = r.paths;
      for (let i = 0; i < 2; i++) diagState[i] = propertyDiagram(diagBoxes[i], fsv.fluid, page.diagTypes[i], ns, np, diagState[i]);
      if (prevStates && prevStates.length === ns.length && prevPaths.length === np.length && np.every((p, i) => p.pts.length === prevPaths[i].pts.length)) {
        const t0 = performance.now(), S0 = prevStates, P0 = prevPaths, D = 380;
        tween = (now) => {
          const f = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - f, 3);
          const lerp = (a, b) => { const o = { ...b }; for (const k of ['P', 'T', 'h', 's', 'v']) o[k] = a[k] + (b[k] - a[k]) * e; return o; };
          const st = ns.map((b, i) => lerp(S0[i], b)); const pa = np.map((p, i) => ({ ...p, pts: p.pts.map((b, k) => lerp(P0[i].pts[k] || b, b)) }));
          for (let i = 0; i < 2; i++) drawCycle(diagState[i], page.diagTypes[i], st, pa);
          if (f >= 1) tween = null;
        };
      } else for (let i = 0; i < 2; i++) drawCycle(diagState[i], page.diagTypes[i], ns, np);
      prevStates = ns; prevPaths = np;
    };
    const resolveFast = debounce(resolve, 90);
    const renderInspectorValues = () => { };
    const renderResults = () => {
      const r = page.res, v = r.values;
      const cards = [];
      const add = (label, val, unit) => { if (Number.isFinite(val)) cards.push(h('div', { class: 'result-card' }, h('div', { class: 'rc-label' }, t(label)), h('div', { class: 'rc-value' }, fmt(val, 4), h('span', { class: 'rc-unit' }, ' ' + unit)))); };
      if (r.compiled.kind === 'power') { add('Thermal efficiency η', v.eta_th * 100, '%'); add('Net power', v.W_dot_net / 1000, 'kW'); add('Heat input', v.Q_dot_in / 1000, 'kW'); add('Heat rejected', v.Q_dot_out / 1000, 'kW'); add('Back-work ratio', v.bwr, ''); }
      else { add('COP (refrigerator)', v.COP_R, ''); add('COP (heat pump)', v.COP_HP, ''); add('Cooling capacity Q̇L', v.Q_dot_L / 1000, 'kW'); add('Compressor power', v.W_dot_in / 1000, 'kW'); add('Heat rejected Q̇H', v.Q_dot_H / 1000, 'kW'); }
      for (const [k, val] of Object.entries(v)) if (k.startsWith('y_')) add('Extraction fraction ' + k.slice(2), val, '');
      perf.replaceChildren(h('div', { class: 'results-grid' }, cards));
      stateBox.replaceChildren(h('table', { class: 'vars state-table' }, h('tr', {}, ['#', 'P [kPa]', 'T [°C]', 'h [kJ/kg]', 's [kJ/kg·K]', 'v [m³/kg]', 'x', 'ṁ [kg/s]', t('phase')].map(c => h('th', {}, c))), r.states.map(S => h('tr', {}, h('td', {}, S.id), ...[S.P / 1000, S.T - 273.15, S.h / 1000, S.s / 1000, S.v, S.x, S.m].map(x => h('td', { class: 'num' }, Number.isFinite(x) ? fmt(x, 5) : '—')), h('td', {}, t(S.phase))))));
      if (stepsVisible) stepsBox.replaceChildren(eqStepsView(buildSteps(r, { education: store.settings.mode === 'education' })));
      eqBox.replaceChildren(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('button', { class: 'btn', onclick: () => { const ep = window.__mamba.pageById('equations'); ep.text = r.compiled.text; ep.res = null; window.__mamba.go('equations'); } }, '✎ ' + t('Open in equation editor (customise)')), h('span', { class: 'ref-note' }, `${r.counts.equations} ${t('equations')} · ${r.counts.variables} ${t('variables')} · ${r.ms} ms`)), h('pre', { style: { maxHeight: '360px', overflow: 'auto', background: '#f6f8fa', padding: '8px', fontSize: '12px', direction: 'ltr' } }, r.compiled.text));
    };
    let stepsVisible = false;
    // ---- sweep ----
    const renderSweep = () => {
      const opts = [];
      for (const c of fsv.components) for (const f of paramSchema(c, fsv.fluid)) if (f.type !== 'select' && (!f.show || f.show(c.params))) opts.push([c.id + '.' + f.key, `${c.id} · ${t(f.label)}`, f]);
      const outs = page.res?.ok ? Object.keys(page.res.values).filter(k => /^(eta_th|COP_R|COP_HP|W_dot|Q_dot|bwr|y_)/.test(k)) : [];
      const cfg = page.sweepCfg || (page.sweepCfg = { par: opts[0]?.[0], from: 0, to: 0, n: 12, out: outs[0] || 'eta_th' });
      if (!opts.find(o => o[0] === cfg.par)) cfg.par = opts[0]?.[0];
      const cur = () => { const [cid, key] = cfg.par.split('.'); return fsv.components.find(c => c.id === cid).params; };
      if (!cfg.from && !cfg.to && cfg.par) { const v0 = +cur()[cfg.par.split('.')[1]]; cfg.from = +(v0 * 0.5).toPrecision(3); cfg.to = +(v0 * 1.5).toPrecision(3); if (cfg.par.endsWith('eta')) { cfg.from = 0.6; cfg.to = 1; } }
      const plotBox = h('div', {}), tbl = h('div', { class: 'scroll' });
      const run = () => {
        const [cid, key] = cfg.par.split('.'); const comp = fsv.components.find(c => c.id === cid); const orig = comp.params[key];
        const rows = [];
        for (let i = 0; i < cfg.n; i++) { const x = cfg.from + (cfg.to - cfg.from) * i / (cfg.n - 1); comp.params[key] = x; const r = solveFlowsheet(fsv); rows.push({ x, y: r.ok ? r.values[cfg.out] : NaN, r }); }
        comp.params[key] = orig; page.sweep = { cfg: { ...cfg }, rows };
        plotBox.replaceChildren(); const pl = createPlot(plotBox, { width: 560, height: 300, xLabel: opts.find(o => o[0] === cfg.par)?.[1], yLabel: cfg.out });
        const pts = rows.map(r => [r.x, r.y]); pl.fit([{ pts }]); pl.setBackground([{ pts, color: '#0f8b8d', width: 2.5 }]); pl.setPoints(rows.map(r => ({ x: r.x, y: r.y, r: 3.5, color: '#0f8b8d' })));
        tbl.replaceChildren(h('table', { class: 'vars' }, h('tr', {}, h('th', {}, cfg.par), h('th', {}, cfg.out)), rows.map(r => h('tr', {}, h('td', { class: 'num' }, fmt(r.x, 5)), h('td', { class: 'num' }, fmt(r.y, 5))))));
        page.sweepPlot = plotBox.querySelector('svg');
        // animate: play the sweep through the diagrams (state points move)
        let k = 0; const ok = rows.filter(r => r.r.ok);
        if (page._play) clearInterval(page._play);
        page._play = setInterval(() => { if (!document.body.contains(plotBox)) { clearInterval(page._play); return; } const rr = ok[k % ok.length]; k++; for (let i = 0; i < 2; i++) { diagState[i] = propertyDiagram(diagBoxes[i], fsv.fluid, page.diagTypes[i], rr.r.states, rr.r.paths, diagState[i]); drawCycle(diagState[i], page.diagTypes[i], rr.r.states, rr.r.paths); } pl.setPoints(rows.map(r => ({ x: r.x, y: r.y, r: r === rr ? 7 : 3.5, color: r === rr ? '#e4572e' : '#0f8b8d' }))); if (k >= ok.length * 2) { clearInterval(page._play); resolve(); } }, 450);
      };
      sweepBox.replaceChildren(
        buildForm([{ key: 'par', label: 'Parameter', type: 'select', options: opts.map(o => [o[0], o[1]]) }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'n', label: 'Steps' }, { key: 'out', label: 'Output', type: 'select', options: outs.map(o => [o, o]) }], cfg, (k) => { if (k === 'par') { cfg.from = 0; cfg.to = 0; renderSweep(); } }),
        h('div', { class: 'row', style: { margin: '8px 0' } }, h('button', { class: 'btn primary', onclick: run }, '▶ ' + t('Run sweep and animate')), h('span', { class: 'ref-note' }, t('The diagrams above replay each sweep point, so you can watch the state points move.'))), plotBox, tbl);
    };
    // ---- layout ----
    const tplSel = h('select', { onchange: () => { if (!tplSel.value) return; page.fs = TEMPLATES[tplSel.value](); resetIds(page.fs); page.sel = null; prevStates = null; if (tplSel.value === 'vcr' && store.settings.refState !== 'ASHRAE') toast(t('Tip: set "Ref. state: ASHRAE" to match textbook R-134a table values (COP is unaffected).')); main.replaceChildren(); page.render(main); } }, h('option', { value: '' }, t('Templates…')), Object.entries(TEMPLATES).map(([k, f]) => h('option', { value: k }, t(f().name))));
    const palette = h('div', { class: 'palette' }, h('div', { class: 'nav-group-title', style: { color: 'var(--muted)', padding: '0 0 4px' } }, t('Components')), Object.entries(COMPONENTS).map(([ty, d]) => { const it = h('div', { class: 'pal-item', draggable: 'true', title: t(d.label) }, iconFor(ty), h('span', {}, t(d.label.split(' /')[0]))); it.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/comp', ty)); it.addEventListener('dblclick', () => { const c = newComponent(ty, 380, 260); fsv.components.push(c); select(c.id); draw(); }); return it; }));
    const diagSel = (i) => h('select', { onchange: (e) => { page.diagTypes[i] = e.target.value; diagState[i] = null; if (page.res?.ok) { diagState[i] = propertyDiagram(diagBoxes[i], fsv.fluid, page.diagTypes[i], page.res.states, page.res.paths, null); drawCycle(diagState[i], page.diagTypes[i], page.res.states, page.res.paths); } } }, [['Ts', 'T-s'], ['Ph', 'P-h'], ['Pv', 'P-v'], ['hs', 'h-s']].map(([v, l]) => h('option', { value: v, selected: page.diagTypes[i] === v }, l)));
    const bottomViews = [stateBox, stepsBox, eqBox, sweepBox];
    const bt = tabs(['State table', 'Step-by-step', 'Generated equations', 'Parametric sweep'], (i) => { bottomViews.forEach((v, k) => v.style.display = k === i ? '' : 'none'); if (i === 1) { stepsVisible = true; if (page.res?.ok) stepsBox.replaceChildren(eqStepsView(buildSteps(page.res, { education: store.settings.mode === 'education' }))); } if (i === 3) renderSweep(); });
    bottomViews.forEach((v, k) => v.style.display = k === 0 ? '' : 'none');
    main.append(
      h('h1', { class: 'page-title' }, t('System canvas'), h('span', { class: 'badge-mode' }, fsv.name ? t(fsv.name) : '')),
      h('div', { class: 'page-sub' }, t('Build a cycle from components; the canvas is compiled into equations and solved by the same solver as the equation editor. Particles show the flow (colour = temperature, hollow = vapour); state points move on the diagrams as you change inputs.')),
      h('div', { class: 'row', style: { marginBottom: '10px' } }, tplSel, h('button', { class: 'btn', onclick: () => { fsv.components = []; fsv.streams = []; fsv.name = 'Custom system'; fsv.ref = ''; page.sel = null; draw(); resolve(); renderInspector(); } }, '🧹 ' + t('Clear canvas')), legend),
      h('div', { class: 'canvas-layout' }, palette, h('div', {}, svg, msgBox), h('div', { class: 'stack' }, h('div', { class: 'panel' }, inspector), h('div', { class: 'panel' }, h('h3', {}, t('Performance')), perf))),
      h('div', { class: 'grid-viz', style: { marginTop: '14px' } }, h('div', { class: 'panel' }, h('h3', {}, t('Property diagram'), diagSel(0)), diagBoxes[0]), h('div', { class: 'panel' }, h('h3', {}, t('Property diagram'), diagSel(1)), diagBoxes[1])),
      h('div', { class: 'panel', style: { marginTop: '14px' } }, bt, ...bottomViews));
    draw(); renderInspector(); resolve();
    page.cleanup = () => { loop.stop(); window.removeEventListener('keydown', keyH); if (page._play) clearInterval(page._play); };
    page.svg = svg; page.diagBoxes = diagBoxes;
  };
  page.getReport = () => {
    if (!page.res?.ok) page.solveNow();
    const r = page.res; if (!r.ok) return null;
    const v = r.values;
    const perfRows = Object.entries({ eta_th: ['Thermal efficiency', '%', 100], W_dot_net: ['Net power', 'kW', 1e-3], Q_dot_in: ['Heat input', 'kW', 1e-3], Q_dot_out: ['Heat rejected', 'kW', 1e-3], bwr: ['Back-work ratio', '', 1], COP_R: ['COP refrigerator', '', 1], COP_HP: ['COP heat pump', '', 1], Q_dot_L: ['Cooling capacity', 'kW', 1e-3], W_dot_in: ['Compressor power', 'kW', 1e-3], Q_dot_H: ['Heat rejected', 'kW', 1e-3] }).filter(([k]) => v[k] !== undefined).map(([k, [l, u, f]]) => [t(l), v[k] * f, u]);
    const comps = page.fs.components.map(c => [c.id, t(COMPONENTS[c.type].label), Object.entries(c.params).map(([k, x]) => `${k}=${x}`).join(', ')]);
    return { title: t(page.fs.name || 'System model'), subtitle: `${t('Working fluid')}: ${page.fs.fluid}${page.fs.ref ? ' — ' + page.fs.ref : ''}`, sections: [
      { title: t('System schematic'), html: figHTML(page.svg, t('System canvas (stream numbers in black badges)')) },
      { title: t('Components'), html: tableHTML(['Id', t('Type'), t('Parameters')], comps) },
      { title: t('Performance'), html: tableHTML([t('Quantity'), t('Value'), t('Unit')], perfRows) },
      { title: t('State table'), html: tableHTML(['#', 'P [kPa]', 'T [°C]', 'h [kJ/kg]', 's [kJ/kg·K]', 'v [m³/kg]', 'x', 'ṁ [kg/s]', t('phase')], r.states.map(S => [S.id, S.P / 1000, S.T - 273.15, S.h / 1000, S.s / 1000, S.v, Number.isFinite(S.x) ? S.x : '—', S.m, S.phase])) },
      { title: t('Property diagrams'), html: (page.diagBoxes || []).map(b => figHTML(b.querySelector('svg'), '')).join('') },
      ...(page.sweep ? [{ title: t('Parametric sweep'), html: (page.sweepPlot ? figHTML(page.sweepPlot, '') : '') + tableHTML([page.sweep.cfg.par, page.sweep.cfg.out], page.sweep.rows.map(r => [r.x, r.y])) }] : []),
      { title: t('Generated equations'), html: `<pre>${r.compiled.text.replace(/</g, '&lt;')}</pre>` },
      { title: t('Step-by-step solution'), html: eqStepsView(buildSteps(r, { education: store.settings.mode === 'education' })).outerHTML },
    ] };
  };
  return page;
}
