export const CATEGORIES = [
  { id: 'sport', label: 'Sport' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'info', label: 'Info et docs' },
  { id: 'divert', label: 'Divertissement' },
  { id: 'jeunesse', label: 'Jeunesse' },
  { id: 'musique', label: 'Musique' },
] as const;

export type Category = (typeof CATEGORIES)[number]['id'];

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((c) => c.id === value);
}

export interface Channel {
  /**
   * Stable identity (Xtream `stream_id`, hash of the M3U entry…). Favourites, last channel and
   * the EPG cache key on it, so it must survive renumbering when the group filter changes.
   */
  id: string;
  /** Three-digit display number, used for zapping only: "004". */
  number: string;
  name: string;
  category: Category;
  /** Original provider group, used to disambiguate regional presets. */
  group?: string;
  /** Paid bouquet (app) the channel comes from, France preset only; none for the TNT. */
  bouquet?: string;
  /** Themed groups of the TV tab (France preset only), mixing TNT and bouquet channels. */
  groups?: readonly string[];
  image?: string;
  logo?: string;
  /** Empty when the source has no stream (demo channels). */
  streamUrl: string;
  /** Join key with the EPG (XMLTV `channel id`, Xtream `epg_channel_id`). */
  epgId?: string;
}

export interface Program {
  channelId: string;
  title: string;
  start: Date;
  end: Date;
  genre?: string;
  description?: string;
  /** Broadcast live (DIRECT badge), as opposed to merely airing now. */
  live: boolean;
}

/** Where channels and their programs come from: demo data, Xtream Codes, M3U + XMLTV. */
export interface Source {
  getChannels(): Promise<Channel[]>;
  /**
   * Programs of one channel overlapping [from, to), sorted by start. The guide calls this once
   * per visible channel; `signal` lets it drop requests for rows scrolled past.
   */
  getPrograms(channel: Channel, from: Date, to: Date, signal?: AbortSignal): Promise<Program[]>;
}
