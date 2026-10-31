# Phase 4 — staff sign-in, step by step

Time: about 20 minutes. Cost: nothing, no card. You need: the Gmail account
`yaghmoracen.academy@gmail.com` (the one that owns the spreadsheet).

**Two pieces, in this order:**

| Piece | Where | What it is for |
|---|---|---|
| 1. OAuth client ID | Google Cloud console | The "name badge" on the Sign in with Google button. Proves which site is asking. |
| 2. YALA ADMIN script | script.google.com | The server. Checks the badge, checks the staff list, returns the rows. |

Do them in this order: the script needs the client ID from part 1.

---

## Part 1 — Create the OAuth client ID

### 1.1 Open the console

Go to <https://console.cloud.google.com> and sign in with `yaghmoracen.academy@gmail.com`.

✅ Top-left should show a project selector (a box with a project name). If it asks you to
accept terms, accept.

### 1.2 Create a project

1. Click the project selector at the top left → **New project**.
2. Project name: `YALA` → **Create**.
3. Wait ~10 seconds, then click the project selector again and choose **YALA**.

✅ The top bar now says `YALA`. Every step below happens inside this project — if you
see `My First Project` or another name, switch back to `YALA`.

### 1.3 Fill the consent screen

Left menu → **APIs & Services** → **OAuth consent screen**
(on newer consoles: **Google Auth platform** → **Branding**; the button to start is **Get started**).

**Get started** form:

| Field | What to write |
|---|---|
| App name | `YALA Management` |
| User support email | `yaghmoracen.academy@gmail.com` |
| Audience / User type | **External** |
| Contact information | `yaghmoracen.academy@gmail.com` |
| Agree to the policy | tick |

→ **Create**.

✅ You land on a page with tabs: *Overview / Branding / Audience / Clients / Data access*.

### 1.4 Publish the app

1. Open the **Audience** tab.
2. Under *Publishing status* you will see **Testing** — click **Publish app** → **Confirm**.

✅ Publishing status now says **In production**.

> Why this matters: in *Testing* mode Google only lets in accounts you list as test users,
> and staff sign-ins quietly break after 7 days. Publishing needs no review, because we
> only use name, email and profile — Google calls these "non-sensitive".

### 1.5 Create the client

1. Left menu → **APIs & Services** → **Credentials** (or the **Clients** tab → **+ Create client**).
2. **+ Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `YALA site`.
5. Scroll to **Authorised JavaScript origins** → **+ Add URI** → paste exactly:

```
https://yala-website.toufik-siife.workers.dev
```

6. Leave **Authorised redirect URIs** empty. Leave everything else alone.
7. **Create**.

✅ A box appears: *OAuth client created*. It shows a **Client ID** ending in
`apps.googleusercontent.com`, and a client secret.

**Copy the Client ID.** You do not need the secret — ignore it, never paste it anywhere.

✅ Your Client ID is in the clipboard. Keep it; part 2 uses it.

> Rules Google enforces here: `https://`, no trailing slash, no path (`/admin` is wrong),
> no `www`, no port.

### 1.6 Wait a few minutes

A brand-new client ID can take 5–10 minutes to become active. If part 4 shows
*"The given client ID is not found"* in the browser console, wait and reload.

---

## Part 2 — Create the YALA ADMIN script

### 2.1 New project

1. Go to <https://script.google.com> → **New project**.
2. Top-left, click *Untitled project* → rename to **YALA ADMIN** → **Rename**.

✅ The editor shows a file called `Code.gs` with `function myFunction() {}`.

> This is a **different project** from `YALA API`. Do not paste this into `YALA API`,
> and do not paste `YALA API`'s code here.

### 2.2 Paste the code

1. Open `C:\Users\diete\Desktop\YALA WEBSITE\apps-script\admin.gs` in Notepad or VS Code.
2. Select all (Ctrl+A), copy (Ctrl+C).
3. In the Apps Script editor: click inside the code, Ctrl+A to select the old code,
   then Ctrl+V to replace it.
4. Find this line near the top:

```js
var CLIENT_ID = '';
```

5. Put your Client ID between the quotes:

```js
var CLIENT_ID = '1234567890-abcdefghijklmnop.apps.googleusercontent.com';
```

6. Save: **Ctrl+S** (or the 💾 icon).

✅ The editor shows no red squiggles under `CLIENT_ID` and the file is named `Code.gs`.

### 2.3 Deploy

1. Top right: **Deploy** → **New deployment**.
2. Click the gear next to *Select type* → **Web app**.
3. Fill in:

| Field | Value |
|---|---|
| Description | `staff v1` |
| Execute as | **Me (`yaghmoracen.academy@gmail.com`)** |
| Who has access | **Anyone with a Google account** |

4. **Deploy**.
5. A Google authorisation window opens: **Authorise access** → choose
   `yaghmoracen.academy@gmail.com` → if you see *"Google hasn't verified this app"* →
   **Advanced** → **Go to YALA ADMIN (unsafe)** → **Allow**.

✅ A box appears: *Deployment created*, with a **Web app URL** like
`https://script.google.com/macros/s/AKfy…/exec`.

**Copy that URL.**

> Never choose **Anyone** for this one. *Anyone with a Google account* is what we want:
> anybody can reach the script, but the script only answers staff.

### 2.4 Prove it works

Open this in a **private / incognito** window (replace the URL with yours):

```
https://script.google.com/macros/s/…/exec?action=config
```

✅ You should see one line of text:

```json
{"ok":true,"clientId":"1234567890-abcdefghijklmnop.apps.googleusercontent.com"}
```

If you see a sign-in page instead, step 2.3 *Who has access* is wrong.
If `clientId` is empty, step 2.2.5 was not saved.

---

## Part 3 — Send me the URL

Send only this line:

```
https://script.google.com/macros/s/AKfy…/exec
```

I paste it into `assets/config.js` and push. Cloudflare is live in about a minute.
The `Staff` tab is created automatically the first time you sign in — with you in it.

---

## Part 4 — First sign-in

1. Open `https://yala-website.toufik-siife.workers.dev/admin` — **bookmark it**.
   It is not linked from the site menu, on purpose.
2. **Sign in with Google** → `yaghmoracen.academy@gmail.com`.
3. The spreadsheet gains a **Staff** tab: `Email | Name | Active` + your email, `YES`.
4. The page shows **Registrations**, newest first.

✅ Check: your real registrations appear, search by name works, the **Students** tab opens.

---

## Adding a staff member

Open the spreadsheet → **Staff** tab → add a row:

| Email | Name | Active |
|---|---|---|
| `teacher@gmail.com` | `Amine` | `YES` |

They sign in at the same `/admin` URL **with that exact Google account**. No deploy,
effective on the next page load. To remove access, set `Active` to `NO` (or delete the row).

---

## If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| "Management is not connected yet — Missing the admin API URL" | I have not wired the URL yet | Part 3 |
| "…has no OAuth client ID yet" | `CLIENT_ID` empty in `admin.gs` | Part 2.2.5, then **Manage deployments → ✏️ → New version** |
| Sign-in box empty, browser console says *The given client ID is not found* | Client ID wrong, or not active yet | Re-copy it; wait 10 minutes |
| "Google could not start sign-in. Check that https://… is listed…" | The origin is missing or has a typo | Part 1.5.5 — no slash, no `/admin` |
| "This account (…) is not on the staff list" | Signed in with the wrong Google account, or `Active = NO` | Use the right account / fix the row |
| "Your session expired" | The 1-hour token expired | Sign in again (normal) |
| "The tab "Registrations" does not exist" | A tab was renamed in the Sheet | Rename it back |
| "Could not reach the server" | No connection, or the deployment was deleted | Check connection; redeploy in Apps Script |
| Freeze / no rows but no error | Deployment set to *Anyone with Google account* but not authorised | Re-deploy and finish the Allow dialog |

## Who can see what

| | Public site | `/admin` |
|---|---|---|
| Courses and prices | yes | yes |
| Names, phones, emails, parents, notes | **no** | staff only |
| Can change the Sheet | no | **not yet** — read-only in this phase |

The admin page itself is public HTML and contains **no data**; every row is fetched with
your Google token and checked on the server each time.

## Limits worth knowing

- 500 rows per tab, newest kept. Years of data for this school, but not forever.
- The token lives in the browser tab only, and expires after an hour.
- Sheet columns appear automatically (empty ones are hidden). Renaming a column in the
  Sheet is safe; renaming a **tab** is not.
- Dates show as `2026-10-31`, with `HH:mm` added when the cell actually has a time.
