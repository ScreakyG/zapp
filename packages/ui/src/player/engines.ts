export type StreamFormat = 'hls' | 'ts' | 'file';
export type EngineName = 'native' | 'hls.js' | 'mpegts.js';

/**
 * HLS by its playlist extension; MPEG-TS by `.ts` or an extension-less Xtream live URL
 * (`/live/user/pass/123`, or `/user/pass/123` on some panels).
 */
export function streamFormat(url: string): StreamFormat {
  const path = url.split(/[?#]/)[0]!.toLowerCase();
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return 'hls';
  if (path.endsWith('.ts') || /(?:\/live)?\/[^/]+\/[^/]+\/\d+$/.test(path)) return 'ts';
  return 'file';
}

export interface PlatformCaps {
  /** Running on an LG TV: its native player decodes HEVC/AC-3 and plays HLS and TS. */
  webos: boolean;
  nativeHls: boolean;
  mse: boolean;
}

/**
 * Engines to try, in order (ADR 0001): on webOS the TV's own player first, then the JS players;
 * elsewhere the JS player matching the format, and the native <video> for plain files.
 */
export function engineOrder(format: StreamFormat, caps: PlatformCaps): EngineName[] {
  const js: EngineName[] = [];
  if (caps.mse && format === 'hls') js.push('hls.js');
  if (caps.mse && format === 'ts') js.push('mpegts.js');
  if (caps.webos || format === 'file') return ['native', ...js];
  if (format === 'hls' && caps.nativeHls) return [...js, 'native'];
  return js.length ? js : ['native'];
}

/** LG webOS TV (its user agent spells it "Web0S"). */
export const isWebOS = (): boolean => /web0s|webos/i.test(navigator.userAgent);

export function detectCaps(): PlatformCaps {
  const video = document.createElement('video');
  return {
    webos: isWebOS(),
    nativeHls: video.canPlayType('application/vnd.apple.mpegurl') !== '',
    mse: typeof window.MediaSource !== 'undefined',
  };
}
