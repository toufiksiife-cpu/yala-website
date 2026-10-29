"""Self-check for the static site. Run: python tools/check.py
Fails loudly if a link points nowhere or an English string is missing."""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
pages = sorted(root.glob("*.html"))
errors = []

# English keys live in assets/locales.js as `"key": "..."` pairs.
raw = (root / "assets/locales.js").read_text(encoding="utf-8")
en_keys = set(re.findall(r'"([\w.]+)":\s*"', raw))

used = set()
for page in pages:
    html = page.read_text(encoding="utf-8")
    name = page.name

    for key in re.findall(r'data-i18n(?:-aria)?="([\w.]+)"', html):
        used.add(key)
        if key not in en_keys:
            errors.append(f"{name}: missing English string for '{key}'")

    title_key = re.search(r'data-title="([\w.]+)"', html)
    if title_key:
        used.add(title_key.group(1))
        if title_key.group(1) not in en_keys:
            errors.append(f"{name}: data-title '{title_key.group(1)}' not in locales.js")

    for ref in re.findall(r'(?:href|src)="([^"#:]+)"', html):
        if ref.startswith(("http", "//", "mailto:", "tel:", "data:")):
            continue
        if not (root / ref).exists():
            errors.append(f"{name}: broken local reference '{ref}'")

unused = en_keys - used
if unused:
    errors.append(f"locales.js has unused keys: {sorted(unused)}")

for f in ("assets/css/style.css", "assets/app.js", "assets/img/logo.webp", "assets/img/favicon.png"):
    if not (root / f).exists():
        errors.append(f"missing {f}")

if errors:
    print("FAIL")
    for e in errors:
        print("  -", e)
    sys.exit(1)

print(f"OK — {len(pages)} pages, {len(en_keys)} English strings, all links resolve")
