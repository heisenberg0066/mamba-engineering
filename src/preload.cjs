const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('host', {
  readAsset: (rel) => ipcRenderer.invoke('read-asset', rel),
  appInfo: () => ipcRenderer.invoke('app-info'),
  saveProject: (o) => ipcRenderer.invoke('save-project', o),
  openProject: (fp) => ipcRenderer.invoke('open-project', fp),
  saveText: (o) => ipcRenderer.invoke('save-text', o),
  exportPdf: (o) => ipcRenderer.invoke('export-pdf', o),
  capture: (o) => ipcRenderer.invoke('capture', o),
  selftestPath: (f) => ipcRenderer.invoke('selftest-path', f),
  selftestDone: (o) => ipcRenderer.invoke('selftest-done', o),
  openExternal: (u) => ipcRenderer.invoke('open-external', u),
});
