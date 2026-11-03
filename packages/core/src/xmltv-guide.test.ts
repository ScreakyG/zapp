import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryEpgStore } from './epg-cache';
import { M3uSource } from './m3u-source';
import type { Channel } from './model';
import { XtreamSource } from './xtream';
import { XmltvGuide } from './xmltv-guide';

const now = new Date('2026-11-03T12:00:00Z');
const from = new Date('2026-11-03T11:00:00Z');
const to = new Date('2026-11-03T13:00:00Z');
const xml =
  '<tv><programme channel="tf1.fr" start="20261103113000 +0000" stop="20261103123000 +0000"><title>Émission à midi 📺</title></programme><programme channel="other" start="20261103113000 +0000" stop="20261103123000 +0000"><title>Other</title></programme></tv>';
const channel: Channel = {
  id: 'xtream:1',
  number: '001',
  name: 'TF1',
  streamUrl: 'https://stream.test/1.ts',
  category: 'info',
  epgId: 'tf1.fr',
};
const url = 'https://vhepg.test/strong8k.xml.gz';

function response(bytes: Uint8Array, size = 7) {
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
      },
    }),
  );
}

afterEach(() => vi.useRealTimers());

describe('external XMLTV guide', () => {
  it('keeps only selected channels and invalidates the persisted cache when groups change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = new MemoryEpgStore();
    const save = vi.spyOn(store, 'save');
    const http = vi.fn(async () => new Response(xml));
    const selected = async () => new Set(['tf1.fr']);
    await new XmltvGuide(async () => [url], http, store, selected).getPrograms(channel, from, to);
    expect(save.mock.calls[0]![1].map((p) => p.channel)).toEqual(['tf1.fr']);
    await new XmltvGuide(async () => [url], http, store, selected).getPrograms(channel, from, to);
    expect(http).toHaveBeenCalledTimes(1);
    const changed = new XmltvGuide(
      async () => [url],
      http,
      store,
      async () => new Set(['other']),
    );
    expect(await changed.getPrograms({ ...channel, epgId: 'other' }, from, to)).toMatchObject([
      { title: 'Other' },
    ]);
    expect(http).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1].map((p) => p.channel)).toEqual(['other']);
  });
  for (const compressed of [true, false]) {
    it(`reads ${compressed ? 'raw gzip' : 'already decoded .gz'} split into single bytes`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const bytes = compressed ? gzipSync(xml) : new TextEncoder().encode(xml);
      const http = vi.fn(async () => response(bytes, 1));
      const guide = new XmltvGuide(async () => [url], http);
      const [a, b] = await Promise.all([
        guide.getPrograms(channel, from, to),
        guide.getPrograms({ ...channel, id: 'second' }, from, to),
      ]);
      expect(a).toMatchObject([
        {
          title: 'Émission à midi 📺',
          channelId: 'xtream:1',
          start: new Date('2026-11-03T11:30:00Z'),
        },
      ]);
      expect(b[0]?.channelId).toBe('second');
      expect(http).toHaveBeenCalledTimes(1);
      expect(await guide.getPrograms({ ...channel, epgId: undefined }, from, to)).toEqual([]);
      expect(await guide.getPrograms(channel, to, new Date('2026-11-03T14:00:00Z'))).toEqual([]);
    });
  }

  it('reuses the persisted guide across restarts and channel changes, then refreshes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = new MemoryEpgStore();
    const http = vi.fn(async () => new Response(xml));
    await new XmltvGuide(async () => [url], http, store).getPrograms(channel, from, to);
    const restarted = new XmltvGuide(async () => [url], http, store);
    expect(await restarted.getPrograms({ ...channel, epgId: 'other' }, from, to)).toMatchObject([
      { title: 'Other' },
    ]);
    expect(http).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(now.getTime() + 6 * 3_600_000));
    await restarted.getPrograms(channel, from, to);
    expect(http).toHaveBeenCalledTimes(2);
    await new XmltvGuide(async () => ['https://other.test/guide'], http, store).getPrograms(
      channel,
      from,
      to,
    );
    expect(http).toHaveBeenCalledTimes(3);
  });

  it('keeps the last guide on failed refresh and backs off', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const http = vi.fn(async () => new Response(xml));
    const guide = new XmltvGuide(async () => [url], http);
    const previous = await guide.getPrograms(channel, from, to);
    vi.setSystemTime(new Date(now.getTime() + 6 * 3_600_000));
    http.mockImplementation(async () => new Response('Unavailable', { status: 503 }));
    expect(await guide.getPrograms(channel, from, to)).toEqual(previous);
    expect(await guide.getPrograms(channel, from, to)).toEqual(previous);
    expect(http).toHaveBeenCalledTimes(2);
  });

  for (const bytes of [
    new TextEncoder().encode('<html>Bad gateway</html>'),
    gzipSync(xml).subarray(0, 12),
    new TextEncoder().encode(xml.replace('</tv>', '')),
  ]) {
    it('rejects invalid/truncated guides without caching and retries after backoff', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const http = vi.fn(async () => response(bytes));
      const store = new MemoryEpgStore();
      const guide = new XmltvGuide(async () => [url], http, store);
      await expect(guide.getPrograms(channel, from, to)).rejects.toThrow('Guide TV');
      await expect(guide.getPrograms(channel, from, to)).rejects.toThrow('Guide TV');
      expect(http).toHaveBeenCalledTimes(1);
      expect(await store.load(url)).toBeUndefined();
      vi.setSystemTime(new Date(now.getTime() + 60_000));
      http.mockImplementation(async () => new Response(xml));
      expect(await guide.getPrograms(channel, from, to)).toHaveLength(1);
      expect(http).toHaveBeenCalledTimes(2);
    });
  }

  it('joins Xtream epg_channel_id without calling panel EPG endpoints', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const http = vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      if (u.href === url) return response(gzipSync(xml));
      const action = u.searchParams.get('action');
      if (action === 'get_live_categories') return Response.json([]);
      if (action === 'get_live_streams')
        return Response.json([{ stream_id: 1, name: 'TF1', epg_channel_id: 'tf1.fr' }]);
      throw new Error('Unexpected panel request');
    });
    const source = new XtreamSource({
      server: 'https://panel.test',
      username: 'user',
      password: 'secret',
      epgUrl: url,
      fetch: http,
    });
    const [c] = await source.getChannels();
    expect(await source.getPrograms(c!, from, to)).toMatchObject([
      { title: 'Émission à midi 📺', channelId: 'xtream:1' },
    ]);
    expect(http).toHaveBeenCalledTimes(3);
  });

  it('uses the explicit M3U guide over the playlist header', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const http = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === url
        ? response(gzipSync(xml))
        : new Response(
            '#EXTM3U url-tvg="https://wrong.test/guide"\n#EXTINF:-1 tvg-id="tf1.fr",TF1\nhttps://stream.test/1.ts',
          ),
    );
    const source = new M3uSource({
      playlistUrl: 'https://playlist.test',
      epgUrl: url,
      fetch: http,
    });
    const [c] = await source.getChannels();
    expect(await source.getPrograms(c!, from, to)).toHaveLength(1);
    expect(http.mock.calls.map(([u]) => String(u))).toEqual(['https://playlist.test', url]);
  });
});
