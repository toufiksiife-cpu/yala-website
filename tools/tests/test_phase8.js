// Phase 8 harness: regStatus_, balances_ and the daily backup, against fake Sheets/Drive.
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
function fmt(d, tz, pattern) {
  if (!pattern) { pattern = tz; }
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
  if (pattern === "yyyyMMdd") return "" + y + m + day;
  if (pattern === "yyyy-MM-dd") return y + "-" + m + "-" + day;
  if (pattern === "yyyy-MM-dd HHmm") return y + "-" + m + "-" + day + " " + pad(d.getHours()) + pad(d.getMinutes());
  return y + "-" + m + "-" + day + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = new Date();
const thisMonth = iso(today).slice(0, 7);
const lastMonth = iso(new Date(today.getFullYear(), today.getMonth() - 1, 15));

const STUDENTS = () => makeSheet([
  ["StudentID", "FullName", "Phone", "Courses", "Status"],
  ["STU-0001", "Amina Belkacem", "0551112233", "English A1", "Active"],
  ["STU-0002", "Yacine Haddad", "0662223344", "English A1, French A2", "Active"],
  ["STU-0003", "Old Pupil", "0770000000", "French A2", "Inactive"]
]);

function fixture(overrides) {
  const tabs = {
    Students: STUDENTS(),
    Config: makeSheet([
      ["FullCourseName", "MonthlyFeeDZD"],
      ["English A1", 2500],
      ["French A2", 3000]
    ]),
    Enrollments: makeSheet([
      ["EnrollmentID", "StudentID", "Course", "MonthlyFeeDZD", "Status"],
      ["ENR-0001", "STU-0001", "English A1", 2500, "Active"],
      ["ENR-0002", "STU-0002", "English A1", 2500, "Active"],
      ["ENR-0003", "STU-0002", "French A2", 3000, "Active"],
      ["ENR-0004", "STU-0002", "French A2", 9999, "Inactive"]
    ]),
    Payments: makeSheet([
      ["PaymentID", "StudentID", "Amount", "Date"],
      ["PAY-0001", "STU-0001", 2000, thisMonth + "-02"],
      ["PAY-0002", "STU-0001", 500, thisMonth + "-10"],
      ["PAY-0003", "STU-0002", 1000, thisMonth + "-05"],
      ["PAY-0004", "STU-0001", 9000, lastMonth],
      ["PAY-0005", "STU-0003", 9000, thisMonth + "-06"]
    ]),
    Registrations: makeSheet([
      ["RegistrationID", "FullName", "Phone", "Status"],
      ["REG-0001", "Amina Belkacem", "0551112233", "Pending"],
      ["REG-0002", "Yacine Haddad", "0662223344", "Approved"]
    ]),
    Staff: makeSheet([["Email", "Name", "Active"], ["owner@gmail.com", "Owner", "YES"]])
  };
  Object.assign(tabs, overrides || {});
  Object.keys(tabs).forEach(k => { if (!tabs[k]) delete tabs[k]; });

  const drive = makeDrive();
  const triggers = [];

  const ctx = {
    Date, JSON, Number, String, Math, encodeURIComponent, console, Array,
    SpreadsheetApp: {
      openById: () => ({
        getName: () => "YALA Academy",
        getSheetByName: (n) => tabs[n] || null,
        insertSheet: (n) => (tabs[n] = makeSheet([]))
      })
    },
    DriveApp: drive,
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => ({
        timeBased: () => ({
          atHour: (h) => ({
            everyDays: (d) => ({
              create: () => triggers.push({ handler: fn, hour: h, days: d, getHandlerFunction: () => fn })
            })
          })
        })
      })
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => "owner@gmail.com" }),
      getScriptTimeZone: () => "Africa/Algiers"
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          aud: "our.apps.googleusercontent.com", email: "owner@gmail.com", email_verified: "true",
          exp: Math.floor(Date.now() / 1000) + 600
        })
      })
    },
    Utilities: { formatDate: fmt },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.CLIENT_ID = "our.apps.googleusercontent.com";
  const call = (body) => JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify(Object.assign({ idToken: "t" }, body)) }
  }).text);
  return { ctx, tabs, drive, triggers, call };
}

function makeDrive() {
  const folders = {};
  const seed = (name, count) => {
    const folder = newFolder(name);
    for (let i = 0; i < count; i++) {
      folder.files.push(file("YALA Academy backup 2026-01-" + pad(i + 1) + " 0200",
        new Date(2026, 0, i + 1)));
    }
    return folder;
  };
  const file = (name, created) => ({
    name,
    created,
    trashed: false,
    getName() { return this.name; },
    getDateCreated() { return this.created; },
    setTrashed(v) { this.trashed = v; }
  });
  const newFolder = (name) => {
    const folder = {
      name,
      files: [],
      getFiles() {
        let i = 0;
        const files = this.files;
        return { hasNext: () => i < files.length, next: () => files[i++] };
      }
    };
    folders[name] = folder;
    return folder;
  };
  return {
    folders,
    seed,
    file,
    getFoldersByName(name) {
      const list = folders[name] ? [folders[name]] : [];
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++] };
    },
    createFolder(name) { return newFolder(name); },
    getFileById() {
      return {
        makeCopy(name, folder) {
          const copy = file(name, new Date());
          folder.files.push(copy);
          return copy;
        }
      };
    }
  };
}

const found = (s) => s.getDataRange().getValues();
const results = {};
const run = (name, fn) => { try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; } };

run("reg status", () => {
  const f = fixture();
  const contacted = f.call({ action: "regStatus", regId: "REG-0001", status: "contacted" });
  const noAnswer = f.call({ action: "regStatus", regId: "REG-0001", status: "No answer" });
  const rejected = f.call({ action: "regStatus", regId: "REG-0001", status: "REJECTED" });
  return { contacted, noAnswer, rejected, cell: found(f.tabs.Registrations)[1][3] };
});

run("reg status guards", () => {
  const f = fixture();
  return {
    missing: f.call({ action: "regStatus", status: "Contacted" }),
    bad: f.call({ action: "regStatus", regId: "REG-0001", status: "Approved" }),
    unknown: f.call({ action: "regStatus", regId: "REG-9999", status: "Contacted" }),
    approvedRow: f.call({ action: "regStatus", regId: "REG-0002", status: "Contacted" }),
    approvedCell: found(f.tabs.Registrations)[2][3]
  };
});

run("reg status keeps approved", () => {
  const f = fixture({
    Registrations: makeSheet([
      ["RegistrationID", "FullName", "Phone", "Status"],
      ["REG-0002", "Unique Applicant", "0559000111", "Pending"]
    ])
  });
  f.call({ action: "approve", regId: "REG-0002" });
  return f.call({ action: "regStatus", regId: "REG-0002", status: "Rejected" });
});

run("balances from enrollments", () => {
  const f = fixture();
  return f.call({ action: "balances" });
});

run("balances ignore other months", () => {
  const f = fixture({
    Payments: makeSheet([
      ["PaymentID", "StudentID", "Amount", "Date"],
      ["PAY-0001", "STU-0001", 9000, lastMonth],
      ["PAY-0002", "STU-0002", 1000, thisMonth + " 10:00"]
    ])
  });
  const res = f.call({ action: "balances" });
  return { res, owed: res.rows.map(r => r.studentId + ":" + r.balance) };
});

run("balances without enrollments", () => {
  const f = fixture({ Enrollments: makeSheet([["EnrollmentID", "StudentID", "Course"]]) });
  return f.call({ action: "balances" });
});

run("balances without payments date", () => {
  const f = fixture({ Payments: makeSheet([["PaymentID", "StudentID", "Amount"], ["PAY-1", "STU-0002", 500]]) });
  return f.call({ action: "balances" });
});

run("backup copies and keeps 30", () => {
  const f = fixture();
  f.drive.seed("YALA backups", 31);
  const name = f.ctx.backupSheet();
  const folder = f.drive.folders["YALA backups"];
  return {
    name,
    count: folder.files.length,
    trashed: folder.files.filter(x => x.trashed).length,
    unchanged: folder.files.filter(x => !x.trashed).length
  };
});

run("backup makes the folder", () => {
  const f = fixture();
  const name = f.ctx.backupSheet();
  return { name, folders: Object.keys(f.drive.folders), files: f.drive.folders["YALA backups"].files.length };
});

run("install trigger", () => {
  const f = fixture();
  f.triggers.push({ handler: "backupSheet", getHandlerFunction: () => "backupSheet" });
  const text = f.ctx.installBackupTrigger();
  return { text, triggers: f.triggers.map(t => t.handler + "@" + t.hour + "/" + t.days) };
});

const expect = (label, ok, detail) => {
  if (!ok) {
    console.log("FAIL — " + label + ": " + JSON.stringify(detail));
    process.exitCode = 1;
  }
};

const r = results;

expect("reg status", typeof r["reg status"] === "object" &&
  r["reg status"].contacted.ok && r["reg status"].contacted.status === "Contacted" &&
  r["reg status"].noAnswer.status === "No answer" && r["reg status"].rejected.status === "Rejected" &&
  r["reg status"].cell === "Rejected", r["reg status"]);

expect("reg status guards", typeof r["reg status guards"] === "object" &&
  r["reg status guards"].missing.error === "missing_registration" &&
  r["reg status guards"].bad.error === "invalid_status" &&
  r["reg status guards"].unknown.error === "not_found" &&
  r["reg status guards"].approvedRow.error === "already_approved" &&
  r["reg status guards"].approvedCell === "Approved", r["reg status guards"]);

expect("reg status keeps approved", typeof r["reg status keeps approved"] === "object" &&
  r["reg status keeps approved"].error === "already_approved", r["reg status keeps approved"]);

const bal = r["balances from enrollments"];
expect("balances", typeof bal === "object" && bal.ok === true && bal.month === thisMonth &&
  bal.rows.length === 2 &&
  bal.rows[0].studentId === "STU-0001" && bal.rows[0].due === 2500 && bal.rows[0].paid === 2500 && bal.rows[0].balance === 0 &&
  bal.rows[1].due === 5500 && bal.rows[1].paid === 1000 && bal.rows[1].balance === 4500 &&
  bal.totalDue === 8000 && bal.totalPaid === 3500, bal);

const old = r["balances ignore other months"];
expect("balances months", typeof old === "object" && old.res.ok === true &&
  old.owed.join(",") === "STU-0001:2500,STU-0002:4500", old);

const noEnr = r["balances without enrollments"];
expect("balances config fallback", typeof noEnr === "object" && noEnr.ok === true &&
  noEnr.rows[0].due === 2500 && noEnr.rows[1].due === 5500, noEnr);

const noDate = r["balances without payments date"];
expect("balances no date column", typeof noDate === "object" && noDate.ok === true &&
  noDate.rows[0].paid === 0 && noDate.rows[1].paid === 500, noDate);

const bk = r["backup copies and keeps 30"];
expect("backup", typeof bk === "object" && /^YALA Academy backup \d{4}-\d{2}-\d{2} \d{4}$/.test(bk.name) &&
  bk.trashed === 2 && bk.unchanged === 30, bk);

const bkNew = r["backup makes the folder"];
expect("backup folder", typeof bkNew === "object" && bkNew.folders.join(",") === "YALA backups" &&
  bkNew.files === 1, bkNew);

const tr = r["install trigger"];
expect("trigger", typeof tr === "object" && tr.text.indexOf("02:00") !== -1 &&
  tr.triggers.join(",") === "backupSheet@2/1", tr);

if (!process.exitCode) console.log("OK — " + Object.keys(results).length + " phase-8 checks passed");
