import { createEffect, createSignal, onCleanup } from 'solid-js';
import './Backdrop.css';

/** Wait this long after the last focus move before changing the picture (held arrow keys). */
const SETTLE_DELAY = 150;

/**
 * Full-screen picture that cross-fades between two persistent <img> layers: the new picture
 * loads in the hidden layer and fades in only once decoded, so there is never a flash of bg
 * and holding ← → does not start a fade per tile.
 */
export function Backdrop(props: { src?: string; class?: string }) {
  const [layers, setLayers] = createSignal<[string?, string?]>([undefined, undefined]);
  const [front, setFront] = createSignal(0);

  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const src = props.src;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (src === layers()[front()]) return;
      const back = 1 - front();
      setLayers((l) => (back === 0 ? [src, l[1]] : [l[0], src]));
      // Nothing to load: show the empty layer straight away.
      if (!src) setFront(back);
    }, SETTLE_DELAY);
  });
  onCleanup(() => clearTimeout(timer));

  const layer = (i: 0 | 1) => (
    <img
      class={`backdrop-layer ${props.class ?? ''}`}
      classList={{ visible: front() === i && !!layers()[i] }}
      src={layers()[i] ?? ''}
      alt=""
      decoding="async"
      onLoad={() => {
        if (front() !== i) setFront(i);
      }}
    />
  );

  return (
    <>
      {layer(0)}
      {layer(1)}
    </>
  );
}
