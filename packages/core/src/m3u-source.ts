import type { CategoryKeywords } from './categories';
import { MemoryEpgStore, type EpgStore } from './epg-cache';
import { overlaps } from './epg';
import { m3uChannels, parseM3u } from './m3u';
import type { Channel, Program, Source } from './model';
import { readXmltv, type XmltvProgramme } from './xmltv';

export interface M3uConfig {
  playlistUrl: string;
  /** XMLTV guide; defaults to the playlist's `url-tvg` / `x-tvg-url`. */
  epgUrl?: string;
  groups?: string[];
  keywords?: CategoryKeywords;
  store?: EpgStore;
  fetch?: typeof fetch;
}

export class M3uError extends Error {}

/** Guide kept around now: programmes outside ±12 h are dropped while reading. */
const EPG_HALF_WINDOW = 12 * 3_600_000;
/** A cached guide older than this is downloaded again. */
const EPG_MAX_AGE = 6 * 3_600_000;

/** M3U playlist + XMLTV guide, joined on `tvg-id`. */
export class M3uSource implements Source {
  private readonly http: typeof fetch;
  private readonly store: EpgStore;
  private headerEpgUrls: string[] = [];
  private epgIds = new Set<string>();
  private channelsLoaded?: Promise<Channel[]>;
  private guide?: Promise<Map<string, Program[]>>;
  /** When the guide in memory was read from the provider (not when it was loaded). */
  private guideAt = 0;

  constructor(private readonly config: M3uConfig) {
    this.http = config.fetch ?? fetch.bind(globalThis);
    this.store = config.store ?? new MemoryEpgStore();
  }

  getChannels(): Promise<Channel[]> {
    this.channelsLoaded = this.readPlaylist();
    return this.channelsLoaded;
  }

  async getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]> {
    if (!channel.epgId) return [];
    const guide = await this.loadGuide();
    return (guide.get(channel.epgId) ?? [])
      .filter((p) => overlaps(p, from, to))
      .map((p) => ({ ...p, channelId: channel.id }));
  }

  private async readPlaylist(): Promise<Channel[]> {
    const text = await this.download(this.config.playlistUrl, 'Playlist').then((r) => r.text());
    if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 2048))) {
      throw new M3uError('Ce fichier n’est pas une playlist M3U');
    }
    const header = /#EXTM3U[^\n]*?(?:url-tvg|x-tvg-url|tvg-url)="([^"]+)"/i.exec(text);
    this.headerEpgUrls = (header?.[1] ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const channels = m3uChannels(parseM3u(text), this.config);
    this.epgIds = new Set(channels.flatMap((c) => (c.epgId ? [c.epgId] : [])));
    return channels;
  }

  /**
   * The guide, read once for all channels and kept for EPG_MAX_AGE. A failed refresh keeps
   * serving the previous guide rather than blanking the grid.
   */
  private loadGuide(): Promise<Map<string, Program[]>> {
    if (this.guide && Date.now() - this.guideAt < EPG_MAX_AGE) return this.guide;
    const previous = this.guide;
    // Provisional, so concurrent calls share this load; readGuide sets the real age.
    this.guideAt = Date.now();
    const loading = this.readGuide();
    this.guide = loading.catch((error: unknown) => {
      this.guide = previous;
      if (previous) return previous;
      throw error;
    });
    return this.guide;
  }

  private async readGuide(): Promise<Map<string, Program[]>> {
    // The guide is filtered on the playlist's channels: wait for them.
    await (this.channelsLoaded ?? this.getChannels());
    const urls = this.config.epgUrl ? [this.config.epgUrl] : this.headerEpgUrls;
    if (urls.length === 0) {
      this.guideAt = Date.now();
      return new Map();
    }
    let lastError: unknown;
    for (const url of urls) {
      const cached = await this.store.load(url).catch(() => undefined);
      if (cached && Date.now() - cached.savedAt < EPG_MAX_AGE) {
        this.guideAt = cached.savedAt;
        return group(cached.programmes);
      }
      try {
        const programmes = await this.downloadGuide(url);
        this.guideAt = Date.now();
        await this.store.save(url, programmes).catch(() => {});
        return group(programmes);
      } catch (error) {
        lastError = error; // Try the next guide listed by the playlist.
      }
    }
    throw lastError;
  }

  private async downloadGuide(url: string) {
    const response = await this.download(url, 'Guide');
    if (!response.body) throw new M3uError('Guide TV illisible');
    // TODO: .xml.gz guides served without Content-Encoding need DecompressionStream (Chromium 80+).
    const now = Date.now();
    return readXmltv(response.body, {
      from: new Date(now - EPG_HALF_WINDOW),
      to: new Date(now + EPG_HALF_WINDOW),
      channels: this.epgIds,
    });
  }
  private async download(url: string, what: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.http(url);
    } catch {
      throw new M3uError(`${what} injoignable`);
    }
    if (!response.ok) throw new M3uError(`${what} : erreur du serveur (${response.status})`);
    return response;
  }
}

/** Programmes per EPG channel id, sorted. `channelId` is filled in per channel on lookup. */
function group(programmes: XmltvProgramme[]): Map<string, Program[]> {
  const byChannel = new Map<string, Program[]>();
  for (const p of programmes) {
    const list = byChannel.get(p.channel) ?? [];
    list.push({
      channelId: '',
      title: p.title,
      start: p.start,
      end: p.end,
      description: p.description,
      genre: p.category,
      live: false,
    });
    byChannel.set(p.channel, list);
  }
  for (const list of byChannel.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
  return byChannel;
}
