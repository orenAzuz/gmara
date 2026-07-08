const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gmara', {
  fetchText: (ref) => ipcRenderer.invoke('sefaria:text', ref),
  fetchLinks: (ref) => ipcRenderer.invoke('sefaria:links', ref)
});
