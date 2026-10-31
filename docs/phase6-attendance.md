# Phase 6 — overview, schedule and attendance

Two new things in the staff page:

1. **Overview** (above the tabs): pending registrations, active students, DZD this month, students per course.
2. **Attendance tab**: today's class list, tick Present/Absent, save; plus a small form to add a weekly class.

The overview needs no setup. Attendance creates its own two tabs the first time you open it.

## Deploy

The attendance part lives in `YALA ADMIN`. If you already deployed the Phase 5 script, do it again with the new file:

1. Open `https://raw.githubusercontent.com/toufiksiife-cpu/yala-website/main/apps-script/admin.gs`
2. `Ctrl+A`, `Ctrl+C`.
3. Spreadsheet → **Extensions → Apps Script** → **YALA ADMIN** → click in the code → `Ctrl+A` → `Delete` → `Ctrl+V` → `Ctrl+S`.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**
5. Reload `/admin`, sign in, open **Attendance**.

First open adds:

**Sessions** — `SessionID | Course | Day | StartTime | EndTime | Teacher | Room | Status`
**Attendance** — `AttendanceID | Date | SessionID | StudentID | StudentName | Status | RecordedBy | RecordedAt`

Do not rename those headers. If you do, the page refuses and tells you which column is missing.

If your sheet already has a `Sessions` or `Attendance` tab with other columns (for example `Course | Day | Time`), rename that tab to `SessionsOld` / `AttendanceOld` instead of deleting it. The script then creates the correct tab next time you open Attendance, and your old data stays where it is.

## Use it

1. **Attendance** → **+ Add a weekly class** → pick the course (comes from `Config`), day, start, end, optional teacher/room → **Add class**.
2. Pick the class in the list, set the date, tick **Present** or **Absent** per student → **Save attendance**.
3. The list shows only students who are `Active` and whose `Courses` contains that course.
4. Saving again for the same class and date updates those rows instead of adding duplicates.
5. **All present** ticks everyone, then you untick the absentees.

Students appear only after their registration is approved, so approve first.

## Limits

- One weekly slot per row; a course with two groups of the same course needs two rows (e.g. add a room or teacher to tell them apart).
- Present/Absent only: no late, no excuse, no grades.
- Sessions are never deleted from the page; delete a row in the sheet to remove a class, or set its `Status` to `Inactive`.
- Attendance is never deleted either; correct a mistake by saving again for that date.

## Troubleshooting

| Message | Meaning |
|---|---|
| "No weekly class yet." | No row in `Sessions` — add one with the button |
| "No active student has X yet." | Nobody `Active` has that course in `Students.Courses` |
| "Pick a date that is not in the future." | The date field is ahead of today |
| "That class is already scheduled." | Same course, day and start time already exists |
| "Could not save. (unknown_action)" | The new `admin.gs` was not deployed as a **New version** |
