// Builds (or reuses) the synthetic test project, then enables the module on it through the UI.
//
//   REDCAP_SUPER_TOKEN=... node fixture.js          build data (API) + enable module (UI, admin session)
//   REDCAP_SUPER_TOKEN=... node fixture.js --data   API part only
//   node fixture.js --enable                         UI part only (needs .auth/admin.json from login-headed.js)
//
// REDCAP_SUPER_TOKEN is a super API token of the LOCAL instance (Control Center > API Tokens).
// Never commit it. State (pid, project token) goes to .auth/fixture.json, which is gitignored.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const R = require('./lib/redcap');
const D = require('./lib/fixture-data');

const STATE = path.join(__dirname, '.auth', 'fixture.json');
const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json');

const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
const saveState = (s) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };

async function projectStillExists(token) {
  try { return (await R.api(token, { content: 'project', format: 'json' })).project_id; } catch { return null; }
}

async function buildData() {
  const st = loadState();
  if (st.token && (await projectStillExists(st.token)) === st.pid && st.records === D.NUMERIC_RECORDS) {
    console.log(`[fixture] reusing pid ${st.pid}`);
    return st;
  }
  const superToken = process.env.REDCAP_SUPER_TOKEN;
  if (!superToken) throw new Error('Set REDCAP_SUPER_TOKEN (a super API token of the local instance)');

  const title = `CIV E2E - chronological view (${D.NUMERIC_RECORDS} records)`;
  const token = String(await R.api(superToken, {
    content: 'project', format: 'json',
    data: JSON.stringify([{ project_title: title, purpose: 0, is_longitudinal: 0, surveys_enabled: 0, record_autonumbering_enabled: 0 }]),
  })).trim();
  const pid = (await R.api(token, { content: 'project', format: 'json' })).project_id;
  console.log(`[fixture] created pid ${pid}`);

  await R.api(token, { content: 'metadata', format: 'json', data: JSON.stringify(D.METADATA) });
  await R.api(token, { content: 'repeatingFormsEvents', format: 'json', data: JSON.stringify(D.REPEATING) });

  // Import in batches, keeping each record's rows together.
  const byRecord = new Map();
  for (const row of D.allRows()) {
    if (!byRecord.has(row.record_id)) byRecord.set(row.record_id, []);
    byRecord.get(row.record_id).push(row);
  }
  const ids = [...byRecord.keys()];
  let imported = 0;
  for (let i = 0; i < ids.length; i += 250) {
    const rows = ids.slice(i, i + 250).flatMap((id) => byRecord.get(id));
    const res = await R.api(token, {
      content: 'record', format: 'csv', type: 'flat', overwriteBehavior: 'normal',
      forceAutoNumber: 'false', returnContent: 'count', data: D.toCsv(rows),
    });
    imported += Number(res.count ?? 0);
    process.stdout.write(`\r[fixture] imported ${imported}/${ids.length} records`);
  }
  console.log('');
  const st2 = { pid, token, records: D.NUMERIC_RECORDS, title, enabled: false };
  saveState(st2);
  return st2;
}

// DAG scenario: record A1 in "DAG A", record 1 in "DAG B", and an existing local user (default
// "alice", CIV_DAG_USER) with read-only rights restricted to DAG A. Idempotent.
const DAG_USER = process.env.CIV_DAG_USER || 'alice';
async function ensureDags() {
  const st = loadState();
  if (st.dags) return st;
  const t = st.token;
  const existing = await R.api(t, { content: 'dag', format: 'json' });
  const missing = ['DAG A', 'DAG B'].filter((n) => !existing.some((d) => d.data_access_group_name === n));
  if (missing.length) {
    await R.api(t, { content: 'dag', action: 'import', format: 'json',
      data: JSON.stringify(missing.map((n) => ({ data_access_group_name: n, unique_group_name: '' }))) });
  }
  const dags = Object.fromEntries((await R.api(t, { content: 'dag', format: 'json' }))
    .map((d) => [d.data_access_group_name, d.unique_group_name]));
  await R.api(t, { content: 'record', format: 'json', type: 'flat', overwriteBehavior: 'normal',
    data: JSON.stringify([
      { record_id: D.SPECIAL.mixed, redcap_data_access_group: dags['DAG A'] },
      { record_id: '1', redcap_data_access_group: dags['DAG B'] },
    ]) });
  const forms = Object.fromEntries([...new Set(D.METADATA.map((m) => m.form_name))].map((f) => [f, 2])); // read only
  await R.api(t, { content: 'user', format: 'json', data: JSON.stringify([{ username: DAG_USER, forms }]) });
  await R.api(t, { content: 'userDagMapping', action: 'import', format: 'json',
    data: JSON.stringify([{ username: DAG_USER, redcap_data_access_group: dags['DAG A'] }]) });
  const st2 = { ...st, dags: true, dagUser: DAG_USER, dagNames: dags };
  saveState(st2);
  console.log(`[fixture] DAGs ready: ${D.SPECIAL.mixed} in DAG A, 1 in DAG B, ${DAG_USER} restricted to DAG A`);
  return st2;
}

// Longitudinal project: the same forms in two events, visit/sample repeating in both.
// Record "1" has instances in both events; "GAMMA" (no digits) too. State key: longitudinal.
async function buildLongitudinal() {
  const st = loadState();
  if (st.longitudinal && (await projectStillExists(st.longitudinal.token)) === st.longitudinal.pid) return st;
  const superToken = process.env.REDCAP_SUPER_TOKEN;
  if (!superToken) throw new Error('Set REDCAP_SUPER_TOKEN (a super API token of the local instance)');
  const token = String(await R.api(superToken, {
    content: 'project', format: 'json',
    data: JSON.stringify([{ project_title: 'CIV E2E - longitudinal', purpose: 0, is_longitudinal: 1, surveys_enabled: 0, record_autonumbering_enabled: 0 }]),
  })).trim();
  const pid = (await R.api(token, { content: 'project', format: 'json' })).project_id;
  await R.api(token, { content: 'metadata', format: 'json', data: JSON.stringify(D.METADATA) });
  await R.api(token, { content: 'event', action: 'import', override: '1', format: 'json',
    data: JSON.stringify([{ event_name: 'Baseline', arm_num: '1' }, { event_name: 'Follow up', arm_num: '1' }]) });
  const events = (await R.api(token, { content: 'event', format: 'json' })).map((e) => e.unique_event_name);
  const [ev1, ev2] = events;
  const mapping = [{ arm_num: '1', unique_event_name: ev1, form: 'demographics' }];
  for (const ev of [ev1, ev2]) for (const form of ['visit', 'sample']) mapping.push({ arm_num: '1', unique_event_name: ev, form });
  await R.api(token, { content: 'formEventMapping', format: 'json', data: JSON.stringify(mapping) });
  await R.api(token, { content: 'repeatingFormsEvents', format: 'json',
    data: JSON.stringify([ev1, ev2].flatMap((event_name) => ['visit', 'sample'].map((form_name) => ({ event_name, form_name, custom_form_label: '' })))) });
  const visit = (id, ev, n, date, type) => ({ record_id: id, redcap_event_name: ev, redcap_repeat_instrument: 'visit', redcap_repeat_instance: n, visit_date: date, visit_type: String(type), visit_note: `${ev} ${n}`, visit_complete: '2' });
  const sample = (id, ev, n, v, date) => ({ record_id: id, redcap_event_name: ev, redcap_repeat_instrument: 'sample', redcap_repeat_instance: n, sample_visit: String(v), sample_date: date, sample_type: '1', sample_status: '1', sample_complete: '2' });
  const rows = [];
  for (const id of ['1', '2', 'GAMMA']) {
    rows.push({ record_id: id, redcap_event_name: ev1, dem_initials: 'ZZ', demographics_complete: '2' });
    rows.push(visit(id, ev1, 1, '2021-01-01', 1), visit(id, ev1, 2, '2021-02-01', 2), visit(id, ev2, 1, '2022-01-01', 3));
    rows.push(sample(id, ev1, 1, 1, '2021-01-02'), sample(id, ev1, 2, 2, '2021-02-02'), sample(id, ev2, 1, 1, '2022-01-02'));
  }
  await R.api(token, { content: 'record', format: 'json', type: 'flat', overwriteBehavior: 'normal', data: JSON.stringify(rows) });
  const st2 = { ...st, longitudinal: { pid, token, events, enabled: false } };
  saveState(st2);
  console.log(`[fixture] longitudinal pid ${pid} (events ${events.join(', ')})`);
  return st2;
}

module.exports = { loadState, saveState, buildData, ensureDags, buildLongitudinal, STATE, ADMIN_STATE };

if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    if (!args.includes('--enable')) { await buildData(); await ensureDags(); await buildLongitudinal(); }
    if (!args.includes('--data')) {
      const { enableModule } = require('./lib/enable-module');
      const st = loadState();
      const browser = await chromium.launch({ channel: 'chrome' });
      const ctx = await browser.newContext({ baseURL: R.BASE, storageState: ADMIN_STATE });
      const page = await ctx.newPage();
      page.on('dialog', (d) => d.accept());
      try {
        await R.assertLoggedIn(page);
        await enableModule(page, st.pid);
        const st2 = { ...loadState(), enabled: true };
        if (st2.longitudinal) {
          await enableModule(page, st2.longitudinal.pid);
          st2.longitudinal.enabled = true;
        }
        saveState(st2);
        console.log(`[fixture] module enabled on pid ${st.pid}${st2.longitudinal ? ` and ${st2.longitudinal.pid}` : ''}`);
      } finally {
        await browser.close();
      }
    }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
