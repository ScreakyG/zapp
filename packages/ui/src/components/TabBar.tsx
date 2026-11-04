import { For, Show } from 'solid-js';
import type { Screen } from '@zapp/core';
import type { PointerHandlers } from '../app/pointer';
import { formatTime } from '../format';
import { GearIcon } from './icons';
import './TabBar.css';

const TABS: { screen: Screen; label: string; live?: boolean }[] = [
  { screen: 'home', label: 'Accueil' },
  { screen: 'tv', label: 'TV', live: true },
  { screen: 'guide', label: 'Guide TV' },
];
/** Menu index of the settings gear, after the tabs (see MENU in core). */
const GEAR = TABS.length;

export function TabBar(props: {
  screen: Screen;
  focused: number | null;
  now: number;
  /** Mouse handlers for menu entry i (PC). */
  pointer?: (i: number) => PointerHandlers;
}) {
  return (
    <header class="tabbar">
      <span class="tabbar-logo">Zapp</span>
      <nav class="tabbar-tabs">
        <For each={TABS}>
          {(tab, i) => (
            <span
              {...props.pointer?.(i())}
              class="tabbar-tab"
              classList={{
                current: props.screen === tab.screen,
                focused: props.focused === i(),
              }}
            >
              <Show when={tab.live}>
                <span class="tabbar-live" aria-hidden="true" />
              </Show>
              {tab.label}
            </span>
          )}
        </For>
      </nav>
      <span class="tabbar-clock">{formatTime(props.now)}</span>
      <span
        {...props.pointer?.(GEAR)}
        class="tabbar-gear"
        classList={{
          current: props.screen === 'settings',
          focused: props.focused === GEAR,
        }}
        aria-label="Paramètres"
      >
        <GearIcon />
      </span>
    </header>
  );
}
