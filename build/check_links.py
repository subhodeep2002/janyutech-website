"""Check every internal link, #anchor, image and document in the built site
(relative and root-absolute URLs are both resolved against the page they appear on)."""
import os, re, glob
from urllib.parse import urljoin, urlparse, unquote

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "http://site.local"
pages = {}
for f in glob.glob(os.path.join(SITE, "**", "*.html"), recursive=True):
    rel = os.path.relpath(f, SITE)
    if rel.startswith(("build" + os.sep, ".")): continue
    if rel == "404.html":
        url = "/404.html"
    else:
        d = os.path.dirname(rel)
        url = "/" if d in ("", ".") else "/" + d.replace(os.sep, "/") + "/"
    pages[url] = open(f).read()

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
