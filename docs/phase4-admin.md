# Phase 4 — staff sign-in and the management site

One-time setup, about 15 minutes. No card, nothing paid.

Why it is built this way: the admin page is just HTML — it holds no data. Every list
request carries a Google ID token. The `YALA ADMIN` script asks Google whether that
token is genuine, then checks the email against the **Staff** tab. A stranger with the
URL sees a sign-in button and nothing else.

---

## 1. Create the OAuth client (Google Cloud, free)

1. <https://console.cloud.google.com> → top bar → **New project** → name `YALA` → Create.
2. **APIs & Services → OAuth consent screen** (now called *Google Auth Platform*):
   - **Get started** → App name `YALA Management`, support email = your Gmail.
   - Audience: **External** → Contact email = your Gmail → agree → **Create**.
   - Then **Publish app** (status must be *In production*, otherwise sign-in tokens
     expire after 7 days).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `YALA site`.
   - **Authorised JavaScript origins** (no trailing slash):
     - `https://yala-website.toufik-siife.workers.dev`
     - `http://localhost:8080` *(only if you want to test locally)*
   - Leave *Authorised redirect URIs* empty. Create.
4. Copy the **Client ID** (`…apps.googleusercontent.com`). The secret is not needed.

Google may take a few minutes to propagate a new client ID.

## 2. Create the staff API

1. <https://script.google.com> → **New project** → rename **YALA ADMIN**.
2. Replace the code with `apps-script/admin.gs`.
3. Paste your client ID into `var CLIENT_ID = '';` (line near the top). Save.
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone with a Google account**
   - Deploy → authorise → allow.
5. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
6. Open `<URL>?action=config` in a private window: you should see
   `{"ok":true,"clientId":"…apps.googleusercontent.com"}`.

> Never deploy this one as *Anyone*. That would hand the staff list to the internet.

## 3. Point the site at it

In `assets/config.js`:

```js
window.YALA_ADMIN_API = "https://script.google.com/macros/s/YOUR_ADMIN_ID/exec";
```

Commit and push. Cloudflare deploys in about a minute.

## 4. First sign-in

1. Open `https://yala-website.toufik-siife.workers.dev/admin` — **bookmark it**, it is
   deliberately not in the site menu.
2. **Sign in with Google** using `yaghmoracen.academy@gmail.com`.
3. The script creates the **Staff** tab on that first request and puts the owner in it.
4. You should see the Registrations list, newest first.

If you see *"Management is not connected yet"*, read the grey box: it names the missing
piece (client ID or API URL).

## 5. Adding staff

`Staff` tab: `Email | Name | Active`. Add one row per person, `Active = YES`.
To remove access, set `NO` (or delete the row) — no deploy, effective immediately.

A staff member must sign in with **that exact Google account**.

---

## What the staff site can do

| Now | Later phases |
|---|---|
| Sign in with Google, allowlist | Approve a registration into a student |
| Read `Registrations` (newest first) | Record a payment |
| Read `Students` | Edit the schedule |
| Search anything, filter by typing | Attendance, dashboard |

Read-only on purpose: nothing on this screen can damage the Sheet yet.

## Limits worth knowing

- 500 rows per tab, newest kept — enough for years of this school.
- The ID token is kept in the browser tab only and expires after an hour; the page
  asks you to sign in again.
- Sheet columns are shown automatically, except columns that are empty for every row.
  Adding a column in the Sheet makes it appear — no deploy.
- Dates are shown as `2026-10-31` (Algiers time), with the time when the cell has one.

## If something breaks

| Symptom | Cause |
|---|---|
| Sign-in button never appears | Client ID missing in `admin.gs`, or origin not authorised |
| `forbidden` | Signed in with an email not in `Staff`, or `Active = NO` |
| `unauthorized` | Client ID in `admin.gs` ≠ the one the browser used |
| `missing_tab` | Tab renamed in the Sheet |
| `server_error` | Open the Apps Script *Executions* page for the real message |
