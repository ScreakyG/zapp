import { For, Show, createMemo } from 'solid-js';
import { minutesLeft } from '@zapp/core';
import type { App } from '../app/createApp';
import { Backdrop } from '../components/Backdrop';
import { ChannelTileOf } from '../components/ChannelTileOf';
import { LiveBadge } from '../components/LiveBadge';
import { formatTime } from '../format';
import { imageUrl } from '../images';
import './Home.css';

/** Row pitch and tile pitch (272 + space-lg), in stage pixels. */
const ROW_HEIGHT = 268;
const TILE_PITCH = 304;
/** The focused tile stays in place up to this column, then the row scrolls under it. */
const SCROLL_FROM_COL = 2;
/** Tiles kept in the DOM around the focus: a row of thousands of channels stays light (#33). */
const BEFORE = SCROLL_FROM_COL + 1;
const AFTER = 6;

/** Columns rendered for a row: the ones on screen, plus one on each side for the scroll. */
export function visibleColumns(length: number, col: number): number[] {
  const first = Math.max(0, col - BEFORE);
  const last = Math.min(length, col + AFTER);
  return Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
}

/** Home (HANDOFF §4): the focused channel fills the screen, rows of tiles at the bottom. */
export function Home(props: { app: App }) {
  const nav = () => props.app.nav();
  const rows = () => props.app.homeRows();
  const focusedChannel = createMemo(() => {
    const { row, cols } = nav().home;
    return rows()[row]?.channels[cols[row] ?? 0];
  });
  const channel = () => {
    const i = focusedChannel();
    return i === undefined ? undefined : props.app.channels()[i];
  };
  const air = createMemo(() => {
    const i = focusedChannel();
    return i === undefined ? undefined : props.app.onAir(i);
  });

  return (
    <div class="home">
      <Backdrop src={imageUrl(channel()?.image)} />
      <div class="home-shade" />

      <Show when={channel()}>
        {(c) => (
          <section class="home-hero">
            <div class="home-hero-channel label">
              <span class="muted">{c().number}</span>
              <span>{c().name}</span>
              <Show when={air()?.program?.live}>
                <LiveBadge />
              </Show>
            </div>
            <Show when={air()?.program}>
              {(p) => (
                <>
                  <h1 class="home-hero-title display">{p().title}</h1>
                  <div class="home-hero-meta label muted">
                    {formatTime(p().start)} – {formatTime(p().end)}
                    <Show when={p().genre}> · {p().genre}</Show> ·{' '}
                    <span class="accent">
                      reste {minutesLeft(p(), new Date(props.app.now()))} min
                    </span>
                  </div>
                  <p class="home-hero-description body">{p().description}</p>
                </>
              )}
            </Show>
          </section>
        )}
      </Show>

      <div class="home-rows">
        <div
          class="home-rows-track"
          style={{ transform: `translateY(${-nav().home.row * ROW_HEIGHT}px)` }}
        >
          <For each={rows()}>
            {(row, r) => {
              const col = () => nav().home.cols[r()] ?? 0;
              const active = () => nav().zone === 'content' && nav().home.row === r();
              return (
                <section class="home-row">
                  <h2 class="home-row-title heading" classList={{ active: active() }}>
                    {row.title}
                  </h2>
                  <div
                    class="home-row-track"
                    style={{
                      transform: `translateX(${-Math.max(0, col() - SCROLL_FROM_COL) * TILE_PITCH}px)`,
                    }}
                  >
                    <For each={visibleColumns(row.channels.length, col())}>
                      {(c) => (
                        <div class="home-tile" style={{ left: `${c * TILE_PITCH}px` }}>
                          <ChannelTileOf
                            app={props.app}
                            channel={row.channels[c]!}
                            focused={active() && col() === c}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
