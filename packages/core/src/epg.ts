import type { Program } from './model';

const MINUTE = 60_000;

/** The program airing at `time`, if any. */
export function programAt(programs: readonly Program[], time: Date): Program | undefined {
  const t = time.getTime();
  return programs.find((p) => p.start.getTime() <= t && t < p.end.getTime());
}

/** Whole minutes left before `program` ends, rounded up ("reste N min"). */
export function minutesLeft(program: Program, now: Date): number {
  return Math.max(0, Math.ceil((program.end.getTime() - now.getTime()) / MINUTE));
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
