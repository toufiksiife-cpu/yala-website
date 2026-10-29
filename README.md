# YALA — Yaghmoracen Academy of Languages and Arts

Website for a private language school in Tlemcen, Algeria.

- **Public site**: Arabic (default, RTL) + English. Static HTML/CSS/JS.
- **Management**: English only, at `/admin/`, Google Sign-In.
- **Data**: the school's existing Google Sheet, through its Apps Script JSON API.

## Run locally

Open `index.html` in a browser. That's it — no build step, no server needed.

For the later phases (API calls) use a local server so `fetch` behaves like production:

```powershell
npx serve .        # or: python -m http.server 8080
```

## Deploy (free)

1. Push to GitHub (`toufiksiife-cpu/yala-website`).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Pick the repo. Build command: *empty*. Output directory: `/`. → **Save and Deploy**.
4. Live at `https://yala-website.pages.dev`. Every `git push` redeploys.

Custom domain later: Cloudflare Pages → *Custom domains* (free). A `.com` costs ~1,200–2,000 DZD/year; `.dz` needs local paperwork.

## Rules for this repo

- Never commit secrets, API keys, or student data.
- Public pages must not contain personal data.
- Keep it dependency-free unless it clearly pays for itself.
