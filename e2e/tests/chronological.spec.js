// @ts-check
// Record Home behaviour of the Chronological Instance View EM, as a user sees it.
// Fixture: lib/fixture-data.js (synthetic). The records below are the interesting ones.
const { test, expect } = require('@playwright/test');
const R = require('../lib/redcap');
const { SPECIAL } = require('../lib/fixture-data');
const { loadState } = require('../fixture');

let pid;
let jsErrors;

test.beforeAll(() => { pid = loadState().pid; });

test.beforeEach(async ({ page }) => {
  jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
});

test.afterEach(async ({}, testInfo) => {
  // Any JavaScript error on Record Home fails the test (the module's script runs on every record).
  expect(jsErrors, `JavaScript errors on ${testInfo.title}`).toEqual([]);
});

async function openRecordHome(page, record) {
  await page.goto(R.recordHomeUrl(pid, record));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#record_display_name, #record-home-header, .projhdr').first()).toBeVisible();
  return R.readChronologicalTable(page);
}

// Every link a user can click in the table (rows and expanded child rows) must open THIS record,
// with the record name URL-encoded.
async function expectLinksToRecord(page, rows, record) {
  const childCount = rows.reduce((n, r) => n + r.children.length, 0);
  const hrefs = await R.renderedLinks(page);
  expect(hrefs.length, 'one link per row and child row').toBe(rows.length + childCount);
  for (const href of hrefs) {
    expect(new URL(href).searchParams.get('id'), href).toBe(record);
    expect(href, 'record name must be URL-encoded in the link').toContain(`id=${encodeURIComponent(record)}&`);
  }
}

const visitDates = (rows) => rows.filter((r) => r.form === 'visit').map((r) => r.instance_date);

test('numeric record: its own visits, samples (filtered), logs and labels', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.numeric);
  expect(rows).not.toBeNull();
  const visits = rows.filter((r) => r.form === 'visit');
  expect(visits).toHaveLength(3);
  expect(visits.map((v) => v.children.length)).toEqual([2, 1, 2]); // the discarded sample is filtered out
  expect(visits[0].description).toBe('Screening, note 1');
  expect(visits[0].children[0].description).toBe('Blood, Active');
  expect(rows.filter((r) => r.form === 'event_log').map((r) => r.description)).toEqual(['EVENT_LOG: 1', 'EVENT_LOG: 2']);
  expect(rows.filter((r) => r.form === 'labelled').map((r) => r.instance_id)).toEqual(['lab-b-5', 'lab-a-5']); // descending
  await expectLinksToRecord(page, rows, SPECIAL.numeric);
  await expect(page.locator('#patient_record_table')).toBeVisible();
});

test('letters-only record ID: shows its own instances', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.lettersOnly);
  expect(rows, 'chronological table should render').not.toBeNull();
  expect(visitDates(rows)).toEqual(['2002-02-01', '2002-03-01']);
  expect(rows.filter((r) => r.form === 'visit').map((v) => v.children.length)).toEqual([1, 1]);
  await expectLinksToRecord(page, rows, SPECIAL.lettersOnly);
});

test('mixed record ID (letters and digits): shows its own instances', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.mixed);
  expect(rows, 'chronological table should render').not.toBeNull();
  expect(visitDates(rows)).toEqual(['2001-01-01']);
  await expectLinksToRecord(page, rows, SPECIAL.mixed);
});

test('record ID with a space: own instances, and its links open that record', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.withSpace);
  expect(rows, 'chronological table should render').not.toBeNull();
  expect(visitDates(rows)).toEqual(['2003-03-03']);
  await expectLinksToRecord(page, rows, SPECIAL.withSpace);
  // Follow the row link like a user would and land on that record's visit form.
  await page.locator('#patient_record_table tbody tr:not(.child) td a').first().click();
  await page.waitForLoadState('networkidle');
  expect(new URL(page.url()).searchParams.get('id')).toBe(SPECIAL.withSpace);
  await expect(page.locator('#visit_date-tr input, input[name=visit_date]').first()).toHaveValue('2003-03-03');
});

test('record without repeating data: no table and no JavaScript error', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.noRepeating);
  expect(rows).toBeNull();
  await expect(page.locator('#chrontable_display_name')).toHaveCount(0);
});

test('summary values are rendered as text', async ({ page }) => {
  const rows = await openRecordHome(page, SPECIAL.html);
  expect(rows).not.toBeNull();
  await page.locator('#patient_record_table').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__civHtmlRan || 0), 'a summary value was rendered as HTML').toBe(0);
  await expect(page.locator('#patient_record_table')).toContainText('<img src=x');
});

test('expanded table stays inside the page, dates on one line', async ({ page }) => {
  await openRecordHome(page, SPECIAL.numeric);
  const before = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.click('#toggleAllButton'); // expand every row's children
  const m = await page.locator('#patient_record_table').evaluate((t) => ({
    tableRight: t.getBoundingClientRect().right,
    childRights: [...t.querySelectorAll('tr td > table')].map((x) => x.getBoundingClientRect().right),
    dateLines: [...t.querySelectorAll('.chrontable-date a')].map((a) => a.getClientRects().length),
    docWidth: document.documentElement.scrollWidth,
  }));
  expect(m.childRights.length, 'child rows are shown').toBeGreaterThan(0);
  for (const r of m.childRights) expect(r, 'child rows must not stick out of the table').toBeLessThanOrEqual(m.tableRight + 1);
  expect(m.docWidth, 'expanding rows must not make the page scroll sideways').toBeLessThanOrEqual(before);
  expect(m.dateLines.length).toBeGreaterThan(0);
  expect(new Set(m.dateLines), 'each date fits on one line').toEqual(new Set([1]));
});

// A DAG-restricted user (fixture: A1 in DAG A, record 1 in DAG B, the user in DAG A).
test.describe('as a DAG-restricted user', () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'desktop', 'data access, not layout: desktop only');
  });

  test('sees only the instances of the record they opened', async ({ page }) => {
    const { dagUser } = loadState();
    await R.impersonate(page, pid, dagUser);
    try {
      const rows = await openRecordHome(page, SPECIAL.mixed);
      expect(rows, 'chronological table should render').not.toBeNull();
      expect(visitDates(rows)).toEqual(['2001-01-01']);
      await expectLinksToRecord(page, rows, SPECIAL.mixed);
      // Sanity: REDCap itself refuses record 1's page for this user.
      const res = await page.goto(R.recordHomeUrl(pid, '1'));
      expect(res.status()).toBe(403);
    } finally {
      await R.impersonate(page, pid, '');
    }
  });
});

// Longitudinal project (fixture: visit/sample repeating in two events).
test('longitudinal project: instances from every event, also for a no-digit record ID', async ({ page }) => {
  const { longitudinal } = loadState();
  test.skip(!longitudinal || !longitudinal.enabled, 'no longitudinal fixture (run fixture.js)');
  for (const record of ['1', 'GAMMA']) {
    await page.goto(R.recordHomeUrl(longitudinal.pid, record));
    await page.waitForLoadState('networkidle');
    const rows = await R.readChronologicalTable(page);
    expect(rows, `table for ${record}`).not.toBeNull();
    expect(visitDates(rows)).toEqual(['2021-01-01', '2021-02-01', '2022-01-01']);
    expect(rows.map((r) => r.children.length)).toEqual([1, 1, 1]);
    const hrefs = await R.renderedLinks(page);
    expect(new Set(hrefs.map((h) => new URL(h).searchParams.get('id')))).toEqual(new Set([record]));
    expect(new Set(hrefs.map((h) => new URL(h).searchParams.get('event_id'))).size, 'links cover both events').toBe(2);
  }
});
