import { describe, expect, it } from 'vitest';
import { visibleColumns } from './Home';

describe('visibleColumns', () => {
  it('keeps a few tiles around the focus, whatever the row length', () => {
    expect(visibleColumns(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleColumns(2000, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visibleColumns(2000, 1000)).toEqual([997, 998, 999, 1000, 1001, 1002, 1003, 1004, 1005]);
    expect(visibleColumns(2000, 1999)).toEqual([1996, 1997, 1998, 1999]);
    expect(visibleColumns(0, 0)).toEqual([]);
  });
});
