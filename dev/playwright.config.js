// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // run from the repo root, where _site is; Playwright starts it in this file's folder (dev/) otherwise
    cwd: '..',
    command: 'npx http-server _site -p 4000 -s -c-1',
    url: 'http://127.0.0.1:4000/latentspace/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
