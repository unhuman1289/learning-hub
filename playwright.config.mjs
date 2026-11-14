import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'private-data/playwright',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PHONE_BASE_URL ?? 'http://localhost:5174',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ].map(project => ({
    ...project,
    use: { ...project.use, viewport: { ...project.use.viewport, width: 390 }, deviceScaleFactor: 1 },
  })),
});
