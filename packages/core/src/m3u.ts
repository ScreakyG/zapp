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
    if (line.startsWith('#EXTINF')) {
      pending = parseExtinf(line);
    } else if (line.startsWith('#EXTGRP:') && pending && !pending.attrs['group-title']) {
      pending.attrs['group-title'] = line.slice('#EXTGRP:'.length).trim();
    } else if (!line.startsWith('#') && pending) {
      entries.push({ ...pending, url: line });
      pending = undefined;
    }
  }
  return entries;
}

/** `#EXTINF:-1 tvg-id="x" group-title="FR | Sport",Name` → attributes and display name. */
function parseExtinf(line: string): { name: string; attrs: Record<string, string> } {
  const body = line.slice(line.indexOf(':') + 1);
  const attrs: Record<string, string> = {};
  // The name follows the first comma that is outside quotes.
  let quoted = false;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '"') quoted = !quoted;
    else if (body[i] === ',' && !quoted) {
      comma = i;
      break;
    }
  }
  const head = comma >= 0 ? body.slice(0, comma) : body;
  for (const m of head.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]!.toLowerCase()] = m[2]!;
  const name = comma >= 0 ? body.slice(comma + 1).trim() : '';
  return { name: name || attrs['tvg-name'] || '', attrs };
}

export interface M3uOptions {
  groups?: string[];
  keywords?: CategoryKeywords;
}

/**
 * Channels from an M3U playlist (HANDOFF §6): tvg-chno → number, tvg-name/name → name,
 * group-title → category, tvg-logo → logo, tvg-id → EPG key. The id is derived from the stream
 * URL so it survives renumbering and group filtering.
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
  return numberChannels(
    kept.map((e) => ({
      id: `m3u:${hash(e.url)}`,
      number: '',
      rawNumber: e.attrs['tvg-chno'],
      name: e.name || e.attrs['tvg-name'] || e.url,
      category: categorize(e.attrs['group-title'] ?? '', keywords),
      logo: e.attrs['tvg-logo'] || undefined,
      image: e.attrs['tvg-logo'] || undefined,
      streamUrl: e.url,
      epgId: e.attrs['tvg-id'] || undefined,
    })),
  );
}

/** Short stable hash (FNV-1a, base 36) for ids derived from URLs. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
