import { Gunzip } from 'fflate';
import { MemoryEpgStore, type EpgStore } from './epg-cache';
import { overlaps } from './epg';
import type { Channel, Program } from './model';
import { XmltvReader, type XmltvProgramme } from './xmltv';

const MAX_AGE = 6 * 3_600_000;
const HALF_WINDOW = 12 * 3_600_000;

/** Quality variants can share an EPG id; retain every name for alias resolution. */
export function epgChannelNames(channels: Channel[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const channel of channels) {
    if (!channel.epgId) continue;
    result.set(
      channel.epgId,
      [...new Set([...(result.get(channel.epgId) ?? []), channel.name])].sort(),
    );
  }
  return result;
}

/** Shared XMLTV download and cache for M3U and Xtream, independent of the visible rows. */
export class XmltvGuide {
  private guide?: Promise<Map<string, Program[]>>;
  private loadedAt = 0;
  constructor(
    private readonly urls: () => Promise<string[]>,
    private readonly http: typeof fetch,
    private readonly store: EpgStore = new MemoryEpgStore(),
    private readonly channels?: () => Promise<ReadonlySet<string>>,
    private readonly channelNames?: () => Promise<ReadonlyMap<string, string | readonly string[]>>,
  ) {}

  async getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]> {
    if (!channel.epgId) return [];
    if (!this.guide || Date.now() - this.loadedAt >= MAX_AGE) {
      const previous = this.guide;
      this.loadedAt = Date.now();
      this.guide = this.load().catch((error: unknown) => {
        // Back off after failure too: queued rows must not each download the broken guide.
        this.loadedAt = Date.now() - MAX_AGE + 60_000;
        if (previous) return previous;
        throw error;
      });
    }
    const guide = await this.guide;
    return (guide.get(channel.epgId) ?? [])
      .filter((p) => overlaps(p, from, to))
      .map((p) => ({ ...p, channelId: channel.id }));
  }

  private async load() {
    const urls = await this.urls();
    const channels = await this.channels?.();
    const channelNames = await this.channelNames?.();
    // A filtered guide cannot be reused after changing groups, even at the same URL.
    const scope =
      (channels ? `\n${JSON.stringify([...channels].sort())}` : '') +
      (channelNames ? `\nalias-v1:${JSON.stringify([...channelNames].sort())}` : '');
    let lastError: unknown;
    for (const url of urls) {
      const key = url + scope;
      const cached = await this.store.load(key).catch(() => undefined);
      if (cached && Date.now() - cached.savedAt < MAX_AGE) {
        this.loadedAt = cached.savedAt;
        return group(cached.programmes);
      }
      try {
        const response = await this.http(url);
        if (!response.ok) throw new Error(`Guide : erreur du serveur (${response.status})`);
        if (!response.body) throw new Error('Guide TV illisible');
        const now = Date.now();
        const programmes = await readGuideBody(response.body, now, channels, channelNames);
        this.loadedAt = Date.now();
        await this.store.save(key, programmes).catch(() => {});
        return group(programmes);
      } catch {
        lastError = new Error('Guide TV indisponible ou illisible');
      }
    }
    if (lastError) throw lastError;
    return new Map<string, Program[]>();
  }
}

/** Detect gzip from bytes: fetch may already have decoded Content-Encoding, even for .gz. */
async function readGuideBody(
  body: ReadableStream<Uint8Array>,
  now: number,
  channels?: ReadonlySet<string>,
  channelNames?: ReadonlyMap<string, string | readonly string[]>,
) {
  const reader = body.getReader();
  const xml = new XmltvReader({
    from: new Date(now - HALF_WINDOW),
    to: new Date(now + HALF_WINDOW),
    channels,
    channelNames,
  });
  const decoder = new TextDecoder();
  let prefix = new Uint8Array(0);
  let detected = false;
  let gunzip: Gunzip | undefined;
  let tail = '';
  let opened = false;
  let closed = false;
  const consumeText = (text: string) => {
    const scan = tail + text;
    opened ||= /<tv(?:\s|>)/.test(scan);
    closed ||= /<\/tv\s*>/.test(scan);
    tail = scan.slice(-32);
    xml.push(text);
  };
  const consume = (data: Uint8Array) => consumeText(decoder.decode(data, { stream: true }));
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      let chunk = value;
      if (!detected) {
        const combined = new Uint8Array(prefix.length + chunk.length);
        combined.set(prefix);
        combined.set(chunk, prefix.length);
        prefix = combined;
        if (prefix.length < 2) continue;
        detected = true;
        if (prefix[0] === 0x1f && prefix[1] === 0x8b) gunzip = new Gunzip(consume);
        chunk = prefix;
      }
      if (gunzip) gunzip.push(chunk);
      else consume(chunk);
    }
    if (gunzip) gunzip.push(new Uint8Array(0), true);
    else if (!detected) consume(prefix);
    consumeText(decoder.decode());
    if (!opened || !closed) throw new Error('Guide XMLTV incomplet ou illisible');
    return xml.end();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function group(programmes: XmltvProgramme[]) {
  const result = new Map<string, Program[]>();
  for (const p of programmes) {
    const list = result.get(p.channel) ?? [];
    list.push({
      channelId: '',
      title: p.title,
      start: p.start,
      end: p.end,
      description: p.description,
      genre: p.category,
      live: false,
    });
    result.set(p.channel, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
  return result;
}
