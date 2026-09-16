import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Provider registration (`index.ts`) needs a live Cordis/`subagents`
      // host; seed math is covered by unit tests. Gate coverage on seed.ts.
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 70,
        lines: 90,
      },
    },
  },
})