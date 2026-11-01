# Phase 8 — follow-up, balances, daily backup

After phase 7, without changing anything already saved.

## 1. Chasing a registration

**Registrations** tab:

- The **Phone** column now has **WhatsApp** and **Call** buttons. They open the
  phone's app, so no number is typed by hand. `0551 23 45 67` becomes
  `+213 551 23 45 67` for WhatsApp automatically.
- The action column has a status menu: **Pending**, **Contacted**, **No answer**,
  **Rejected**. Pick one and the sheet is updated immediately. Leave it on
  **Pending** and nothing changes.
- **Approve** is still the only way to create a student. A row marked
  **Rejected** can be set back to Contacted or Pending with the same menu.
- A registration under 18 shows an orange **Under 18** chip, so the person
  answering the phone knows to speak to the parent.

## 2. Who has paid this month

**Students** tab:

- Each row gets a **Paid** or **Due 1,500** chip in the action column. Hover it
  to see "paid of due" for the month.
- Tick **Unpaid this month** to show only students still owing.
- The line next to the buttons summarises: `12 unpaid (18,000 DZD)`.

How the amount is worked out:

1. The active rows in **Enrollments** for that student: `MonthlyFeeDZD` added up.
2. If the student has no enrollment rows, the **Config** price of each course in
   their `Courses` column.
3. Money paid counts only when **Payments → Date** falls in the current month.

If you bill per term or per level rather than per month, do not rely on this
chip — the calculation assumes a monthly fee.

## 3. Daily backup

The script can copy the whole spreadsheet to Drive every night at 02:00 and keep
the last 30 copies (about one month).

One-time setup:

1. Open the **YALA ADMIN** script (spreadsheet → **Extensions → Apps Script**).
2. Choose the function **installBackupTrigger** in the toolbar dropdown.
3. Press **Run** once and accept the Drive permission prompt.
4. Open **Triggers** (clock icon, left) and check:
   `backupSheet` · Time-driven · Day timer · 2am to 3am.

A folder **YALA backups** appears in Drive, containing files named
`<spreadsheet> backup 2026-11-01 0200`. Restoring = open the copy you want and
copy its tabs back, or use **File → Make a copy** from it.

To test without waiting: run **backupSheet** once from the same dropdown.

## Deploy

`admin.gs` changed again:

1. Copy `https://raw.githubusercontent.com/toufiksiife-cpu/yala-website/main/apps-script/admin.gs`
   (use the address from `git remote get-url origin`, not this line typed by hand).
2. Apps Script → **YALA ADMIN** → select all → paste → **Save**.
3. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
   The URL stays the same.
4. Open `/admin`, hard-refresh, sign in.

`admin.html` is deployed by the usual GitHub push (about a minute).

## First check after deploying

1. Registrations: one row shows **Under 18**, and its **WhatsApp**/**Call**
   buttons open the right number.
2. Set one row to **Contacted** → the sheet's Status column says Contacted.
3. Students: one chip says **Paid**, another **Due**; ticking the filter hides
   the paid ones.
4. Run **backupSheet** once; the file appears in **YALA backups** in Drive.
