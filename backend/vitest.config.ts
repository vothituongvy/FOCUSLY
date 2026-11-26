import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access',
      JWT_EXTENSION_SECRET: 'test-ext',
      ENABLE_SCHEDULER: 'false',
    },
  },
});
