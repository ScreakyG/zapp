import { DemoSource, IndexedDbEpgStore, M3uSource, XtreamSource, type Source } from '@zapp/core';
import type { SecretStore, Settings } from './settings';

/** Name under which the Xtream password is kept in the SecretStore. */
export const XTREAM_SECRET = 'xtream-password';

/** The source the settings describe; the demo channels when none is configured. */
export async function buildSource(settings: Settings, secrets: SecretStore): Promise<Source> {
  const source = settings.source;
  if (source?.kind === 'xtream') {
    return new XtreamSource({
      server: source.server,
      username: source.username,
      password: (await secrets.get(XTREAM_SECRET)) ?? '',
      groups: settings.groups,
    });
  }
  if (source?.kind === 'm3u') {
    return new M3uSource({
      playlistUrl: source.playlistUrl,
      epgUrl: source.epgUrl,
      groups: settings.groups,
      store: new IndexedDbEpgStore(),
    });
  }
  return new DemoSource();
}
