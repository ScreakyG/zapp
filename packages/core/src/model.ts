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
  /** Three-digit display number, also the zapping key: "004". */
  number: string;
  name: string;
  category: Category;
  image?: string;
  logo?: string;
  streamUrl: string;
  /** Join key with the EPG (XMLTV `channel id`, Xtream `epg_channel_id`). */
  epgId?: string;
}

export interface Program {
  channelNumber: string;
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
  /** Programs of one channel overlapping [from, to), sorted by start. */
  getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]>;
}
