// Property table browser with textbook-style interpolation shown step by step.
import { h, fmt, tex, toast, texEl } from '../ui.js';
import { t } from '../i18n.js';
import { FLUIDS, prop, fluidInfo, crit } from '../../core/props.js';
import { satTable, superheatTable, liquidTable, gridFor } from '../../core/tables.js';
import { tableHTML } from '../report.js';

export function makePropTablesPage() {
  const page = { id: 'proptables', group: 'thermo', icon: '▦', title: 'Property tables', cfg: { fluid: 'Water', type: 'satT', P: 1000, q: 150 } };
  page.serialize = () => page.cfg; page.load = (d) => { page.cfg = { ...page.cfg, ...d }; };
  page.render = (main) => {
    const c = page.cfg; const box = h('div', { class: 'scroll', style: { maxHeight: '560px' } }); const interp = h('div', {});
    const cols = () => c.type.startsWith('sat') ? [[c.type === 'satT' ? 'T' : 'P', c.type === 'satT' ? 'T [°C]' : 'P [kPa]'], [c.type === 'satT' ? 'P' : 'T', c.type === 'satT' ? 'Psat [kPa]' : 'Tsat [°C]'], ['vf', 'vf [m³/kg]'], ['vg', 'vg [m³/kg]'], ['uf', 'uf'], ['ug', 'ug'], ['hf', 'hf [kJ/kg]'], ['hfg', 'hfg'], ['hg', 'hg'], ['sf', 'sf [kJ/kg·K]'], ['sfg', 'sfg'], ['sg', 'sg']] : [['T', 'T [°C]'], ['v', 'v [m³/kg]'], ['u', 'u [kJ/kg]'], ['h', 'h [kJ/kg]'], ['s', 's [kJ/kg·K]']];
    const cv = (k, x) => k === 'T' ? x - 273.15 : k === 'P' ? x / 1000 : /^[uhs]/.test(k) ? x / 1000 : x;
    let rows = [];
    const build = () => {
      try {
        if (c.type === 'satT') rows = satTable(c.fluid, 'T'); else if (c.type === 'satP') rows = satTable(c.fluid, 'P');
        else if (c.type === 'sup') rows = superheatTable(c.fluid, c.P * 1000); else rows = liquidTable(c.fluid, c.P * 1000);
      } catch (e) { box.replaceChildren(h('div', { class: 'msg error' }, e.message)); rows = []; return; }
      const tb = h('table', { class: 'ptab' }, h('tr', {}, cols().map(([, l]) => h('th', {}, l))));
      rows.forEach(r => tb.append(h('tr', {}, cols().map(([k]) => h('td', {}, r.sat && k === 'T' ? fmt(cv(k, r[k]), 5) + ' (sat)' : fmt(cv(k, r[k]), 5))))));
      box.replaceChildren(tb); doInterp();
    };
    const doInterp = () => {
      interp.replaceChildren();
      if (!rows.length) return;
      const key = c.type === 'satT' ? 'T' : c.type === 'satP' ? 'P' : 'T';
      const xq = key === 'T' ? c.q + 273.15 : c.q * 1000;
      let i = -1; for (let k = 0; k < rows.length - 1; k++) if ((rows[k][key] - xq) * (rows[k + 1][key] - xq) <= 0) { i = k; break; }
      if (i < 0) { interp.append(h('div', { class: 'msg warn' }, t('Value outside the table range.'))); return; }
      const r1 = rows[i], r2 = rows[i + 1]; const f = (xq - r1[key]) / (r2[key] - r1[key]);
      const outs = c.type.startsWith('sat') ? ['hf', 'hg', 'sf', 'sg', 'vg'] : ['v', 'h', 's'];
      const X = (v) => fmt(cv(key, v), 6);
      interp.append(h('div', { class: 'ref-note' }, t('Linear interpolation between the two neighbouring rows (as done by hand with printed tables), compared with the exact value from the equation of state.')));
      for (const o of outs) {
        let exact;
        try {
          if (c.type === 'satT' || c.type === 'satP') { const base = o.replace(/[fg]$/, ''); const xx = o.endsWith('f') ? 0 : 1; exact = prop(base, c.fluid, { [key]: xq, x: xx }); }
          else exact = prop(o, c.fluid, { P: c.P * 1000, T: xq });
        } catch { exact = NaN; }
        const val = r1[o] + f * (r2[o] - r1[o]);
        interp.append(h('div', { class: 'pl-line' }, texEl(`${o.replace(/([fg]+)$/, '_{$1}')} = ${fmt(cv(o, r1[o]), 6)} + \\dfrac{${X(xq)} - ${X(r1[key])}}{${X(r2[key])} - ${X(r1[key])}}\\left(${fmt(cv(o, r2[o]), 6)} - ${fmt(cv(o, r1[o]), 6)}\\right) = ${fmt(cv(o, val), 6)} \\quad (\\text{EOS: } ${fmt(cv(o, exact), 6)})`, true)));
      }
      [...box.querySelectorAll('tr')].forEach((tr, k) => tr.classList.toggle('hl', k - 1 === i || k - 1 === i + 1));
    };
    const fluidSel = h('select', { onchange: (e) => { c.fluid = e.target.value; build(); } }, FLUIDS.filter(f => !f.ideal && f.id !== 'Air' && f.id !== 'Nitrogen').map(f => h('option', { value: f.id, selected: f.id === c.fluid }, f.label)));
    const typeSel = h('select', { onchange: (e) => { c.type = e.target.value; pRow.style.display = c.type === 'sup' || c.type === 'liq' ? '' : 'none'; build(); } }, [['satT', 'Saturated — temperature table'], ['satP', 'Saturated — pressure table'], ['sup', 'Superheated vapour at P'], ['liq', 'Compressed liquid at P']].map(([v, l]) => h('option', { value: v, selected: v === c.type }, t(l))));
    const pIn = h('input', { type: 'number', value: c.P, onchange: (e) => { c.P = +e.target.value; build(); } });
    const pRow = h('span', { class: 'row' }, 'P =', pIn, 'kPa'); pRow.style.display = c.type === 'sup' || c.type === 'liq' ? '' : 'none';
    const qIn = h('input', { type: 'number', value: c.q, oninput: (e) => { c.q = +e.target.value; doInterp(); } });
    const csv = () => { const cl = cols(); const txt = [cl.map(x => x[1]).join(','), ...rows.map(r => cl.map(([k]) => cv(k, r[k])).join(','))].join('\n'); window.host.saveText({ text: txt, name: `${c.fluid}-${c.type}.csv`, ext: 'csv' }).then(p => p && toast('Saved ' + p)); };
    main.append(h('h1', { class: 'page-title' }, t('Property tables')), h('div', { class: 'page-sub' }, t('Tables are generated from the equation of state (CoolProp, IAPWS-95 / IF97 for water) at textbook-style grid points — not copied from a book. Use them like printed tables, with interpolation shown.')),
      h('div', { class: 'panel' }, h('div', { class: 'row' }, fluidSel, typeSel, pRow, h('span', {}, t('Interpolate at') + ' ' + (c.type === 'satP' ? 'P [kPa]' : 'T [°C]') + ':'), qIn, h('button', { class: 'btn', onclick: csv }, '⬇ CSV'))),
      h('div', { class: 'grid2', style: { marginTop: '14px', gridTemplateColumns: '1.3fr 1fr' } }, h('div', { class: 'panel' }, box), h('div', { class: 'panel' }, h('h3', {}, t('Interpolation')), interp)));
    build();
  };
  page.getReport = () => ({ title: t('Property table') + ' — ' + page.cfg.fluid, subtitle: page.cfg.type, sections: [{ title: t('Table'), html: document.querySelector('.ptab')?.outerHTML || '' }] });
  return page;
}
