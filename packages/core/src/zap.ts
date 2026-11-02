/**
 * Number zapping (HANDOFF §5): digits pile up in a 3-digit buffer, committed 1.5 s after the
 * last digit, or 250 ms after the third. Works from any screen; the app routes digits here.
 */

export const ZAP_MAX_DIGITS = 3;
export const ZAP_COMMIT_DELAY = 1500;
export const ZAP_FULL_COMMIT_DELAY = 250;

export interface NumberZapperEvents {
  /** The buffer changed ('' once committed). */
  onTyped(typed: string): void;
  /** Time to resolve `typed` to a channel. */
  onCommit(typed: string): void;
}

export class NumberZapper {
  private typed = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly events: NumberZapperEvents) {}

  press(digit: number): void {
    this.typed = (this.typed + String(digit)).slice(0, ZAP_MAX_DIGITS);
    this.events.onTyped(this.typed);
    clearTimeout(this.timer);
    const full = this.typed.length >= ZAP_MAX_DIGITS;
    this.timer = setTimeout(() => this.commit(), full ? ZAP_FULL_COMMIT_DELAY : ZAP_COMMIT_DELAY);
  }

  /** Drops the buffer without committing (Back, leaving the player). */
  cancel(): void {
    clearTimeout(this.timer);
    if (!this.typed) return;
    this.typed = '';
    this.events.onTyped('');
  }

  private commit(): void {
    const typed = this.typed;
    this.typed = '';
    this.events.onTyped('');
    this.events.onCommit(typed);
  }
}

/** Banner display of the buffer: "03_" while typing, the full number once three digits are in. */
export function formatTyped(typed: string): string {
  return typed.length < ZAP_MAX_DIGITS ? `${typed}_` : typed;
}

/** Index of the channel whose number matches `typed` numerically ("4" and "004" both find 004). */
export function findChannelByNumber(numbers: readonly string[], typed: string): number {
  const wanted = parseInt(typed, 10);
  if (Number.isNaN(wanted)) return -1;
  return numbers.findIndex((n) => parseInt(n, 10) === wanted);
}
