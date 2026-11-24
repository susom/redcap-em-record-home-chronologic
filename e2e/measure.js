// Measures what one Record Home view costs on the server, per record:
//   - peak RSS growth of the Apache/PHP worker that served it (sampled every 100 ms in the
//     redcap-docker-compose web container), and
//   - server time (navigation requestStart -> responseStart).
//   node measure.js                 the fixture's numeric, letters-only and mixed records
//   node measure.js 5 ALPHA "QC 7"  specific records
//   REDCAP_WEB_CONTAINER            default redcap_2023_1_web
const { execFile } = require('child_process');
const { chromium } = require('@playwright/test');
const R = require('./lib/redcap');
const { SPECIAL } = require('./lib/fixture-data');
const { loadState, ADMIN_STATE } = require('./fixture');

const CONTAINER = process.env.REDCAP_WEB_CONTAINER || 'redcap_2023_1_web';

// pid -> RSS (KiB) of every apache2 process in the web container.
function apacheRss() {
  const script = 'for p in /proc/[0-9]*; do [ "$(cat $p/comm 2>/dev/null)" = apache2 ] && echo "${p#/proc/} $(awk \'/VmRSS/{print $2}\' $p/status 2>/dev/null)"; done';
  return new Promise((resolve) => execFile('docker', ['exec', CONTAINER, 'sh', '-c', script], (err, out) => {
    const m = new Map();
    if (!err) for (const line of out.trim().split('\n')) { const [pid, kb] = line.split(' '); if (kb) m.set(pid, Number(kb)); }
    resolve(m);
  }));
}

async function measure(page, pid, record) {
  const before = await apacheRss();
  const peak = new Map();
  let running = true;
  const sampler = (async () => {
    while (running) {
      for (const [p, kb] of await apacheRss()) peak.set(p, Math.max(peak.get(p) || 0, kb));
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  const t0 = Date.now();
  await page.goto(R.recordHomeUrl(pid, record), { timeout: 600_000 });
  const wall = Date.now() - t0;
  const server = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return Math.round(n.responseStart - n.requestStart); });
  await new Promise((r) => setTimeout(r, 300));
  running = false;
  await sampler;
  // Largest growth of any worker over its own starting RSS (new workers count from 0).
  let growth = 0;
  for (const [p, kb] of peak) growth = Math.max(growth, kb - (before.get(p) || 0));
  const rows = await R.readChronologicalTable(page);
  return { record, serverMs: server, wallMs: wall, peakWorkerGrowthMiB: Math.round(growth / 1024), tableRows: rows ? rows.length : null };
}

(async () => {
  const { pid } = loadState();
  const records = process.argv.slice(2).length ? process.argv.slice(2) : [SPECIAL.numeric, SPECIAL.lettersOnly, SPECIAL.mixed];
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await (await browser.newContext({ baseURL: R.BASE, storageState: ADMIN_STATE })).newPage();
  try {
    await R.assertLoggedIn(page);
    await page.goto(R.recordHomeUrl(pid, SPECIAL.numeric)); // warm up OPcache and the session
    for (const rec of records) console.log(JSON.stringify(await measure(page, pid, rec)));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
