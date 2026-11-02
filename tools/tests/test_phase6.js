// Phase 6b harness: sessions / roster / attend in apps-script/admin.gs against a fake spreadsheet.
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

function fixture(overrides) {
  const tabs = {
    Staff: makeSheet([["Email", "Name", "Active"], ["owner@gmail.com", "Owner", "YES"]]),
    Students: makeSheet([
      ["StudentID", "FullName", "Phone", "Courses", "Status"],
      ["STU-0001", "Amina Belkacem", "0551112233", "English A1", "Active"],
      ["STU-0002", "Yacine Haddad", "0662223344", "English A1, French A2", "Active"],
      ["STU-0003", "Old Pupil", "0770000000", "English A1", "Inactive"],
      ["STU-0004", "Sara Test", "0555000111", " French A2 ", ""],
      ["", "", "", "", ""]
    ]),
    Config: makeSheet([
      ["FullCourseName", "MonthlyFeeDZD"],
      ["English A1", 2500],
      ["French A2", 3000]
    ]),
    Enrollments: makeSheet([["EnrollmentID", "StudentID", "Course", "MonthlyFeeDZD", "Status"]]),
    Payments: makeSheet([["PaymentID", "StudentID", "Amount", "Date"]]),
    Registrations: makeSheet([["RegistrationID", "FullName", "Phone", "DOB", "Courses", "Status"]]),
    Sessions: makeSheet([
      ["SessionID", "Course", "Day", "StartTime", "EndTime", "Teacher", "Room", "Status"],
      ["SESS-0001", "English A1", "Sunday", "16:00", "18:00", "Nadia", "1", "Active"],
      ["SESS-0002", "French A2", "Monday", "17:00", "19:00", "", "", "Inactive"]
    ]),
    Attendance: makeSheet([
      ["AttendanceID", "Date", "SessionID", "StudentID", "StudentName", "Status", "RecordedBy", "RecordedAt"]
    ])
  };
  Object.assign(tabs, overrides || {});
  Object.keys(tabs).forEach(k => { if (!tabs[k]) delete tabs[k]; });

  const ctx = {
    Date, JSON, Number, String, Math, encodeURIComponent, console, Array,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => tabs[n] || null,
        insertSheet: (n) => (tabs[n] = makeSheet([]))
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
          aud: ctx.CLIENT_ID, email: "owner@gmail.com", email_verified: "true",
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
    postData: { contents: JSON.stringify(body.idToken === undefined ? Object.assign({ idToken: "t" }, body) : body) }
  }).text);
  return { ctx, tabs, call };
}

const found = (s) => s.getDataRange().getValues();
const results = {};
const run = (name, fn) => { try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; } };

run("sessions creates tabs", () => {
  const f = fixture({ Sessions: null, Attendance: null, Config: null });
  const res = f.call({ action: "sessions" });
  return { res, sessions: f.tabs.Sessions && found(f.tabs.Sessions), attendance: f.tabs.Attendance && found(f.tabs.Attendance) };
});

run("sessions lists active only", () => {
  const res = fixture().call({ action: "sessions" });
  return { ok: res.ok, ids: res.sessions.map(s => s.sessionId), courses: res.courses, first: res.sessions[0] };
});

run("add session", () => {
  const f = fixture();
  const res = f.call({ action: "addSession", course: "english a1", day: "Monday", start: "09:00", end: "10:30", teacher: "Karim", room: "2" });
  return { res, row: found(f.tabs.Sessions)[3], ids: f.call({ action: "sessions" }).sessions.map(s => s.sessionId) };
});

run("add session guards", () => {
  const f = fixture();
  return {
    unknownCourse: f.call({ action: "addSession", course: "German B2", day: "Sunday", start: "10:00", end: "11:00" }),
    invalidDay: f.call({ action: "addSession", course: "English A1", day: "Funday", start: "10:00", end: "11:00" }),
    badTime: f.call({ action: "addSession", course: "English A1", day: "Sunday", start: "11:00", end: "10:00" }),
    junkTime: f.call({ action: "addSession", course: "English A1", day: "Sunday", start: "x", end: "11:00" }),
    duplicate: f.call({ action: "addSession", course: "English A1", day: "Sunday", start: "16:00", end: "18:00" }),
    missingCourse: f.call({ action: "addSession", day: "Sunday", start: "10:00", end: "11:00" }),
    rows: found(f.tabs.Sessions).length
  };
});

run("add session ignores inactive duplicate slot", () => {
  const f = fixture();
  return f.call({ action: "addSession", course: "French A2", day: "Monday", start: "17:00", end: "19:00" });
});

run("roster for active course", () => {
  const res = fixture().call({ action: "roster", sessionId: "SESS-0001", date: "2026-10-25" });
  return { ok: res.ok, ids: res.students.map(s => s.studentId), session: res.session, date: res.date };
});

run("roster trimming and inactivity", () => {
  const res = fixture().call({ action: "roster", sessionId: "SESS-0001", date: "2026-10-25" });
  return res.students.map(s => s.name);
});

run("roster guards", () => {
  const f = fixture();
  return {
    noSession: f.call({ action: "roster", sessionId: "", date: "2026-10-25" }),
    unknown: f.call({ action: "roster", sessionId: "SESS-9999", date: "2026-10-25" }),
    future: f.call({ action: "roster", sessionId: "SESS-0001", date: "2030-01-01" }),
    junkDate: f.call({ action: "roster", sessionId: "SESS-0001", date: "not-a-date" })
  };
});

run("attend saves and reloads marks", () => {
  const f = fixture();
  const save = f.call({
    action: "attend", sessionId: "SESS-0001", date: "2026-10-25",
    rows: [{ studentId: "STU-0001", status: "Present" }, { studentId: "STU-0002", status: "Absent" }]
  });
  const again = f.call({ action: "roster", sessionId: "SESS-0001", date: "2026-10-25" });
  return { save, rows: found(f.tabs.Attendance).slice(1), marks: again.students.map(s => s.studentId + ":" + s.status) };
});

run("attend updates instead of duplicating", () => {
  const f = fixture();
  const body = { action: "attend", sessionId: "SESS-0001", date: "2026-10-25", rows: [{ studentId: "STU-0001", status: "Absent" }] };
  const a = f.call(body);
  const b = f.call({ ...body, rows: [{ studentId: "STU-0001", status: "Present" }] });
  return { a, b, rows: found(f.tabs.Attendance).slice(1) };
});

run("attend validation", () => {
  const f = fixture();
  return {
    empty: f.call({ action: "attend", sessionId: "SESS-0001", date: "2026-10-25", rows: [] }),
    future: f.call({ action: "attend", sessionId: "SESS-0001", date: "2030-01-01", rows: [{ studentId: "STU-0001", status: "Present" }] }),
    noSession: f.call({ action: "attend", sessionId: "", date: "2026-10-25", rows: [{ studentId: "STU-0001", status: "Present" }] }),
    junkRows: f.call({ action: "attend", sessionId: "SESS-0001", date: "2026-10-25", rows: "x" })
  };
});

run("attend skips junk rows and unknown students", () => {
  const f = fixture();
  const res = f.call({
    action: "attend", sessionId: "SESS-0001", date: "2026-10-25",
    rows: [{ studentId: "STU-0001", status: "Present" }, { studentId: "STU-9999", status: "Present" }, { studentId: "STU-0002", status: "Maybe" }, { studentId: "", status: "Present" }]
  });
  return { res, rows: found(f.tabs.Attendance).slice(1) };
});

run("attendance is a readable tab", () => {
  const f = fixture();
  f.call({ action: "attend", sessionId: "SESS-0001", date: "2026-10-25", rows: [{ studentId: "STU-0001", status: "Present" }] });
  const res = f.call({ action: "list", tab: "Attendance" });
  return { ok: res.ok, headers: res.headers, rows: res.rows };
});

run("sessions renamed column", () => {
  const f = fixture({ Sessions: makeSheet([["ID", "Cours", "Jour"], ["SESS-0001", "English A1", "Sunday"]]) });
  return f.call({ action: "sessions" });
});

run("attendance renamed column", () => {
  const f = fixture({ Attendance: makeSheet([["ID", "Session", "Eleve"]]) });
  return f.call({ action: "attend", sessionId: "SESS-0001", date: "2026-10-25", rows: [{ studentId: "STU-0001", status: "Present" }] });
});

run("auth gates", () => {
  const f = fixture();
  return {
    sessions: f.call({ action: "sessions", idToken: "" }),
    roster: f.call({ action: "roster", sessionId: "SESS-0001", idToken: "" }),
    attend: f.call({ action: "attend", sessionId: "SESS-0001", rows: [{ studentId: "STU-0001", status: "Present" }], idToken: "" }),
    add: f.call({ action: "addSession", course: "English A1", day: "Monday", start: "09:00", end: "10:00", idToken: "" })
  };
});

let failures = 0;
const expect = (name, cond, detail) => { if (!cond) { failures++; console.log("FAIL " + name + (detail ? ": " + JSON.stringify(detail) : "")); } };
const r = results;

expect("tabs created", r["sessions creates tabs"].sessions.length === 1 && r["sessions creates tabs"].sessions[0][0] === "SessionID" && r["sessions creates tabs"].attendance.length === 1 && r["sessions creates tabs"].attendance[0][0] === "AttendanceID" && r["sessions creates tabs"].res.ok === true, r["sessions creates tabs"]);

expect("lists active", r["sessions lists active only"].ok && JSON.stringify(r["sessions lists active only"].ids) === '["SESS-0001"]', r["sessions lists active only"]);
expect("course names", JSON.stringify(r["sessions lists active only"].courses) === '["English A1","French A2"]', r["sessions lists active only"].courses);
expect("time formatted", r["sessions lists active only"].first.start === "16:00" && r["sessions lists active only"].first.end === "18:00", r["sessions lists active only"].first);

expect("add session", r["add session"].res.ok === true && r["add session"].res.sessionId === "SESS-0003" && r["add session"].row[1] === "English A1" && r["add session"].row[2] === "Monday" && r["add session"].row[3] === "09:00" && r["add session"].row[5] === "Karim" && r["add session"].ids.length === 2, r["add session"]);

const guards = r["add session guards"];
expect("add guards", guards.unknownCourse.error === "unknown_course" && guards.invalidDay.error === "invalid_day" && guards.badTime.error === "invalid_time" && guards.junkTime.error === "invalid_time" && guards.duplicate.error === "session_exists" && guards.missingCourse.error === "missing_course" && guards.rows === 3, guards);
expect("inactive slot reusable", r["add session ignores inactive duplicate slot"].ok === true, r["add session ignores inactive duplicate slot"]);

expect("roster", r["roster for active course"].ok === true && JSON.stringify(r["roster for active course"].ids) === '["STU-0001","STU-0002"]' && r["roster for active course"].session.course === "English A1" && r["roster for active course"].date === "2026-10-25", r["roster for active course"]);
expect("roster names", JSON.stringify(r["roster trimming and inactivity"]) === '["Amina Belkacem","Yacine Haddad"]', r["roster trimming and inactivity"]);

const rg = r["roster guards"];
expect("roster guards", rg.noSession.error === "missing_session" && rg.unknown.error === "not_found" && rg.future.error === "invalid_date" && rg.junkDate.error === "invalid_date", rg);

expect("attend", r["attend saves and reloads marks"].save.ok === true && r["attend saves and reloads marks"].save.added === 2 && r["attend saves and reloads marks"].rows.length === 2 && JSON.stringify(r["attend saves and reloads marks"].marks) === '["STU-0001:Present","STU-0002:Absent"]', r["attend saves and reloads marks"]);
expect("attend row", r["attend saves and reloads marks"].rows[0][0] === "ATT-0001" && r["attend saves and reloads marks"].rows[0][5] === "Present" && r["attend saves and reloads marks"].rows[0][6] === "owner@gmail.com", r["attend saves and reloads marks"].rows);

expect("upsert", r["attend updates instead of duplicating"].a.added === 1 && r["attend updates instead of duplicating"].b.updated === 1 && r["attend updates instead of duplicating"].rows.length === 1 && r["attend updates instead of duplicating"].rows[0][5] === "Present", r["attend updates instead of duplicating"]);

const av = r["attend validation"];
expect("attend guards", av.empty.error === "missing_rows" && av.future.error === "invalid_date" && av.noSession.error === "missing_session" && av.junkRows.error === "missing_rows", av);

const sk = r["attend skips junk rows and unknown students"];
expect("attend skips", sk.res.ok === true && sk.res.added === 1 && sk.res.skipped === 3 && sk.rows.length === 1, sk);

expect("attendance list", r["attendance is a readable tab"].ok === true && r["attendance is a readable tab"].rows.length === 1 && r["attendance is a readable tab"].rows[0].Status === "Present", r["attendance is a readable tab"]);

expect("renamed sessions", r["sessions renamed column"].error === "missing_column" && r["sessions renamed column"].tab === "Sessions", r["sessions renamed column"]);
expect("renamed attendance", r["attendance renamed column"].error === "missing_column" && r["attendance renamed column"].tab === "Attendance", r["attendance renamed column"]);

expect("auth", ["sessions", "roster", "attend", "add"].every(k => r["auth gates"][k].error === "unauthorized"), r["auth gates"]);

if (failures === 0) console.log("OK — " + Object.keys(results).length + " phase-6b checks passed");
else { console.log(JSON.stringify(results, null, 1)); process.exit(1); }
