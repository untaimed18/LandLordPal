const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Keep a global reference so the window isn't garbage-collected
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'LandLord Pal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In production, load the built files from dist/
  // In development, load from the Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Auto-updater setup ──────────────────────────────────────────────────────

function sendUpdateStatus(event, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { event, ...data });
  }
}

function setupAutoUpdater() {
  // Explicitly set the feed URL so the updater works even without
  // the auto-generated app-update.yml (e.g. in dev, or when the
  // installed app was built before the publish config was added).
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'untaimed18',
    repo: 'LandLordPal',
  });

  // Don't auto-download — let the user choose
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log updater events for debugging
  autoUpdater.logger = require('electron').app.isPackaged ? null : console;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking', {});
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate: info.releaseDate || '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('not-available', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    const msg = err ? err.message : 'Unknown update error';
    console.error('Auto-updater error:', msg);
    sendUpdateStatus('error', { message: msg });
  });

  // IPC handlers from renderer
  ipcMain.handle('start-download', () => {
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('check-for-updates', () => {
    return autoUpdater.checkForUpdates().catch((err) => {
      console.error('Manual check-for-updates failed:', err.message);
    });
  });

  // Check for updates after a short delay so the window is fully loaded
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Auto check-for-updates failed:', err.message);
    });
  }, 5000);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

// Quit when all windows are closed (Windows & Linux behavior)
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
