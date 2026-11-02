import data from '../../../data/demo-channels.json';
import { overlaps } from './epg';
import { isCategory, type Channel, type Program, type Source } from './model';

const MINUTE = 60_000;

export interface HomeRow {
  title: string;
  channels: string[];
}

/**
 * Demo channels from data/demo-channels.json, used until a real source is configured.
 * The file's schedule is written relative to 20:00 with "now" = 20:52; it is shifted so that
 * its "now" lands on the `now` given here, keeping the demo live whatever the real time.
 */
export class DemoSource implements Source {
  private readonly origin: number;

  constructor(now: Date = new Date()) {
    this.origin = now.getTime() - minutesBetween(data.window.start, data.now) * MINUTE;
  }

  async getChannels(): Promise<Channel[]> {
    return data.channels.map((c) => {
      if (!isCategory(c.category)) throw new Error(`Unknown category ${c.category} on ${c.number}`);
      return {
        number: c.number,
        name: c.name,
        category: c.category,
        image: c.image,
        streamUrl: '',
      };
    });
  }

  async getPrograms(channel: Channel, from: Date, to: Date): Promise<Program[]> {
    const source = data.channels.find((c) => c.number === channel.number);
    if (!source) return [];
    return source.programs
      .map((p) => ({
        channelNumber: channel.number,
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
    return data.homeRows;
  }
}

function minutesBetween(from: string, to: string): number {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    return h * 60 + m;
  };
  return toMinutes(to) - toMinutes(from);
}
