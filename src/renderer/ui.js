// DOM helpers, KaTeX rendering, forms, step-by-step views, colour maps.
import { t } from './i18n.js';
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === undefined || v === null) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export function tex(latex, display = false) {
  try { return window.katex.renderToString(latex, { throwOnError: false, displayMode: display, strict: false, output: 'html' }); } catch (e) { return '<code>' + latex + '</code>'; }
}
export function texEl(latex, display = false, cls = '') { const e = h('span', { class: 'tex ' + cls }); e.innerHTML = tex(latex, display); return e; }
export function fmt(v, sig = 4) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v); if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(sig - 1);
  return (+v.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: false });
}
// ---- forms ----
export function buildForm(schema, values, onChange, opts = {}) {
  const wrap = h('div', { class: 'form' });
  const rows = [];
  for (const f of schema) {
    if (f.type === 'heading') { const r = h('div', { class: 'form-heading' }, t(f.label)); rows.push([f, r]); wrap.append(r); continue; }
    let input;
    const id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 7);
    if (f.type === 'select') {
      input = h('select', { id, onchange: () => { values[f.key] = f.numeric ? +input.value : input.value; onChange(f.key); sync(); } }, f.options.map(([v, l]) => h('option', { value: v, selected: String(values[f.key]) === String(v) }, t(l))));
    } else if (f.type === 'checkbox') {
      input = h('input', { id, type: 'checkbox', checked: !!values[f.key], onchange: () => { values[f.key] = input.checked; onChange(f.key); sync(); } });
    } else {
      input = h('input', { id, type: 'number', value: values[f.key], step: f.step ?? 'any', min: f.min, max: f.max, oninput: () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { values[f.key] = v; if (slider) slider.value = v; onChange(f.key); } } });
    }
    let slider = null;
    if (f.slider && f.type !== 'select' && f.type !== 'checkbox') {
      slider = h('input', { type: 'range', class: 'slider', min: f.min, max: f.max, step: f.step ?? (f.max - f.min) / 200, value: values[f.key], oninput: () => { values[f.key] = +slider.value; input.value = +(+slider.value).toPrecision(6); onChange(f.key); } });
    }
    const row = h('div', { class: 'form-row' + (slider ? ' has-slider' : '') }, h('label', { for: id, title: f.help ? t(f.help) : '' }, t(f.label)), h('div', { class: 'form-input' }, input, f.unit ? h('span', { class: 'unit' }, f.unit) : null), slider);
    rows.push([f, row]); wrap.append(row);
  }
  function sync() { for (const [f, r] of rows) r.style.display = (!f.show || f.show(values)) ? '' : 'none'; }
  sync();
  wrap.sync = sync;
  return wrap;
}
// ---- results ----
export function resultsGrid(results) {
  return h('div', { class: 'results-grid' }, Object.entries(results).map(([k, r]) => h('div', { class: 'result-card' + (r.bad ? ' bad' : '') }, h('div', { class: 'rc-label' }, t(r.label)), h('div', { class: 'rc-value' }, typeof r.v === 'number' ? fmt(r.v, 4) : r.v, r.u ? h('span', { class: 'rc-unit' }, ' ' + r.u) : null))));
}
// ---- step-by-step for Trace JSON ----
export function traceView(tr, opts = {}) {
  const e = h('div', { class: 'steps' });
  if (tr.assumptions?.length) e.append(h('div', { class: 'step-sec' }, h('h4', {}, t('Assumptions')), h('ul', {}, tr.assumptions.map(a => h('li', {}, t(a))))));
  if (tr.given?.length) e.append(h('div', { class: 'step-sec' }, h('h4', {}, t('Given')), h('div', { class: 'given' }, tr.given.map(g => texEl(g.latex)))));
  let n = 0;
  for (const sec of tr.sections) {
    const se = h('div', { class: 'step-sec' }, h('h4', {}, t(sec.title)));
    for (const st of sec.steps) {
      if (st.note) { se.append(h('div', { class: 'step-note' }, t(st.note))); continue; }
      n++;
      se.append(h('div', { class: 'step' }, h('div', { class: 'step-n' }, n), h('div', { class: 'step-body' },
        st.title ? h('div', { class: 'step-title' }, t(st.title)) : null,
        h('div', { class: 'step-math' }, texEl(st.symbolic, true)),
        st.substituted ? h('div', { class: 'step-math sub' }, texEl(st.substituted, true)) : null,
        h('div', { class: 'step-math res' }, texEl(st.result, true)))));
    }
    e.append(se);
  }
  if (tr.checks?.length) e.append(h('div', { class: 'step-sec' }, h('h4', {}, t('Checks')), tr.checks.map(c => h('div', { class: 'check ' + (c.ok ? 'ok' : 'no') }, (c.ok ? '✔ ' : '✖ ') + t(c.text) + (c.detail ? ' — ' + c.detail : '')))));
  if (tr.refs?.length) e.append(h('div', { class: 'step-sec refs' }, h('h4', {}, t('References')), tr.refs.map(r => h('div', {}, r))));
  return e;
}
// ---- step-by-step for equation-solver steps ----
export function eqStepsView(st, opts = {}) {
  const e = h('div', { class: 'steps' });
  if (st.given.length) e.append(h('div', { class: 'step-sec' }, h('h4', {}, t('Given')), h('div', { class: 'given' }, st.given.map(g => texEl(g.latex)))));
  const sec = h('div', { class: 'step-sec' }, h('h4', {}, t('Solution, in the order the solver used')));
  let n = 0;
  for (const s1 of st.steps) {
    n++;
    const body = h('div', { class: 'step-body' });
    if (s1.kind === 'block') {
      body.append(h('div', { class: 'step-title' }, t('Simultaneous block') + ` (${t('lines')} ${s1.lines.join(', ')}) — Newton–Raphson, ${s1.iterations} ${t('iterations')}`));
      s1.symbolic.forEach(l => body.append(h('div', { class: 'step-math' }, texEl(l, true))));
      s1.props.slice(0, 6).forEach(p => body.append(propView(p)));
      s1.results.forEach(l => body.append(h('div', { class: 'step-math res' }, texEl(l, true))));
    } else {
      body.append(h('div', { class: 'step-title' }, `${t('Line')} ${s1.line}`));
      body.append(h('div', { class: 'step-math' }, texEl(s1.symbolic, true)));
      s1.props.forEach(p => body.append(propView(p)));
      if (s1.substituted && !s1.props.length) body.append(h('div', { class: 'step-math sub' }, texEl(s1.substituted, true)));
      else if (s1.substituted && s1.props.length && s1.symbolic.split('operatorname').length < 3 && !/^[^=]*= \\operatorname/.test(s1.symbolic)) body.append(h('div', { class: 'step-math sub' }, texEl(s1.substituted, true)));
      body.append(h('div', { class: 'step-math res' }, texEl(s1.result, true)));
    }
    sec.append(h('div', { class: 'step' }, h('div', { class: 'step-n' }, n), body));
  }
  e.append(sec);
  return e;
}
function propView(p) {
  const box = h('div', { class: 'prop-lookup' });
  box.append(h('div', { class: 'pl-head' }, '🔎 ', h('b', {}, p.fluid), ' — ', texEl(p.argsLatex), p.phase ? h('span', { class: 'phase-tag phase-' + p.phase.replace(/\s+/g, '-') }, t(p.phase)) : null));
  if (p.textbook) {
    const tb = p.textbook;
    const inner = h('div', { class: 'pl-table' }, h('div', { class: 'pl-sub' }, t('Textbook table lookup') + ': ' + t(tb.table)));
    tb.lines.forEach(l => inner.append(h('div', { class: 'pl-line' }, l.text ? h('span', {}, t(l.text) + ' ') : null, texEl(l.latex, !l.text))));
    inner.append(h('div', { class: 'pl-cmp' }, t('Table interpolation') + ': ', texEl(tb.value), ' · ' + t('exact (EOS)') + ': ', texEl(tb.exact), ` · Δ = ${tb.diffPct.toFixed(3)} %`));
    box.append(inner);
  }
  box.append(h('div', { class: 'pl-res' }, texEl(p.valueLatex)));
  return box;
}
// ---- colour maps ----
const THERMAL = [[0, [49, 54, 149]], [0.15, [69, 117, 180]], [0.3, [116, 173, 209]], [0.45, [171, 217, 233]], [0.55, [254, 224, 144]], [0.7, [253, 174, 97]], [0.85, [244, 109, 67]], [1, [165, 0, 38]]];
export function thermal(x) {
  x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < THERMAL.length - 1; i++) { const [a, ca] = THERMAL[i], [b, cb] = THERMAL[i + 1]; if (x <= b) { const f = (x - a) / (b - a); return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * f)).join(',')})`; } }
  return 'rgb(165,0,38)';
}
export function legendBar(min, max, unit, w = 180) {
  const id = 'lg' + Math.random().toString(36).slice(2, 7);
  const stops = []; for (let k = 0; k <= 10; k++) stops.push(s('stop', { offset: k / 10, 'stop-color': thermal(k / 10) }));
  return s('svg', { width: w + 70, height: 34, class: 'legend' }, s('defs', {}, s('linearGradient', { id }, stops)), s('rect', { x: 30, y: 4, width: w, height: 10, fill: `url(#${id})`, rx: 3 }), s('text', { x: 30, y: 28, 'font-size': 11 }, fmt(min, 3)), s('text', { x: 30 + w, y: 28, 'font-size': 11, 'text-anchor': 'end' }, fmt(max, 3) + ' ' + unit));
}
export function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
export function animLoop(fn) { let on = true, last = performance.now(); const tick = (now) => { if (!on) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; fn(dt, now / 1000); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return { stop: () => { on = false; } }; }
export function tabs(items, onSelect, active = 0) {
  const bar = h('div', { class: 'tabs' });
  const btns = items.map((it, i) => h('button', { class: 'tab' + (i === active ? ' active' : ''), onclick: () => { btns.forEach(b => b.classList.remove('active')); btns[i].classList.add('active'); onSelect(i, it); } }, t(it)));
  bar.append(...btns); return bar;
}
export function toast(msg, kind = 'info') { const e = h('div', { class: 'toast ' + kind }, msg); document.body.append(e); setTimeout(() => e.classList.add('show'), 10); setTimeout(() => { e.classList.remove('show'); setTimeout(() => e.remove(), 400); }, 3200); }
