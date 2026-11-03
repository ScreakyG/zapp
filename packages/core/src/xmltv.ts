/**
 * Streaming XMLTV reader: programmes are picked out of the text as chunks arrive, so a guide of
 * tens of megabytes never sits in memory as a whole (nor as a DOM) on the TV. Only programmes of
 * the wanted channels that overlap the wanted window are kept.
 */

export interface XmltvProgramme {
  /** XMLTV `channel` attribute, matched against M3U `tvg-id`. */
  channel: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  category?: string;
}

export interface XmltvFilter {
  from: Date;
  to: Date;
  /** Keep only these channel ids; all when omitted. */
  channels?: ReadonlySet<string>;
  /** Requested EPG ids and their display names, used only when the exact id is absent. */
  channelNames?: ReadonlyMap<string, string | readonly string[]>;
}

/** Collects programmes from text chunks; call `push` per chunk, then `end`. */
export class XmltvReader {
  private buffer = '';
  private ids = new Set<string>();
  private names = new Map<string, string | null>();
  private aliases = new Map<string, string[]>();
  private mapped = false;
  readonly programmes: XmltvProgramme[] = [];

  constructor(private readonly filter: XmltvFilter) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let consumed = 0;
    let incomplete = -1;
    const element = /<(programme|channel)(?=\s|>)/g;
    for (;;) {
      element.lastIndex = consumed;
      const match = element.exec(this.buffer);
      const isHeader = match?.[1] === 'channel';
      const open = match?.index ?? -1;
      if (open < 0) break;
      const tagEnd = this.buffer.indexOf('>', open);
      if (tagEnd < 0) {
        incomplete = open;
        break;
      }
      // `<programme …/>` carries no title: skip it.
      if (this.buffer[tagEnd - 1] === '/') {
        consumed = tagEnd + 1;
        continue;
      }
      const closing = isHeader ? '</channel>' : '</programme>';
      const close = this.buffer.indexOf(closing, tagEnd);
      if (close < 0) {
        incomplete = open; // Wait for the rest of this element.
        break;
      }
      if (isHeader) this.header(this.buffer.slice(open, close));
      else this.element(this.buffer.slice(open, close));
      consumed = close + closing.length;
    }
    // Keep the element still being received, or a few characters in case "<progr" was cut.
    this.buffer =
      incomplete >= 0 ? this.buffer.slice(incomplete) : this.buffer.slice(consumed).slice(-16);
  }

  end(): XmltvProgramme[] {
    this.buffer = '';
    return this.programmes;
  }

  private element(xml: string): void {
    if (!this.mapped) {
      this.mapped = true;
      for (const [id, names] of this.filter.channelNames ?? []) {
        if (this.ids.has(id)) continue;
        const matches = new Set(
          (typeof names === 'string' ? [names] : names)
            .map((name) => this.names.get(normalizeChannelName(name)))
            .filter(Boolean),
        );
        const target = matches.size === 1 ? [...matches][0] : undefined;
        if (target) this.aliases.set(target, [...(this.aliases.get(target) ?? []), id]);
      }
    }
    const tagEnd = xml.indexOf('>');
    const tag = xml.slice(0, tagEnd);
    const channel = attribute(tag, 'channel');
    if (!channel) return;
    const targets = new Set(this.aliases.get(channel) ?? []);
    if (!this.filter.channels || this.filter.channels.has(channel)) targets.add(channel);
    if (!targets.size) return;
    const start = parseXmltvDate(attribute(tag, 'start'));
    const end = parseXmltvDate(attribute(tag, 'stop'));
    if (!start || !end || !(start < this.filter.to && end > this.filter.from)) return;
    const title = text(xml, 'title');
    if (!title) return;
    for (const target of targets)
      this.programmes.push({
        channel: target,
        title,
        start,
        end,
        description: text(xml, 'desc'),
        category: text(xml, 'category'),
      });
  }

  private header(xml: string): void {
    const id = attribute(xml.slice(0, xml.indexOf('>')), 'id');
    if (!id) return;
    this.ids.add(id);
    for (const match of xml.matchAll(/<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/g)) {
      const name = normalizeChannelName(decodeEntities(match[1]!));
      const previous = this.names.get(name);
      this.names.set(name, previous === undefined || previous === id ? id : null);
    }
  }
}

function normalizeChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/<!\[cdata\[|\]\]>/g, '');
}

/** Reads a whole XMLTV response body chunk by chunk. */
export async function readXmltv(
  body: ReadableStream<Uint8Array>,
  filter: XmltvFilter,
): Promise<XmltvProgramme[]> {
  const reader = new XmltvReader(filter);
  const decoder = new TextDecoder();
  const stream = body.getReader();
  for (;;) {
    const { done, value } = await stream.read();
    if (done) break;
    reader.push(decoder.decode(value, { stream: true }));
  }
  reader.push(decoder.decode());
  return reader.end();
}

/** "20261102204500 +0100" (seconds and offset optional) → Date. */
export function parseXmltvDate(value: string | undefined): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{2}):?(\d{2})?)?/.exec(
    value?.trim() ?? '',
  );
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s = '0', oh = '+00', om = '00'] = m;
  const utc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s);
  const sign = oh.startsWith('-') ? -1 : 1;
  const offset = sign * (Math.abs(+oh) * 60 + +om) * 60_000;
  return new Date(utc - offset);
}

function attribute(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : undefined;
}

/** Text of the first `<name …>…</name>` child (the first language listed wins). */
function text(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  if (!m) return undefined;
  const value = decodeEntities(m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim();
  return value || undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : +code.slice(1);
      return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}
