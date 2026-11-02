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

  // Retune whenever the channel changes; leaving the screen stops playback (onCleanup).
  createEffect(on(channel, (c) => void playback.play(c?.streamUrl ?? '')));

  const status = () => playback.status();
  const playing = () => status().state === 'playing';
  /** Demo channels have no stream: their picture stands in for the video. */
  const noStream = () => !channel()?.streamUrl;
  const playbackError = () => {
    const s = status();
    return s.state === 'error' && !noStream() ? s.message : undefined;
  };

  return (
    <div class="player">
      <Show when={!playing() && imageUrl(channel()?.image)}>
        {(src) => <img class="player-poster" src={src()} alt="" />}
      </Show>
      {video}
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
