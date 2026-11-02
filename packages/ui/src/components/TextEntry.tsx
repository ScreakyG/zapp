import { For, createSignal, onCleanup } from 'solid-js';
import {
  initialKeyboard,
  keyboardAction,
  keyboardKey,
  keyboardLayout,
  toAction,
  type KeyboardResult,
} from '@zapp/core';
import type { App } from '../app/createApp';
import './TextEntry.css';

/** Width of one keyboard unit, in stage pixels (10 units per row). */
const UNIT = 96;

export interface TextEntryProps {
  app: App;
  label: string;
  value: string;
  /** Password: shown as dots. */
  secret?: boolean;
  onDone(value: string): void;
  onCancel(): void;
}

/**
 * On-screen keyboard over the current screen (#17). While open it takes every key: arrows and OK
 * on the remote, or typing straight on a physical keyboard (PC).
 */
export function TextEntry(props: TextEntryProps) {
  const [state, setState] = createSignal(initialKeyboard(props.value));
  const layout = () => keyboardLayout(state().mode);

  const finish = (result: KeyboardResult) => {
    if (result.outcome === 'done') props.onDone(result.state.value);
    else if (result.outcome === 'cancel') props.onCancel();
    else setState(result.state);
  };

  /**
   * The remote's OK also sends "Enter": it presses the focused on-screen key. Once something was
   * typed on a physical keyboard, Enter validates instead, as on a PC.
   */
  let physical = false;

  const release = props.app.captureKeys((e) => {
    // Arrows and OK drive the on-screen keys; anything printable is typed directly.
    const action = toAction(e);
    // Ctrl/Cmd shortcuts are not characters; AltGr (Ctrl+Alt on Windows) still types @ # { [ |.
    const printable = e.key.length === 1 && !e.metaKey && !(e.ctrlKey && !e.altKey);
    // Digits may come from the remote; any other printable key means a physical keyboard.
    if (printable && !(action && typeof action === 'object')) physical = true;
    if (
      printable ||
      e.key === 'Escape' ||
      e.key === 'Backspace' ||
      (physical && e.key === 'Enter')
    ) {
      const result = keyboardKey(state(), e.key);
      if (result) {
        finish(result);
        return true;
      }
    }
    if (!action) return false;
    // Back on the arrows: the remote is in use again, so OK presses keys.
    if (typeof action === 'string' && action !== 'ok' && action !== 'back') physical = false;
    if (e.repeat && action === 'ok') return true;
    finish(keyboardAction(state(), action));
    return true;
  });
  onCleanup(release);

  const shown = () => (props.secret ? '•'.repeat(state().value.length) : state().value);

  return (
    <div class="entry">
      <div class="entry-panel">
        <div class="entry-label label muted">{props.label}</div>
        <div class="entry-field body">
          <span class="entry-value">
            <span dir="ltr">{shown()}</span>
          </span>
          <span class="entry-caret" />
        </div>
        <div class="entry-keys">
          <For each={layout()}>
            {(row, r) => (
              <div class="entry-row">
                <For each={row}>
                  {(key, c) => (
                    <span
                      {...(props.app.pointer
                        ? {
                            onMouseMove: () => setState((s) => ({ ...s, row: r(), col: c() })),
                            onClick: () => {
                              setState((s) => ({ ...s, row: r(), col: c() }));
                              props.app.press('ok');
                            },
                          }
                        : {})}
                      class="entry-key label"
                      classList={{
                        focused: state().row === r() && state().col === c(),
                        special: key.kind !== 'text',
                      }}
                      style={{ width: `${key.width * UNIT - 8}px` }}
                    >
                      {key.label}
                    </span>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
        <div class="entry-help caption muted">
          ← → ↑ ↓ choisir · OK taper · Retour annuler · ou le clavier de l’ordinateur
        </div>
      </div>
    </div>
  );
}
