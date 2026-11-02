import { describe, expect, it } from 'vitest';
import { toAction } from './keys';

describe('toAction', () => {
  it('maps arrows and OK', () => {
    expect(toAction({ key: 'ArrowUp', keyCode: 38 })).toBe('up');
    expect(toAction({ key: 'Enter', keyCode: 13 })).toBe('ok');
  });

  it('maps every back key, including the webOS remote', () => {
    expect(toAction({ key: 'Escape', keyCode: 27 })).toBe('back');
    expect(toAction({ key: 'Backspace', keyCode: 8 })).toBe('back');
    expect(toAction({ key: 'Unidentified', keyCode: 461 })).toBe('back');
  });

  it('maps digits', () => {
    expect(toAction({ key: '7', keyCode: 55 })).toEqual({ digit: 7 });
  });

  it('ignores other keys', () => {
    expect(toAction({ key: 'a', keyCode: 65 })).toBeNull();
  });
});
