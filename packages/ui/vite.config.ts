import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

/**
 * webOS apps load from file://, where Chromium 79 refuses ES module scripts. The TV build
 * (`vite build --mode webos`) is one classic script instead: no `type="module"`, no
 * `crossorigin`, dynamic imports (hls.js, mpegts.js) inlined.
 */
function classicScript(): Plugin {
  return {
    name: 'zapp-classic-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer'),
    },
  };
}

// webOS 6 ships Chromium 79.
export default defineConfig(({ mode }) => ({
  plugins: [solid(), ...(mode === 'webos' ? [classicScript()] : [])],
  base: './',
  build: {
    target: 'chrome79',
    ...(mode === 'webos' && {
      outDir: 'dist-webos',
      modulePreload: false,
      rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
    }),
  },
}));
