// Enables the module the way an admin does: Control Center > External Modules > Enable a module,
// then the project's External Modules page > Enable a module. Idempotent.
const { expect } = require('@playwright/test');
const R = require('./redcap');

const enabledRow = (page) => page.locator(`#external-modules-enabled tr[data-module="${R.MODULE_PREFIX}"]`);

async function enableFrom(page, managerUrl) {
  await page.goto(managerUrl);
  await page.waitForLoadState('networkidle');
  if (await enabledRow(page).count()) return false; // already enabled here

  await page.click('#external-modules-enable-modules-button');
  const row = page.locator(`#external-modules-disabled-table tr[data-module="${R.MODULE_PREFIX}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator('.enable-button').click();

  // The Control Center asks for confirmation in a second modal; the project page may too.
  const confirm = page.locator('#external-modules-enable-modal .enable-button');
  try {
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    await Promise.all([page.waitForEvent('load', { timeout: 60_000 }), confirm.click()]);
  } catch {
    await page.waitForLoadState('load');
  }
  await page.goto(managerUrl);
  await expect(enabledRow(page)).toHaveCount(1, { timeout: 30_000 });
  return true;
}

async function enableModule(page, pid) {
  const sys = await enableFrom(page, R.vurl('ExternalModules/manager/control_center.php'));
  const proj = await enableFrom(page, R.vurl(`ExternalModules/manager/project.php?pid=${pid}`));
  console.log(`[enable] system: ${sys ? 'enabled now' : 'already on'}; pid ${pid}: ${proj ? 'enabled now' : 'already on'}`);
}

module.exports = { enableModule };
