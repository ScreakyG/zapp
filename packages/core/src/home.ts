import type { Channel } from './model';

export interface HomeRowSpec {
  title: string;
  /** Channel ids, in display order. */
  channels: string[];
}

/**
 * Home rows for any source (HANDOFF §4): favourites, Sport, live now, cinema, all channels.
 * Empty rows are left out so navigation never lands on nothing.
 */
export function buildHomeRows(
  channels: readonly Channel[],
  /** Called with the channel's list index, so callers can look up per-index data in O(1). */
  isLiveNow: (channel: Channel, index: number) => boolean,
  favourites: readonly string[] = [],
): HomeRowSpec[] {
  const ids = (list: readonly Channel[]) => list.map((c) => c.id);
  const known = new Set(ids(channels));
  const rows: HomeRowSpec[] = [
    { title: 'Chaînes favorites', channels: favourites.filter((id) => known.has(id)) },
    { title: 'Sport', channels: ids(channels.filter((c) => c.category === 'sport')) },
    { title: 'En direct maintenant', channels: ids(channels.filter((c, i) => isLiveNow(c, i))) },
    { title: 'Cinéma et séries', channels: ids(channels.filter((c) => c.category === 'cinema')) },
    { title: 'Toutes les chaînes', channels: ids(channels) },
  ];
  return rows.filter((r) => r.channels.length > 0);
}
