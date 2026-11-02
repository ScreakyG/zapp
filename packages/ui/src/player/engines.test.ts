import { describe, expect, it } from 'vitest';
import { engineOrder, streamFormat } from './engines';

describe('streamFormat', () => {
  it('recognises HLS, TS and Xtream live URLs', () => {
    expect(streamFormat('http://x/live/stream.m3u8?token=1')).toBe('hls');
    expect(streamFormat('http://x/chan/index.M3U8')).toBe('hls');
    expect(streamFormat('http://x/live/user/pass/1234.ts')).toBe('ts');
    expect(streamFormat('http://x/live/user/pass/1234')).toBe('ts');
    expect(streamFormat('http://x/movie/user/pass/99.mp4')).toBe('file');
  });
});

describe('engineOrder', () => {
  const pc = { webos: false, nativeHls: false, mse: true };
  const tv = { webos: true, nativeHls: true, mse: true };

  it('tries the TV player first on webOS', () => {
    expect(engineOrder('hls', tv)).toEqual(['native', 'hls.js']);
    expect(engineOrder('ts', tv)).toEqual(['native', 'mpegts.js']);
    expect(engineOrder('file', tv)).toEqual(['native']);
  });

  it('uses the JS players on PC, native for files', () => {
    expect(engineOrder('hls', pc)).toEqual(['hls.js']);
    expect(engineOrder('ts', pc)).toEqual(['mpegts.js']);
    expect(engineOrder('file', pc)).toEqual(['native']);
  });

  it('keeps native HLS as a fallback where the browser has it', () => {
    expect(engineOrder('hls', { ...pc, nativeHls: true })).toEqual(['hls.js', 'native']);
  });

  it('falls back to native without MediaSource', () => {
    expect(engineOrder('ts', { ...pc, mse: false })).toEqual(['native']);
  });
});
