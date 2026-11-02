// Phase 7 harness: addRegistration / addTeacher in apps-script/admin.gs against a fake spreadsheet.
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

const REG_HEADERS = ["RegistrationID", "FullName", "DOB", "Age", "Phone", "Email", "WhatsApp",
  "Courses", "Under18", "ParentName", "ParentPhone", "ParentRelation", "Notes", "SubmittedAt", "Status"];

function fixture(overrides) {
  const tabs = {
    Staff: makeSheet([["Email", "Name", "Active"], ["owner@gmail.com", "Owner", "YES"]]),
    Students: makeSheet([
      ["StudentID", "FullName", "Phone", "Email", "DOB", "Age", "ParentName", "ParentPhone",
        "ParentRelation", "Under18", "Courses", "Status", "RegisteredAt"],
      ["STU-0001", "Amina Belkacem", "0551112233", "", "", "", "", "", "", "", "English A1", "Active", ""],
      ["STU-0002", "Yacine Haddad", "0662223344", "", "", "", "", "", "", "", "English A1", "Active", ""]
    ]),
    Config: makeSheet([
      ["FullCourseName", "MonthlyFeeDZD"],
      ["English A1", 2500],
      ["French A2", 3000]
    ]),
    Enrollments: makeSheet([["EnrollmentID", "StudentID", "Course", "MonthlyFeeDZD", "StartDate", "Status"]]),
    Payments: makeSheet([["PaymentID", "StudentID", "Amount", "Date"]]),
    Registrations: makeSheet([
      REG_HEADERS,
      ["REG-0001", "Pending Person", "2010-01-01", 16, "0551239876", "", "", "English A1", "YES",
        "Parent Person", "0551239877", "Father", "", "", "Pending"]
    ]),
    Sessions: makeSheet([
      ["SessionID", "Course", "Day", "StartTime", "EndTime", "Teacher", "Room", "Status"],
      ["SESS-0001", "English A1", "Sunday", "16:00", "18:00", "Nadia", "1", "Active"]
    ]),
    Attendance: makeSheet([
      ["AttendanceID", "Date", "SessionID", "StudentID", "StudentName", "Status", "RecordedBy", "RecordedAt"]
    ]),
    Teachers: makeSheet([
      ["TeacherID", "FullName", "Phone", "Email", "Courses", "Status", "JoinedOn", "Notes"],
      ["TCH-0001", "Nadia Saidi", "0559998877", "", "English A1", "Active", "", ""],
      ["TCH-0002", "Karim Ould", "0557776655", "", "French A2", "Inactive", "", ""]
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
          aud: ctx.CLIENT_ID, email: ctx.SIGNIN_EMAIL || "owner@gmail.com", email_verified: "true",
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
  ctx.SIGNIN_EMAIL = "owner@gmail.com";
  const call = (body) => JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify(body.idToken === undefined ? Object.assign({ idToken: "t" }, body) : body) }
  }).text);
  return { ctx, tabs, call };
}

const found = (s) => s.getDataRange().getValues();
const rowsOf = (tabs, name) => found(tabs[name]).slice(1);
const results = {};
const run = (name, fn) => { try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; } };

run("add registration", () => {
  const f = fixture();
  const res = f.call({
    action: "addRegistration", name: "  Sara Test  ", phone: "0555 000 111", email: "Sara@Example.com",
    dob: "2010-05-04", parentName: "Omar Test", parentPhone: "0555000222", parentRelation: "Father",
    courses: ["english a1", "French A2"], notes: "Walk-in"
  });
  const rows = rowsOf(f.tabs, "Registrations");
  return { res, row: rows[rows.length - 1], count: rows.length };
});

run("registration is pending", () => {
  const f = fixture();
  f.call({ action: "addRegistration", name: "Bilal Test", phone: "0555000333", courses: "English A1" });
  const rows = rowsOf(f.tabs, "Registrations");
  return { status: rows[rows.length - 1][14], students: rowsOf(f.tabs, "Students").length, enrollments: rowsOf(f.tabs, "Enrollments").length };
});

run("registration then approve", () => {
  const f = fixture();
  const added = f.call({ action: "addRegistration", name: "Bilal Test", phone: "0555000333", courses: "English A1" });
  const approved = f.call({ action: "approve", regId: added.registrationId });
  const students = rowsOf(f.tabs, "Students");
  return { added, approved, student: students[students.length - 1], enrollments: rowsOf(f.tabs, "Enrollments") };
});

run("duplicate student", () => {
  const f = fixture();
  return f.call({ action: "addRegistration", name: "Amina Belkacem", phone: "0551112233", courses: "English A1" });
});

run("duplicate pending registration", () => {
  const f = fixture();
  return f.call({ action: "addRegistration", name: "Pending Person", phone: "0551239876", courses: "English A1" });
});

run("approved person cannot be re-registered", () => {
  const f = fixture();
  const added = f.call({ action: "addRegistration", name: "Zed One", phone: "0555000999", courses: "English A1" });
  f.call({ action: "approve", regId: added.registrationId });
  const again = f.call({ action: "addRegistration", name: "Zed One", phone: "0555000999", courses: "English A1" });
  return { again, rows: rowsOf(f.tabs, "Registrations").length };
});

run("registration validation", () => {
  const f = fixture();
  return {
    noName: f.call({ action: "addRegistration", name: "", phone: "0555000444", courses: "English A1" }),
    badPhone: f.call({ action: "addRegistration", name: "X Y", phone: "12", courses: "English A1" }),
    badEmail: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", email: "nope", courses: "English A1" }),
    badDob: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", dob: "2010-13-40", courses: "English A1" }),
    futureDob: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", dob: "2030-01-01", courses: "English A1" }),
    unknownCourse: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", courses: "German B2" }),
    noCourse: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", courses: [] }),
    minorNoParent: f.call({ action: "addRegistration", name: "X Y", phone: "0555000444", dob: "2015-01-01", courses: "English A1" }),
    rows: rowsOf(f.tabs, "Registrations").length
  };
});

run("adult registration no parent", () => {
  const f = fixture();
  const res = f.call({ action: "addRegistration", name: "Adult Test", phone: "0555000777", courses: "English A1" });
  const rows = rowsOf(f.tabs, "Registrations");
  return { res, row: rows[rows.length - 1] };
});

run("add teacher", () => {
  const f = fixture({ Teachers: null });
  const res = f.call({
    action: "addTeacher", name: "Samir New", phone: "0551234567", email: "samir@example.com",
    courses: ["English A1"], notes: "Tue/Thu"
  });
  return { res, headers: found(f.tabs.Teachers)[0], rows: rowsOf(f.tabs, "Teachers") };
});

run("add teacher validation", () => {
  const f = fixture();
  return {
    noName: f.call({ action: "addTeacher", phone: "0551234567" }),
    noContact: f.call({ action: "addTeacher", name: "X Y" }),
    badEmail: f.call({ action: "addTeacher", name: "X Y", email: "nope" }),
    badPhone: f.call({ action: "addTeacher", name: "X Y", phone: "1" }),
    unknownCourse: f.call({ action: "addTeacher", name: "X Y", phone: "0551234567", courses: "German B2" }),
    futureJoined: f.call({ action: "addTeacher", name: "X Y", phone: "0551234567", joined: "2030-01-01" }),
    duplicate: f.call({ action: "addTeacher", name: "Nadia Saidi", phone: "0559998877" }),
    rows: rowsOf(f.tabs, "Teachers").length
  };
});

run("teacher dropdown from sessions", () => {
  const f = fixture();
  const res = f.call({ action: "sessions" });
  return { ok: res.ok, teachers: res.teachers, courses: res.courses };
});

run("teachers list creates tab", () => {
  const f = fixture({ Teachers: null });
  const res = f.call({ action: "list", tab: "Teachers" });
  return { res, headers: f.tabs.Teachers && found(f.tabs.Teachers)[0] };
});

run("teacher sheet with other headers", () => {
  const f = fixture({
    Teachers: makeSheet([
      ["Teacher", "Phone", "Subject", "Status"],
      ["Old Teacher", "0551110000", "English A1", "Active"]
    ])
  });
  const res = f.call({ action: "addTeacher", name: "Alias Test", phone: "0551231234", courses: "French A2" });
  return { res, rows: rowsOf(f.tabs, "Teachers"), names: f.call({ action: "sessions" }).teachers };
});

run("teacher sheet without courses column", () => {
  const f = fixture({ Teachers: makeSheet([["Name", "Phone"], ["One", "0551110000"]]) });
  const res = f.call({ action: "addTeacher", name: "No Course Col", phone: "0551231234", courses: "French A2" });
  return { res, rows: rowsOf(f.tabs, "Teachers") };
});

run("teacher with real headers", () => {
  const f = fixture({
    Teachers: makeSheet([
      ["TeacherID", "FullName", "Phone", "WhatsApp", "Email", "Specialties", "CoursesAssigned",
        "Status", "RegisteredAt", "Notes"],
      ["TCH-0001", "Nadia Saidi", "0559998877", "0559998877", "", "", "English A1", "Active", "", ""]
    ])
  });
  const res = f.call({ action: "addTeacher", name: "Real Header", phone: "0551234567", courses: "French A2" });
  const rows = rowsOf(f.tabs, "Teachers");
  return { res, row: rows[rows.length - 1], count: rows.length, names: f.call({ action: "sessions" }).teachers };
});

run("staff list", () => {
  const f = fixture({
    Staff: makeSheet([
      ["Email", "Name", "Active"],
      ["Owner@Gmail.com", "Owner", "YES"],
      ["desk@gmail.com", "Front desk", "YES"],
      ["gone@gmail.com", "Gone", "NO"]
    ])
  });
  return f.call({ action: "staff" });
});

run("staff add", () => {
  const f = fixture();
  const res = f.call({ action: "addStaff", email: " New.Teacher@Gmail.com ", name: "New Teacher" });
  return { res, rows: rowsOf(f.tabs, "Staff") };
});

run("staff add guards", () => {
  const f = fixture();
  return {
    noMail: f.call({ action: "addStaff", name: "X" }),
    badMail: f.call({ action: "addStaff", email: "nope" }),
    exists: f.call({ action: "addStaff", email: "OWNER@gmail.com" }),
    rows: rowsOf(f.tabs, "Staff").length
  };
});

run("staff revoke and restore", () => {
  const f = fixture({
    Staff: makeSheet([
      ["Email", "Name", "Active"],
      ["owner@gmail.com", "Owner", "YES"],
      ["desk@gmail.com", "Desk", "YES"]
    ])
  });
  const off = f.call({ action: "setStaff", email: "desk@gmail.com", active: "NO" });
  f.ctx.SIGNIN_EMAIL = "desk@gmail.com";
  const denied = f.call({ action: "list", tab: "Registrations" });
  f.ctx.SIGNIN_EMAIL = "owner@gmail.com";
  const list = f.call({ action: "staff" });
  const on = f.call({ action: "setStaff", email: "desk@gmail.com", active: "YES" });
  return { off, denied, list, on };
});

run("staff owner locks", () => {
  const f = fixture();
  return {
    self: f.call({ action: "setStaff", email: "owner@gmail.com", active: "NO" }),
    unknown: f.call({ action: "setStaff", email: "nobody@gmail.com", active: "NO" })
  };
});

run("staff owner only", () => {
  const f = fixture({
    Staff: makeSheet([
      ["Email", "Name", "Active"],
      ["owner@gmail.com", "Owner", "YES"],
      ["desk@gmail.com", "Desk", "YES"]
    ])
  });
  f.ctx.SIGNIN_EMAIL = "desk@gmail.com";
  const list = f.call({ action: "staff" });
  const add = f.call({ action: "addStaff", email: "x@y.com" });
  const set = f.call({ action: "setStaff", email: "owner@gmail.com", active: "NO" });
  f.ctx.SIGNIN_EMAIL = "owner@gmail.com";
  return { list, add, set, rows: rowsOf(f.tabs, "Staff").length };
});

run("staff without active column", () => {
  const f = fixture({
    Staff: makeSheet([["Email", "Name"], ["owner@gmail.com", "Owner"], ["desk@gmail.com", "Desk"]])
  });
  const off = f.call({ action: "setStaff", email: "desk@gmail.com", active: "NO" });
  f.ctx.SIGNIN_EMAIL = "desk@gmail.com";
  const denied = f.call({ action: "list", tab: "Registrations" });
  f.ctx.SIGNIN_EMAIL = "owner@gmail.com";
  return { off, denied, headers: found(f.tabs.Staff)[0], rows: rowsOf(f.tabs, "Staff") };
});

run("auth gates", () => {
  const f = fixture();
  return {
    registration: f.call({ action: "addRegistration", name: "X Y", phone: "0555000888", courses: "English A1", idToken: "" }),
    teacher: f.call({ action: "addTeacher", name: "X Y", phone: "0555000888", idToken: "" })
  };
});

let failures = 0;
const expect = (name, cond, detail) => { if (!cond) { failures++; console.log("FAIL " + name + (detail ? ": " + JSON.stringify(detail) : "")); } };
const r = results;

const ar = r["add registration"];
const row = ar.row || [];
expect("registration created", ar.res.ok === true && ar.res.registrationId === "REG-0002" && ar.count === 2, ar.res);
expect("registration row", row[1] === "Sara Test" && row[4] === "0555000111" && row[5] === "sara@example.com" &&
  row[7] === "English A1, French A2" && row[8] === "YES" && row[10] === "0555000222" &&
  row[12] === "Walk-in" && row[14] === "Pending" && row[13] instanceof Date, row);

const pend = r["registration is pending"];
expect("stays pending", pend.status === "Pending" && pend.students === 2 && pend.enrollments === 0, pend);

const appr = r["registration then approve"];
expect("approve creates student", appr.added.ok === true && appr.approved.ok === true &&
  appr.approved.studentId === "STU-0003" && appr.student[1] === "Bilal Test" &&
  appr.student[11] === "Active" && appr.enrollments.length === 1, appr);

expect("duplicate student", r["duplicate student"].error === "student_exists" && r["duplicate student"].studentId === "STU-0001", r["duplicate student"]);
expect("duplicate pending", r["duplicate pending registration"].error === "already_registered" &&
  r["duplicate pending registration"].registrationId === "REG-0001", r["duplicate pending registration"]);
expect("re-register blocked", r["approved person cannot be re-registered"].again.error === "student_exists" && r["approved person cannot be re-registered"].rows === 2, r["approved person cannot be re-registered"]);

const v = r["registration validation"];
expect("registration guards", v.noName.error === "missing_name" && v.badPhone.error === "invalid_phone" &&
  v.badEmail.error === "invalid_email" && v.badDob.error === "invalid_dob" &&
  v.futureDob.error === "invalid_dob" && v.unknownCourse.error === "unknown_course" &&
  v.noCourse.error === "missing_course" && v.minorNoParent.error === "parent_required" && v.rows === 1, v);

const adult = r["adult registration no parent"];
expect("adult", adult.res.ok === true && adult.row[8] === "" && adult.row[14] === "Pending", adult);

const t = r["add teacher"];
expect("teacher created", t.res.ok === true && t.res.teacherId === "TCH-0001", t);
expect("teacher tab", JSON.stringify(t.headers) === JSON.stringify(["TeacherID", "FullName", "Phone", "Email", "Courses", "Status", "JoinedOn", "Notes"]), t.headers);
expect("teacher row", t.rows.length === 1 && t.rows[0][1] === "Samir New" && t.rows[0][4] === "English A1" &&
  t.rows[0][5] === "Active" && t.rows[0][7] === "Tue/Thu" && t.rows[0][6] instanceof Date, t.rows[0]);

const tv = r["add teacher validation"];
expect("teacher guards", tv.noName.error === "missing_name" && tv.noContact.error === "missing_contact" &&
  tv.badEmail.error === "invalid_email" && tv.badPhone.error === "invalid_phone" &&
  tv.unknownCourse.error === "unknown_course" && tv.futureJoined.error === "invalid_date" &&
  tv.duplicate.error === "teacher_exists" && tv.rows === 2, tv);

expect("teacher dropdown", r["teacher dropdown from sessions"].ok === true &&
  JSON.stringify(r["teacher dropdown from sessions"].teachers) === '["Nadia Saidi"]', r["teacher dropdown from sessions"]);

expect("teachers list tab", r["teachers list creates tab"].res.ok === true &&
  r["teachers list creates tab"].res.rows.length === 0 && r["teachers list creates tab"].headers[0] === "TeacherID",
  r["teachers list creates tab"]);

expect("auth", r["auth gates"].registration.error === "unauthorized" && r["auth gates"].teacher.error === "unauthorized", r["auth gates"]);

const al = r["teacher sheet with other headers"];
expect("teacher aliases", al.res.ok === true && al.res.warnings.length === 1 &&
  al.rows[al.rows.length - 1][0] === "Alias Test" && al.rows[al.rows.length - 1][2] === "French A2" &&
  JSON.stringify(al.names) === '["Old Teacher","Alias Test"]', al);

const noCol = r["teacher sheet without courses column"];
expect("teacher no courses column", noCol.res.ok === true &&
  noCol.res.warnings.some(w => w.indexOf("no column for the courses") !== -1) &&
  noCol.rows[noCol.rows.length - 1][0] === "No Course Col", noCol);

const real = r["teacher with real headers"];
expect("teacher real headers", real.res.ok === true && real.res.warnings.length === 0 &&
  real.count === 2 && real.row[0] === "TCH-0002" && real.row[1] === "Real Header" &&
  real.row[3] === "0551234567" && real.row[5] === "" && real.row[6] === "French A2" &&
  real.row[7] === "Active", real);

const sl = r["staff list"];
expect("staff list", sl.ok === true && sl.headers.join(",") === "Email,Name,Status" &&
  sl.rows.length === 3 && sl.rows[0].Email === "owner@gmail.com" && sl.rows[0]._owner === true &&
  sl.rows[1].Status === "Active" && sl.rows[2].Status === "Revoked" && sl.rows[2]._active === false, sl);

const sa = r["staff add"];
expect("staff add", sa.res.ok === true && sa.res.email === "new.teacher@gmail.com" &&
  sa.rows.length === 2 && sa.rows[1][0] === "new.teacher@gmail.com" &&
  sa.rows[1][1] === "New Teacher" && sa.rows[1][2] === "YES", sa);

const sg = r["staff add guards"];
expect("staff guards", sg.noMail.error === "missing_email" && sg.badMail.error === "invalid_email" &&
  sg.exists.error === "staff_exists" && sg.exists.active === true && sg.rows === 1, sg);

const sr = r["staff revoke and restore"];
expect("staff revoke", sr.off.ok === true && sr.off.active === false && sr.denied.error === "forbidden" &&
  sr.list.rows[1].Status === "Revoked" && sr.on.active === true, sr);

const so = r["staff owner locks"];
expect("staff owner lock", so.self.error === "owner_locked" && so.unknown.error === "not_found", so);

const soo = r["staff owner only"];
expect("staff owner only", soo.list.error === "owner_only" && soo.add.error === "owner_only" &&
  soo.set.error === "owner_only" && soo.rows === 2, soo);

const sn = r["staff without active column"];
expect("staff no active col", sn.off.ok === true && sn.headers[2] === "Active" &&
  sn.denied.error === "forbidden", sn);

if (failures === 0) console.log("OK — " + Object.keys(results).length + " phase-7 checks passed");
else { console.log(JSON.stringify(results, null, 1)); process.exit(1); }
