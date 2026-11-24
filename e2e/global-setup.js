// Checks the admin session and the fixture project before any test runs.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const R = require('./lib/redcap');

module.exports = async (config) => {
  const { baseURL, storageState } = config.projects[0].use;
  if (!fs.existsSync(storageState)) throw new Error(`No admin session at ${storageState}. Run: node login-headed.js`);
  const fixture = path.join(__dirname, '.auth', 'fixture.json');
  if (!fs.existsSync(fixture)) throw new Error('No fixture project. Run: REDCAP_SUPER_TOKEN=... node fixture.js');
  const st = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  if (!st.enabled) throw new Error('Module not enabled on the fixture project yet. Run: node fixture.js --enable');

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ baseURL, storageState })).newPage();
    await R.assertLoggedIn(page);
  } finally {
    await browser.close();
  }
};
