# E2E tests (Playwright)

These tests open Record Home the way a user does, against a local REDCap ([redcap-docker-compose](https://github.com/123andy/redcap-docker-compose)), with this module mounted in `modules-local/`. They run on desktop Chrome and on an iPhone 13-sized viewport.

## Run

```bash
cd e2e
npm install                      # @playwright/test only; uses your installed Chrome (channel: chrome)
node login-headed.js             # opens Chrome: log in as an admin -> .auth/admin.json
REDCAP_SUPER_TOKEN=... node fixture.js   # builds the test projects (API) and enables the module (UI)
npx playwright test              # desktop + mobile
npx playwright show-report       # step-by-step screenshots
node measure.js 5 ALPHA NOREP    # server time + PHP worker memory per Record Home view
```

**Environment:**
- `REDCAP_BASE_URL`: default `http://redcap.local`. It must match `redcap_base_url`.
- `REDCAP_VERSION_DIR`: default `redcap_v17.5.9`.
- `REDCAP_SUPER_TOKEN`: a **super API token of your local instance**. It is used only to create the test projects. Never commit it.
- `CIV_FIXTURE_RECORDS`: default 2000.
- `CIV_DAG_USER`: an existing local user, default `alice`.
- `REDCAP_WEB_CONTAINER`: default `redcap_2023_1_web`, used by `measure.js`.

Re-run `node login-headed.js` when the admin session expires. Global setup stops with "Admin session expired" when it does.

## What the fixture creates (synthetic data only)

Everything goes into `.auth/fixture.json`, which is gitignored and holds the PIDs and project API tokens.

| Thing | Notes |
|---|---|
| Project "CIV E2E - chronological view (2000 records)" | Classic. `visit` (parent: `@PRINCIPAL_DATE`, `@INSTANCESUMMARY`, `@INSTANCETABLE=sample @INSTANCETABLE_REF=sample_visit`), `sample` (child, `@INSTANCESUMMARY_FILTER=1`), `event_log` (no tags) and `labelled` (`@INSTANCELABEL`, `@INSTANCEORDER=descending`), plus "bulk" fields, so that a whole-project load is heavy. See `lib/fixture-data.js` |
| Special records | `5` numeric, `3` holds HTML in a summary field, `ALPHA` (no digits), `A1` (mixed), `QC 7` (space), `NOREP` (no repeating data) |
| DAGs | DAG A (`A1`), DAG B (`1`); `CIV_DAG_USER` gets read-only rights and DAG A. The test uses admin "View project as user" and always switches back |
| Project "CIV E2E - longitudinal" | `visit`/`sample` repeating in two events; records `1`, `2` and `GAMMA` |
| Module | Enabled system-wide (Control Center > External Modules) and on both projects |

Nothing is removed afterwards; the projects are reused across runs. Delete them in the Control Center when you are done.

## Scenarios (`tests/chronological.spec.js`)

| Scenario | Expectation |
|---|---|
| Numeric record | Its own visits, with samples nested and the discarded one filtered out; logs with the default description; labels in descending order; every link opens this record |
| Letters-only record ID | Its own instances, loaded with a single-record query |
| Mixed ID / ID with a space | Its own instances, with URL-encoded links that open the record |
| No repeating data | No table and no JavaScript error |
| HTML in a summary value | Rendered as text |
| Expanded table | Child rows stay inside the table, the page doesn't scroll sideways, and dates stay on one line |
| DAG-restricted user (desktop only) | Only the instances of the record they opened; REDCap returns 403 for a record in another DAG |
| Longitudinal | Instances from both events, for a numeric and a no-digit ID |

Any JavaScript error on Record Home fails the test.
