# 2026-11-24: record ID handling, bounded data load, output escaping

Branch `fix/record-id-whole-project-load`.

## Problem

- **The record ID was cut down to digits.** On Record Home the module read the ID with `filter_var($_GET['id'], FILTER_SANITIZE_NUMBER_INT)`, which keeps only digits, `+` and `-`. For IDs that contain letters, the table was built for a different ID.
- **No digits meant the whole project.** For an ID with no digits at all, the module called `REDCap::getData('array', '')`. REDCap treats an empty record as **all records** (REDCap 17.5.9 `Records.php` ~L1995-2005), so one page view loaded every record of the project, and then showed nothing.
- **Nothing limited the load.** The class file set `memory_limit -1`, `max_execution_time 0` and `set_time_limit(0)`. Those run on every page of every project with the module enabled, because the class loads for `redcap_every_page_top`.
- **Smaller defects:**
  - Table values went into the page unescaped.
  - A record with no repeating data threw a JavaScript `TypeError`.
  - Expanded child rows made the page scroll sideways.
  - Many lookups logged "Undefined array key" warnings.

## What changed

**`ChronologicalInstanceView.php`:**
- **Record ID:** read it the way Record Home does (`strip_tags(label_decode())` plus the double-data-entry suffix), and skip empty IDs.
- **Data load:**
  - `REDCap::getData` gets `'records' => [$id]` and only the fields the table uses: tagged fields, parent-instance fields, and each form's `_complete`, so untagged repeating forms keep their rows.
  - The file-scope limit overrides are removed.
  - The constructor is removed; the hook sets up the project. The module scanner flags constructors, and this one built a `\Project` on every page.
- **Output:**
  - Table values are escaped once (`ExternalModules::escape()` plus `JSON_HEX_*`), and choice labels are shown as plain text. Framework v1 doesn't forward `$this->escape()`.
  - Record names in links are URL-encoded.
- **Edge cases:** nothing is rendered when there is no repeating data, and parent instances excluded by `@INSTANCESUMMARY_FILTER` are skipped, as children already were.
- **Layout:** child rows use a 95% width (they were 100% plus a 5% indent), and dates don't wrap on phones.
- **Logging:** debug lines log counts and metadata, not record values, and no longer build `print_r()` strings. `isset()`/`??` replace lookups that warned.

**`e2e/`:** a Playwright suite (see [e2e/README.md](../e2e/README.md)).

**Intended behavior changes:**
- IDs with letters show their own instances.
- HTML in values shows as text, and choice-label formatting tags are dropped.
- Filtered-out parent instances no longer produce a row.
- The module runs under the server's PHP memory and time limits.

**Numeric IDs are unchanged:** for records 1, 3, 5 and 7 (classic) and 1 and 2 (longitudinal), the rendered table is identical to `main` after HTML decoding.

## Evidence (local redcap-docker-compose, REDCap 17.5.9, synthetic data)

The fixture has 2,004 records with repeating parent/child forms. Measurements come from `node measure.js`: server time is the navigation request→response time, and memory is the RSS growth of the Apache worker.

| Record | `main` | This branch |
|---|---|---|
| `5` (numeric) | 107 ms, +0 MiB, its 7 rows | 99 ms, +0 MiB, the same 7 rows |
| `ALPHA` (no digits) | 1,024 ms, +50 MiB, empty table | 95 ms, +0 MiB, its 3 rows |
| `NOREP` (no repeating data) | 959 ms, +46 MiB, JS `TypeError` | 97 ms, +0 MiB, no table, no error |
| `A1` (letters and digits) | another record's rows | its 1 row |
| `QC 7` (space) | another record's rows | its 1 row, links to `id=QC%207` |

The cost of the no-digit case grows with the size of the project.

**Checks:**
- **E2E** (`npx playwright test`, desktop and mobile): 17 passed, 1 skipped (the DAG scenario runs on desktop only). On `main`, all of the ID, rendering, layout and longitudinal scenarios fail; only "numeric record" passes.
- **REDCap module security scan** (`php ExternalModules/bin/scan.php <clean git archive>`): "The scan completed successfully, and no issues were detected!"
- **Lint:** `php -l` is clean on PHP 8.4 and on the REDCap container's PHP, and `config.json` parses.

## Follow-ups (not in this change)

- The header "expand all" button is a 16 px tap target on phones.
- From reading the code, not tested:
  - `@INSTANCESUMMARY` on a calc field shows nothing, because the parser treats the equation as choices;
  - choice labels containing `", "` are cut at the comma.
- The module declares no `framework-version` (it runs as v1).
