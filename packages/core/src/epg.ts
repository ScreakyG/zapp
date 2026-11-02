import type { Program } from './model';

const MINUTE = 60_000;

export type ProgramStatus = 'past' | 'current' | 'upcoming';

/** The program airing at `time`, if any. Programs are half-open: [start, end). */
export function programAt(programs: readonly Program[], time: Date): Program | undefined {
  const t = time.getTime();
  return programs.find((p) => p.start.getTime() <= t && t < p.end.getTime());
}

/** "Terminé" / "En cours" / "Dans N min" in the guide. */
export function status(program: Program, now: Date): ProgramStatus {
  if (now >= program.end) return 'past';
  if (now >= program.start) return 'current';
  return 'upcoming';
}

/** Whole minutes left before `program` ends, rounded up ("reste N min"). */
export function minutesLeft(program: Program, now: Date): number {
  return wholeMinutes(program.end.getTime() - now.getTime());
}

/** Whole minutes before `program` starts, rounded up ("Dans N min"). */
export function minutesUntil(program: Program, now: Date): number {
  return wholeMinutes(program.start.getTime() - now.getTime());
}

/** Share of `program` already elapsed, in [0, 1] (progress bars). */
export function progress(program: Program, now: Date): number {
  const total = program.end.getTime() - program.start.getTime();
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (now.getTime() - program.start.getTime()) / total));
}

export function overlaps(program: Program, from: Date, to: Date): boolean {
  return program.start < to && program.end > from;
}

function wholeMinutes(ms: number): number {
  return Math.max(0, Math.ceil(ms / MINUTE));
}
