/* Language switch + mobile menu. No dependencies. */
(function () {
  var KEY = "yala-lang";

  // Some browsers block storage in private mode; the site must still work.
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  var lang = read() === "en" ? "en" : "ar";

  // ?lang=en makes the English page linkable and crawlable; it wins over the stored choice.
  var q = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  if (q === "en" || q === "ar") lang = q;

  // English is applied over the Arabic markup. Arabic is the HTML itself,
  // so no-JS visitors and Google still get full Arabic content.
  if (lang === "en" && window.I18N_EN) {
    var t = window.I18N_EN;
    document.documentElement.lang = "en";
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

    // The English page is its own URL: it must not point search engines back to
    // the Arabic one, or English never gets indexed.
    var canon = document.querySelector('link[rel="canonical"]');
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (canon) {
      var enUrl = canon.getAttribute("href") + "?lang=en";
      canon.setAttribute("href", enUrl);
      if (ogUrl) ogUrl.setAttribute("content", enUrl);
    }
  }

  var burger = document.querySelector("[data-menu-toggle]");

  function closeMenu() {
    var nav = document.getElementById("site-nav");
    if (!nav || !nav.classList.contains("open")) return false;
    nav.classList.remove("open");
    if (burger) burger.setAttribute("aria-expanded", "false");
    return true;
  }

  document.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-lang-toggle]");
    if (toggle) {
      // Reload so Arabic comes back from the HTML, not from a second copy.
      write(lang === "en" ? "ar" : "en");
      var url = new URL(location.href);
      if (lang === "en") url.searchParams.delete("lang");
      else url.searchParams.set("lang", "en");
      location.href = url.toString();
      return;
    }
    var btn = e.target.closest("[data-menu-toggle]");
    if (btn) {
      var nav = document.getElementById("site-nav");
      if (!nav) return;
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    // Any tap outside the panel closes it, like every phone menu.
    if (!e.target.closest("#site-nav")) closeMenu();
  });

  // Escape closes the menu and puts focus back on the button that opened it.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && closeMenu() && burger) burger.focus();
  });

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
