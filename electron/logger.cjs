const electronLog = require('electron-log/main');

electronLog.initialize();

electronLog.transports.file.level = 'info';
electronLog.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
electronLog.transports.console.level = 'debug';

module.exports = {
  debug: electronLog.debug.bind(electronLog),
  info: electronLog.info.bind(electronLog),
  warn: electronLog.warn.bind(electronLog),
  error: electronLog.error.bind(electronLog),
};
