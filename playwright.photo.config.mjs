import { defineConfig, devices } from '@playwright/test';
const port = 5291;
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'photo.spec.mjs', workers: 1, timeout: 180_000,
  outputDir: 'private-data/playwright',
  use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit', baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: 'iphone-13' }],
  webServer: { command: 'npm run dev:setup && npm run dev:seed && node tests/e2e/demo-worker.mjs',
    env: { E2E_PHOTO: '1', LEARNING_HUB_DEMO_PORT: String(port), LEARNING_HUB_DEMO_STATE: `.wrangler/e2e-photo-${process.pid}` },
    url: `http://127.0.0.1:${port}/api/health`, timeout: 120_000 },
});
