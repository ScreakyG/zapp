import { createSignal, getOwner, onCleanup } from 'solid-js';
import {
  detectCaps,
  engineOrder,
  streamFormat,
  type EngineName,
  type PlatformCaps,
} from './engines';

export type PlaybackStatus =
  | { state: 'idle' }
  | { state: 'loading'; engine: EngineName }
  | { state: 'playing'; engine: EngineName }
  | { state: 'error'; message: string };

/** A started engine; `destroy` detaches it from the <video>. */
export interface Session {
  destroy(): void;
}

/** The part of <video> playback uses (a fake one in tests). */
export type VideoLike = Pick<
  HTMLVideoElement,
  'addEventListener' | 'removeEventListener' | 'dispatchEvent' | 'removeAttribute' | 'load'
>;

export type StartEngine = (engine: EngineName, video: VideoLike, url: string) => Promise<Session>;

/** Time for an engine to start playing before the next one is tried; the last one waits longer. */
export const FALLBACK_TIMEOUT = 6_000;
export const LAST_TIMEOUT = 12_000;

/**
 * One <video> element, several engines: plays a stream URL with the first engine that works for
 * this platform and format (see engineOrder), falling back to the next one on error.
 * Every play() or stop() aborts the attempt in flight, so fast zapping never leaves an engine
 * attached or lets a stale attempt tear down the current one.
 */
export function createPlayback(
  video: VideoLike,
  options: { caps?: PlatformCaps; start?: StartEngine } = {},
) {
  const caps = options.caps ?? detectCaps();
  const startEngine = options.start ?? start;
  const [status, setStatus] = createSignal<PlaybackStatus>({ state: 'idle' });
  let session: Session | undefined;
  let attempt: AbortController | undefined;

  const stop = () => {
    attempt?.abort();
    attempt = undefined;
    session?.destroy();
    session = undefined;
    video.removeAttribute('src');
    video.load();
    setStatus({ state: 'idle' });
  };

  const play = async (url: string) => {
    stop();
    const controller = new AbortController();
    attempt = controller;
    const { signal } = controller;
    if (!url) {
      setStatus({ state: 'error', message: 'Aucun flux pour cette chaîne' });
      return;
    }
    const engines = engineOrder(streamFormat(url), caps);
    let lastError = 'Flux indisponible';
    for (const [i, engine] of engines.entries()) {
      if (signal.aborted) return;
      setStatus({ state: 'loading', engine });
      let s: Session | undefined;
      try {
        s = await startEngine(engine, video, url);
        if (signal.aborted) {
          s.destroy();
          return;
        }
        await playing(video, i === engines.length - 1 ? LAST_TIMEOUT : FALLBACK_TIMEOUT, signal);
        session = s;
        setStatus({ state: 'playing', engine });
        watch(video, signal, () => {
          session?.destroy();
          session = undefined;
          setStatus({ state: 'error', message: 'La lecture s’est interrompue' });
        });
        return;
      } catch (error) {
        s?.destroy();
        if (signal.aborted) return;
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    setStatus({ state: 'error', message: lastError });
  };

  if (getOwner()) onCleanup(stop);
  return { status, play, stop };
}

async function start(engine: EngineName, video: VideoLike, url: string): Promise<Session> {
  const media = video as HTMLVideoElement;
  switch (engine) {
    case 'native':
      media.src = url;
      void media.play().catch(() => {});
      return { destroy: () => media.removeAttribute('src') };
    case 'hls.js': {
      const { default: Hls } = await import('hls.js');
      if (!Hls.isSupported()) throw new Error('Flux illisible');
      const hls = new Hls({ lowLatencyMode: false });
      let recovered = false;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        // A decoding hiccup is often recoverable once; anything else fails over.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          hls.recoverMediaError();
          return;
        }
        media.dispatchEvent(new Event('error'));
      });
      hls.attachMedia(media);
      hls.loadSource(url);
      void media.play().catch(() => {});
      return { destroy: () => hls.destroy() };
    }
    case 'mpegts.js': {
      const { default: mpegts } = await import('mpegts.js');
      if (!mpegts.getFeatureList().mseLivePlayback) throw new Error('Flux illisible');
      // TODO(#23): isLive false for series/VOD .ts files.
      const player = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url },
        { liveBufferLatencyChasing: true },
      );
      player.on(mpegts.Events.ERROR, () => media.dispatchEvent(new Event('error')));
      player.attachMediaElement(media);
      player.load();
      void media.play().catch(() => {});
      return { destroy: () => player.destroy() };
    }
  }
}

/** Resolves when the video actually plays; rejects on error, timeout or abort. */
function playing(video: VideoLike, timeout: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onPlaying = () => done(resolve);
    const onError = () => done(() => reject(new Error('Flux illisible')));
    const onAbort = () => done(() => reject(new Error('aborted')));
    const timer = setTimeout(() => done(() => reject(new Error('Flux indisponible'))), timeout);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
  });
}

/** Reports an error during playback (stream dropped) until the attempt is aborted. */
function watch(video: VideoLike, signal: AbortSignal, onError: () => void) {
  const handler = () => {
    if (!signal.aborted) onError();
  };
  video.addEventListener('error', handler);
  signal.addEventListener('abort', () => video.removeEventListener('error', handler));
}
