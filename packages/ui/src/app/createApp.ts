import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
  type Accessor,
} from 'solid-js';
import {
  CATEGORIES,
  DemoSource,
  buildHomeRows,
  type HomeRowSpec,
  type Source,
  NumberZapper,
  findChannelByNumber,
  initialNav,
  navigate,
  normalize,
  openPlayer,
  overlaps,
  programAt,
  progress,
  reanchorGuide,
  startZapping,
  toAction,
  type Channel,
  type Program,
  type Effect,
  type NavContext,
  type NavState,
} from '@zapp/core';
import { applyTheme } from '../theme/themes';
import {
  defaultSecretStore,
  loadSettings,
  saveSettings,
  type SecretStore,
  type Settings,
} from './settings';
import { buildSource } from './sources';

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

/** A source, optionally with curated home rows (the demo has some). */
type AppSource = Source & { homeRows?: () => HomeRowSpec[] };

const HALF_HOUR = 1_800_000;
export const GUIDE_SPAN = 4 * HALF_HOUR;

/** Hours of programs loaded on each side of now. */
const PROGRAM_SPAN = 6 * 3_600_000;

export interface OnAir {
  program?: Program;
  next?: Program;
  progress: number;
}

export interface ZapView {
  /** Buffer being typed, '' when idle. */
  typed: string;
  /** The last committed number matched no channel. */
  error: boolean;
}

export interface AppOptions {
  settings?: Settings;
  secrets?: SecretStore;
  /** Fixed source (tests); otherwise built from the settings. */
  source?: AppSource;
  /** Persist settings changes (off in tests). */
  persist?: boolean;
}

/**
 * App state: the settings, the channel list, the navigation state machine wired to the keyboard /
 * remote, the number zapper and the player banner. Screens only read from it.
 */
export function createApp(options: AppOptions = {}) {
  const secrets = options.secrets ?? defaultSecretStore();
  const [settings, setSettings] = createSignal<Settings>(options.settings ?? loadSettings());
  const updateSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  createEffect(() => applyTheme(settings().theme));
  if (options.persist ?? true) {
    createEffect(on(settings, (s) => saveSettings(s), { defer: true }));
  }

  let source: AppSource = options.source ?? new DemoSource();
  /** Why the configured source could not be loaded, for the settings screen. */
  const [loadError, setLoadError] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  const [channels, setChannels] = createSignal<Channel[]>([]);
  const [homeRows, setHomeRows] = createSignal<HomeRowView[]>([]);
  const [now, setNow] = createSignal(Date.now());
  const [banner, setBanner] = createSignal(false);
  const [zap, setZap] = createSignal<ZapView>({ typed: '', error: false });
  /** Programs per channel id around now (EPG cache comes with #15). */
  const [programs, setPrograms] = createSignal<Map<string, Program[]>>(new Map());

  const mosaicChannels = (filter: number) => {
    const id = MOSAIC_FILTERS[filter]?.id;
    return channels().flatMap((c, i) => (!id || c.category === id ? [i] : []));
  };

  /** Guide window: 2 h, starting 30 to 60 min before now so recent programs stay in view. */
  const guideStart = createMemo(() => Math.floor((now() - HALF_HOUR) / HALF_HOUR) * HALF_HOUR);
  /** Programs of each channel (one guide row per channel) overlapping the guide window. */
  const guideRows = createMemo(() => {
    const from = new Date(guideStart());
    const to = new Date(guideStart() + GUIDE_SPAN);
    return channels().map((c) => (programs().get(c.id) ?? []).filter((p) => overlaps(p, from, to)));
  });
  const guideSpans = createMemo(() =>
    guideRows().map((row) => row.map((p) => ({ start: p.start.getTime(), end: p.end.getTime() }))),
  );

  const ctx: Accessor<NavContext> = createMemo(() => ({
    now: now(),
    channelCount: channels().length,
    homeRows: homeRows().map((r) => r.channels),
    guidePrograms: (row: number) => guideSpans()[row] ?? [],
    guideWindowStart: guideStart(),
    mosaicFilterCount: MOSAIC_FILTERS.length,
    mosaicColumns: MOSAIC_COLUMNS,
    mosaicChannels,
  }));

  const [nav, setNav] = createSignal<NavState>(initialNav(ctx()));
  /** What screens render: the navigation state with indices clamped to the current content. */
  const view = createMemo(() => normalize(nav(), ctx()));

  // Guide rows changed (window slid, EPG reloaded): indices shifted, keep focus on the same show.
  createEffect(
    on(guideSpans, () => setNav((s) => reanchorGuide(s, untrack(ctx))), { defer: true }),
  );

  /** Now, to the minute: what screens display, so a keypress does not re-render every cell. */
  const minute = createMemo(() => Math.floor(now() / 60_000) * 60_000);

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
        if (effect.type === 'tune') {
          setZap({ typed: '', error: false });
          const id = channels()[effect.channel]?.id;
          if (id) updateSettings({ lastChannel: id });
        }
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

  /** Bumped by each reload so a slow, superseded load does not overwrite a newer one. */
  let generation = 0;
  let resumed = false;

  /** (Re)builds the source from the settings and loads its channels and programs. */
  const reload = async () => {
    const mine = ++generation;
    batch(() => {
      setLoading(true);
      setLoadError(undefined);
    });
    try {
      if (!options.source) source = await buildSource(settings(), secrets);
      await load(mine);
    } catch (error) {
      if (mine !== generation) return;
      console.error('Loading channels failed', error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mine === generation) setLoading(false);
    }
  };

  const load = async (mine: number) => {
    const list = await source.getChannels();
    if (mine !== generation) return;
    const index = new Map(list.map((c, i) => [c.id, i]));
    const showRows = (specs: HomeRowSpec[]) =>
      setHomeRows(
        specs.map((r) => ({
          title: r.title,
          channels: r.channels.flatMap((id) => index.get(id) ?? []),
        })),
      );
    // Curated rows when the source has them (demo). Otherwise show the category rows at once,
    // then add "En direct maintenant" once the EPG says what is live.
    // TODO(#15): refresh the live row as programs change, keeping the focus clamped.
    const curated = source.homeRows?.();
    const favourites = settings().favourites;
    batch(() => {
      setChannels(list);
      showRows(curated ?? buildHomeRows(list, () => false, favourites));
      // Like a TV: start on the channel watched last.
      const last = list.findIndex((c) => c.id === settings().lastChannel);
      if (!resumed && last >= 0) apply(openPlayer(nav(), last));
      resumed = true;
    });
    await loadPrograms(list);
    if (mine !== generation) return;
    if (!curated) {
      showRows(buildHomeRows(list, (_, i) => onAir(i).program?.live ?? false, favourites));
    }
  };

  // A channel whose EPG fails simply shows no program; it must not blank the others.
  let programsUntil = 0;
  const loadPrograms = async (list: Channel[]) => {
    const from = new Date(Date.now() - PROGRAM_SPAN);
    const to = new Date(Date.now() + PROGRAM_SPAN);
    programsUntil = to.getTime();
    const loaded = await Promise.all(
      list.map((c) => source.getPrograms(c, from, to).catch((): Program[] => [])),
    );
    setPrograms(new Map(list.map((c, i) => [c.id, loaded[i] ?? []])));
  };

  // Slide the window before it runs out. TODO(#15): incremental refresh through the EPG cache.
  createEffect(() => {
    if (programsUntil && now() > programsUntil - PROGRAM_SPAN / 2) {
      void loadPrograms(untrack(channels));
    }
  });

  /** What a channel airs now, for tiles and the banner. */
  const onAir = (channel: number): OnAir => {
    const c = channels()[channel];
    const list = c ? (programs().get(c.id) ?? []) : [];
    const at = new Date(minute());
    const program = programAt(list, at);
    return {
      program,
      next: program ? list.find((p) => p.start >= program.end) : undefined,
      progress: program ? progress(program, at) : 0,
    };
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
  void reload();

  return {
    settings,
    updateSettings,
    secrets,
    reload,
    loading,
    loadError,
    channels,
    homeRows,
    programs,
    onAir,
    guideStart,
    guideRows,
    nav: view,
    now: minute,
    banner,
    zap,
    mosaicChannels,
  };
}

export type App = ReturnType<typeof createApp>;
