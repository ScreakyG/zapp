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
export function pointerTo(
  app: App,
  target: (state: NavState) => NavState,
  /** What a click selects, when it differs from hovering (TV filters). */
  clickTarget: (state: NavState) => NavState = target,
): PointerHandlers {
  if (!app.pointer) return {};
  return {
    onMouseMove: () => app.point(target),
    onClick: () => {
      app.point(clickTarget, { click: true });
      app.press('ok');
    },
  };
}

export function replaceAt<T>(list: T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}
