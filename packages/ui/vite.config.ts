import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// webOS 6 ships Chromium 79.
export default defineConfig({
  plugins: [solid()],
  base: './',
  build: { target: 'chrome79' },
});
