// Electron shell for Zapp on PC (#20): the same 10-foot UI, full screen, with what a browser page
// cannot do for IPTV — reading streams that send no CORS headers, choosing the User-Agent, and
// keeping credentials encrypted with the OS keychain (safeStorage).
const { app, BrowserWindow, ipcMain, safeStorage, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/** Set ZAPP_DEV_URL=http://localhost:5173 to run against `pnpm dev`. */
const DEV_URL = process.env.ZAPP_DEV_URL;
/** Many IPTV panels only serve players they know; VLC's is the most widely accepted. */
const USER_AGENT = process.env.ZAPP_USER_AGENT || 'VLC/3.0.20 LibVLC/3.0.20';

function uiEntry() {
  // Packaged: copied next to this file by electron-builder. Unpackaged: the UI build output.
  const packaged = path.join(__dirname, 'ui', 'index.html');
  return fs.existsSync(packaged)
    ? packaged
    : path.join(__dirname, '..', '..', 'packages', 'ui', 'dist', 'index.html');
}

function allowIptvRequests() {
  const iptv = { urls: ['http://*/*', 'https://*/*'] };
  // The app's own pages (dev server) are left alone.
  const own = (url) => DEV_URL && url.startsWith(DEV_URL);

  session.defaultSession.webRequest.onBeforeSendHeaders(iptv, (details, callback) => {
    if (own(details.url)) return callback({ requestHeaders: details.requestHeaders });
    callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': USER_AGENT } });
  });

  // Providers send no CORS headers: add them, rather than turning web security off.
  session.defaultSession.webRequest.onHeadersReceived(iptv, (details, callback) => {
    if (own(details.url)) return callback({ responseHeaders: details.responseHeaders });
    const headers = { ...details.responseHeaders };
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase().startsWith('access-control-')) delete headers[name];
    }
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    callback({ responseHeaders: headers });
  });
}

/** Secrets file: { name: base64 of the safeStorage-encrypted value }. */
function secretsFile() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(secretsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function handleSecrets() {
  ipcMain.handle('secrets:get', async (_event, name) => {
    const stored = readSecrets()[name];
    if (!stored || !(await safeStorage.isAsyncEncryptionAvailable())) return undefined;
    try {
      const { result } = await safeStorage.decryptStringAsync(Buffer.from(stored, 'base64'));
      return result;
    } catch {
      return undefined;
    }
  });
  ipcMain.handle('secrets:set', async (_event, name, value) => {
    const secrets = readSecrets();
    if (value === undefined || value === null || value === '') {
      delete secrets[name];
    } else {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error('Chiffrement indisponible');
      }
      secrets[name] = (await safeStorage.encryptStringAsync(String(value))).toString('base64');
    }
    fs.mkdirSync(path.dirname(secretsFile()), { recursive: true });
    fs.writeFileSync(secretsFile(), JSON.stringify(secrets), { mode: 0o600 });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: !DEV_URL,
    backgroundColor: '#0b0b0d',
    autoHideMenuBar: true,
    title: 'Zapp',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  // F11 toggles full screen. Escape is the remote's Back in the app, so it must not leave it.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // External links never open inside the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(uiEntry());
}

app.whenReady().then(() => {
  allowIptvRequests();
  handleSecrets();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
