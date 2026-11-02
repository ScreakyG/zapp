import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { stageZoom } from './theme/scale';

// `zoom` (not `transform: scale`) keeps text crisp on the TV and is supported by Chromium 79.
export function Stage(props: { children: JSX.Element }) {
  const [zoom, setZoom] = createSignal(1);
  const fit = () => setZoom(stageZoom(window.innerWidth, window.innerHeight));

  onMount(() => {
    fit();
    window.addEventListener('resize', fit);
    onCleanup(() => window.removeEventListener('resize', fit));
  });

  return (
    <div class="stage" style={{ zoom: zoom() }}>
      {props.children}
    </div>
  );
}
