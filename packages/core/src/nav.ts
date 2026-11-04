import type { Action } from './keys';

/**
 * Remote-control navigation (HANDOFF §5) as a pure state machine: one focused element at a time,
 * decided here rather than by the browser's Tab order. Screens render from `NavState`; the app
 * performs the returned effects (open the player, show the zap banner).
 */

export type Screen = 'home' | 'app' | 'tv' | 'guide' | 'player' | 'settings';
/** `back`: the ‹ Accueil button of a bouquet screen. */
export type Zone = 'menu' | 'search' | 'chips' | 'back' | 'content';

/** TabBar entries, left to right. The gear sits after the tabs, top right. */
export const MENU = ['home', 'tv', 'guide', 'settings'] as const;

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
  /** TV tab: the selected filter (applied as focus moves) and the focused list position. */
  tv: { filter: number; idx: number };
  /** Bouquet screen opened from the home launcher: which app, and the focused list position. */
  app: { app: number; idx: number };
  /**
   * Index in the channel list, and the list it was opened from (a TV filter, a home row):
   * ↑ ↓ zap within it. null: the whole channel list.
   */
  player: { channel: number; list: number[] | null };
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
  /**
   * Channels of each app (paid bouquet) of the home launcher. When there are apps, home shows
   * them on one row instead of `homeRows`; OK opens the bouquet screen.
   */
  apps: number[][];
  /** Programs of a guide row, clipped to the visible window, sorted. Guide row i = channel i. */
  guidePrograms(row: number): Span[];
  guideWindowStart: number;
  tvFilterCount: number;
  tvChannels(filter: number): number[];
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
    // Open TV on the first filter that has channels ("Mes chaînes" may be empty).
    tv: { filter: firstFilled(ctx), idx: 0 },
    app: { app: 0, idx: 0 },
    player: { channel: 0, list: null },
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
  const filter = clamp(state.tv.filter, 0, Math.max(0, ctx.tvFilterCount - 1));
  const items = ctx.tvChannels(filter).length;
  const playerList = state.player.list?.filter((i) => i < ctx.channelCount) ?? null;
  const app = clamp(state.app.app, 0, Math.max(0, ctx.apps.length - 1));
  const appItems = ctx.apps[app]?.length ?? 0;
  const next: NavState = {
    ...state,
    home: { row: homeRow, cols },
    guide: {
      row: guideRow,
      prog: clamp(state.guide.prog, 0, Math.max(0, programs.length - 1)),
      time: state.guide.time,
    },
    tv: { filter, idx: clamp(state.tv.idx, 0, Math.max(0, items - 1)) },
    app: { app, idx: clamp(state.app.idx, 0, Math.max(0, appItems - 1)) },
    player: {
      channel: clamp(state.player.channel, 0, Math.max(0, ctx.channelCount - 1)),
      list: playerList?.length ? playerList : null,
    },
  };
  // Nothing to focus in an emptied list: fall back to the chips.
  if (next.screen === 'tv' && next.zone === 'content' && items === 0) next.zone = 'chips';
  if (next.screen === 'app' && next.zone === 'content' && appItems === 0) next.zone = 'back';
  // Launcher: one row of apps, its focused column kept in home.cols[0].
  if (ctx.apps.length > 0) {
    next.home = {
      row: 0,
      cols: [clamp(state.home.cols[0] ?? 0, 0, ctx.apps.length - 1), ...cols.slice(1)],
    };
  }
  // The bouquet screen has no TabBar to focus.
  if (next.screen === 'app' && next.zone === 'menu') next.zone = 'back';
  return next;
}

type Nav = Exclude<Action, { digit: number }>;

export function navigate(current: NavState, action: Nav, ctx: NavContext): NavResult {
  const state = normalize(current, ctx);
  if (state.screen === 'player') return player(state, action, ctx);
  if (state.zone === 'menu') return menu(state, action, ctx);
  switch (state.screen) {
    case 'home':
      return ctx.apps.length > 0 ? launcher(state, action, ctx) : home(state, action, ctx);
    case 'app':
      return bouquet(state, action, ctx);
    case 'guide':
      return guide(state, action, ctx);
    case 'tv':
      return tv(state, action, ctx);
    case 'settings':
      return action === 'back'
        ? done({ ...state, screen: state.settingsReturn, zone: 'content' })
        : done(state);
  }
}

/**
 * Opens the player on `channel` from the current screen; ↑ ↓ then zap within `list` ([]: the
 * whole channel list). Without a list (number zapping), the current zap list is kept if it holds
 * the channel.
 */
export function openPlayer(state: NavState, channel: number, list?: number[]): NavResult {
  const from = state.screen === 'player' ? state.prevScreen : state.screen;
  const kept = state.player.list?.includes(channel) ? state.player.list : null;
  const zapList = list ? (list.includes(channel) ? list : null) : kept;
  return {
    state: { ...state, screen: 'player', prevScreen: from, player: { channel, list: zapList } },
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
    const list = state.player.list;
    const at = list ? list.indexOf(state.player.channel) : -1;
    const step = action === 'up' ? 1 : -1;
    const channel =
      list && at >= 0
        ? list[wrap(at + step, list.length)]!
        : wrap(state.player.channel + step, ctx.channelCount);
    return {
      state: { ...state, player: { channel, list: at >= 0 ? list : null } },
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
    if (state.prevScreen === 'app') {
      const idx = ctx.apps[state.app.app]?.indexOf(state.player.channel) ?? -1;
      if (idx >= 0) next.app = { ...state.app, idx };
    }
    if (state.prevScreen === 'tv') {
      // Back on the list it was opened from, on the channel watched (zapping may have moved it).
      const idx = ctx.tvChannels(state.tv.filter).indexOf(state.player.channel);
      if (idx >= 0) next.tv = { ...state.tv, idx };
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

/** Opening TV on a filter left empty (Mes chaînes, channels not loaded yet) picks a filled one. */
function enterTv(state: NavState, ctx: NavContext): NavState {
  if (state.screen !== 'tv' || ctx.tvChannels(state.tv.filter).length > 0) return state;
  return { ...state, tv: { filter: firstFilled(ctx), idx: 0 } };
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
      return done({ ...state, zone: state.screen === 'tv' ? 'search' : 'content' });
    case 'ok':
      return done(enterTv(enterGuide(goTo(state, MENU[state.menuIdx]!), ctx), ctx));
    case 'back':
      return state.screen === 'home' ? done(state) : done(goTo(state, 'home'));
    default:
      return done(state);
  }
}

/** Home as an app launcher: ← → across the apps, OK opens the bouquet screen. */
function launcher(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const col = state.home.cols[0] ?? 0;
  const setCol = (c: number) =>
    done({ ...state, home: { row: 0, cols: replace(state.home.cols, 0, c) } });
  switch (action) {
    case 'left':
      return setCol(Math.max(0, col - 1));
    case 'right':
      return setCol(Math.min(ctx.apps.length - 1, col + 1));
    case 'up':
      return done(toMenu(state, 'home'));
    case 'ok': {
      const empty = (ctx.apps[col]?.length ?? 0) === 0;
      return done({
        ...state,
        screen: 'app',
        zone: empty ? 'back' : 'content',
        app: { app: col, idx: 0 },
      });
    }
    default:
      return done(state);
  }
}

/** Bouquet screen: ‹ Accueil on top, then the bouquet's channel list. */
function bouquet(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const list = ctx.apps[state.app.app] ?? [];
  const home = (): NavResult =>
    done({
      ...state,
      screen: 'home',
      zone: 'content',
      menuIdx: 0,
      home: { row: 0, cols: replace(state.home.cols, 0, state.app.app) },
    });
  if (state.zone === 'back') {
    if (action === 'down' && list.length > 0) return done({ ...state, zone: 'content' });
    if (action === 'ok' || action === 'back') return home();
    return done(state);
  }
  const idx = Math.min(state.app.idx, list.length - 1);
  const at = (i: number) => done({ ...state, app: { ...state.app, idx: i } });
  switch (action) {
    case 'up':
      return idx <= 0 ? done({ ...state, zone: 'back' }) : at(idx - 1);
    case 'down':
      return idx < list.length - 1 ? at(idx + 1) : done(state);
    case 'ok': {
      const channel = list[idx];
      return channel === undefined ? done(state) : openPlayer(state, channel, list);
    }
    case 'back':
      return home();
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
      return channel === undefined ? done(state) : openPlayer(state, channel, ctx.homeRows[row]);
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
      return openPlayer(state, row, []);
    case 'back':
      return done(goTo(state, 'home'));
  }
}

function tv(state: NavState, action: Nav, ctx: NavContext): NavResult {
  const { filter } = state.tv;
  /** Filters apply as focus moves, without OK, and restart the list at its top. */
  const pick = (f: number): NavState => {
    const next = clamp(f, 0, Math.max(0, ctx.tvFilterCount - 1));
    return { ...state, tv: { filter: next, idx: next === filter ? state.tv.idx : 0 } };
  };
  if (state.zone === 'search') {
    if (action === 'up') return done(toMenu(state, 'tv'));
    if (action === 'down') return done({ ...state, zone: 'chips' });
    if (action === 'back') return done(goTo(state, 'home'));
    return done(state);
  }
  if (state.zone === 'chips') {
    switch (action) {
      case 'left':
      case 'right':
        return done(pick(filter + (action === 'left' ? -1 : 1)));
      case 'up':
        return done({ ...state, zone: 'search' });
      case 'down':
      case 'ok':
        return ctx.tvChannels(filter).length > 0
          ? done({ ...state, zone: 'content' })
          : done(state);
      case 'back':
        return done(goTo(state, 'home'));
    }
  }

  const list = ctx.tvChannels(filter);
  const idx = Math.min(state.tv.idx, list.length - 1);
  const at = (i: number) => done({ ...state, tv: { filter, idx: i } });
  switch (action) {
    case 'up':
      return idx <= 0 ? done({ ...state, zone: 'chips' }) : at(idx - 1);
    case 'down':
      return idx < list.length - 1 ? at(idx + 1) : done(state);
    case 'left':
    case 'right': {
      // From the list, ← → switch the filter too; an empty one hands the focus to the chips.
      const next = pick(filter + (action === 'left' ? -1 : 1));
      const empty = ctx.tvChannels(next.tv.filter).length === 0;
      return done({ ...next, zone: empty ? 'chips' : 'content' });
    }
    case 'ok': {
      const channel = list[idx];
      return channel === undefined ? done(state) : openPlayer(state, channel, list);
    }
    case 'back':
      return done(goTo(state, 'home'));
  }
}

/** First TV filter with channels, else the first one. */
function firstFilled(ctx: NavContext): number {
  for (let f = 0; f < ctx.tvFilterCount; f++) if (ctx.tvChannels(f).length > 0) return f;
  return 0;
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
