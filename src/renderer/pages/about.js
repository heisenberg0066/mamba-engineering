import { h, fmt } from '../ui.js';
import { t } from '../i18n.js';
import { VALIDATION } from '../validation-data.js';
export function makeAboutPage() {
  const page = { id: 'about', group: 'help', icon: 'ℹ', title: 'About & validation' };
  page.render = async (main) => {
    const info = await window.host.appInfo();
    const tb = h('table', { class: 'ptab' }, h('tr', {}, ['', t('Area'), t('Check'), t('Result'), t('Reference value'), t('Error'), t('Source')].map(x => h('th', {}, x))));
    for (const r of VALIDATION.results) tb.append(h('tr', { class: r.ok ? '' : 'bad' }, h('td', {}, r.ok ? '✔' : '✖'), h('td', {}, r.group), h('td', {}, r.name), h('td', {}, typeof r.got === 'number' ? fmt(r.got, 6) : String(r.got)), h('td', {}, typeof r.want === 'number' ? fmt(r.want, 6) : String(r.want)), h('td', {}, r.errPct === null ? '' : r.errPct.toFixed(2) + ' %'), h('td', { class: 'src' }, r.source)));
    main.append(h('h1', { class: 'page-title' }, t('About & validation')),
      h('div', { class: 'panel' }, h('p', {}, h('b', {}, 'Mamba Engineering ' + 'v' + info.version), ' — ', t('built for Ammar. Free to use.')),
        h('p', {}, t('Phase 1 MVP: equation solver, cycle canvas, engine cycles, property tables, parametric tables, heat-transfer slice and machine-element slice.')),
        h('p', {}, t('Third-party software:'), ' CoolProp 6.6 (MIT licence, Bell et al., Ind. Eng. Chem. Res. 2014) — Electron (MIT) — KaTeX (MIT).'),
        h('p', { class: 'ref-note' }, t('Engineering results must be checked by a qualified engineer before use in design. ISO 286 deviations are computed from the standard\'s formulas; verify critical values against a licensed copy of the standard.'))),
      h('div', { class: 'panel', style: { marginTop: '14px' } }, h('h3', {}, `${t('Validation')} — ${VALIDATION.total - VALIDATION.failed}/${VALIDATION.total} ${t('pass')} (${VALIDATION.date})`), h('div', { class: 'scroll', style: { maxHeight: '560px' } }, tb)));
  };
  return page;
}
