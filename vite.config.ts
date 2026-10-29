import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
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
