/*************************************************
 * YALA — staff API (private)
 *
 * Lives in its OWN Apps Script project: "YALA ADMIN".
 * Setup: see docs/phase4-admin.md
 *   Execute as: Me     |     Who has access: Anyone
 *
 * Every request must carry a Google ID token. The token is verified with Google,
 * then the email must be listed in the Staff tab. Nobody else gets a single row.
 *
 * GET  ?action=config                      → { ok, clientId }  (public, no data)
 * POST {action:'list', tab, idToken}       → rows of that tab
 * POST {action:'schema', idToken}          → what the sheets look like
 * POST {action:'approve', regId, idToken}  → registration → student + enrollments
 * POST {action:'pay', studentId, amount, idToken} → payment row
 *************************************************/

var SPREADSHEET_ID = '1-rQ6H-NzreQ5DAcgqykpGswJ4DXveWP1PrngJbEr3fk';

// Paste the OAuth client ID from Google Cloud (docs/phase4-admin.md).
var CLIENT_ID = '371709392677-1ols2p8ivea9grdmp6ff5giojdof45lj.apps.googleusercontent.com';

var STAFF_SHEET = 'Staff';
var ALLOWED_TABS = ['Registrations', 'Students', 'Payments'];
var MAX_ROWS = 500;

/* ================= ROUTING ================= */

function doGet(e) {
  // The OAuth client ID is public by design (it is visible in every sign-in button).
  if ((e && e.parameter && e.parameter.action) === 'config') {
    return json_({ ok: true, clientId: CLIENT_ID });
  }
  return json_({ ok: false, error: 'use_post' });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    } else {
      body = (e && e.parameter) || {};
    }

    var email = verify_(body.idToken);
    if (!email) return json_({ ok: false, error: 'unauthorized' });
    if (!isStaff_(email)) return json_({ ok: false, error: 'forbidden', email: email });

    var action = body.action || '';
    if (action === 'list') return json_(list_(body.tab));
    if (action === 'schema') return json_(schema_());
    if (action === 'approve') return json_(approve_(body, email));
    if (action === 'pay') return json_(pay_(body, email));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= AUTH ================= */

// Returns the verified email, or '' for anything we cannot prove.
// Deliberately no local cache: a cache keyed by a token hash could collide and
// hand one staff member another's identity. One call per screen load is nothing.
function verify_(idToken) {
  if (!idToken) return '';
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return '';
    var p = JSON.parse(res.getContentText());
    var fresh = Number(p.exp) * 1000 > Date.now();
    // aud must be our app: a token issued for another site is useless here.
    if (p.aud !== CLIENT_ID || String(p.email_verified) !== 'true' || !fresh) return '';
    return String(p.email || '').toLowerCase();
  } catch (err) {
    return '';
  }
}

function isStaff_(email) {
  var sheet = staffSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iEmail = head.indexOf('email');
  var iActive = head.indexOf('active');
  if (iEmail === -1) return false;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][iEmail]).trim().toLowerCase() !== email) continue;
    if (iActive === -1) return true;
    var v = String(values[i][iActive]).trim().toLowerCase();
    return v === '' || v === 'yes' || v === 'true' || v === '1';
  }
  return false;
}

// Created on first use, owner already inside: a missing tab can never lock everyone out.
function staffSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(STAFF_SHEET);
  if (sheet) return sheet;

  sheet = ss.insertSheet(STAFF_SHEET);
  sheet.appendRow(['Email', 'Name', 'Active']);
  sheet.appendRow([Session.getEffectiveUser().getEmail(), 'Owner', 'YES']);
  sheet.setFrozenRows(1);
  return sheet;
}

/* ================= DATA (read) ================= */

function list_(tab) {
  if (ALLOWED_TABS.indexOf(tab) === -1) return { ok: false, error: 'unknown_tab' };

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(tab);
  if (!sheet) return { ok: false, error: 'missing_tab' };

  var total = sheet.getLastRow();
  var lastRow = Math.min(total, MAX_ROWS + 1);
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok: true, tab: tab, headers: [], rows: [], truncated: false };

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = values[i][c];
      if (v instanceof Date) v = cellDate_(v);
      obj[headers[c]] = v === null ? '' : v;
      if (v !== '') empty = false;
    }
    if (!empty) rows.push(obj);
  }

  return {
    ok: true,
    tab: tab,
    headers: headers.filter(function (h) { return h !== ''; }),
    rows: rows,
    truncated: total > MAX_ROWS + 1
  };
}

// Sheets cells lose the time when it is exactly midnight, so DOB stays clean.
function cellDate_(d) {
  var hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
  var pattern = (hh || mm || ss) ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd';
  return Utilities.formatDate(d, 'Africa/Algiers', pattern);
}

/* ================= SCHEMA ================= */

// Every write checks the columns it needs before touching a row, so a renamed
// column gives a clear message instead of a half-filled row.
var FIELDS = {
  Students: {
    id: ['studentid', 'id', 'studentcode'],
    name: ['fullname', 'name', 'studentname'],
    phone: ['phone', 'phonenumber', 'telephone', 'mobile', 'whatsapp'],
    email: ['email', 'mail'],
    dob: ['dob', 'dateofbirth', 'birthdate'],
    age: ['age'],
    parentName: ['parentname', 'guardianname'],
    parentPhone: ['parentphone', 'guardianphone'],
    parentRelation: ['parentrelation', 'relation', 'relationship'],
    under18: ['under18', 'minor'],
    courses: ['courses', 'course'],
    status: ['status', 'studentstatus'],
    created: ['registeredat', 'createdat', 'registrationdate', 'enrolledat', 'created']
  },
  Enrollments: {
    id: ['enrollmentid', 'id', 'enrollmentcode'],
    studentId: ['studentid', 'student'],
    course: ['course', 'coursename', 'fullcoursename'],
    fee: ['monthlyfeedzd', 'monthlyfee', 'fee', 'price'],
    start: ['startdate', 'start', 'date'],
    status: ['status', 'enrollmentstatus']
  },
  Payments: {
    id: ['paymentid', 'id', 'paymentcode'],
    studentId: ['studentid', 'student'],
    studentName: ['studentname', 'fullname', 'name'],
    amount: ['amount', 'amountdzd', 'paid', 'total'],
    date: ['date', 'paymentdate', 'paidat', 'paidon'],
    method: ['method', 'paymentmethod', 'mode'],
    month: ['month', 'period', 'formonth'],
    note: ['note', 'notes', 'comment'],
    by: ['recordedby', 'receivedby', 'staff', 'createdby'],
    at: ['recordedat', 'createdat', 'timestamp', 'created']
  },
  Registrations: {
    id: ['registrationid', 'id'],
    status: ['status'],
    name: ['fullname', 'name'],
    dob: ['dob', 'dateofbirth'],
    age: ['age'],
    phone: ['phone'],
    email: ['email'],
    whatsapp: ['whatsapp'],
    courses: ['courses', 'course'],
    under18: ['under18', 'minor'],
    parentName: ['parentname'],
    parentPhone: ['parentphone'],
    parentRelation: ['parentrelation'],
    notes: ['notes', 'note'],
    by: ['approvedby'],
    at: ['approvedat']
  }
};

function schema_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tabs = {};
  var problems = [];
  var names = ['Registrations', 'Students', 'Enrollments', 'Payments'];

  for (var t = 0; t < names.length; t++) {
    var name = names[t];
    var sheet = ss.getSheetByName(name);
    var headers = sheet ? headerRow_(sheet).filter(function (h) { return h !== ''; }) : [];
    tabs[name] = { exists: !!sheet, headers: headers };

    var need = name === 'Students' ? ['name']
      : name === 'Enrollments' ? ['studentId', 'course']
      : name === 'Payments' ? ['amount']
      : ['id', 'status'];
    for (var f = 0; f < need.length; f++) {
      if (!sheet) { problems.push(name + ' tab is missing'); break; }
      if (colOf_(headers, need[f], name) === -1) {
        problems.push(name + ' has no column for "' + need[f] + '" (tried: ' + FIELDS[name][need[f]].join(', ') + ')');
      }
    }
  }
  return { ok: true, tabs: tabs, problems: problems };
}

/* ================= APPROVE A REGISTRATION ================= */

function approve_(body, email) {
  var regId = String(body.regId || '').trim();
  if (!regId) return { ok: false, error: 'missing_registration' };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reg = ss.getSheetByName('Registrations');
  if (!reg) return { ok: false, error: 'missing_tab', tab: 'Registrations' };

  var regHead = headerRow_(reg);
  var iId = colOf_(regHead, 'id', 'Registrations');
  var iStatus = colOf_(regHead, 'status', 'Registrations');
  if (iId === -1) return missing_('Registrations', 'RegistrationID', regHead);
  if (iStatus === -1) return missing_('Registrations', 'Status', regHead);

  var rows = reg.getDataRange().getValues();
  var r = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iId]).trim().toUpperCase() === regId.toUpperCase()) { r = i; break; }
  }
  if (r === -1) return { ok: false, error: 'not_found' };
  if (/^approved$/i.test(String(rows[r][iStatus]).trim())) return { ok: false, error: 'already_approved' };

  var value = function (field) {
    var c = colOf_(regHead, field, 'Registrations');
    return c === -1 ? '' : rows[r][c];
  };
  var name = String(value('name')).trim();
  var phone = digits_(value('phone'));
  var dob = value('dob');
  if (!name) return { ok: false, error: 'missing_name' };

  var students = ss.getSheetByName('Students');
  if (!students) return { ok: false, error: 'missing_tab', tab: 'Students' };
  var stuHead = headerRow_(students);
  if (colOf_(stuHead, 'name', 'Students') === -1) return missing_('Students', 'FullName', stuHead);

  // Same child already in the Sheet: report it, write nothing.
  var existing = findStudent_(students, stuHead, name, phone, dob);
  if (existing) {
    return { ok: false, error: 'student_exists', studentId: existing.id, name: existing.name };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    // Re-read inside the lock: two clicks must not create two students.
    var again = findStudent_(students, stuHead, name, phone, dob);
    if (again) return { ok: false, error: 'student_exists', studentId: again.id, name: again.name };

    var courses = String(value('courses')).split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; });

    var warnings = [];
    var studentId = put_(students, 'Students', [
      ['name', name],
      ['phone', phone],
      ['email', String(value('email')).trim()],
      ['dob', dob],
      ['age', value('age')],
      ['parentName', String(value('parentName')).trim()],
      ['parentPhone', digits_(value('parentPhone'))],
      ['parentRelation', String(value('parentRelation')).trim()],
      ['under18', String(value('under18')).trim()],
      ['courses', courses.join(', ')],
      ['status', 'Active'],
      ['created', new Date()]
    ], 'STU');
    if (!studentId) warnings.push('Students has no ID column, so the student has no StudentID.');

    var enrollments = ss.getSheetByName('Enrollments');
    var enrollmentIds = [];
    if (!courses.length) {
      warnings.push('The registration has no course, so no enrollment was created.');
    } else if (!enrollments) {
      warnings.push('No Enrollments tab: the courses were not recorded there.');
    } else {
      var enrHead = headerRow_(enrollments);
      if (colOf_(enrHead, 'studentId', 'Enrollments') === -1 || colOf_(enrHead, 'course', 'Enrollments') === -1) {
        warnings.push('Enrollments has no StudentID/Course column: the courses were not recorded there.');
      } else {
        for (var c = 0; c < courses.length; c++) {
          enrollmentIds.push(put_(enrollments, 'Enrollments', [
            ['studentId', studentId],
            ['course', courses[c]],
            ['fee', feeOf_(courses[c])],
            ['start', new Date()],
            ['status', 'Active']
          ], 'ENR') || '');
        }
      }
    }

    // Audit trail. These two columns are ours, so adding them is safe.
    reg.getRange(r + 1, iStatus + 1).setValue('Approved');
    var iBy = ensureColumn_(reg, regHead, 'by', 'ApprovedBy');
    var iAt = ensureColumn_(reg, regHead, 'at', 'ApprovedAt');
    if (iBy !== -1) reg.getRange(r + 1, iBy + 1).setValue(email);
    if (iAt !== -1) reg.getRange(r + 1, iAt + 1).setValue(new Date());

    return {
      ok: true,
      registrationId: regId,
      studentId: studentId,
      enrollments: enrollmentIds.filter(function (x) { return x; }),
      warnings: warnings
    };
  } finally {
    lock.releaseLock();
  }
}

function findStudent_(sheet, head, name, phone, dob) {
  var iName = colOf_(head, 'name', 'Students');
  var iPhone = colOf_(head, 'phone', 'Students');
  var iDob = colOf_(head, 'dob', 'Students');
  var iId = colOf_(head, 'id', 'Students');
  if (iName === -1 || sheet.getLastRow() < 2) return null;

  var key = name.toLowerCase();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    var sameName = String(values[i][iName] || '').toLowerCase().trim() === key;
    if (!sameName) continue;
    var samePhone = iPhone !== -1 && phone !== '' && digits_(values[i][iPhone]) === phone;
    var sameDob = false;
    if (iDob !== -1 && values[i][iDob] instanceof Date && dob instanceof Date) {
      sameDob = values[i][iDob].toDateString() === dob.toDateString();
    }
    if (samePhone || sameDob) {
      return { id: iId === -1 ? '' : String(values[i][iId]).trim(), name: name };
    }
  }
  return null;
}

/* ================= RECORD A PAYMENT ================= */

function pay_(body, email) {
  var studentId = String(body.studentId || '').trim();
  var amount = Number(body.amount);
  if (!studentId) return { ok: false, error: 'missing_student' };
  if (!(amount > 0) || amount > 1000000) return { ok: false, error: 'invalid_amount' };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var students = ss.getSheetByName('Students');
  if (!students) return { ok: false, error: 'missing_tab', tab: 'Students' };
  var stuHead = headerRow_(students);
  var iSid = colOf_(stuHead, 'id', 'Students');
  var iName = colOf_(stuHead, 'name', 'Students');
  if (iSid === -1) return missing_('Students', 'StudentID', stuHead);

  var studentName = '';
  var found = false;
  var values = students.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][iSid]).trim() === studentId) {
      studentName = iName === -1 ? '' : String(values[i][iName] || '').trim();
      found = true;
      break;
    }
  }
  if (!found) return { ok: false, error: 'not_found' };

  var payments = ss.getSheetByName('Payments');
  if (!payments) return { ok: false, error: 'missing_tab', tab: 'Payments' };
  var payHead = headerRow_(payments);
  if (colOf_(payHead, 'amount', 'Payments') === -1) return missing_('Payments', 'Amount', payHead);

  var date = parseDate_(body.date) || new Date();

  // A double-submit or a stuck button must not take the money twice.
  var cache = CacheService.getScriptCache();
  var guard = 'pay-' + studentId + '-' + amount + '-' + Utilities.formatDate(date, 'Africa/Algiers', 'yyyyMMdd');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  var paymentId = '';
  try {
    // Inside the lock: two clicks that arrive together cannot both pass this.
    if (cache.get(guard)) return { ok: false, error: 'duplicate_payment' };
    paymentId = put_(payments, 'Payments', [
      ['studentId', studentId],
      ['studentName', studentName],
      ['amount', amount],
      ['date', date],
      ['method', String(body.method || '').trim().slice(0, 30)],
      ['month', String(body.month || '').trim().slice(0, 20)],
      ['note', String(body.note || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200)],
      ['by', email],
      ['at', new Date()]
    ], 'PAY');
    cache.put(guard, '1', 120);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, paymentId: paymentId, studentId: studentId, studentName: studentName, amount: amount, date: cellDate_(date) };
}

/* ================= SMALL HELPERS ================= */

function headerRow_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

function colOf_(head, field, tab) {
  var aliases = FIELDS[tab][field];
  for (var i = 0; i < head.length; i++) {
    var h = String(head[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aliases.indexOf(h) !== -1) return i;
  }
  return -1;
}

function missing_(tab, column, head) {
  return { ok: false, error: 'missing_column', tab: tab, column: column, headers: head.filter(function (h) { return h !== ''; }) };
}

// Appends one row, filling only the columns this sheet actually has.
function put_(sheet, tab, pairs, prefix) {
  var head = headerRow_(sheet);
  var row = head.map(function () { return ''; });

  var iId = colOf_(head, 'id', tab);
  if (iId !== -1) row[iId] = nextId_(sheet, iId, prefix);

  for (var p = 0; p < pairs.length; p++) {
    var c = colOf_(head, pairs[p][0], tab);
    if (c !== -1) row[c] = pairs[p][1];
  }
  sheet.appendRow(row);
  return iId === -1 ? '' : row[iId];
}

function ensureColumn_(sheet, head, field, title) {
  var i = colOf_(head, field, 'Registrations');
  if (i !== -1) return i;
  i = head.length;
  sheet.getRange(1, i + 1).setValue(title);
  head.push(title);
  return i;
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

function feeOf_(courseName) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config');
  if (!sheet) return '';
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var iFull = head.indexOf('FullCourseName');
  var iFee = head.indexOf('MonthlyFeeDZD');
  if (iFull === -1 || iFee === -1) return '';
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][iFull]).trim() === courseName) return Number(values[i][iFee]) || 0;
  }
  return '';
}

function digits_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
}

function parseDate_(value) {
  var s = String(value || '').trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var eu = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  var d = null;
  if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (eu) d = new Date(Number(eu[3]), Number(eu[2]) - 1, Number(eu[1]));
  if (!d || isNaN(d.getTime())) return null;
  if (d > new Date()) return null;
  return d;
}
