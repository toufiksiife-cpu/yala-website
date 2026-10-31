# Phase 7 — add students and teachers from the staff page

Staff can now register people directly: a student goes straight to Active with their courses, and a teacher gets a row in a new `Teachers` tab.

## Deploy

Same file as Phase 5/6, one paste + redeploy:

1. Open `https://raw.githubusercontent.com/toufiksiife-cpu/yala-website/main/apps-script/admin.gs`
2. `Ctrl+A`, `Ctrl+C`.
3. Spreadsheet → **Extensions → Apps Script** → **YALA ADMIN** → click in the code → `Ctrl+A` → `Delete` → `Ctrl+V` → `Ctrl+S`.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
5. Reload `/admin`. You now see a **Teachers** tab.

## Add a student

**Students → + Add student**

| Field | Needed |
|---|---|
| Full name | yes |
| Phone | yes, 8 to 15 digits |
| Email | no |
| Date of birth | no; if the student is under 18 the parent name and phone become required |
| Parent name/phone/relationship | only for under 18 |
| Courses | at least one, ticked from `Config` |

Saving writes one `Students` row with `Status = Active` and one `Enrollments` row per ticked course (fee copied from `Config`). No Registrations row, no approval — staff typing it is the approval. The student appears in attendance rosters immediately.

If the same name + phone (or name + date of birth) is already in `Students`, nothing is written and the page says which StudentID already exists.

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

In **Attendance → + Add a weekly class**, the teacher box is now a dropdown of active teachers from the `Teachers` tab. The chosen name is saved in `Sessions.Teacher`.

## Limits

- No teacher login: `/admin` still only accepts Google accounts listed in the `Staff` tab. Add the teacher's email there if they should sign in.
- No edit or delete for students/teachers from the page: edit the row in the sheet.
- Teachers hold no salary or contract data — `JoinedOn` and `Notes` only.
- A student added here has no link back to a Registrations row, so the two lists can differ (that is expected).
