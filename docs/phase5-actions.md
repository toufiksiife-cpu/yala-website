# Phase 5 — approve a registration, record a payment

The staff page can now change the spreadsheet. Two buttons, both behind the same Google sign-in.

| Where | Button | What it writes |
|---|---|---|
| Registrations | **Approve** | New row in `Students`, one row per course in `Enrollments`, then `Status = Approved` + `ApprovedBy` + `ApprovedAt` on the registration |
| Students | **Payment** | New row in `Payments` (amount, date, method, note, who recorded it) |
| Any tab | **Check spreadsheet** | Reads only. Shows the exact column names found and anything missing |

Nothing is ever deleted or overwritten except the registration's own `Status` / `ApprovedBy` / `ApprovedAt` cells.

## Deploy it — one paste, then a new version

The browser talks to the `YALA ADMIN` Apps Script project. It is still running the read-only version.

1. Open the spreadsheet → **Extensions → Apps Script** → project **YALA ADMIN**.
2. Select everything in the editor (`Ctrl+A`) and delete it.
3. Open `apps-script/admin.gs` from this repo, copy **all** of it, paste, save (`Ctrl+S`).
4. **Deploy → Manage deployments → ✏️ (pencil) → Version: New version → Deploy.**
   Do **not** use "New deployment" — that changes the URL.
5. Reload `https://yala-website.toufik-siife.workers.dev/admin`, sign in, press **Check spreadsheet**.

`Check spreadsheet` must say *"Everything the site needs is present."* If it lists a missing column, send me that line — the code refuses to guess a column name and writes nothing.

## What the guards do

- **Double click / stuck button** — the registration is checked again inside a lock, so one click can never create two students. A payment with the same student, amount and date within two minutes is refused as a duplicate.
- **Same child twice** — a student is a duplicate when the name matches **and** the phone *or* the date of birth matches. Siblings sharing a phone are fine. Approving a duplicate writes nothing and tells you which `STU-` already exists.
- **Renamed or missing column** — the write stops before touching a row and reports the columns it did find.
- **No `Enrollments` tab** — approving still creates the student, with a visible warning that the courses were not recorded.
- **Money** — amount must be above zero and at most 1,000,000 DZD. A date in the future or unreadable is replaced with today.

## First real test

1. Open a pending registration and press **Approve** once.
2. Open the spreadsheet: one new row in `Students`, one per course in `Enrollments`, registration now `Approved`.
3. In the staff page open **Students**, press **Payment** on that student, enter `2500`, Cash, save.
4. Check the new `Payments` row.

If something looks wrong, do not edit rows by hand — tell me which step and what the screen said.

## If the staff page says "Could not reach the server"

The deployment is on an old version or was redeployed as a *new* deployment. Re-run step 4 above and confirm the URL in `assets/config.js` still matches the one in **Manage deployments**.
