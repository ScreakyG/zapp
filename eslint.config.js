import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const nodeGlobals = Object.fromEntries(
  ['require', 'module', '__dirname', 'process', 'Buffer', 'console', 'setTimeout'].map((g) => [
    g,
    'readonly',
  ]),
);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/release/**',
      '**/dist-webos/**',
      'apps/webos/build/**',
      'apps/webos/out/**',
      '**/node_modules/**',
      '**/.vite/**',
      'prototype/**',
      'design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (Electron main and preload, webOS packaging): plain CommonJS.
    files: ['apps/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: nodeGlobals },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
