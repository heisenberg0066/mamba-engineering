// Lightweight SVG plotting with static background + animated overlay layers.
import { s } from './ui.js';
function niceTicks(lo, hi, n = 6) {
  const span = hi - lo; if (!(span > 0)) return [lo];
  const step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag; const step = (err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function logTicks(lo, hi) { const out = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); } return out; }
const tickLabel = (v) => { const a = Math.abs(v); if (a !== 0 && (a >= 1e5 || a < 1e-2)) return v.toExponential(0); return String(+v.toPrecision(6)); };

export function createPlot(container, opts = {}) {
  const W = opts.width || 520, H = opts.height || 360, m = { l: 62, r: 16, t: opts.title ? 26 : 12, b: 44 };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'plot', preserveAspectRatio: 'xMidYMid meet' });
  const clipId = 'c' + Math.random().toString(36).slice(2, 8);
  svg.append(s('defs', {}, s('clipPath', { id: clipId }, s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }))));
  const gAxes = s('g', { class: 'axes' }), gBg = s('g', { 'clip-path': `url(#${clipId})`, class: 'bg' }), gOv = s('g', { 'clip-path': `url(#${clipId})`, class: 'ov' }), gPts = s('g', { class: 'pts' });
  svg.append(gAxes, gBg, gOv, gPts);
  if (container) container.append(svg);
  const st = { xr: opts.xRange, yr: opts.yRange, xLog: !!opts.xLog, yLog: !!opts.yLog };
  const X = (x) => { const [a, b] = st.xr; const f = st.xLog ? (Math.log(x) - Math.log(a)) / (Math.log(b) - Math.log(a)) : (x - a) / (b - a); return m.l + f * (W - m.l - m.r); };
  const Y = (y) => { const [a, b] = st.yr; const f = st.yLog ? (Math.log(y) - Math.log(a)) / (Math.log(b) - Math.log(a)) : (y - a) / (b - a); return H - m.b - f * (H - m.t - m.b); };
  const Xinv = (px) => { const [a, b] = st.xr; const f = (px - m.l) / (W - m.l - m.r); return st.xLog ? Math.exp(Math.log(a) + f * (Math.log(b) - Math.log(a))) : a + f * (b - a); };
  const Yinv = (py) => { const [a, b] = st.yr; const f = (H - m.b - py) / (H - m.t - m.b); return st.yLog ? Math.exp(Math.log(a) + f * (Math.log(b) - Math.log(a))) : a + f * (b - a); };
  function drawAxes() {
    gAxes.replaceChildren();
    const xt = st.xLog ? logTicks(...st.xr) : niceTicks(...st.xr), yt = st.yLog ? logTicks(...st.yr) : niceTicks(...st.yr);
    gAxes.append(s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'plot-area' }));
    for (const v of xt) { const x = X(v); gAxes.append(s('line', { x1: x, x2: x, y1: m.t, y2: H - m.b, class: 'grid' }), s('text', { x, y: H - m.b + 15, 'text-anchor': 'middle', class: 'tick' }, tickLabel(v))); }
    for (const v of yt) { const y = Y(v); gAxes.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'grid' }), s('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' }, tickLabel(v))); }
    gAxes.append(s('text', { x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-label' }, opts.xLabel || ''), s('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})`, class: 'axis-label' }, opts.yLabel || ''));
    if (opts.title) gAxes.append(s('text', { x: m.l, y: 16, class: 'plot-title' }, opts.title));
  }
  const pathD = (pts) => { let d = ''; let pen = false; for (const p of pts) { if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || (st.xLog && p[0] <= 0) || (st.yLog && p[1] <= 0)) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); pen = true; } return d; };
  function seriesEl(se) {
    const attrs = { d: pathD(se.pts), fill: se.fill || 'none', stroke: se.color || '#333', 'stroke-width': se.width || 1.5, 'stroke-dasharray': se.dash || null, opacity: se.opacity ?? 1, class: se.cls || '' };
    const g = s('g', {}, s('path', attrs));
    if (se.label && se.pts.length) { const mid = se.labelAt ? se.pts[Math.floor(se.pts.length * se.labelAt)] : se.pts[Math.floor(se.pts.length / 2)]; if (mid && Number.isFinite(mid[0]) && Number.isFinite(mid[1])) g.append(s('text', { x: X(mid[0]) + 3, y: Y(mid[1]) - 3, class: 'series-label', fill: se.color || '#333' }, se.label)); }
    return g;
  }
  function fit(allSeries, allPoints, pad = 0.06) {
    const xs = [], ys = [];
    for (const se of allSeries) for (const p of se.pts) if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
    for (const p of allPoints || []) if (Number.isFinite(p.x) && Number.isFinite(p.y)) { xs.push(p.x); ys.push(p.y); }
    if (!xs.length) return;
    const ext = (arr, log) => { let a = Math.min(...arr), b = Math.max(...arr); if (log) { a = Math.max(a, 1e-12); const la = Math.log(a), lb = Math.log(Math.max(b, a * 1.01)); const pd = (lb - la) * pad; return [Math.exp(la - pd), Math.exp(lb + pd)]; } if (a === b) { a -= Math.abs(a) * 0.1 + 1; b += Math.abs(b) * 0.1 + 1; } const pd = (b - a) * pad; return [a - pd, b + pd]; };
    if (!opts.xRange) st.xr = ext(xs, st.xLog); if (!opts.yRange) st.yr = ext(ys, st.yLog);
  }
  const api = {
    svg, X, Y, Xinv, Yinv, st,
    setRanges(xr, yr) { if (xr) st.xr = xr; if (yr) st.yr = yr; drawAxes(); },
    fit(series, points, pad) { fit(series, points, pad); drawAxes(); },
    setBackground(series) { gBg.replaceChildren(...series.map(seriesEl)); },
    setOverlay(series) { gOv.replaceChildren(...series.map(seriesEl)); },
    setPoints(points) {
      gPts.replaceChildren(...points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => s('g', { class: 'pt', transform: `translate(${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)})` }, s('circle', { r: p.r || 5, fill: p.color || '#e4572e', stroke: '#fff', 'stroke-width': 1.5 }), p.label !== undefined ? s('text', { x: 7, y: -7, class: 'pt-label' }, String(p.label)) : null)));
    },
    marker(x, y, color = '#111', r = 6) { const c = s('circle', { cx: X(x), cy: Y(y), r, fill: color, stroke: '#fff', 'stroke-width': 2, class: 'marker' }); gPts.append(c); return c; },
    vline(x, color = '#999', dash = '4 3') { const l = s('line', { x1: X(x), x2: X(x), y1: m.t, y2: H - m.b, stroke: color, 'stroke-dasharray': dash }); gOv.append(l); return l; },
  };
  return api;
}
