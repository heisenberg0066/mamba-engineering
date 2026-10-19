// Property-diagram backgrounds (saturation dome, isobars, isotherms) and cycle overlays.
import { prop, fluidInfo, crit } from '../core/props.js';
import { createPlot } from './svgplot.js';
import { t } from './i18n.js';

export const DIAGRAMS = {
  Ts: { x: 's', y: 'T', xl: 's [kJ/kg·K]', yl: 'T [°C]', iso: 'P' },
  Ph: { x: 'h', y: 'P', xl: 'h [kJ/kg]', yl: 'P [kPa]', iso: 'T', yLog: true },
  Pv: { x: 'v', y: 'P', xl: 'v [m³/kg]', yl: 'P [kPa]', iso: 'T', xLog: true, yLog: true },
  hs: { x: 's', y: 'h', xl: 's [kJ/kg·K]', yl: 'h [kJ/kg]', iso: 'P' },
};
export const conv = { s: (v) => v / 1000, h: (v) => v / 1000, T: (v) => v - 273.15, P: (v) => v / 1000, v: (v) => v };
const cache = new Map();
const isGas = (f) => ['Air', 'Nitrogen', 'Air_cold'].includes(f);

function dome(fluid) {
  const key = 'dome|' + fluid; if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const f = fluidInfo(fluid); if (f.ideal) return null;
    const c = crit(fluid);
    let Tlo; try { Tlo = prop('Ttriple', fluid, {}); } catch { Tlo = 0; }
    try { Tlo = Math.max(Tlo, prop('Tmin', fluid, {})); } catch {}
    Tlo += 0.5;
    const liq = [], vap = [];
    const n = 70;
    for (let i = 0; i <= n; i++) {
      const fr = 1 - Math.pow(1 - i / n, 2.2);
      const T = Tlo + (c.T - 0.02 - Tlo) * fr;
      try {
        const L = { T, P: prop('P', fluid, { T, x: 0 }), h: prop('h', fluid, { T, x: 0 }), s: prop('s', fluid, { T, x: 0 }), v: prop('v', fluid, { T, x: 0 }) };
        const V = { T, P: L.P, h: prop('h', fluid, { T, x: 1 }), s: prop('s', fluid, { T, x: 1 }), v: prop('v', fluid, { T, x: 1 }) };
        liq.push(L); vap.push(V);
      } catch {}
    }
    out = { liq, vap, crit: c };
  } catch { out = null; }
  cache.set(key, out); return out;
}
function isobar(fluid, P, Tlo, Thi, n = 60) {
  const key = `ib|${fluid}|${P}|${Tlo.toFixed(1)}|${Thi.toFixed(1)}`; if (cache.has(key)) return cache.get(key);
  const pts = [];
  let Ts = null; try { if (!fluidInfo(fluid).ideal) { const c = crit(fluid); if (P < c.P) Ts = prop('T', fluid, { P, x: 0 }); } } catch {}
  const add = (args) => { try { pts.push({ T: prop('T', fluid, args), P, h: prop('h', fluid, args), s: prop('s', fluid, args), v: prop('v', fluid, args) }); } catch {} };
  for (let i = 0; i <= n; i++) {
    const T = Tlo + (Thi - Tlo) * i / n;
    if (Ts && Math.abs(T - Ts) < 0.05) continue;
    if (Ts && i > 0) { const Tp = Tlo + (Thi - Tlo) * (i - 1) / n; if (Tp < Ts && T > Ts) { add({ P, x: 0 }); add({ P, x: 1 }); } }
    add({ P, T });
  }
  cache.set(key, pts); return pts;
}
function isotherm(fluid, T, Plo, Phi, n = 60) {
  const key = `it|${fluid}|${T}|${Plo.toFixed(0)}|${Phi.toFixed(0)}`; if (cache.has(key)) return cache.get(key);
  const pts = [];
  let Ps = null; try { if (!fluidInfo(fluid).ideal) { const c = crit(fluid); if (T < c.T) Ps = prop('P', fluid, { T, x: 0 }); } } catch {}
  const add = (args) => { try { pts.push({ T, P: prop('P', fluid, args), h: prop('h', fluid, args), s: prop('s', fluid, args), v: prop('v', fluid, args) }); } catch {} };
  for (let i = 0; i <= n; i++) {
    const P = Math.exp(Math.log(Plo) + (Math.log(Phi) - Math.log(Plo)) * i / n);
    if (Ps && Math.abs(P - Ps) / Ps < 1e-3) continue;
    if (Ps && i > 0) { const Pp = Math.exp(Math.log(Plo) + (Math.log(Phi) - Math.log(Plo)) * (i - 1) / n); if (Pp < Ps && P > Ps) { add({ T, x: 1 }); add({ T, x: 0 }); } }
    add({ P, T });
  }
  cache.set(key, pts); return pts;
}
const XY = (type) => (p) => [conv[DIAGRAMS[type].x](p[DIAGRAMS[type].x]), conv[DIAGRAMS[type].y](p[DIAGRAMS[type].y])];

// Build/refresh a diagram. states: [{id,P,T,h,s,v}], paths: [{pts:[...], dashed}]
export function propertyDiagram(container, fluid, type, states, paths, prev) {
  const D = DIAGRAMS[type]; const xy = XY(type);
  let plot = prev?.plot;
  const sig = fluid + '|' + type + '|' + states.map(s => [s.P, s.T].map(v => v.toPrecision(3)).join(',')).join(';');
  const needBg = !prev || prev.fluid !== fluid || prev.type !== type || prev.bgSig !== bgSignature(states);
  if (!plot || needBg) {
    container.replaceChildren();
    plot = createPlot(container, { width: 560, height: 380, xLabel: D.xl, yLabel: D.yl, xLog: D.xLog, yLog: D.yLog });
    const valid = states.filter(s => Number.isFinite(s.T) && Number.isFinite(s.P));
    const Ts = valid.map(s => s.T), Ps = valid.map(s => s.P);
    const series = [];
    const dm = isGas(fluid) ? null : dome(fluid);
    let Tlo = Math.min(...Ts), Thi = Math.max(...Ts), Plo = Math.min(...Ps), Phi = Math.max(...Ps);
    if (dm) { Tlo = Math.min(Tlo, dm.liq[0].T); Thi = Math.max(Thi, dm.crit.T * 1.02); Plo = Math.min(Plo, Math.max(dm.liq[0].P, Plo / 20)); Phi = Math.max(Phi, Math.min(dm.crit.P * 1.5, Phi * 3)); }
    const Tspan = Thi - Tlo;
    // iso-lines at the cycle's own pressures / temperatures (unique), plus a few nice values
    if (D.iso === 'P') {
      const uniq = [...new Set(Ps.map(p => +p.toPrecision(3)))].sort((a, b) => a - b);
      for (const P of uniq) series.push({ pts: isobar(fluid, P, Math.max(Tlo - 0.05 * Tspan, dm ? dm.liq[0].T : 1), Thi + 0.15 * Tspan).map(xy), color: '#7aa6c2', width: 1, dash: '5 3', label: `${+(P / 1000).toPrecision(3)} kPa`, labelAt: 0.92 });
    } else {
      const uniq = [...new Set(Ts.map(T => Math.round(T)))].sort((a, b) => a - b);
      const lines = uniq.length > 6 ? uniq.filter((_, i) => i % Math.ceil(uniq.length / 6) === 0) : uniq;
      for (const T of lines) series.push({ pts: isotherm(fluid, T, Plo / 1.5, Phi * 1.5).map(xy), color: '#c29a7a', width: 1, dash: '5 3', label: `${Math.round(T - 273.15)} °C`, labelAt: 0.12 });
    }
    if (dm) {
      series.push({ pts: dm.liq.map(xy), color: '#1f3b57', width: 2, label: t('sat. liquid'), labelAt: 0.4 });
      series.push({ pts: dm.vap.map(xy), color: '#1f3b57', width: 2, label: t('sat. vapour'), labelAt: 0.4 });
      // quality lines on T-s and P-h
      if (type === 'Ts' || type === 'Ph') for (const xq of [0.25, 0.5, 0.75]) series.push({ pts: dm.liq.map((L, i) => { const V = dm.vap[i]; return xy({ T: L.T, P: L.P, s: L.s + xq * (V.s - L.s), h: L.h + xq * (V.h - L.h), v: L.v + xq * (V.v - L.v) }); }), color: '#b8c7d6', width: 0.8, dash: '2 3', label: 'x=' + xq, labelAt: 0.15 });
    }
    const pathSeries = paths.map(p => ({ pts: p.pts.map(xy) }));
    plot.fit([...pathSeries, ...(dm ? [{ pts: dm.liq.map(xy) }, { pts: dm.vap.map(xy) }] : [])], states.map(s => { const [x, y] = xy(s); return { x, y }; }), 0.06);
    plot.setBackground(series);
  }
  return { plot, fluid, type, bgSig: bgSignature(states), sig };
}
function bgSignature(states) { return states.map(s => [s.P, s.T].map(v => Number.isFinite(v) ? v.toPrecision(2) : 'x').join(',')).join(';'); }
export function drawCycle(dg, type, states, paths, hl) {
  const xy = XY(type);
  dg.plot.setOverlay(paths.map(p => ({ pts: p.pts.map(xy), color: p.color || (p.dashed ? '#888' : '#e4572e'), width: 2.6, dash: p.dashed ? '6 4' : null })));
  dg.plot.setPoints(states.map(s => { const [x, y] = xy(s); return { x, y, label: s.id, color: hl === s.id ? '#ffb000' : '#e4572e', r: hl === s.id ? 7 : 5 }; }));
}
export { XY };
