import { describe, expect, it } from 'vitest';
import { DemoSource, toChannel } from './demo';
import { minutesLeft, minutesUntil, overlaps, programAt, progress, status } from './epg';
import type { Program } from './model';

// Any instant works: only its offset from the demo's 20:00 origin (52 min) matters.
const now = new Date('2026-11-02T21:52:00+01:00');
const source = new DemoSource(now);
const minutes = (m: number) => new Date(now.getTime() + m * 60_000);

describe('DemoSource', () => {
  it('lists the 13 demo channels with stable ids', async () => {
    const channels = await source.getChannels();
    expect(channels).toHaveLength(13);
    expect(channels[3]).toMatchObject({
      id: 'demo:004',
      number: '004',
      name: 'Stade Direct',
      category: 'sport',
    });
  });

  it('anchors the schedule on the given now', async () => {
    const [, , cinephare] = await source.getChannels();
    const programs = await source.getPrograms(cinephare!, minutes(-120), minutes(120));
    const current = programAt(programs, now)!;
    // "La nuit des étoiles" runs 20:15 → 21:45 in file time: started 37 min ago, 53 min left.
    expect(current.title).toBe('La nuit des étoiles');
    expect(current.channelId).toBe('demo:003');
    expect(current.start).toEqual(minutes(-37));
    expect(minutesLeft(current, now)).toBe(53);
  });

  it('truncates now to the minute', async () => {
    const shifted = new DemoSource(new Date(now.getTime() + 37_000));
    const [ondes] = await shifted.getChannels();
    const [first] = await shifted.getPrograms(ondes!, minutes(-60), minutes(60));
    expect(first!.start.getSeconds()).toBe(0);
  });

  it('returns only programs overlapping the window, sorted', async () => {
    const [ondes] = await source.getChannels();
    const programs = await source.getPrograms(ondes!, now, minutes(30));
    expect(programs.map((p) => p.title)).toEqual(['Grand débat', 'Journal de la nuit']);
  });

  it('maps home rows to channel ids, without sharing the JSON arrays', () => {
    const rows = source.homeRows();
    expect(rows[0]!.channels[0]).toBe('demo:003');
    rows[0]!.channels.push('x');
    expect(source.homeRows()[0]!.channels).not.toContain('x');
  });

  it('rejects an unknown category', () => {
    expect(() => toChannel({ number: '099', name: 'X', category: 'cuisine', image: '' })).toThrow(
      /cuisine/,
    );
  });
});

describe('epg helpers', () => {
  const program: Program = { channelId: 'c', title: 'a', start: minutes(-60), end: minutes(60), live: false };
  const next: Program = { ...program, title: 'b', start: minutes(60), end: minutes(120) };

  it('treats programs as half-open intervals', () => {
    expect(programAt([program, next], minutes(60))).toBe(next);
    expect(overlaps(program, minutes(60), minutes(90))).toBe(false);
    expect(programAt([program], minutes(61))).toBeUndefined();
  });

  it('computes status', () => {
    expect(status(program, now)).toBe('current');
    expect(status(next, now)).toBe('upcoming');
    expect(status(program, minutes(60))).toBe('past');
  });

  it('rounds minutes up and never goes negative', () => {
    expect(minutesLeft(program, new Date(program.end.getTime() - 30_000))).toBe(1);
    expect(minutesLeft(program, minutes(90))).toBe(0);
    expect(minutesUntil(next, now)).toBe(60);
    expect(minutesUntil(program, now)).toBe(0);
  });

  it('computes progress and clamps it', () => {
    expect(progress(program, now)).toBe(0.5);
    expect(progress(program, minutes(300))).toBe(1);
    expect(progress(program, minutes(-300))).toBe(0);
  });
});
