import { defineConfig, devices } from '@playwright/test';

const basePort = Number(process.env.U5_BASE_PORT || 5226);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: process.env.F2_E2E ? 'f2.spec.mjs' : 'u5.spec.mjs',
  outputDir: 'private-data/playwright',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: [basePort, basePort + 1].map(port => ({
    command: 'npm run dev:setup && npm run dev:seed && node tests/e2e/demo-worker.mjs',
    env: { LEARNING_HUB_DEMO_PORT: String(port), LEARNING_HUB_DEMO_STATE: '.wrangler/e2e-' + port + '-' + process.pid },
    url: 'http://127.0.0.1:' + port + '/api/health',
    timeout: 90_000,
  })),
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ].map((project, index) => ({
    ...project,
    use: { ...project.use, trace: process.env.E2E_DIAG === '1' && project.name === 'pixel-7' ? 'retain-on-failure' : 'off', baseURL: 'http://127.0.0.1:' + (basePort + index), viewport: { ...project.use.viewport, width: 390 }, deviceScaleFactor: 1 },
  })),
});
