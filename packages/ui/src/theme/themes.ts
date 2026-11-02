export const THEMES = ['graphite', 'phosphore', 'ambre', 'lagon'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'graphite';

// Themes only swap token values: the attribute on <html> is the whole switch.
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme;
}

export function nextTheme(current: Theme, step: 1 | -1): Theme {
  const i = THEMES.indexOf(current);
  return THEMES[(i + step + THEMES.length) % THEMES.length]!;
}
