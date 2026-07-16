/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Standalone prototype checks are ordinary Node scripts, not Vitest
    // suites. Keep the production regression command scoped to React/TS.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
