import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { STAGE_HEIGHT, STAGE_WIDTH, stageZoom } from './theme/scale';

// `zoom` (not `transform: scale`) keeps text crisp on the TV.
// Chromium 79 (webOS) and recent Chromium (Electron) report zoomed geometry differently, so
// layout maths must stay in stage units (1280×720) and never read client rects or offsets.
export function Stage(props: { children: JSX.Element }) {
  const [zoom, setZoom] = createSignal(1);
  const fit = () => setZoom(stageZoom(window.innerWidth, window.innerHeight));

  onMount(() => {
    fit();
    window.addEventListener('resize', fit);
    onCleanup(() => window.removeEventListener('resize', fit));
  });

  return (
    <div
      class="stage"
      style={{ width: `${STAGE_WIDTH}px`, height: `${STAGE_HEIGHT}px`, zoom: zoom() }}
    >
      {props.children}
    </div>
  );
}
