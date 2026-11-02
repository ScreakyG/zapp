// Smoke test of the Electron shell: `pnpm --filter @zapp/desktop smoke`.
// Starts the app, then checks from the page that a server sending no CORS headers can be read
// and that secrets round-trip through safeStorage. Prints a JSON report and quits.
const { app } = require('electron');
const os = require('node:os');
const path = require('node:path');

// Keep the user's real profile (and secrets) out of the test.
app.setPath('userData', path.join(os.tmpdir(), 'zapp-smoke'));
require('./main.cjs');

const CHECK = `(async () => {
  const report = {};
  try {
    const r = await fetch('http://example.com/');
    report.corsFreeFetch = r.ok;
  } catch (e) {
    report.corsFreeFetch = 'failed: ' + e.message;
  }
  try {
    // A custom header forces an OPTIONS preflight, which example.com does not answer with CORS.
    const r = await fetch('http://example.com/', { headers: { 'X-Zapp': '1', Range: 'bytes=0-99' } });
    report.preflight = r.ok;
  } catch (e) {
    report.preflight = 'failed: ' + e.message;
  }
  await Promise.all([window.zappSecrets.set('a', '1'), window.zappSecrets.set('b', '2')]);
  report.concurrentSets = (await window.zappSecrets.get('a')) === '1' && (await window.zappSecrets.get('b')) === '2';
  report.unknownSecret = (await window.zappSecrets.get('__proto__')) === undefined;
  await window.zappSecrets.set('smoke', 'p@ss');
  report.secretRoundTrip = (await window.zappSecrets.get('smoke')) === 'p@ss';
  await window.zappSecrets.set('smoke', undefined);
  report.secretCleared = (await window.zappSecrets.get('smoke')) === undefined;
  report.ui = !!document.querySelector('.stage');
  return report;
})()`;

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    let code = 0;
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const report = await win.webContents.executeJavaScript(CHECK);
      console.log(JSON.stringify(report));
      if (!Object.values(report).every((v) => v === true)) code = 1;
    } catch (error) {
      console.error(error);
      code = 1;
    }
    app.exit(code);
  });
});
