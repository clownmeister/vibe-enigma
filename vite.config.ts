import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/vibe-enigma/',
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node' },
});
