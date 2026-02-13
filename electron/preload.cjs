// Minimal preload script with context isolation enabled.
// No custom APIs are exposed — the app uses only localStorage
// which is available in the renderer by default.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
