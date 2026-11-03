import type { CategoryKeywords } from './categories';
import type { EpgStore } from './epg-cache';
import { m3uChannels, parseM3u } from './m3u';
import type { Channel, Program, Source } from './model';
import { XmltvGuide, epgChannelNames } from './xmltv-guide';

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

/** M3U playlist + XMLTV guide, joined on `tvg-id`. */
export class M3uSource implements Source {
  private readonly http: typeof fetch;
  private readonly guide: XmltvGuide;
  private headerEpgUrls: string[] = [];
  private channelsLoaded?: Promise<Channel[]>;
  constructor(private readonly config: M3uConfig) {
    this.http = config.fetch ?? fetch.bind(globalThis);
    this.guide = new XmltvGuide(
      async () => {
        await (this.channelsLoaded ?? this.getChannels());
        return this.config.epgUrl ? [this.config.epgUrl] : this.headerEpgUrls;
      },
      this.http,
      config.store,
      async () => {
        const channels = await (this.channelsLoaded ?? this.getChannels());
        return new Set(channels.flatMap((c) => (c.epgId ? [c.epgId] : [])));
      },
      async () => {
        const channels = await (this.channelsLoaded ?? this.getChannels());
        return epgChannelNames(channels);
      },
    );
  }

  getChannels(): Promise<Channel[]> {
    this.channelsLoaded = this.readPlaylist();
    return this.channelsLoaded;
  }

  async getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]> {
    return this.guide.getPrograms(channel, from, to);
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
    return channels;
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
