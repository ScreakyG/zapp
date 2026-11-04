import { For, Show } from 'solid-js';
import type { App } from '../app/createApp';
import { pointerTo, replaceAt } from '../app/pointer';
import { APP_BRANDS } from '../appBrands';
import { imageUrl } from '../images';
import './Launcher.css';

/** Card pitch (336 px card + 32 px gap); the row scrolls once the focus passes the third. */
const CARD_PITCH = 368;
const SCROLL_FROM = 2;

/** Home with the France preset: one card per paid bouquet, opened like an app. */
export function Launcher(props: { app: App }) {
  const nav = () => props.app.nav();
  const col = () => nav().home.cols[0] ?? 0;
  const focused = (i: number) => nav().zone === 'content' && col() === i;
  const plural = (n: number) => `${n} chaîne${n > 1 ? 's' : ''}`;

  return (
    <div class="launcher">
      <h2 class="launcher-title heading" classList={{ active: nav().zone === 'content' }}>
        Applications
      </h2>
      <div
        class="launcher-row"
        style={{ transform: `translateX(${-Math.max(0, col() - SCROLL_FROM) * CARD_PITCH}px)` }}
      >
        <For each={props.app.apps()}>
          {(a, i) => (
            <div
              {...pointerTo(props.app, (s) => ({
                ...s,
                zone: 'content',
                home: { row: 0, cols: replaceAt(s.home.cols, 0, i()) },
              }))}
              class="launcher-card"
              classList={{ focused: focused(i()) }}
              style={{ left: `${i() * CARD_PITCH}px` }}
              aria-label={`Ouvrir ${a.label}`}
            >
              <div class="launcher-card-lift">
                <div
                  class="launcher-card-media"
                  style={{ background: APP_BRANDS[a.id]?.background ?? 'var(--surface-raised)' }}
                >
                  <Show
                    when={APP_BRANDS[a.id]}
                    fallback={
                      // Unknown bouquet: the source's logo, else its name.
                      <Show
                        when={imageUrl(a.logo)}
                        fallback={<span class="launcher-card-name title">{a.label}</span>}
                      >
                        {(src) => <img class="launcher-card-logo" src={src()} alt={a.label} />}
                      </Show>
                    }
                  >
                    {(brand) => (
                      <img
                        class="launcher-card-brand"
                        src={brand().logo}
                        alt={a.label}
                        style={{ width: `${Math.round(brand().width * 336)}px` }}
                      />
                    )}
                  </Show>
                  <div class="launcher-card-sheen" />
                  <div class="launcher-card-edge" />
                </div>
              </div>
              <div class="launcher-card-caption">
                <div class="launcher-card-label label">{a.label}</div>
                <div class="caption muted">{plural(a.channels.length)}</div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
