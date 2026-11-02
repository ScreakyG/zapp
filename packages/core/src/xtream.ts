import {
  DEFAULT_CATEGORY_KEYWORDS,
  categorize,
  keepGroup,
  type CategoryKeywords,
} from './categories';
import { overlaps } from './epg';
import type { Channel, Program, Source } from './model';

export interface XtreamConfig {
  /** Server base URL, e.g. "http://example.com:8080". */
  server: string;
  username: string;
  password: string;
  /** Provider groups to keep (see keepGroup); empty keeps everything. */
  groups?: string[];
  keywords?: CategoryKeywords;
  /** Live stream container: Xtream serves both. */
  output?: 'ts' | 'm3u8';
  fetch?: typeof fetch;
}

export interface XtreamAccount {
  status: string;
  /** Subscription end, if the server gives one. */
  expires?: Date;
  maxConnections?: number;
}

export class XtreamError extends Error {}

interface RawCategory {
  category_id: string;
  category_name: string;
}

interface RawStream {
  num?: number | string | null;
  name: string;
  stream_id: number | string;
  stream_icon?: string | null;
  epg_channel_id?: string | null;
  category_id?: string | null;
}

interface RawListing {
  title: string;
  description?: string;
  start_timestamp: string | number;
  stop_timestamp: string | number;
  now_playing?: number;
}

/** How long a channel's short EPG is reused before asking the server again. */
const EPG_TTL = 10 * 60_000;
/** Listings asked per channel: enough to cover the guide's 2-hour window and beyond. */
const EPG_LIMIT = 12;

/** Xtream Codes API (player_api.php): live channels, categories and per-channel EPG. */
export class XtreamSource implements Source {
  private readonly base: string;
  private readonly http: typeof fetch;
  private readonly epg = new Map<string, { at: number; programs: Program[] }>();

  constructor(private readonly config: XtreamConfig) {
    this.base = config.server.replace(/\/+$/, '');
    this.http = config.fetch ?? fetch.bind(globalThis);
  }

  /** Checks the credentials; throws XtreamError with a user-facing message when refused. */
  async account(): Promise<XtreamAccount> {
    const data = await this.api<{
      user_info?: {
        auth?: number;
        status?: string;
        exp_date?: string | null;
        max_connections?: string;
      };
    }>();
    const info = data.user_info;
    if (!info || info.auth === 0) throw new XtreamError('Identifiants refusés par le serveur');
    if (info.status && info.status !== 'Active') {
      throw new XtreamError(`Abonnement ${info.status.toLowerCase()}`);
    }
    return {
      status: info.status ?? 'Active',
      expires: info.exp_date ? new Date(Number(info.exp_date) * 1000) : undefined,
      maxConnections: info.max_connections ? Number(info.max_connections) : undefined,
    };
  }

  async getChannels(): Promise<Channel[]> {
    const [categories, streams] = await Promise.all([
      this.api<RawCategory[]>('get_live_categories'),
      this.api<RawStream[]>('get_live_streams'),
    ]);
    const groups = new Map(categories.map((c) => [String(c.category_id), c.category_name]));
    const keywords = this.config.keywords ?? DEFAULT_CATEGORY_KEYWORDS;
    const kept = streams.filter((s) =>
      keepGroup(groups.get(String(s.category_id)) ?? '', this.config.groups ?? []),
    );
    return numberChannels(
      kept.map((s) => ({
        id: `xtream:${s.stream_id}`,
        number: '',
        rawNumber: s.num,
        name: s.name.trim(),
        category: categorize(groups.get(String(s.category_id)) ?? '', keywords),
        logo: s.stream_icon || undefined,
        image: s.stream_icon || undefined,
        streamUrl: this.streamUrl(s.stream_id),
        epgId: s.epg_channel_id || undefined,
      })),
    );
  }

  async getPrograms(channel: Channel, from: Date, to: Date, signal?: AbortSignal) {
    const streamId = channel.id.replace(/^xtream:/, '');
    const cached = this.epg.get(streamId);
    let programs = cached && Date.now() - cached.at < EPG_TTL ? cached.programs : undefined;
    if (!programs) {
      const data = await this.api<{ epg_listings?: RawListing[] }>(
        'get_short_epg',
        { stream_id: streamId, limit: String(EPG_LIMIT) },
        signal,
      );
      programs = (data.epg_listings ?? [])
        .map((l) => toProgram(l, channel.id))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      this.epg.set(streamId, { at: Date.now(), programs });
    }
    return programs.filter((p) => overlaps(p, from, to));
  }

  streamUrl(streamId: number | string): string {
    const { username, password, output = 'ts' } = this.config;
    return `${this.base}/live/${enc(username)}/${enc(password)}/${streamId}.${output}`;
  }

  private async api<T>(action?: string, params: Record<string, string> = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
      ...(action ? { action } : {}),
      ...params,
    });
    let response: Response;
    try {
      response = await this.http(`${this.base}/player_api.php?${query}`, { signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new XtreamError('Serveur injoignable');
    }
    if (!response.ok) throw new XtreamError(`Erreur du serveur (${response.status})`);
    return (await response.json()) as T;
  }
}

type Numbered = Omit<Channel, 'number'> & { number: string; rawNumber?: number | string | null };

/**
 * Display numbers: the provider's `num` when present and unique, otherwise the next free number
 * after the highest one, in list order. Always three digits at least ("004").
 */
export function numberChannels(channels: Numbered[]): Channel[] {
  const used = new Set<number>();
  const wanted = channels.map((c) => {
    const n = Number(c.rawNumber);
    if (!Number.isInteger(n) || n <= 0 || used.has(n)) return undefined;
    used.add(n);
    return n;
  });
  let next = Math.max(0, ...used) + 1;
  return channels.map((c, i) => {
    const n = wanted[i] ?? next++;
    const channel: Channel & { rawNumber?: unknown } = { ...c, number: String(n).padStart(3, '0') };
    delete channel.rawNumber;
    return channel;
  });
}

function toProgram(l: RawListing, channelId: string): Program {
  return {
    channelId,
    title: decode(l.title),
    description: l.description ? decode(l.description) : undefined,
    start: new Date(Number(l.start_timestamp) * 1000),
    end: new Date(Number(l.stop_timestamp) * 1000),
    // Xtream does not say whether a program is broadcast live.
    live: false,
  };
}

/** Xtream sends EPG text as base64 of UTF-8. */
export function decode(base64: string): string {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return base64;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
