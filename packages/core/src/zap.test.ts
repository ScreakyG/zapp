import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialNav, startZapping, type NavContext } from './nav';
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

  it('keeps at most three digits', () => {
    for (const d of [1, 2, 3, 4]) zapper.press(d);
    vi.runAllTimers();
    expect(commits).toEqual(['123']);
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
  });

  it('matches numbers numerically', () => {
    const numbers = ['001', '004', '013'];
    expect(findChannelByNumber(numbers, '4')).toBe(1);
    expect(findChannelByNumber(numbers, '013')).toBe(2);
    expect(findChannelByNumber(numbers, '99')).toBe(-1);
    expect(findChannelByNumber(numbers, '')).toBe(-1);
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
});
