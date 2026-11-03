// Real-profile playback probe. Only aggregate media metrics leave the renderer.
// Set ZAPP_DIAG_PROFILE to an isolated copy before running `electron perf.cjs`.
const { app } = require('electron');
if (!process.env.ZAPP_DIAG_PROFILE) throw new Error('ZAPP_DIAG_PROFILE is required');
app.setPath('userData', process.env.ZAPP_DIAG_PROFILE);
require(process.env.ZAPP_DIAG_BUILD || './main.cjs');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => {
  console.log('[PERF] timeout');
  app.exit(2);
}, 90000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    const run = (code) => win.webContents.executeJavaScript(code);
    try {
      console.log(
        '[PERF] source=' +
          (await run(
            "JSON.parse(localStorage.getItem('zapp.settings.v1') || '{}').source?.kind || 'demo'",
          )),
      );
      for (let n = 0; n < 45; n++) {
        if (await run("!!document.querySelector('.home-tile, .player')")) break;
        await wait(1000);
      }
      console.log(
        '[PERF] ui=' +
          (await run(
            "JSON.stringify({tiles:document.querySelectorAll('.home-tile').length, player:!!document.querySelector('.player')})",
          )),
      );
      if (!(await run("!!document.querySelector('.home-tile, .player')"))) {
        require('node:fs').writeFileSync(
          require('node:path').join(app.getPath('userData'), 'screen.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
        console.log('[PERF] no channels available; screenshot saved in diagnostic profile');
        app.exit(2);
        return;
      }
      if (!(await run("!!document.querySelector('.player')"))) {
        await run(
          "(document.querySelectorAll('.home-tile')[2] || document.querySelector('.home-tile'))?.click()",
        );
      }
      const channel = process.env.ZAPP_DIAG_CHANNEL;
      if (channel && /^\d+$/.test(channel)) {
        await run(
          `for (const key of ${JSON.stringify(channel)}) window.dispatchEvent(new KeyboardEvent('keydown', {key}));`,
        );
        await wait(2500);
      }
      console.log('[PERF] sampling');
      const result = await run(`new Promise(resolve => {
        const samples = [], events = [];
        let video, started = false;
        const tick = setInterval(() => {
          const v = document.querySelector('video');
          if (v && v !== video) {
            video = v;
            for (const type of ['waiting', 'stalled', 'seeking', 'playing', 'error'])
              v.addEventListener(type, () => events.push({type, at: samples.length, time: v.currentTime}));
          }
          if (v) {
            const q = v.getVideoPlaybackQuality();
            let ahead = 0;
            for (let i = 0; i < v.buffered.length; i++)
              if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime)
                ahead = v.buffered.end(i) - v.currentTime;
            started ||= v.currentTime > 0;
            samples.push({time: v.currentTime, ready: v.readyState, ahead,
              dropped: q.droppedVideoFrames, total: q.totalVideoFrames,
              width: v.videoWidth, rate: v.playbackRate, error: v.error?.code});
          } else samples.push({missing: true});
          if (samples.length === 80) {
            clearInterval(tick);
            resolve({started, samples, events});
          }
        }, 250);
      })`);
      const last = result.samples.at(-1);
      const stalls = result.events.filter((e) => e.type === 'waiting' && e.time > 1).length;
      const drops = last.total ? last.dropped / last.total : 0;
      const passed = result.started && last.time > 10 && stalls === 0 && drops < 0.02;
      require('node:fs').writeFileSync(
        require('node:path').join(app.getPath('userData'), 'metrics.json'),
        JSON.stringify({ passed, stalls, drops, ...result }, null, 2),
      );
      console.log(
        '[PERF]' +
          JSON.stringify({
            passed,
            stalls,
            drops,
            started: result.started,
            last,
            events: result.events,
          }),
      );
      require('node:timers').clearTimeout(timeout);
      app.exit(passed ? 0 : 1);
    } catch {
      console.log('[PERF] probe failed (details withheld to protect source credentials)');
      app.exit(2);
    }
  });
});
