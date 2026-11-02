import { batch, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  CATEGORIES,
  DemoSource,
  NumberZapper,
  findChannelByNumber,
  initialNav,
  navigate,
  normalize,
  openPlayer,
  startZapping,
  toAction,
  type Channel,
  type Effect,
  type NavContext,
  type NavState,
} from '@zapp/core';

export const BANNER_DURATION = 4000;
export const MOSAIC_COLUMNS = 4;

/** Mosaic chips: "Toutes" then one per category. */
export const MOSAIC_FILTERS = [
  { id: null, label: 'Toutes' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

export interface HomeRowView {
  title: string;
  channels: number[];
}

export interface ZapView {
  /** Buffer being typed, '' when idle. */
  typed: string;
  /** The last committed number matched no channel. */
  error: boolean;
}

/**
 * App state: the channel list, the navigation state machine wired to the keyboard / remote, the
 * number zapper and the player banner. Screens only read from it.
 */
export function createApp(source = new DemoSource()) {
  const [channels, setChannels] = createSignal<Channel[]>([]);
  const [homeRows, setHomeRows] = createSignal<HomeRowView[]>([]);
  const [now, setNow] = createSignal(Date.now());
  const [banner, setBanner] = createSignal(false);
  const [zap, setZap] = createSignal<ZapView>({ typed: '', error: false });

  const mosaicChannels = (filter: number) => {
    const id = MOSAIC_FILTERS[filter]?.id;
    return channels().flatMap((c, i) => (!id || c.category === id ? [i] : []));
  };

  const ctx: Accessor<NavContext> = createMemo(() => ({
    now: now(),
    channelCount: channels().length,
    homeRows: homeRows().map((r) => r.channels),
    // Filled in by the guide screen (#8).
    guidePrograms: () => [],
    guideWindowStart: now(),
    mosaicFilterCount: MOSAIC_FILTERS.length,
    mosaicColumns: MOSAIC_COLUMNS,
    mosaicChannels,
  }));

  const [nav, setNav] = createSignal<NavState>(initialNav(ctx()));
  /** What screens render: the navigation state with indices clamped to the current content. */
  const view = createMemo(() => normalize(nav(), ctx()));

  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  const showBanner = () => {
    setBanner(true);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      setBanner(false);
      setZap((z) => ({ ...z, error: false }));
    }, BANNER_DURATION);
  };

  const apply = (result: { state: NavState; effects: Effect[] }) => {
    batch(() => {
      setNav(result.state);
      for (const effect of result.effects) {
        if (effect.type === 'showBanner') showBanner();
        if (effect.type === 'tune') setZap({ typed: '', error: false });
      }
    });
  };

  const zapper = new NumberZapper({
    onTyped: (typed) => {
      setZap({ typed, error: false });
      // Keep the banner up while digits are being typed.
      if (typed) showBanner();
    },
    onCommit: (typed) => {
      const index = findChannelByNumber(
        channels().map((c) => c.number),
        typed,
      );
      if (index < 0) {
        setZap({ typed: '', error: true });
        showBanner();
      } else {
        apply(openPlayer(nav(), index));
      }
    },
  });

  const onKey = (e: KeyboardEvent) => {
    const action = toAction(e);
    if (!action) return;
    e.preventDefault();
    // Holding an arrow keeps moving; holding a digit, OK or Back must not repeat it.
    if (e.repeat && (typeof action === 'object' || action === 'ok' || action === 'back')) return;
    setNow(Date.now());
    // TODO(#17/#18): route digits to the focused text field instead of the zapper in settings.
    if (typeof action === 'object') {
      apply(startZapping(nav()));
      zapper.press(action.digit);
      return;
    }
    if (action === 'back' && nav().screen === 'player') {
      zapper.cancel();
      clearTimeout(bannerTimer);
      setBanner(false);
    }
    apply(navigate(nav(), action, ctx()));
  };

  const load = async () => {
    const list = await source.getChannels();
    const index = new Map(list.map((c, i) => [c.id, i]));
    batch(() => {
      setChannels(list);
      setHomeRows(
        source.homeRows().map((r) => ({
          title: r.title,
          channels: r.channels.flatMap((id) => index.get(id) ?? []),
        })),
      );
    });
  };

  window.addEventListener('keydown', onKey);
  // Tick on minute boundaries so the clock never shows the previous minute.
  let clock: ReturnType<typeof setInterval> | undefined;
  const firstTick = setTimeout(
    () => {
      setNow(Date.now());
      clock = setInterval(() => setNow(Date.now()), 60_000);
    },
    60_000 - (Date.now() % 60_000),
  );
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    clearTimeout(firstTick);
    clearInterval(clock);
    clearTimeout(bannerTimer);
    zapper.cancel();
  });
  void load();

  return { channels, homeRows, nav: view, now, banner, zap, mosaicChannels };
}

export type App = ReturnType<typeof createApp>;
