// Phase 11 harness: month-aware balances, payment delete, student edit.
// Usage: node tools/run-tests.js
const fs = require("fs");
const vm = require("vm");

function makeSheet(rows) {
  const values = rows.map(r => r.slice());
  const width = () => values.reduce((w, r) => Math.max(w, r.length), 0);
  const cell = (r, c) => {
    const row = values[r - 1];
    return row && row[c - 1] !== undefined ? row[c - 1] : "";
  };
  const write = (r, c, v) => {
    while (values.length < r) values.push([]);
    const row = values[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = v;
  };
  return {
    values,
    getLastRow: () => values.length,
    getLastColumn: () => width(),
    getDataRange: () => ({
      getValues: () => Array.from({ length: values.length }, (_, i) =>
        Array.from({ length: width() }, (_, j) => cell(i + 1, j + 1)))
    }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
      setValue: (v) => write(r, c, v),
      setValues: (matrix) => {
        for (let i = 0; i < matrix.length; i++) {
          for (let j = 0; j < matrix[i].length; j++) write(r + i, c + j, matrix[i][j]);
        }
      }
    }),
    appendRow: (row) => values.push(row.slice()),
    deleteRow: (r) => { values.splice(r - 1, 1); },
    setFrozenRows: () => {}
  };
}

const monthKey = (offset) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
};
const THIS_MONTH = monthKey(0);
const LAST_MONTH = monthKey(-1);

const COURSE = "Adult Language Courses - English - A1 - English A1";

const tabsFor = () => ({
  Config: makeSheet([
    ["Category", "SubCategory", "SubSubCategory", "CourseName", "FullCourseName",
      "MonthlyFeeDZD", "Room", "CategoryOrder", "SortOrder", "Hidden"],
    ["Adult Language Courses", "English", "A1", "English A1", COURSE, 4000, "Room 2", 1, 1, ""]
  ]),
  Students: makeSheet([
    ["StudentID", "FullName", "Phone", "Email", "Courses", "Status"],
    ["STU-1", "Yasmine", "0550000001", "yasmine@example.com", COURSE, "Active"],
    ["STU-2", "Omar", "0550000002", "", COURSE, "Inactive"]
  ]),
  Payments: makeSheet([
    ["PaymentID", "StudentID", "StudentName", "Amount", "Date", "Method", "Month"],
    ["PAY-1", "STU-1", "Yasmine", 4000, THIS_MONTH + "-05", "Cash", THIS_MONTH],
    ["PAY-2", "STU-1", "Yasmine", 1500, LAST_MONTH + "-05", "Cash", LAST_MONTH],
    ["PAY-3", "STU-2", "Omar", 1000, THIS_MONTH + "-06", "Cash", THIS_MONTH]
  ])
});

function adminFixture() {
  const tabs = tabsFor();
  const ctx = {
    Date, JSON, Number, String, Math, Array, Object, isFinite, isNaN, encodeURIComponent, console,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => tabs[n] || null,
        insertSheet: (n) => (tabs[n] = makeSheet([]))
      })
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@gmail.com" }), getScriptTimeZone: () => "Africa/Algiers" },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          aud: "our.apps.googleusercontent.com", email: "owner@gmail.com", email_verified: "true",
          exp: Math.floor(Date.now() / 1000) + 600
        })
      })
    },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("apps-script/admin.gs", "utf8"), ctx);
  ctx.CLIENT_ID = "our.apps.googleusercontent.com";
  const call = (body) => JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify(Object.assign({ idToken: "t" }, body)) }
  }).text);
  return { ctx, tabs, call };
}

const results = {};
const run = (name, fn) => {
  try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; }
};

run("balances follow the picked month", () => {
  const f = adminFixture();
  const now = f.call({ action: "balances" });
  const last = f.call({ action: "balances", month: LAST_MONTH });
  const junk = f.call({ action: "balances", month: "2026-13" });
  const inject = f.call({ action: "balances", month: "2026-01' OR 1=1" });
  return {
    now, last,
    junkMonth: junk.month, injectMonth: inject.month,
    inactiveHidden: now.rows.every(r => r.studentId !== "STU-2")
  };
});

run("deletePayment removes exactly one row", () => {
  const f = adminFixture();
  const before = f.tabs.Payments.values.length;
  const res = f.call({ action: "deletePayment", paymentId: "PAY-2" });
  const after = f.call({ action: "deletePayment", paymentId: "PAY-2" });
  const empty = f.call({ action: "deletePayment", paymentId: "" });
  const ids = f.tabs.Payments.values.slice(1).map(r => r[0]);
  const balancesNow = f.call({ action: "balances", month: LAST_MONTH });
  return {
    res, after, empty,
    before, afterCount: f.tabs.Payments.values.length, ids,
    lastMonthPaid: balancesNow.rows[0].paid
  };
});

run("editStudent fixes contact and status only", () => {
  const f = adminFixture();
  const res = f.call({
    action: "editStudent", studentId: "STU-1",
    phone: "0550 11 22 33", email: "New@Example.com", status: "inactive"
  });
  const row = f.tabs.Students.values[1];
  const badPhone = f.call({ action: "editStudent", studentId: "STU-1", phone: "123", email: "", status: "Active" });
  const longPhone = f.call({ action: "editStudent", studentId: "STU-1", phone: "1234567890123456", email: "", status: "Active" });
  const badEmail = f.call({ action: "editStudent", studentId: "STU-1", phone: "0550112233", email: "nope@", status: "Active" });
  const badStatus = f.call({ action: "editStudent", studentId: "STU-1", phone: "0550112233", email: "", status: "Deleted" });
  const unknown = f.call({ action: "editStudent", studentId: "STU-9", phone: "0550112233", email: "", status: "Active" });
  const inactiveBalances = f.call({ action: "balances" });
  return {
    res, row, badPhone, longPhone, badEmail, badStatus, unknown,
    hiddenWhenInactive: inactiveBalances.rows.every(r => r.studentId !== "STU-1")
  };
});

const expect = (label, ok, detail) => {
  if (!ok) {
    console.log("FAIL — " + label + ": " + JSON.stringify(detail));
    process.exitCode = 1;
  }
};

const bal = results["balances follow the picked month"];
expect("balances default to this month", typeof bal === "object" && bal.now.ok === true &&
  bal.now.month === THIS_MONTH && bal.now.rows.length === 1 &&
  bal.now.rows[0].due === 4000 && bal.now.rows[0].paid === 4000 && bal.now.rows[0].balance === 0 &&
  bal.inactiveHidden === true, bal);
expect("balances switch to the picked month", typeof bal === "object" && bal.last.ok === true &&
  bal.last.month === LAST_MONTH && bal.last.rows[0].paid === 1500 && bal.last.rows[0].balance === 2500, bal);
expect("balances ignore a bad month", typeof bal === "object" &&
  bal.junkMonth === THIS_MONTH && bal.injectMonth === THIS_MONTH, bal);

const del = results["deletePayment removes exactly one row"];
expect("delete payment", typeof del === "object" && del.res.ok === true &&
  del.res.paymentId === "PAY-2" && del.res.studentName === "Yasmine" &&
  del.res.amount === 1500 && del.res.date === LAST_MONTH + "-05" &&
  del.afterCount === del.before - 1 && del.ids.join(",") === "PAY-1,PAY-3" &&
  del.after.error === "not_found" && del.empty.error === "missing_payment" &&
  del.lastMonthPaid === 0, del);

const edit = results["editStudent fixes contact and status only"];
expect("edit student", typeof edit === "object" && edit.res.ok === true &&
  edit.row[1] === "Yasmine" && edit.row[2] === "0550112233" &&
  edit.row[3] === "new@example.com" && edit.row[5] === "Inactive" &&
  edit.hiddenWhenInactive === true, edit);
expect("edit student rejects bad input", typeof edit === "object" &&
  edit.badPhone.error === "invalid_phone" && edit.longPhone.error === "invalid_phone" &&
  edit.badEmail.error === "invalid_email" && edit.badStatus.error === "invalid_status" &&
  edit.unknown.error === "not_found", edit);

if (!process.exitCode) console.log("OK — " + Object.keys(results).length + " phase-11 checks passed");
