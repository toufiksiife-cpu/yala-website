/*************************************************
 * YALA — public API (read-only)
 *
 * Lives in its OWN Apps Script project, so that making it
 * public never exposes the back-office functions in Code.gs.
 *
 * Setup: see docs/phase2-api.md
 *   Execute as: Me     |     Who has access: Anyone
 *
 * Public endpoints:
 *   GET  ?action=courses   → categories + courses + monthly fee
 *************************************************/

// The school's spreadsheet. Not a secret: it is only reachable by this script,
// which runs as the owner. The sheet itself stays private.
var SPREADSHEET_ID = '1-rQ6H-NzreQ5DAcgqykpGswJ4DXveWP1PrngJbEr3fk';
var CACHE_SECONDS = 300;

// Display order on the website. Anything not listed is appended at the end.
var CATEGORY_ORDER = [
  'Primary School Support',
  'Middle School Support',
  'High School Support',
  'Kids Language Courses',
  'Adult Language Courses',
  'Other Formation Courses'
];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'courses';
  try {
    if (action === 'courses') return json_(catalog_());
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    // Never leak sheet contents in an error message.
    return json_({ ok: false, error: 'server_error', message: String(err) });
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function catalog_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('catalog-v1');
  if (cached) return JSON.parse(cached);

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config');
  if (!sheet) throw new Error('Tab "Config" not found');

  var values = sheet.getDataRange().getValues();
  var head = values[0];
  var col = {};
  for (var c = 0; c < head.length; c++) col[String(head[c]).trim()] = c;

  var required = ['Category', 'SubCategory', 'SubSubCategory', 'CourseName', 'FullCourseName', 'MonthlyFeeDZD', 'Room'];
  for (var r = 0; r < required.length; r++) {
    if (col[required[r]] === undefined) throw new Error('Config is missing the column "' + required[r] + '"');
  }

  var byCategory = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var full = String(row[col['FullCourseName']] || '').trim();
    var category = String(row[col['Category']] || '').trim();
    if (!full || !category) continue; // skips the SettingName/SettingValue rows

    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({
      name: String(row[col['CourseName']] || '').trim(),
      full: full,
      subject: String(row[col['SubCategory']] || '').trim(),
      level: String(row[col['SubSubCategory']] || '').trim(),
      fee: Number(row[col['MonthlyFeeDZD']]) || 0,
      room: String(row[col['Room']] || '').trim()
    });
  }

  var categories = [];
  for (var o = 0; o < CATEGORY_ORDER.length; o++) {
    if (byCategory[CATEGORY_ORDER[o]]) {
      categories.push({ key: CATEGORY_ORDER[o], courses: byCategory[CATEGORY_ORDER[o]] });
    }
  }
  for (var k in byCategory) {
    if (CATEGORY_ORDER.indexOf(k) === -1) categories.push({ key: k, courses: byCategory[k] });
  }

  var payload = {
    ok: true,
    currency: 'DZD',
    updated: new Date().toISOString(),
    categories: categories
  };
  cache.put('catalog-v1', JSON.stringify(payload), CACHE_SECONDS);
  return payload;
}
