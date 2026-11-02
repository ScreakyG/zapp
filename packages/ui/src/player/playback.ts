import { createSignal } from 'solid-js';
import { detectCaps, engineOrder, streamFormat, type EngineName } from './engines';

export type PlaybackStatus =
  | { state: 'idle' }
  | { state: 'loading'; engine: EngineName }
  | { state: 'playing'; engine: EngineName }
  | { state: 'error'; message: string };

/** A started engine; `destroy` detaches it from the <video>. */
interface Session {
  destroy(): void;
}

/** If nothing plays within this delay, the engine is considered failed and the next one tried. */
const START_TIMEOUT = 12_000;

/**
 * One <video> element, several engines: plays a stream URL with the first engine that works for
 * this platform and format (see engineOrder), falling back to the next one on error.
 * The JS players are loaded on demand so the TV only downloads what it uses.
 */
export function createPlayback(video: HTMLVideoElement) {
  const caps = detectCaps();
  const [status, setStatus] = createSignal<PlaybackStatus>({ state: 'idle' });
  let session: Session | undefined;
  /** Bumped on each play/stop so late callbacks of an abandoned attempt are ignored. */
  let generation = 0;

  const stop = () => {
    generation++;
    session?.destroy();
    session = undefined;
    video.removeAttribute('src');
    video.load();
    setStatus({ state: 'idle' });
  };

  const play = async (url: string) => {
    stop();
    const mine = generation;
    if (!url) {
      setStatus({ state: 'error', message: 'Aucun flux pour cette chaîne' });
      return;
    }
    let lastError = 'Flux indisponible';
    for (const engine of engineOrder(streamFormat(url), caps)) {
      if (mine !== generation) return;
      setStatus({ state: 'loading', engine });
      try {
        session = await start(engine, video, url);
        await playing(video, START_TIMEOUT);
        if (mine !== generation) return;
        setStatus({ state: 'playing', engine });
        return;
      } catch (error) {
        session?.destroy();
        session = undefined;
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (mine === generation) setStatus({ state: 'error', message: lastError });
  };

  return { status, play, stop };
}

async function start(engine: EngineName, video: HTMLVideoElement, url: string): Promise<Session> {
  switch (engine) {
    case 'native':
      video.src = url;
      void video.play().catch(() => {});
      return { destroy: () => video.removeAttribute('src') };
    case 'hls.js': {
      const { default: Hls } = await import('hls.js');
      const hls = new Hls({ lowLatencyMode: false });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        // Fatal errors surface as a <video> error so `playing()` rejects.
        if (data.fatal) video.dispatchEvent(new Event('error'));
      });
      void video.play().catch(() => {});
      return { destroy: () => hls.destroy() };
    }
    case 'mpegts.js': {
      const { default: mpegts } = await import('mpegts.js');
      const player = mpegts.createPlayer({ type: 'mpegts', isLive: true, url });
      player.attachMediaElement(video);
      player.on(mpegts.Events.ERROR, () => video.dispatchEvent(new Event('error')));
      player.load();
      void video.play().catch(() => {});
      return {
        destroy: () => {
          player.destroy();
        },
      };
    }
  }
}

/** Resolves when the video actually plays; rejects on error or timeout. */
function playing(video: HTMLVideoElement, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      fn();
    };
    const onPlaying = () => done(resolve);
    const onError = () => done(() => reject(new Error('Flux illisible')));
    const timer = setTimeout(() => done(() => reject(new Error('Flux indisponible'))), timeout);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
  });
}
