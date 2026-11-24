// @ts-check
// E2E for the Chronological Instance View EM against a local REDCap (redcap-docker-compose).
//   REDCAP_BASE_URL  default http://redcap.local (must match redcap_base_url)
//   Session: .auth/admin.json, made by `node login-headed.js` (you log in by hand).
//   Fixture: .auth/fixture.json, made by `node fixture.js` (see README.md).
const { defineConfig, devices } = require('@playwright/test');

const baseURL = (process.env.REDCAP_BASE_URL || 'http://redcap.local').replace(/\/$/, '');
const iPhone = devices['iPhone 13'];

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  globalSetup: require.resolve('./global-setup.js'),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    storageState: '.auth/admin.json',
    channel: 'chrome',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    {
      name: 'mobile',
      use: {
        channel: 'chrome',
        viewport: iPhone.viewport,
        deviceScaleFactor: iPhone.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        userAgent: iPhone.userAgent,
      },
    },
  ],
});
