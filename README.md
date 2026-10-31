# YALA — Yaghmoracen Academy of Languages and Arts

Website for a private language school in Tlemcen, Algeria.

- **Public site**: Arabic (default, RTL) + English. Static HTML/CSS/JS.
- **Management**: English only, at `/admin`, Google Sign-In.
- **Data**: the school's existing Google Sheet, through its Apps Script JSON API.

## Run locally

Open `index.html` in a browser. That's it — no build step, no server needed.

For the later phases (API calls) use a local server so `fetch` behaves like production:

```powershell
npx serve .        # or: python -m http.server 8080
```

## Deploy (free)

Already connected: a `git push` to `main` deploys to
`https://yala-website.toufik-siife.workers.dev` through Cloudflare Workers (~1 minute).

Setup notes: `docs/phase2-api.md` (public API), `docs/phase4-admin.md` (staff site), `docs/phase5-actions.md` (approving and payments), `docs/phase6-attendance.md` (overview, classes, attendance).

Custom domain later: Cloudflare Pages → *Custom domains* (free). A `.com` costs ~1,200–2,000 DZD/year; `.dz` needs local paperwork.

## Rules for this repo

- Never commit secrets, API keys, or student data.
- Public pages must not contain personal data.
- Keep it dependency-free unless it clearly pays for itself.
