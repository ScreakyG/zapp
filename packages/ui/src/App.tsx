import { Match, Show, Switch } from 'solid-js';
import { Stage } from './Stage';
import { createApp } from './app/createApp';
import { TabBar } from './components/TabBar';
import { Guide } from './screens/Guide';
import { Home } from './screens/Home';
import { Mosaic } from './screens/Mosaic';
import { Player } from './screens/Player';
import { DEFAULT_THEME, applyTheme } from './theme/themes';
import './App.css';

export function App() {
  applyTheme(DEFAULT_THEME);
  const app = createApp();
  const nav = app.nav;

  return (
    <Stage>
      <Switch>
        <Match when={nav().screen === 'home'}>
          <Home app={app} />
        </Match>
        <Match when={nav().screen === 'guide'}>
          <Guide app={app} />
        </Match>
        <Match when={nav().screen === 'mosaic'}>
          <Mosaic app={app} />
        </Match>
        <Match when={nav().screen === 'settings'}>
          <Placeholder title="Paramètres" issue="#18" />
        </Match>
        <Match when={nav().screen === 'player'}>
          <Player app={app} />
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
