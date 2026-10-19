// Electron main process for Mamba Engineering.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const argv = process.argv.slice(1);
const selftestDir = process.env.MAMBA_SELFTEST || (argv.find(a => a.startsWith('--selftest=')) || '').split('=')[1] || '';
const shotsDir = process.env.MAMBA_SHOTS || '';
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700, backgroundColor: '#0f1724', show: !selftestDir || !!process.env.MAMBA_SHOW,
    title: 'Mamba Engineering',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { selftest: selftestDir ? '1' : '', shots: shotsDir ? '1' : '' } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.MAMBA_DEVTOOLS) win.webContents.openDevTools();
}

ipcMain.handle('read-asset', (e, rel) => {
  const p = path.join(__dirname, rel);
  if (!p.startsWith(__dirname)) throw new Error('bad path');
  return fs.readFileSync(p);
});
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, selftest: !!selftestDir, shots: !!shotsDir, openFile: argv.find(a => a.toLowerCase().endsWith('.mep') && fs.existsSync(a)) || null }));
ipcMain.handle('save-project', async (e, { json, filePath, name }) => {
  let fp = filePath;
  if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'project') + '.mep', filters: [{ name: 'Mamba Engineering project', extensions: ['mep'] }] }); if (r.canceled) return null; fp = r.filePath; }
  fs.writeFileSync(fp, json, 'utf8'); return fp;
});
ipcMain.handle('open-project', async (e, fp) => {
  if (!fp) { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Mamba Engineering project', extensions: ['mep', 'json'] }], properties: ['openFile'] }); if (r.canceled) return null; fp = r.filePaths[0]; }
  return { filePath: fp, json: fs.readFileSync(fp, 'utf8') };
});
ipcMain.handle('save-text', async (e, { text, name, ext }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (r.canceled) return null;
  fs.writeFileSync(r.filePath, text, 'utf8'); return r.filePath;
});
ipcMain.handle('export-pdf', async (e, { html, name, outPath }) => {
  const tmp = path.join(os.tmpdir(), 'mamba-report-' + Date.now() + '.html');
  const katexCss = 'file:///' + path.join(__dirname, 'vendor', 'katex', 'katex.min.css').replace(/\\/g, '/');
  fs.writeFileSync(tmp, html.replace('%%KATEX_CSS%%', katexCss), 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 400));
  const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'custom', top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666">Mamba Engineering report — page <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  w.destroy(); try { fs.unlinkSync(tmp); } catch {}
  let fp = outPath;
  if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'report') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled) return null; fp = r.filePath; }
  fs.writeFileSync(fp, pdf);
  if (!outPath) shell.openPath(fp);
  return { path: fp, bytes: pdf.length };
});
ipcMain.handle('capture', async (e, { file }) => {
  const img = await win.webContents.capturePage();
  const dir = selftestDir || shotsDir; if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, file); fs.writeFileSync(fp, img.toPNG()); return fp;
});
ipcMain.handle('selftest-path', (e, file) => { if (!selftestDir && !shotsDir) return null; const d = selftestDir || shotsDir; fs.mkdirSync(d, { recursive: true }); return path.join(d, file); });
ipcMain.handle('selftest-done', (e, { ok, report }) => {
  const d = selftestDir || shotsDir;
  if (d) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'selftest.json'), JSON.stringify(report, null, 2)); fs.writeFileSync(path.join(d, 'mamba-selftest.txt'), (ok ? 'SELFTEST OK' : 'SELFTEST FAILED') + '\n' + report.lines.join('\n')); }
  setTimeout(() => app.exit(ok ? 0 : 1), 200);
});
ipcMain.handle('open-external', (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => { if (selftestDir) { try { fs.mkdirSync(selftestDir, { recursive: true }); fs.writeFileSync(path.join(selftestDir, 'mamba-selftest.txt'), 'SELFTEST CRASH ' + err.stack); } catch {} app.exit(2); } });
if (selftestDir) setTimeout(() => { try { fs.mkdirSync(selftestDir, { recursive: true }); fs.writeFileSync(path.join(selftestDir, 'mamba-selftest.txt'), 'SELFTEST TIMEOUT'); } catch {} app.exit(3); }, 240000);
