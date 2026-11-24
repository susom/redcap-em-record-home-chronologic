// Synthetic test project for the Chronological Instance View EM. No real data.
//
// Forms (classic project, one event):
//   demographics  non-repeating
//   visit         repeating, PARENT: @PRINCIPAL_DATE, @INSTANCESUMMARY, and a descriptive field with
//                 @INSTANCETABLE=sample @INSTANCETABLE_REF=sample_visit
//   sample        repeating, CHILD of visit (sample_visit = visit instance), @INSTANCESUMMARY_FILTER=1
//   event_log     repeating, no action tags (shown with the default "EVENT_LOG: <n>" description)
//   labelled      repeating, @INSTANCELABEL + @INSTANCEORDER=descending
// Every repeating form also has "bulk" fields the module never shows, so a whole-project load is heavy.

const NUMERIC_RECORDS = Number(process.env.CIV_FIXTURE_RECORDS || 2000);

const f = (field_name, form_name, field_type, field_label, extra = {}) => ({
  field_name, form_name, section_header: '', field_type, field_label,
  select_choices_or_calculations: '', field_note: '', text_validation_type_or_show_slider_number: '',
  text_validation_min: '', text_validation_max: '', identifier: '', branching_logic: '',
  required_field: '', custom_alignment: '', question_number: '', matrix_group_name: '',
  matrix_ranking: '', field_annotation: '', ...extra,
});

const bulk = (prefix, form, n) =>
  Array.from({ length: n }, (_, i) => f(`${prefix}_bulk_${i + 1}`, form, 'text', `${prefix} bulk ${i + 1}`));

const METADATA = [
  f('record_id', 'demographics', 'text', 'Record ID'),
  f('dem_initials', 'demographics', 'text', 'Initials'),

  f('visit_date', 'visit', 'text', 'Visit date', { text_validation_type_or_show_slider_number: 'date_ymd', field_annotation: '@PRINCIPAL_DATE' }),
  f('visit_type', 'visit', 'dropdown', 'Visit type', { select_choices_or_calculations: '1, Screening | 2, Baseline | 3, Follow-up', field_annotation: '@INSTANCESUMMARY' }),
  f('visit_note', 'visit', 'text', 'Visit note', { field_annotation: '@INSTANCESUMMARY' }),
  f('visit_samples', 'visit', 'descriptive', 'Samples taken at this visit', { field_annotation: '@INSTANCETABLE=sample @INSTANCETABLE_REF=sample_visit' }),
  ...bulk('visit', 'visit', 6),

  f('sample_visit', 'sample', 'text', 'Visit instance', { text_validation_type_or_show_slider_number: 'integer' }),
  f('sample_date', 'sample', 'text', 'Sample date', { text_validation_type_or_show_slider_number: 'date_ymd', field_annotation: '@PRINCIPAL_DATE' }),
  f('sample_type', 'sample', 'radio', 'Sample type', { select_choices_or_calculations: '1, Blood | 2, Saliva | 3, Tissue', field_annotation: '@INSTANCESUMMARY' }),
  f('sample_status', 'sample', 'dropdown', 'Sample status', { select_choices_or_calculations: '1, Active | 0, Discarded', field_annotation: '@INSTANCESUMMARY_FILTER=1' }),
  ...bulk('sample', 'sample', 4),

  f('log_text', 'event_log', 'text', 'Log entry'),
  ...bulk('log', 'event_log', 2),

  f('lab_name', 'labelled', 'text', 'Lab name', { field_annotation: '@INSTANCELABEL @INSTANCEORDER=descending' }),
  f('lab_value', 'labelled', 'text', 'Lab value', { field_annotation: '@INSTANCESUMMARY' }),
];

const REPEATING = ['visit', 'sample', 'event_log', 'labelled'].map((form_name) => ({ form_name, custom_form_label: '' }));

const FIELDS = METADATA.filter((m) => m.field_type !== 'descriptive').map((m) => m.field_name);
const FORMS = [...new Set(METADATA.map((m) => m.form_name))];
const CSV_COLUMNS = ['record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance',
  ...FIELDS.filter((x) => x !== 'record_id'), ...FORMS.map((x) => `${x}_complete`)];

const pad = (n) => String(n).padStart(2, '0');
const day = (base, plus) => { const d = new Date(Date.UTC(...base)); d.setUTCDate(d.getUTCDate() + plus); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const filler = (tag) => `synthetic-${tag}-lorem-ipsum-dolor-sit-amet`;

// One record in REDCap's flat CSV shape (one row per non-repeating form set + one row per instance).
function recordRows(id, { visits = [], samples = [], logs = [], labs = [], note = {} } = {}) {
  const rows = [{ record_id: id, dem_initials: 'ZZ', demographics_complete: '2' }];
  visits.forEach((date, i) => rows.push({
    record_id: id, redcap_repeat_instrument: 'visit', redcap_repeat_instance: i + 1,
    visit_date: date, visit_type: String((i % 3) + 1), visit_note: note[i + 1] ?? `note ${i + 1}`,
    ...Object.fromEntries(Array.from({ length: 6 }, (_, k) => [`visit_bulk_${k + 1}`, filler(`v${k}`)])),
    visit_complete: '2',
  }));
  samples.forEach((s, i) => rows.push({
    record_id: id, redcap_repeat_instrument: 'sample', redcap_repeat_instance: i + 1,
    sample_visit: String(s.visit), sample_date: s.date, sample_type: String(s.type), sample_status: String(s.status),
    ...Object.fromEntries(Array.from({ length: 4 }, (_, k) => [`sample_bulk_${k + 1}`, filler(`s${k}`)])),
    sample_complete: '2',
  }));
  logs.forEach((t, i) => rows.push({
    record_id: id, redcap_repeat_instrument: 'event_log', redcap_repeat_instance: i + 1,
    log_text: t, log_bulk_1: filler('l1'), log_bulk_2: filler('l2'), event_log_complete: '2',
  }));
  labs.forEach((l, i) => rows.push({
    record_id: id, redcap_repeat_instrument: 'labelled', redcap_repeat_instance: i + 1,
    lab_name: l.name, lab_value: l.value, labelled_complete: '2',
  }));
  return rows;
}

// A typical numeric record: 3 visits, 2 samples per visit (one discarded), 2 log entries, 2 labs.
function numericRecord(n, note) {
  const base = [2020, 0, 1 + (n % 28)];
  const visits = [day(base, 0), day(base, 30), day(base, 60)];
  const samples = visits.flatMap((d, v) => [
    { visit: v + 1, date: day([2020, 0, 1 + (n % 28)], v * 30 + 1), type: 1, status: 1 },
    { visit: v + 1, date: day([2020, 0, 1 + (n % 28)], v * 30 + 2), type: 2, status: v === 1 ? 0 : 1 },
  ]);
  return recordRows(String(n), {
    visits, samples, logs: ['first log', 'second log'],
    labs: [{ name: `lab-a-${n}`, value: 'A' }, { name: `lab-b-${n}`, value: 'B' }], note,
  });
}

// The records the spec looks at (besides the bulk numeric ones). IDs are synthetic.
const HTML_VALUE = '<img src=x onerror="window.__civHtmlRan=(window.__civHtmlRan||0)+1">';
const SPECIAL = {
  numeric: '5',        // ordinary record: the table must be unchanged by the fix
  html: '3',           // a summary value containing HTML
  lettersOnly: 'ALPHA', // no digits
  mixed: 'A1',         // letters and digits
  withSpace: 'QC 7',   // a space: links must be URL-encoded
  noRepeating: 'NOREP', // no repeating data at all
};

function specialRecords() {
  return [
    ...recordRows(SPECIAL.lettersOnly, {
      visits: ['2002-02-01', '2002-03-01'],
      samples: [{ visit: 1, date: '2002-02-02', type: 3, status: 1 }, { visit: 2, date: '2002-03-02', type: 1, status: 1 }],
      logs: ['alpha log'],
    }),
    ...recordRows(SPECIAL.mixed, {
      visits: ['2001-01-01'], samples: [{ visit: 1, date: '2001-01-02', type: 3, status: 1 }],
    }),
    ...recordRows(SPECIAL.withSpace, { visits: ['2003-03-03'] }),
    ...recordRows(SPECIAL.noRepeating),
  ];
}

function allRows() {
  const rows = [];
  for (let n = 1; n <= NUMERIC_RECORDS; n++) {
    rows.push(...numericRecord(n, n === Number(SPECIAL.html) ? { 1: HTML_VALUE } : undefined));
  }
  return rows.concat(specialRecords());
}

function toCsv(rows) {
  const esc = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(','))].join('\n');
}

module.exports = { METADATA, REPEATING, SPECIAL, HTML_VALUE, NUMERIC_RECORDS, allRows, toCsv };
