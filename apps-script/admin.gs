/*************************************************
 * YALA — staff API (private)
 *
 * Lives in its OWN Apps Script project: "YALA ADMIN".
 * Setup: see docs/phase4-admin.md
 *   Execute as: Me     |     Who has access: Anyone with a Google account
 *
 * Every request must carry a Google ID token. The token is verified with Google,
 * then the email must be listed in the Staff tab. Nobody else gets a single row.
 *
 * GET  ?action=config                     → { ok, clientId }  (public, no data)
 * POST {action:'list', tab, idToken}      → rows of that tab
 *************************************************/

var SPREADSHEET_ID = '1-rQ6H-NzreQ5DAcgqykpGswJ4DXveWP1PrngJbEr3fk';

// Paste the OAuth client ID from Google Cloud (docs/phase4-admin.md step 2).
var CLIENT_ID = '';

var STAFF_SHEET = 'Staff';
var ALLOWED_TABS = ['Registrations', 'Students'];
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

/* ================= DATA (read only) ================= */

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
