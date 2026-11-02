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
      '**/node_modules/**',
      '**/.vite/**',
      'prototype/**',
      'design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Electron main and preload scripts: plain CommonJS on Node.
    files: ['apps/desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: nodeGlobals },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
