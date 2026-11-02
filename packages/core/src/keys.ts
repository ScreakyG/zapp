export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | { digit: number };

// webOS remote "Back" key reports keyCode 461.
const WEBOS_BACK = 461;

export function toAction(e: Pick<KeyboardEvent, 'key' | 'keyCode'>): Action | null {
  switch (e.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Enter':
      return 'ok';
    case 'Escape':
    case 'Backspace':
    case 'GoBack':
      return 'back';
  }
  if (e.keyCode === WEBOS_BACK) return 'back';
  if (/^[0-9]$/.test(e.key)) return { digit: Number(e.key) };
  return null;
}
