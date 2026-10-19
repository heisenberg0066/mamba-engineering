// App shell: navigation, settings, project save/load, PDF report, self-test.
import CoolPropModule from '../vendor/coolprop/coolprop.js';
import { initProps, settings as propSettings, clearCache } from '../core/props.js';
import { h, toast } from './ui.js';
import { t, setLang } from './i18n.js';
import { store } from './store.js';
import { reportHTML } from './report.js';
import { PAGES, GROUPS } from './pages/index.js';
import { runSelftest } from './selftest.js';

let current = null; let info = {};
export function pageById(id) { return PAGES.find(p => p.id === id); }

function applySettings() {
  setLang(store.settings.lang);
  propSettings.refState = store.settings.refState; propSettings.waterBackend = store.settings.waterBackend; clearCache();
  try { localStorage.setItem('mamba-settings', JSON.stringify(store.settings)); } catch {}
}
function renderTop() {
  const ta = document.getElementById('topActions'); ta.replaceChildren();
  const sel = (val, opts, on, title) => { const e = h('select', { title, onchange: () => on(e.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))); return e; };
  ta.append(
    sel(store.settings.lang, [['en', 'English'], ['sv', 'Svenska'], ['ar', 'العربية']], (v) => { store.settings.lang = v; applySettings(); renderNav(); go(current?.id || 'home'); renderTop(); }, 'Language'),
    sel(store.settings.mode, [['education', t('Education mode')], ['engineer', t('Engineer mode')]], (v) => { store.settings.mode = v; applySettings(); go(current?.id || 'home'); }, t('Mode')),
    sel(store.settings.refState, [['IIR', t('Ref. state: IIR (CoolProp)')], ['ASHRAE', t('Ref. state: ASHRAE (textbook R-134a tables)')]], (v) => { store.settings.refState = v; applySettings(); go(current?.id || 'home'); }, t('Refrigerant reference state')),
    sel(store.settings.waterBackend, [['HEOS', 'Water: IAPWS-95'], ['IF97', 'Water: IAPWS-IF97']], (v) => { store.settings.waterBackend = v; applySettings(); go(current?.id || 'home'); }, t('Water property formulation')),
    h('button', { onclick: newProject, title: t('New project') }, '＋ ' + t('New')),
    h('button', { onclick: () => openProject() }, '📂 ' + t('Open')),
    h('button', { onclick: () => saveProject(false) }, '💾 ' + t('Save')),
    h('button', { class: 'primary', onclick: () => exportReport() }, '📄 ' + t('PDF report')),
  );
}
function renderNav() {
  const nav = document.getElementById('sidebar'); nav.replaceChildren();
  for (const g of GROUPS) {
    const grp = h('div', { class: 'nav-group' }, h('div', { class: 'nav-group-title' }, t(g.title)));
    for (const p of PAGES.filter(p => p.group === g.id)) grp.append(h('div', { class: 'nav-item' + (current?.id === p.id ? ' active' : ''), 'data-id': p.id, onclick: () => go(p.id) }, h('span', { class: 'ic' }, p.icon), t(p.title)));
    nav.append(grp);
  }
}
export function go(id) {
  const p = pageById(id) || PAGES[0];
  if (current?.cleanup) try { current.cleanup(); } catch {}
  current = p;
  const main = document.getElementById('main'); main.replaceChildren(); main.scrollTop = 0;
  try { p.render(main, { go }); } catch (e) { console.error(e); main.append(h('div', { class: 'msg error' }, 'Page error: ' + e.message)); }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.id === p.id));
  try { localStorage.setItem('mamba-last-page', p.id); } catch {}
}
export function currentPage() { return current; }
function projectJSON() {
  const pages = {}; for (const p of PAGES) if (p.serialize) pages[p.id] = p.serialize();
  return JSON.stringify({ app: 'Mamba Engineering', format: 1, version: info.version, saved: new Date().toISOString(), name: store.projectName, settings: store.settings, page: current?.id, pages }, null, 1);
}
export function loadProjectJSON(json, filePath) {
  const d = JSON.parse(json);
  if (d.app !== 'Mamba Engineering') throw new Error('Not a Mamba Engineering project');
  store.settings = { ...store.settings, ...d.settings }; store.projectName = d.name || 'Project'; store.filePath = filePath || null;
  for (const p of PAGES) if (p.load && d.pages?.[p.id]) p.load(d.pages[p.id]);
  applySettings(); renderTop(); renderNav(); go(d.page || 'home');
}
async function newProject() {
  for (const p of PAGES) if (p.reset) p.reset();
  store.filePath = null; store.projectName = 'Untitled project'; go('home'); toast(t('New project'));
}
export async function saveProject(asNew, forcePath) {
  const fp = await window.host.saveProject({ json: projectJSON(), filePath: forcePath || (asNew ? null : store.filePath), name: store.projectName });
  if (fp) { store.filePath = fp; toast(t('Saved') + ': ' + fp); }
  return fp;
}
export async function openProject(fp) {
  const r = await window.host.openProject(fp); if (!r) return null;
  try { loadProjectJSON(r.json, r.filePath); toast(t('Opened') + ': ' + r.filePath); } catch (e) { toast(e.message, 'error'); }
  return r;
}
export async function exportReport(outPath) {
  if (!current?.getReport) { toast(t('This page has no report.'), 'error'); return null; }
  const rep = current.getReport(); if (!rep) { toast(t('Nothing to report yet — solve first.'), 'error'); return null; }
  const html = reportHTML(rep, { version: info.version, mode: store.settings.mode, props: '6.6 (WASM)' });
  const r = await window.host.exportPdf({ html, name: (rep.title || 'report').replace(/[^\w\- ]+/g, '').trim(), outPath });
  if (r && !outPath) toast(t('Report saved') + ': ' + r.path);
  return r;
}
window.__mamba = { go, saveProject, openProject, exportReport, loadProjectJSON, pageById, currentPage, store };

async function boot() {
  try { const s = JSON.parse(localStorage.getItem('mamba-settings') || 'null'); if (s) store.settings = { ...store.settings, ...s }; } catch {}
  info = await window.host.appInfo();
  document.getElementById('ver').textContent = 'v' + info.version;
  const wasm = await window.host.readAsset('vendor/coolprop/coolprop.wasm');
  await initProps(() => CoolPropModule({ wasmBinary: wasm }));
  applySettings(); renderTop(); renderNav();
  if (info.openFile) await openProject(info.openFile);
  else go(info.selftest ? 'home' : (localStorage.getItem('mamba-last-page') || 'home'));
  if (info.selftest || info.shots) runSelftest(window.__mamba);
}
boot().catch(e => { document.getElementById('main').innerHTML = '<div class="msg error">Startup failed: ' + e.message + '</div>'; console.error(e); if (window.host) window.host.selftestDone({ ok: false, report: { lines: ['boot failed: ' + e.stack] } }); });
