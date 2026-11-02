import type { Action } from './keys';

/**
 * Remote-control navigation (HANDOFF §5) as a pure state machine: one focused element at a time,
 * decided here rather than by the browser's Tab order. Screens render from `NavState`; the app
 * performs the returned effects (open the player, show the zap banner).
 */

export type Screen = 'home' | 'guide' | 'mosaic' | 'player' | 'settings';
export type Zone = 'menu' | 'chips' | 'content';

/** TabBar entries, left to right. The gear sits after the tabs, top right. */
export const MENU = ['home', 'guide', 'mosaic', 'settings'] as const;

export interface NavState {
  screen: Screen;
  /** Screen to return to from the player. */
  prevScreen: Screen;
  /** Screen to return to from settings (kept apart: the player can open over settings). */
  settingsReturn: Screen;
  zone: Zone;
  /** Focused menu entry while `zone` is 'menu'; the TabBar's current tab comes from `screen`. */
  menuIdx: number;
  /** Focused row, and the focused column remembered per row. */
  home: { row: number; cols: number[] };
  /** Focused channel row and program; `time` is the targeted instant kept across ↑↓ (ms). */
  guide: { row: number; prog: number; time: number };
  mosaic: { filter: number; idx: number };
  /** Index in the channel list. */
  player: { channel: number };
}

export interface Span {
  start: number;
  end: number;
}

/**
 * What the navigation needs to know about the content, in epoch ms and indices into the channel
 * list. Rebuild it when content or time changes; `normalize` then repairs stale indices.
 */
export interface NavContext {
  now: number;
  channelCount: number;
  homeRows: number[][];
  /** Programs of a guide row, clipped to the visible window, sorted. Guide row i = channel i. */
  guidePrograms(row: number): Span[];
  guideWindowStart: number;
  mosaicFilterCount: number;
  mosaicColumns: number;
  mosaicChannels(filter: number): number[];
}

/** `tune`: play `channel` (opening the player, or zapping inside it). */
export type Effect = { type: 'tune'; channel: number } | { type: 'showBanner' };

export interface NavResult {
  state: NavState;
  effects: Effect[];
}

export function initialNav(ctx: NavContext): NavState {
  return {
    screen: 'home',
    prevScreen: 'home',
    settingsReturn: 'home',
    zone: 'content',
    menuIdx: 0,
    home: { row: 0, cols: ctx.homeRows.map(() => 0) },
    guide: { row: 0, prog: programIndexAt(ctx.guidePrograms(0), ctx.now), time: ctx.now },
    mosaic: { filter: 0, idx: 0 },
    player: { channel: 0 },
  };
}

/**
 * Clamps every stored index to the current content (a filter list that shrank, a home row
 * shorter than its remembered column, a guide row whose programs changed). Screens render from
 * the normalized state so that exactly one element is focused; `navigate` applies it first.
 */
export function normalize(state: NavState, ctx: NavContext): NavState {
  const rows = ctx.homeRows;
  const homeRow = clamp(state.home.row, 0, Math.max(0, rows.length - 1));
  const cols = rows.map((r, i) => clamp(state.home.cols[i] ?? 0, 0, Math.max(0, r.length - 1)));
  const guideRow = clamp(state.guide.row, 0, Math.max(0, ctx.channelCount - 1));
  const programs = ctx.guidePrograms(guideRow);
  const filter = clamp(state.mosaic.filter, 0, Math.max(0, ctx.mosaicFilterCount - 1));
  const tiles = ctx.mosaicChannels(filter).length;
  const next: NavState = {
    ...state,
    home: { row: homeRow, cols },
    guide: {
      row: guideRow,
      prog: clamp(state.guide.prog, 0, Math.max(0, programs.length - 1)),
      time: state.guide.time,
    },
    mosaic: { filter, idx: clamp(state.mosaic.idx, 0, Math.max(0, tiles - 1)) },
    player: { channel: clamp(state.player.channel, 0, Math.max(0, ctx.channelCount - 1)) },
  };
  // Nothing to focus in an emptied mosaic grid: fall back to the chips.
  if (next.screen === 'mosaic' && next.zone === 'content' && tiles === 0) next.zone = 'chips';
  return next;
}

type Nav = Exclude<Action, { digit: number }>;

export function navigate(current: NavState, action: Nav, ctx: NavContext): NavResult {
  const state = normalize(current, ctx);
  if (state.screen === 'player') return player(state, action, ctx);
  if (state.zone === 'menu') return menu(state, action, ctx);
  switch (state.screen) {
    case 'home':
      return home(state, action, ctx);
    case 'guide':
      return guide(state, action, ctx);
    case 'mosaic':
      return mosaic(state, action, ctx);
    case 'settings':
      return action === 'back'
        ? done({ ...state, screen: state.settingsReturn, zone: 'content' })
        : done(state);
  }
}

/** Opens the player on `channel` from the current screen (also used by number zapping). */
export function openPlayer(state: NavState, channel: number): NavResult {
  const from = state.screen === 'player' ? state.prevScreen : state.screen;
  return {
    state: { ...state, screen: 'player', prevScreen: from, player: { channel } },
    effects: [{ type: 'tune', channel }, { type: 'showBanner' }],
  };
}

/**
 * First digit of a number zap: show the player (and its banner, where the digits appear) from
 * any screen, still on the current channel until the number is committed. Leaving the player
 * must also `cancel()` the NumberZapper.
 */
export function startZapping(state: NavState): NavResult {
  const next: NavState =
    state.screen === 'player' ? state : { ...state, screen: 'player', prevScreen: state.screen };
  return { state: next, effects: [{ type: 'showBanner' }] };
}

function player(state: NavState, action: Nav, ctx: NavContext): NavResult {
  if ((action === 'up' || action === 'down') && ctx.channelCount > 0) {
    const channel = wrap(state.player.channel + (action === 'up' ? 1 : -1), ctx.channelCount);
    return {
      state: { ...state, player: { channel } },
      effects: [{ type: 'tune', channel }, { type: 'showBanner' }],
    };
  }
  if (action === 'back') {
    const next: NavState = { ...state, screen: state.prevScreen, zone: 'content' };
    if (state.prevScreen === 'guide') {
      // Back from the guide's player: land on the watched channel, on the program airing now.
      const row = state.player.channel;
      next.guide = { row, prog: programIndexAt(ctx.guidePrograms(row), ctx.now), time: ctx.now };
    }
    return done(next);
  }
  return { state, effects: [{ type: 'showBanner' }] };
}

/**
 * Opening the guide lands on what airs at the targeted time in the remembered row; a target left
 * behind by the sliding window (or never set) falls back to now.
 */
function enterGuide(state: NavState, ctx: NavContext): NavState {
  return state.screen === 'guide' ? reanchorGuide(state, ctx) : state;
}

/**
 * Re-derives the focused guide program from the targeted time. Call it when the guide window
 * slides (programs drop out on the left, shifting indices) so the focus stays on the same show.
 */
export function reanchorGuide(state: NavState, ctx: NavContext): NavState {
  const time = state.guide.time < ctx.guideWindowStart ? ctx.now : state.guide.time;
  const prog = programIndexAt(ctx.guidePrograms(state.guide.row), time);
  return { ...state, guide: { row: state.guide.row, prog, time } };
}

function menu(state: NavState, action: Nav, ctx: NavContext): NavResult {
  switch (action) {
    case 'left':
      return done({ ...state, menuIdx: Math.max(0, state.menuIdx - 1) });
    case 'right':
      return done({ ...state, menuIdx: Math.min(MENU.length - 1, state.menuIdx + 1) });
    case 'down':
      return done({ ...state, zone: state.screen === 'mosaic' ? 'chips' : 'content' });
    case 'ok':
      return done(enterGuide(goTo(state, MENU[state.menuIdx]!), ctx));
    case 'back':
      return state.screen === 'home' ? done(state) : done(goTo(state, 'home'));
    default:
      return done(state);
  }
}

function home(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const { row, cols } = state.home;
  const col = cols[row] ?? 0;
  const len = ctx.homeRows[row]?.length ?? 0;
  const setCol = (c: number) => done({ ...state, home: { row, cols: replace(cols, row, c) } });
  switch (action) {
    case 'left':
      return setCol(Math.max(0, col - 1));
    case 'right':
      return setCol(Math.max(0, Math.min(len - 1, col + 1)));
    case 'up':
      return row > 0
        ? done({ ...state, home: { row: row - 1, cols } })
        : done(toMenu(state, 'home'));
    case 'down':
      return done({
        ...state,
        home: { row: Math.max(0, Math.min(ctx.homeRows.length - 1, row + 1)), cols },
      });
    case 'ok': {
      const channel = ctx.homeRows[row]?.[col];
      return channel === undefined ? done(state) : openPlayer(state, channel);
    }
    default:
      return done(state);
  }
}

function guide(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const { row, prog } = state.guide;
  switch (action) {
    case 'left':
    case 'right': {
      const programs = ctx.guidePrograms(row);
      if (programs.length === 0) return done(state);
      const p = clamp(prog + (action === 'left' ? -1 : 1), 0, programs.length - 1);
      const time = focusTime(programs[p]!, ctx);
      return done({ ...state, guide: { row, prog: p, time } });
    }
    case 'up':
    case 'down': {
      const next = row + (action === 'up' ? -1 : 1);
      if (next < 0) return done(toMenu(state, 'guide'));
      if (next >= ctx.channelCount) return done(state);
      // Keep the targeted time: land on what airs then in the new row, not on its first cell.
      const p = programIndexAt(ctx.guidePrograms(next), state.guide.time);
      return done({ ...state, guide: { row: next, prog: p, time: state.guide.time } });
    }
    case 'ok':
      return openPlayer(state, row);
    case 'back':
      return done(goTo(state, 'home'));
  }
}

function mosaic(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const { filter } = state.mosaic;
  if (state.zone === 'chips') {
    switch (action) {
      case 'left':
      case 'right': {
        // Filters apply as focus moves, without OK, and reset the grid to its first tile.
        const f = clamp(filter + (action === 'left' ? -1 : 1), 0, ctx.mosaicFilterCount - 1);
        return done({ ...state, mosaic: { filter: f, idx: 0 } });
      }
      case 'up':
        return done(toMenu(state, 'mosaic'));
      case 'down':
      case 'ok':
        return ctx.mosaicChannels(filter).length > 0
          ? done({ ...state, zone: 'content' })
          : done(state);
      case 'back':
        return done(goTo(state, 'home'));
    }
  }

  const list = ctx.mosaicChannels(filter);
  const cols = ctx.mosaicColumns;
  const idx = Math.min(state.mosaic.idx, list.length - 1);
  const at = (i: number) => done({ ...state, mosaic: { filter, idx: i } });
  switch (action) {
    case 'left':
      return idx % cols > 0 ? at(idx - 1) : done(state);
    case 'right':
      return idx % cols < cols - 1 && idx + 1 < list.length ? at(idx + 1) : done(state);
    case 'up':
      return idx < cols ? done({ ...state, zone: 'chips' }) : at(idx - cols);
    case 'down':
      if (idx + cols < list.length) return at(idx + cols);
      // Bottom of a column above an incomplete last line: drop onto the last tile.
      return Math.floor(idx / cols) < Math.floor((list.length - 1) / cols)
        ? at(list.length - 1)
        : done(state);
    case 'ok': {
      const channel = list[idx];
      return channel === undefined ? done(state) : openPlayer(state, channel);
    }
    case 'back':
      return done(goTo(state, 'home'));
  }
}

/** Index of the program airing at `time`, else the nearest one at the edges. */
export function programIndexAt(programs: Span[], time: number): number {
  const i = programs.findIndex((p) => p.start <= time && time < p.end);
  if (i >= 0) return i;
  if (programs.length === 0 || time < programs[0]!.start) return 0;
  return programs.length - 1;
}

/** Time targeted when a program gets focus: now if it is airing, else its (visible) start. */
function focusTime(p: Span, ctx: NavContext): number {
  if (p.start <= ctx.now && ctx.now < p.end) return ctx.now;
  return Math.max(p.start, ctx.guideWindowStart);
}

function goTo(state: NavState, screen: Screen): NavState {
  const menuIdx = MENU.indexOf(screen as (typeof MENU)[number]);
  if (screen === 'settings') {
    const settingsReturn = state.screen === 'settings' ? state.settingsReturn : state.screen;
    return { ...state, screen, settingsReturn, zone: 'content', menuIdx };
  }
  return { ...state, screen, zone: 'content', menuIdx };
}

function toMenu(state: NavState, screen: Screen): NavState {
  return { ...state, zone: 'menu', menuIdx: MENU.indexOf(screen as (typeof MENU)[number]) };
}

function done(state: NavState): NavResult {
  return { state, effects: [] };
}

function replace<T>(arr: T[], i: number, v: T): T[] {
  const copy = arr.slice();
  copy[i] = v;
  return copy;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wrap(v: number, n: number): number {
  return ((v % n) + n) % n;
}
