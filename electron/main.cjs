const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { initDatabase, loadAll, replaceAll, executeBatch, closeDatabase, copyFileToDocuments, deleteDocumentFile, getDocumentPath, getEncryptionKeyError } = require('./database.cjs');
const { dialog, shell } = require('electron');
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
      sandbox: true,
    },
  });

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
        ],
      },
    });
  });

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow.webContents.getURL();
    if (url !== currentURL) {
      event.preventDefault();
    }
  });

  // Block new-window requests
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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

async function setupDatabase() {
  const userDataPath = app.getPath('userData');
  await initDatabase(userDataPath);

  ipcMain.handle('encryption-key-error', () => {
    return getEncryptionKeyError();
  });

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

  ipcMain.handle('doc:pick-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const sourcePath = result.filePaths[0];
    const originalName = require('path').basename(sourcePath);
    const mimeTypes = {
      '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv', '.txt': 'text/plain',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    };
    const ext = require('path').extname(sourcePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const { filename, size } = copyFileToDocuments(sourcePath);
      return { filename, originalName, size, mimeType };
    } catch (err) {
      log.error('doc:pick-file failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('doc:delete-file', (_event, filename) => {
    deleteDocumentFile(filename);
    return true;
  });

  ipcMain.handle('doc:open-file', (_event, filename) => {
    const filePath = getDocumentPath(filename);
    if (!filePath) return false;
    shell.openPath(filePath);
    return true;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await setupDatabase();
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
