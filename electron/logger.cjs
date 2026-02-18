let _isProd;

function isProd() {
  if (_isProd === undefined) {
    try { _isProd = require('electron').app.isPackaged; } catch { _isProd = false; }
  }
  return _isProd;
}

const noop = () => {};

module.exports = {
  debug(...args) { if (!isProd()) console.debug('[debug]', ...args); },
  info(...args) { if (!isProd()) console.info('[info]', ...args); },
  warn: console.warn.bind(console, '[warn]'),
  error: console.error.bind(console, '[error]'),
};
