import { Show } from 'solid-js';
import type { App } from '../app/createApp';
import { pointerTo } from '../app/pointer';
import { ChannelList } from '../components/ChannelList';
import { formatTime } from '../format';
import './Bouquet.css';

/** A bouquet opened from the launcher: ‹ Accueil header (no TabBar), then list + preview. */
export function Bouquet(props: { app: App }) {
  const nav = () => props.app.nav();
  const current = () => props.app.apps()[nav().app.app];
  const count = () => current()?.channels.length ?? 0;

  return (
    <div class="bouquet">
      <ChannelList
        app={props.app}
        channels={current()?.channels ?? []}
        idx={nav().app.idx}
        focused={nav().zone === 'content'}
        focusAt={(s, i) => ({ ...s, zone: 'content', app: { ...s.app, idx: i } })}
        top={120}
        empty={{ title: 'Aucune chaîne ici', text: 'Ce bouquet est vide pour cette source.' }}
      />
      <header class="bouquet-header">
        <span
          {...pointerTo(props.app, (s) => ({ ...s, zone: 'back' }))}
          class="bouquet-back label"
          classList={{ focused: nav().zone === 'back' }}
        >
          ‹ Accueil
        </span>
        <span class="bouquet-name banner-title">{current()?.label}</span>
        <Show when={count() > 0}>
          <span class="label muted">
            {count()} chaîne{count() > 1 ? 's' : ''}
          </span>
        </Show>
        <span class="bouquet-clock label muted">{formatTime(props.app.now())}</span>
      </header>
    </div>
  );
}
