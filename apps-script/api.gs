/*************************************************
 * YALA — public API (courses list + registration)
 *
 * Lives in its OWN Apps Script project, so that making it
 * public never exposes the back-office functions in Code.gs.
 *
 * Setup: see docs/phase2-api.md
 *   Execute as: Me     |     Who has access: Anyone
 *
 * GET  ?action=courses   → categories + courses + monthly fee
 * POST (body)            → new registration, Status=Pending
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

var REGISTRATION_HEADERS = ['RegistrationID', 'FullName', 'DOB', 'Age', 'Phone', 'Email', 'WhatsApp',
  'Address', 'Courses', 'FrenchOK', 'ArabicOK', 'Under18', 'ParentName', 'ParentPhone',
  'ParentRelation', 'Notes', 'SubmittedAt', 'Status'];

/* ================= ROUTING ================= */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'courses';
  try {
    if (action === 'courses') return json_(catalog_());
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    // Never leak sheet contents in an error message.
    return json_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (parseErr) { body = (e && e.parameter) || {}; }
    } else {
      body = (e && e.parameter) || {};
    }
    return json_(register_(body));
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= COURSES (public read) ================= */

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

  var payload = { ok: true, currency: 'DZD', updated: new Date().toISOString(), categories: categories };
  cache.put('catalog-v1', JSON.stringify(payload), CACHE_SECONDS);
  return payload;
}

/* ================= REGISTRATION (public write) ================= */

function register_(data) {
  // Bots fill every field they see; humans never see this one.
  if (clean_(data.website, 50)) return { ok: false, error: 'rejected' };

  var cache = CacheService.getScriptCache();

  // Global cap: a burst of real registrations looks exactly like an attack.
  var hourKey = 'req-' + Math.floor(Date.now() / 3600000);
  var sentThisHour = Number(cache.get(hourKey) || 0);
  if (sentThisHour >= 40) return { ok: false, error: 'too_many' };

  var name = clean_(data.fullName, 80);
  var phone = digits_(data.phone);
  var email = clean_(data.email, 120);
  var notes = clean_(data.notes, 500);
  var parentName = clean_(data.parentName, 80);
  var parentPhone = digits_(data.parentPhone);
  var parentRelation = clean_(data.parentRelation, 30);
  var dob = parseDate_(data.dob);
  var courses = Array.isArray(data.courses) ? data.courses : [];

  if (name.length < 3) return { ok: false, error: 'name_required' };
  if (!dob) return { ok: false, error: 'dob_invalid' };
  var age = ageOf_(dob);
  if (age < 3 || age > 100) return { ok: false, error: 'dob_invalid' };
  if (phone.length < 8 || phone.length > 15) return { ok: false, error: 'phone_invalid' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return { ok: false, error: 'email_invalid' };
  if (data.consent !== true && data.consent !== 'true') return { ok: false, error: 'consent_required' };

  var allowed = courseNames_();
  var chosen = [];
  for (var i = 0; i < courses.length; i++) {
    var picked = String(courses[i]).trim();
    if (allowed.indexOf(picked) !== -1 && chosen.indexOf(picked) === -1) chosen.push(picked);
  }
  if (!chosen.length) return { ok: false, error: 'courses_required' };

  var under18 = age < 18;
  if (under18 && (parentName.length < 3 || parentPhone.length < 8)) {
    return { ok: false, error: 'parent_required' };
  }

  if (cache.get('reg-' + phone + '-' + hash_(name))) return { ok: false, error: 'too_many' };

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Registrations');
  if (!sheet) return { ok: false, error: 'server_error' };
  var col = columns_(sheet);

  for (var h = 0; h < REGISTRATION_HEADERS.length; h++) {
    if (col[REGISTRATION_HEADERS[h]] === undefined) return { ok: false, error: 'server_error' };
  }

  if (isDuplicate_(sheet, col, name, phone, dob)) return { ok: false, error: 'duplicate' };

  var row = [];
  for (var x = 0; x < sheet.getLastColumn(); x++) row.push('');
  row[col['RegistrationID']] = nextId_(sheet, col['RegistrationID'], 'REG');
  row[col['FullName']] = name;
  row[col['DOB']] = dob;
  row[col['Age']] = age;
  row[col['Phone']] = phone;
  row[col['Email']] = email;
  row[col['WhatsApp']] = phone;
  row[col['Courses']] = chosen.join(', ');
  row[col['Under18']] = under18 ? 'YES' : 'NO';
  row[col['ParentName']] = under18 ? parentName : '';
  row[col['ParentPhone']] = under18 ? parentPhone : '';
  row[col['ParentRelation']] = under18 ? parentRelation : '';
  row[col['Notes']] = notes;
  row[col['SubmittedAt']] = new Date();
  row[col['Status']] = 'Pending';
  sheet.appendRow(row);

  cache.put('reg-' + phone + '-' + hash_(name), '1', 600);
  cache.put(hourKey, String(sentThisHour + 1), 3600);

  return { ok: true, id: row[col['RegistrationID']], under18: under18 };
}

function courseNames_() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config');
  var values = sheet.getDataRange().getValues();
  var head = values[0];
  var idx = -1;
  for (var c = 0; c < head.length; c++) {
    if (String(head[c]).trim() === 'FullCourseName') idx = c;
  }
  if (idx === -1) return [];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var v = String(values[i][idx] || '').trim();
    if (v) out.push(v);
  }
  return out;
}

// Registrations and Students are both checked: a returning student must not slip through.
function isDuplicate_(sheet, col, name, phone, dob) {
  var books = [sheet, SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Students')];
  var key = name.toLowerCase();
  for (var b = 0; b < books.length; b++) {
    var s = books[b];
    if (!s || s.getLastRow() < 2) continue;
    var c2 = columns_(s);
    if (c2['FullName'] === undefined || c2['Phone'] === undefined) continue;
    var rows = s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues();
    for (var i = 0; i < rows.length; i++) {
      var samePhone = digits_(rows[i][c2['Phone']]) === phone;
      var sameName = String(rows[i][c2['FullName']] || '').toLowerCase().trim() === key;
      var sameDob = false;
      if (c2['DOB'] !== undefined && rows[i][c2['DOB']] instanceof Date) {
        sameDob = rows[i][c2['DOB']].toDateString() === dob.toDateString();
      }
      if ((samePhone && sameName) || (sameName && sameDob)) return true;
    }
  }
  return false;
}

function columns_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = {};
  for (var i = 0; i < head.length; i++) col[String(head[i]).trim()] = i;
  return col;
}

function nextId_(sheet, column, prefix) {
  var max = 0;
  if (sheet.getLastRow() > 1) {
    var vals = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = String(vals[i][0]).match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return prefix + '-' + ('0000' + (max + 1)).slice(-4);
}

/* ================= SMALL HELPERS ================= */

function clean_(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function digits_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
}

// Short stable key for a name (cache keys must stay short).
function hash_(value) {
  var h = 5381;
  var s = String(value || '').toLowerCase();
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Accepts "yyyy-mm-dd" (the HTML date input) and "dd/mm/yyyy" (typed by a human).
function parseDate_(value) {
  var s = String(value || '').trim();
  var d = null;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var eu = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (eu) d = new Date(Number(eu[3]), Number(eu[2]) - 1, Number(eu[1]));
  else return null;
  if (isNaN(d.getTime())) return null;
  if (d > new Date()) return null;
  return d;
}

function ageOf_(date) {
  var now = new Date();
  var age = now.getFullYear() - date.getFullYear();
  var m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--;
  return age;
}
