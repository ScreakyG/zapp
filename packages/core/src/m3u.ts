import {
  DEFAULT_CATEGORY_KEYWORDS,
  categorize,
  keepGroup,
  type CategoryKeywords,
} from './categories';
import type { Channel } from './model';
import { numberChannels } from './xtream';

export interface M3uEntry {
  name: string;
  url: string;
  /** Attributes of the #EXTINF line: tvg-id, tvg-name, tvg-logo, tvg-chno, group-title… */
  attrs: Record<string, string>;
}

/**
 * Parses an extended M3U playlist. Tolerates CRLF, a BOM, blank lines, comments and the
 * #EXTGRP / #EXTVLCOPT lines some providers add between #EXTINF and the URL.
 */
export function parseM3u(text: string): M3uEntry[] {
  const entries: M3uEntry[] = [];
  let pending: { name: string; attrs: Record<string, string> } | undefined;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF/i.test(line)) {
      pending = parseExtinf(line);
    } else if (/^#EXTGRP:/i.test(line) && pending && !pending.attrs['group-title']) {
      pending.attrs['group-title'] = line.slice('#EXTGRP:'.length).trim();
    } else if (!line.startsWith('#') && pending) {
      // Kodi-style "url|User-Agent=…&Referer=…": a browser cannot send those headers, and the
      // suffix would break the request. Keep it aside.
      const bar = line.indexOf('|');
      const attrs =
        bar >= 0 ? { ...pending.attrs, 'http-headers': line.slice(bar + 1) } : pending.attrs;
      entries.push({ name: pending.name, attrs, url: bar >= 0 ? line.slice(0, bar) : line });
      pending = undefined;
    }
  }
  return entries;
}

/** Attribute values come double-quoted, single-quoted or bare depending on the provider. */
const ATTRIBUTE = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"',]+))/g;

/** `#EXTINF:-1 tvg-id="x" group-title="FR | Sport",Name` → attributes and display name. */
function parseExtinf(line: string): { name: string; attrs: Record<string, string> } {
  const body = line.slice(line.indexOf(':') + 1);
  const attrs: Record<string, string> = {};
  // The name follows the first comma that is outside quotes.
  let quote: string | undefined;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      comma = i;
      break;
    }
  }
  const head = comma >= 0 ? body.slice(0, comma) : body;
  ATTRIBUTE.lastIndex = 0;
  for (let m = ATTRIBUTE.exec(head); m; m = ATTRIBUTE.exec(head)) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  const name = comma >= 0 ? body.slice(comma + 1).trim() : '';
  return { name: name || attrs['tvg-name'] || '', attrs };
}

export interface M3uOptions {
  groups?: string[];
  keywords?: CategoryKeywords;
}

/**
 * Channels from an M3U playlist (HANDOFF §6): tvg-chno → number, group-title → category,
 * tvg-logo → logo, tvg-id → EPG key. The display name after the comma wins over tvg-name, which
 * providers often use as an EPG key. The id is derived from the stream URL so it survives
 * renumbering and group filtering; entries repeating a URL are dropped (the first one wins).
 */
export function m3uChannels(entries: M3uEntry[], options: M3uOptions = {}): Channel[] {
  const keywords = options.keywords ?? DEFAULT_CATEGORY_KEYWORDS;
  const seen = new Set<string>();
  const kept = entries.filter((e) => {
    if (seen.has(e.url) || !keepGroup(e.attrs['group-title'] ?? '', options.groups ?? [])) {
      return false;
    }
    seen.add(e.url);
    return true;
  });
  const ids = new Set<string>();
  return numberChannels(
    kept.map((e) => {
      // 53-bit hash: collisions are negligible even at 100k URLs; guard anyway.
      let id = `m3u:${hash(e.url)}`;
      for (let n = 2; ids.has(id); n++) id = `m3u:${hash(e.url)}-${n}`;
      ids.add(id);
      return {
        id,
        number: '',
        rawNumber: e.attrs['tvg-chno'],
        name: e.name || e.attrs['tvg-name'] || e.url,
        category: categorize(e.attrs['group-title'] ?? '', keywords),
        group: e.attrs['group-title'],
        logo: e.attrs['tvg-logo'] || undefined,
        image: e.attrs['tvg-logo'] || undefined,
        streamUrl: e.url,
        epgId: e.attrs['tvg-id'] || undefined,
      };
    }),
  );
}

/** Stable 53-bit hash (cyrb53), base 36, for ids derived from URLs. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
