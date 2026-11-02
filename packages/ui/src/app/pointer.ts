import type { NavState } from '@zapp/core';
import type { App } from './createApp';

export interface PointerHandlers {
  onMouseMove?: () => void;
  onClick?: () => void;
}

/**
 * Mouse handlers for a focusable element (#21): moving over it gives it the focus, a click
 * focuses it and presses OK. `target` derives the navigation state where it has the focus.
 * Empty on the TV, where only the remote drives the UI.
 */
export function pointerTo(app: App, target: (state: NavState) => NavState): PointerHandlers {
  if (!app.pointer) return {};
  return {
    // mousemove rather than mouseenter: a row sliding under a still cursor does not steal focus.
    onMouseMove: () => app.point(target),
    onClick: () => {
      app.point(target);
      app.press('ok');
    },
  };
}

export function replaceAt<T>(list: T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}
