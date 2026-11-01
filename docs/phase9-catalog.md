# Phase 9 — course catalog from the staff page

The **Courses** tab in `/admin` now controls how courses are organised on the
website and in the registration form, without opening the spreadsheet.

## One-time deploy (two Apps Script projects)

1. **YALA ADMIN** — open the project, replace `Code.gs` with `apps-script/admin.gs`,
   then **Deploy → Manage deployments → ✏️ → New version** (URL stays the same).
2. **YALA API** — same with `apps-script/api.gs`.
3. Open `/admin`, sign in, go to **Courses**.

The first time the tab opens, four columns are added to `Config` and filled for
the existing rows:

| Column | Meaning |
| --- | --- |
| `CategoryOrder` | position of the section (1 first) |
| `CategoryArabic` | Arabic heading shown on the public site |
| `SortOrder` | position of the course inside its section |
| `Hidden` | `YES` = not shown on the site or the register form |

Nothing else in `Config` changes. `FullCourseName` (the key stored on
registrations, enrollments and teacher assignments) is never rewritten.

## Using it

- **Move a section or a course**: the ↑ ↓ buttons next to it.
- **Rename a section**: edit the Arabic name box. The English key (and therefore
  the English website) stays as it is.
- **Change a price or room**: edit the number / text boxes.
- **Hide a course**: tick *Hidden*. It disappears from the public site, the
  register form and the staff course pickers; old registrations keep it.
- **Add a course**: *+ Add a course*, pick the section, type the name and fee.
  Its permanent key becomes `Section - Name`.
- **Nothing is saved until you press _Save changes_**. The website shows the
  change within a minute (the public API caches for 60 seconds).

Renaming a course changes only the name visitors see. Existing records keep the
old key, so history, payments and teacher assignments stay intact.

## Limits

- Two people saving at the same moment: the last save wins.
- No delete: hide instead, so old rows never point at a missing course.
- Sections cannot be created from the page yet; typing a new section name in the
  Sheet's `Category` column is still how a new section starts.
