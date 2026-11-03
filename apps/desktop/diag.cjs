// Playback diagnosis on the user's real profile: `electron diag.cjs [channelCount]`.
// Loads the installed app's settings (%APPDATA%/@zapp/desktop), opens the first channels one by one and
// prints what happened. URLs, hosts and credentials are redacted from the report.
const { app, session } = require('electron');
const path = require('node:path');

// A copy of the app's profile (ZAPP_DIAG_PROFILE), so the live one — possibly locked by a running
// Zapp, in which case Chromium silently falls back to an empty in-memory storage — is never used.
app.setPath(
  'userData',
  process.env.ZAPP_DIAG_PROFILE || path.join(app.getPath('appData'), '@zapp', 'desktop'),
);
require('./main.cjs');

const TRIES = Number(process.argv[2] || 3);
const redact = (text) =>
  String(text)
    .replace(/https?:\/\/[^\s"')]+/g, (url) => {
      const ext = (url.split(/[?#]/)[0].match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
      return `<URL${ext}>`;
    })
    .slice(0, 300);

const network = [];
const consoleLines = [];

app.on('browser-window-created', (_e, win) => {
  session.defaultSession.webRequest.onCompleted({ urls: ['http://*/*', 'https://*/*'] }, (d) => {
    network.push(`${d.method} ${redact(d.url)} ${d.statusCode} ${d.resourceType}`);
  });
  session.defaultSession.webRequest.onErrorOccurred(
    { urls: ['http://*/*', 'https://*/*'] },
    (d) => {
      network.push(`${d.method} ${redact(d.url)} ERROR ${d.error}`);
    },
  );
  win.webContents.on('console-message', (event) => {
    consoleLines.push(`[${event.level}] ${redact(event.message)}`);
  });
  win.webContents.once('did-finish-load', async () => {
    const run = (js) => win.webContents.executeJavaScript(js);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const report = {};
    try {
      const settings = JSON.parse((await run(`localStorage.getItem('zapp.settings.v1')`)) || '{}');
      report.sourceKind = settings.source?.kind ?? 'demo';
      report.userData = app.getPath('userData').replace(/^.*AppData/, '…AppData');
      report.page = (await run('location.href')).replace(/^.*?(app.asar|packages)/, '…$1');
      report.storageKeys = await run('Object.keys(localStorage)');
      report.groups = settings.groups;
      // Wait for channels.
      for (let i = 0; i < 60; i++) {
        if (await run(`!!document.querySelector('.home-tile, .player')`)) break;
        await wait(1000);
      }
      report.onPlayerAtStart = await run(`!!document.querySelector('.player')`);
      report.homeRows = await run(
        `[...document.querySelectorAll('.home-row-title')].map(h => h.textContent).join(' | ')`,
      );
      report.attempts = [];
      for (let n = 0; n < TRIES; n++) {
        const before = network.length;
        // From home: OK opens the focused tile; from the player: ↑ zaps to the next channel.
        const key = (await run(`!!document.querySelector('.player')`)) ? 'ArrowUp' : 'Enter';
        await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}' }))`);
        await wait(15000);
        report.attempts.push(
          await run(`(() => {
            const v = document.querySelector('video');
            return {
              channel: document.querySelector('.zap-name')?.textContent ?? null,
              bannerLine: document.querySelector('.zap-line')?.textContent ?? null,
              video: v && { readyState: v.readyState, networkState: v.networkState, currentTime: Math.round(v.currentTime * 10) / 10, width: v.videoWidth, error: v.error && v.error.code + ' ' + v.error.message },
            };
          })()`),
        );
        report.attempts[n].requests = network.slice(before, before + 12);
      }
    } catch (error) {
      report.failure = String(error);
    }
    report.console = consoleLines.slice(-25);
    console.log('[DIAG]' + JSON.stringify(report, null, 2));
    app.exit(0);
  });
});
