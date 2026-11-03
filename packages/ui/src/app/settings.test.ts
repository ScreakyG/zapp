import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  localSecretStore,
  saveSettings,
  type KeyValueStorage,
} from './settings';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('settings', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const settings = {
      theme: 'ambre' as const,
      groups: ['FR'],
      favourites: ['xtream:1'],
      lastChannel: 'xtream:1',
      source: {
        kind: 'xtream' as const,
        server: 'http://x',
        username: 'me',
        epgUrl: 'https://vhepg.com/strong8k.xml.gz',
      },
    };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('never stores a password with the settings', () => {
    const storage = memoryStorage();
    const leaky = { kind: 'xtream', server: 'http://x', username: 'me', password: 'secret' };
    storage.setItem('zapp.settings.v1', JSON.stringify({ source: leaky }));
    expect(loadSettings(storage).source).toEqual({
      kind: 'xtream',
      server: 'http://x',
      username: 'me',
    });
  });

  it('falls back to defaults on missing, corrupt or odd data', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem('zapp.settings.v1', '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem('zapp.settings.v1', JSON.stringify({ theme: 'neon', favourites: [1, 'a'] }));
    expect(loadSettings(storage)).toMatchObject({ theme: 'graphite', favourites: ['a'] });
  });

  it('survives a storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });
});

describe('localSecretStore', () => {
  it('stores, reads and clears secrets apart from the settings', async () => {
    const storage = memoryStorage();
    const secrets = localSecretStore(storage);
    await secrets.set('xtream', 'p@ss');
    expect(await secrets.get('xtream')).toBe('p@ss');
    expect([...storage.data.keys()]).toEqual(['zapp.secret.xtream']);
    await secrets.set('xtream', undefined);
    expect(await secrets.get('xtream')).toBeUndefined();
  });
});
