const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Database API
  dbLoad: () => ipcRenderer.invoke('db:load'),
  dbSave: (state) => ipcRenderer.invoke('db:save', state),
  dbBatch: (operations) => ipcRenderer.invoke('db:batch', operations),
  dbBackup: (path) => ipcRenderer.invoke('db:backup', path),

  // Document attachments
  docPickFile: () => ipcRenderer.invoke('doc:pick-file'),
  docDeleteFile: (filename) => ipcRenderer.invoke('doc:delete-file', filename),
  docOpenFile: (filename) => ipcRenderer.invoke('doc:open-file', filename),

  // Photos
  photoPick: () => ipcRenderer.invoke('photo:pick'),
  photoDelete: (filename) => ipcRenderer.invoke('photo:delete', filename),
  photoGetPath: (filename) => ipcRenderer.invoke('photo:get-path', filename),
  backupExportAssets: (request) => ipcRenderer.invoke('backup:export-assets', request),
  backupReplaceAssets: (assets) => ipcRenderer.invoke('backup:replace-assets', assets),
  settingsSave: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Security
  getEncryptionKeyError: () => ipcRenderer.invoke('encryption-key-error'),

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
