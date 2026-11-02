import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { XtreamError, XtreamSource, toAction } from '@zapp/core';
import type { App } from '../app/createApp';
import type { SourceConfig } from '../app/settings';
import { XTREAM_SECRET } from '../app/sources';
import { TextEntry } from '../components/TextEntry';
import { THEMES, nextTheme } from '../theme/themes';
import './Settings.css';

type Kind = 'demo' | 'xtream' | 'm3u';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'demo', label: 'Démo' },
  { id: 'xtream', label: 'Xtream Codes' },
  { id: 'm3u', label: 'Playlist M3U' },
];
const THEME_LABELS: Record<(typeof THEMES)[number], string> = {
  graphite: 'Graphite',
  phosphore: 'Phosphore',
  ambre: 'Ambre',
  lagon: 'Lagon',
};

/** Form being edited; saved to the settings only by "Enregistrer". */
interface Draft {
  kind: Kind;
  server: string;
  username: string;
  password: string;
  playlistUrl: string;
  epgUrl: string;
  groups: string;
}

type Row =
  | { kind: 'choice'; id: 'source' | 'theme'; label: string; value: string }
  | {
      kind: 'field';
      id: keyof Draft;
      label: string;
      value: string;
      secret?: boolean;
      hint?: string;
    }
  | { kind: 'button'; id: 'save' | 'reload'; label: string };

/** Settings (#18): source, credentials, groups kept, theme, reload. */
export function Settings(props: { app: App }) {
  const settings = props.app.settings;
  const source = settings().source;
  const [draft, setDraft] = createSignal<Draft>({
    kind: source?.kind ?? 'demo',
    server: source?.kind === 'xtream' ? source.server : '',
    username: source?.kind === 'xtream' ? source.username : '',
    password: '',
    playlistUrl: source?.kind === 'm3u' ? source.playlistUrl : '',
    epgUrl: source?.kind === 'm3u' ? (source.epgUrl ?? '') : '',
    groups: settings().groups.join(', '),
  });
  // Prefill the saved password, unless one was typed meanwhile.
  void props.app.secrets.get(XTREAM_SECRET).then((password) => {
    if (password) setDraft((d) => (d.password ? d : { ...d, password }));
  });

  const [focus, setFocus] = createSignal(0);
  const [editing, setEditing] = createSignal<Extract<Row, { kind: 'field' }>>();
  const [message, setMessage] = createSignal<{ text: string; error: boolean }>();
  const [busy, setBusy] = createSignal(false);

  const rows = createMemo((): Row[] => {
    const d = draft();
    const list: Row[] = [
      {
        kind: 'choice',
        id: 'source',
        label: 'Source',
        value: KINDS.find((k) => k.id === d.kind)!.label,
      },
    ];
    if (d.kind === 'xtream') {
      list.push(
        {
          kind: 'field',
          id: 'server',
          label: 'Serveur',
          value: d.server,
          hint: 'http://exemple.com:8080',
        },
        { kind: 'field', id: 'username', label: 'Utilisateur', value: d.username },
        { kind: 'field', id: 'password', label: 'Mot de passe', value: d.password, secret: true },
      );
    }
    if (d.kind === 'm3u') {
      list.push(
        { kind: 'field', id: 'playlistUrl', label: 'Adresse de la playlist', value: d.playlistUrl },
        {
          kind: 'field',
          id: 'epgUrl',
          label: 'Guide XMLTV (facultatif)',
          value: d.epgUrl,
          hint: 'Celui de la playlist par défaut',
        },
      );
    }
    if (d.kind !== 'demo') {
      list.push({
        kind: 'field',
        id: 'groups',
        label: 'Groupes conservés',
        value: d.groups,
        hint: 'Tous · ex. FR, BE',
      });
    }
    list.push(
      { kind: 'choice', id: 'theme', label: 'Thème', value: THEME_LABELS[settings().theme] },
      { kind: 'button', id: 'save', label: 'Tester et enregistrer' },
      { kind: 'button', id: 'reload', label: 'Recharger les chaînes' },
    );
    return list;
  });

  const inContent = () => props.app.nav().zone === 'content';

  const release = props.app.captureKeys((e) => {
    if (!inContent() || editing()) return false;
    const action = toAction(e);
    if (typeof action !== 'string' || action === 'back') return false;
    const row = rows()[focus()];
    switch (action) {
      case 'up':
        if (focus() === 0) props.app.focusMenu();
        else setFocus(focus() - 1);
        return true;
      case 'down':
        setFocus(Math.min(rows().length - 1, focus() + 1));
        return true;
      case 'left':
      case 'right':
        if (row?.kind === 'choice') change(row.id, action === 'left' ? -1 : 1);
        return true;
      case 'ok':
        // One save at a time: a held or repeated OK must not start several.
        if (busy() || e.repeat) return true;
        if (row?.kind === 'field') setEditing(row);
        if (row?.kind === 'choice') change(row.id, 1);
        if (row?.kind === 'button') void (row.id === 'save' ? save() : reload());
        return true;
    }
  });
  onCleanup(release);

  const change = (id: 'source' | 'theme', step: 1 | -1) => {
    if (id === 'theme') {
      props.app.updateSettings({ theme: nextTheme(settings().theme, step) });
      return;
    }
    const i = KINDS.findIndex((k) => k.id === draft().kind);
    setDraft((d) => ({ ...d, kind: KINDS[(i + step + KINDS.length) % KINDS.length]!.id }));
    setMessage(undefined);
  };

  const save = async () => {
    const d = draft();
    const trimmed = {
      server: d.server.trim(),
      username: d.username.trim(),
      playlistUrl: d.playlistUrl.trim(),
    };
    const groups = d.groups
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    let config: SourceConfig | undefined;
    if (d.kind === 'xtream') {
      if (!trimmed.server || !trimmed.username) return fail('Indique le serveur et l’utilisateur');
      config = { kind: 'xtream', server: trimmed.server, username: trimmed.username };
    } else if (d.kind === 'm3u') {
      if (!trimmed.playlistUrl) return fail('Indique l’adresse de la playlist');
      config = {
        kind: 'm3u',
        playlistUrl: trimmed.playlistUrl,
        epgUrl: d.epgUrl.trim() || undefined,
      };
    }
    setBusy(true);
    setMessage({ text: 'Connexion…', error: false });
    try {
      let account = '';
      if (config?.kind === 'xtream') {
        const info = await new XtreamSource({ ...config, password: d.password }).account();
        account = info.expires ? ` · jusqu’au ${info.expires.toLocaleDateString('fr-FR')}` : '';
      }
      // Try the new source first; nothing is saved unless its channels load.
      const candidate = { ...settings(), source: config, groups };
      const draftSecrets = {
        get: async () => (d.kind === 'xtream' ? d.password : undefined),
        set: async () => {},
      };
      if (!(await props.app.reload({ settings: candidate, secrets: draftSecrets }))) {
        return fail(props.app.loadError() ?? 'Chargement impossible');
      }
      await props.app.secrets.set(XTREAM_SECRET, d.kind === 'xtream' ? d.password : undefined);
      const sameSource = JSON.stringify(config) === JSON.stringify(settings().source);
      props.app.updateSettings({
        source: config,
        groups,
        ...(sameSource ? {} : { lastChannel: undefined }),
      });
      setMessage({
        text: `Enregistré · ${props.app.channels().length} chaînes${account}`,
        error: false,
      });
    } catch (error) {
      fail(error instanceof XtreamError || error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    setMessage({ text: 'Chargement…', error: false });
    const ok = await props.app.reload();
    setBusy(false);
    setMessage(
      ok
        ? { text: `${props.app.channels().length} chaînes chargées`, error: false }
        : { text: props.app.loadError() ?? 'Chargement impossible', error: true },
    );
  };

  const fail = (text: string) => setMessage({ text, error: true });

  return (
    <div class="settings">
      <h1 class="title settings-title">Paramètres</h1>
      <div class="settings-panel">
        <For each={rows()}>
          {(row, i) => (
            <div
              {...(props.app.pointer
                ? {
                    onMouseMove: () => {
                      props.app.point((s) => ({ ...s, zone: 'content' }));
                      if (!editing()) setFocus(i());
                    },
                    onClick: () => {
                      setFocus(i());
                      props.app.press('ok');
                    },
                  }
                : {})}
              class="settings-row"
              classList={{ focused: inContent() && focus() === i(), button: row.kind === 'button' }}
            >
              <span class="label settings-label">{row.label}</span>
              <Show when={row.kind === 'choice' && row}>
                {(r) => <span class="label settings-choice">‹ {r().value} ›</span>}
              </Show>
              <Show when={row.kind === 'field' && row}>
                {(r) => (
                  <span class="label settings-value" classList={{ empty: !r().value }}>
                    {r().value
                      ? r().secret
                        ? '•'.repeat(r().value.length)
                        : r().value
                      : (r().hint ?? 'Non renseigné')}
                  </span>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={message()}>
        {(m) => (
          <p class="body settings-message" classList={{ error: m().error }}>
            {busy() ? '' : m().error ? '⚠ ' : '✓ '}
            {m().text}
          </p>
        )}
      </Show>

      <Show when={editing()}>
        {(row) => (
          <TextEntry
            app={props.app}
            label={row().label}
            value={row().value}
            secret={row().secret}
            onDone={(value) => {
              setDraft((d) => ({ ...d, [row().id]: value }));
              setEditing(undefined);
            }}
            onCancel={() => setEditing(undefined)}
          />
        )}
      </Show>
    </div>
  );
}
