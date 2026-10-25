import { defineConfig } from '@playwright/test'

// Electron E2E: every launch goes through e2e/fixtures.ts (hidden window, temp vault).
// Run `npm run build` first (the `e2e` script does).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  outputDir: './test-results',
})
