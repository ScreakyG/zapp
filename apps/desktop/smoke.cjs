// Smoke test of the Electron shell: `pnpm --filter @zapp/desktop smoke`.
// Starts the app, then checks from the page that a server sending no CORS headers can be read
// and that secrets round-trip through safeStorage. Prints a JSON report and quits.
const { app } = require('electron');

require('./main.cjs');

const CHECK = `(async () => {
  const report = {};
  try {
    const r = await fetch('http://example.com/');
    report.corsFreeFetch = r.ok;
  } catch (e) {
    report.corsFreeFetch = 'failed: ' + e.message;
  }
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
