import { describe, expect, it } from 'vitest';
import {
  initialNav,
  navigate,
  normalize,
  openPlayer,
  programIndexAt,
  type NavContext,
  type NavState,
} from './nav';

// Times in minutes from the window start, like the prototype; now = 52.
const GUIDE = [
  [
    { start: 0, end: 30 },
    { start: 30, end: 75 },
    { start: 75, end: 120 },
  ],
  [
    { start: 0, end: 25 },
    { start: 25, end: 80 },
    { start: 80, end: 120 },
  ],
  [
    { start: 0, end: 15 },
    { start: 15, end: 105 },
    { start: 105, end: 120 },
  ],
  [
    { start: 0, end: 45 },
    { start: 45, end: 120 },
  ],
  [],
];
const MOSAIC = [[0, 1, 2, 3, 4], [1, 3], []];

const ctx: NavContext = {
  now: 52,
  channelCount: 5,
  homeRows: [
    [2, 3, 0],
    [3, 1],
    [0, 1, 2, 3, 4],
  ],
  guidePrograms: (row) => GUIDE[row] ?? [],
  guideWindowStart: 0,
  mosaicFilterCount: MOSAIC.length,
  mosaicColumns: 2,
  mosaicChannels: (f) => MOSAIC[f] ?? [],
};

function press(state: NavState, ...actions: Parameters<typeof navigate>[1][]): NavState {
  return actions.reduce((s, a) => navigate(s, a, ctx).state, state);
}

const start = initialNav(ctx);
const on = (patch: Partial<NavState>): NavState => ({ ...start, ...patch });

describe('home', () => {
  it('remembers the focused column per row', () => {
    const s = press(start, 'right', 'right', 'down', 'right', 'up');
    expect(s.home).toEqual({ row: 0, cols: [2, 1, 0] });
  });

  it('clamps at row ends', () => {
    expect(press(start, 'left').home.cols[0]).toBe(0);
    expect(press(start, 'right', 'right', 'right', 'right').home.cols[0]).toBe(2);
    expect(press(start, 'down', 'down', 'down', 'down').home.row).toBe(2);
  });

  it('goes up from the first row to the Home tab', () => {
    expect(press(start, 'up')).toMatchObject({ zone: 'menu', menuIdx: 0 });
  });

  it('opens the focused channel', () => {
    const r = navigate(press(start, 'right'), 'ok', ctx);
    expect(r.state).toMatchObject({ screen: 'player', prevScreen: 'home', player: { channel: 3 } });
    expect(r.effects).toEqual([{ type: 'tune', channel: 3 }, { type: 'showBanner' }]);
  });
});

describe('menu', () => {
  it('moves across tabs and the settings gear, then opens with OK', () => {
    const s = press(start, 'up', 'right', 'right', 'right', 'right');
    expect(s.menuIdx).toBe(3);
    expect(press(s, 'ok')).toMatchObject({
      screen: 'settings',
      prevScreen: 'home',
      zone: 'content',
    });
    expect(press(start, 'up', 'right', 'ok')).toMatchObject({ screen: 'guide', zone: 'content' });
  });

  it('comes back down to the content, or to the chips on the mosaic', () => {
    expect(press(start, 'up', 'down').zone).toBe('content');
    // Entering the mosaic focuses the grid; ↑ chips, ↑ tab, ↓ back to the chips.
    expect(press(start, 'up', 'right', 'right', 'ok', 'up', 'up', 'down').zone).toBe('chips');
  });

  it('Back from a tab returns home', () => {
    expect(press(on({ screen: 'guide', zone: 'menu', menuIdx: 1 }), 'back').screen).toBe('home');
  });
});

describe('guide', () => {
  const g = (row: number, prog: number, time = 52): NavState =>
    on({ screen: 'guide', guide: { row, prog, time } });

  it('entering from the tab lands on the program at the targeted time', () => {
    // Initial state was built before programs loaded: prog 0 is stale, time is now (52).
    const stale = on({ zone: 'menu', menuIdx: 1, guide: { row: 2, prog: 0, time: 52 } });
    expect(press(stale, 'ok').guide).toEqual({ row: 2, prog: 1, time: 52 });
  });

  it('a target behind the window start falls back to now', () => {
    const old = on({ zone: 'menu', menuIdx: 1, guide: { row: 0, prog: 0, time: -500 } });
    expect(press(old, 'ok').guide).toEqual({ row: 0, prog: 1, time: 52 });
  });

  it('starts on the program airing now', () => {
    expect(start.guide).toEqual({ row: 0, prog: 1, time: 52 });
  });

  it('← → move between programs and retarget the time', () => {
    expect(press(g(0, 1), 'right').guide).toEqual({ row: 0, prog: 2, time: 75 });
    expect(press(g(0, 1), 'left').guide).toEqual({ row: 0, prog: 0, time: 0 });
    expect(press(g(0, 2), 'left').guide).toEqual({ row: 0, prog: 1, time: 52 });
    expect(press(g(0, 2), 'right').guide.prog).toBe(2);
  });

  it('↑ ↓ keep the targeted time instead of jumping to the first cell', () => {
    // 75 targets "Journal de la nuit"; in row 1 that is the 25→80 program, in row 2 15→105.
    const s = press(g(0, 2, 75), 'down');
    expect(s.guide).toEqual({ row: 1, prog: 1, time: 75 });
    expect(press(s, 'down').guide).toEqual({ row: 2, prog: 1, time: 75 });
  });

  it('↑ from the first row goes to the Guide tab; ↓ stops at the last row', () => {
    expect(press(g(0, 1), 'up')).toMatchObject({ zone: 'menu', menuIdx: 1 });
    expect(press(g(4, 0), 'down').guide.row).toBe(4);
  });

  it('tolerates rows without programs', () => {
    expect(press(g(4, 0), 'right').guide.prog).toBe(0);
  });

  it('opens the row channel, and Back from the player lands on it at now', () => {
    const playing = press(g(2, 2, 110), 'ok');
    expect(playing).toMatchObject({ screen: 'player', player: { channel: 2 } });
    const back = press(playing, 'up', 'back');
    expect(back).toMatchObject({ screen: 'guide', zone: 'content' });
    expect(back.guide).toEqual({ row: 3, prog: 1, time: 52 });
  });
});

describe('mosaic', () => {
  const m = (filter: number, idx: number, zone: NavState['zone'] = 'content'): NavState =>
    on({ screen: 'mosaic', zone, mosaic: { filter, idx } });

  it('applies filters on ← → and resets to the first tile', () => {
    expect(press(m(0, 3, 'chips'), 'right').mosaic).toEqual({ filter: 1, idx: 0 });
    expect(press(m(0, 0, 'chips'), 'left').mosaic.filter).toBe(0);
  });

  it('moves in a 2-column grid', () => {
    expect(press(m(0, 0), 'right').mosaic.idx).toBe(1);
    expect(press(m(0, 1), 'right').mosaic.idx).toBe(1);
    expect(press(m(0, 1), 'down').mosaic.idx).toBe(3);
    expect(press(m(0, 3), 'left').mosaic.idx).toBe(2);
  });

  it('↓ above an incomplete last line drops onto the last tile', () => {
    expect(press(m(0, 3), 'down').mosaic.idx).toBe(4);
    expect(press(m(0, 4), 'down').mosaic.idx).toBe(4);
  });

  it('↑ from the first line goes to the chips, then to the Mosaic tab', () => {
    expect(press(m(0, 1), 'up').zone).toBe('chips');
    expect(press(m(0, 0, 'chips'), 'up')).toMatchObject({ zone: 'menu', menuIdx: 2 });
  });

  it('cannot enter an empty grid', () => {
    expect(press(m(2, 0, 'chips'), 'down').zone).toBe('chips');
  });

  it('opens the focused channel', () => {
    expect(press(m(1, 1), 'ok')).toMatchObject({
      screen: 'player',
      prevScreen: 'mosaic',
      player: { channel: 3 },
    });
  });

  it('OK on the chips enters the grid', () => {
    expect(press(m(0, 0, 'chips'), 'ok').zone).toBe('content');
  });
});

describe('Back', () => {
  it('returns home from the guide, the mosaic grid and the chips', () => {
    expect(press(on({ screen: 'guide' }), 'back').screen).toBe('home');
    expect(press(on({ screen: 'mosaic' }), 'back').screen).toBe('home');
    expect(press(on({ screen: 'mosaic', zone: 'chips' }), 'back').screen).toBe('home');
  });

  it('does nothing on home content', () => {
    expect(press(start, 'back')).toEqual(start);
  });
});

describe('player', () => {
  const p = (channel: number): NavState =>
    on({ screen: 'player', prevScreen: 'home', player: { channel } });

  it('↑ next and ↓ previous channel, looping, and retunes', () => {
    expect(press(p(4), 'up').player.channel).toBe(0);
    expect(press(p(0), 'down').player.channel).toBe(4);
    expect(navigate(p(1), 'up', ctx).effects).toEqual([
      { type: 'tune', channel: 2 },
      { type: 'showBanner' },
    ]);
  });

  it('← → OK only show the banner', () => {
    const state = p(1);
    for (const a of ['left', 'right', 'ok'] as const) {
      const r = navigate(state, a, ctx);
      expect(r.state).toEqual(state);
      expect(r.effects).toEqual([{ type: 'showBanner' }]);
    }
  });

  it('Back returns to the screen it was opened from', () => {
    expect(press(p(1), 'back')).toMatchObject({ screen: 'home', zone: 'content' });
  });

  it('openPlayer from the player keeps the original origin', () => {
    expect(openPlayer(p(1), 3).state).toMatchObject({ prevScreen: 'home', player: { channel: 3 } });
  });
});

describe('menu edges', () => {
  it('clamps ← on the first tab', () => {
    expect(press(start, 'up', 'left').menuIdx).toBe(0);
  });
});

describe('settings', () => {
  const settings = press(on({ screen: 'guide' }), 'up', 'right', 'right', 'right', 'ok');

  it('Back returns to the screen it was opened from', () => {
    expect(settings).toMatchObject({ screen: 'settings', settingsReturn: 'guide' });
    expect(press(settings, 'back').screen).toBe('guide');
  });

  it('ignores arrows for now', () => {
    expect(press(settings, 'left', 'down', 'ok')).toEqual(settings);
  });

  it('player opened over settings unwinds without getting stuck', () => {
    const playing = openPlayer(settings, 2).state;
    const back = press(playing, 'back');
    expect(back.screen).toBe('settings');
    expect(press(back, 'back').screen).toBe('guide');
  });
});

describe('normalize', () => {
  it('clamps indices left stale by shrunk content', () => {
    const stale = on({
      screen: 'mosaic',
      home: { row: 9, cols: [7, 7, 7] },
      mosaic: { filter: 1, idx: 5 },
      guide: { row: 9, prog: 9, time: 52 },
      player: { channel: 99 },
    });
    expect(normalize(stale, ctx)).toMatchObject({
      home: { row: 2, cols: [2, 1, 4] },
      mosaic: { filter: 1, idx: 1 },
      guide: { row: 4, prog: 0 },
      player: { channel: 4 },
    });
  });

  it('moves focus out of a grid that became empty', () => {
    expect(normalize(on({ screen: 'mosaic', mosaic: { filter: 2, idx: 0 } }), ctx).zone).toBe(
      'chips',
    );
  });

  it('lets OK act on a clamped home column', () => {
    const r = navigate(on({ home: { row: 1, cols: [0, 9, 0] } }), 'ok', ctx);
    expect(r.effects[0]).toEqual({ type: 'tune', channel: 1 });
  });

  it('survives empty content', () => {
    const empty: NavContext = {
      ...ctx,
      channelCount: 0,
      homeRows: [],
      mosaicChannels: () => [],
    };
    const s = initialNav(empty);
    expect(navigate(s, 'down', empty).state.home.row).toBe(0);
    expect(navigate(on({ screen: 'player' }), 'up', empty).effects).toEqual([
      { type: 'showBanner' },
    ]);
  });
});

describe('guide window', () => {
  // Epoch-like values with the window starting after the first program began.
  const t0 = 1_000_000;
  const windowed: NavContext = {
    ...ctx,
    now: t0 + 50,
    guideWindowStart: t0,
    guidePrograms: () => [
      { start: t0 - 30, end: t0 + 20 },
      { start: t0 + 20, end: t0 + 80 },
      { start: t0 + 80, end: t0 + 120 },
    ],
  };

  it('targets the visible start of a program that began before the window', () => {
    const s = on({ screen: 'guide', guide: { row: 0, prog: 1, time: t0 + 50 } });
    expect(navigate(s, 'left', windowed).state.guide).toEqual({ row: 0, prog: 0, time: t0 });
    expect(navigate(s, 'right', windowed).state.guide.time).toBe(t0 + 80);
  });
});

describe('programIndexAt', () => {
  it('falls back to the nearest program at the edges', () => {
    expect(programIndexAt(GUIDE[0]!, -5)).toBe(0);
    expect(programIndexAt(GUIDE[0]!, 500)).toBe(2);
    expect(programIndexAt([], 10)).toBe(0);
  });
});
