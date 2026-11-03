import { For, createEffect, createMemo, createSelector } from 'solid-js';
import { MOSAIC_COLUMNS, MOSAIC_FILTERS, type App } from '../app/createApp';
import { pointerTo } from '../app/pointer';
import { ChannelTileOf } from '../components/ChannelTileOf';
import './Mosaic.css';

/**
 * Grid geometry in stage pixels: 272 px tiles, 32 px between columns. The row pitch is the
 * prototype's scroll step (ZMROW = 237), which leaves room for the focused tile's lift.
 */
const COLUMN_PITCH = 304;
const ROW_PITCH = 237;
/** Two rows fit under the chips; the focused row stays on the first or second one. */
const VISIBLE_ROWS = 2;

/** Mosaic (HANDOFF §4): category chips, then a 4-column grid of the filtered channels. */
export function Mosaic(props: { app: App }) {
  const nav = () => props.app.nav();
  // Memo: a key press must not re-filter every channel.
  const filter = createMemo(() => nav().mosaic.filter);
  const list = createMemo(() => props.app.mosaicChannels(filter()));
  const counts = createMemo(() => MOSAIC_FILTERS.map((_, i) => props.app.mosaicChannels(i).length));

  const row = () => Math.floor(nav().mosaic.idx / MOSAIC_COLUMNS);
  const rowCount = () => Math.ceil(list().length / MOSAIC_COLUMNS);
  const offset = createMemo(() => Math.max(0, Math.min(row() - 1, rowCount() - VISIBLE_ROWS)));
  /** First list position rendered: one row above the view, for the scroll. */
  const first = createMemo(() => Math.max(0, offset() - 1) * MOSAIC_COLUMNS);
  /**
   * Channels rendered: the row above the view, the rows in view (the third is partly visible)
   * and one more below. Keyed by channel, so a filter change builds fresh tiles instead of
   * swapping images under the old ones, while scrolling reuses them.
   */
  const visible = createMemo(() =>
    list().slice(first(), (offset() + VISIBLE_ROWS + 2) * MOSAIC_COLUMNS),
  );

  createEffect(() => props.app.wantPrograms(visible()));

  const isFocusedTile = createSelector(() => (nav().zone === 'content' ? nav().mosaic.idx : -1));
  const chipsFocused = () => nav().zone === 'chips';

  return (
    <div class="mosaic">
      <div class="mosaic-chips">
        <For each={MOSAIC_FILTERS}>
          {(chip, i) => (
            <span
              {...pointerTo(
                props.app,
                // Hovering only reaches the chips: crossing them on the way to the TabBar must
                // not change the filter. A click picks it.
                (s) => ({ ...s, zone: 'chips' }),
                (s) => ({
                  ...s,
                  zone: 'chips',
                  mosaic: { filter: i(), idx: s.mosaic.filter === i() ? s.mosaic.idx : 0 },
                }),
              )}
              class="chip label"
              classList={{
                selected: filter() === i(),
                focused: chipsFocused() && filter() === i(),
              }}
            >
              {chip.label}
              <span class="chip-count caption">{counts()[i()]}</span>
            </span>
          )}
        </For>
      </div>

      <div class="mosaic-grid">
        <div class="mosaic-track" style={{ transform: `translateY(${-offset() * ROW_PITCH}px)` }}>
          <For each={visible()}>
            {(channel, index) => {
              const position = () => first() + index();
              return (
                <div
                  {...pointerTo(props.app, (s) => ({
                    ...s,
                    zone: 'content',
                    mosaic: { filter: s.mosaic.filter, idx: position() },
                  }))}
                  class="mosaic-cell"
                  style={{
                    left: `${(position() % MOSAIC_COLUMNS) * COLUMN_PITCH}px`,
                    top: `${Math.floor(position() / MOSAIC_COLUMNS) * ROW_PITCH}px`,
                  }}
                >
                  <ChannelTileOf
                    app={props.app}
                    channel={channel}
                    focused={isFocusedTile(position())}
                  />
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
