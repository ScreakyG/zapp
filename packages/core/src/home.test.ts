import { describe, expect, it } from 'vitest';
import { buildHomeRows } from './home';
import type { Channel } from './model';

const channel = (id: string, category: Channel['category']): Channel => ({
  id,
  number: id,
  name: id,
  category,
  streamUrl: '',
});

const channels = [channel('a', 'sport'), channel('b', 'cinema'), channel('c', 'info')];

describe('buildHomeRows', () => {
  it('builds the HANDOFF rows in order', () => {
    const rows = buildHomeRows(channels, (c) => c.id === 'c', ['b']);
    expect(rows).toEqual([
      { title: 'Chaînes favorites', channels: ['b'] },
      { title: 'Sport', channels: ['a'] },
      { title: 'En direct maintenant', channels: ['c'] },
      { title: 'Cinéma et séries', channels: ['b'] },
      { title: 'Toutes les chaînes', channels: ['a', 'b', 'c'] },
    ]);
  });

  it('drops empty rows and unknown favourites', () => {
    const rows = buildHomeRows([channel('c', 'info')], () => false, ['gone']);
    expect(rows.map((r) => r.title)).toEqual(['Toutes les chaînes']);
  });

  it('lets a channel appear in several rows and passes list indices', () => {
    const seen: number[] = [];
    const rows = buildHomeRows(
      [channel('a', 'sport')],
      (_, i) => {
        seen.push(i);
        return true;
      },
      ['a'],
    );
    expect(rows.map((r) => r.channels)).toEqual([['a'], ['a'], ['a'], ['a']]);
    expect(seen).toEqual([0]);
  });

  it('returns nothing without channels', () => {
    expect(buildHomeRows([], () => true)).toEqual([]);
  });
});
