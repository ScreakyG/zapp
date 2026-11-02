import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbEpgStore } from './epg-cache';
import { M3uSource } from './m3u-source';
import { XmltvReader, decodeEntities, parseXmltvDate, readXmltv, type XmltvFilter } from './xmltv';

const GUIDE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="test">
  <channel id="stade.fr"><display-name>Stade Direct</display-name></channel>
  <programme start="20261102194500 +0100" stop="20261102213000 +0100" channel="stade.fr">
    <title lang="fr">Lyon &amp; Nantes</title>
    <title lang="en">Lyon and Nantes</title>
    <desc lang="fr"><![CDATA[Choc de la 12e journée]]></desc>
    <category lang="fr">Football</category>
  </programme>
  <programme start="20261102213000 +0100" stop="20261102230000 +0100" channel='stade.fr'><title>Le debrief &#233;t&#xE9;</title></programme>
  <programme start="20261102200000 +0100" stop="20261102210000 +0100" channel="other.uk"><title>Other</title></programme>
  <programme start="20261101100000 +0100" stop="20261101110000 +0100" channel="stade.fr"><title>Yesterday</title></programme>
  <programme start="20261102200000 +0100" stop="20261102210000 +0100" channel="stade.fr"/>
</tv>`;

const window = {
  from: new Date('2026-11-02T12:00:00Z'),
  to: new Date('2026-11-03T12:00:00Z'),
};

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function read(text: string, size: number, filter: XmltvFilter = window) {
  const reader = new XmltvReader(filter);
  for (const c of chunks(text, size)) reader.push(c);
  return reader.end();
}

describe('XmltvReader', () => {
  it('reads programmes in the window, first language, decoded', () => {
    const all = read(GUIDE, GUIDE.length);
    expect(all.map((p) => [p.channel, p.title])).toEqual([
      ['stade.fr', 'Lyon & Nantes'],
      ['stade.fr', 'Le debrief été'],
      ['other.uk', 'Other'],
    ]);
    expect(all[0]).toMatchObject({
      description: 'Choc de la 12e journée',
      category: 'Football',
      start: new Date('2026-11-02T18:45:00Z'),
      end: new Date('2026-11-02T20:30:00Z'),
    });
  });

  it('gives the same result however the text is cut', () => {
    const whole = read(GUIDE, GUIDE.length);
    for (const size of [1, 2, 3, 7, 10, 64, 333]) expect(read(GUIDE, size)).toEqual(whole);
  });

  it('keeps only the wanted channels', () => {
    const only = read(GUIDE, 50, { ...window, channels: new Set(['other.uk']) });
    expect(only.map((p) => p.title)).toEqual(['Other']);
  });

  it('streams 50 MB without keeping the text', async () => {
    const programme = (i: number) =>
      `<programme start="20261102${String(10 + (i % 12)).padStart(2, '0')}0000 +0000" stop="20261102${String(11 + (i % 12)).padStart(2, '0')}0000 +0000" channel="c${i % 500}"><title>Programme ${i}</title><desc>${'x'.repeat(300)}</desc></programme>\n`;
    const count = 120_000;
    const encoder = new TextEncoder();
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i >= count) return controller.close();
        let piece = '';
        for (let n = 0; n < 200 && i < count; n++) piece += programme(i++);
        controller.enqueue(encoder.encode(piece));
      },
    });
    const started = Date.now();
    const result = await readXmltv(body, { ...window, channels: new Set(['c1', 'c2']) });
    // c1/c2 are 2 channels in 500; 10 of their 12 hourly slots end after the window start.
    expect(result).toHaveLength(400);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe('helpers', () => {
  it('parses XMLTV dates with and without offset or seconds', () => {
    expect(parseXmltvDate('20261102204500 +0100')).toEqual(new Date('2026-11-02T19:45:00Z'));
    expect(parseXmltvDate('20261102204530 -0230')).toEqual(new Date('2026-11-02T23:15:30Z'));
    expect(parseXmltvDate('202611022045')).toEqual(new Date('2026-11-02T20:45:00Z'));
    expect(parseXmltvDate('nope')).toBeUndefined();
  });

  it('decodes entities', () => {
    expect(decodeEntities('a &lt;b&gt; &quot;c&quot; &#39;d&apos; &#x1F4FA; &unknown;')).toBe(
      'a <b> "c" \'d\' 📺 &unknown;',
    );
  });
});

describe('IndexedDbEpgStore', () => {
  it('round-trips programmes with their dates', async () => {
    const store = new IndexedDbEpgStore('test');
    expect(await store.load()).toBeUndefined();
    const programmes = read(GUIDE, 100);
    await store.save(programmes);
    const loaded = await store.load();
    expect(loaded?.programmes).toEqual(programmes);
    expect(loaded?.programmes[0]!.start).toBeInstanceOf(Date);
  });
});

describe('M3uSource', () => {
  const playlist = [
    '#EXTM3U url-tvg="http://epg.test/guide.xml"',
    '#EXTINF:-1 tvg-id="stade.fr" group-title="Sport",Stade Direct',
    'http://stream.test/1.ts',
    '#EXTINF:-1 group-title="Sport",Sans EPG',
    'http://stream.test/2.ts',
  ].join('\n');

  const now = Date.now();
  const stamp = (offsetMin: number) => {
    const d = new Date(now + offsetMin * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00 +0000`;
  };
  const liveGuide = `<tv><programme start="${stamp(-30)}" stop="${stamp(30)}" channel="stade.fr"><title>Match</title></programme></tv>`;

  function fakeFetch(calls: string[]): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(url.endsWith('.xml') ? liveGuide : playlist);
    }) as typeof fetch;
  }

  it('joins the playlist and the guide from url-tvg, downloading the guide once', async () => {
    const calls: string[] = [];
    const source = new M3uSource({
      playlistUrl: 'http://pl.test/list.m3u',
      fetch: fakeFetch(calls),
    });
    const [stade, plain] = await source.getChannels();
    const from = new Date(now - 3_600_000);
    const to = new Date(now + 3_600_000);
    const [a, b, c] = await Promise.all([
      source.getPrograms(stade!, from, to),
      source.getPrograms(stade!, from, to),
      source.getPrograms(plain!, from, to),
    ]);
    expect(a.map((p) => [p.title, p.channelId])).toEqual([['Match', stade!.id]]);
    expect(b).toEqual(a);
    expect(c).toEqual([]);
    expect(calls.filter((u) => u.endsWith('.xml'))).toEqual(['http://epg.test/guide.xml']);
  });

  it('rejects a file that is not a playlist', async () => {
    const source = new M3uSource({
      playlistUrl: 'http://pl.test/x',
      fetch: (async () => new Response('<html>Login</html>')) as typeof fetch,
    });
    await expect(source.getChannels()).rejects.toThrow('pas une playlist');
  });
});
