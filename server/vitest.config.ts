import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/feeling_gamificacao_test', JWT_SECRET: 'test-secret-test-secret-test-secret', NODE_ENV: 'test' },
  },
});
