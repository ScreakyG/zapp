import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { NavState } from '@zapp/core';
import { TV_LIST_LEAD, TV_LIST_ROWS, type App } from '../app/createApp';
import { pointerTo } from '../app/pointer';
import { formatTime } from '../format';
import { imageUrl } from '../images';
import { createPlayback } from '../player/playback';
import { LiveBadge } from './LiveBadge';
import './ChannelList.css';

/**
 * The preview starts the focused channel's stream once the focus has rested this long, so
 * holding ↑ ↓ does not open a stream per channel (panels ban bursts of connections).
 */
const PREVIEW_DELAY = 700;

/** Item pitch in stage pixels (56 px item + 4 px gap). */
const ITEM_PITCH = 60;

/**
 * Channel list on the left, preview of the focused channel on the right and its next program
 * underneath (TV tab, and the bouquet screens of the home launcher).
 */
export function ChannelList(props: {
  app: App;
  /** Channels listed, as indices into the channel list. */
  channels: number[];
  /** Focused position in `channels`. */
  idx: number;
  /** Whether the list has the focus (else the position is only selected). */
  focused: boolean;
  /** Navigation state where position i has the focus (mouse). */
  focusAt: (state: NavState, i: number) => NavState;
  empty: { title: string; text: string };
}) {
  const offset = createMemo(() =>
    Math.max(0, Math.min(props.idx - TV_LIST_LEAD, props.channels.length - TV_LIST_ROWS)),
  );
  /** Positions rendered: the rows in view and one more on each side, for the slide. */
  const visible = createMemo(() => {
    const from = Math.max(0, offset() - 1);
    return props.channels.slice(from, offset() + TV_LIST_ROWS + 1).map((channel, k) => ({
      channel,
      position: from + k,
    }));
  });
  createEffect(() => props.app.wantPrograms(visible().map((v) => v.channel)));

  const current = createMemo(() => props.channels[props.idx]);
  const channel = () => {
    const i = current();
    return i === undefined ? undefined : props.app.channels()[i];
  };
  const air = createMemo(() => {
    const i = current();
    return i === undefined ? undefined : props.app.onAir(i);
  });
  // Live preview, with sound: one stream at a time, stopped when the screen goes (player, tab).
  const video = (<video class="clist-preview-video" autoplay playsinline />) as HTMLVideoElement;
  const playback = createPlayback(video);
  const url = createMemo(() => channel()?.streamUrl ?? '');
  const [shown, setShown] = createSignal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const u = url();
    clearTimeout(timer);
    if (u === shown()) return;
    playback.stop();
    setShown('');
    if (u)
      timer = setTimeout(() => {
        setShown(u);
        void playback.play(u);
      }, PREVIEW_DELAY);
  });
  onCleanup(() => clearTimeout(timer));
  const live = () => shown() !== '' && playback.status().state === 'playing';

  const favourite = (i: number) =>
    props.app.settings().favourites.includes(props.app.channels()[i]?.id ?? '');

  return (
    <>
      <img class="clist-glow" src={imageUrl(channel()?.image)} alt="" />
      <div class="clist-shade" />

      <div class="clist-list">
        <div class="clist-track" style={{ transform: `translateY(${-offset() * ITEM_PITCH}px)` }}>
          <For each={visible()}>
            {(item) => {
              const c = () => props.app.channels()[item.channel];
              const isFocused = () => props.focused && item.position === props.idx;
              return (
                <div
                  {...pointerTo(props.app, (s) => props.focusAt(s, item.position))}
                  class="clist-item"
                  classList={{
                    focused: isFocused(),
                    selected: !props.focused && item.position === props.idx,
                  }}
                  style={{ top: `${item.position * ITEM_PITCH}px` }}
                >
                  <span class="clist-number caption">{c()?.number}</span>
                  <span class="clist-logo">
                    <Show when={c()?.logo} fallback={<span class="badge">{c()?.name}</span>}>
                      {(logo) => <img src={imageUrl(logo())} alt="" loading="lazy" />}
                    </Show>
                  </span>
                  <span class="clist-text">
                    <span class="clist-name label">{c()?.name}</span>
                    <span class="clist-now caption">
                      {props.app.onAir(item.channel).program?.title ?? ''}
                    </span>
                  </span>
                  <Show when={favourite(item.channel)}>
                    <svg class="clist-star" viewBox="0 0 24 24" aria-label="Dans Mes chaînes">
                      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
                    </svg>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={props.channels.length === 0}>
          <div class="clist-empty" role="status">
            <div class="heading">{props.empty.title}</div>
            <div class="body muted">{props.empty.text}</div>
          </div>
        </Show>
      </div>

      <div class="clist-preview">
        <div class="clist-preview-live" classList={{ hidden: !live() }}>
          {video}
        </div>
        <Show when={channel()}>
          {(c) => (
            <>
              <Show when={imageUrl(c().image)}>
                {(src) => (
                  <img
                    class="clist-preview-image"
                    classList={{ logo: !!c().streamUrl, hidden: live() }}
                    src={src()}
                    alt=""
                  />
                )}
              </Show>
              <div class="clist-preview-shade" />
              <div class="clist-preview-info">
                <div class="clist-preview-name">
                  <Show when={air()?.program?.live}>
                    <LiveBadge />
                  </Show>
                  <span class="banner-title">{c().name}</span>
                </div>
                <div class="clist-preview-title body">{air()?.program?.title ?? ''}</div>
                <Show when={air()?.program}>
                  {(p) => (
                    <div class="clist-preview-time caption">
                      <span>{formatTime(p().start)}</span>
                      <div class="clist-progress">
                        <div style={{ transform: `scaleX(${air()?.progress ?? 0})` }} />
                      </div>
                      <span>{formatTime(p().end)}</span>
                    </div>
                  )}
                </Show>
              </div>
            </>
          )}
        </Show>
        <Show when={!channel()}>
          <div class="clist-preview-empty body muted">{props.empty.title}</div>
        </Show>
        <div class="clist-preview-edge" />
      </div>

      <div class="clist-next">
        <div class="clist-next-text">
          <div class="caption muted">
            {air()?.next ? `Ensuite · ${formatTime(air()!.next!.start)}` : 'Ensuite'}
          </div>
          <div class="clist-next-title">
            {air()?.next?.title ?? (channel() ? 'Programme non disponible' : '')}
          </div>
        </div>
        <div class="caption muted">OK plein écran</div>
      </div>
    </>
  );
}
