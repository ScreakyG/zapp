import { describe, expect, it } from 'vitest';
import { DemoSource } from './demo';
import { minutesLeft, programAt, progress } from './epg';

// Demo "now" (20:52 in the file) is pinned to this instant.
const now = new Date('2026-11-02T21:52:00+01:00');
const source = new DemoSource(now);
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe('DemoSource', () => {
  it('lists the 13 demo channels with valid categories', async () => {
    const channels = await source.getChannels();
    expect(channels).toHaveLength(13);
    expect(channels[3]).toMatchObject({ number: '004', name: 'Stade Direct', category: 'sport' });
  });

  it('anchors the schedule on the given now', async () => {
    const [, , cinephare] = await source.getChannels();
    const programs = await source.getPrograms(cinephare!, hours(-2), hours(2));
    const current = programAt(programs, now)!;
    // "La nuit des étoiles" runs 20:15 → 21:45 in file time, i.e. 37 min ago → 53 min left.
    expect(current.title).toBe('La nuit des étoiles');
    expect(minutesLeft(current, now)).toBe(53);
    expect(current.start).toEqual(new Date(now.getTime() - 37 * 60_000));
  });

  it('returns only programs overlapping the window, sorted', async () => {
    const [ondes] = await source.getChannels();
    const programs = await source.getPrograms(ondes!, now, hours(0.5));
    expect(programs.map((p) => p.title)).toEqual(['Grand débat', 'Journal de la nuit']);
  });

  it('exposes the home rows', () => {
    expect(source.homeRows().map((r) => r.title)).toContain('En direct maintenant');
  });
});

describe('epg helpers', () => {
  const program = {
    channelNumber: '001',
    title: 't',
    start: hours(-1),
    end: hours(1),
    live: false,
  };

  it('computes progress and clamps it', () => {
    expect(progress(program, now)).toBe(0.5);
    expect(progress(program, hours(5))).toBe(1);
    expect(progress(program, hours(-5))).toBe(0);
  });

  it('finds nothing in a gap', () => {
    expect(programAt([program], hours(2))).toBeUndefined();
  });
});
