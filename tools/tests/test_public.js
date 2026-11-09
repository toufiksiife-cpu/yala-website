// Public pages: every page has the SEO/head tags and every data-i18n key used in
// the HTML exists in the English dictionary.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");
const pages = ["index.html", "courses.html", "register.html", "about.html", "contact.html", "privacy.html", "404.html"];

let pass = 0;
const fails = [];
function check(name, ok) { if (ok) pass++; else fails.push(name); }

const dict = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "assets", "locales.js"), "utf8"), dict);
const keys = dict.window.I18N_EN || {};

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  check(page + " has a canonical link", page === "404.html" || /rel="canonical"/.test(html));
  check(page + " has hreflang alternates", page === "404.html" || (/hreflang="en"/.test(html) && /hreflang="ar"/.test(html)));
  check(page + " loads the self-hosted font", /assets\/css\/fonts\.css/.test(html));
  check(page + " has no Google Fonts request", !/fonts\.(googleapis|gstatic)\.com/.test(html));
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) {
    check(page + " translation: " + m[1], Object.prototype.hasOwnProperty.call(keys, m[1]));
  }
  for (const m of html.matchAll(/data-i18n-alt="([^"]+)"/g)) {
    check(page + " alt translation: " + m[1], Object.prototype.hasOwnProperty.call(keys, m[1]));
  }
}

const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const gallery = [...home.matchAll(/<img[^>]+src="assets\/img\/gallery\/[^"]+"[^>]*>/g)].map(m => m[0]);
check("homepage shows the gallery", gallery.length === 7);
for (const tag of gallery) {
  const file = /src="([^"]+)"/.exec(tag)[1];
  check(file + " exists", fs.existsSync(path.join(root, file)));
  check(file + " has alt text", /alt="[^"]+"/.test(tag));
  check(file + " reserves its size", /width="\d+"/.test(tag) && /height="\d+"/.test(tag));
  check(file + " is lazy", /loading="lazy"/.test(tag));
}

const courses = fs.readFileSync(path.join(root, "courses.html"), "utf8");
check("courses caches the catalog", /sessionStorage\.setItem\(CACHE_KEY/.test(courses));
check("courses gives up after a timeout", /AbortController/.test(courses) && /15000/.test(courses));
check("courses offers a retry button", /courses-retry/.test(courses));

const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");
check("css has skeleton placeholders", /\.skeleton\s*\{/.test(css));
check("css has step numbers", /\.step::before/.test(css));

if (fails.length) {
  console.log("FAIL — " + fails.length + " public page check(s)");
  fails.slice(0, 20).forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("OK — " + pass + " public page checks passed");
