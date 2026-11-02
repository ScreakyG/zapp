import { Match, Show, Switch } from 'solid-js';
import { Stage } from './Stage';
import { createApp } from './app/createApp';
import { pointerTo } from './app/pointer';
import { TabBar } from './components/TabBar';
import { Guide } from './screens/Guide';
import { Home } from './screens/Home';
import { Mosaic } from './screens/Mosaic';
import { Player } from './screens/Player';
import { Settings } from './screens/Settings';
import './App.css';

export function App() {
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
          <Settings app={app} />
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
          pointer={(i) => pointerTo(app, (s) => ({ ...s, zone: 'menu', menuIdx: i }))}
        />
      </Show>
    </Stage>
  );
}
