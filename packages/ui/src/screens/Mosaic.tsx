import { For, createMemo, createSelector } from 'solid-js';
import { MOSAIC_COLUMNS, MOSAIC_FILTERS, type App } from '../app/createApp';
import { ChannelTileOf } from '../components/ChannelTileOf';
import './Mosaic.css';

/** Grid geometry in stage pixels: 272 px tiles, 32 px between columns, 237 px row pitch. */
const COLUMN_PITCH = 304;
const ROW_PITCH = 237;
/** Two rows fit under the chips; the focused row stays on the first or second one. */
const VISIBLE_ROWS = 2;

/** Mosaic (HANDOFF §4): category chips, then a 4-column grid of the filtered channels. */
export function Mosaic(props: { app: App }) {
  const nav = () => props.app.nav();
  const filter = () => nav().mosaic.filter;
  const list = createMemo(() => props.app.mosaicChannels(filter()));
  const counts = createMemo(() => MOSAIC_FILTERS.map((_, i) => props.app.mosaicChannels(i).length));

  const row = () => Math.floor(nav().mosaic.idx / MOSAIC_COLUMNS);
  const rowCount = () => Math.ceil(list().length / MOSAIC_COLUMNS);
  const offset = () => Math.max(0, Math.min(row() - 1, rowCount() - VISIBLE_ROWS));
  /** Tiles of the rows in view, plus one row on each side for the scroll. */
  const visible = createMemo(() => {
    const first = Math.max(0, offset() - 1) * MOSAIC_COLUMNS;
    const last = Math.min(list().length, (offset() + VISIBLE_ROWS + 1) * MOSAIC_COLUMNS);
    return Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i);
  });

  const isFocusedTile = createSelector(() => (nav().zone === 'content' ? nav().mosaic.idx : -1));
  const chipsFocused = () => nav().zone === 'chips';

  return (
    <div class="mosaic">
      <div class="mosaic-chips">
        <For each={MOSAIC_FILTERS}>
          {(chip, i) => (
            <span
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
            {(i) => (
              <div
                class="mosaic-cell"
                style={{
                  left: `${(i % MOSAIC_COLUMNS) * COLUMN_PITCH}px`,
                  top: `${Math.floor(i / MOSAIC_COLUMNS) * ROW_PITCH}px`,
                }}
              >
                <ChannelTileOf
                  app={props.app}
                  channel={list()[i] ?? 0}
                  focused={isFocusedTile(i)}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
