// Phase 10 harness: four-level catalog in Config + public nested, price-free catalog.
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
    setFrozenRows: () => {}
  };
}

const HEAD = ["Category", "SubCategory", "SubSubCategory", "CourseName", "FullCourseName",
  "MonthlyFeeDZD", "Room", "CategoryOrder", "CategoryArabic", "SubCategoryArabic",
  "SubSubCategoryArabic", "SortOrder", "Hidden"];

// Row order in the sheet is deliberately scrambled to prove the tree follows SortOrder.
const CONFIG_ROWS = () => [
  HEAD,
  ["Adult Language Courses", "English", "A1", "English A1", "Adult Language Courses - English - A1 - English A1", 4000, "Room 2", 2, "دورات اللغات للكبار", "الإنجليزية", "A1", 2, ""],
  ["Primary School Support", "First year", "Mathematics", "First year primary mathematics", "Primary School Support - First year - Mathematics - First year primary mathematics", 2500, "Room 1", 1, "دعم مدرسي — الابتدائي", "السنة الأولى", "الرياضيات", 2, ""],
  ["Adult Language Courses", "English", "A2", "English A2", "Adult Language Courses - English - A2 - English A2", 4000, "Room 2", 2, "دورات اللغات للكبار", "الإنجليزية", "A2", 1, ""],
  ["Primary School Support", "First year", "French", "French", "Primary School Support - First year - French - French", 2500, "Room 1", 1, "دعم مدرسي — الابتدائي", "السنة الأولى", "الفرنسية", 1, ""],
  ["Primary School Support", "Second year", "Mathematics", "Second year mathematics", "Primary School Support - Second year - Mathematics - Second year mathematics", 2500, "Room 1", 1, "دعم مدرسي — الابتدائي", "السنة الثانية", "الرياضيات", 3, ""],
  ["Adult Language Courses", "English", "A1", "Hidden A1", "Adult Language Courses - English - A1 - Hidden A1", 4000, "Room 2", 2, "دورات اللغات للكبار", "الإنجليزية", "A1", 3, "YES"]
];

function fixture(scriptPath) {
  const tabs = {
    Config: makeSheet(CONFIG_ROWS()),
    Teachers: makeSheet([["TeacherID", "Name", "Status"], ["TCH-1", "Mr. Karim", "Active"], ["TCH-2", "Mme. Amina", "Active"], ["TCH-3", "Gone Coach", "Inactive"]])
  };
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
    Utilities: { formatDate: () => "" },
    ContentService: {
      createTextOutput: (t) => { const o = { text: t, setMimeType: () => o }; return o; },
      MimeType: { JSON: "json" }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(scriptPath, "utf8"), ctx);
  ctx.CLIENT_ID = "our.apps.googleusercontent.com";
  return { ctx, tabs };
}

function adminFixture() {
  const f = fixture("apps-script/admin.gs");
  f.call = (body) => JSON.parse(f.ctx.doPost({
    postData: { contents: JSON.stringify(Object.assign({ idToken: "t" }, body)) }
  }).text);
  return f;
}

function publicFixture() {
  const f = fixture("apps-script/api.gs");
  return { ctx: f.ctx, get: () => JSON.parse(f.ctx.doGet({ parameter: { action: "courses" } }).text) };
}

const results = {};
const run = (name, fn) => {
  try { results[name] = fn(); } catch (e) { results[name] = "THREW " + e.message; }
};

run("admin catalog nests fields", () => {
  const f = adminFixture();
  const res = f.call({ action: "catalog" });
  const head = f.tabs.Config.values[0];
  return {
    ok: res.ok,
    head: head.join("|"),
    cats: res.categories.map(c => c.key + "@" + c.order + "=" + c.courses.length),
    primary: res.categories[0].courses.map(c => [c.subject, c.level, c.subjectAr, c.levelAr].join("/")),
    fees: res.categories[0].courses.map(c => c.fee),
    teachers: res.teachers
  };
});

run("save renames a section and moves a course", () => {
  const f = adminFixture();
  const before = f.call({ action: "catalog" });
  const targetFull = "Primary School Support - First year - Mathematics - First year primary mathematics";
  const courses = [];
  before.categories.forEach(cat => {
    cat.courses.forEach((c, i) => {
      const moved = c.full === targetFull;
      courses.push({
        row: c.row, name: c.name, fee: c.fee, room: c.room,
        subject: moved ? "First year" : c.subject,
        level: moved ? "Mathematics advanced" : c.level,
        subjectAr: c.subjectAr, levelAr: moved ? "الرياضيات المتقدمة" : c.levelAr,
        teacher: moved ? "Mr. Karim" : (c.teacher || ""),
        hidden: c.hidden, order: i + 1
      });
    });
  });
  const cats = before.categories.map((cat, i) => ({
    key: cat.key, name: i === 0 ? "Primary Support" : cat.key, arabic: cat.ar + "!", order: i + 1
  }));
  const res = f.call({ action: "saveCatalog", categories: cats, courses: courses });

  const rows = f.tabs.Config.getDataRange().getValues();
  const col = (name) => HEAD.indexOf(name);
  const byFull = {};
  for (let r = 1; r < rows.length; r++) byFull[rows[r][col("FullCourseName")]] = rows[r];
  const moved = byFull[targetFull];
  const primaryCategories = rows.slice(1)
    .filter(r => String(r[col("FullCourseName")]).indexOf("Primary School Support - ") === 0)
    .map(r => r[col("Category")]);

  return {
    res,
    movedLevel: moved[col("SubSubCategory")],
    movedLevelAr: moved[col("SubSubCategoryArabic")],
    movedFull: moved[col("FullCourseName")],
    teacherColumn: rows[0].indexOf("Teacher"),
    movedTeacher: moved[rows[0].indexOf("Teacher")],
    primaryCategories,
    arabic: moved[col("CategoryArabic")]
  };
});

run("save rejects duplicate section names", () => {
  const f = adminFixture();
  const before = f.call({ action: "catalog" });
  const cats = before.categories.map(cat => ({ key: cat.key, name: "Same", arabic: cat.ar, order: 1 }));
  return { res: f.call({ action: "saveCatalog", categories: cats, courses: [] }) };
});

run("add course fills the tree", () => {
  const f = adminFixture();
  const res = f.call({
    action: "addCourse", category: "Adult Language Courses",
    subject: "Spanish", level: "A1", name: "Spanish A1", fee: 4200, room: "Room 3", teacher: "Mme. Amina"
  });
  const added = f.tabs.Config.values[f.tabs.Config.values.length - 1];
  const head = f.tabs.Config.values[0];
  const dup = f.call({
    action: "addCourse", category: "Adult Language Courses",
    subject: "Spanish", level: "A1", name: "Spanish A1", fee: 4200
  });
  const after = f.call({ action: "catalog" });
  return {
    res, dup,
    row: added.slice(0, 4),
    sort: added[HEAD.indexOf("SortOrder")],
    teacherColumn: head.indexOf("Teacher") !== -1 && added[head.indexOf("Teacher")] === "Mme. Amina",
    inCatalog: after.categories[1].courses.some(c => c.row === res.row && c.level === "A1" && c.subject === "Spanish")
  };
});

run("public catalog is nested and price-free", () => {
  const f = publicFixture();
  const data = f.get();
  return {
    keys: data.categories.map(c => c.key + "@" + c.ar),
    groups: data.categories.map(c => c.groups.map(g => g.name + "@" + g.ar)),
    levels: data.categories.map(c => c.groups.map(g => g.levels.map(l => l.name + "@" + l.ar))),
    primary: data.categories[0].groups.map(g => g.levels.map(l => l.courses.map(x => x.name))),
    adults: data.categories[1] ? data.categories[1].groups[0].levels.map(l => l.name + ":" + l.courses.map(x => x.name).join(",")) : null,
    hasFee: JSON.stringify(data).indexOf("fee") !== -1,
    hasHidden: JSON.stringify(data).indexOf("Hidden A1") !== -1
  };
});

const expect = (label, ok, detail) => {
  if (!ok) {
    console.log("FAIL — " + label + ": " + JSON.stringify(detail));
    process.exitCode = 1;
  }
};

const nested = results["admin catalog nests fields"];
expect("admin columns + fields", typeof nested === "object" && nested.ok === true &&
  nested.head.indexOf("SubCategoryArabic") !== -1 && nested.head.indexOf("SubSubCategoryArabic") !== -1 &&
  nested.cats.join(",") === "Primary School Support@1=3,Adult Language Courses@2=3" &&
  nested.primary[0] === "First year/French/السنة الأولى/الفرنسية" &&
  nested.primary[1] === "First year/Mathematics/السنة الأولى/الرياضيات" &&
  nested.primary[2] === "Second year/Mathematics/السنة الثانية/الرياضيات" &&
  nested.fees.join(",") === "2500,2500,2500", nested);
expect("catalog lists active teachers", Array.isArray(nested.teachers) &&
  JSON.stringify(nested.teachers) === JSON.stringify(["Mr. Karim", "Mme. Amina"]), nested.teachers);

const saved = results["save renames a section and moves a course"];
expect("save renames + moves", typeof saved === "object" && saved.res.ok === true &&
  saved.movedLevel === "Mathematics advanced" &&
  saved.movedLevelAr === "الرياضيات المتقدمة" &&
  saved.movedFull === "Primary School Support - First year - Mathematics - First year primary mathematics" &&
  saved.primaryCategories.join("|") === "Primary Support|Primary Support|Primary Support" &&
  saved.arabic === "دعم مدرسي — الابتدائي!" &&
  saved.teacherColumn !== -1 && saved.movedTeacher === "Mr. Karim", saved);

const dupCat = results["save rejects duplicate section names"];
expect("duplicate section rejected", typeof dupCat === "object" && dupCat.res.ok === false &&
  dupCat.res.error === "duplicate_category", dupCat);

const added = results["add course fills the tree"];
expect("add course", typeof added === "object" && added.res.ok === true &&
  added.res.full === "Adult Language Courses - Spanish - A1 - Spanish A1" &&
  added.row[1] === "Spanish" && added.row[2] === "A1" && added.row[3] === "Spanish A1" &&
  added.dup.error === "course_exists" && added.inCatalog === true &&
  added.teacherColumn === true && added.sort === 4, added);

const pub = results["public catalog is nested and price-free"];
expect("public tree", typeof pub === "object" &&
  pub.keys.join(",") === "Primary School Support@دعم مدرسي — الابتدائي,Adult Language Courses@دورات اللغات للكبار" &&
  pub.groups[0].join(",") === "First year@السنة الأولى,Second year@السنة الثانية" &&
  pub.levels[0][0].join(",") === "French@الفرنسية,Mathematics@الرياضيات" &&
  pub.primary[0][0].join(",") === "French" &&
  pub.primary[0][1].join(",") === "First year primary mathematics" &&
  pub.primary[1][0].join(",") === "Second year mathematics" &&
  pub.adults.join(",") === "A2:English A2,A1:English A1" &&
  pub.hasFee === false && pub.hasHidden === false, pub);

if (!process.exitCode) console.log("OK — " + Object.keys(results).length + " phase-10 checks passed");
