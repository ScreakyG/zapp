import { THEMES, DEFAULT_THEME, type Theme } from '../theme/themes';
import type { ChannelPreset } from '@zapp/core';

/** Where channels come from. Passwords are kept apart, in a SecretStore. */
export type SourceConfig =
  | { kind: 'xtream'; server: string; username: string; epgUrl?: string }
  | { kind: 'm3u'; playlistUrl: string; epgUrl?: string };

export interface Settings {
  theme: Theme;
  /** Provider groups to keep ("FR"); empty keeps all. */
  groups: string[];
  /** Missing in older settings means the complete provider catalogue. */
  channelPreset?: ChannelPreset;
  /** Channel ids, in display order. */
  favourites: string[];
  /** Id of the channel watched last, reopened at start-up. */
  lastChannel?: string;
  /** None: the demo channels. */
  source?: SourceConfig;
}

export const DEFAULT_SETTINGS: Settings = { theme: DEFAULT_THEME, groups: [], favourites: [] };

const KEY = 'zapp.settings.v1';

/** The part of Web Storage used here (a Map-backed fake in tests). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Settings in localStorage. Storage can be missing or throw (private mode, quota, a TV that
 * wiped it): reads fall back to defaults and failed writes are ignored, never crashing the app.
 */
export function loadSettings(storage = safeLocalStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings, storage = safeLocalStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; the app keeps working with the settings in memory.
  }
}

/** Keeps only well-formed fields from what was stored (older versions, hand edits). */
export function sanitize(value: unknown): Settings {
  const v = (value ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const strings = (x: unknown) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
  return {
    theme: THEMES.includes(v.theme as Theme) ? (v.theme as Theme) : DEFAULT_THEME,
    groups: strings(v.groups),
    channelPreset: v.channelPreset === 'france' ? 'france' : undefined,
    favourites: strings(v.favourites),
    lastChannel: typeof v.lastChannel === 'string' ? v.lastChannel : undefined,
    source: sanitizeSource(v.source),
  };
}

function sanitizeSource(value: unknown): SourceConfig | undefined {
  const s = value as Record<string, unknown> | undefined;
  if (s?.kind === 'xtream' && typeof s.server === 'string' && typeof s.username === 'string') {
    return {
      kind: 'xtream',
      server: s.server,
      username: s.username,
      epgUrl: typeof s.epgUrl === 'string' ? s.epgUrl : undefined,
    };
  }
  if (s?.kind === 'm3u' && typeof s.playlistUrl === 'string') {
    return {
      kind: 'm3u',
      playlistUrl: s.playlistUrl,
      epgUrl: typeof s.epgUrl === 'string' ? s.epgUrl : undefined,
    };
  }
  return undefined;
}

/**
 * Where passwords live. On the TV, localStorage (ADR 0001: personal use); Electron provides an
 * implementation backed by safeStorage (#20) through its preload script.
 */
export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string | undefined): Promise<void>;
}

declare global {
  interface Window {
    /** Exposed by the Electron preload script. */
    zappSecrets?: SecretStore;
  }
}

export function localSecretStore(storage = safeLocalStorage()): SecretStore {
  const key = (name: string) => `zapp.secret.${name}`;
  return {
    async get(name) {
      try {
        return storage?.getItem(key(name)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    async set(name, value) {
      try {
        if (value === undefined) storage?.removeItem(key(name));
        else storage?.setItem(key(name), value);
      } catch {
        // Not persisted.
      }
    },
  };
}

/** The platform's secret store: Electron's when present, localStorage otherwise. */
export function defaultSecretStore(): SecretStore {
  return (typeof window !== 'undefined' && window.zappSecrets) || localSecretStore();
}

function safeLocalStorage(): KeyValueStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
