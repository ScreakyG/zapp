import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', 'prototype/**', 'design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
