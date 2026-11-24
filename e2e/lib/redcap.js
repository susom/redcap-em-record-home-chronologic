// Helpers for driving a local REDCap (redcap-docker-compose) in the E2E suite.
//   REDCAP_BASE_URL     default http://redcap.local (must match redcap_base_url)
//   REDCAP_VERSION_DIR  default redcap_v17.5.9
const { expect } = require('@playwright/test');

const BASE = (process.env.REDCAP_BASE_URL || 'http://redcap.local').replace(/\/$/, '');
const V = process.env.REDCAP_VERSION_DIR || 'redcap_v17.5.9';
const vurl = (path) => `/${V}/${path}`;

const MODULE_NAME = 'ChronologicalInstanceView';
const MODULE_PREFIX = 'record_home_chronologic';

// REDCap API call (form-encoded POST). Throws on HTTP errors and on REDCap's {"error": ...} bodies.
async function api(token, params) {
  const body = new URLSearchParams({ token, returnFormat: 'json', ...params });
  const res = await fetch(`${BASE}/api/`, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok || /^\s*\{\s*"error"/.test(text)) {
    throw new Error(`API ${params.content} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// Fails fast when the saved admin session is gone.
async function assertLoggedIn(page) {
  await page.goto(vurl('ControlCenter/index.php'));
  if (await page.locator('#password').count()) {
    throw new Error('Admin session expired. Run: node login-headed.js');
  }
}

// Record Home URL for a record (the record name is URL-encoded, exactly like REDCap's own links).
const recordHomeUrl = (pid, record) =>
  vurl(`DataEntry/record_home.php?pid=${pid}&arm=1&id=${encodeURIComponent(record)}`);

// Reads the module's table the way a user sees it: one entry per row, with its children.
async function readChronologicalTable(page) {
  return page.evaluate(() => {
    const el = document.getElementById('patient_record_table');
    if (!el || !window.jQuery || !jQuery.fn.dataTable || !jQuery.fn.dataTable.isDataTable(el)) return null;
    return jQuery(el).DataTable().rows().data().toArray().map((r) => ({
      form: r.form,
      instance_id: r.instance_id,
      instance_date: r.instance_date ?? null,
      description: r.description,
      record_url: r.record_url,
      children: (r.children || []).map((c) => ({
        form: c.form, instance_id: c.instance_id, instance_date: c.instance_date ?? null,
        description: c.description, record_url: c.record_url,
      })),
    }));
  });
}

// Expands every row (the table's "toggle all" button) and returns the href of every link a user
// can click in the table, child rows included.
async function renderedLinks(page) {
  const toggle = page.locator('#toggleAllButton');
  if (await toggle.count()) await toggle.click();
  return page.locator('#patient_record_table a').evaluateAll((as) => as.map((a) => a.href));
}

// Admin "View project as user" (left menu). username '' stops impersonating.
async function impersonate(page, pid, username) {
  await page.goto(vurl(`index.php?pid=${pid}`));
  await page.waitForLoadState('networkidle');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('impersonateUser') && r.request().method() === 'POST'),
    page.locator('#impersonate-user-select').selectOption(username),
  ]);
  await page.goto(vurl(`index.php?pid=${pid}`)); // REDCap reloads after its dialog; do the same
  await page.waitForLoadState('networkidle');
  const banner = page.getByText(/currently viewing this project as the user/i);
  if (username) await expect(banner.first()).toBeVisible();
  else await expect(banner).toHaveCount(0);
}

module.exports = { BASE, V, vurl, api, assertLoggedIn, recordHomeUrl, readChronologicalTable, renderedLinks, impersonate, MODULE_NAME, MODULE_PREFIX, expect };
