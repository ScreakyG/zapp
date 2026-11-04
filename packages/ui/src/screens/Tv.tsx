import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { toAction } from '@zapp/core';
import type { App } from '../app/createApp';
import { pointerTo } from '../app/pointer';
import { ChannelList } from '../components/ChannelList';
import { TextEntry } from '../components/TextEntry';
import './Tv.css';

/**
 * TV tab: themed chips (Mes chaînes, TNT, Sport…) applied as focus moves, then the channel
 * list and the preview of the focused channel.
 */
export function Tv(props: { app: App }) {
  const nav = () => props.app.nav();
  const [editing, setEditing] = createSignal(false);
  onCleanup(
    props.app.captureKeys((event) => {
      if (nav().zone === 'search' && toAction(event) === 'ok') {
        if (!event.repeat) setEditing(true);
        return true;
      }
      return false;
    }),
  );
  // Memo: a key press must not re-filter every channel.
  const filter = createMemo(() => nav().tv.filter);
  const list = createMemo(() => props.app.tvChannels(filter()));
  const counts = createMemo(() =>
    props.app.tvFilters().map((_, i) => props.app.tvChannels(i).length),
  );
  const chipsFocused = () => nav().zone === 'chips';
  const favourites = () => props.app.tvFilters()[filter()]?.kind === 'favourites';

  return (
    <div class="tv">
      <ChannelList
        app={props.app}
        channels={list()}
        idx={nav().tv.idx}
        focused={nav().zone === 'content'}
        focusAt={(s, i) => ({ ...s, zone: 'content', tv: { filter: s.tv.filter, idx: i } })}
        empty={
          favourites()
            ? {
                title: 'Aucune chaîne ici',
                text: 'Vos chaînes préférées apparaîtront ici.',
              }
            : {
                title: 'Aucune chaîne trouvée',
                text: 'Modifiez la recherche ou choisissez un autre groupe.',
              }
        }
      />
      <button
        type="button"
        class="tv-search chip label"
        classList={{ focused: nav().zone === 'search' }}
        {...pointerTo(props.app, (s) => ({ ...s, zone: 'search' }))}
      >
        {props.app.searchQuery()
          ? `Recherche : ${props.app.searchQuery()}`
          : 'Rechercher une chaîne par nom ou numéro'}
      </button>
      <div class="tv-chips">
        <For each={props.app.tvFilters()}>
          {(chip, i) => (
            <span
              {...pointerTo(
                props.app,
                // Hovering only reaches the chips: crossing them on the way to the TabBar must
                // not change the filter. A click picks it.
                (s) => ({ ...s, zone: 'chips' }),
                (s) => ({
                  ...s,
                  zone: 'chips',
                  tv: { filter: i(), idx: s.tv.filter === i() ? s.tv.idx : 0 },
                }),
              )}
              class="chip label"
              classList={{
                selected: filter() === i(),
                focused: chipsFocused() && filter() === i(),
              }}
            >
              <Show when={chip.kind === 'favourites'}>
                <svg class="chip-star" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
                </svg>
              </Show>
              {chip.label}
              <span class="chip-count caption">{counts()[i()]}</span>
            </span>
          )}
        </For>
      </div>
      <Show when={editing()}>
        <TextEntry
          app={props.app}
          label="Rechercher une chaîne · Effacer le texte pour tout afficher"
          value={props.app.searchQuery()}
          onDone={(value) => {
            props.app.search(value);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </Show>
    </div>
  );
}
