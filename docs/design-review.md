# Design Review — YALA website

**Date**: 2026-11-02
**URL**: https://yala-website.toufik-siife.workers.dev/ (homepage, courses, register)
**Viewport**: 800 px (tablet / small laptop). Mobile behaviour read from the media queries.

## Overall Impression

Well built and consistent: one stylesheet, token-based colours, one radius, logical
properties throughout so RTL needs no duplicate rules. The problems are all in
**typographic scale** — sizes that sit too close together to read as hierarchy —
plus one real text bug (the phone number) and one missing font decision.

## Findings

### High

- **Register form: heading levels are smaller than the items they label** — the three
  nested levels measure 13.6 px (section) / 13.1 px (subject) / 12.5 px (level), while
  the course names underneath are 15.2 px. With 26 checkboxes the page reads as one
  undifferentiated wall. → Header must be visibly larger and darker than its items.
- **No Arabic typeface** — `body` falls back to `system-ui, "Segoe UI", Tahoma, Arial`,
  so Arabic renders differently on Windows, Android and iOS and the school's own
  name has no consistent voice. For an Arabic-first site, type *is* the brand.
  → Add a free Arabic webfont, keep the current stack as fallback.
- **Card titles sit 1.6 px above card body text** — `.card h3` 16.8 px vs `.card p`
  15.2 px. Symptoms of "a developer designed this". → Raise card titles to 20 px.

### Medium

- **Phone number renders reversed in the footer of every page** — `+213 652 78 36 47`
  inside a `dir="rtl"` link displays as `47 36 78 652 213+`. `contact.html:52` already
  carries `dir="ltr"`; `index.html:157` and `contact.html:100` were missed.
  → Add `dir="ltr"` to the two remaining spots.
- **Three-card "why us" grid leaves a hole** — `.grid.cols-3` becomes 2 columns at
  620 px but only reaches 3 columns at 900 px, so between those widths the third card
  sits alone with an empty cell beside it. → Let a lone last card span the row.
- **Status colours bypass the tokens** — `#B42318`, `#7A271A`, `#FEF3F2`, `#08331C`,
  `#25D366` are hard-coded, and there are three near-identical border greys
  (`#C7D0DC`, `#E3E8EF`, `#C9D6E6`, `#E4ECF5`). Small consistency debt.

### Low

- **Eight one-off font sizes** (`.78 .82 .85×5 .9 .95 1.05×2 1.1 1.2`) instead of a scale.
- **`.section { padding-block: 52px }`** is off any 4/8 px rhythm.
- **The 34×3 px green `.accent` bar** tops every card but carries no meaning — decoration
  in an otherwise semantic design.

## What Looks Good — preserve

- **Logical properties everywhere** (`margin-inline`, `padding-block`,
  `inset-inline-start`) — RTL works with zero duplicated rules. Rare and excellent.
- **Tokens** for five brand colours and a single `--radius`; one border style.
- **Accessibility care**: `:focus-visible` orange outline, a real skip link, `hidden`
  honeypot, `overflow-wrap: anywhere` so the long email cannot overflow the footer.
- **A documented contrast decision** on the primary button — white on brand orange is
  2.6:1, so ink text is used instead. That comment is expert work.
- **Mobile-first**, only five media queries for a whole site.

## Not a bug (checked, no action)

- The date field showing `mm/dd/yyyy` follows the **browser's** locale, not the page.
  An Arabic/Algerian browser shows `dd/mm/yyyy`. Nothing to change in code.
- The large white area in "أين تجدنا" is a **sparse section** (heading + one address
  line + a button, no map), not a broken element. It reads as unfinished because the
  site has no map anywhere. Content decision: embed a free map, or fold the address
  into Contact and drop the section.

## Top 3 Fixes

1. Register form heading hierarchy (headers larger and darker than their 26 items).
2. An Arabic webfont with the system stack as fallback.
3. Card title size — 16.8 px → 20 px.