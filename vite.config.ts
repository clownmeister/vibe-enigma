import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/vibe-enigma/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { main: 'index.html', three: '3d/index.html', v2: 'v2/index.html' } },
  },
  test: { environment: 'node' },
});
