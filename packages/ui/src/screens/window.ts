/**
 * Tiles kept in the DOM around the focus, so a row of thousands of channels stays light (#33).
 * Symmetric and generous: while an arrow is held the slide lags 2–3 tiles behind the focus, and
 * the tiles it still shows on either side must exist.
 */
const MARGIN = 6;

/** Columns rendered for a row around the focused column `col`. */
export function visibleColumns(length: number, col: number): number[] {
  const first = Math.max(0, col - MARGIN);
  const last = Math.min(length, col + MARGIN + 1);
  return Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
}
