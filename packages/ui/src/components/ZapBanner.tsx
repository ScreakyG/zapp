import { Show } from 'solid-js';
import { formatTyped, type Channel, type Program } from '@zapp/core';
import { formatTime } from '../format';
import { LiveBadge } from './LiveBadge';
import './ZapBanner.css';

export interface ZapBannerProps {
  channel?: Channel;
  image?: string;
  program?: Program;
  next?: Program;
  progress: number;
  /** Digits being typed ("03"), '' when idle. */
  typed: string;
  /** The typed number matched no channel. */
  zapError: boolean;
  /** Playback problem to show instead of the program title. */
  playbackError?: string;
  /** Click on "‹ Retour" (PC). */
  onBack?: () => void;
}

/** The glass panel over the video after each zap (design/components/ZapBanner.md). */
export function ZapBanner(props: ZapBannerProps) {
  return (
    <div class="zap">
      <div class="zap-shade" />
      <div class="zap-top">
        <span
          class="zap-pill label"
          classList={{ clickable: !!props.onBack }}
          onClick={(e) => {
            e.stopPropagation();
            props.onBack?.();
          }}
        >
          ‹ Retour
        </span>
        <span class="zap-pill zap-help caption">
          ↑ ↓ changer de chaîne · OK infos · 0–9 numéro · Retour
        </span>
      </div>
      <div class="zap-panel">
        <Show when={props.image} fallback={<div class="zap-thumb" />}>
          {(src) => <img class="zap-thumb" src={src()} alt="" />}
        </Show>
        <div class="zap-number zap-num">
          {props.typed ? formatTyped(props.typed) : props.channel?.number}
        </div>
        <div class="zap-info">
          <div class="zap-name-line">
            <span class="banner-title zap-name">{props.channel?.name}</span>
            <Show when={props.program?.live}>
              <LiveBadge />
            </Show>
          </div>
          <Show
            when={!props.zapError}
            fallback={<div class="zap-line zap-alert">Aucune chaîne à ce numéro</div>}
          >
            <Show
              when={!props.playbackError}
              fallback={<div class="zap-line zap-alert">{props.playbackError}</div>}
            >
              <div class="zap-line">{props.program?.title ?? 'Programme inconnu'}</div>
            </Show>
          </Show>
          <Show when={props.program}>
            {(p) => (
              <div class="zap-progress caption">
                <span>{formatTime(p().start)}</span>
                <div class="zap-rail">
                  <div class="zap-fill" style={{ transform: `scaleX(${props.progress})` }} />
                </div>
                <span>{formatTime(p().end)}</span>
              </div>
            )}
          </Show>
          <div class="zap-next caption">
            <Show when={props.next} fallback="Fin des programmes">
              {(n) => (
                <>
                  Ensuite · {formatTime(n().start)}
                  {'  '}
                  {n().title}
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
