import { defineConfig } from 'vitest/config';
export default defineConfig({
  // Auth fixtures perform concurrent scrypt work; bound workers for stable local/CI runs.
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000, maxWorkers: 2 },
});
