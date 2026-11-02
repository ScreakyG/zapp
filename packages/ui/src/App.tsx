import { createSignal, onCleanup, onMount } from 'solid-js';
import { toAction } from '@zapp/core';
import { Stage } from './Stage';
import { DEFAULT_THEME, applyTheme, nextTheme, type Theme } from './theme/themes';
import './App.css';

// Temporary token showcase until the real screens land (#5 onwards).
export function App() {
  const [theme, setTheme] = createSignal<Theme>(DEFAULT_THEME);

  onMount(() => {
    applyTheme(theme());
    const onKey = (e: KeyboardEvent) => {
      const action = toAction(e);
      if (action === 'left' || action === 'right') {
        const t = nextTheme(theme(), action === 'right' ? 1 : -1);
        setTheme(t);
        applyTheme(t);
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <Stage>
      <div class="showcase">
        <p class="caption muted">Thème · ← → pour changer</p>
        <h1 class="display">{theme()}</h1>
        <p class="body muted">
          Une astronome isolée dans un observatoire du désert capte un signal.
        </p>
        <div class="row">
          <span class="pill glass label">Accueil</span>
          <span class="pill focused label">Guide TV</span>
          <span class="pill glass label">Mosaïque</span>
          <span class="live badge">DIRECT</span>
        </div>
        <p class="heading">Sport</p>
        <p class="caption accent">20:45 – 22:10 · reste 38 min</p>
        <p class="zap-number accent">004</p>
      </div>
    </Stage>
  );
}
