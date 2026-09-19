import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
