import {
  DEFAULT_CATEGORY_KEYWORDS,
  categorize,
  keepGroup,
  type CategoryKeywords,
} from './categories';
import { overlaps } from './epg';
import { createLimiter } from './limit';
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
  category_name?: string | null;
}

interface RawStream {
  num?: number | string | null;
  name?: string | null;
  stream_id: number | string;
  stream_icon?: string | null;
  epg_channel_id?: string | null;
  category_id?: string | null;
  /** Newer panels list several categories. */
  category_ids?: (string | number)[] | null;
}

interface RawListing {
  title: string;
  description?: string;
  start_timestamp: string | number;
  stop_timestamp: string | number;
  now_playing?: number;
}

/** Requests in flight at once to the panel. */
export const MAX_CONCURRENT_REQUESTS = 3;

/** How long a channel's short EPG is reused before asking the server again. */
const EPG_TTL = 10 * 60_000;
/** Listings asked per channel: enough to cover the guide's 2-hour window and beyond. */
const EPG_LIMIT = 12;

/** Xtream Codes API (player_api.php): live channels, categories and per-channel EPG. */
export class XtreamSource implements Source {
  private readonly base: string;
  private readonly http: typeof fetch;
  private readonly epg = new Map<string, { at: number; programs: Promise<Program[]> }>();
  /** Panels ban an IP that opens many connections at once: requests go out a few at a time. */
  private readonly limit = createLimiter(MAX_CONCURRENT_REQUESTS);

  /**
   * `server` is used as given: server_info's url/port/protocol are deliberately ignored, they are
   * often wrong behind a proxy.
   */
  constructor(private readonly config: XtreamConfig) {
    this.base = config.server.replace(/\/+$/, '');
    this.http = config.fetch ?? fetch.bind(globalThis);
  }

  /** Checks the credentials; throws XtreamError with a user-facing message when refused. */
  async account(): Promise<XtreamAccount> {
    const data = await this.api<{
      user_info?: {
        auth?: number | string;
        status?: string;
        exp_date?: string | number | null;
        max_connections?: string;
      };
    }>();
    const info = data?.user_info;
    if (!info || Number(info.auth) !== 1) throw new XtreamError(REFUSED);
    if (info.status && info.status !== 'Active') {
      throw new XtreamError(STATUS[info.status] ?? `Abonnement inactif (${info.status})`);
    }
    const expires = Number(info.exp_date);
    return {
      status: info.status ?? 'Active',
      expires: expires > 0 ? new Date(expires * 1000) : undefined,
      maxConnections: info.max_connections ? Number(info.max_connections) : undefined,
    };
  }

  async getChannels(): Promise<Channel[]> {
    const [categories, streams] = await Promise.all([
      this.api<RawCategory[]>('get_live_categories').then((x) => list<RawCategory>(x)),
      this.api<RawStream[]>('get_live_streams').then((x) => list<RawStream>(x)),
    ]);
    const groups = new Map(categories.map((c) => [String(c.category_id), c.category_name ?? '']));
    const keywords = this.config.keywords ?? DEFAULT_CATEGORY_KEYWORDS;
    const groupOf = (s: RawStream) =>
      groups.get(String(s.category_id ?? s.category_ids?.[0] ?? '')) ?? '';
    const kept = streams.filter((s) => keepGroup(groupOf(s), this.config.groups ?? []));
    return numberChannels(
      kept.map((s) => ({
        id: `xtream:${s.stream_id}`,
        number: '',
        rawNumber: s.num,
        name: String(s.name ?? '').trim(),
        category: categorize(groupOf(s), keywords),
        logo: s.stream_icon || undefined,
        image: s.stream_icon || undefined,
        streamUrl: this.streamUrl(s.stream_id),
        epgId: s.epg_channel_id || undefined,
      })),
    );
  }

  /**
   * The day's programs (get_simple_data_table, which includes the ones already aired that the
   * guide shows on its left), falling back to get_short_epg. One request per channel at a time:
   * the guide asks for every visible row at once and panels ban bursts.
   */
  async getPrograms(channel: Channel, from: Date, to: Date, signal?: AbortSignal) {
    const streamId = channel.id.replace(/^xtream:/, '');
    const cached = this.epg.get(streamId);
    let programs = cached && Date.now() - cached.at < EPG_TTL ? cached.programs : undefined;
    if (!programs) {
      programs = this.loadEpg(streamId, channel.id);
      this.epg.set(streamId, { at: Date.now(), programs });
      // A failed load is not cached.
      programs.catch(() => this.epg.delete(streamId));
    }
    const all = await abortable(programs, signal);
    return all.filter((p) => overlaps(p, from, to));
  }

  private async loadEpg(streamId: string, channelId: string): Promise<Program[]> {
    const listings = async (action: string, params: Record<string, string>) =>
      list<RawListing>(
        (await this.api<{ epg_listings?: RawListing[] }>(action, params))?.epg_listings,
      );
    let raw = await listings('get_simple_data_table', { stream_id: streamId }).catch(() => []);
    if (raw.length === 0) {
      raw = await listings('get_short_epg', { stream_id: streamId, limit: String(EPG_LIMIT) });
    }
    return raw
      .map((l) => toProgram(l, channelId))
      .filter((p) => p.end > p.start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
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
      // The body is read inside the slot: the connection stays open until then.
      response = await this.limit(async () => {
        const r = await this.http(`${this.base}/player_api.php?${query}`, { signal });
        return new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers });
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new XtreamError('Serveur injoignable');
    }
    if (response.status === 401 || response.status === 403) throw new XtreamError(REFUSED);
    if (!response.ok) throw new XtreamError(`Erreur du serveur (${response.status})`);
    try {
      return (await response.json()) as T | null;
    } catch {
      throw new XtreamError('Réponse du serveur illisible');
    }
  }
}

const REFUSED = 'Identifiants refusés par le serveur';
const STATUS: Record<string, string> = {
  Expired: 'Abonnement expiré',
  Banned: 'Compte banni par le fournisseur',
  Disabled: 'Compte désactivé',
};

/** Panels answer `{}`, `null` or an error object where a list is expected. */
function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
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
  // A loop, not Math.max(...used): panels list tens of thousands of streams.
  let next = 1;
  for (const n of used) if (n >= next) next = n + 1;
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
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  } catch {
    return base64;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
