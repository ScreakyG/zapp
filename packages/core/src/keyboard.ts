import type { Action } from './keys';

/**
 * On-screen keyboard for typing URLs and credentials with the remote (#17): AZERTY letters,
 * a symbols page, and shortcuts for what IPTV addresses are made of.
 */

export type KeyboardMode = 'lower' | 'upper' | 'symbols';

export type KeyDef =
  | { kind: 'text'; label: string; text: string; width: number }
  | { kind: 'shift' | 'mode' | 'space' | 'backspace' | 'done'; label: string; width: number };

/** Every row is 10 units wide; up/down land on the key under the current one's centre. */
const ROW_UNITS = 10;

const chars = (row: string): KeyDef[] =>
  [...row].map((c) => ({ kind: 'text', label: c, text: c, width: 1 }));

const bottomRow = (mode: KeyboardMode): KeyDef[] => [
  { kind: 'shift', label: mode === 'upper' ? 'abc' : 'ABC', width: 1 },
  { kind: 'mode', label: mode === 'symbols' ? 'abc' : '123', width: 1 },
  { kind: 'text', label: 'http://', text: 'http://', width: 2 },
  { kind: 'text', label: '.com', text: '.com', width: 1 },
  { kind: 'space', label: 'Espace', width: 1 },
  { kind: 'backspace', label: '⌫', width: 2 },
  { kind: 'done', label: 'OK', width: 2 },
];

export function keyboardLayout(mode: KeyboardMode): KeyDef[][] {
  if (mode === 'symbols') {
    return [chars('1234567890'), chars(':/?=&%#+$!'), chars(".-_@,;*'^|"), bottomRow(mode)];
  }
  const rows = ['azertyuiop', 'qsdfghjklm', 'wxcvbn.-_@'];
  return [...rows.map((r) => chars(mode === 'upper' ? r.toUpperCase() : r)), bottomRow(mode)];
}

export interface KeyboardState {
  mode: KeyboardMode;
  row: number;
  col: number;
  value: string;
}

export function initialKeyboard(value = ''): KeyboardState {
  return { mode: 'lower', row: 0, col: 0, value };
}

export type KeyboardResult =
  | { state: KeyboardState; outcome?: undefined }
  | { state: KeyboardState; outcome: 'done' | 'cancel' };

type Nav = Exclude<Action, { digit: number }>;

/** Remote input: arrows move, OK presses the focused key, Back cancels. */
export function keyboardAction(
  state: KeyboardState,
  action: Nav | { digit: number },
): KeyboardResult {
  if (typeof action === 'object') return { state: type(state, String(action.digit)) };
  const layout = keyboardLayout(state.mode);
  switch (action) {
    case 'left':
    case 'right': {
      const row = layout[state.row]!;
      const col = Math.max(0, Math.min(row.length - 1, state.col + (action === 'left' ? -1 : 1)));
      return { state: { ...state, col } };
    }
    case 'up':
    case 'down': {
      const target = state.row + (action === 'up' ? -1 : 1);
      if (target < 0 || target >= layout.length) return { state };
      const centre =
        keyStart(layout[state.row]!, state.col) + layout[state.row]![state.col]!.width / 2;
      return { state: { ...state, row: target, col: keyAt(layout[target]!, centre) } };
    }
    case 'ok':
      return press(state, layout[state.row]![state.col]!);
    case 'back':
      return { state, outcome: 'cancel' };
  }
}

/** Typing on a physical keyboard (PC) while the on-screen one is open. */
export function keyboardKey(state: KeyboardState, key: string): KeyboardResult | undefined {
  if (key === 'Enter') return { state, outcome: 'done' };
  if (key === 'Escape') return { state, outcome: 'cancel' };
  if (key === 'Backspace') return { state: { ...state, value: state.value.slice(0, -1) } };
  if (key.length === 1) return { state: type(state, key) };
  return undefined;
}

function press(state: KeyboardState, key: KeyDef): KeyboardResult {
  switch (key.kind) {
    case 'text':
      return { state: type(state, key.text) };
    case 'space':
      return { state: type(state, ' ') };
    case 'backspace':
      return { state: { ...state, value: state.value.slice(0, -1) } };
    case 'shift':
      return { state: { ...state, mode: state.mode === 'upper' ? 'lower' : 'upper' } };
    case 'mode':
      return { state: { ...state, mode: state.mode === 'symbols' ? 'lower' : 'symbols' } };
    case 'done':
      return { state, outcome: 'done' };
  }
}

function type(state: KeyboardState, text: string): KeyboardState {
  return { ...state, value: state.value + text };
}

function keyStart(row: KeyDef[], col: number): number {
  return row.slice(0, col).reduce((x, k) => x + k.width, 0);
}

function keyAt(row: KeyDef[], x: number): number {
  let start = 0;
  for (let i = 0; i < row.length; i++) {
    const end = start + row[i]!.width;
    if (x < end || i === row.length - 1) return i;
    start = end;
  }
  return 0;
}

export const KEYBOARD_ROW_UNITS = ROW_UNITS;
