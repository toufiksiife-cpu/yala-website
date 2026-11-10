/* Language switch + mobile menu. No dependencies. */
(function () {
  var KEY = "yala-lang";

  // Some browsers block storage in private mode; the site must still work.
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // One button cycles Arabic -> English -> French -> Arabic.
  var LANGS = ["ar", "en", "fr"];
  var lang = read();
  if (LANGS.indexOf(lang) === -1) lang = "ar";

  // ?lang=xx makes each language linkable and crawlable; it wins over the stored choice.
  var q = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  if (LANGS.indexOf(q) !== -1) lang = q;

  // English and French are applied over the Arabic markup. Arabic is the HTML
  // itself, so no-JS visitors and Google still get full Arabic content.
  var t = lang === "en" ? window.I18N_EN : lang === "fr" ? window.I18N_FR : null;
  if (t) {
    document.documentElement.lang = lang;
    document.documentElement.dir = "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t[el.getAttribute("data-i18n")];
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var v = t[el.getAttribute("data-i18n-aria")];
      if (v) el.setAttribute("aria-label", v);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var v = t[el.getAttribute("data-i18n-placeholder")];
      if (v) el.setAttribute("placeholder", v);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var v = t[el.getAttribute("data-i18n-alt")];
      if (v) el.setAttribute("alt", v);
    });
    var titleKey = document.documentElement.getAttribute("data-title");
    if (titleKey && t[titleKey]) document.title = t[titleKey];

    // Each language is its own URL: a translation must not point search
    // engines back to the Arabic page, or it never gets indexed.
    var canon = document.querySelector('link[rel="canonical"]');
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (canon) {
      var altUrl = canon.getAttribute("href") + "?lang=" + lang;
      canon.setAttribute("href", altUrl);
      if (ogUrl) ogUrl.setAttribute("content", altUrl);
    }
  }

  document.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-lang-toggle]");
    if (toggle) {
      // Reload so Arabic comes back from the HTML, not from a second copy.
      var next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
      write(next);
      var url = new URL(location.href);
      if (next === "ar") url.searchParams.delete("lang");
      else url.searchParams.set("lang", next);
      location.href = url.toString();
      return;
    }
    var burger = e.target.closest("[data-menu-toggle]");
    if (burger) {
      var nav = document.getElementById("site-nav");
      var open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    }
  });

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
