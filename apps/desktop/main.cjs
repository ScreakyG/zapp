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

// Every request (fetch, XHR of hls.js/mpegts.js, the native <video>) and navigator.userAgent.
app.userAgentFallback = USER_AGENT;

function uiEntry() {
  // Packaged: copied next to this file by electron-builder. Unpackaged: the UI build output.
  const packaged = path.join(__dirname, 'ui', 'index.html');
  return fs.existsSync(packaged)
    ? packaged
    : path.join(__dirname, '..', '..', 'packages', 'ui', 'dist', 'index.html');
}

/** The app's own pages: the packaged UI, or the dev server. */
function isOwn(url) {
  return url.startsWith('file://') || (!!DEV_URL && url.startsWith(DEV_URL));
}

function allowIptvRequests() {
  const iptv = { urls: ['http://*/*', 'https://*/*'] };
  // Providers send no CORS headers: add them, rather than turning web security off.
  session.defaultSession.webRequest.onHeadersReceived(iptv, (details, callback) => {
    if (isOwn(details.url)) return callback({ responseHeaders: details.responseHeaders });
    const headers = { ...details.responseHeaders };
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase().startsWith('access-control-')) delete headers[name];
    }
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    // Range loaders read Content-Range and friends.
    headers['Access-Control-Expose-Headers'] = ['*'];
    // A preflight only passes with a 2xx status, and many IPTV servers reject OPTIONS.
    if (details.method === 'OPTIONS') {
      return callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
    }
    callback({ responseHeaders: headers });
  });
  // The UI needs no camera, microphone, notifications…
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
}

/** Secrets file: { name: base64 of the safeStorage-encrypted value }. */
function secretsFile() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function readSecrets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsFile(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Atomic write: a crash never leaves a half-written file that would read as "no secrets". */
function writeSecrets(secrets) {
  const file = secretsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(secrets));
  fs.renameSync(`${file}.tmp`, file);
}

/** Writes run one after another so overlapping sets never lose an update. */
let writes = Promise.resolve();
function queueWrite(update) {
  const next = writes.then(update);
  writes = next.catch(() => {});
  return next;
}

function fromOwnPage(event) {
  return isOwn(event.senderFrame?.url ?? '');
}

function setSecret(name, value) {
  return queueWrite(async () => {
    const clear = value === undefined || value === null || value === '';
    let encrypted;
    if (!clear) {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error('Chiffrement indisponible');
      }
      encrypted = (await safeStorage.encryptStringAsync(String(value))).toString('base64');
    }
    // Read after the await so a write queued meanwhile is not overwritten.
    const secrets = readSecrets();
    if (clear) delete secrets[name];
    else secrets[name] = encrypted;
    writeSecrets(secrets);
  });
}

function handleSecrets() {
  ipcMain.handle('secrets:get', async (event, name) => {
    if (!fromOwnPage(event) || typeof name !== 'string') return undefined;
    const secrets = readSecrets();
    if (!Object.hasOwn(secrets, name) || !(await safeStorage.isAsyncEncryptionAvailable())) {
      return undefined;
    }
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
        Buffer.from(secrets[name], 'base64'),
      );
      if (shouldReEncrypt) void setSecret(name, result).catch(() => {});
      return result;
    } catch {
      return undefined;
    }
  });
  ipcMain.handle('secrets:set', async (event, name, value) => {
    if (!fromOwnPage(event) || typeof name !== 'string') return;
    await setSecret(name, value);
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
  // The window only ever shows the app: the preload hands secrets to whatever page it holds.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isOwn(url)) event.preventDefault();
  });
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
