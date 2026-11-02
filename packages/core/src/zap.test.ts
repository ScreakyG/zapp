import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialNav, navigate, startZapping, type NavContext } from './nav';
import { NumberZapper, findChannelByNumber, formatTyped } from './zap';

describe('NumberZapper', () => {
  let typed: string[];
  let commits: string[];
  let zapper: NumberZapper;

  beforeEach(() => {
    vi.useFakeTimers();
    typed = [];
    commits = [];
    zapper = new NumberZapper({ onTyped: (t) => typed.push(t), onCommit: (t) => commits.push(t) });
  });
  afterEach(() => vi.useRealTimers());

  it('commits 1.5 s after the last digit', () => {
    zapper.press(0);
    vi.advanceTimersByTime(1000);
    zapper.press(4);
    vi.advanceTimersByTime(1499);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(commits).toEqual(['04']);
    expect(typed).toEqual(['0', '04', '']);
  });

  it('commits 250 ms after the third digit', () => {
    zapper.press(0);
    zapper.press(1);
    zapper.press(2);
    vi.advanceTimersByTime(249);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(commits).toEqual(['012']);
  });

  it('keeps at most three digits; a 4th digit restarts the short delay', () => {
    for (const d of [1, 2, 3]) zapper.press(d);
    vi.advanceTimersByTime(200);
    zapper.press(4);
    vi.advanceTimersByTime(200);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(commits).toEqual(['123']);
  });

  it('ignores anything but a single digit', () => {
    zapper.press(10);
    zapper.press(-1);
    zapper.press(1.5);
    vi.runAllTimers();
    expect(typed).toEqual([]);
    expect(commits).toEqual([]);
  });

  it('cancel on an empty buffer emits nothing', () => {
    zapper.cancel();
    expect(typed).toEqual([]);
  });

  it('a listener cancelling synchronously prevents the commit', () => {
    const z = new NumberZapper({ onTyped: () => z.cancel(), onCommit: (t) => commits.push(t) });
    z.press(3);
    vi.runAllTimers();
    expect(commits).toEqual([]);
  });

  it('onCommit may start a new number', () => {
    let first = true;
    const z = new NumberZapper({
      onTyped: () => {},
      onCommit: (t) => {
        commits.push(t);
        if (first) {
          first = false;
          z.press(9);
        }
      },
    });
    z.press(1);
    vi.runAllTimers();
    expect(commits).toEqual(['1', '9']);
  });

  it('starts a fresh buffer after a commit', () => {
    zapper.press(7);
    vi.runAllTimers();
    zapper.press(8);
    vi.runAllTimers();
    expect(commits).toEqual(['7', '8']);
  });

  it('cancel drops the buffer without committing', () => {
    zapper.press(5);
    zapper.cancel();
    vi.runAllTimers();
    expect(commits).toEqual([]);
    expect(typed).toEqual(['5', '']);
  });
});

describe('helpers', () => {
  it('formats the buffer like the banner', () => {
    expect(formatTyped('0')).toBe('0_');
    expect(formatTyped('03')).toBe('03_');
    expect(formatTyped('003')).toBe('003');
    expect(formatTyped('')).toBe('');
  });

  it('matches numbers numerically', () => {
    const numbers = ['001', '004', '013'];
    expect(findChannelByNumber(numbers, '4')).toBe(1);
    expect(findChannelByNumber(numbers, '013')).toBe(2);
    expect(findChannelByNumber(numbers, '99')).toBe(-1);
    expect(findChannelByNumber(numbers, '')).toBe(-1);
    expect(findChannelByNumber(numbers, '000')).toBe(-1);
    expect(findChannelByNumber(['000', '1'], '0')).toBe(0);
  });

  it('picks the first channel when numbers are duplicated', () => {
    expect(findChannelByNumber(['004', '005', '4'], '4')).toBe(0);
  });
});

describe('startZapping', () => {
  const ctx: NavContext = {
    now: 0,
    channelCount: 2,
    homeRows: [[0, 1]],
    guidePrograms: () => [],
    guideWindowStart: 0,
    mosaicFilterCount: 1,
    mosaicColumns: 4,
    mosaicChannels: () => [0, 1],
  };

  it('opens the player from any screen with the banner, without retuning', () => {
    const guide = { ...initialNav(ctx), screen: 'guide' as const };
    const r = startZapping(guide);
    expect(r.state).toMatchObject({ screen: 'player', prevScreen: 'guide' });
    expect(r.effects).toEqual([{ type: 'showBanner' }]);
  });

  it('keeps the origin when already in the player', () => {
    const playing = {
      ...initialNav(ctx),
      screen: 'player' as const,
      prevScreen: 'mosaic' as const,
    };
    expect(startZapping(playing).state.prevScreen).toBe('mosaic');
  });

  it('works from the menu zone and from settings, which keeps its own return', () => {
    const menu = { ...initialNav(ctx), zone: 'menu' as const };
    expect(startZapping(menu).state).toMatchObject({ screen: 'player', prevScreen: 'home' });

    const settings = {
      ...initialNav(ctx),
      screen: 'settings' as const,
      settingsReturn: 'guide' as const,
    };
    const playing = startZapping(settings).state;
    expect(playing).toMatchObject({ prevScreen: 'settings', settingsReturn: 'guide' });
    const back = navigate(playing, 'back', ctx).state;
    expect(navigate(back, 'back', ctx).state.screen).toBe('guide');
  });
});
