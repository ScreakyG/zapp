import './LiveBadge.css';

/** "Live" is always spelled out, never colour alone (HANDOFF §7). */
export function LiveBadge(props: { class?: string }) {
  return <span class={`live-badge badge ${props.class ?? ''}`}>DIRECT</span>;
}
