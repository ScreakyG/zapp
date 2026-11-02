import { describe, expect, it } from 'vitest';
import { visibleColumns } from './window';

describe('visibleColumns', () => {
  it('bounds the tiles rendered, whatever the row length', () => {
    expect(visibleColumns(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleColumns(2000, 1000)).toHaveLength(13);
    expect(visibleColumns(2000, 1999)).toEqual([1993, 1994, 1995, 1996, 1997, 1998, 1999]);
    expect(visibleColumns(0, 0)).toEqual([]);
  });

  it('keeps what was on screen while the row slides', () => {
    // At col c the screen shows c-3 (a sliver) to c+1; after a few quick moves right the slide
    // still shows those tiles.
    const after = visibleColumns(2000, 503);
    for (const c of [497, 498, 499, 500, 501]) expect(after).toContain(c);
  });
});
