# Phase 7 — register students and teachers from the staff page

Two new entry points for staff:

- **Registrations → + Add student**: writes a normal **Pending** registration, which you then approve like any web registration.
- **Teachers → + Add teacher**: writes a row in a new `Teachers` tab.

## Deploy

Same file as Phase 5/6, one paste + redeploy:

1. Open `https://raw.githubusercontent.com/toufiksiife-cpu/yala-website/main/apps-script/admin.gs`
2. `Ctrl+A`, `Ctrl+C`.
3. Spreadsheet → **Extensions → Apps Script** → **YALA ADMIN** → click in the code → `Ctrl+A` → `Delete` → `Ctrl+V` → `Ctrl+S`.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
5. Reload `/admin`. You now see a **Teachers** tab.

## Register a student (front desk)

**Registrations → + Add student**

| Field | Needed |
|---|---|
| Full name | yes |
| Phone | yes, 8 to 15 digits |
| Email | no |
| Date of birth | no; if the student is under 18 the parent name and phone become required |
| Parent name/phone/relationship | only for under 18 |
| Courses | at least one, ticked from `Config` |
| Notes | no |

Saving adds a row to `Registrations` with `Status = Pending`. Approve it from the same list — that is what creates the student and their course enrollments. Nothing becomes an Active student without that click.

Blocked cases: the person is already in `Students` ("Already a student: STU-…"), or already has an unapproved registration ("Already in Registrations as REG-…"), bad phone/email/date, under 18 without parent details, unknown or missing course.

## Add a teacher

**Teachers → + Add teacher**

| Field | Needed |
|---|---|
| Full name | yes |
| Phone or email | at least one |
| Started on | no; empty means today |
| Courses | no, tick the ones they teach |
| Notes | no |

The **Teachers** tab is created on first use:

`TeacherID | FullName | Phone | Email | Courses | Status | JoinedOn | Notes`

Set `Status` to `Inactive` in the sheet to hide a teacher from the class dropdown.

## Weekly class teacher

In **Attendance → + Add a weekly class**, the teacher box is now a dropdown of active teachers from the `Teachers` tab.

## Limits

- No teacher login: `/admin` still only accepts Google accounts listed in the `Staff` tab. Add the teacher's email there if they should sign in.
- No edit or delete from the page: edit the row in the sheet.
- Teachers hold no salary or contract data — `JoinedOn` and `Notes` only.
- Staff registrations are marked `Pending`, so the dashboard "pending registrations" count includes them.
