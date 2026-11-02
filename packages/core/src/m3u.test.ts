import { describe, expect, it } from 'vitest';
import { hash, m3uChannels, parseM3u } from './m3u';

// Anonymised from real provider playlists: CRLF, BOM, #EXTGRP, VLC options, commas in names.
const PLAYLIST = [
  String.fromCharCode(0xfeff) + '#EXTM3U url-tvg="http://epg.test/guide.xml"',
  '#EXTINF:-1 tvg-id="stade.fr" tvg-name="Stade Direct" tvg-logo="http://logo/stade.png" tvg-chno="4" group-title="FR | SPORTS HD",Stade Direct HD',
  'http://stream.test/live/1.ts',
  '',
  '#EXTINF:-1 tvg-id="cine.fr" group-title="FR | CINÉMA, SÉRIES",Ciné Nuit, le soir',
  '#EXTVLCOPT:http-user-agent=Mozilla',
  'http://stream.test/live/2.m3u8',
  '#EXTINF:0,Radio sans groupe',
  '#EXTGRP:Musique',
  'http://stream.test/radio/3',
  '# un commentaire',
  '#EXTINF:-1 tvg-chno="4" group-title="UK | NEWS",World News',
  'http://stream.test/live/4.ts',
  '#EXTINF:-1 group-title="FR | SPORTS HD",Doublon',
  'http://stream.test/live/1.ts',
].join('\r\n');

describe('parseM3u', () => {
  const entries = parseM3u(PLAYLIST);

  it('reads every entry with its attributes', () => {
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({
      name: 'Stade Direct HD',
      url: 'http://stream.test/live/1.ts',
      attrs: {
        'tvg-id': 'stade.fr',
        'tvg-name': 'Stade Direct',
        'tvg-logo': 'http://logo/stade.png',
        'tvg-chno': '4',
        'group-title': 'FR | SPORTS HD',
      },
    });
  });

  it('keeps commas inside quoted attributes and in names', () => {
    expect(entries[1]).toMatchObject({
      name: 'Ciné Nuit, le soir',
      attrs: { 'group-title': 'FR | CINÉMA, SÉRIES' },
    });
  });

  it('skips VLC options and takes the group from #EXTGRP', () => {
    expect(entries[1]!.url).toBe('http://stream.test/live/2.m3u8');
    expect(entries[2]).toMatchObject({
      name: 'Radio sans groupe',
      attrs: { 'group-title': 'Musique' },
    });
  });

  it('ignores an #EXTINF without URL', () => {
    expect(parseM3u('#EXTM3U\n#EXTINF:-1,Orphan\n')).toEqual([]);
  });
});

describe('m3uChannels', () => {
  const channels = m3uChannels(parseM3u(PLAYLIST));

  it('maps entries to channels (HANDOFF §6)', () => {
    expect(channels.map((c) => [c.number, c.name, c.category, c.epgId])).toEqual([
      ['004', 'Stade Direct HD', 'sport', 'stade.fr'],
      ['005', 'Ciné Nuit, le soir', 'cinema', 'cine.fr'],
      ['006', 'Radio sans groupe', 'musique', undefined],
      ['007', 'World News', 'info', undefined],
    ]);
    expect(channels[0]).toMatchObject({
      logo: 'http://logo/stade.png',
      streamUrl: 'http://stream.test/live/1.ts',
    });
  });

  it('drops duplicate URLs and derives stable ids from them', () => {
    expect(channels.map((c) => c.streamUrl)).not.toContain(undefined);
    expect(new Set(channels.map((c) => c.id)).size).toBe(4);
    expect(channels[0]!.id).toBe(`m3u:${hash('http://stream.test/live/1.ts')}`);
  });

  it('applies the group filter without changing ids', () => {
    const fr = m3uChannels(parseM3u(PLAYLIST), { groups: ['FR'] });
    expect(fr.map((c) => c.name)).toEqual(['Stade Direct HD', 'Ciné Nuit, le soir']);
    expect(fr[1]!.id).toBe(channels[1]!.id);
  });
});
