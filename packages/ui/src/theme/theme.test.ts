import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tokens from '../../../../design/tokens.json';
import { contrastRatio } from './contrast';
import { stageZoom } from './scale';
import { THEMES, nextTheme } from './themes';

const color = (name: string, theme: string): string => {
  const token = tokens.color.tokens.find((t) => t.name === name)!;
  return typeof token.value === 'string'
    ? token.value
    : (token.value as Record<string, string>)[theme]!;
};

describe('themes', () => {
  it('match the themes declared in tokens.json', () => {
    expect(THEMES).toEqual(tokens.color.themes.map((t) => t.id));
  });

  it('cycle in both directions', () => {
    expect(nextTheme('lagon', 1)).toBe('graphite');
    expect(nextTheme('graphite', -1)).toBe('lagon');
  });

  // HANDOFF §7: text ≥ 4.5:1 on its background in every theme.
  const pairs: [string, string][] = [
    ['ink', 'bg'],
    ['ink-muted', 'bg'],
    ['accent-text', 'bg'],
    ['ink', 'surface-raised'],
    ['ink-muted', 'surface-raised'],
    ['on-accent', 'accent'],
    ['on-live', 'live'],
  ];
  for (const theme of THEMES) {
    for (const [fg, bg] of pairs) {
      it(`${theme}: ${fg} on ${bg} ≥ 4.5:1`, () => {
        expect(contrastRatio(color(fg, theme), color(bg, theme))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('stageZoom', () => {
  it('is 1 at the reference resolution and 1.5 at 1080p', () => {
    expect(stageZoom(1280, 720)).toBe(1);
    expect(stageZoom(1920, 1080)).toBe(1.5);
  });

  it('fits the narrower dimension on other ratios', () => {
    expect(stageZoom(1920, 1200)).toBe(1.5);
    expect(stageZoom(2560, 1080)).toBe(1.5);
  });

  it('shrinks in a window smaller than the canvas', () => {
    expect(stageZoom(960, 540)).toBe(0.75);
  });
});

describe('theme-rgb.css', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../styles/theme-rgb.css', import.meta.url)),
    'utf8',
  );
  for (const theme of THEMES) {
    it(`${theme} --bg-rgb matches bg`, () => {
      const start = css.indexOf(`[data-theme='${theme}']`);
      expect(start, `selector for ${theme}`).toBeGreaterThanOrEqual(0);
      const value = /--bg-rgb: ([^;]+);/.exec(css.slice(start))![1];
      const n = parseInt(color('bg', theme).slice(1), 16);
      expect(value).toBe(`${n >> 16}, ${(n >> 8) & 0xff}, ${n & 0xff}`);
    });
  }
});

// The app loads tokens.css; the tests above read tokens.json. Both must agree.
describe('tokens.css', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../../design/tokens.css', import.meta.url)),
    'utf8',
  );
  const block = (theme: string) => {
    const selector =
      theme === 'graphite' ? ':root, [data-theme="graphite"]' : `[data-theme="${theme}"]`;
    const start = css.indexOf(`${selector} {`);
    return css.slice(start, css.indexOf('}', start));
  };

  for (const theme of THEMES) {
    it(`${theme} matches tokens.json`, () => {
      const body = block(theme);
      for (const token of tokens.color.tokens) {
        expect(body, token.name).toContain(`--${token.name}: ${color(token.name, theme)};`);
      }
    });
  }
});
