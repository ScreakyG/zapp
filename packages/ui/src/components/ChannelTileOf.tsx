import type { App } from '../app/createApp';
import { imageUrl } from '../images';
import { ChannelTile } from './ChannelTile';

/** ChannelTile fed from the app state for the channel at `channel` (list index). */
export function ChannelTileOf(props: { app: App; channel: number; focused: boolean }) {
  const channel = () => props.app.channels()[props.channel];
  const air = () => props.app.onAir(props.channel);
  return (
    <ChannelTile
      number={channel()?.number ?? ''}
      name={channel()?.name ?? ''}
      image={imageUrl(channel()?.image)}
      now={air().program?.title}
      progress={air().progress}
      live={air().program?.live ?? false}
      focused={props.focused}
    />
  );
}
