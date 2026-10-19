// Generic page for closed-form calculation modules: input form + animated visual + step-by-step + results + report.
import { h, buildForm, resultsGrid, traceView, debounce, tabs } from './ui.js';
import { t } from './i18n.js';
import { tableHTML, figHTML } from './report.js';
import { store } from './store.js';

export function makeCalcPage(def) {
  const page = { id: def.id, group: def.group, icon: def.icon, title: def.title, values: structuredClone(def.defaults), out: null, err: null };
  page.serialize = () => structuredClone(page.values);
  page.reset = () => { page.values = structuredClone(def.defaults); page.out = null; };
  page.load = (v) => { page.values = { ...structuredClone(def.defaults), ...v }; };
  page.render = (main) => {
    const v = page.values;
    const resBox = h('div', { class: 'res-box' });
    const stepsBox = h('div', {});
    const viz = h('div', { class: 'viz-box' });
    const vizCtl = h('div', { class: 'row', style: { marginTop: '6px' } });
    const errBox = h('div', { class: 'msgs' });
    let anim = null;
    const recompute = () => {
      errBox.replaceChildren();
      try { page.out = def.compute(structuredClone(v)); page.err = null; }
      catch (e) { page.err = e.message; errBox.append(h('div', { class: 'msg error' }, e.message)); return; }
      resBox.replaceChildren(resultsGrid(page.out.results));
      stepsBox.replaceChildren(traceView(page.out.trace));
      if (anim && anim.update) anim.update(page.out, v); else { if (anim?.stop) anim.stop(); viz.replaceChildren(); vizCtl.replaceChildren(); anim = def.viz(viz, page.out, v, vizCtl); }
    };
    const form = buildForm(def.schema, v, debounce((key) => { if (def.rebuildOn?.includes(key)) { if (anim?.stop) anim.stop(); anim = null; } recompute(); }, 30));
    const extra = def.extraInputs ? def.extraInputs(v, () => { if (anim?.stop) anim.stop(); anim = null; recompute(); }) : null;
    const edu = store.settings.mode === 'education';
    let showSteps = edu;
    const rightTabs = tabs(['Step-by-step solution', 'Results'], (i) => { stepsBox.style.display = i === 0 ? '' : 'none'; resBox2.style.display = i === 1 ? '' : 'none'; }, edu ? 0 : 1);
    const resBox2 = h('div', {}, h('div', { class: 'ref-note' }, t('All results also appear in the PDF report.')));
    main.append(
      h('h1', { class: 'page-title' }, t(def.title), h('span', { class: 'badge-mode' }, t(edu ? 'Education mode' : 'Engineer mode'))),
      h('div', { class: 'page-sub' }, t(def.sub)),
      h('div', { class: 'grid2' },
        h('div', { class: 'stack' }, h('div', { class: 'panel' }, h('h3', {}, t('Inputs')), extra, form), def.refNote ? h('div', { class: 'ref-note' }, t(def.refNote)) : null),
        h('div', { class: 'stack' },
          h('div', { class: 'panel' }, h('h3', {}, t('Interactive visual'), h('span', { class: 'row' }, vizCtl)), viz, errBox),
          h('div', { class: 'panel' }, h('h3', {}, t('Results')), resBox),
          h('div', { class: 'panel' }, rightTabs, stepsBox, resBox2))));
    stepsBox.style.display = edu ? '' : 'none'; resBox2.style.display = edu ? 'none' : '';
    recompute();
    page.cleanup = () => { if (anim?.stop) anim.stop(); };
    page.vizEl = viz;
  };
  page.getReport = () => {
    if (!page.out) return null;
    const v = page.values;
    const inputs = def.schema.filter(f => f.type !== 'heading' && (!f.show || f.show(v))).map(f => [t(f.label), f.type === 'select' ? t((f.options.find(o => String(o[0]) === String(v[f.key])) || [0, v[f.key]])[1]) : (f.type === 'checkbox' ? (v[f.key] ? '✔' : '—') : v[f.key]), f.unit || '']);
    const extraRows = def.reportInputs ? def.reportInputs(v) : [];
    const res = Object.values(page.out.results).map(r => [t(r.label), typeof r.v === 'number' ? r.v : r.v, r.u]);
    const svgs = [...(page.vizEl?.querySelectorAll('svg') || [])].filter(s => !s.classList.contains('legend') || true);
    const stepsHtml = traceView(page.out.trace).outerHTML;
    return { title: t(def.title), subtitle: t(def.sub), sections: [
      { title: t('Inputs'), html: tableHTML([t('Quantity'), t('Value'), t('Unit')], [...inputs, ...extraRows]) },
      { title: t('Results'), html: tableHTML([t('Quantity'), t('Value'), t('Unit')], res) },
      { title: t('Figures'), html: svgs.slice(0, 4).map(s => figHTML(s, '')).join('') },
      { title: t('Step-by-step solution'), html: stepsHtml },
    ] };
  };
  return page;
}
