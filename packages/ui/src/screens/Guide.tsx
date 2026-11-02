import { For, Index, Show, createMemo, createSelector } from 'solid-js';
import { minutesLeft, minutesUntil, status, type Program } from '@zapp/core';
import { GUIDE_SPAN, type App } from '../app/createApp';
import { Backdrop } from '../components/Backdrop';
import { formatTime } from '../format';
import { imageUrl } from '../images';
import './Guide.css';

/** Grid geometry in stage pixels (HANDOFF §4: 7.6 px/min at 1280 px). */
const PX_PER_MIN = 7.6;
const CHANNEL_CELL = 240;
const ROW_PITCH = 72;
const VISIBLE_ROWS = 6;
/** The focused row sits in 4th position while the grid scrolls. */
const FOCUS_SLOT = 3;
const CELL_GAP = 8;
/** Left edge of the grid (space-safe). */
const GRID_LEFT = 64;
const MINUTE = 60_000;
const MARKS = [0, 30, 60, 90];

/** TV guide (HANDOFF §4, design/components/GuideRow.md). */
export function Guide(props: { app: App }) {
  const nav = () => props.app.nav();
  const start = () => props.app.guideStart();
  const at = () => new Date(props.app.now());
  const x = (t: Date) => {
    const minutes = (t.getTime() - start()) / MINUTE;
    const clipped = Math.max(0, Math.min(GUIDE_SPAN / MINUTE, minutes));
    return CHANNEL_CELL + Math.round(clipped * PX_PER_MIN);
  };

  const channel = () => props.app.channels()[nav().guide.row];
  const focusedProgram = createMemo(
    (): Program | undefined => props.app.guideRows()[nav().guide.row]?.[nav().guide.prog],
  );
  const offset = () =>
    Math.max(0, Math.min(nav().guide.row - FOCUS_SLOT, props.app.channels().length - VISIBLE_ROWS));
  /** Only the rows in view (plus one on each side for the scroll) are in the DOM. */
  const visibleRows = createMemo(() => {
    const first = Math.max(0, offset() - 1);
    const last = Math.min(props.app.channels().length, offset() + VISIBLE_ROWS + 1);
    return Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
  });

  // Only the cells whose focus changes update on a key press.
  const inGrid = () => nav().zone === 'content';
  const isFocusedRow = createSelector(() => (inGrid() ? nav().guide.row : -1));
  const isFocusedCell = createSelector(() =>
    inGrid() ? `${nav().guide.row}:${nav().guide.prog}` : '',
  );

  const statusText = (p: Program) => {
    switch (status(p, at())) {
      case 'current':
        return `${p.live ? 'En direct' : 'En cours'} · reste ${minutesLeft(p, at())} min`;
      case 'upcoming':
        return `Dans ${minutesUntil(p, at())} min`;
      case 'past':
        return 'Terminé';
    }
  };

  return (
    <div class="guide">
      <div class="guide-backdrop">
        <Backdrop src={imageUrl(channel()?.image)} />
      </div>
      <div class="guide-veil" />

      <section class="guide-detail">
        <Show when={channel()}>
          {(c) => (
            <>
              <div class="label muted">
                <span class="guide-detail-number">{c().number}</span>
                {c().name}
                <Show when={focusedProgram()}>
                  {(p) => (
                    <>
                      {' '}
                      · {formatTime(p().start)} – {formatTime(p().end)}
                      <Show when={p().genre}> · {p().genre}</Show>
                    </>
                  )}
                </Show>
              </div>
              <Show
                when={focusedProgram()}
                fallback={<div class="guide-detail-title title">Aucun programme</div>}
              >
                {(p) => (
                  <>
                    <div class="guide-detail-title title">{p().title}</div>
                    <div class="guide-detail-status label">
                      <span
                        class="guide-detail-state"
                        classList={{ accent: status(p(), at()) === 'current' }}
                      >
                        {statusText(p())}
                      </span>
                      <Show when={p().description}>
                        <span class="muted"> · {p().description}</span>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
            </>
          )}
        </Show>
      </section>

      <div class="guide-marks label muted">
        <For each={MARKS}>
          {(m) => (
            <span style={{ left: `${GRID_LEFT + CHANNEL_CELL + m * PX_PER_MIN}px` }}>
              {formatTime(start() + m * MINUTE)}
            </span>
          )}
        </For>
      </div>

      <div class="guide-grid">
        <div class="guide-track" style={{ transform: `translateY(${-offset() * ROW_PITCH}px)` }}>
          <For each={visibleRows()}>
            {(row) => {
              const c = () => props.app.channels()[row];
              return (
                <div class="guide-row" style={{ top: `${row * ROW_PITCH}px` }}>
                  <div class="guide-channel" classList={{ focused: isFocusedRow(row) }}>
                    <Show when={imageUrl(c()?.image)}>
                      {(src) => <img class="guide-channel-image" src={src()} alt="" />}
                    </Show>
                    <div class="guide-channel-text">
                      <div class="guide-channel-number caption">{c()?.number}</div>
                      <div class="guide-channel-name label">{c()?.name}</div>
                    </div>
                  </div>
                  <Index each={props.app.guideRows()[row] ?? []}>
                    {(p, i) => (
                      <div
                        class="guide-program"
                        classList={{
                          focused: isFocusedCell(`${row}:${i}`),
                          current: status(p(), at()) === 'current',
                        }}
                        style={{
                          left: `${x(p().start)}px`,
                          width: `${Math.max(0, x(p().end) - x(p().start) - CELL_GAP)}px`,
                        }}
                      >
                        <span class="guide-program-title label">{p().title}</span>
                        <span class="guide-program-time caption">
                          {formatTime(p().start)} – {formatTime(p().end)}
                        </span>
                      </div>
                    )}
                  </Index>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      <div class="guide-now" style={{ left: `${GRID_LEFT + x(at()) - 1}px` }} />
    </div>
  );
}
