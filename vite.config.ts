import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
