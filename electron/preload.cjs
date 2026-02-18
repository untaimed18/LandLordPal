const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Database API
  dbLoad: () => ipcRenderer.invoke('db:load'),
  dbSave: (state) => ipcRenderer.invoke('db:save', state),
  dbBatch: (operations) => ipcRenderer.invoke('db:batch', operations),

  // Auto-update API
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  startDownload: () => ipcRenderer.invoke('start-download'),
  installUpdate: () => ipcRenderer.invoke('quit-and-install'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
