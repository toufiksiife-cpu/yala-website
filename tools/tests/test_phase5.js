// Phase 5 harness: approve_ / pay_ / schema_ in apps-script/admin.gs against a fake spreadsheet.
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync("apps-script/admin.gs", "utf8");

function makeSheet(rows) {
  const values = rows.map(r => r.slice());
  const width = () => values.reduce((w, r) => Math.max(w, r.length), 0);
  const cell = (r, c) => {
    const row = values[r - 1];
    return row && row[c - 1] !== undefined ? row[c - 1] : "";
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
      setValue: (v) => {
        while (values.length < r) values.push([]);
        const row = values[r - 1];
        while (row.length < c) row.push("");
        row[c - 1] = v;
      }
    }),
    appendRow: (row) => values.push(row.slice()),
    setFrozenRows: () => {}
  };
}

const pad = (n) => ("0" + n).slice(-2);
function fmt(d, pattern) {
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
  if (pattern === "yyyyMMdd") return "" + y + m + day;
  if (pattern === "yyyy-MM-dd") return y + "-" + m + "-" + day;
  return y + "-" + m + "-" + day + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const HEAD = ["StudentID", "FullName", "Phone", "Email", "DOB", "Age", "ParentName", "ParentPhone", "ParentRelation", "Under18", "Courses", "Status", "RegisteredAt"];

function fixture(overrides) {
  const tabs = {
    Staff: makeSheet([["Email", "Name", "Active"], ["owner@gmail.com", "Owner", "YES"]]),
    Registrations: makeSheet([
      ["Registration ID", "Full Name", "Phone", "Email", "DOB", "Age", "Courses", "Under18", "ParentName", "ParentPhone", "ParentRelation", "Status", "SubmittedAt"],
      ["REG-0001", "Yacine Benali", "0551 234 567", "yacine@example.com", new Date(2012, 4, 3), 14, "English A1, French A2", "YES", "Karim Benali", "0661 111 222", "Father", "Pending", new Date(2026, 9, 29, 10, 30)],
      ["REG-0002", "Sara Test", "0770 000 111", "", new Date(2015, 1, 2), 11, "Arabic Literacy", "YES", "", "", "", "Pending", new Date(2026, 9, 30)],
      ["REG-0003", "Done Already", "0555 999 888", "", "", "", "English A1", "NO", "", "", "", "Approved", ""]
    ]),
    Students: makeSheet([HEAD]),
    Enrollments: makeSheet([["EnrollmentID", "StudentID", "Course", "MonthlyFeeDZD", "StartDate", "Status"]]),
    Payments: makeSheet([["PaymentID", "StudentID", "StudentName", "Amount", "Date", "Method", "Month", "Note", "RecordedBy", "RecordedAt"]]),
    Config: makeSheet([
      ["FullCourseName", "MonthlyFeeDZD"],
      ["English A1", 2500],
      ["French A2", 3000],
      ["Arabic Literacy", 1800]
    ])
  };
  Object.assign(tabs, overrides || {});
  Object.keys(tabs).forEach(k => { if (!tabs[k]) delete tabs[k]; });

  const cache = new Map();
  const ctx = {
    Date, JSON, Number, String, Math, encodeURIComponent, console,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => tabs[n] || null,
        insertSheet: (n) => (tabs[n] = makeSheet([["Email", "Name", "Active"]]))
      })
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@gmail.com" }) },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          aud: ctx.CLIENT_ID,
          email: "owner@gmail.com",
          email_verified: "true",
          exp: Math.floor(Date.now() / 1000) + 600
        })
      })
    },
    Utilities: { formatDate: fmt },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) || null,
        put: (k, v) => cache.set(k, v)
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.CLIENT_ID = "our.apps.googleusercontent.com";
  const call = (body) => JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify(body.idToken === undefined ? Object.assign({ idToken: "t" }, body) : body) }
  }).text);
  return { ctx, tabs, call };
}

const found = (sheet) => sheet.getDataRange().getValues();
const results = {};
const run = (name, fn) => {
  try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; }
};

// --- approve ---
run("approve ok", () => {
  const f = fixture();
  const res = f.call({ action: "approve", regId: "reg-0001" });
  const stu = found(f.tabs.Students);
  const reg = found(f.tabs.Registrations);
  return { res, student: stu[1], enrollments: found(f.tabs.Enrollments).slice(1), regStatus: reg[1][11], regHeaders: reg[0].slice(11), regAudit: reg[1].slice(13) };
});

run("approve twice", () => {
  const f = fixture();
  const first = f.call({ action: "approve", regId: "REG-0001" });
  return { firstOk: first.ok, second: f.call({ action: "approve", regId: "REG-0001" }), students: found(f.tabs.Students).length };
});

run("approve duplicate student", () => {
  const f = fixture();
  f.call({ action: "approve", regId: "REG-0001" });
  f.tabs.Registrations.values[2][1] = "Yacine Benali";
  f.tabs.Registrations.values[2][2] = "0551234567";
  const dup = f.call({ action: "approve", regId: "REG-0002" });
  return { dup, students: found(f.tabs.Students).length, reg2Status: found(f.tabs.Registrations)[2][11] };
});

run("approve unknown id", () => fixture().call({ action: "approve", regId: "REG-9999" }));
run("approve missing id", () => fixture().call({ action: "approve", regId: "" }));
run("approve already approved", () => fixture().call({ action: "approve", regId: "REG-0003" }));

run("approve missing Students name column", () => {
  const f = fixture({ Students: makeSheet([["ID", "Nom", "Telephone"], ["STU-0001", "Old", "0500000000"]]) });
  const res = f.call({ action: "approve", regId: "REG-0001" });
  return { res, students: found(f.tabs.Students), regStatus: found(f.tabs.Registrations)[1][11] };
});

run("approve missing Enrollments tab", () => {
  const f = fixture({ Enrollments: null });
  const res = f.call({ action: "approve", regId: "REG-0001" });
  return { res, studentId: found(f.tabs.Students)[1][0], regStatus: found(f.tabs.Registrations)[1][11] };
});

run("approve with no Courses value", () => {
  const f = fixture();
  f.tabs.Registrations.values[1][6] = "";
  const res = f.call({ action: "approve", regId: "REG-0001" });
  return { res, enrollments: found(f.tabs.Enrollments).length };
});

run("approve with no StudentID column in Enrollments", () => {
  const f = fixture({ Enrollments: makeSheet([["EnrollmentID", "Course", "MonthlyFeeDZD"]]) });
  const res = f.call({ action: "approve", regId: "REG-0001" });
  return { res, enrollments: found(f.tabs.Enrollments).length };
});

// --- pay ---
run("pay ok", () => {
  const f = fixture();
  f.tabs.Students.appendRow(["STU-0001", "Yacine Benali", "0551234567", "", "", 14, "", "", "", "YES", "English A1", "Active", new Date()]);
  const res = f.call({ action: "pay", studentId: "STU-0001", amount: 2500, date: "2026-10-30", method: "Cash", note: "October" });
  return { res, row: found(f.tabs.Payments)[1] };
});

run("pay bad amounts", () => {
  const f = fixture();
  f.tabs.Students.appendRow(["STU-0001", "Yacine Benali", "", "", "", "", "", "", "", "", "", "Active", ""]);
  return ["0", "-5", "1000001", "abc", ""].map((amount) => f.call({ action: "pay", studentId: "STU-0001", amount }).error);
});

run("pay unknown student", () => {
  const f = fixture();
  const res = f.call({ action: "pay", studentId: "STU-9999", amount: 2500 });
  return { res, rows: found(f.tabs.Payments).length };
});

run("pay duplicate then different amount", () => {
  const f = fixture();
  f.tabs.Students.appendRow(["STU-0001", "Yacine Benali", "", "", "", "", "", "", "", "", "", "Active", ""]);
  const body = { action: "pay", studentId: "STU-0001", amount: 2500, date: "2026-10-30" };
  const a = f.call(body);
  const b = f.call(body);
  const c = f.call({ action: "pay", studentId: "STU-0001", amount: 3000, date: "2026-10-30" });
  return { a: a.ok, b, c: c.ok, ids: [a.paymentId, c.paymentId], rows: found(f.tabs.Payments).length - 1 };
});

run("pay student with no name column", () => {
  const f = fixture({ Students: makeSheet([["ID"], ["STU-0001"]]) });
  return { res: f.call({ action: "pay", studentId: "STU-0001", amount: 1000 }), payments: found(f.tabs.Payments).length };
});

run("pay invalid date falls back to today", () => {
  const f = fixture();
  f.tabs.Students.appendRow(["STU-0001", "Yacine", "", "", "", "", "", "", "", "", "", "Active", ""]);
  const res = f.call({ action: "pay", studentId: "STU-0001", amount: 1000, date: "2026-13-45" });
  return { ok: res.ok, date: res.date };
});

// --- schema ---
run("schema healthy", () => {
  const f = fixture();
  const res = f.call({ action: "schema" });
  return { problems: res.problems, tabs: Object.keys(res.tabs), registrations: res.tabs.Registrations.headers.slice(0, 3) };
});

run("schema renamed column", () => {
  const f = fixture({ Students: makeSheet([["Identifiant", "Nom complet", "Telephone"]]) });
  const res = f.call({ action: "schema" });
  return { problems: res.problems, students: res.tabs.Students };
});

run("schema missing tab", () => {
  const f = fixture({ Payments: null });
  return f.call({ action: "schema" }).problems;
});

// --- auth gates the new actions ---
run("approve without token", () => fixture().call({ action: "approve", regId: "REG-0001", idToken: "" }));
run("pay without token", () => fixture().call({ action: "pay", studentId: "STU-0001", amount: 1, idToken: "" }));
run("schema without token", () => fixture().call({ action: "schema", idToken: "" }));

let failures = 0;
const expect = (name, cond, detail) => {
  if (!cond) { failures++; console.log("FAIL " + name + (detail ? ": " + JSON.stringify(detail) : "")); }
};
const r = results;

expect("approve ok", r["approve ok"].res.ok === true, r["approve ok"]);
expect("student row", r["approve ok"].student[0] === "STU-0001" && r["approve ok"].student[1] === "Yacine Benali" && r["approve ok"].student[10] === "English A1, French A2" && r["approve ok"].student[11] === "Active", r["approve ok"].student);
expect("enrollments and fees", r["approve ok"].enrollments.length === 2 && r["approve ok"].enrollments[0][3] === 2500 && r["approve ok"].enrollments[1][3] === 3000, r["approve ok"].enrollments);
expect("reg approved", r["approve ok"].regStatus === "Approved", r["approve ok"].regStatus);
expect("audit columns", r["approve ok"].regHeaders.includes("ApprovedBy") && r["approve ok"].regHeaders.includes("ApprovedAt") && r["approve ok"].regAudit[0] === "owner@gmail.com" && r["approve ok"].regAudit[1] instanceof Date, r["approve ok"].regHeaders.concat(r["approve ok"].regAudit));

expect("second approve refused", r["approve twice"].second.error === "already_approved" && r["approve twice"].students === 2, r["approve twice"]);
expect("duplicate student", r["approve duplicate student"].dup.error === "student_exists" && r["approve duplicate student"].dup.studentId === "STU-0001" && r["approve duplicate student"].students === 2, r["approve duplicate student"]);
expect("duplicate leaves reg pending", r["approve duplicate student"].reg2Status === "Pending", r["approve duplicate student"].reg2Status);
expect("not_found", r["approve unknown id"].error === "not_found");
expect("missing_registration", r["approve missing id"].error === "missing_registration");
expect("already_approved", r["approve already approved"].error === "already_approved");

expect("missing column", r["approve missing Students name column"].res.error === "missing_column" && r["approve missing Students name column"].res.column === "FullName" && r["approve missing Students name column"].students.length === 2 && r["approve missing Students name column"].regStatus === "Pending", r["approve missing Students name column"]);
expect("no enrollments tab", r["approve missing Enrollments tab"].res.ok === true && r["approve missing Enrollments tab"].res.warnings.length === 1 && r["approve missing Enrollments tab"].regStatus === "Approved", r["approve missing Enrollments tab"]);
expect("no courses", r["approve with no Courses value"].res.ok === true && r["approve with no Courses value"].res.warnings.length === 1 && r["approve with no Courses value"].enrollments === 1, r["approve with no Courses value"]);
expect("enrollments missing link column", r["approve with no StudentID column in Enrollments"].res.ok === true && r["approve with no StudentID column in Enrollments"].res.warnings.length === 1 && r["approve with no StudentID column in Enrollments"].enrollments === 1, r["approve with no StudentID column in Enrollments"]);

expect("pay ok", r["pay ok"].res.ok === true && r["pay ok"].res.paymentId === "PAY-0001" && r["pay ok"].row[0] === "PAY-0001" && r["pay ok"].row[3] === 2500 && r["pay ok"].row[4] instanceof Date && r["pay ok"].row[5] === "Cash" && r["pay ok"].row[8] === "owner@gmail.com", r["pay ok"]);
expect("bad amounts", JSON.stringify(r["pay bad amounts"]) === JSON.stringify(["invalid_amount", "invalid_amount", "invalid_amount", "invalid_amount", "invalid_amount"]), r["pay bad amounts"]);
expect("unknown student", r["pay unknown student"].res.error === "not_found" && r["pay unknown student"].rows === 1, r["pay unknown student"]);
expect("duplicate payment", r["pay duplicate then different amount"].a === true && r["pay duplicate then different amount"].b.error === "duplicate_payment" && r["pay duplicate then different amount"].c === true && r["pay duplicate then different amount"].rows === 2 && r["pay duplicate then different amount"].ids[1] === "PAY-0002", r["pay duplicate then different amount"]);
expect("pay no name column", r["pay student with no name column"].res.ok === true && r["pay student with no name column"].res.studentName === "", r["pay student with no name column"]);
expect("pay invalid date", r["pay invalid date falls back to today"].ok === true, r["pay invalid date falls back to today"]);

expect("schema healthy", r["schema healthy"].problems.length === 0 && r["schema healthy"].tabs.length === 4 && r["schema healthy"].registrations[0] === "Registration ID", r["schema healthy"]);
expect("schema renamed column", r["schema renamed column"].problems.length === 1 && r["schema renamed column"].problems[0].indexOf("Students") === 0, r["schema renamed column"]);
expect("schema missing tab", r["schema missing tab"].length === 1 && r["schema missing tab"][0].indexOf("Payments") === 0, r["schema missing tab"]);

expect("auth gates approve", r["approve without token"].error === "unauthorized");
expect("auth gates pay", r["pay without token"].error === "unauthorized");
expect("auth gates schema", r["schema without token"].error === "unauthorized");

if (failures === 0) console.log("OK — " + Object.keys(results).length + " phase-5 checks passed");
else { console.log(JSON.stringify(results, null, 1)); process.exit(1); }
