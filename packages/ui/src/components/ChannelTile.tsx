import { Show } from 'solid-js';
import { LiveBadge } from './LiveBadge';
import './ChannelTile.css';

export interface ChannelTileProps {
  number: string;
  name: string;
  image?: string;
  /** Title of the program airing now. */
  now?: string;
  /** Share of that program elapsed, 0–1. */
  progress: number;
  live: boolean;
  /** Driven by navigation only, never by hover alone. */
  focused: boolean;
}

/** A channel as a 16:9 tile (design/components/ChannelTile.md), on Home and in the Mosaic. */
export function ChannelTile(props: ChannelTileProps) {
  return (
    <div class="tile" classList={{ focused: props.focused }}>
      <div class="tile-lift">
        <div class="tile-media">
          <Show when={props.image}>
            <img class="tile-image" src={props.image} alt="" loading="lazy" decoding="async" />
          </Show>
          <div class="tile-dim" />
          <div class="tile-sheen" />
          <div class="tile-edge" />
          <Show when={props.live}>
            <LiveBadge class="tile-live" />
          </Show>
          <div class="tile-progress">
            <div class="tile-progress-fill" style={{ transform: `scaleX(${props.progress})` }} />
          </div>
        </div>
      </div>
      <div class="tile-caption">
        <div class="tile-name label">
          <span class="tile-number">{props.number}</span>
          {props.name}
        </div>
        <div class="tile-now caption">{props.now ?? ''}</div>
      </div>
    </div>
  );
}
