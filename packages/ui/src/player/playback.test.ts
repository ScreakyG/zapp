import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineName } from './engines';
import { FALLBACK_TIMEOUT, LAST_TIMEOUT, createPlayback, type VideoLike } from './playback';

class FakeVideo extends EventTarget implements VideoLike {
  removeAttribute() {}
  load() {}
  fire(type: 'playing' | 'error') {
    this.dispatchEvent(new Event(type));
  }
}

const pc = { webos: false, nativeHls: true, mse: true };
const tick = () => new Promise<void>((r) => queueMicrotask(r));
const flush = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

describe('createPlayback', () => {
  let video: FakeVideo;
  let started: { engine: EngineName; url: string; destroyed: boolean }[];
  let release: (() => void)[];

  beforeEach(() => {
    vi.useFakeTimers();
    video = new FakeVideo();
    started = [];
    release = [];
  });
  afterEach(() => vi.useRealTimers());

  /** Engines start when the test calls release[i](); like a dynamic import resolving. */
  const deferredStart = (engine: EngineName, _video: VideoLike, url: string) =>
    new Promise<{ destroy(): void }>((resolve) => {
      const entry = { engine, url, destroyed: false };
      release.push(() => {
        started.push(entry);
        resolve({ destroy: () => (entry.destroyed = true) });
      });
    });

  it('plays with the first engine that starts', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush();
    video.fire('playing');
    await flush();
    expect(pb.status()).toEqual({ state: 'playing', engine: 'hls.js' });
  });

  it('falls back after an error, then reports the last failure', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush();
    video.fire('error');
    await flush();
    expect(started[0]!.destroyed).toBe(true);
    expect(pb.status()).toEqual({ state: 'loading', engine: 'native' });
    release[1]!();
    await flush();
    vi.advanceTimersByTime(LAST_TIMEOUT);
    await flush();
    expect(pb.status()).toEqual({ state: 'error', message: 'Flux indisponible' });
  });

  it('gives fallback engines a shorter timeout', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush();
    vi.advanceTimersByTime(FALLBACK_TIMEOUT);
    await flush();
    expect(pb.status()).toEqual({ state: 'loading', engine: 'native' });
  });

  it('destroys an engine that finishes loading after the user zapped away', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    void pb.play('http://x/b.m3u8');
    release[0]!(); // A's engine arrives late
    release[1]!();
    await flush();
    expect(started.map((s) => [s.url, s.destroyed])).toEqual([
      ['http://x/a.m3u8', true],
      ['http://x/b.m3u8', false],
    ]);
  });

  it('a stale attempt cannot tear down the current one', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush(); // A waits for "playing"
    void pb.play('http://x/b.m3u8');
    release[1]!();
    await flush();
    video.fire('playing');
    await flush();
    expect(pb.status()).toEqual({ state: 'playing', engine: 'hls.js' });
    vi.advanceTimersByTime(LAST_TIMEOUT); // A's old timer, if it had leaked
    await flush();
    expect(started[1]!.destroyed).toBe(false);
    expect(pb.status().state).toBe('playing');
  });

  it('reports an error during playback', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush();
    video.fire('playing');
    await flush();
    video.fire('error');
    expect(pb.status()).toEqual({ state: 'error', message: 'La lecture s’est interrompue' });
    expect(started[0]!.destroyed).toBe(true);
  });

  it('stop() returns to idle and ignores later events', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    void pb.play('http://x/a.m3u8');
    release[0]!();
    await flush();
    video.fire('playing');
    await flush();
    pb.stop();
    video.fire('error');
    expect(pb.status()).toEqual({ state: 'idle' });
  });

  it('reports a channel without stream', async () => {
    const pb = createPlayback(video, { caps: pc, start: deferredStart });
    await pb.play('');
    expect(pb.status()).toEqual({ state: 'error', message: 'Aucun flux pour cette chaîne' });
  });
});
