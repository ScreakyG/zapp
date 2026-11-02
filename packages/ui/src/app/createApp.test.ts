import { describe, expect, it } from 'vitest';
import { createRoot } from 'solid-js';
import type { Channel, Program, Source } from '@zapp/core';
import { DEFAULT_SETTINGS, localSecretStore, type Settings } from './settings';

// createApp listens to the keyboard and sets the theme on <html>: minimal stand-ins under Node.
const globals = globalThis as unknown as Record<string, unknown>;
globals.window ??= new EventTarget();
globals.document ??= { documentElement: { dataset: {} } };

const { createApp } = await import('./createApp');

const channel = (id: string, number: string): Channel => ({
  id,
  number,
  name: id,
  category: 'divert',
  streamUrl: '',
});

/** A source whose answers the test releases at will. */
function controlledSource(list: Channel[]) {
  let releaseChannels!: () => void;
  let releasePrograms!: () => void;
  const channelsGate = new Promise<void>((r) => (releaseChannels = r));
  const programsGate = new Promise<void>((r) => (releasePrograms = r));
  const source: Source = {
    getChannels: async () => {
      await channelsGate;
      return list;
    },
    getPrograms: async (c): Promise<Program[]> => {
      await programsGate;
      return [
        {
          channelId: c.id,
          title: `${c.id} now`,
          start: new Date(0),
          end: new Date(8e15),
          live: false,
        },
      ];
    },
  };
  return { source, releaseChannels, releasePrograms };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function start(settings: Partial<Settings>, sources: Source[]) {
  let i = 0;
  return createRoot((dispose) => ({
    app: createApp({
      settings: { ...DEFAULT_SETTINGS, ...settings },
      secrets: localSecretStore(undefined),
      persist: false,
      buildSource: async () => sources[Math.min(i++, sources.length - 1)]!,
    }),
    dispose,
  }));
}

describe('createApp', () => {
  it('reopens the last channel at start-up', async () => {
    const a = controlledSource([channel('a', '001'), channel('b', '002')]);
    const { app, dispose } = start({ lastChannel: 'b' }, [a.source]);
    a.releaseChannels();
    await flush();
    expect(app.nav()).toMatchObject({ screen: 'player', player: { channel: 1 } });
    dispose();
  });

  it('remembers the channel tuned', async () => {
    const a = controlledSource([channel('a', '001'), channel('b', '002')]);
    const { app, dispose } = start({}, [a.source]);
    a.releaseChannels();
    await flush();
    window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter', keyCode: 13 }));
    expect(app.settings().lastChannel).toBe('a');
    dispose();
  });

  it('drops programs of a source replaced while they were loading', async () => {
    const old = controlledSource([channel('old', '001')]);
    const fresh = controlledSource([channel('new', '001')]);
    const { app, dispose } = start({}, [old.source, fresh.source]);
    old.releaseChannels();
    await flush();
    const reloading = app.reload();
    fresh.releaseChannels();
    await flush();
    expect(app.channels().map((c) => c.id)).toEqual(['new']);
    old.releasePrograms(); // late answer of the previous source
    await flush();
    expect(app.programs().has('old')).toBe(false);
    fresh.releasePrograms();
    await reloading;
    await app.programsLoaded();
    expect(app.onAir(0).program?.title).toBe('new now');
    dispose();
  });

  it('resets navigation when the channel list changes', async () => {
    const old = controlledSource([channel('a', '001'), channel('b', '002')]);
    const fresh = controlledSource([channel('c', '001')]);
    const { app, dispose } = start({ lastChannel: 'b' }, [old.source, fresh.source]);
    old.releaseChannels();
    await flush();
    expect(app.nav().screen).toBe('player');
    fresh.releaseChannels();
    fresh.releasePrograms();
    await app.reload();
    expect(app.nav()).toMatchObject({ screen: 'home', player: { channel: 0 } });
    dispose();
  });

  it('stays on the settings screen across a reload', async () => {
    const a = controlledSource([channel('a', '001')]);
    const { app, dispose } = start({}, [a.source]);
    a.releaseChannels();
    await flush();
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter']) {
      window.dispatchEvent(Object.assign(new Event('keydown'), { key, keyCode: 0 }));
    }
    expect(app.nav().screen).toBe('settings');
    expect(await app.reload()).toBe(true);
    expect(app.nav().screen).toBe('settings');
    dispose();
  });

  it('tries a candidate source without touching the saved settings', async () => {
    const ok = controlledSource([channel('a', '001')]);
    const broken: Source = {
      getChannels: () => Promise.reject(new Error('Playlist injoignable')),
      getPrograms: async () => [],
    };
    const { app, dispose } = start({ groups: ['FR'] }, [ok.source, broken]);
    ok.releaseChannels();
    await flush();
    const candidate = { ...app.settings(), groups: ['BE'] };
    expect(await app.reload({ settings: candidate, secrets: app.secrets })).toBe(false);
    expect(app.loadError()).toBe('Playlist injoignable');
    expect(app.settings().groups).toEqual(['FR']);
    dispose();
  });

  it('keeps the previous channels when a reload fails', async () => {
    const ok = controlledSource([channel('a', '001')]);
    const broken: Source = {
      getChannels: () => Promise.reject(new Error('Serveur injoignable')),
      getPrograms: async () => [],
    };
    const { app, dispose } = start({}, [ok.source, broken]);
    ok.releaseChannels();
    await flush();
    await app.reload();
    expect(app.loadError()).toBe('Serveur injoignable');
    expect(app.channels().map((c) => c.id)).toEqual(['a']);
    dispose();
  });
});
