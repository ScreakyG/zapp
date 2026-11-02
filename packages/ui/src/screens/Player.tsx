import { Show, createEffect, createMemo, on } from 'solid-js';
import type { App } from '../app/createApp';
import { ZapBanner } from '../components/ZapBanner';
import { imageUrl } from '../images';
import { createPlayback } from '../player/playback';
import './Player.css';

/** Full-screen playback with the zap banner (HANDOFF §4 "Lecteur"). */
export function Player(props: { app: App }) {
  const video = (<video class="player-video" autoplay playsinline />) as HTMLVideoElement;
  const playback = createPlayback(video);

  const index = () => props.app.nav().player.channel;
  const channel = createMemo(() => props.app.channels()[index()]);
  const air = createMemo(() => props.app.onAir(index()));
  /** By value: reloading the channel list must not restart the same stream. */
  const url = createMemo(() => channel()?.streamUrl ?? '');
  /**
   * Player opened by the first digit of a number zap: wait for the number instead of starting
   * the old channel's stream for two seconds.
   */
  const holding = () => props.app.zap().typed !== '' && playback.status().state === 'idle';

  // Retune whenever the stream changes; leaving the screen stops playback (onCleanup).
  let tuned: string | undefined;
  createEffect(
    on([url, holding], ([u, hold]) => {
      if (hold || u === tuned) return;
      tuned = u;
      void playback.play(u);
    }),
  );

  /** Demo channels have no stream: their picture stands in for the video. */
  const noStream = () => !url();
  const playbackError = () => {
    const s = playback.status();
    return s.state === 'error' && !noStream() ? s.message : undefined;
  };

  return (
    <div class="player">
      {video}
      {/* Only for stream-less demo channels: real channels' images are often small logos. */}
      <Show when={noStream() && imageUrl(channel()?.image)}>
        {(src) => <img class="player-poster" src={src()} alt="" />}
      </Show>
      <Show when={props.app.banner()}>
        <ZapBanner
          channel={channel()}
          image={imageUrl(channel()?.image)}
          program={air().program}
          next={air().next}
          progress={air().progress}
          typed={props.app.zap().typed}
          zapError={props.app.zap().error}
          playbackError={playbackError()}
        />
      </Show>
    </div>
  );
}
