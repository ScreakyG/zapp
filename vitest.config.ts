import { defineConfig } from 'vitest/config';

// Solid's "node" build is for server rendering: memos and effects never update there. Tests
// need the reactive browser build, so it is resolved (and inlined) instead.
const conditions = ['browser', 'development'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: conditions } },
  test: { server: { deps: { inline: [/solid-js/] } } },
});
