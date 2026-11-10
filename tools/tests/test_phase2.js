// Phase 2 harness: the public registration (register_ in apps-script/api.gs).
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
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
      setValue: (v) => write(r, c, v)
    }),
    getDataRange: () => ({
      getValues: () => Array.from({ length: values.length }, (_, i) =>
        Array.from({ length: width() }, (_, j) => cell(i + 1, j + 1)))
    }),
    appendRow: (row) => values.push(row.slice())
  };
}

const HEAD = ["RegistrationID", "FullName", "DOB", "Age", "Phone", "Email", "WhatsApp",
  "Address", "Courses", "FrenchOK", "ArabicOK", "Under18", "ParentName", "ParentPhone",
  "ParentRelation", "Notes", "SubmittedAt", "Status"];
const CONFIG_ROWS = () => [
  ["FullCourseName", "Hidden"],
  ["Primary School Support - French - Lecture - Lecture", ""],
  ["Primary School Support - Maths - Calcul - Maths Calcul", ""]
];

const good = {
  fullName: "Amina Belkacem",
  dob: "2010-05-12", // 16 years old: parent details are required
  phone: "0551112233",
  email: "amina@example.com",
  consent: true,
  courses: ["Primary School Support - French - Lecture - Lecture", "not a real course"],
  parentName: "Karim Belkacem",
  parentPhone: "0552223344"
};

function fixture(tabs, sent, mailThrows) {
  const store = {};
  const ctx = {
    Date, JSON, Number, String, Math, Array, Object, isFinite, isNaN, encodeURIComponent, console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => tabs[n] || null }) },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: {
      getScriptCache: () => ({ get: (k) => store[k] || null, put: (k, v, t) => { store[k] = t; } })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  if (sent) {
    ctx.MailApp = {
      sendEmail: (m) => {
        if (mailThrows) throw new Error("quota exceeded");
        sent.push(m);
      }
    };
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("apps-script/api.gs", "utf8"), ctx);
  return (payload) => JSON.parse(ctx.doPost({
    parameter: { action: "register" },
    postData: { contents: JSON.stringify(payload) }
  }).text);
}

const fresh = () => ({
  Config: makeSheet(CONFIG_ROWS()),
  Registrations: makeSheet([HEAD]),
  Students: makeSheet([["StudentID", "FullName", "Phone", "DOB"]])
});

const results = {};
const run = (name, fn) => { try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; } };

run("clean submit", () => {
  const tabs = fresh();
  const post = fixture(tabs);
  const first = post(good);
  return {
    first,
    written: tabs.Registrations.values[1],
    courses: tabs.Registrations.values[1][HEAD.indexOf("Courses")],
    age: tabs.Registrations.values[1][HEAD.indexOf("Age")],
    repeat: post(good),
    secondId: tabs.Registrations.values[2] || null
  };
});

run("honeypot and validation", () => {
  const tabs = fresh();
  const post = fixture(tabs);
  return {
    web: post(Object.assign({}, good, { website: "see my offers at…" })),
    shortName: post(Object.assign({}, good, { fullName: "a" })),
    badPhone: post(Object.assign({}, good, { phone: "123" })),
    noConsent: post(Object.assign({}, good, { consent: false })),
    noCourses: post(Object.assign({}, good, { courses: [] })),
    young: post({
      fullName: "Kid Small", dob: "2024-01-01", phone: "0551112233",
      consent: true, courses: ["Primary School Support - French - Lecture - Lecture"]
    }),
    rows: tabs.Registrations.values.length
  };
});

run("duplicate inside Registrations", () => {
  const tabs = fresh();
  const row = HEAD.map(() => "");
  row[HEAD.indexOf("RegistrationID")] = "REG-9999";
  row[HEAD.indexOf("FullName")] = "Amina Belkacem";
  row[HEAD.indexOf("DOB")] = new Date(2010, 4, 12);
  row[HEAD.indexOf("Phone")] = "0551112233";
  tabs.Registrations.appendRow(row);
  return {
    res: fixture(tabs)(good),
    rows: tabs.Registrations.values.length
  };
});

run("duplicate inside Students", () => {
  const tabs = fresh();
  tabs.Students.appendRow(["STU-0010", "amina belkacem", "0551112233", new Date(2010, 4, 12)]);
  return {
    res: fixture(tabs)(good),
    regRows: tabs.Registrations.values.length,
    stuRows: tabs.Students.values.length
  };
});

run("staff are mailed", () => {
  const tabs = fresh();
  tabs.Staff = makeSheet([
    ["Email", "Name", "Active"],
    ["owner@example.com", "Owner", ""],
    ["second@example.com", "Teacher", "YES"],
    ["gone@example.com", "Old", "NO"]
  ]);
  const sent = [];
  const res = fixture(tabs, sent)(good);
  return { res, count: sent.length, mail: sent[0] || null };
});

run("mail failure never loses the registration", () => {
  const tabs = fresh();
  tabs.Staff = makeSheet([["Email", "Name", "Active"], ["owner@example.com", "Owner", ""]]);
  const sent = [];
  const res = fixture(tabs, sent, true)(good);
  return { res, rows: tabs.Registrations.values.length };
});

const fails = [];
const want = (label, got, ok, detail) => { if (!ok) { fails.push(label); console.log("FAIL — " + label + ": " + JSON.stringify(detail)); } };

const clean = results["clean submit"];
want("clean submit ok", typeof clean === "object" && clean.first.ok === true &&
  clean.first.id === "REG-0001" && clean.first.under18 === true, clean);
want("row written", typeof clean === "object" &&
  clean.written[HEAD.indexOf("FullName")] === "Amina Belkacem" &&
  clean.written[HEAD.indexOf("Status")] === "Pending" &&
  clean.written[HEAD.indexOf("Under18")] === "YES" &&
  clean.age === 16, clean);
want("unknown course dropped", typeof clean === "object" &&
  clean.courses === "Primary School Support - French - Lecture - Lecture", clean);
want("fast repeat blocked", typeof clean === "object" && clean.repeat.ok === false &&
  clean.repeat.error === "too_many" && clean.secondId === null, clean);

const v = results["honeypot and validation"];
want("honeypot and validation", typeof v === "object" &&
  v.web.error === "rejected" && v.shortName.error === "name_required" &&
  v.badPhone.error === "phone_invalid" && v.noConsent.error === "consent_required" &&
  v.noCourses.error === "courses_required" && typeof v.young === "object" &&
  (v.young.error === "parent_required" || v.young.error === "dob_invalid") &&
  v.rows === 1, v);

const dupReg = results["duplicate inside Registrations"];
want("duplicate inside Registrations", typeof dupReg === "object" &&
  dupReg.res.ok === false && dupReg.res.error === "duplicate" && dupReg.rows === 2, dupReg);

const dupStu = results["duplicate inside Students"];
want("duplicate inside Students", typeof dupStu === "object" &&
  dupStu.res.ok === false && dupStu.regRows === 1 && dupStu.stuRows === 2, dupStu);

const mailed = results["staff are mailed"];
want("staff are mailed", typeof mailed === "object" && mailed.res.ok === true && mailed.count === 1 &&
  mailed.mail && mailed.mail.to === "owner@example.com,second@example.com" &&
  /Amina Belkacem/.test(mailed.mail.subject) && /REG-0001/.test(mailed.mail.subject) &&
  /0551112233/.test(mailed.mail.body) && /Karim Belkacem/.test(mailed.mail.body) &&
  /spreadsheets/.test(mailed.mail.body), mailed);

const mailFail = results["mail failure never loses the registration"];
want("mail failure keeps the row", typeof mailFail === "object" &&
  mailFail.res.ok === true && mailFail.rows === 2, mailFail);

if (!fails.length) console.log("OK — 9 phase-2 checks passed");
else process.exitCode = 1;
