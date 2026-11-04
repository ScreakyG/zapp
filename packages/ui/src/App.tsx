import { Match, Show, Switch } from 'solid-js';
import { Stage } from './Stage';
import { createApp } from './app/createApp';
import { pointerTo } from './app/pointer';
import { TabBar } from './components/TabBar';
import { Bouquet } from './screens/Bouquet';
import { Guide } from './screens/Guide';
import { Home } from './screens/Home';
import { Launcher } from './screens/Launcher';
import { Tv } from './screens/Tv';
import { Player } from './screens/Player';
import { Settings } from './screens/Settings';
import './App.css';

export function App() {
  const app = createApp();
  const nav = app.nav;

  return (
    <Stage>
      <Switch>
        {/* France preset: home is the app launcher; other sources keep the channel rows. */}
        <Match when={nav().screen === 'home' && app.apps().length > 0}>
          <Launcher app={app} />
        </Match>
        <Match when={nav().screen === 'home'}>
          <Home app={app} />
        </Match>
        <Match when={nav().screen === 'app'}>
          <Bouquet app={app} />
        </Match>
        <Match when={nav().screen === 'guide'}>
          <Guide app={app} />
        </Match>
        <Match when={nav().screen === 'tv'}>
          <Tv app={app} />
        </Match>
        <Match when={nav().screen === 'settings'}>
          <Settings app={app} />
        </Match>
        <Match when={nav().screen === 'player'}>
          <Player app={app} />
        </Match>
      </Switch>
      <Show when={nav().screen !== 'player' && nav().screen !== 'app'}>
        <TabBar
          screen={nav().screen}
          focused={nav().zone === 'menu' ? nav().menuIdx : null}
          now={app.now()}
          pointer={(i) => pointerTo(app, (s) => ({ ...s, zone: 'menu', menuIdx: i }))}
        />
      </Show>
    </Stage>
  );
}
