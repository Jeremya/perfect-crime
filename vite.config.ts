import { defineConfig } from 'vitest/config';
import { yapChallengePagesPlugin } from './tools/og';

export default defineConfig({
  base: './',
  plugins: [
    // Story E3: build-time preview images (public/icons/) and the static
    // challenge pages /c/1 … /c/7 with their og: tags (see tools/og.ts).
    yapChallengePagesPlugin(),
  ],
  build: {
    target: 'es2022',
    // Gate 1 budget: < 3 MB transferred. Phaser dominates; keep an eye on this.
    chunkSizeWarningLimit: 2048,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
