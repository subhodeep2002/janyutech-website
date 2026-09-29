"""
Static site generator for the JanyuTech redesign.

  content.json  – every page of janyutech.com, extracted block by block (see extract.py)
  img_map.json  – original image URL → local /assets/img file (see imgs.py)

Run:  python3 build/build.py      (writes index.html + one folder per page into the site root)
"""
import json, os, re, sys, html as H
from datetime import date

try:        # image sizes decide the page banners and how product renders are framed; without Pillow they'd silently vanish
    import PIL  # noqa: F401
except ImportError:
    sys.exit("build.py needs Pillow to read image sizes. Install it with:  python3 -m pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
BASE = "https://janyutech.com"
D = json.load(open(os.path.join(HERE, "content.json")))
IMG = json.load(open(os.path.join(HERE, "img_map.json"))) if os.path.exists(os.path.join(HERE, "img_map.json")) else {}
DOCS = json.load(open(os.path.join(HERE, "doc_map.json"))) if os.path.exists(os.path.join(HERE, "doc_map.json")) else {}
PAGES = D["pages"]
# images that no longer exist on janyutech.com (404/410) – dropped instead of showing a broken icon
GONE = set(json.load(open(os.path.join(HERE, "img_missing.json")))) if os.path.exists(os.path.join(HERE, "img_missing.json")) else set()
for _p in PAGES.values():
    for _s in _p["sections"]:
        _s["blocks"] = [b for b in _s["blocks"] if not (b["t"] == "img" and b["src"] in GONE)]
        for b in _s["blocks"]:
            if b["t"] == "slider": b["slides"] = [x for x in b["slides"] if x["src"] not in GONE]
            if b["t"] == "gallery": b["imgs"] = [x for x in b["imgs"] if x["src"] not in GONE]
            if b["t"] == "card" and b.get("img") in GONE: b["img"] = ""
        _s["blocks"] = [b for b in _s["blocks"] if not (b["t"] == "slider" and not b["slides"]) and not (b["t"] == "gallery" and not b["imgs"])]
VER = "12"

# Links that are broken on the live site (anchor id typos) – point them at the real ids.
LINK_FIX = {
    BASE + "/industries/chemical-industry/#reactor": BASE + "/industries/chemical-industry/#Reactor",
    BASE + "/industries/raas/#indusrial": BASE + "/industries/raas/#industrial",
    BASE + "/industries/steel-industry/#admixture": BASE + "/industries/cement-construction/#admixture",  # Idosemate lives on Cement
    BASE + "/industries/dna/#satcom": BASE + "/industries/dna/#legged",                                   # QRS robot section
    BASE + "/industries/varaha-sludge-cleaning/": BASE + "/products/varaha-sludge-cleaning/",             # live site 301-redirects here
}

esc = lambda s: H.escape(s or "", quote=True)


def link(u):
    u = (u or "").strip()
    if not u or u == "#": return u
    u = LINK_FIX.get(u, u)
    u = re.sub(r"^http://", "https://", u)
    u = u.replace("https://www.janyutech.com", BASE)
    if u.startswith(BASE):
        path = u[len(BASE):] or "/"
        if path.startswith("/wp-content/"):
            return DOCS.get(u, u)
        return path
    return u


def img(u):
    return "/assets/img/" + IMG[u] if u in IMG else (u or "")


def ext(u):
    return u.startswith("http") and not u.startswith(BASE)


def a_attrs(u):
    u2 = link(u)
    extra = ' target="_blank" rel="noopener"' if ext(u2) or u2.endswith(".pdf") else ""
    return f'href="{esc(u2)}"{extra}'


def rewrite_html(h):
    h = re.sub(r'href="([^"]*)"', lambda m: a_attrs(H.unescape(m.group(1))), h)
    return h


def strip_tags(h):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", H.unescape(h or ""))).strip()


# ---------------------------------------------------------------- page images
# Pick a hero image for every page from whichever card anywhere links to it.
CARD_IMG = {}
for p in PAGES.values():
    for s in p["sections"]:
        for b in s["blocks"]:
            if b["t"] == "card" and b.get("img") and b.get("href"):
                path = link(b["href"]).split("#")[0]
                CARD_IMG.setdefault(path, b["img"])


_CUT = {}
def is_cutout(u):
    """True when an image is a render on a white/transparent background (shown whole, not cropped)."""
    if u in _CUT: return _CUT[u]
    res = False
    f = os.path.join(SITE, "assets", "img", IMG[u]) if u in IMG else ""
    if f and os.path.exists(f):
        try:
            from PIL import Image
            im = Image.open(f).convert("RGBA"); w, h = im.size
            pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3)]
            px = [im.getpixel(p) for p in pts]
            res = sum(1 for r, g, b, a in px if a < 20 or (r > 235 and g > 235 and b > 235)) >= 5
        except Exception:
            res = False
    _CUT[u] = res
    return res


_SIZE = {}
def img_size(u):
    if u in _SIZE: return _SIZE[u]
    wh = (0, 0)
    f = os.path.join(SITE, "assets", "img", IMG[u]) if u in IMG else ""
    if f and os.path.exists(f):
        try:
            from PIL import Image
            wh = Image.open(f).size
        except Exception: pass
    _SIZE[u] = wh
    return wh


def landscape(u):
    w, h = img_size(u)
    return bool(w and h and w >= h * 1.2)


def first_media(p):
    for s in p["sections"]:
        for b in s["blocks"]:
            if b["t"] == "img": return b["src"]
            if b["t"] == "slider" and b["slides"]: return b["slides"][0]["src"]
    return ""


# ---------------------------------------------------------------- blocks → HTML
def heading(b, where="flow"):
    t = esc(b["text"])
    if b.get("href"): t = f'<a {a_attrs(b["href"])}>{t}</a>'
    lvl = b["lvl"]
    if len(b["text"]) > 90:   # long "headings" on the old site are really paragraphs
        return f'<p class="lead-p reveal-up">{t}</p>'
    if where == "feature":
        return f'<h3 class="f-title">{t}</h3>' if lvl <= 3 else f'<h4 class="mini-title">{t}</h4>'
    if lvl <= 2: return f'<h2 class="sec-title reveal-up">{t}</h2>'
    if lvl == 3: return f'<h3 class="sub-title reveal-up">{t}</h3>'
    return f'<h4 class="mini-title reveal-up">{t}</h4>'


def list_html(items):
    out = []
    for it in items:
        tx = it["text"]
        m = re.match(r"^([^:]{2,70}):\s*(.+)$", tx)
        inner = f"<strong>{esc(m.group(1))}:</strong> {esc(m.group(2))}" if m else esc(tx)
        if it.get("href"): inner = f'<a {a_attrs(it["href"])}>{inner}</a>'
        out.append(f"<li>{inner}</li>")
    return f'<ul class="checks reveal-up">{"".join(out)}</ul>'


def btns(bs):
    out = []
    for i, b in enumerate(bs):
        cls = "btn" if i == 0 else "btn btn--ghost"
        if not b.get("href") or b["href"] == "#":
            out.append(f'<span class="{cls} is-disabled">{esc(b["text"])}</span>')
        else:
            out.append(f'<a class="{cls}" {a_attrs(b["href"])} data-magnetic><span>{esc(b["text"])}</span><i>→</i></a>')
    return f'<div class="btn-row reveal-up">{"".join(out)}</div>'


def picture(src, alt="", cls="", fluid=False, eager=False):
    f = ' data-fluid' if fluid else ""
    lz = "" if eager else ' loading="lazy"'
    return f'<div class="media {cls}"{f}><img src="{esc(img(src))}" alt="{esc(alt)}"{lz} decoding="async"></div>'


def slider(b, fluid=False):
    sl = b["slides"]
    if len(sl) == 1 and not (sl[0]["title"] or sl[0]["text"]):
        return picture(sl[0]["src"], sl[0]["title"], "media--frame", fluid=fluid)
    items = []
    for i, s in enumerate(sl):
        cap = ""
        if s["title"] or s["text"] or s["sub"] or s["btns"]:
            cap = f'<figcaption>{f"<p class=eyebrow>{esc(s["sub"])}</p>" if s["sub"] else ""}{f"<h3>{esc(s["title"])}</h3>" if s["title"] else ""}{f"<p>{esc(s["text"])}</p>" if s["text"] else ""}{btns(s["btns"]) if s["btns"] else ""}</figcaption>'
        items.append(f'<figure class="slider__slide{" is-active" if i == 0 else ""}"><img src="{esc(img(s["src"]))}" alt="{esc(s["title"])}" loading="lazy" decoding="async">{cap}</figure>')
    dots = "".join(f'<button class="slider__dot{" is-active" if i == 0 else ""}" aria-label="Show image {i+1}"></button>' for i in range(len(sl)))
    return (f'<div class="slider" data-slider><div class="slider__track">{"".join(items)}</div>'
            f'<div class="slider__ui"><span class="slider__count"><b>01</b> / {len(sl):02d}</span><div class="slider__dots">{dots}</div>'
            f'<div class="slider__arrows"><button class="slider__prev" aria-label="Previous image">←</button><button class="slider__next" aria-label="Next image">→</button></div></div></div>')


def video(b, cap=""):
    if b.get("yt"):
        v = b["yt"]
        return (f'<figure class="video reveal-up"><button class="video__frame" data-yt="{esc(v)}" aria-label="Play video{": " + esc(cap) if cap else ""}">'
                f'<img src="https://i.ytimg.com/vi/{esc(v)}/hqdefault.jpg" alt="" loading="lazy"><span class="video__play">▶</span></button>'
                f'{f"<figcaption>{esc(cap)}</figcaption>" if cap else ""}</figure>')
    return f'<figure class="video reveal-up"><video src="{esc(link(b["src"]))}" controls preload="metadata"></video></figure>'


def card(b, n):
    num = f'<span class="card__n">{n:02d}</span>'
    body = (f'<div class="card__body">{num if not b.get("img") else ""}<h3>{esc(b["title"])}</h3>'
            f'{f"<p>{esc(b["text"])}</p>" if b.get("text") else ""}'
            f'{f"<span class=card__cta>{esc(b["btn"] or "Learn more")} <i>→</i></span>" if b.get("href") else ""}</div>')
    media = f'<div class="card__img"><img src="{esc(img(b["img"]))}" alt="{esc(b["title"])}" loading="lazy" decoding="async"></div>' if b.get("img") else ""
    cls = "card" + ("" if b.get("img") else " card--plain") + (" card--cutout" if b.get("img") and is_cutout(b["img"]) else "")
    if b.get("href"):
        return f'<a class="{cls} reveal-up" {a_attrs(b["href"])}>{media}{body}</a>'
    return f'<div class="{cls} reveal-up">{media}{body}</div>'


def social_label(u):
    for k, v in (("linkedin", "LinkedIn"), ("wikipedia", "Wikipedia"), ("twitter", "X / Twitter"), ("x.com", "X / Twitter"),
                 ("youtube", "YouTube"), ("instagram", "Instagram"), ("facebook", "Facebook"), ("mailto:", "Email")):
        if k in u: return v
    return "Profile"


def member(b):
    links = "".join(f'<a {a_attrs(u)}>{social_label(u)} ↗</a>' for u in b.get("links", []))
    return (f'<article class="member reveal-up"><div class="member__img"><img src="{esc(img(b["img"]))}" alt="{esc(b["name"])}" loading="lazy"></div>'
            f'<h3>{esc(b["name"])}</h3>{f"<p class=member__job>{esc(b["job"])}</p>" if b.get("job") else ""}'
            f'{f"<p class=member__text>{esc(b["text"])}</p>" if b.get("text") else ""}'
            f'{f"<div class=member__links>{links}</div>" if links else ""}</article>')


def figure(src, title, text="", group="g"):
    full = img(src)
    return (f'<figure class="photo reveal-up"><a href="{esc(full)}" data-lightbox="{group}" data-caption="{esc(title)}">'
            f'<img src="{esc(full)}" alt="{esc(title)}" loading="lazy" decoding="async"></a>'
            f'{f"<figcaption><strong>{esc(title)}</strong>{f"<span>{esc(text)}</span>" if text else ""}</figcaption>" if title or text else ""}</figure>')


GAL_N = [0]


def gallery(b, logos=False):
    GAL_N[0] += 1
    if logos:
        imgs = "".join(f'<img src="{esc(img(i["src"]))}" alt="{esc(i["alt"])}" loading="lazy">' for i in b["imgs"])
        dup = "".join(f'<img src="{esc(img(i["src"]))}" alt="" aria-hidden="true" loading="lazy">' for i in b["imgs"])
        return f'<div class="logos"><div class="logos__row">{imgs}{dup}</div></div>'
    items = "".join(
        f'<a class="gallery__item" href="{esc(img(i["src"]))}" data-lightbox="gal{GAL_N[0]}" data-caption="{esc(i.get("caption") or i.get("alt") or "")}">'
        f'<img src="{esc(img(i["src"]))}" alt="{esc(i.get("alt") or i.get("caption") or "")}" loading="lazy" decoding="async">'
        f'{f"<span>{esc(i["caption"])}</span>" if i.get("caption") else ""}</a>' for i in b["imgs"])
    return f'<div class="gallery reveal-up">{items}</div>'


def merge_timelines(tls):
    seen, items = set(), []
    for tl in tls:
        for it in tl["items"]:
            key = (it["year"], it["title"].lower())
            if key in seen: continue
            seen.add(key); items.append(it)
    items.sort(key=lambda i: re.sub(r"\D", "", i["year"]) or "9999")
    return items


def timeline(items):
    lis = "".join(f'<li class="reveal-up"><span class="timeline__year">{esc(i["year"])}</span><div class="timeline__body"><h3>{esc(i["title"])}</h3>{rewrite_html(i["html"])}</div></li>' for i in items)
    return f'<div class="timeline"><span class="timeline__line"><i></i></span><ol>{lis}</ol></div>'


def form(b):
    fields = []
    for f in b["fields"]:
        req = " required" if f["required"] else ""
        nm = re.sub(r"\W+", "_", f["name"]).strip("_") or "field"
        lab = esc(f["label"])
        if f["type"] == "textarea":
            ctl = f'<textarea id="f_{nm}" name="{lab}" rows="5"{req}></textarea>'
        elif f["type"] == "select":
            ctl = f'<select id="f_{nm}" name="{lab}"{req}>' + "".join(f"<option>{esc(o)}</option>" for o in f["options"]) + "</select>"
        else:
            ctl = f'<input id="f_{nm}" name="{lab}" type="{esc(f["type"])}"{req}>'
        wide = " form__f--wide" if f["type"] == "textarea" else ""
        fields.append(f'<div class="form__f{wide}"><label for="f_{nm}">{lab}{" *" if req else ""}</label>{ctl}</div>')
    return (f'<form class="form reveal-up" data-mailto="sales@janyutech.com">{"".join(fields)}'
            f'<div class="form__f form__f--wide"><button class="btn" type="submit"><span>{esc(b["submit"])}</span><i>→</i></button>'
            f'<p class="form__note">Sending opens your email app with this message addressed to sales@janyutech.com.</p></div></form>')


def events_layout(blocks):
    """Event tabs: each event = description + title + date (+ list/button) next to one photo."""
    units, cur = [], None
    def flush():
        nonlocal cur
        if cur: units.append(("ev", cur))
        cur = None
    for b in blocks:
        t = b["t"]
        if t == "img":
            flush(); units.append(("img", b)); continue
        if t in ("h", "list", "btn", "html"):
            is_h = t == "h"
            long_h = is_h and len(b["text"]) > 90
            if cur and ((long_h and cur["desc"]) or (is_h and b["lvl"] <= 2 and cur["title"])): flush()
            if cur is None: cur = {"desc": None, "title": None, "date": None, "extra": [], "img": None}
            if long_h and not cur["desc"]: cur["desc"] = b["text"]
            elif is_h and b["lvl"] <= 2 and not cur["title"]: cur["title"] = b["text"]
            elif is_h and not cur["date"] and len(b["text"]) < 60: cur["date"] = b["text"]
            else: cur["extra"].append(b)
            continue
        flush(); units.append(("other", b))
    flush()
    used = set()
    for i, (k, u) in enumerate(units):
        if k != "ev": continue
        nxt = units[i + 1] if i + 1 < len(units) else None
        prv = units[i - 1] if i > 0 else None
        if nxt and nxt[0] == "img" and not (prv and prv[0] == "img" and id(prv[1]) not in used):
            u["img"] = nxt[1]; used.add(id(nxt[1]))
        elif prv and prv[0] == "img" and id(prv[1]) not in used:
            u["img"] = prv[1]; used.add(id(prv[1]))
        elif nxt and nxt[0] == "img" and id(nxt[1]) not in used:
            u["img"] = nxt[1]; used.add(id(nxt[1]))
    cards, rest = [], []
    for k, u in units:
        if k == "ev":
            im = u["img"]
            cards.append(f'<article class="event reveal-up">'
                         + (f'<a class="event__img" href="{esc(img(im["src"]))}" data-lightbox="events" data-caption="{esc(u["title"] or "")}"><img src="{esc(img(im["src"]))}" alt="{esc(u["title"] or "")}" loading="lazy"></a>' if im else "")
                         + f'<div class="event__body">{f"<span class=event__date>{esc(u["date"])}</span>" if u["date"] else ""}'
                         + f'{f"<h3>{esc(u["title"])}</h3>" if u["title"] else ""}{f"<p>{esc(u["desc"])}</p>" if u["desc"] else ""}{flow(u["extra"])}</div></article>')
        elif k == "img" and id(u) not in used:
            rest.append({"src": u["src"], "alt": u.get("alt", ""), "caption": u.get("caption", "")})
        elif k == "other":
            cards.append(flow([u]))
    out = f'<div class="events">{"".join(cards)}</div>'
    if rest: out += gallery({"imgs": rest})
    return out


TAB_N = [0]


def tabs(b):
    TAB_N[0] += 1
    k = TAB_N[0]
    nav = "".join(f'<button role="tab" id="tab{k}-{i}" aria-controls="tp{k}-{i}" aria-selected="{"true" if i == 0 else "false"}" class="tabs__btn{" is-active" if i == 0 else ""}">{esc(t["label"])}</button>' for i, t in enumerate(b["tabs"]))
    panels = "".join(f'<div class="tabs__panel" role="tabpanel" id="tp{k}-{i}" aria-labelledby="tab{k}-{i}"{"" if i == 0 else " hidden"}>{events_layout(t["blocks"])}</div>' for i, t in enumerate(b["tabs"]))
    return f'<div class="tabs" data-tabs><div class="tabs__nav" role="tablist">{nav}</div>{panels}</div>'


TEXTY = {"h", "html", "list", "btn", "eyebrow", "anchor", "social", "pdf"}
GRIDDY = {"card", "member", "photo", "gallery", "tabs", "form", "timeline", "map"}


def flow(blocks, feature=False):
    """Render a run of blocks top-to-bottom, grouping repeated items into grids."""
    out, i, n = [], 0, len(blocks)
    while i < n:
        b = blocks[i]; t = b["t"]
        if t == "anchor":
            out.append(f'<span class="anchor" id="{esc(b["id"])}"></span>'); i += 1; continue
        if t == "h":
            out.append(heading(b, "feature" if feature else "flow")); i += 1; continue
        if t == "eyebrow":
            out.append(f'<p class="eyebrow reveal-up">{esc(b["text"])}</p>'); i += 1; continue
        if t == "html":
            out.append(f'<div class="prose reveal-up">{rewrite_html(b["html"])}</div>'); i += 1; continue
        if t == "list":
            out.append(list_html(b["items"])); i += 1; continue
        if t == "btn":
            j = i
            while j < n and blocks[j]["t"] == "btn": j += 1
            out.append(btns(blocks[i:j])); i = j; continue
        if t == "card":
            j = i
            while j < n and blocks[j]["t"] == "card": j += 1
            run = blocks[i:j]
            plain = not any(c.get("img") for c in run)
            out.append(f'<div class="cards{" cards--plain" if plain else ""}">{"".join(card(c, k+1) for k, c in enumerate(run))}</div>'); i = j; continue
        if t == "member":
            j = i
            while j < n and blocks[j]["t"] == "member": j += 1
            out.append(f'<div class="team">{"".join(member(m) for m in blocks[i:j])}</div>'); i = j; continue
        if t == "photo":
            j = i
            while j < n and blocks[j]["t"] == "photo": j += 1
            out.append(f'<div class="photos">{"".join(figure(p["src"], p["title"], p["text"], "photos") for p in blocks[i:j])}</div>'); i = j; continue
        if t == "img":
            # img + small heading pairs (certificates, awards) → captioned grid
            j, pairs = i, []
            while j + 1 < n and blocks[j]["t"] == "img" and blocks[j+1]["t"] == "h" and blocks[j+1]["lvl"] >= 4:
                pairs.append((blocks[j], blocks[j+1])); j += 2
            if len(pairs) >= 2:
                out.append(f'<div class="photos photos--certs">{"".join(figure(a["src"], h["text"], "", "certs") for a, h in pairs)}</div>'); i = j; continue
            out.append(picture(b["src"], b.get("alt") or b.get("caption"), "media--frame reveal-up", fluid=True) +
                       (f'<p class="media__cap">{esc(b["caption"])}</p>' if b.get("caption") else "")); i += 1; continue
        if t == "video":
            j, vids = i, []
            while j < n and blocks[j]["t"] == "video":
                cap = ""
                if j + 1 < n and blocks[j+1]["t"] == "h" and blocks[j+1]["lvl"] >= 5:
                    cap = blocks[j+1]["text"]; vids.append((blocks[j], cap)); j += 2
                else:
                    vids.append((blocks[j], cap)); j += 1
            cls = "videos" if len(vids) > 1 else "videos videos--one"
            out.append(f'<div class="{cls}">{"".join(video(v, c) for v, c in vids)}</div>'); i = j; continue
        if t == "slider":
            out.append(slider(b)); i += 1; continue
        if t == "gallery":
            logos = b.get("unknown") == "ucaddon_logo_carousel"
            out.append(gallery(b, logos)); i += 1; continue
        if t == "timeline":
            j = i
            while j < n and blocks[j]["t"] == "timeline": j += 1
            out.append(timeline(merge_timelines(blocks[i:j]))); i = j; continue
        if t == "tabs":
            out.append(tabs(b)); i += 1; continue
        if t == "form":
            out.append(form(b)); i += 1; continue
        if t == "map":
            out.append(f'<div class="map reveal-up"><iframe src="{esc(b["src"])}" title="JanyuTech on Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>'); i += 1; continue
        if t == "pdf":
            out.append(f'<a class="doc reveal-up" {a_attrs(b["url"])}><span class="doc__icon">PDF</span><span><strong>{esc(b["title"])}</strong><small>Open document ↗</small></span></a>'); i += 1; continue
        if t == "social":
            out.append('<div class="social reveal-up">' + "".join(f'<a {a_attrs(l["href"])}>{esc(l["label"] or social_label(l["href"]))} ↗</a>' for l in b["links"]) + "</div>"); i += 1; continue
        i += 1
    return "".join(out)


FLIP = [0]


def chunk_by_anchor(blocks):
    chunks, cur = [], []
    for b in blocks:
        if b["t"] == "anchor" and any(x["t"] != "anchor" for x in cur):
            chunks.append(cur); cur = []
        cur.append(b)
    if cur: chunks.append(cur)
    return chunks


def render_chunk(ch):
    types = {b["t"] for b in ch}
    media = [b for b in ch if b["t"] in ("img", "slider")]
    vids = [b for b in ch if b["t"] == "video"]
    has_text = bool(types & {"html", "list", "h"})
    imgpairs = sum(1 for k in range(len(ch) - 1) if ch[k]["t"] == "img" and ch[k+1]["t"] == "h" and ch[k+1]["lvl"] >= 4)
    if has_text and not (types & GRIDDY) and imgpairs < 2 and (len(media) >= 1 or (len(vids) == 1 and not media)) and len(media) <= 3:
        side = media if media else vids
        rest = [b for b in ch if b not in side]
        # lead headings (h2) stay above the row
        lead = []
        while rest and rest[0]["t"] in ("anchor",) : lead.append(rest.pop(0))
        m_html = "".join(slider(b, True) if b["t"] == "slider" else (picture(b["src"], b.get("alt"), "media--frame", fluid=True) if b["t"] == "img" else video(b)) for b in side)
        FLIP[0] += 1
        flip = " feature--flip" if FLIP[0] % 2 == 0 else ""
        return f'{flow(lead)}<div class="feature{flip}"><div class="feature__media reveal-media">{m_html}</div><div class="feature__body">{flow(rest, feature=True)}</div></div>'
    return flow(ch)


def render_blocks(blocks):
    return "".join(render_chunk(c) for c in chunk_by_anchor(blocks))


# ---------------------------------------------------------------- chrome
MENU = D["menu"]


def overlay_html():
    def walk(items, d=0):
        out = []
        for i, it in enumerate(items):
            kids = it["children"]
            a = f'<a href="{esc(link(it["href"]))}">{esc(it["text"])}</a>'
            if kids:
                out.append(f'<li class="om__item om__item--d{d}"><div class="om__row">{a}<button class="om__toggle" aria-expanded="false" aria-label="Show {esc(it["text"])} links">+</button></div><ul class="om__sub" hidden>{walk(kids, d+1)}</ul></li>')
            else:
                out.append(f'<li class="om__item om__item--d{d}"><div class="om__row">{a}</div></li>')
        return "".join(out)
    extra = [{"text": "Contact Us", "href": BASE + "/contact-us/", "children": []}, {"text": "Gallery", "href": BASE + "/gallery/", "children": []},
             {"text": "Awards & Certificates", "href": BASE + "/awards-and-certificates/", "children": []}]
    return walk(MENU + extra)


def header():
    return f'''<a class="skip" href="#content">Skip to content</a>
<header class="site-header" data-header>
  <a href="/" class="site-logo" aria-label="JanyuTech home"><img src="/assets/logo.png" alt="JanyuTech" width="368" height="86"></a>
  <a href="/contact-us/" class="pill" data-magnetic>Contact Us <i>→</i></a>
  <button type="button" class="burger" data-menu-btn aria-expanded="false" aria-controls="menu"><span class="burger__lines" aria-hidden="true"><i></i><i></i></span><span class="burger__label"><span class="burger__open">Menu</span><span class="burger__close">Close</span></span></button>
</header>
<div class="menu" id="menu" data-menu>
  <div class="menu__bg" aria-hidden="true"><span class="menu__grid"></span></div>
  <div class="menu__in">
    <nav aria-label="All pages"><ul class="om">{overlay_html()}</ul></nav>
    <div class="menu__side">
      <a class="btn-line" href="/contact-us/">Book a demo</a>
      <div class="menu__contact">
        <p class="menu__label">Sales</p>
        <a href="mailto:sales@janyutech.com">sales@janyutech.com</a>
        <a href="tel:+917770012260">+91 77700 12260</a>
      </div>
      <div class="menu__social">{"".join(f'<a class="menu__label" href="{u}" target="_blank" rel="noopener">{t}</a>' for t, u in SOCIAL)}</div>
    </div>
  </div>
</div>
<div class="curtain" aria-hidden="true"></div>'''


SOCIAL = [("LinkedIn", "https://www.linkedin.com/company/janyu-tech/"), ("X", "https://twitter.com/janyutech"),
          ("YouTube", "https://www.youtube.com/@JanyuTechOfficial/videos"), ("Instagram", "https://www.instagram.com/janyutech_?igshid=YmMyMTA2M2Y=")]


def footer():
    useful = [("Home", "/"), ("Products", "/products/"), ("Services", "/services/"), ("About us", "/about-us/"), ("Contact us", "/contact-us/")]
    quick = [("Careers", "/career/"), ("Events", "/events/"), ("Gallery", "/gallery/"), ("Awards & Certificates", "/awards-and-certificates/"), ("Privacy Policy", "/privacy-policy/")]
    social = [("LinkedIn", "https://www.linkedin.com/company/janyu-tech/"), ("X / Twitter", "https://twitter.com/janyutech"),
              ("YouTube", "https://www.youtube.com/@JanyuTechOfficial/videos"), ("Instagram", "https://www.instagram.com/janyutech_?igshid=YmMyMTA2M2Y=")]
    lis = lambda xs: "".join(f'<li><a href="{u}" class="roll"><span data-text="{esc(t)}">{esc(t)}</span></a></li>' for t, u in xs)
    return f'''<footer class="site-footer" id="contact">
  <div class="contact">
    <p class="eyebrow">For business inquiries, please contact sales@janyutech.com</p>
    <h2 class="contact__big" aria-label="Let's talk">
      <span class="line"><span class="split">Let's</span></span>
      <span class="line line--indent"><span class="split">Talk</span></span>
    </h2>
    <div class="contact__row">
      <a href="mailto:sales@janyutech.com" class="contact__btn" data-magnetic><span>sales@janyutech.com</span></a>
      <a href="tel:+917770012260" class="contact__btn contact__btn--ghost" data-magnetic><span>+91 77700 12260</span></a>
    </div>
  </div>
  <div class="foot-grid">
    <div class="foot-col foot-col--brand">
      <img src="/assets/logo.png" alt="JanyuTech" class="foot__logo" width="368" height="86" loading="lazy">
      <p>Spearheading Robotic Revolution</p>
      <address>Unit 1 &amp; 2, Dhuri Industrial Complex No.1, Madhu Vrinda Phase 4, Waliv Phata, Sativali Road, Vasai East 401208.</address>
    </div>
    <div class="foot-col"><h3>Useful Links</h3><ul>{lis(useful)}</ul></div>
    <div class="foot-col"><h3>Quick Links</h3><ul>{lis(quick)}</ul></div>
    <div class="foot-col"><h3>Contact Us</h3><ul>
      <li><a href="tel:+917770012260">+91 77700 12260</a></li><li><a href="mailto:sales@janyutech.com">sales@janyutech.com</a></li></ul>
      <div class="social">{"".join(f'<a href="{u}" target="_blank" rel="noopener">{t} ↗</a>' for t, u in social)}</div>
    </div>
  </div>
  <div class="foot-bottom"><span>Copyright © {date.today().year} JanyuTech All Rights Reserved.</span><a href="#top" class="to-top">Back to top ↑</a></div>
</footer>'''


def doc(title, desc, body, og="", body_cls="", canonical="/"):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{canonical}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
{f'<meta property="og:image" content="{esc(og)}">' if og else ""}
<link rel="icon" href="/assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;0,800;1,800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v={VER}">
<link rel="stylesheet" href="/site.css?v={VER}">
{WORLD_HEAD if body_cls == "home" else ""}
</head>
<body class="{body_cls}" id="top">
<div class="cursor" aria-hidden="true"><span class="cursor__label">View</span></div>
<div class="cursor-dot" aria-hidden="true"></div>
{header()}
<main id="content">
{body}
</main>
{footer()}
<div class="lightbox" hidden><button class="lightbox__close" aria-label="Close">×</button><button class="lightbox__prev" aria-label="Previous">←</button><figure><img alt=""><figcaption></figcaption></figure><button class="lightbox__next" aria-label="Next">→</button></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
<script src="/fluid.js?v={VER}"></script>
<script src="/main.js?v={VER}"></script>
{WORLD_JS if body_cls == "home" else ""}
</body>
</html>'''


# The landing's first screen is a 3D world (world.js, three.js from jsDelivr). If three.js can't be fetched the
# import fails and the section keeps its flat look: the title, the robots as links, the film as a video.
THREE = "https://cdn.jsdelivr.net/npm/three@0.186.1"
WORLD_HEAD = f'''<link rel="stylesheet" href="/world.css?v={VER}">
<script type="importmap">{{"imports": {{"three": "{THREE}/build/three.module.min.js", "three/addons/": "{THREE}/examples/jsm/"}}}}</script>
<link rel="modulepreload" href="{THREE}/build/three.module.min.js">
<link rel="modulepreload" href="{THREE}/build/three.core.min.js">
<link rel="preload" href="/assets/models/defence-rover.glb" as="fetch" crossorigin>
<link rel="preload" href="/assets/models/quadruped-robot.glb" as="fetch" crossorigin>'''
WORLD_JS = f'''<script type="module">import("./world.js?v={VER}").catch(e => {{ console.warn("world:", e); document.querySelector("[data-xp]")?.classList.add("is-flat"); }});</script>'''


# ---------------------------------------------------------------- inner pages
def crumbs(path):
    parts = [p for p in path.split("/") if p]
    out = ['<a href="/">Home</a>']
    acc = ""
    for i, p in enumerate(parts):
        acc += "/" + p
        slug = acc.strip("/").replace("/", "__")
        name = page_h1(PAGES[slug]) if slug in PAGES else p.replace("-", " ").title()
        out.append(f'<a href="{acc}/">{esc(name)}</a>' if i < len(parts) - 1 else f'<span aria-current="page">{esc(name)}</span>')
    return '<nav class="crumbs" aria-label="Breadcrumb">' + '<i>/</i>'.join(out) + "</nav>"


def page_h1(p):
    for s in p["sections"]:
        for b in s["blocks"]:
            if b["t"] == "h" and b["lvl"] == 1: return b["text"]
    return re.split(r"\s[-|–]\s", p["title"])[0]


def split_words(t):
    return " ".join(f'<span class="w"><span class="split">{esc(w)}</span></span>' for w in t.split())


# Careers: while there are no open positions the page says so and still invites a CV. The old listings stay in
# content.json; set CAREER_HIRING = True to show them (and the "We're hiring" intro) again.
CAREER_HIRING = False
CAREER_MAIL = "hr@janyutech.com,nitin.nair@janyutech.com"


def not_hiring():
    from urllib.parse import quote
    href = f"mailto:{CAREER_MAIL}?subject={quote('I would like to work at JanyuTech')}"
    return f'''<section class="sec sec--hire"><div class="hire">
  <p class="eyebrow hire__status reveal-up">No open positions right now</p>
  <h2 class="sec-title reveal-up">Want to work with us?</h2>
  <p class="lead-p reveal-up">We aren’t hiring at the moment, but we’d still love to hear from you. If you want to build robots that keep people out of harm’s way, send us your CV and a few lines about the work you’d like to do. We’ll get in touch when a role opens up.</p>
  <div class="btn-row reveal-up"><a class="btn" href="{esc(href)}" data-magnetic><span>Let us know you’re interested</span><i>→</i></a><span class="hire__alt">or write to <a class="ulink" href="mailto:hr@janyutech.com">hr@janyutech.com</a></span></div>
</div></section>'''


def inner_page(p):
    FLIP[0] = 0
    h1 = page_h1(p)
    secs = []
    removed = False
    for s in p["sections"]:
        blocks = []
        for b in s["blocks"]:
            if not removed and b["t"] == "h" and b["lvl"] == 1:
                removed = True; continue
            blocks.append(b)
        if blocks: secs.append(blocks)
    # a short opening paragraph right after the title becomes the hero lead
    lead = ""
    if secs and secs[0] and secs[0][0]["t"] == "html" and len(strip_tags(secs[0][0]["html"])) < 160 and len(secs[0]) == 1:
        lead = strip_tags(secs[0][0]["html"]); secs = secs[1:]
    path = "/" + p["path"] + "/"
    hero_img = CARD_IMG.get(path) or first_media(p)
    if hero_img and not landscape(hero_img): hero_img = ""
    hero = f'''<section class="phero">
  {crumbs(p["path"])}
  <h1 class="phero__title">{split_words(h1)}</h1>
  {f'<p class="phero__lead">{esc(lead)}</p>' if lead else ""}
  <div class="phero__meta"><span class="phero__scroll">Scroll <span class="hero__scroll-line"></span></span></div>
</section>
{f'<div class="phero__banner{" phero__banner--contain" if is_cutout(hero_img) else ""}"{"" if is_cutout(hero_img) else " data-fluid"}><img src="{esc(img(hero_img))}" alt="" decoding="async"></div>' if hero_img else ""}'''
    notice = ""
    if p["path"] == "career" and not CAREER_HIRING:     # drop the "We're hiring" intro and the old openings
        said = lambda bl: " ".join((x.get("text") or "") for x in bl).lower()
        secs = [b for b in secs if "hiring" not in said(b) and "current openings" not in said(b)]
        notice = not_hiring()
    body = hero + notice + "".join(f'<section class="sec">{render_blocks(b)}</section>' for b in secs)
    og = img(hero_img) if hero_img else ""
    return doc(p["title"], p["desc"] or f"{h1} | JanyuTech", body, og=BASE + og if og.startswith("/") else og, body_cls="inner", canonical=path)


# ---------------------------------------------------------------- home
# The landing's first screen: drive one of two robots through a small dark world (world.js).
# "img" is a render of the same model; "href" is where the card goes when the 3D world can't run.
XP_BOTS = [
    {"key": "rover", "n": "01", "name": "Defence Bot", "kind": "Four-wheel UGV", "trait": "Quick, and drifts on sand",
     "img": "/assets/models/defence-rover.webp", "href": "/products/defence-robots/"},
    {"key": "quad", "n": "02", "name": "Quad Bot", "kind": "Four-legged robot", "trait": "Sure-footed, turns on the spot",
     "img": "/assets/models/quadruped-robot.webp", "href": "/industries/dna/#legged"},
]
FILM = {"src": "/assets/video/janyu-in-the-field.mp4", "poster": "/assets/video/janyu-in-the-field.webp", "tag": "In the field",
        "title": "Our robots at work", "text": "Robot arms, automated lines, lab automation and all-terrain crawlers, filmed where they work."}


# Product cards whose own photo makes a noisy blueprint use a render from the same product page
BP_OVERRIDE = {"Varaha Mining Robots": "varah-dozer-a"}


def bp_key(c):
    if c["title"] in BP_OVERRIDE: return BP_OVERRIDE[c["title"]]
    local = IMG.get(c.get("img", ""), "")
    key = re.sub(r"^\d{4}-\d{2}-", "", os.path.splitext(local)[0]).lower()
    return key if key and os.path.exists(os.path.join(SITE, "assets", "bp", key + "-bp.webp")) else ""


def bpx(c):
    k = bp_key(c)
    if not k:
        return f'<img src="{esc(img(c["img"]))}" alt="{esc(c["title"])}" loading="lazy">'
    return (f'<img class="bpx__bp" src="/assets/bp/{k}-bp.webp" alt="" loading="lazy" decoding="async">'
            f'<img class="bpx__photo" src="/assets/bp/{k}.webp" alt="{esc(c["title"])}" loading="lazy" decoding="async"><span class="bpx__scan"></span>')


def home_page():
    p = PAGES["home"]
    S = [s["blocks"] for s in p["sections"]]
    get = lambda s, t: [b for b in s if b["t"] == t]
    seo_h2 = [b["text"] for b in get(S[0], "h")]
    hero_eyebrow = get(S[1], "eyebrow")[0]["text"]
    hero_sub = [b["text"] for b in get(S[1], "h") if b["lvl"] == 3][0]
    hero_btns = get(S[1], "btn")
    about = S[2]; about_h = get(about, "h"); about_lists = get(about, "list"); about_btn = get(about, "btn"); about_gal = get(about, "gallery")[0]["imgs"]
    ind = S[3]; ind_h = get(ind, "h"); ind_cards = get(ind, "card")
    biz = S[4]; biz_h = get(biz, "h")[0]["text"]; biz_btn = get(biz, "btn")[0]
    prod = S[5]; prod_h = get(prod, "h"); prod_cards = get(prod, "card"); prod_all = get(prod, "btn")[0]
    why = S[6]; why_h = get(why, "h")[0]["text"]; why_cards = get(why, "card")
    cli = S[7]; cli_h = get(cli, "h")[0]["text"]; cli_imgs = get(cli, "gallery")[0]["imgs"]

    chips = "".join(f'<li><a {a_attrs(it["href"])}>{esc(it["text"])}</a></li>' if it.get("href") else f"<li><span>{esc(it['text'])}</span></li>" for l in about_lists for it in l["items"])
    panels = []
    for k, c in enumerate(ind_cards):
        panels.append(f'''<article class="panel">
        <div class="panel__bg" data-fluid-panel><img src="{esc(img(c["img"]))}" alt="" loading="{"eager" if k == 0 else "lazy"}"></div>
        <div class="panel__body">
          <span class="panel__num">{k+1:02d} / {len(ind_cards):02d}</span>
          <h3>{esc(c["title"])}</h3>
          <p>{esc(c["text"])}</p>
          <a {a_attrs(c["href"])} class="reach">{esc(c["btn"] or "View Products")} <b>✦</b></a>
        </div>
      </article>''')
    plist = []
    for k, c in enumerate(prod_cards):
        bpk = bp_key(c)
        plist.append(f'''<li class="pitem" data-img="{esc(img(c["img"]))}"{f' data-bp="/assets/bp/{bpk}-bp.webp" data-photo="/assets/bp/{bpk}.webp"' if bpk else ""}>
        <a {a_attrs(c["href"])}>
          <div class="pitem__img bpx">{bpx(c)}</div>
          <span class="pitem__n">{k+1:02d}</span>
          <h3>{esc(c["title"])}</h3>
          <span class="pitem__meta">{esc(c["btn"] or "View Product")} →</span>
        </a>
      </li>''')
    whys = "".join(f'<li class="reveal-up"><span>{k+1:02d}</span><h3>{esc(c["title"])}</h3></li>' for k, c in enumerate(why_cards))
    logos = "".join(f'<img src="{esc(img(i["src"]))}" alt="{esc(i["alt"].replace("_", " "))}" loading="lazy">' for i in cli_imgs)
    logos_dup = "".join(f'<img src="{esc(img(i["src"]))}" alt="" aria-hidden="true" loading="lazy">' for i in cli_imgs)

    bots = "".join(f'''<a class="xp__bot" data-bot="{b["key"]}" href="{b["href"]}">
          <span class="xp__bot-img"><img src="{b["img"]}" alt="" width="288" height="288" decoding="async"></span>
          <span class="xp__bot-n">{b["n"]}</span>
          <span class="xp__bot-name">{esc(b["name"])}</span>
          <span class="xp__bot-kind">{esc(b["kind"])}. {esc(b["trait"])}.</span>
          <span class="xp__bot-go" aria-hidden="true"><span class="xp__if-gl">Drive</span><span class="xp__if-flat">View</span> <i>→</i></span>
        </a>''' for b in XP_BOTS)

    body = f'''
<section class="xp" data-xp data-mode="boot" aria-labelledby="xp-title">
  <div class="xp__stage" tabindex="-1">
    <div class="xp__backdrop" aria-hidden="true"></div>
    <canvas class="xp__gl" aria-hidden="true"></canvas>
    <video class="xp__film" src="{FILM["src"]}" poster="{FILM["poster"]}" muted loop playsinline preload="none" width="960" height="540" aria-hidden="true" tabindex="-1"></video>
    <div class="xp__water" aria-hidden="true"></div>
    <div class="xp__shade" aria-hidden="true"></div>

    <div class="xp__one">
      <p class="eyebrow xp__eyebrow">{esc(hero_eyebrow)}</p>
      <h1 class="xp__title" id="xp-title" aria-label="Janyu Tech"><span class="xp__line" data-text="Janyu">Janyu</span> <span class="xp__line" data-text="Tech">Tech</span></h1>
      <p class="xp__quote">“{esc(hero_sub)}”</p>
      <div class="xp__pick">
        <p class="eyebrow xp__pick-label" id="xp-pick"><span class="xp__if-gl">Choose a robot to drive</span><span class="xp__if-flat">Two of our robots</span><span class="xp__boot" aria-hidden="true">Loading the robots <b class="xp__boot-n">000</b>%</span></p>
        <div class="xp__bots" role="group" aria-labelledby="xp-pick">{bots}</div>
        <p class="xp__hint">Drive with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and hop with <kbd>Space</kbd></p>
      </div>
    </div>

    <div class="xp__hud">
      <div class="xp__hud-top">
        <p class="xp__hud-bot"><span class="eyebrow">Driving</span> <b class="xp__hud-name">{esc(XP_BOTS[0]["name"])}</b></p>
        <p class="xp__speed" aria-hidden="true"><b class="xp__speed-n">0</b><span class="eyebrow">km/h</span></p>
      </div>
      <div class="xp__keys" aria-hidden="true">
        <span class="xp__pad"><kbd data-k="up">W</kbd><kbd data-k="left">A</kbd><kbd data-k="down">S</kbd><kbd data-k="right">D</kbd></span><span class="xp__keys-t">Drive</span>
        <kbd data-k="hop" class="xp__space">Space</kbd><span class="xp__keys-t">Hop</span>
      </div>
      <div class="xp__acts">
        <button type="button" data-act="swap">Swap robot <kbd>Q</kbd></button>
        <button type="button" data-act="reset">Start again <kbd>R</kbd></button>
        <button type="button" data-act="exit">Back <kbd>Esc</kbd></button>
      </div>
    </div>
    <div class="xp__touch" aria-hidden="true">
      <div class="xp__joy"><span class="xp__joy-knob"></span></div>
      <button type="button" class="xp__hop" tabindex="-1">Hop</button>
    </div>

    <div class="xp__two">
      <p class="eyebrow xp__chap">{esc(FILM["tag"])}</p>
      <h2 class="xp__two-title">{esc(FILM["title"])}</h2>
      <p class="xp__two-lead">{esc(FILM["text"])}</p>
    </div>
    <div class="xp__film-cap">
      <div><p class="eyebrow xp__chap">{esc(FILM["tag"])}</p><p class="xp__film-title">{esc(FILM["title"])}</p></div>
      <button type="button" class="btn btn--light xp__watch" data-film-open><span>Watch the film</span><i aria-hidden="true">▶</i></button>
    </div>

    <p class="xp__cue" aria-hidden="true">Scroll <span class="hero__scroll-line"></span></p>
  </div>
</section>

<dialog class="filmbox" aria-label="{esc(FILM["title"])}">
  <button type="button" class="filmbox__close" aria-label="Close the film">×</button>
  <video src="{FILM["src"]}" poster="{FILM["poster"]}" controls playsinline preload="none" width="960" height="540"></video>
</dialog>

<section class="intro">
  <div class="lede">
    <p class="eyebrow lede__eyebrow reveal">{esc(seo_h2[0] if seo_h2 else "")}</p>
    <p class="lede__text reveal">{esc(seo_h2[1] if len(seo_h2) > 1 else "")}</p>
    {btns(hero_btns)}
  </div>
  <div class="intro__inner">
    <h2 class="display reveal-lines"><span>{esc(about_h[0]["text"])}</span></h2>
    <div class="intro__copy">
      <p class="reveal">{esc(about_h[1]["text"]) if len(about_h) > 1 else ""}</p>
      <ul class="chips reveal">{chips}</ul>
      {btns(about_btn)}
    </div>
  </div>
  <div class="intro__gallery">{"".join(f'<div class="intro__shot" data-fluid><img src="{esc(img(g["src"]))}" alt="{esc(g["alt"])}" loading="lazy"></div>' for g in about_gal)}</div>
</section>

<section class="marquee" aria-label="Safety, Robotics, ESG, Automation, Industry 4.0">
  <div class="marquee__track">
    <div class="marquee__row"><span>SAFETY</span><i>✦</i><span>ROBOTICS</span><i>✦</i><span>ESG</span><i>✦</i><span>AUTOMATION</span><i>✦</i><span>INDUSTRY 4.0</span><i>✦</i></div>
    <div class="marquee__row" aria-hidden="true"><span>SAFETY</span><i>✦</i><span>ROBOTICS</span><i>✦</i><span>ESG</span><i>✦</i><span>AUTOMATION</span><i>✦</i><span>INDUSTRY 4.0</span><i>✦</i></div>
  </div>
</section>

<section id="industries" class="industries">
  <div class="sec-head">
    <h2 class="display reveal-lines"><span>{esc(ind_h[0]["text"])}</span></h2>
    <div>{"".join(f'<p class="reveal">{esc(h["text"])}</p>' for h in ind_h[1:])}</div>
  </div>
  <div class="panels">{"".join(panels)}</div>
</section>

<section class="biz">
  <h2 class="biz__title reveal-up">{esc(biz_h)}</h2>
  {btns([biz_btn])}
</section>

<section id="products" class="products">
  <div class="products__head">
    <div>
      <h2 class="display reveal-lines"><span>{esc(prod_h[0]["text"])}</span></h2>
      {"".join(f'<p class="products__lead reveal">{esc(h["text"])}</p>' for h in prod_h[1:])}
    </div>
    <div class="toggle" role="tablist" aria-label="Product layout">
      <button class="toggle__btn is-active" data-view="list" role="tab" aria-selected="true">List View</button>
      <button class="toggle__btn" data-view="card" role="tab" aria-selected="false">Card View</button>
      <span class="toggle__pill"></span>
    </div>
  </div>
  <ul class="plist is-list" id="plist">{"".join(plist)}</ul>
  {btns([prod_all])}
  <div class="hover-img bpx" aria-hidden="true"><img class="bpx__bp" src="" alt=""><img class="bpx__photo" src="" alt=""><span class="bpx__scan"></span></div>
</section>

<section id="why" class="why">
  <h2 class="display reveal-lines"><span>{esc(why_h)}</span></h2>
  <ol class="why__list">{whys}</ol>
</section>

<section class="clients">
  <p class="eyebrow reveal">{esc(cli_h)}</p>
  <div class="clients__track"><div class="clients__row">{logos}{logos_dup}</div></div>
</section>'''
    return doc(p["title"], p["desc"], body, og=p.get("og", ""), body_cls="home", canonical="/")


# ---------------------------------------------------------------- write
def relativize(html, depth):
    """Rewrite root-absolute URLs ("/assets/…") as relative ones ("../../assets/…"),
    so the site works at a domain root, under a sub-path (user.github.io/repo/) or locally."""
    pre = "../" * depth if depth else "./"
    def fix(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if url.startswith("//"): return m.group(0)
        return f"{attr}={q}{pre}{url[1:]}"
    return re.sub(r'\b(href|src|poster|data-img|data-bp|data-photo)=(["\'])(/[^"\']*)', fix, html)


def write(path, html):
    out = os.path.join(SITE, path, "index.html") if path else os.path.join(SITE, "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    depth = len([x for x in path.split("/") if x]) if path else 0
    open(out, "w").write(relativize(html, depth))


write("", home_page())
for slug, p in PAGES.items():
    if slug == "home": continue
    write(p["path"], inner_page(p))

nf = doc("Page not found | JanyuTech", "This page does not exist.",
         '<section class="phero"><h1 class="phero__title">' + split_words("Page not found") + '</h1><p class="phero__lead">The page you are looking for has moved or no longer exists.</p><div class="btn-row"><a class="btn" href="/"><span>Back to home</span><i>→</i></a><a class="btn btn--ghost" href="/products/"><span>Browse products</span><i>→</i></a></div></section>',
         body_cls="inner", canonical="/404/")
open(os.path.join(SITE, "404.html"), "w").write(nf)

urls = ["/"] + ["/" + p["path"] + "/" for s, p in PAGES.items() if s != "home"]
open(os.path.join(SITE, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
open(os.path.join(SITE, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
print("built", len(urls), "pages;", len(IMG), "local images mapped")
