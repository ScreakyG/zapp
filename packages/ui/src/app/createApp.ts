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
  CHANNEL_GROUPS,
  DemoSource,
  buildHomeRows,
  frenchLineup,
  type HomeRowSpec,
  type Source,
  NumberZapper,
  findChannelByNumber,
  MENU,
  createLimiter,
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
  type Action,
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
/**
 * A TV tab chip. `favourites`: Mes chaînes, in the order they were added; `group`: the themed
 * groups of the France preset; `category`: the other sources' categories.
 */
export interface TvFilter {
  id: string;
  label: string;
  kind: 'favourites' | 'all' | 'group' | 'category';
}

const FAVOURITES: TvFilter = { id: 'favourites', label: 'Mes chaînes', kind: 'favourites' };

/** France preset: Mes chaînes, then the themed groups mixing the TNT and the bouquets. */
export const GROUP_FILTERS: TvFilter[] = [
  FAVOURITES,
  ...CHANNEL_GROUPS.map((g) => ({ id: g.id, label: g.label, kind: 'group' as const })),
];

/** Other sources: Mes chaînes, every channel, then one chip per category. */
export const CATEGORY_FILTERS: TvFilter[] = [
  FAVOURITES,
  { id: 'all', label: 'Toutes', kind: 'all' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, kind: 'category' as const })),
];

/** List items visible at once on the TV screen; the focus scrolls the list past the 4th. */
export const TV_LIST_ROWS = 8;
export const TV_LIST_LEAD = 3;

/** An app of the home launcher: a paid bouquet of the France preset and its channels. */
export interface AppView {
  id: string;
  label: string;
  /** Indices into the channel list. */
  channels: number[];
  /** The bouquet's logo: the provider logo of its first channel that has one. */
  logo?: string;
}

export interface HomeRowView {
  title: string;
  channels: number[];
}

/** Up to this many channels, all programs are asked at load (demo); beyond, on demand. */
const EAGER_EPG_LIMIT = 60;
/** EPG requests in flight at once, whatever the source. */
const EPG_CONCURRENCY = 3;
/** Wait before asking again the programs of a channel whose request failed. */
const RETRY_DELAY = 60_000;

const HOVER_PAUSE = 300;
const WHEEL_STEP = 50;

function changed(a: NavState, b: NavState): boolean {
  return (
    a.screen !== b.screen ||
    a.zone !== b.zone ||
    a.menuIdx !== b.menuIdx ||
    a.home.row !== b.home.row ||
    a.home.cols[a.home.row] !== b.home.cols[b.home.row] ||
    a.guide.row !== b.guide.row ||
    a.guide.prog !== b.guide.prog ||
    a.tv.filter !== b.tv.filter ||
    a.tv.idx !== b.tv.idx ||
    a.app.app !== b.app.app ||
    a.app.idx !== b.app.idx
  );
}

/** Whether moving the focus from a to b slides a row, the rows or a grid. */
function scrolls(a: NavState, b: NavState): boolean {
  const homeCol = (s: NavState) => Math.max(0, (s.home.cols[s.home.row] ?? 0) - 2);
  const guideOffset = (s: NavState) => Math.max(0, s.guide.row - 3);
  const tvOffset = (s: NavState) => Math.max(0, s.tv.idx - TV_LIST_LEAD);
  const appOffset = (s: NavState) => Math.max(0, s.app.idx - TV_LIST_LEAD);
  return (
    a.home.row !== b.home.row ||
    homeCol(a) !== homeCol(b) ||
    guideOffset(a) !== guideOffset(b) ||
    tvOffset(a) !== tvOffset(b) ||
    appOffset(a) !== appOffset(b)
  );
}

const ACTION_KEYS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  ok: 'Enter',
  back: 'Escape',
} as const;

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
  /** Mouse support; defaults to everything but webOS. */
  pointer?: boolean;
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
  const [tvFilters, setTvFilters] = createSignal<TvFilter[]>(CATEGORY_FILTERS);
  const [searchQuery, setSearchQuery] = createSignal('');
  const searchable = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const searchIndex = createMemo(() => channels().map((c) => searchable(`${c.name} ${c.number}`)));
  const searchTerms = createMemo(() =>
    searchable(searchQuery()).trim().split(/\s+/).filter(Boolean),
  );
  const [homeRows, setHomeRows] = createSignal<HomeRowView[]>([]);
  const [apps, setApps] = createSignal<AppView[]>([]);
  const [now, setNow] = createSignal(Date.now());
  const [banner, setBanner] = createSignal(false);
  const [zap, setZap] = createSignal<ZapView>({ typed: '', error: false });
  /** Programs per channel id around now (EPG cache comes with #15). */
  const [programs, setPrograms] = createSignal<Map<string, Program[]>>(new Map());

  const channelIndex = createMemo(() => new Map(channels().map((c, i) => [c.id, i])));
  const matches = (i: number) => searchTerms().every((term) => searchIndex()[i]!.includes(term));
  /** Channels of a TV chip, as indices into the channel list, narrowed by the search. */
  const tvChannels = (filter: number): number[] => {
    const f = tvFilters()[filter];
    if (!f) return [];
    if (f.kind === 'favourites') {
      return settings().favourites.flatMap((id) => {
        const i = channelIndex().get(id);
        return i !== undefined && matches(i) ? [i] : [];
      });
    }
    return channels().flatMap((c, i) =>
      (f.kind === 'all' || (f.kind === 'group' ? c.groups?.includes(f.id) : c.category === f.id)) &&
      matches(i)
        ? [i]
        : [],
    );
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
    apps: apps().map((a) => a.channels),
    guidePrograms: (row: number) => guideSpans()[row] ?? [],
    guideWindowStart: guideStart(),
    tvFilterCount: tvFilters().length,
    tvChannels,
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
  /** Captures that cover the screen (text entry): the pointer cannot reach what is under them. */
  const modals = new Set<(e: KeyboardEvent) => boolean>();
  const captureKeys = (
    handler: (e: KeyboardEvent) => boolean,
    options: { modal?: boolean } = {},
  ) => {
    captures.push(handler);
    if (options.modal) modals.add(handler);
    return () => {
      const i = captures.indexOf(handler);
      if (i >= 0) captures.splice(i, 1);
      modals.delete(handler);
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
      return await load(mine, next, candidate?.settings ?? settings());
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

  const load = async (mine: number, next: AppSource, config: Settings): Promise<boolean> => {
    const catalogue = await next.getChannels();
    if (mine !== generation) return false;
    const lineup = config.channelPreset === 'france' ? frenchLineup(catalogue) : undefined;
    const bouquets = lineup?.bouquets;
    const list = lineup ? lineup.channels : catalogue;
    if (lineup && list.length === 0) {
      throw new Error(
        'Aucune chaîne reconnue pour le preset France. Choisissez Toutes les chaînes pour consulter votre catalogue.',
      );
    }
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
    const favourites = config.favourites;
    const favouriteIds = favourites.filter((id) => index.has(id));
    const curated = bouquets
      ? [
          ...(favouriteIds.length ? [{ title: 'Chaînes favorites', channels: favouriteIds }] : []),
          ...bouquets,
        ]
      : source.homeRows?.();
    batch(() => {
      setTvFilters(lineup ? GROUP_FILTERS : CATEGORY_FILTERS);
      // The TNT is no app: its channels are in the TV tab.
      setApps(
        (bouquets ?? [])
          .filter((b) => b.id !== 'tnt')
          .map((b) => {
            // In number order, like the lineup.
            const channels = b.channels.flatMap((id) => index.get(id) ?? []).sort((x, y) => x - y);
            return {
              id: b.id,
              label: b.label,
              channels,
              logo: channels.map((i) => list[i]!.logo).find(Boolean),
            };
          }),
      );
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
    startProgramsWindow();
    wanted = null;
    setPrograms(new Map());
    // A small list (demo) gets all its programs at once, which also fills "En direct maintenant".
    // A real panel lists thousands of channels: asking the EPG of all of them at start is the
    // burst that gets an IP banned, so only the channels on screen are asked (wantPrograms).
    programsLoaded =
      list.length <= EAGER_EPG_LIMIT
        ? requestPrograms(list.map((_, i) => i)).then(() => {
            if (mine !== generation || curated) return;
            showRows(buildHomeRows(list, (_, i) => onAir(i).program?.live ?? false, favourites));
          })
        : Promise.resolve();
    return true;
  };

  // Programs are asked per channel, a few at a time, for the window around now. A channel
  // whose EPG fails simply shows no program; it must not blank the others.
  let programsFrom = 0;
  let programsUntil = 0;
  /** Channel ids asked (queued, in flight or answered) in the current window. */
  let requested = new Set<string>();
  /** Channels on screen right now (last wantPrograms); null: every channel is wanted. */
  let wanted: Set<string> | null = null;
  /** A failed channel is asked again only after this time (ms), to avoid hammering it. */
  const retryAt = new Map<string, number>();
  const epgLimit = createLimiter(EPG_CONCURRENCY);

  const startProgramsWindow = () => {
    programsFrom = Date.now() - PROGRAM_SPAN;
    programsUntil = Date.now() + PROGRAM_SPAN;
    requested = new Set();
    retryAt.clear();
  };

  // Results are applied together once per microtask: each arrival would otherwise recompute
  // the guide rows and every tile.
  let arrivals = new Map<string, Program[]>();
  const flushArrivals = () => {
    const batch = arrivals;
    arrivals = new Map();
    setPrograms((prev) => {
      const next = new Map(prev);
      for (const [id, list] of batch) next.set(id, list);
      return next;
    });
  };

  const requestPrograms = (indices: number[]): Promise<void> => {
    const mine = generation;
    const epgSource = source;
    const list = untrack(channels);
    const now = Date.now();
    const todo = indices.flatMap((i) => {
      const c = list[i];
      return c && !requested.has(c.id) && (retryAt.get(c.id) ?? 0) <= now ? [c] : [];
    });
    if (todo.length === 0) return Promise.resolve();
    for (const c of todo) requested.add(c.id);
    const from = new Date(programsFrom);
    const to = new Date(programsUntil);
    return Promise.all(
      todo.map((c) =>
        epgLimit(async () => {
          // When its turn comes: skip a channel that left the screen (asked again if it comes
          // back) and any work of a source replaced by a reload.
          if (mine !== generation || (wanted && !wanted.has(c.id))) {
            if (mine === generation) requested.delete(c.id);
            return undefined;
          }
          try {
            return await epgSource.getPrograms(c, from, to);
          } catch {
            requested.delete(c.id);
            retryAt.set(c.id, Date.now() + RETRY_DELAY);
            return undefined;
          }
        }).then((programs) => {
          if (mine !== generation || !programs) return;
          if (arrivals.size === 0) queueMicrotask(flushArrivals);
          arrivals.set(c.id, programs);
        }),
      ),
    ).then(() => undefined);
  };

  /** Screens declare the channels they show; their programs are fetched if not yet asked. */
  const wantPrograms = (indices: number[]) => {
    const list = untrack(channels);
    if (list.length > EAGER_EPG_LIMIT) {
      wanted = new Set(indices.flatMap((i) => (list[i] ? [list[i].id] : [])));
    }
    void requestPrograms(indices);
  };

  // Slide the window before it runs out. Programs already shown stay until replaced; only the
  // channels on screen are asked again (the others when they come back into view).
  createEffect(() => {
    if (programsUntil && now() > programsUntil - PROGRAM_SPAN / 2) {
      const list = untrack(channels);
      const again = wanted ?? new Set(list.map((c) => c.id));
      startProgramsWindow();
      void requestPrograms(list.flatMap((c, i) => (again.has(c.id) ? [i] : [])));
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

  /**
   * Mouse and pointer input (#21) go through the same path as the remote: a pointer action is
   * replayed as the key that would have done it, so text entries and screens that capture keys
   * see it too.
   */
  const press = (action: Exclude<Action, { digit: number }>) =>
    onKey(new KeyboardEvent('keydown', { key: ACTION_KEYS[action], cancelable: true }));

  /**
   * Hovering an element focuses it: `target` derives the state where it has the focus. A focus
   * change that scrolls a row or the grid pauses hovering until the slide ends, or the element
   * sliding under a still cursor would take the focus, scroll again, and so on.
   */
  let hoverPausedUntil = 0;
  const point = (target: (state: NavState) => NavState, options: { click?: boolean } = {}) => {
    if (modals.size > 0) return;
    if (!options.click && Date.now() < hoverPausedUntil) return;
    const prev = nav();
    const next = target(prev);
    if (!changed(prev, next)) return;
    if (!options.click && scrolls(prev, next)) hoverPausedUntil = Date.now() + HOVER_PAUSE;
    apply({ state: next, effects: [] });
  };

  // The TV is driven by its remote only (the issue asks for no pointer effect there).
  const pointer = options.pointer ?? !/web0s|webos/i.test(navigator.userAgent);
  // Wheel and trackpad: deltas are summed and one step is taken per WHEEL_STEP pixels, so a
  // mouse notch (lines or pixels) moves once and a trackpad flick does not run away.
  let wheelX = 0;
  let wheelY = 0;
  let wheelReset: ReturnType<typeof setTimeout> | undefined;
  const onWheel = (e: WheelEvent) => {
    const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
    const horizontal = e.shiftKey ? e.deltaY : e.deltaX;
    wheelX += horizontal * scale;
    wheelY += (e.shiftKey ? 0 : e.deltaY) * scale;
    clearTimeout(wheelReset);
    wheelReset = setTimeout(() => (wheelX = wheelY = 0), 200);
    if (Math.abs(wheelX) >= WHEEL_STEP) {
      press(wheelX > 0 ? 'right' : 'left');
      wheelX = 0;
    } else if (Math.abs(wheelY) >= WHEEL_STEP) {
      press(wheelY > 0 ? 'down' : 'up');
      wheelY = 0;
    }
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    press('back');
  };
  // The mouse's "previous" side button.
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 3) press('back');
  };

  window.addEventListener('keydown', onKey);
  if (pointer) {
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mouseup', onMouseUp);
  }
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
    window.removeEventListener('wheel', onWheel);
    clearTimeout(wheelReset);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('mouseup', onMouseUp);
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
    wantPrograms,
    captureKeys,
    /** Whether the mouse drives the UI (PC); screens add hover and click handlers then. */
    pointer,
    press,
    point,
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
    apps,
    programs,
    onAir,
    guideStart,
    guideRows,
    nav: view,
    now: minute,
    banner,
    zap,
    tvChannels,
    tvFilters,
    searchQuery,
    search: (query: string) =>
      batch(() => {
        setSearchQuery(query);
        setNav((s) => ({ ...s, tv: { ...s.tv, idx: 0 } }));
      }),
  };
}

export type App = ReturnType<typeof createApp>;
