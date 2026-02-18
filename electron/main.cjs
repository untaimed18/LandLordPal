const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { initDatabase, loadAll, replaceAll, executeBatch, closeDatabase } = require('./database.cjs');
const log = require('./logger.cjs');

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
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'untaimed18',
    repo: 'LandLordPal',
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = app.isPackaged ? null : console;

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
    sendUpdateStatus('downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    const msg = err ? err.message : 'Unknown update error';
    log.error('Auto-updater error:', msg);
    sendUpdateStatus('error', { message: msg });
  });

  ipcMain.handle('start-download', () => {
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    closeDatabase();
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('check-for-updates', () => {
    return autoUpdater.checkForUpdates().catch((err) => {
      log.error('Manual check-for-updates failed:', err.message);
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Auto check-for-updates failed:', err.message);
    });
  }, 5000);
}

// ─── Database IPC handlers ───────────────────────────────────────────────────

function setupDatabase() {
  const userDataPath = app.getPath('userData');
  initDatabase(userDataPath);

  ipcMain.handle('db:load', () => {
    try {
      const data = loadAll();
      const counts = Object.entries(data).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      log.info('Database loaded —', counts);
      return data;
    } catch (err) {
      log.error('db:load failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('db:save', (_event, state) => {
    try {
      replaceAll(state);
      return true;
    } catch (err) {
      log.error('db:save failed:', err.message);
      return false;
    }
  });

  ipcMain.handle('db:batch', (_event, operations) => {
    try {
      executeBatch(operations);
      return true;
    } catch (err) {
      log.error('db:batch failed:', err.message);
      return false;
    }
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupDatabase();
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  closeDatabase();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
