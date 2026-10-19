// Parametric table: vary one constant of the equation-editor model, solve each row, tabulate and plot.
import { h, fmt, toast } from '../ui.js';
import { t } from '../i18n.js';
import { store } from '../store.js';
import { solve, displayValue } from '../../core/solver.js';
import { createPlot } from '../svgplot.js';
import { tableHTML, figHTML } from '../report.js';

const NUM = '-?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?';
const esc = (x) => x.replace(/[[\]().*+?^$\\]/g, '\\$&');
export function constantsOf(text) {
  const out = []; const re = new RegExp(`(^|[;\\n])[ \\t]*([A-Za-z_]\\w*(?:\\[\\d+\\])?)[ \\t]*=[ \\t]*(${NUM})[ \\t]*(\\[[^\\]]*\\])?`, 'g');
  let m; while ((m = re.exec(text))) out.push({ name: m[2], value: +m[3], unit: m[4] ? m[4].slice(1, -1) : '' });
  return out;
}
export function substitute(text, name, value) {
  const re = new RegExp(`((?:^|[;\\n])[ \\t]*${esc(name)}[ \\t]*=[ \\t]*)(${NUM})`);
  return text.replace(re, (_, a) => a + String(+value.toPrecision(10)));
}
export function makeParametricPage(eq) {
  const page = { id: 'parametric', group: 'thermo', icon: '📈', title: 'Parametric table', cfg: { par: null, from: null, to: null, n: 11, outs: [], plotY: null }, rows: null };
  page.serialize = () => page.cfg; page.load = (d) => { page.cfg = { ...page.cfg, ...d }; page.rows = null; };
  page.reset = () => { page.cfg = { par: null, from: null, to: null, n: 11, outs: [], plotY: null }; page.rows = null; };
  page.run = () => {
    const c = page.cfg; const rows = [];
    for (let k = 0; k < c.n; k++) {
      const x = c.n > 1 ? c.from + (c.to - c.from) * k / (c.n - 1) : c.from;
      const r = solve(substitute(eq.text, c.par, x), { varInfo: eq.varInfoSI() });
      const row = { x, ok: r.ok, vals: {} };
      if (r.ok) for (const o of c.outs) { const d = displayValue(o, r.values[o], r.model, store.settings.units); row.vals[o] = d.v; row.units = row.units || {}; row.units[o] = d.u; }
      rows.push(row);
    }
    page.rows = rows; return rows;
  };
  page.render = (main) => {
    const c = page.cfg; const consts = constantsOf(eq.text);
    const base = solve(eq.text, { varInfo: eq.varInfoSI() });
    main.append(h('h1', { class: 'page-title' }, t('Parametric table')), h('div', { class: 'page-sub' }, t('Varies one constant of the model in the Equation editor, solves every row, and plots any result against it (like an EES parametric table).')));
    if (!base.ok || !consts.length) { main.append(h('div', { class: 'msg warn' }, t('The model in the Equation editor must solve and contain at least one constant (e.g. P[2] = 3000 [kPa]).')), h('button', { class: 'btn', onclick: () => window.__mamba.go('equations') }, t('Open equation editor'))); return; }
    if (!consts.find(k => k.name === c.par)) { const pick = consts.find(k => /^P|T/.test(k.name)) || consts[0]; c.par = pick.name; c.from = pick.value * 0.5; c.to = pick.value * 1.5; }
    const allVars = Object.keys(base.values).filter(v => !consts.find(k => k.name === v)).sort();
    c.outs = c.outs.filter(o => allVars.includes(o)); if (!c.outs.length) c.outs = allVars.filter(v => /eta|COP|w_net|W_dot|Q_dot|x\[|T_2/.test(v)).slice(0, 4); if (!c.outs.length) c.outs = allVars.slice(0, 3);
    if (!c.outs.includes(c.plotY)) c.plotY = c.outs[0];
    const parSel = h('select', { onchange: () => { c.par = parSel.value; const k = consts.find(q => q.name === c.par); c.from = k.value * 0.5; c.to = k.value * 1.5; main.replaceChildren(); page.render(main); } }, consts.map(k => h('option', { value: k.name, selected: k.name === c.par }, `${k.name} = ${k.value} ${k.unit}`)));
    const num = (key) => h('input', { type: 'number', value: c[key], step: 'any', style: { width: '90px' }, oninput: (e) => c[key] = +e.target.value });
    const outsBox = h('div', { class: 'chips' }, allVars.map(v => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: c.outs.includes(v), onchange: (e) => { if (e.target.checked) c.outs.push(v); else c.outs = c.outs.filter(o => o !== v); } }), v)));
    const tableBox = h('div', { class: 'scroll', style: { maxHeight: '420px' } }), plotBox = h('div', {}), ySel = h('select', { onchange: () => { c.plotY = ySel.value; draw(); } });
    const unit = consts.find(k => k.name === c.par)?.unit || '';
    const draw = () => {
      const rows = page.rows; if (!rows) return;
      ySel.replaceChildren(...c.outs.map(o => h('option', { value: o, selected: o === c.plotY }, o)));
      const tb = h('table', { class: 'ptab' }, h('tr', {}, h('th', {}, '#'), h('th', {}, `${c.par} [${unit}]`), c.outs.map(o => h('th', {}, `${o}${rows.find(r => r.units)?.units?.[o] ? ' [' + rows.find(r => r.units).units[o] + ']' : ''}`))));
      rows.forEach((r, i) => tb.append(h('tr', {}, h('td', {}, i + 1), h('td', {}, fmt(r.x, 5)), c.outs.map(o => h('td', {}, r.ok ? fmt(r.vals[o], 5) : '✖')))));
      tableBox.replaceChildren(tb);
      plotBox.replaceChildren();
      const pl = createPlot(plotBox, { width: 560, height: 340, xLabel: `${c.par} [${unit}]`, yLabel: c.plotY, title: `${c.plotY} vs ${c.par}` });
      const pts = rows.filter(r => r.ok).map(r => [r.x, r.vals[c.plotY]]);
      pl.fit([{ pts }]); pl.setBackground([{ pts, color: '#2a6fdb', width: 2.2 }]); pl.setPoints(pts.map(p => ({ x: p[0], y: p[1], r: 3.5 })));
      page.plotEl = plotBox.querySelector('svg');
    };
    const runBtn = h('button', { class: 'btn primary', onclick: () => { c.n = Math.max(2, Math.min(200, Math.round(c.n))); const t0 = performance.now(); page.run(); draw(); toast(`${page.rows.filter(r => r.ok).length}/${page.rows.length} ${t('rows solved')} (${Math.round(performance.now() - t0)} ms)`); } }, '▶ ' + t('Run table'));
    main.append(h('div', { class: 'panel' }, h('div', { class: 'row' }, h('b', {}, t('Vary')), parSel, t('from'), num('from'), t('to'), num('to'), t('rows'), num('n'), runBtn), h('div', { style: { marginTop: '8px' } }, h('b', {}, t('Columns') + ': '), outsBox)),
      h('div', { class: 'grid2', style: { marginTop: '14px' } }, h('div', { class: 'panel' }, h('h3', {}, t('Table')), tableBox), h('div', { class: 'panel' }, h('h3', {}, t('Plot'), h('span', {}, 'y: ', ySel)), plotBox)));
    if (page.rows) draw();
    page.runAndDraw = () => { page.run(); draw(); };
  };
  page.getReport = () => {
    if (!page.rows) return null; const c = page.cfg;
    return { title: t('Parametric table'), subtitle: `${c.par}: ${c.from} → ${c.to}`, sections: [
      { title: t('Model'), html: `<pre>${eq.text.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]))}</pre>` },
      { title: t('Table'), html: tableHTML([c.par, ...c.outs], page.rows.map(r => [r.x, ...c.outs.map(o => r.ok ? r.vals[o] : '—')])) },
      { title: t('Plot'), html: figHTML(page.plotEl, `${c.plotY} vs ${c.par}`) },
    ] };
  };
  return page;
}
