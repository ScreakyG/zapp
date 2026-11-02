import { describe, expect, it } from 'vitest';
import { XtreamError, XtreamSource, decode, numberChannels } from './xtream';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const t = (iso: string) => String(Date.parse(iso) / 1000);

/** Recorded-style responses of a fictional panel. */
const fixtures: Record<string, unknown> = {
  '': { user_info: { auth: 1, status: 'Active', exp_date: '1893456000', max_connections: '1' } },
  get_live_categories: [
    { category_id: '1', category_name: 'FR | SPORTS' },
    { category_id: '2', category_name: 'FR | CINÉMA' },
    { category_id: '3', category_name: 'UK | NEWS' },
  ],
  get_live_streams: [
    {
      num: 4,
      name: 'Stade Direct ',
      stream_id: 101,
      stream_icon: 'http://logo/101.png',
      epg_channel_id: 'stade.fr',
      category_id: '1',
    },
    {
      num: 4,
      name: 'Ciné Nuit',
      stream_id: 102,
      stream_icon: '',
      epg_channel_id: null,
      category_id: '2',
    },
    { num: null, name: 'World News', stream_id: 103, category_id: '3' },
  ],
  get_short_epg: {
    epg_listings: [
      {
        title: b64('Lyon – Nantes'),
        description: b64('Choc de la 12e journée'),
        start_timestamp: t('2026-11-02T20:45:00Z'),
        stop_timestamp: t('2026-11-02T22:30:00Z'),
      },
      {
        title: b64('Avant-match'),
        start_timestamp: t('2026-11-02T20:00:00Z'),
        stop_timestamp: t('2026-11-02T20:45:00Z'),
      },
    ],
  },
};

function fakeFetch(calls: string[], status = 200, body?: unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    const action = url.searchParams.get('action') ?? '';
    return new Response(JSON.stringify(body ?? fixtures[action]), { status });
  }) as typeof fetch;
}

const config = { server: 'http://panel.test:8080/', username: 'me', password: 'p@ss' };

describe('XtreamSource', () => {
  it('checks the account', async () => {
    const source = new XtreamSource({ ...config, fetch: fakeFetch([]) });
    const account = await source.account();
    expect(account.status).toBe('Active');
    expect(account.expires?.getUTCFullYear()).toBe(2030);
  });

  it('reports refused credentials and unreachable servers', async () => {
    const refused = new XtreamSource({
      ...config,
      fetch: fakeFetch([], 200, { user_info: { auth: 0 } }),
    });
    await expect(refused.account()).rejects.toThrow(XtreamError);
    const down = new XtreamSource({
      ...config,
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    await expect(down.account()).rejects.toThrow('Serveur injoignable');
  });

  it('maps live streams to channels', async () => {
    const calls: string[] = [];
    const source = new XtreamSource({ ...config, fetch: fakeFetch(calls) });
    const channels = await source.getChannels();
    expect(channels.map((c) => [c.id, c.number, c.name, c.category])).toEqual([
      ['xtream:101', '004', 'Stade Direct', 'sport'],
      ['xtream:102', '005', 'Ciné Nuit', 'cinema'],
      ['xtream:103', '006', 'World News', 'info'],
    ]);
    expect(channels[0]).toMatchObject({ logo: 'http://logo/101.png', epgId: 'stade.fr' });
    expect(channels[1]!.logo).toBeUndefined();
    expect(channels[0]!.streamUrl).toBe('http://panel.test:8080/live/me/p%40ss/101.ts');
    expect(calls[0]).toContain('/player_api.php?username=me&password=p%40ss&action=');
  });

  it('keeps only the chosen groups', async () => {
    const source = new XtreamSource({ ...config, groups: ['FR'], fetch: fakeFetch([]) });
    expect((await source.getChannels()).map((c) => c.name)).toEqual(['Stade Direct', 'Ciné Nuit']);
  });

  it('decodes the short EPG, sorts it and caches it', async () => {
    const calls: string[] = [];
    const source = new XtreamSource({ ...config, fetch: fakeFetch(calls) });
    const [stade] = await source.getChannels();
    const from = new Date('2026-11-02T19:00:00Z');
    const to = new Date('2026-11-02T23:00:00Z');
    const programs = await source.getPrograms(stade!, from, to);
    expect(programs.map((p) => p.title)).toEqual(['Avant-match', 'Lyon – Nantes']);
    expect(programs[1]).toMatchObject({
      channelId: 'xtream:101',
      description: 'Choc de la 12e journée',
    });
    await source.getPrograms(stade!, from, to);
    expect(calls.filter((c) => c.includes('get_short_epg'))).toHaveLength(1);
    expect(calls[calls.length - 1]).toContain('stream_id=101');
  });

  it('filters the EPG to the window', async () => {
    const source = new XtreamSource({ ...config, fetch: fakeFetch([]) });
    const [stade] = await source.getChannels();
    const programs = await source.getPrograms(
      stade!,
      new Date('2026-11-02T21:00:00Z'),
      new Date('2026-11-02T21:30:00Z'),
    );
    expect(programs.map((p) => p.title)).toEqual(['Lyon – Nantes']);
  });

  it('reports HTTP errors', async () => {
    const source = new XtreamSource({ ...config, fetch: fakeFetch([], 503) });
    await expect(source.getChannels()).rejects.toThrow('Erreur du serveur (503)');
  });
});

describe('helpers', () => {
  it('numbers channels from num, avoiding duplicates', () => {
    const c = (rawNumber: number | null) => ({
      id: String(rawNumber),
      number: '',
      rawNumber,
      name: '',
      category: 'divert' as const,
      streamUrl: '',
    });
    expect(numberChannels([c(12), c(null), c(12), c(1)]).map((x) => x.number)).toEqual([
      '012',
      '013',
      '014',
      '001',
    ]);
  });

  it('decodes base64 UTF-8 and tolerates plain text', () => {
    expect(decode(b64('Été à Noël'))).toBe('Été à Noël');
    expect(decode('pas du base64 !')).toBe('pas du base64 !');
  });
});
