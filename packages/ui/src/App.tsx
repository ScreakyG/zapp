import { createSignal, onCleanup, onMount } from 'solid-js';
import { toAction, type Action } from '@zapp/core';

const label = (a: Action) => (typeof a === 'string' ? a : `chiffre ${a.digit}`);

export function App() {
  const [last, setLast] = createSignal('aucune');

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = toAction(e);
      if (action) setLast(label(action));
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <main style={{ 'font-family': 'sans-serif', padding: '64px' }}>
      <h1>Zapp</h1>
      <p>Dernière touche : {last()}</p>
    </main>
  );
}
