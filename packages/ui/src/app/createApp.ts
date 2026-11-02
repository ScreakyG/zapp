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
  MENU,
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

/** Nothing done yet: on Home, first row, first tile. */
function isInitial(s: NavState): boolean {
  return (
    s.screen === 'home' && s.zone === 'content' && s.home.row === 0 && !s.home.cols.some(Boolean)
  );
}

/** A source, optionally with curated home rows (the demo has some). */
export type AppSource = Source & { homeRows?: () => HomeRowSpec[] };

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
  /** Builds the source from the settings (overridden in tests). */
  buildSource?: (settings: Settings, secrets: SecretStore) => Promise<AppSource>;
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
  createEffect(
    on(
      () => settings().theme,
      (theme) => applyTheme(theme),
    ),
  );
  if (options.persist ?? true) {
    createEffect(on(settings, (s) => saveSettings(s), { defer: true }));
  }

  const makeSource = options.buildSource ?? buildSource;
  let source: AppSource = new DemoSource();
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

  /**
   * A screen or text entry can take the keys (digits, Back, a physical keyboard) before the
   * navigation and the zapper. The handler returns true when it handled the key; false lets the
   * key through.
   */
  const captures: ((e: KeyboardEvent) => boolean)[] = [];
  const captureKeys = (handler: (e: KeyboardEvent) => boolean) => {
    captures.push(handler);
    return () => {
      const i = captures.indexOf(handler);
      if (i >= 0) captures.splice(i, 1);
    };
  };

  const onKey = (e: KeyboardEvent) => {
    // The latest entry opened has the keys; closing it gives them back to the previous one.
    const capture = captures[captures.length - 1];
    if (capture?.(e)) {
      e.preventDefault();
      return;
    }
    const action = toAction(e);
    if (!action) return;
    e.preventDefault();
    // Holding an arrow keeps moving; holding a digit, OK or Back must not repeat it.
    if (e.repeat && (typeof action === 'object' || action === 'ok' || action === 'back')) return;
    setNow(Date.now());
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

  /**
   * (Re)builds the source and loads its channels; programs follow in the background. With a
   * candidate (settings screen), the source it describes is tried without saving anything: the
   * caller saves only on success. Resolves to whether channels were loaded.
   */
  const reload = async (candidate?: { settings: Settings; secrets: SecretStore }) => {
    const mine = ++generation;
    batch(() => {
      setLoading(true);
      setLoadError(undefined);
    });
    try {
      const next = await makeSource(
        candidate?.settings ?? settings(),
        candidate?.secrets ?? secrets,
      );
      return await load(mine, next);
    } catch (error) {
      if (mine !== generation) return false;
      console.error('Loading channels failed', error);
      setLoadError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (mine === generation) setLoading(false);
    }
  };

  /** Settles when the programs of the current load are in (tests, background work). */
  let programsLoaded: Promise<void> = Promise.resolve();

  const load = async (mine: number, next: AppSource): Promise<boolean> => {
    const list = await next.getChannels();
    if (mine !== generation) return false;
    // Only now that it works: a failed reload keeps the previous source and channels.
    source = next;
    const first = !resumed;
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
      setPrograms(new Map());
      setChannels(list);
      showRows(curated ?? buildHomeRows(list, () => false, favourites));
      // Indices of the previous list mean nothing in the new one: start over, but stay on the
      // settings screen when the reload comes from there.
      if (!first) {
        const s = nav();
        const fresh = initialNav(ctx());
        setNav(
          s.screen === 'settings'
            ? {
                ...fresh,
                screen: 'settings',
                zone: s.zone,
                menuIdx: s.menuIdx,
                settingsReturn: 'home',
              }
            : fresh,
        );
      }
      // Like a TV: start on the channel watched last, unless the user already moved.
      const last = list.findIndex((c) => c.id === settings().lastChannel);
      if (first && last >= 0 && isInitial(nav())) apply(openPlayer(nav(), last));
      resumed = true;
    });
    programsLoaded = loadPrograms(list, mine).then(() => {
      if (mine !== generation || curated) return;
      showRows(buildHomeRows(list, (_, i) => onAir(i).program?.live ?? false, favourites));
    });
    return true;
  };

  // A channel whose EPG fails simply shows no program; it must not blank the others.
  let programsUntil = 0;
  const loadPrograms = async (list: Channel[], mine: number) => {
    const from = new Date(Date.now() - PROGRAM_SPAN);
    const to = new Date(Date.now() + PROGRAM_SPAN);
    programsUntil = to.getTime();
    const epgSource = source;
    const loaded = await Promise.all(
      list.map((c) => epgSource.getPrograms(c, from, to).catch((): Program[] => [])),
    );
    // A reload started meanwhile: these programs belong to the previous source.
    if (mine !== generation) return;
    setPrograms(new Map(list.map((c, i) => [c.id, loaded[i] ?? []])));
  };

  // Slide the window before it runs out. TODO(#15): incremental refresh through the EPG cache.
  createEffect(() => {
    if (programsUntil && now() > programsUntil - PROGRAM_SPAN / 2) {
      void loadPrograms(untrack(channels), generation);
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
    programsLoaded: () => programsLoaded,
    captureKeys,
    /** Moves the focus up to the TabBar entry of the current screen (settings: the gear). */
    focusMenu: () =>
      apply({
        state: { ...nav(), zone: 'menu', menuIdx: MENU.indexOf(nav().screen as never) },
        effects: [],
      }),
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
