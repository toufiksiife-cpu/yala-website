// Phase 9 harness: Config catalog columns, saveCatalog_/addCourse_, and the
// public catalog_ order/hide/Arabic when read by api.gs.
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
    setFrozenRows: () => {}
  };
}

const CONFIG_ROWS = () => [
  ["SettingName", "SettingValue", "Category", "SubCategory", "SubSubCategory", "CourseName", "FullCourseName", "MonthlyFeeDZD", "Room"],
  ["SchoolName", "YALA", "", "", "", "", "", "", ""],
  ["", "", "Primary School Support", "French", "Lecture", "Soutien Français Lecture", "Primary School Support - French - Lecture - Soutien Français Lecture", 2500, "Room 1"],
  ["", "", "Primary School Support", "Mathematics", "Calcul", "Soutien Maths Calcul", "Primary School Support - Mathematics - Calcul - Soutien Maths Calcul", 2500, "Room 2"],
  ["", "", "Adult Language Courses", "English", "A1-A2", "English Adults Débutant", "Adult Language Courses - English - A1-A2 - English Adults Débutant", 4000, "Room 2"]
];

function fixture() {
  const tabs = { Config: makeSheet(CONFIG_ROWS()) };
  const ctx = {
    Date, JSON, Number, String, Math, Array, isFinite, isNaN, encodeURIComponent, console,
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
    Utilities: { formatDate: () => "" },
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
const run = (name, fn) => { try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; } };

run("catalog creates columns", () => {
  const f = fixture();
  const res = f.call({ action: "catalog" });
  const head = f.tabs.Config.values[0];
  return {
    ok: res.ok,
    head: head.join("|"),
    categories: res.categories.map(c => c.key + "@" + c.order + "=" + c.courses.length),
    arabic: res.categories.map(c => c.ar),
    rows: res.categories.map(c => c.courses.map(x => x.row).join(",")),
    fee: res.categories[0].courses[0].fee,
    hidden: res.categories[0].courses[0].hidden
  };
});

run("save reorders and hides", () => {
  const f = fixture();
  const before = f.call({ action: "catalog" });
  const cats = before.categories.slice().reverse().map((c, i) => ({ key: c.key, arabic: c.ar + " (new)", order: i + 1 }));
  const courses = [];
  before.categories.forEach(cat => {
    cat.courses.forEach((c, i) => {
      courses.push({
        row: c.row, name: c.name, fee: c.fee, room: c.room,
        hidden: c.row === 3, order: i + 1
      });
    });
  });
  courses[0].fee = 2750;
  const res = f.call({ action: "saveCatalog", categories: cats, courses: courses });
  const sheet = f.tabs.Config.getDataRange().getValues();
  const head = sheet[0];
  const at = (rowIdx, name) => sheet[rowIdx][head.indexOf(name)];
  const after = f.call({ action: "catalog" });
  return {
    res,
    firstAfter: after.categories[0].key,
    arabicAfter: after.categories[0].ar,
    hiddenRow3: at(2, "Hidden"),
    feeRow3: at(2, "MonthlyFeeDZD"),
    sortRow4: at(3, "SortOrder"),
    hiddenStillListed: after.categories.some(c => c.courses.some(x => x.row === 3 && x.hidden))
  };
});

run("save rejects empty name", () => {
  const f = fixture();
  const before = f.call({ action: "catalog" });
  const courses = before.categories[0].courses.map(c => ({
    row: c.row, name: c.row === 3 ? "" : c.name, fee: 9999, room: c.room, hidden: false, order: 1
  }));
  const res = f.call({ action: "saveCatalog", categories: [], courses: courses });
  const sheet = f.tabs.Config.getDataRange().getValues();
  return { res, feeUntouched: sheet[2][7] };
});

run("save rejects a bad fee", () => {
  const f = fixture();
  const res = f.call({ action: "saveCatalog", categories: [], courses: [{ row: 3, name: "x", fee: -5, room: "", hidden: false, order: 1 }] });
  return { res };
});

run("add course", () => {
  const f = fixture();
  const res = f.call({ action: "addCourse", category: "Primary School Support", name: "Soutien Anglais Primaire", fee: 2600, room: "" });
  const dup = f.call({ action: "addCourse", category: "Primary School Support", name: "Soutien Anglais Primaire", fee: 2600 });
  const unknown = f.call({ action: "addCourse", category: "Nope", name: "X", fee: 1000 });
  const catalog = f.call({ action: "catalog" });
  const added = catalog.categories.find(c => c.key === "Primary School Support").courses.find(c => c.row === res.row);
  return {
    res, dup, unknown,
    added,
    lastRow: f.tabs.Config.values[f.tabs.Config.values.length - 1].slice(0, 2),
    sort: f.tabs.Config.values[f.tabs.Config.values.length - 1]
  };
});

/* ---------- public API ---------- */

function publicFixture() {
  const tabs = {
    Config: makeSheet([
      ["Category", "SubCategory", "SubSubCategory", "CourseName", "FullCourseName", "MonthlyFeeDZD", "Room", "CategoryOrder", "CategoryArabic", "SortOrder", "Hidden"],
      ["Adult Language Courses", "English", "A1", "Adults A1", "Adult Language Courses - English - A1 - Adults A1", 4000, "Room 2", 2, "دورات اللغات للكبار", 2, ""],
      ["Primary School Support", "French", "Lecture", "Lecture", "Primary School Support - French - Lecture - Lecture", 2500, "Room 1", 1, "دعم مدرسي — الابتدائي", 2, ""],
      ["Adult Language Courses", "English", "A1", "Hidden One", "Adult Language Courses - English - A1 - Hidden One", 4000, "Room 2", 2, "دورات اللغات للكبار", 1, "YES"],
      ["Primary School Support", "Maths", "Calcul", "Calcul", "Primary School Support - Maths - Calcul - Calcul", 2500, "Room 2", 1, "دعم مدرسي — الابتدائي", 1, ""]
    ]),
    Registrations: makeSheet([["RegistrationID"], ["REG-0001"]])
  };
  const store = {};
  const ctx = {
    Date, JSON, Number, String, Math, Array, isFinite, isNaN, encodeURIComponent, console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => tabs[n] || null }) },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => store[k] || null,
        put: (k, v) => { store[k] = v; }
      })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("apps-script/api.gs", "utf8"), ctx);
  return { ctx, tabs, get: (q) => JSON.parse(ctx.doGet({ parameter: { action: "courses" } }).text) };
}

run("public catalog order and hide", () => {
  const f = publicFixture();
  const data = f.get();
  const names = (cat) => cat.groups.reduce((all, g) =>
    all.concat(g.levels.reduce((l, level) => l.concat(level.courses.map(c => c.name)), [])), []);
  return {
    keys: data.categories.map(c => c.key),
    ar: data.categories.map(c => c.ar),
    primary: data.categories[0] && names(data.categories[0]),
    adults: data.categories[1] && names(data.categories[1]),
    groups: data.categories[0] && data.categories[0].groups.map(g => g.name),
    allowed: f.ctx.courseNames_().join("|")
  };
});

const expect = (label, ok, detail) => {
  if (!ok) {
    console.log("FAIL — " + label + ": " + JSON.stringify(detail));
    process.exitCode = 1;
  }
};
const r = results;

const created = r["catalog creates columns"];
expect("columns created", typeof created === "object" && created.ok === true &&
  created.head.split("|").slice(-7).join(",") === "CategoryOrder,CategoryArabic,CourseNameArabic,SubCategoryArabic,SubSubCategoryArabic,SortOrder,Hidden" &&
  created.categories.join(",") === "Primary School Support@1=2,Adult Language Courses@5=1" &&
  created.arabic[0] === "دعم مدرسي — الابتدائي" &&
  created.rows.join(",") === "3,4,5" && created.fee === 2500 && created.hidden === false, created);

const reordered = r["save reorders and hides"];
expect("save reorders", typeof reordered === "object" && reordered.res.ok === true &&
  reordered.firstAfter === "Adult Language Courses" &&
  reordered.arabicAfter === "دورات اللغات للكبار (new)" &&
  reordered.hiddenRow3 === "YES" && reordered.feeRow3 === 2750 &&
  reordered.sortRow4 === 2 && reordered.hiddenStillListed === true, reordered);

const rejected = r["save rejects empty name"];
expect("reject empty name", typeof rejected === "object" && rejected.res.ok === false &&
  rejected.res.error === "name_required" && rejected.feeUntouched === 2500, rejected);

const badFee = r["save rejects a bad fee"];
expect("reject bad fee", typeof badFee === "object" && badFee.res.error === "bad_fee", badFee);

const added = r["add course"];
expect("add course", typeof added === "object" && added.res.ok === true && added.res.row === 6 &&
  added.res.full === "Primary School Support - Soutien Anglais Primaire" &&
  added.dup.error === "course_exists" && added.unknown.error === "unknown_category" &&
  added.added && added.added.fee === 2600 && added.added.name === "Soutien Anglais Primaire" &&
  added.added.order === 5, added);

const pub = r["public catalog order and hide"];
expect("public order", typeof pub === "object" && pub.keys.join(",") === "Primary School Support,Adult Language Courses" &&
  pub.ar[0] === "دعم مدرسي — الابتدائي" &&
  pub.groups.join(",") === "Maths,French" &&
  pub.primary.join(",") === "Calcul,Lecture" &&
  pub.adults.join(",") === "Adults A1" &&
  pub.allowed.indexOf("Hidden One") === -1, pub);

if (!process.exitCode) console.log("OK — " + Object.keys(results).length + " phase-9 checks passed");
