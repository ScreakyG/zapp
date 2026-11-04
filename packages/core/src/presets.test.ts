import { describe, expect, it } from 'vitest';
import { buildFrenchBouquets, frenchBouquet, frenchLineup } from './presets';
import type { Channel } from './model';

const channel = (name: string, group?: string): Channel => ({
  id: name,
  name,
  group,
  number: '001',
  category: 'divert',
  streamUrl: 'stream',
  epgId: 'epg',
});

describe('France preset', () => {
  const numbered = (name: string, number: number, group?: string): Channel => ({
    ...channel(name, group),
    id: `xtream:${number + 100000}`,
    number: String(number),
  });
  const ids = (list: Channel[], bouquet: string) =>
    buildFrenchBouquets(list).find((b) => b.id === bouquet)?.channels ?? [];

  it('keeps only the twelve French DAZN RAW feeds and excludes all 99 PPV slots', () => {
    const raw = Array.from({ length: 12 }, (_, i) =>
      numbered(`FR: DAZN ${i + 1} ᴿᴬᵂ`, 19472 + i, 'FR| DAZN LA LIGA PPV'),
    );
    const ppv = Array.from({ length: 99 }, (_, i) =>
      numbered(
        `NO EVENT STREAMING NOW - | 8K EXCLUSIVE | FR: DAZN PPV ${i + 1}`,
        19372 + i,
        'FR| DAZN PPV',
      ),
    );
    expect(ids([...raw, ...ppv], 'dazn')).toEqual(raw.map((c) => c.id));
    expect(
      frenchBouquet(numbered('Next | France vs. US | FR: DAZN PPV 2', 19373, 'FR| DAZN PPV')),
    ).toBeUndefined();
    expect(frenchBouquet(numbered('FR: DAZN 1 ᴿᴬᵂ', 19472))).toBe('dazn');
  });

  it('excludes DAZN headers, foreign editions, HEVC and channels outside the selected ranges', () => {
    const excluded = [
      numbered('####### DAZN PPV FR #######', 19371, 'FR| DAZN PPV'),
      numbered('##### DAZN LA LIGA PPV #####', 19471, 'FR| DAZN LA LIGA PPV'),
      numbered('FR: DAZN 1 RAW', 19484, 'FR| DAZN LA LIGA PPV'),
      numbered('UK: DAZN 1 RAW', 19472, 'UK| DAZN'),
      numbered('BE/FR: DAZN PPV 1', 19372, 'BE| DAZN PPV ᶠʳ'),
      numbered('FR: DAZN 1 HEVC RAW', 19472, 'FR| DAZN LA LIGA PPV'),
      numbered('FR: DAZN 1 HD', 19472, 'FR| DAZN LA LIGA PPV'),
      numbered('##### DAZN PPV #####', 19372, 'FR| DAZN PPV'),
    ];
    expect(buildFrenchBouquets(excluded)).toEqual([]);
  });

  it('excludes RMC number 19822 before choosing the preferred RAW variant', () => {
    const excluded = numbered('RMC Story RAW', 19822);
    const fallback = numbered('RMC Story FHD', 19821);
    const other = numbered('RMC Découverte RAW', 19823);
    expect(ids([excluded, fallback, other], 'rmc')).toEqual([fallback.id, other.id]);
    expect(ids([excluded], 'rmc')).toEqual([]);
  });

  it('separates RMC Sport stations from other RMC channels and prefers one RAW per station', () => {
    const sport = [
      'RMC Sport 1',
      'RMC Sport Access',
      'RMC Sport Live 2',
      'RMC Sport Live 3',
      'RMC Sport Live 4',
    ];
    const other = [
      'RMC Découverte',
      'RMC Story',
      'RMC Life',
      'RMC Alerte Secours',
      'RMC J’irai dormir chez vous',
      'RMC Mecanic',
      'RMC Mystère',
      'RMC Talk Info',
      'RMC WOW',
    ];
    const makeVariants = (names: string[], offset: number) =>
      names.flatMap((name, i) => [
        numbered(`FR: ${name} FHD`, offset + i * 3),
        numbered(`VIP: ${name} ᴿᴬᵂ`, offset + i * 3 + 1),
        numbered(`GOLD: ${name} RAW BACKUP`, offset + i * 3 + 2),
      ]);
    const sports = makeVariants(sport, 18336);
    const others = makeVariants(other, 100);
    const bouquets = buildFrenchBouquets([...sports, ...others]);
    expect(bouquets.map((b) => b.title)).toEqual(['RMC Sport', 'RMC']);
    expect(ids([...sports, ...others], 'rmc-sport')).toEqual(
      sports.filter((_, i) => i % 3 === 1).map((c) => c.id),
    );
    expect(ids([...sports, ...others], 'rmc')).toEqual(
      others.filter((_, i) => i % 3 === 1).map((c) => c.id),
    );
  });

  it('keeps a non-RAW RMC fallback and preserves distinct Live and Access stations', () => {
    const sport1 = numbered('FR: RMC SPORT 1 HD', 18336, 'FR | SPORT VIP RAW');
    const raw1 = numbered('VIP: RMCSPORT 1 ᴿᴬᵂ 50 FPS', 18337);
    const live2 = numbered('RMC SPORTS LIVE2 FHD', 18338);
    const live2Backup = numbered('RMC Sport Live 2 HD', 18339);
    const access = numbered('RMC Sport Access HD', 18340);
    const story = numbered('RMC Story FHD', 6);
    const rejected = [
      numbered('RMC Sport 1 RAW HEVC', 18341),
      numbered('BE: RMC Sport 1 RAW', 18342),
    ];
    const list = [sport1, raw1, live2, live2Backup, access, story, ...rejected];
    expect(ids(list, 'rmc-sport')).toEqual([raw1.id, live2.id, access.id]);
    expect(ids(list, 'rmc')).toEqual([story.id]);
  });

  it('restricts only RMC Sport to numbers 18336–18393 before choosing RAW variants', () => {
    const first = numbered('RMC Sport 1 HD', 18336);
    const last = numbered('RMC Sport Live 4 RAW', 18393);
    const story = numbered('RMC Story RAW', 20000);
    const excluded = [numbered('RMC Sport 1 RAW', 18335), numbered('RMC Sport Live 4 RAW', 18394)];
    const list = [...excluded, first, last, story];
    expect(ids(list, 'rmc-sport')).toEqual([first.id, last.id]);
    expect(ids(list, 'rmc')).toEqual([story.id]);
  });

  it('excludes Tring Novelas without removing the French Novelas station', () => {
    expect(frenchBouquet(channel('GOLD: TRING NOVELAS'))).toBeUndefined();
    const kept = channel('FR: NOVELAS RAW');
    expect(ids([channel('GOLD: TRING NOVELAS'), kept], 'tnt')).toEqual([kept.id]);
  });

  it('keeps only VIP beIN editions, including stylized tags and provider group tags', () => {
    const kept = [
      numbered('VIP: beIN Sports 1 RAW', 18245),
      numbered('FR: beIN Sports 2 ⱽᴵᴾ', 18246),
      numbered('FR: beIN Sports MAX 4', 18247, 'FR | SPORT ⱽᴵᴾ ᴿᴬᵂ'),
    ];
    const excluded = [
      numbered('FR: beIN Sports 1 RAW', 18248),
      numbered('VIP: AU: beIN Sports 1 RAW', 18249),
      numbered('VIP: beIN Sports 1 HEVC', 18250),
      numbered('beIN Sports 1', 18251, 'AU | SPORT VIP'),
      numbered('VIPER: beIN Sports 1', 18252),
    ];
    expect(ids([...excluded, ...kept], 'bein')).toEqual(kept.map((c) => c.id));
    expect(buildFrenchBouquets(excluded)).toEqual([]);
  });

  it('keeps beIN numbers 18245 through 18254 inclusively and excludes adjacent numbers', () => {
    const kept = Array.from({ length: 10 }, (_, i) =>
      numbered(`VIP: beIN Sports ${i + 1} RAW`, 18245 + i),
    );
    const excluded = [
      numbered('VIP: beIN Sports RAW', 18244),
      numbered('VIP: beIN Sports RAW', 18255),
    ];
    expect(ids([...excluded, ...kept], 'bein')).toEqual(kept.map((c) => c.id));
  });

  it('excludes HEVC variants across every bouquet before selecting TNT duplicates', () => {
    const excluded = [
      numbered('TF1 RAW HEVC', 17990),
      numbered('Canal+ Sport ᴴᴱⱽᶜ', 2),
      numbered('Ligue 1+ 1 RAW H.265', 18307),
      numbered('beIN Sports 1 H265', 4),
      numbered('RMC Sport 1', 5, 'FR | HEVC'),
    ];
    expect(buildFrenchBouquets(excluded)).toEqual([]);
    const fallback = numbered('TF1 FHD', 6);
    expect(ids([...excluded, fallback], 'tnt')).toEqual([fallback.id]);
    expect(frenchBouquet(channel('beIN Sports 1 HEVC Backup'))).toBeUndefined();
    expect(frenchBouquet(channel('beIN Sports 1 H264'))).toBe('bein');
  });

  it.each([
    ['AU: beIN SPORTS 1', 'Sport'],
    ['beIN Sports 2', 'AU| SPORTS'],
    ['ᴬᵁ: beIN Sports 3 RAW', 'Sport'],
    ['beIN Sports 1', 'Australia | Sport'],
  ])('excludes Australian beIN %s from group %s', (name, group) => {
    expect(frenchBouquet(channel(name, group))).toBeUndefined();
    expect(buildFrenchBouquets([channel(name, group)])).toEqual([]);
    expect(frenchBouquet(channel('FR: beIN Sports 1 RAW', 'FR | Sports'))).toBe('bein');
  });

  it('recognizes provider superscript RAW and Belgian tags', () => {
    const kept = numbered('VIP: LIGUE 1+ 1 ᴿᴬᵂ', 18307, 'FR| FRANCE SPORT ⱽᴵᴾ ᴿᴬᵂ');
    const belgian = numbered('FR: LIGUE1+ ᴮᴱ 2 ᴿᴬᵂ', 18308, 'FR| LIGUE1+ ᴮᴱ');
    expect(ids([kept, belgian], 'ligue1')).toEqual([kept.id]);
    expect(frenchBouquet(belgian)).toBeUndefined();
    expect(frenchBouquet(numbered('LIGUE1+ 3 ᴿᴬᵂ', 18309, 'FR| LIGUE1+ ᴮᴱ'))).toBeUndefined();
  });

  it('prefers TNT superscript RAW over an HD variant in a mixed RAW group', () => {
    const hd = numbered('VIP: France 2 ᴴᴰ', 1, 'FR| FRANCE ⱽᴵᴾ ᴿᴬᵂ');
    const raw = numbered('VIP: France 2 ᴿᴬᵂ', 2, 'FR| FRANCE ⱽᴵᴾ ᴿᴬᵂ');
    expect(ids([hd, raw], 'tnt')).toEqual([raw.id]);
    expect(ids([numbered('Ligue 1+ 1 ᴴᴰ', 18307, 'FR| FRANCE SPORT ⱽᴵᴾ ᴿᴬᵂ')], 'ligue1')).toEqual(
      [],
    );
  });

  it('keeps only RAW Ligue 1+ channels numbered 18307 through 18316, excluding Belgian editions', () => {
    const kept = Array.from({ length: 10 }, (_, i) =>
      numbered(`FR Ligue 1+ ${i + 1} RAW`, 18307 + i),
    );
    const rejected = [
      numbered('FR Ligue 1+ RAW', 18306),
      numbered('FR Ligue 1+ RAW', 18317),
      numbered('FR Ligue 1+ FHD', 18310),
      numbered('BE Ligue 1+ RAW', 18311),
      numbered('Ligue 1+ RAW', 18312, 'BE Sports'),
    ];
    expect(ids([...rejected, ...kept], 'ligue1')).toEqual(kept.map((c) => c.id));
    expect(ids([numbered('Ligue 1+ 1', 18307, 'FR RAW')], 'ligue1')).toHaveLength(1);
  });

  it('keeps TF1 17990 and removes 17871 even if it is RAW', () => {
    const preferred = numbered('FR TF1 FHD', 17990);
    expect(
      ids([numbered('FR TF1 RAW', 17871), numbered('TF1 RAW', 17991), preferred], 'tnt'),
    ).toEqual([preferred.id]);
  });

  it('excludes PRIME France stations and regional France 3 numbers at both boundaries', () => {
    const rejected = [
      ...['2', '3', '4', '5', 'info'].map((suffix, i) =>
        numbered(`PRIME: France${suffix} RAW`, 19000 + i),
      ),
      numbered('France 2 RAW', 19010, 'FR PRIME'),
      ...Array.from({ length: 25 }, (_, i) => numbered('France 3 Régions RAW', 18001 + i)),
    ];
    const kept = [numbered('France 3 RAW', 18000), numbered('France 4 RAW', 18026)];
    expect(ids([...rejected, ...kept], 'tnt')).toEqual(kept.map((c) => c.id));
  });

  it('prefers one RAW per TNT station while preserving distinct stations and non-RAW fallbacks', () => {
    const list = [
      numbered('FR France2 FHD', 1),
      numbered('FR France 2 RAW', 2),
      numbered('FR France 2 RAW BACKUP', 3),
      numbered('FR M6 HD', 4),
      numbered('M 6 FHD', 5),
      numbered('TF1 HD', 6),
      numbered('TF1 Séries Films FHD', 7),
      numbered('TF1 Séries Films RAW', 8),
      numbered('BFMTV HD', 9),
      numbered('BFM TV RAW', 10),
    ];
    expect(ids(list, 'tnt')).toEqual([2, 4, 6, 8, 10].map((n) => `xtream:${n + 100000}`));
  });

  it.each([
    ['FR | CANAL+ SPORT 360 UHD', 'canal'],
    ['CANAL PLUS CINÉMA FHD', 'canal'],
    ['FR: LIGUE 1+ 2 HD', 'ligue1'],
    ['Ligue 1 Plus', 'ligue1'],
    ['FR | beIN SPORTS 1 FHD', 'bein'],
    ['BE IN SPORT MAX 4', 'bein'],
    ['RMC Sport 1', 'rmc-sport'],
    ['RMC Découverte', 'rmc'],
    ['FR | France 2 HD', 'tnt'],
    ['TF1 Séries Films', 'tnt'],
  ])('recognizes %s', (name, expected) => {
    expect(frenchBouquet(channel(name))).toBe(expected);
  });

  it.each(['US | beIN SPORTS 1', 'Canal Sur', 'Canal 24 Horas', 'TF10', 'Unknown'])(
    'excludes %s',
    (name) => {
      expect(frenchBouquet(channel(name))).toBeUndefined();
    },
  );

  it('uses provider groups to exclude foreign editions', () => {
    expect(frenchBouquet(channel('beIN Sports 1', 'AR | Sports'))).toBeUndefined();
    expect(frenchBouquet(channel('beIN Sports 1', 'FR | Sports'))).toBe('bein');
  });

  it('omits empty bouquets and preserves source identities and order', () => {
    const list = [
      { ...channel('VIP: beIN Sports 2'), number: '18246' },
      { ...channel('VIP: beIN Sports 1'), number: '18245' },
      channel('Unknown'),
    ];
    expect(buildFrenchBouquets(list)).toEqual([
      {
        id: 'bein',
        label: 'beIN Sports',
        title: 'beIN Sports',
        channels: ['VIP: beIN Sports 2', 'VIP: beIN Sports 1'],
      },
    ]);
    expect(list[0]?.streamUrl).toBe('stream');
  });
});

describe('France lineup', () => {
  const ch = (name: string, number: number, group?: string): Channel => ({
    id: `xtream:${number}`,
    name,
    group,
    number: String(number),
    category: 'divert',
    streamUrl: `stream:${number}`,
    epgId: `epg:${number}`,
  });
  const catalogue = [
    ch('VIP: beIN Sports 2 RAW', 18246),
    ch('VIP: beIN Sports 1 RAW', 18245),
    ch('FR: DAZN 1 ᴿᴬᵂ', 19472, 'FR| DAZN LA LIGA PPV'),
    ch('VIP: France 2 ᴿᴬᵂ', 2, 'FR| FRANCE ⱽᴵᴾ ᴿᴬᵂ'),
    ch('FR TF1 FHD', 17990),
    ch('FR: CANAL+ RAW', 30),
    ch('FR: CANAL+ CINEMA RAW', 31),
    ch('FR: CANAL+ SPORT 360 RAW', 32),
    ch('FR Ligue 1+ 2 RAW', 18308),
    ch('RMC Story RAW', 20000),
    ch('VIP: RMCSPORT 1 ᴿᴬᵂ 50 FPS', 18337),
    ch('FR BFM TV HD', 40),
    ch('FR T18 RAW', 41),
  ];
  const lineup = frenchLineup(catalogue);
  const shown = lineup.channels.map((c) => [c.number, c.name, c.bouquet, c.groups]);

  it('renames channels, gives them French numbers and sorts by number', () => {
    expect(shown).toEqual([
      ['001', 'TF1', undefined, ['tnt']],
      ['002', 'France 2', undefined, ['tnt']],
      ['004', 'Canal+', 'canal', ['sport', 'cinema']],
      ['015', 'BFMTV', undefined, ['tnt', 'info']],
      ['023', 'RMC Story', 'rmc', ['docs']],
      ['030', 'T18', undefined, ['tnt']],
      ['040', 'Canal+ Cinéma', 'canal', ['cinema']],
      ['041', 'Canal+ Sport 360', 'canal', ['sport']],
      ['101', 'Ligue 1+ 2', 'ligue1', ['sport']],
      ['121', 'beIN Sports 2', 'bein', ['sport']],
      ['122', 'beIN Sports 1', 'bein', ['sport']],
      ['141', 'DAZN 1', 'dazn', ['sport']],
      ['161', 'RMC Sport 1', 'rmc-sport', ['sport']],
    ]);
  });

  it('keeps ids, streams and EPG ids, so favourites and the guide still match', () => {
    const tf1 = lineup.channels.find((c) => c.name === 'TF1')!;
    expect(tf1).toMatchObject({
      id: 'xtream:17990',
      streamUrl: 'stream:17990',
      epgId: 'epg:17990',
    });
    expect(lineup.bouquets.map((b) => b.id)).toContain('tnt');
  });

  it('never gives two channels the same number', () => {
    const twice = frenchLineup([ch('FR: CANAL+ RAW', 30), ch('FR: CANAL+ ᴴᴰ', 33)]);
    expect(twice.channels.map((c) => c.number)).toEqual(['004', '040']);
  });
});

describe('France lineup ranges', () => {
  it('starts every bouquet at its own number even when Ligue 1+ and DAZN are full', () => {
    const ch = (name: string, number: number, group?: string): Channel => ({
      id: `id:${number}`,
      name,
      group,
      number: String(number),
      category: 'divert',
      streamUrl: '',
    });
    const list = [
      ...Array.from({ length: 10 }, (_, i) => ch(`FR Ligue 1+ ${i + 1} RAW`, 18307 + i)),
      ...Array.from({ length: 12 }, (_, i) =>
        ch(`FR: DAZN ${i + 1} ᴿᴬᵂ`, 19472 + i, 'FR| DAZN LA LIGA PPV'),
      ),
      ch('VIP: beIN Sports 1 RAW', 18245),
      ch('VIP: RMCSPORT 1 ᴿᴬᵂ', 18337),
    ];
    const first = (name: string) =>
      frenchLineup(list).channels.find((c) => c.name === name)?.number;
    expect([
      first('Ligue 1+ 10'),
      first('beIN Sports 1'),
      first('DAZN 1'),
      first('DAZN 12'),
      first('RMC Sport 1'),
    ]).toEqual(['110', '121', '141', '152', '161']);
  });
});
