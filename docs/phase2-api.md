# Phase 2 — public courses API

Why a separate project: your `Code.gs` contains `findDuplicates_()` and `login()`.
Putting `?action=` there and setting that deployment to *Anyone* would let strangers
call those functions and read student names and phone numbers. A separate project
contains only read-only course code, so the worst case is "someone read the price list".

## 1. Create the project

1. Go to <https://script.google.com> → **New project**.
2. Rename it **YALA API**.
3. Delete everything in the default `Code.gs` editor pane.
4. Paste the whole contents of `apps-script/api.gs`.
5. **Save** (Ctrl+S).

## 2. Deploy it

1. **Deploy** → **New deployment**.
2. Gear icon → **Web app**.
3. Description: `public v1`.
4. **Execute as: Me** — *this is what lets it read the private sheet.*
5. **Who has access: Anyone**.
6. **Deploy** → **Authorise access** → pick `yaghmoracen.academy@gmail.com` →
   "Google hasn't verified this app" → **Advanced** → **Go to YALA API (unsafe)** → **Allow**.
7. Copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).

## 3. Test it

Open `<URL>?action=courses` in a private/incognito window (proves it works without login).
You should get JSON starting with `{"ok":true,"currency":"DZD"`.

If it returns a Google sign-in page, step 2.5 is wrong.
If it returns `server_error`, the message tells you which column is missing.

## 4. What it exposes

| Field | Public? |
|---|---|
| Course name, subject, level, monthly fee, room | yes |
| Category list | yes |
| Students, registrations, payments, parents, phones, emails | **no — not in this script** |
| Sheet contents beyond `Config` | no |

Cached 5 minutes: edits in the Sheet appear on the site within 5 minutes.

## 5. Later changes

Courses and prices need **no redeploy** — edit the Sheet, wait up to 5 minutes.
Only editing `api.gs` itself requires **Deploy → Manage deployments → ✏️ → New version**.
