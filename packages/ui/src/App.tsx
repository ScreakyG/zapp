import { Match, Show, Switch, createSignal } from 'solid-js';
import { Stage } from './Stage';
import { createApp } from './app/createApp';
import { TabBar } from './components/TabBar';
import { TextEntry } from './components/TextEntry';
import { Guide } from './screens/Guide';
import { Home } from './screens/Home';
import { Mosaic } from './screens/Mosaic';
import { Player } from './screens/Player';
import './App.css';

export function App() {
  const app = createApp();
  const nav = app.nav;
  const [keyboardOpen, setKeyboardOpen] = createSignal(true);
  const [typedValue, setTypedValue] = createSignal('');

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
          {/* Temporary: try the on-screen keyboard until the settings screen lands (#18). */}
          <Show when={keyboardOpen()}>
            <TextEntry
              app={app}
              label="Adresse du serveur"
              value={typedValue()}
              onDone={(v) => {
                setTypedValue(v);
                setKeyboardOpen(false);
              }}
              onCancel={() => setKeyboardOpen(false)}
            />
          </Show>
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
