# Course catalog from the staff page

The **Courses** tab in `/admin` controls how courses are organised on the public
website and in the registration form, without opening the spreadsheet.

The tree has four levels:

```
Section            e.g. Languages              (Category)
  Sub-section      e.g. English                (SubCategory)
    Level          e.g. A1                     (SubSubCategory)
      Course       e.g. English A1             (CourseName)
```

The website and the register form show the same four levels. Prices stay on the
staff page: the public API never sends them.

## One-time deploy (two Apps Script projects)

1. **YALA ADMIN** — open the project, replace `Code.gs` with `apps-script/admin.gs`,
   then **Deploy → Manage deployments → ✏️ → New version** (URL stays the same).
2. **YALA API** — same with `apps-script/api.gs`.
3. Open `/admin`, sign in, go to **Courses**.

The first time the tab opens, these columns are added to `Config` and filled for
the existing rows:

| Column | Meaning |
| --- | --- |
| `CategoryOrder` | position of the section (1 first) |
| `CategoryArabic` | Arabic section heading |
| `SubCategoryArabic` | Arabic sub-section heading |
| `SubSubCategoryArabic` | Arabic level heading |
| `SortOrder` | position of the course, which also orders its sub-sections and levels |
| `Hidden` | `YES` = not shown on the site or the register form |

`FullCourseName` (the key stored on registrations, enrollments and teacher
assignments) is never rewritten. `SubCategory` / `SubSubCategory` hold the two
middle names; leave one empty when a section needs only two levels.

## Using it

- **Move anything**: the ↑ ↓ buttons next to the section, sub-section, level or course.
- **Rename**: edit the English box (what visitors see in English) or the Arabic box.
  Renaming a sub-section or level renames it for every course inside it.
- **Change a price or room**: edit the number / text boxes on the course row.
- **Hide a course**: tick *Hidden*. It disappears from the public site, the
  register form and the staff course pickers; old registrations keep it.
- **Add a course**: *+ Add a course*, pick the section, type the sub-section and
  level (or reuse an existing name), then the course name and fee.
  Its permanent key becomes `Section - Sub-section - Level - Name`.
- **Nothing is saved until you press _Save changes_**. The website shows the
  change within a minute (the public API caches for 60 seconds).

Renaming a course changes only the name visitors see. Existing records keep the
old `FullCourseName`, so history, payments and teacher assignments stay intact.

## Limits

- Two people saving at the same moment: the last save wins.
- No delete: hide instead, so old rows never point at a missing course.
- Sections cannot be created from the page yet; typing a new section name in the
  Sheet's `Category` column is still how a new section starts. Sub-sections and
  levels need no setup: a new name in the Add form creates them.
