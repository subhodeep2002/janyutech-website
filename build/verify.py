"""Compare every built page with the original janyutech.com page, word for word.
usage: python3 build/verify.py build/raw"""
import sys, os, re, glob
from collections import Counter
from bs4 import BeautifulSoup
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = sys.argv[1]
W = lambda t: re.findall(r"[A-Za-z0-9]+", t)
bad = 0
for f in sorted(glob.glob(os.path.join(RAW, "*.html"))):
    slug = os.path.basename(f)[:-5]
    path = "" if slug == "home" else slug.replace("__", "/")
    out = os.path.join(SITE, path, "index.html")
    o = BeautifulSoup(open(f).read(), "html.parser").select_one('[data-elementor-type="wp-page"]')
    for x in o.select("script,style,svg"): x.decompose()
    n = BeautifulSoup(open(out).read(), "html.parser")
    main = n.select_one("main")
    for x in main.select("script,style,.loader"): x.decompose()
    # image alt/captions count as text too (captions carried in data attributes)
    extra = " ".join((e.get("data-caption") or "") + " " + (e.get("aria-label") or "") for e in main.select("[data-caption],[aria-label]"))
    orig, got = Counter(W(o.get_text(" "))), Counter(W(main.get_text(" ") + " " + extra))
    miss = orig - got
    n_miss = sum(miss.values())
    flag = n_miss > 2
    bad += flag
    if flag or "-v" in sys.argv:
        print(f"{'MISSING' if flag else 'ok':8} {slug:52} words={sum(orig.values()):5} missing={n_miss}: {' '.join(list(miss.elements())[:25])}")
print(f"{len(glob.glob(os.path.join(RAW, '*.html')))} pages checked, {bad} with missing text")
