const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Auto-update API
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  startDownload: () => ipcRenderer.invoke('start-download'),
  installUpdate: () => ipcRenderer.invoke('quit-and-install'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
});
