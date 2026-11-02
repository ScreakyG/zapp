import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_ROW_UNITS,
  initialKeyboard,
  keyboardAction,
  keyboardKey,
  keyboardLayout,
  type KeyboardState,
} from './keyboard';
import type { Action } from './keys';

const press = (state: KeyboardState, ...actions: Action[]) =>
  actions.reduce((s, a) => keyboardAction(s, a).state, state);

describe('keyboardLayout', () => {
  it('has rows of equal width in every mode', () => {
    for (const mode of ['lower', 'upper', 'symbols'] as const) {
      for (const row of keyboardLayout(mode)) {
        expect(row.reduce((w, k) => w + k.width, 0)).toBe(KEYBOARD_ROW_UNITS);
      }
    }
  });

  it('is AZERTY', () => {
    expect(
      keyboardLayout('lower')[0]!
        .map((k) => k.label)
        .join(''),
    ).toBe('azertyuiop');
  });
});

describe('keyboardAction', () => {
  it('types with OK and moves with arrows, clamped at the edges', () => {
    const s = press(initialKeyboard(), 'ok', 'right', 'ok', 'left', 'left', 'ok');
    expect(s.value).toBe('aza');
  });

  it('lands under the current key when changing rows of different widths', () => {
    // From "n" (row 2, col 5, centre 5.5) down to the bottom row: "Espace" spans 5–6.
    const s = press({ ...initialKeyboard(), row: 2, col: 5 }, 'down');
    expect(keyboardLayout('lower')[s.row]![s.col]!.label).toBe('Espace');
    // From "OK" (8–10) up: centre 9 is the 10th key, "@".
    const up = press({ ...initialKeyboard(), row: 3, col: 6 }, 'up');
    expect(keyboardLayout('lower')[up.row]![up.col]!.label).toBe('@');
  });

  it('switches case and the symbols page', () => {
    const shifted = press({ ...initialKeyboard(), row: 3, col: 0 }, 'ok');
    expect(shifted.mode).toBe('upper');
    expect(press({ ...shifted, row: 0, col: 0 }, 'ok').value).toBe('A');
    const symbols = press({ ...initialKeyboard(), row: 3, col: 1 }, 'ok');
    expect(press({ ...symbols, row: 1, col: 0 }, 'ok').value).toBe(':');
  });

  it('offers the symbols found in provider passwords', () => {
    const labels = keyboardLayout('symbols')
      .flat()
      .map((k) => k.label)
      .join('');
    for (const c of "$*'^|@:/?=&%#") expect(labels).toContain(c);
  });

  it('has shortcuts, space and delete', () => {
    const s = press({ ...initialKeyboard(), row: 3, col: 2 }, 'ok', 'right', 'ok', 'right', 'ok');
    expect(s.value).toBe('http://.com ');
    expect(press({ ...s, col: 5 }, 'ok').value).toBe('http://.com');
  });

  it('types digits from the remote and ends with OK key or Back', () => {
    expect(keyboardAction(initialKeyboard(), { digit: 8 }).state.value).toBe('8');
    expect(keyboardAction({ ...initialKeyboard(), row: 3, col: 6 }, 'ok').outcome).toBe('done');
    expect(keyboardAction(initialKeyboard(), 'back').outcome).toBe('cancel');
  });
});

describe('keyboardKey', () => {
  it('accepts a physical keyboard', () => {
    let s = initialKeyboard('ab');
    s = keyboardKey(s, 'C')!.state;
    s = keyboardKey(s, 'Backspace')!.state;
    expect(s.value).toBe('ab');
    expect(keyboardKey(s, 'Enter')!.outcome).toBe('done');
    expect(keyboardKey(s, 'Escape')!.outcome).toBe('cancel');
    expect(keyboardKey(s, 'ArrowLeft')).toBeUndefined();
  });
});
