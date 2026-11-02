import { For, Match, Show, Switch } from 'solid-js';
import { formatTyped } from '@zapp/core';
import { Stage } from './Stage';
import { createApp } from './app/createApp';
import { ChannelTileOf } from './components/ChannelTileOf';
import { TabBar } from './components/TabBar';
import { DEFAULT_THEME, applyTheme } from './theme/themes';
import './App.css';

export function App() {
  applyTheme(DEFAULT_THEME);
  const app = createApp();
  const nav = app.nav;
  const playing = () => app.channels()[nav().player.channel];

  return (
    <Stage>
      <Switch>
        <Match when={nav().screen === 'home'}>
          <Placeholder title="Accueil" issue="#7" />
          {/* Temporary: first home row, to see ChannelTile until the Home screen lands. */}
          <div class="tile-row-preview">
            <For each={app.homeRows()[0]?.channels ?? []}>
              {(channel, col) => (
                <ChannelTileOf
                  app={app}
                  channel={channel}
                  focused={
                    nav().zone === 'content' && nav().home.row === 0 && nav().home.cols[0] === col()
                  }
                />
              )}
            </For>
          </div>
        </Match>
        <Match when={nav().screen === 'guide'}>
          <Placeholder title="Guide TV" issue="#8" />
        </Match>
        <Match when={nav().screen === 'mosaic'}>
          <Placeholder title="Mosaïque" issue="#9" />
        </Match>
        <Match when={nav().screen === 'settings'}>
          <Placeholder title="Paramètres" issue="#18" />
        </Match>
        <Match when={nav().screen === 'player'}>
          {/* Temporary player and banner until #10. */}
          <div class="player-placeholder">
            <Show when={app.banner()}>
              <div class="banner-placeholder">
                <span class="zap-number accent">
                  {app.zap().typed ? formatTyped(app.zap().typed) : playing()?.number}
                </span>
                <Show
                  when={!app.zap().error}
                  fallback={<span class="body live-text">Aucune chaîne à ce numéro</span>}
                >
                  <span class="banner-title">{playing()?.name}</span>
                </Show>
              </div>
            </Show>
          </div>
        </Match>
      </Switch>
      <Show when={nav().screen !== 'player'}>
        <TabBar
          screen={nav().screen}
          focused={nav().zone === 'menu' ? nav().menuIdx : null}
          now={app.now()}
        />
      </Show>
    </Stage>
  );
}

function Placeholder(props: { title: string; issue: string }) {
  return (
    <div class="placeholder">
      <h1 class="display">{props.title}</h1>
      <p class="body muted">Écran à venir ({props.issue}). ↑ pour la barre d'onglets.</p>
    </div>
  );
}
