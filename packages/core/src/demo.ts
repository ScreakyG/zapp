import data from '../../../data/demo-channels.json';
import { overlaps } from './epg';
import { isCategory, type Channel, type Program, type Source } from './model';

const MINUTE = 60_000;

export interface HomeRow {
  title: string;
  /** Channel ids. */
  channels: string[];
}

interface DemoChannel {
  number: string;
  name: string;
  category: string;
  image: string;
}

/**
 * Demo channels from data/demo-channels.json, used until a real source is configured.
 * The file's schedule is written relative to 20:00 with "now" = 20:52; it is shifted so that
 * its "now" lands on the minute of `now` given here. The schedule covers about two hours from
 * there: recreate the source (e.g. on app resume) to keep it live.
 */
export class DemoSource implements Source {
  private readonly origin: number;

  constructor(now: Date = new Date()) {
    const minute = Math.floor(now.getTime() / MINUTE) * MINUTE;
    this.origin = minute - minutesBetween(data.window.start, data.now) * MINUTE;
  }

  async getChannels(): Promise<Channel[]> {
    return data.channels.map(toChannel);
  }

  async getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]> {
    const source = data.channels.find((c) => demoId(c.number) === channel.id);
    if (!source) return [];
    return source.programs
      .map((p) => ({
        channelId: channel.id,
        title: p.title,
        start: new Date(this.origin + p.startMin * MINUTE),
        end: new Date(this.origin + p.endMin * MINUTE),
        genre: p.genre,
        description: p.description,
        live: p.live,
      }))
      .filter((p) => overlaps(p, from, to))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  homeRows(): HomeRow[] {
    return data.homeRows.map((r) => ({ title: r.title, channels: r.channels.map(demoId) }));
  }
}

export function toChannel(c: DemoChannel): Channel {
  if (!isCategory(c.category)) throw new Error(`Unknown category ${c.category} on ${c.number}`);
  return {
    id: demoId(c.number),
    number: c.number,
    name: c.name,
    category: c.category,
    image: c.image,
    streamUrl: '',
  };
}

function demoId(number: string): string {
  return `demo:${number}`;
}

function minutesBetween(from: string, to: string): number {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    return h * 60 + m;
  };
  return toMinutes(to) - toMinutes(from);
}
