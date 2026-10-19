// Built-in smoke test (MAMBA_SELFTEST=dir) and screenshot run (MAMBA_SHOTS=dir).
import { PAGES } from './pages/index.js';
import { TEMPLATES, resetIds } from '../thermo/flowsheet.js';
const wait = (ms) => new Promise(r => requestAnimationFrame(() => setTimeout(r, ms)));
const _w0 = (ms) => new Promise(r => setTimeout(r, ms));
const SHOTS = { home: '01-home', canvas: '02-canvas-rankine', equations: '04-equation-editor', engines: '05-otto-engine', proptables: '06-property-tables', parametric: '07-parametric', 'heat-wall': '08-composite-wall', 'heat-lumped': '09-lumped-cooling', 'heat-fin': '10-fin', 'mech-mohr': '11-mohr', 'mech-fits': '12-iso286-fits', 'mech-bolt': '13-bolted-joint', 'mech-shaft': '14-shaft-fatigue', 'mech-bearing': '15-bearing', 'mech-gear': '16-spur-gears', 'mech-spring': '17-spring', about: '18-about-validation' };
export async function runSelftest(m) {
  const lines = []; let ok = true;
  const log = (pass, msg) => { lines.push((pass ? 'PASS ' : 'FAIL ') + msg); if (!pass) ok = false; };
  const errs = []; window.addEventListener('error', (e) => errs.push(e.message)); window.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason?.stack || e.reason)));
  try {
    for (const p of PAGES) {
      m.go(p.id); await wait(p.id === 'canvas' || p.id === 'engines' ? 1500 : 700);
      const pageErr = [...document.querySelectorAll('#main .msg.error')].map(e => e.textContent);
      log(!pageErr.length, `page ${p.id} renders${pageErr.length ? ': ' + pageErr.join(' | ') : ''}`);
      if (p.id === 'canvas') { const r = p.res; log(r?.ok && Math.abs(r.values.eta_th - 0.26) < 0.005, `canvas Rankine template solves, η = ${r?.values?.eta_th?.toFixed(4)} (Çengel 0.26)`); }
      if (p.id === 'equations') { const r = p.solveNow(); log(r.ok && Math.abs(r.values.eta_th - 0.26) < 0.005, `equation editor Rankine example, η = ${r.values.eta_th?.toFixed(4)}`); p.doSolve?.(); await wait(400); }
      if (p.id === 'engines') { const r = p.res; log(r?.ok && Math.abs(r.values.eta_th - 0.525) < 0.01, `Otto cycle η = ${r?.values?.eta_th?.toFixed(4)} (Çengel ≈ 0.523)`); }
      if (p.id === 'parametric') { p.runAndDraw?.(); await wait(300); log(p.rows && p.rows.filter(r => r.ok).length >= p.rows.length - 1, `parametric table ${p.rows?.filter(r => r.ok).length}/${p.rows?.length} rows`); }
      if (p.out !== undefined && p.values) log(!!p.out && !p.err, `${p.id} computes${p.err ? ': ' + p.err : ''}`);
      if (SHOTS[p.id]) await window.host.capture({ file: SHOTS[p.id] + '.png' });
      if (p.id === 'canvas') { const mn = document.getElementById('main'); mn.scrollTop = 560; await wait(500); await window.host.capture({ file: '02b-canvas-diagrams.png' }); mn.scrollTop = 0;
        const tab = [...document.querySelectorAll('#main .tab')].find(e => e.textContent.trim() === 'Parametric sweep'); tab?.click(); await wait(300);
        const btn = [...document.querySelectorAll('#main button')].find(e => e.textContent.includes('Run sweep')); btn?.click(); await wait(1200);
        const sw = p.sweep?.rows || []; log(sw.length >= 10 && sw.filter(r => Number.isFinite(r.y)).length >= sw.length - 1, `canvas parametric sweep ${sw.filter(r => Number.isFinite(r.y)).length}/${sw.length} points`);
        mn.scrollTop = mn.scrollHeight; await wait(600); await window.host.capture({ file: '02c-canvas-sweep.png' }); mn.scrollTop = 0;
        const n0 = p.fs.components.length; const pal = [...document.querySelectorAll('#main .pal-item')].find(e => e.textContent.includes('Heater')); pal?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(400);
        log(p.fs.components.length === n0 + 1, 'palette adds a component (double-click)'); p.fs = TEMPLATES.rankine(); resetIds(p.fs); m.go('canvas'); await wait(800); }
      if (p.id === 'heat-wall') { p.values.geometry = 'cylinder'; p.values.r_in = 1.5; p.values.L = 5; p.values.inner = 'Q'; p.values.Q = 80; p.values.T_out = 30; p.values.h_out = 12; p.values.layers = [{ name: 'Plastic insulation (wire)', k: 0.15, t: 2 }]; m.go(p.id); await wait(800); log(Math.abs(p.out.results.r_cr.v - 12.5) < 0.01, `wire insulation r_cr = ${p.out.results.r_cr.v} mm`); await window.host.capture({ file: '08b-pipe-insulation.png' }); p.reset(); }
    }
    // extra canvas screens: refrigeration + Brayton templates
    m.go('canvas'); const cv = m.pageById('canvas');
    for (const [tpl, shot, key, want, tol] of [['vcr', '03-canvas-refrigeration', 'COP_R', 3.97, 0.05], ['brayton', '03b-canvas-brayton', 'eta_th', 0.426, 0.005]]) {
      cv.fs = TEMPLATES[tpl](); resetIds(cv.fs); m.go('canvas'); await wait(1500); const r = cv.res; log(r?.ok && Math.abs(r.values[key] - want) < tol, `canvas ${tpl}: ${key} = ${r?.values?.[key]?.toFixed(4)} (ref ${want})`); await window.host.capture({ file: shot + '.png' });
    }
    // languages: Arabic (RTL) and Swedish
    const setLangUI = async (l) => { const sel = document.querySelector('#topActions select'); sel.value = l; sel.dispatchEvent(new Event('change')); await wait(900); };
    m.go('heat-wall'); await setLangUI('ar'); log(document.documentElement.dir === 'rtl' && document.body.textContent.includes('المدخلات'), 'Arabic UI with RTL layout'); await window.host.capture({ file: '19-arabic-rtl.png' });
    m.go('mech-bolt'); await setLangUI('sv'); log(document.body.textContent.includes('Indata'), 'Swedish UI'); await window.host.capture({ file: '20-swedish.png' });
    await setLangUI('en');
    // PDF report
    cv.fs = TEMPLATES.rankine(); resetIds(cv.fs); m.go('canvas'); await wait(1200);
    const pdf = await window.host.selftestPath('report-canvas.pdf'); const r1 = await m.exportReport(pdf); log(r1 && r1.bytes > 10000, `PDF report canvas (${r1?.bytes} bytes)`);
    m.go('mech-bolt'); await wait(600);
    const pdf2 = await window.host.selftestPath('report-bolt.pdf'); const r2 = await m.exportReport(pdf2); log(r2 && r2.bytes > 10000, `PDF report bolted joint (${r2?.bytes} bytes)`);
    // project save / load round-trip
    const ep = m.pageById('engines'); ep.vals.otto.r = 9.5;
    const fp = await window.host.selftestPath('roundtrip.mep'); await m.saveProject(false, fp);
    ep.vals.otto.r = 4; await m.openProject(fp); await wait(800);
    log(m.pageById('engines').vals.otto.r === 9.5, 'project save/load round-trip');
    m.pageById('engines').vals.otto.r = 8;
    log(!errs.length, 'no uncaught errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  } catch (e) { log(false, 'selftest exception: ' + e.stack); }
  await window.host.selftestDone({ ok, report: { lines } });
}
