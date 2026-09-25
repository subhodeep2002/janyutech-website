"""Check every internal link, #anchor, image and document in the built site
(relative and root-absolute URLs are both resolved against the page they appear on)."""
import os, re, json
from urllib.parse import urljoin, urlparse, unquote

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "http://site.local"
# only the pages build.py generates (other folders in the working copy are ignored)
PAGES = json.load(open(os.path.join(SITE, "build", "content.json")))["pages"]
pages = {"/404.html": open(os.path.join(SITE, "404.html")).read()}
for p in PAGES.values():
    url = "/" + p["path"] + "/" if p["path"] else "/"
    pages[url] = open(os.path.join(SITE, p["path"], "index.html")).read()

ids = {u: set(re.findall(r'\sid="([^"]+)"', h)) for u, h in pages.items()}
bad, n = [], 0
for page, h in pages.items():
    for attr, u in re.findall(r'\s(href|src|data-img|data-bp|data-photo)="([^"]+)"', h):
        if u.startswith(("mailto:", "tel:", "data:", "javascript:")) or u == "#": continue
        full = urljoin(ORIGIN + page, u)
        if not full.startswith(ORIGIN): continue            # external site
        n += 1
        pu = urlparse(full)
        path = unquote(pu.path) or "/"
        if path.endswith("/"):
            if path not in pages: bad.append((page, u, "no such page")); continue
            if pu.fragment and pu.fragment != "top" and pu.fragment not in ids[path]:
                bad.append((page, u, "missing anchor"))
        elif not os.path.exists(os.path.join(SITE, path.lstrip("/"))):
            bad.append((page, u, "missing file"))

print(f"{len(pages)} pages, {n} internal refs checked, {len(bad)} problems")
for b in bad[:40]: print("  ", *b)
