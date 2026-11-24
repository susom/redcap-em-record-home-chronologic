// Opens a visible Chrome window on the local REDCap login page. Log in by hand as an admin;
// once the login form is gone the session is saved to .auth/admin.json (gitignored).
//   node login-headed.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = (process.env.REDCAP_BASE_URL || 'http://redcap.local').replace(/\/$/, '');
const OUT = path.join(__dirname, '.auth', 'admin.json');

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  console.log('Waiting for you to log in (10 min max)...');
  await page.waitForFunction(() => !document.querySelector('#password') && document.readyState === 'complete',
    null, { timeout: 600_000, polling: 1000 });
  await page.waitForLoadState('networkidle');
  await ctx.storageState({ path: OUT });
  console.log('Logged in; session saved to .auth/admin.json');
  await browser.close();
})().catch((e) => { console.error('Login capture failed:', e.message); process.exit(1); });
