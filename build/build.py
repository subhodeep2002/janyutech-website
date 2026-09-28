"""
Static site generator for the JanyuTech redesign.

  content.json  – every page of janyutech.com, extracted block by block (see extract.py)
  img_map.json  – original image URL → local /assets/img file (see imgs.py)

Run:  python3 build/build.py      (writes index.html + one folder per page into the site root)
Needs Pillow (pip install Pillow): image sizes decide which pages get a banner and which cards show cutouts.
"""
import json, os, re, sys, html as H
from datetime import date

try:
    import PIL.Image  # noqa: F401  – without it every banner and cutout would silently disappear
except ImportError:
    sys.exit("build.py needs Pillow – run: pip install Pillow")

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
VER = "19"

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
            out.append(f'<a class="{cls}" {a_attrs(b["href"])}><span>{esc(b["text"])}</span><i>→</i></a>')
    return f'<div class="btn-row reveal-up">{"".join(out)}</div>'


def picture(src, alt="", cls="", fluid=False, eager=False):
    f = ""
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


def nav_html():
    items = []
    for it in MENU:
        href = link(it["href"])
        kids = it["children"]
        if kids and any(k["children"] for k in kids):   # mega menu (Products)
            cols = "".join(
                f'<div class="mega__col"><a class="mega__head" href="{esc(link(k["href"]))}">{esc(k["text"])}</a>'
                + ("<ul>" + "".join(f'<li><a href="{esc(link(g["href"]))}">{esc(g["text"])}</a></li>' for g in k["children"]) + "</ul>" if k["children"] else "")
                + "</div>" for k in kids)
            items.append(f'<li class="has-mega"><a href="{esc(href)}" class="roll"><span data-text="{esc(it["text"])}">{esc(it["text"])}</span></a>'
                         f'<div class="mega"><div class="mega__inner"><div class="mega__intro"><p class="eyebrow">Explore</p><a href="{esc(href)}" class="mega__all">All products →</a></div><div class="mega__grid">{cols}</div></div></div></li>')
        elif kids:
            sub = "".join(f'<li><a href="{esc(link(k["href"]))}">{esc(k["text"])}</a></li>' for k in kids)
            items.append(f'<li class="has-drop"><a href="{esc(href)}" class="roll"><span data-text="{esc(it["text"])}">{esc(it["text"])}</span></a><div class="drop"><ul>{sub}</ul></div></li>')
        else:
            items.append(f'<li><a href="{esc(href)}" class="roll"><span data-text="{esc(it["text"])}">{esc(it["text"])}</span></a></li>')
    return "".join(items)


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


import math as _m

def spark(cls="spark"):
    """our mark: a five-petal blossom round a hex nut – robotics and the blue blossom in one sign"""
    petal = "M0,-6.2 C-4.6,-7.4 -7,-12.6 -5.6,-16.8 C-4.6,-19.8 -1.9,-20.9 0,-18.7 C1.9,-20.9 4.6,-19.8 5.6,-16.8 C7,-12.6 4.6,-7.4 0,-6.2 Z"
    petals = "".join(f'<path d="{petal}" transform="rotate({k * 72})"/>' for k in range(5))
    hexa = " ".join(f"{3.9 * _m.cos(_m.radians(30 + 60 * k)):.2f},{3.9 * _m.sin(_m.radians(30 + 60 * k)):.2f}" for k in range(6))
    return (f'<svg class="{cls}" viewBox="-22 -22 44 44" aria-hidden="true"><g fill="currentColor">{petals}'
            f'<polygon points="{hexa}"/></g></svg>')


def jt_logo(cls="jt-logo", title=True):
    """the JanyuTech logo, redrawn: JANYU on steel grey, TECH on the brand blue, and a light that runs across on hover"""
    n = cls.split()[0]
    return (f'<svg class="{cls}" viewBox="0 0 200 38"{" role=\"img\" aria-label=\"Janyu Tech\"" if title else " aria-hidden=\"true\""}>'
            f'<defs><clipPath id="{n}-c"><rect width="200" height="38" rx="8"/></clipPath>'
            f'<linearGradient id="{n}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4b7bd"/><stop offset="1" stop-color="#9a9da4"/></linearGradient>'
            f'<linearGradient id="{n}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a86e2"/><stop offset="1" stop-color="#006ec2"/></linearGradient>'
            f'<linearGradient id="{n}-s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
            f'<g clip-path="url(#{n}-c)"><rect class="jt-l" width="111" height="38" fill="url(#{n}-g)"/><rect class="jt-r" x="114" width="86" height="38" fill="url(#{n}-b)"/>'
            f'<g class="jt-shine"><rect x="-70" y="-10" width="46" height="58" fill="url(#{n}-s)" transform="skewX(-18)"/></g></g>'
            f'<text class="jt-lt" x="55.5" y="28" text-anchor="middle" fill="#1f1d24" textLength="86" lengthAdjust="spacingAndGlyphs">JANYU</text>'
            f'<text x="157" y="28" text-anchor="middle" fill="#fff" textLength="62" lengthAdjust="spacingAndGlyphs">TECH</text></svg>')


def btn_pill(href, label, cls="", attrs=""):
    """the button: a pill with a round arrow that swells to fill it on hover (and springs back)"""
    return (f'<a class="pill {cls}" href="{esc(href)}" data-magnetic{attrs}><span class="pill__t">{esc(label)}</span>'
            f'<span class="pill__i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/></svg></span></a>')


def flower(name, cls, flip=False, lazy=True):
    """a spray of blue blossom that sways: a looping video with a transparent background (VP9 for Chrome and
    Firefox, HEVC for Safari), with its first frame as the poster; it only loads when it comes near"""
    base = f"/assets/blossom/{name}"
    return (f'<div class="flower {cls}{" flower--flip" if flip else ""}" aria-hidden="true">'
            f'<video muted loop playsinline preload="none" poster="{base}.webp" width="960" height="960">'
            f'<source data-src="{base}.webm" type="video/webm"><source data-src="{base}.mov" type=\'video/mp4; codecs="hvc1"\'>'
            f'</video></div>')


def marquee(items, cls="", speed=1, links=False):
    """a band of words that runs sideways, faster (and backwards) with the scroll"""
    if links:
        row = "".join(f'<a class="marq__it" href="{esc(u)}">{esc(t)}</a>{spark("spark marq__sp")}' for t, u in items)
    else:
        row = "".join(f'<span class="marq__it">{esc(t)}</span>{spark("spark marq__sp")}' for t in items)
    return f'<div class="marq {cls}" data-marq="{speed}"><div class="marq__row">{row}</div></div>'


def header():
    return f'''<a class="skip" href="#content">Skip to content</a>
<header class="hdr" data-hdr>
  <a href="/" class="hdr__logo chip" aria-label="JanyuTech home">{jt_logo(title=False)}</a>
  <nav class="hdr__nav chip" aria-label="Main">
    <a class="hdr__cta" href="/products/">Explore our robots</a>
    <a class="hdr__book" href="/contact-us/">Book a demo</a>
    <button type="button" data-menu-btn aria-expanded="false" aria-controls="menu"><span class="hdr__burger" aria-hidden="true"><i></i><i></i></span><span class="hdr__menu-open">Menu</span><span class="hdr__menu-close">Close</span></button>
  </nav>
</header>
<div class="sbar chip" data-sbar aria-hidden="true"><span class="sbar__track"><span class="sbar__thumb"></span></span><span class="sbar__label">00</span></div>
<button type="button" class="sdown chip" data-sdown><span class="sdown__arrow" aria-hidden="true"></span><span class="t-down">Scroll</span><span class="t-up">Back to top</span></button>
<div class="menu" id="menu" data-menu>
  <div class="menu__bg" aria-hidden="true"><span class="menu__grid"></span></div>
  <div class="menu__in">
    <nav aria-label="All pages"><ul class="om">{overlay_html()}</ul></nav>
    <div class="menu__side">
      <a class="btn-line" href="/contact-us/">Book a demo</a>
      <div class="menu__contact">
        <p class="l2">Sales</p>
        <a class="p1" href="mailto:sales@janyutech.com">sales@janyutech.com</a>
        <a class="p1" href="tel:+917770012260">+91 77700 12260</a>
      </div>
      <div class="menu__social">{"".join(f'<a class="l2" href="{u}" target="_blank" rel="noopener">{t}</a>' for t, u in SOCIAL)}</div>
    </div>
  </div>
</div>
<div class="curtain" aria-hidden="true"></div>'''


SOCIAL = [("LinkedIn", "https://www.linkedin.com/company/janyu-tech/"), ("X", "https://twitter.com/janyutech"),
          ("YouTube", "https://www.youtube.com/@JanyuTechOfficial/videos"), ("Instagram", "https://www.instagram.com/janyutech_?igshid=YmMyMTA2M2Y=")]


def footer():
    explore = [("Products", "/products/"), ("Industries", "/industries/"), ("Services", "/services/"), ("Projects", "/projects/"), ("About us", "/about-us/")]
    company = [("Careers", "/career/"), ("Events", "/events/"), ("Gallery", "/gallery/"), ("Awards", "/awards-and-certificates/"), ("Contact", "/contact-us/")]
    col = lambda title, items: f'<nav class="ftr__col" aria-label="{title}"><p class="l2">{title}</p>' + "".join(f'<a href="{u}">{t}</a>' for t, u in items) + "</nav>"
    return f'''<footer class="ftr" id="contact">
  <div class="ftr__in">
    <div class="ftr__top">
      <p class="ftr__lead h4" data-reveal="h">Let’s put a robot where people shouldn’t go.</p>
      {btn_pill("/contact-us/", "Book a demo", "pill--light")}
    </div>
    <div class="ftr__cols">
      <div class="ftr__col ftr__col--call"><p class="l2">Talk to us</p><a class="ftr__phone" href="tel:+917770012260">+91 77700 12260</a><a href="mailto:sales@janyutech.com">sales@janyutech.com</a></div>
      <div class="ftr__col"><p class="l2">Visit</p><address>Unit 1 &amp; 2, Dhuri Industrial Complex No.1, Madhu Vrinda Phase 4, Waliv Phata, Sativali Road, Vasai East – 401208, India</address></div>
      {col("Explore", explore)}
      {col("Company", company)}
      {col("Follow", SOCIAL)}
    </div>
    <div class="ftr__mark">{jt_logo("jt-logo ftr__logo", title=False)}</div>
    <div class="ftr__bottom"><span>© {date.today().year} JanyuTech. All rights reserved.</span><a href="/privacy-policy/">Privacy policy</a><a href="#top" class="ftr__top-link">Back to top ↑</a></div>
  </div>
</footer>'''


FONTS = "https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300..800;1,300..500&display=swap"
GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/"


def doc(title, desc, body, og="", body_cls="", canonical="/", after_main=""):
    return f'''<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{canonical}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
{f'<meta property="og:image" content="{esc(og)}">' if og else ""}
<meta name="theme-color" content="#0e2566">
<link rel="icon" href="/assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v={VER}">
<link rel="stylesheet" href="/site.css?v={VER}">
<script>try{{if(sessionStorage.getItem("pt")==="1"){{document.documentElement.classList.add("pt-in");sessionStorage.setItem("pt","0")}}}}catch(e){{}}</script>
<style>.pt-in .curtain{{opacity:1}}</style>
</head>
<body class="{body_cls}" id="top">
{header()}
<main id="content">
{body}
</main>
{after_main or footer()}
<div class="lightbox" hidden><button class="lightbox__close" aria-label="Close">×</button><button class="lightbox__prev" aria-label="Previous">←</button><figure><img alt=""><figcaption class="p1"></figcaption></figure><button class="lightbox__next" aria-label="Next">→</button></div>
<script src="{GSAP}gsap.min.js"></script>
<script src="{GSAP}ScrollTrigger.min.js"></script>
<script src="{GSAP}SplitText.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js"></script>
<script src="/main.js?v={VER}"></script>
</body>
</html>'''


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
    return '<nav class="crumbs l2" aria-label="Breadcrumb">' + '<i>/</i>'.join(out) + "</nav>"


def page_h1(p):
    for s in p["sections"]:
        for b in s["blocks"]:
            if b["t"] == "h" and b["lvl"] == 1: return b["text"]
    return re.split(r"\s[-|–]\s", p["title"])[0]


def split_words(t):
    return " ".join(f'<span class="w"><span class="split">{esc(w)}</span></span>' for w in t.split())


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
    hero = f'''<section class="phero" data-theme="light">
  {flower("bl-rise", "flower--phero", flip=True)}
  {crumbs(p["path"])}
  <h1 class="phero__title h3">{split_words(h1)}</h1>
  {f'<p class="phero__lead p1">{esc(lead)}</p>' if lead else ""}
  <div class="phero__meta"><span class="vline"></span></div>
</section>
{f'<div class="phero__banner{" phero__banner--contain" if is_cutout(hero_img) else ""}" data-theme="{"light" if is_cutout(hero_img) else "dark"}"><img src="{esc(img(hero_img))}" alt="" decoding="async"></div>' if hero_img else ""}'''
    body = hero + "".join(f'<section class="sec">{render_blocks(b)}</section>' for b in secs)
    og = img(hero_img) if hero_img else ""
    return doc(p["title"], p["desc"] or f"{h1} – JanyuTech", body, og=BASE + og if og.startswith("/") else og, body_cls="inner", canonical=path)


# ---------------------------------------------------------------- home
# The rendered views of the terrace (see README): the hero by day and by night (and portrait crops for phones),
# the depth of the hero (for the cursor parallax), the section views, and the aerial view drawn as a blueprint.
SCENE = "/assets/scene/"
PINS = [  # hotspots: where each robot stands in the hero render (and how near it is), from build/pins.json
    ("quad", "Varaha quadruped", "Four legs for rough ground", "/products/defence-robots/"),
    ("rover", "Varaha UGV", "Surveillance and inspection", "/products/defence-robots/"),
    ("arm", "Kara robotic arm", "Pick, place and palletise", "/products/kara-robotic-arm/"),
]
PIN_POS = json.load(open(os.path.join(HERE, "pins.json"))) if os.path.exists(os.path.join(HERE, "pins.json")) else {}
AERIAL_NOTES = [  # (left %, top %, name, what, (dx, dy, tag side) on desktop, the same on phones)
    (40.4, 75.5, "Varaha quadruped", "Rough-ground inspection", (-80, 70, "l"), (46, 78, "r")),
    (54.7, 73.8, "Varaha UGV", "Surveillance", (96, 74, "r"), (-30, -96, "l")),
    (62.7, 40.3, "Kara robotic arm", "Pick, place, palletise", (-110, -70, "l"), (-40, 86, "l")),
]
def note_vars(pre, dx, dy, side):
    ang = _m.degrees(_m.atan2(dy, dx))
    return f"--{pre}dx:{dx}px;--{pre}dy:{dy}px;--{pre}tx:{'-100%' if side == 'l' else '0%'};--{pre}len:{_m.hypot(dx, dy):.0f}px;--{pre}ang:{ang:.1f}deg"

WHY = [  # the five reasons: the icon from janyutech.com, and a photo from the field
    ("core", "Built for the core", "Every robot is designed around the plant it serves — the process, the heat, the dust and the people who run it.",
     "Custom-designed for the core industry", "2024-04-Robotic-Material-Handling-1.webp"),
    ("downtime", "Less downtime", "Robots clean, inspect and repair while the plant keeps running, so shutdowns get shorter — and fewer.",
     "Reduction in shutdown time", "2024-07-47.webp"),
    ("safety", "No human entry", "Our robots go into tanks, kilns, silos and sewers so that people don't have to.",
     "Risk mitigation and accident prevention", "2024-04-VARAHA-SC-E-INDUSTRIAL-TANK-CLEANING-ROBOT-1.webp"),
    ("standards", "Global standards", "Engineered, built and tested to international standards, and documented for the audits that follow.",
     "International standards", "2025-05-163.webp"),
    ("legacy", "New life", "We automate legacy plants instead of replacing them: retrofits that give old systems years more work.",
     "Rejuvenating the legacy systems", "2024-04-Heavy-Engineering-2.webp"),
]

PRODUCTS = [
    ("Varaha sludge cleaner", "/products/varaha-sludge-cleaning/", "sludge-cleaning-robot", False, ("Oil, gas & chemicals", "Tanks & reactors"),
     "A remotely operated tank-cleaning robot that cuts and pumps out sludge from crude, chemical and water tanks — hydraulic, and at home under water."),
    ("Kara robotic arm", "/products/kara-robotic-arm/", "denka-arm-robot", True, ("Manufacturing", "Lines & warehouses"),
     "Pick-and-place and palletising arms that lift what people shouldn't, faster and more precisely, built into the line you already run."),
    ("Cement cube robot", "/products/cement-automation/", "cement-industry", True, ("Cement & construction", "Quality labs"),
     "Robotic concrete cube making and cement cube testing: the lab's heavy, repetitive work, automated and recorded."),
    ("Varaha quadruped", "/products/defence-robots/", "varaha-four-legged-robot", False, ("Defence & security", "Rough ground"),
     "A four-legged robot for surveillance and inspection where wheels can't go — stairs, rubble and broken ground."),
    ("Solar panel cleaner", "/products/solar-panel-cleaner/", "solar-panel-cleaning-robot", False, ("Renewable energy", "Solar arrays"),
     "A vehicle-mounted robotic arm that cleans large arrays gently on uneven ground, with no rails to install."),
    ("Magnetic NDT crawler", "/products/heavy-engineering-metals/", "varaha-magnetic-crawler-for-ndt-testing", False, ("Heavy engineering", "Steel structures"),
     "A magnetic crawler that climbs steel to carry the sensors for non-destructive testing — inspection without scaffolding."),
    ("Varaha mining robot", "/products/varaha-mining-robots/", "varah-dozer-a", False, ("Mining", "Underground"),
     "Remotely operated hydraulic vehicles that break, cut and move ore, keeping miners away from the most dangerous faces."),
]

# stops along the circuit trace: industries, and how many of our solutions each has (from the menu)
def _count(name):
    for it in MENU:
        for k in it["children"]:
            if k["text"].lower().startswith(name.lower()): return len(k["children"]), link(k["href"])
    return 0, "/products/"
PATH_STOPS = [("Cement", "Cement & Construction", 0.06, 0.62), ("Steel", "Steel Industry", 0.2, 0.36), ("Aluminium", "Aluminium Industry", 0.35, 0.66),
              (None, None, 0.5, 0.5), ("Mining", "Mining Industry", 0.64, 0.3), ("Thermal & power", "Thermal and Power Industry", 0.79, 0.6), ("Chemical", "Chemical Industry", 0.93, 0.4)]

def trace_path(dy=0.0, w=1000, h=150):
    """a circuit trace through the stops: level runs joined by chamfered (45°-ish) steps, like a PCB track"""
    pts = [(0, PATH_STOPS[0][3])] + [(x, y) for _, _, x, y in PATH_STOPS] + [(1, PATH_STOPS[-1][3])]
    d = f"M 0 {pts[0][1] * h + dy:.1f}"
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if abs(y2 - y1) < 1e-6:
            d += f" L {x2 * w:.1f} {y2 * h + dy:.1f}"; continue
        mid = (x1 + x2) / 2 * w
        run = min(abs(y2 - y1) * h * 1.2, (x2 - x1) * w * 0.4)
        d += f" L {mid - run / 2 + dy * 0.4:.1f} {y1 * h + dy:.1f} L {mid + run / 2 + dy * 0.4:.1f} {y2 * h + dy:.1f} L {x2 * w:.1f} {y2 * h + dy:.1f}"
    return d

# the industries, running in two bands
def _ind(slug, name=None):
    p = PAGES.get("industries__" + slug)
    return (name or (page_h1(p) if p else slug.replace("-", " ").title()), f"/industries/{slug}/")
IND_A = [_ind(*a) for a in [("cement-construction", "Cement & construction"), ("steel-industry", "Steel"), ("aluminium-industry", "Aluminium"), ("copper-industry", "Copper"),
                            ("mining-industry", "Mining"), ("glass-industry", "Glass"), ("chemical-industry", "Chemicals"), ("thermal-and-power-industry", "Thermal & power")]]
IND_B = [_ind(*a) for a in [("defence-security", "Defence & security"), ("aerospace", "Aerospace"), ("renewable-energy", "Renewable energy"), ("chemicals-oil-gas", "Oil & gas"),
                            ("pharma-fb-and-fmcg", "Pharma, F&B & FMCG"), ("heavy-engineering", "Heavy engineering"), ("telecommunication-satcom", "Telecom & satcom"),
                            ("industry-4-0", "Industry 4.0"), ("raas", "Robotics as a service")]]

CLIENTS = ["UltraTech Cement", "Tata Steel", "Hindalco", "Grasim", "Vedanta", "ISRO", "DRDO", "Indian Oil", "JSW", "Cairn", "Voltas", "Owens Corning"]


def scene_img(name, alt="", eager=False, cls="", mobile=None):
    src = f"{SCENE}{name}.webp"
    m = f'<source media="(max-width: 991px)" srcset="{SCENE}{mobile}.webp">' if mobile else ""
    return f'<picture{f" class=\"{cls}\"" if cls else ""}>{m}<img src="{src}" alt="{esc(alt)}"{"" if eager else " loading=\"lazy\""} decoding="async"></picture>'


ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M10.5 6.5 5 12l5.5 5.5"/></svg>'
ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/></svg>'

def sl_ui(n, cls=""):
    """a slider's controls: 01 / 05, a segment per slide (the current one fills), and the arrows"""
    return (f'<div class="sl-ui {cls}"><span class="sl-ui__n"><b data-sl-cur>01</b><i>/</i>{n:02d}</span>'
            f'<span class="sl-ui__segs" aria-hidden="true">{"".join("<i data-sl-seg><b></b></i>" for _ in range(n))}</span>'
            f'<span class="sl-ui__btns"><button type="button" data-sl-prev aria-label="Previous">{ARROW_L}</button><button type="button" data-sl-nextbtn aria-label="Next">{ARROW_R}</button></span></div>')


def home_page():
    p = PAGES["home"]
    S = [s["blocks"] for s in p["sections"]]
    get = lambda s, t: [b for b in s if b["t"] == t]
    seo = [b["text"] for b in get(S[0], "h")]
    about_p = get(S[2], "h")[1]["text"]

    pins = []
    for key, name, what, href in PINS:
        if key not in PIN_POS: continue
        x, y, z = (PIN_POS[key] + [0.5])[:3]
        pins.append(f'<a class="pin" href="{href}" style="left:{x}%;top:{y}%" data-z="{z}"><span class="pin__pulse"></span><span class="pin__dot"></span>'
                    f'<span class="pin__tip"><b>{esc(name)}</b><span>{esc(what)}</span></span><span class="sr-only">{esc(name)}</span></a>')

    why = "".join(f'''<article class="why__slide" data-sl-slide>
          <div class="why__text">
            <div class="why__top" data-part-c><svg class="why__icon" viewBox="106 106 288 288" aria-hidden="true"><use href="/assets/icons/{ic}.svg#i"/></svg><span class="why__n">Reason {k + 1:02d}</span></div>
            <h3 class="why__h h3" data-part-h>{esc(h)}</h3>
            <p class="why__p p1" data-part-p>{esc(t)}</p>
            <p class="why__l l2" data-part-c>{esc(lab)}</p>
          </div>
          <div class="why__img" data-part-img><img src="/assets/img/{im}" alt="" loading="lazy" decoding="async"></div>
        </article>''' for k, (ic, h, t, lab, im) in enumerate(WHY))

    prods = "".join(f'''<article class="prod__slide" data-sl-slide>
          <div class="prod__text">
            <p class="prod__n l2" data-part-c>Robot {k + 1:02d}</p>
            <h3 class="prod__name h3" data-part-h>{esc(name)}</h3>
            <dl class="prod__meta" data-part-c><div><dt class="l2">Industry</dt><dd>{esc(m[0])}</dd></div><div><dt class="l2">Works in</dt><dd>{esc(m[1])}</dd></div></dl>
            <p class="prod__p p1" data-part-p>{esc(txt)}</p>
            <div data-part-c>{btn_pill(href, "Explore the robot", "pill--blue")}</div>
          </div>
          <div class="prod__img{" prod__img--photo" if photo else ""}" data-part-img data-scan>
            <img class="prod__bp" src="/assets/bp/{key}-bp.webp" alt="" loading="lazy" decoding="async">
            <img class="prod__ph" src="/assets/bp/{key}.webp" alt="{esc(name)}" loading="lazy" decoding="async">
            <span class="prod__scan" aria-hidden="true"></span>
          </div>
        </article>''' for k, (name, href, key, photo, m, txt) in enumerate(PRODUCTS))

    stops = []
    for label, menu_name, x, y in PATH_STOPS:
        if label is None:
            stops.append(f'<span class="loc__stop loc__stop--mark" style="left:{x*100:.1f}%;top:{y*100:.1f}%">{spark()}</span>'); continue
        n, href = _count(menu_name)
        stops.append(f'<a class="loc__stop" href="{esc(href)}" style="left:{x*100:.1f}%;top:{y*100:.1f}%"><b>{esc(label)}</b><span>{n} solution{"s" if n != 1 else ""}</span></a>')

    notes = "".join(f'<span class="aerial__note" style="left:{x}%;top:{y}%;{note_vars("d", *dk)};{note_vars("m", *mb)}" data-y="{y}"><i></i><span class="aerial__tag"><b>{esc(t)}</b><span>{esc(w)}</span></span></span>'
                    for x, y, t, w, dk, mb in AERIAL_NOTES)

    logos = "".join(f'<img src="{esc(img(i["src"]))}" alt="{esc(i["alt"].replace("_", " "))}" loading="lazy">' for i in get(S[7], "gallery")[0]["imgs"][:14])

    body = f'''
<div class="pre" data-pre aria-hidden="true">
  <div class="pre__iris"></div>
  <div class="pre__decor"><span class="pre__grid"></span></div>
  <div class="pre__ctn">
    {spark("spark pre__mark")}
    {jt_logo("pre__logo jt-logo", title=False)}
    <div class="pre__bar"><i></i></div>
    <p class="pre__count"><span data-pre-count>0</span>%</p>
  </div>
</div>

<section class="hero" data-theme="dark" aria-label="JanyuTech">
  <div class="hero__sticky">
    <div class="hero__bg" data-depth="{SCENE}hero-depth.webp" data-depth-m="{SCENE}hero-m-depth.webp">
      <div class="hero__img is-on" data-tab="day">{scene_img("hero-day", "JanyuTech's quadruped, rover and robot arm on a terrace above the sea, under blue cherry blossom", eager=True, mobile="hero-m-day")}</div>
      <div class="hero__img" data-tab="night">{scene_img("hero-night", "The same terrace at blue hour, the pool lit and the blossom glowing", mobile="hero-m-night")}</div>
      <div class="hero__shade"></div>
      {"".join(pins)}
    </div>
    <div class="hero__dim" aria-hidden="true"></div>
    <div class="hero__ctn"><div class="hero__in">
      <p class="hero__kicker l2" data-part="label">Robotics · Made in India</p>
      <h1 class="hero__title"><span class="sr-only">JanyuTech – robotics that take people out of hazardous work</span><span class="h1" data-part="h" aria-hidden="true">Janyu Tech</span></h1>
      <div class="hero__row">
        <span class="hero__side" data-part="ctn">Engineering safety</span>
        <div class="hero__switch chip" data-tabs-hero role="group" aria-label="Show the terrace by day or by night"><i class="hero__thumb" aria-hidden="true"></i><button type="button" class="is-active" data-tab="day" aria-pressed="true">Day</button><button type="button" data-tab="night" aria-pressed="false">Night</button></div>
        <span class="hero__side" data-part="ctn">Innovating industry</span>
      </div>
      <div class="sr-only">{"".join(f"<{'h2' if k == 0 else 'p'}>{esc(t)}</{'h2' if k == 0 else 'p'}>" for k, t in enumerate(seo))}</div>
    </div></div>
    <div class="hero__foot" data-part="ctn"><div class="hero__foot-in">{btn_pill("/products/", "View products", "pill--light hero__btn")}</div></div>
  </div>
</section>

<section class="intro" data-theme="light" aria-label="Why JanyuTech">
  {marquee(["Five reasons to choose JanyuTech", "Safety first", "Robots that go first", "Made in India"], "intro__marq")}
  <div class="intro__mid" data-reveal-w>
    <p class="l2" data-reveal="label">Safety first</p>
    <h2 class="intro__h h4" data-reveal="h">Leading the way in human risk mitigation robotics</h2>
    <span class="vline" data-reveal="line"></span>
  </div>
</section>
<section class="why" data-theme="light" aria-label="Five reasons">
  <div class="why__slider" data-sl="why">
    <div class="why__slides">{why}</div>
    {sl_ui(len(WHY))}
  </div>
</section>

<section class="quote" data-theme="dark">
  <div class="quote__bg">{scene_img("quote", "The orange Varaha sludge-cleaning robot on the terrace, the pool and the sea behind it")}</div>
  <figure class="quote__card chip" data-reveal-w>
    <svg class="quote__mark" viewBox="0 0 40 30" aria-hidden="true" data-reveal="ctn"><path d="M0 30V17C0 7.6 4.6 1.9 13.8 0l1.6 4.4C10.4 6 8.2 9 8 13.2h7.4V30H0Zm22.6 0V17c0-9.4 4.6-15.1 13.8-17L38 4.4C33 6 30.8 9 30.6 13.2H38V30H22.6Z"/></svg>
    <blockquote><p class="h6" data-reveal="p">Instead of sending people into sewers, silos and kilns, we send robots — so every worker goes home safe.</p></blockquote>
    <figcaption class="quote__by" data-reveal="ctn"><b>JanyuTech team</b><span>Vasai, India</span></figcaption>
  </figure>
</section>

<section class="concept" data-theme="light">
  {flower("bl-corner-a", "flower--concept-tl")}
  {flower("bl-rise", "flower--concept-br", flip=True)}
  <div class="concept__in">
    <p class="l2" data-reveal="label">The concept</p>
    <h2 class="concept__h h4" data-fill>JanyuTech is an Indian OEM building custom robots that take people out of hazardous work — in the core industries that build the nation.</h2>
    <p class="concept__p p1" data-reveal="p">{esc(about_p)}</p>
  </div>
</section>

<section class="loc" data-theme="light" aria-label="Make in India">
  <div class="loc__sticky"><div class="loc__track">
    <div class="loc__panel loc__intro">
      <span class="l2" data-reveal="label">India</span>
      <h2 class="loc__title h1"><span class="loc__line">Make</span><span class="loc__line">in</span><span class="loc__line">India</span></h2>
      {flower("bl-side", "flower--loc-a")}
    </div>
    <div class="loc__panel loc__info">
      <div class="loc__img">{scene_img("horizontal", "The quadruped under a blossoming tree on the terrace")}</div>
      <div class="loc__text" data-reveal-w><h3 class="h5" data-reveal="h">From Vasai to the world</h3><p class="p1" data-reveal="p">Designed, engineered and built at our own works in Vasai, Maharashtra: hydraulics, electronics and software under one roof, so a robot can go from a sketch to a plant floor in months, not years.</p><div data-reveal="ctn">{btn_pill("/products/", "View products", "pill--blue")}</div></div>
    </div>
    <div class="loc__panel loc__path-w">
      <h3 class="loc__h h3">The plants you run, <em>safer</em> this year</h3>
      <div class="loc__path"><div class="loc__path-in">
        <svg viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true"><path class="loc__bus" d="{trace_path(9)}"/><path class="loc__trace" d="{trace_path()}"/></svg>
        {"".join(stops)}
      </div></div>
      {flower("bl-hang", "flower--loc-b", flip=True)}
    </div>
  </div></div>
</section>

<section class="aerial" data-theme="dark" aria-label="The terrace, drawn and then built">
  <div class="aerial__sticky">
    <div class="aerial__pic">
      {scene_img("aerial-bp", "The terrace drawn as a blueprint: the pool, the planters, the bare trees and the three robots", cls="aerial__bp")}
      {scene_img("aerial", "The terrace from the air: the pool, the robots and the blossoming trees above the sea", cls="aerial__real")}
      <span class="aerial__scan" aria-hidden="true"></span>
      <div class="aerial__notes" aria-hidden="true">{notes}</div>
    </div>
    <div class="aerial__grid" aria-hidden="true"></div>
    <p class="aerial__cap chip"><b>Drawn in Vasai.</b> <span>Built for the plant.</span></p>
  </div>
</section>

<section class="prod" id="products" data-theme="light" aria-label="Products" data-snap>
  {flower("bl-rise", "flower--prod")}
  <div class="prod__head" data-reveal-w><p class="l2" data-reveal="label">Our robots</p><h2 class="h4" data-reveal="h">Robots for the work nobody should do</h2></div>
  <div class="prod__slider" data-sl="prod">
    <div class="prod__slides">{prods}</div>
    {sl_ui(len(PRODUCTS))}
  </div>
</section>

<section class="state" data-theme="light">
  {flower("bl-side", "flower--state-l")}
  {flower("bl-corner-b", "flower--state-r", flip=True)}
  <div class="state__head" data-reveal-w>
    <p class="l2" data-reveal="label">Where we work</p>
    <h2 class="state__h h4" data-reveal="h">Our robots work where people shouldn’t — inside kilns, smelters, sewers, silos and mines.</h2>
  </div>
  {marquee(IND_A, "state__marq", 1, links=True)}
  {marquee(IND_B, "state__marq", -1, links=True)}
</section>

<section class="amen" data-theme="dark" aria-label="What we do">
  <div class="amen__sticky">
    {scene_img("amen", "The terrace at blue hour: the rover and the arm by the lit pool", cls="amen__bg")}
    <div class="amen__w">
      <p class="amen__label l2">What we do</p>
      <div class="amen__listw"><span class="amen__hl" aria-hidden="true"></span><ol class="amen__list">
        <li class="is-on"><a href="/industries/"><span class="amen__n">01</span>Custom robotics</a></li>
        <li><a href="/industries/industry-4-0/"><span class="amen__n">02</span>Industry 4.0</a></li>
        <li><a href="/industries/raas/"><span class="amen__n">03</span>Robotics as a service</a></li>
        <li><a href="/industries/software-solutions/"><span class="amen__n">04</span>Software solutions</a></li>
        <li><a href="/industries/dna/"><span class="amen__n">05</span>Defence, nuclear, aerospace</a></li>
      </ol></div>
      <div class="amen__q chip"><p class="p1">We don’t sell machines off a shelf — we engineer the robot your plant needs, then stay to run it with you.</p>{btn_pill("/contact-us/", "Book a demo", "pill--blue")}</div>
    </div>
  </div>
</section>

<section class="rely" data-theme="light" aria-label="Built to rely on">
  <div class="rely__sheet">
    {flower("bl-side", "flower--arch-l")}
    {flower("bl-side", "flower--arch-r", flip=True)}
    <div class="rely__in" data-reveal-w>
      <p class="l2" data-reveal="label">Built to last</p>
      <h2 class="rely__h h1" data-reveal="h">The robots to rely on</h2>
    </div>
  </div>
</section>

<section class="inter" data-theme="light">
  <div class="inter__top">
    <div class="inter__panel" data-theme="dark">
      <div class="inter__panel-img">{scene_img("panel", "The rover on the terrace")}</div>
      <ul class="inter__also" data-reveal-w><li class="l2" data-reveal="label">Also available</li><li data-reveal="ctn">Robotics as a service (RaaS)</li><li data-reveal="ctn">Annual maintenance</li><li data-reveal="ctn">Operator training</li></ul>
    </div>
    <div class="inter__text" data-reveal-w>
      <h2 class="h4" data-reveal="h">Every robot is built around the plant it serves — engineered, manufactured and tested in India</h2>
      <p class="p1" data-reveal="p">Remote operation from a safe distance, live cameras and sensors, rugged hydraulics and our own control software: each robot is made for one job, in one kind of plant, and supported for as long as it runs.</p>
      <div data-reveal="ctn">{btn_pill("/products/", "View products", "pill--blue")}</div>
    </div>
  </div>
  <figure class="field" data-field>
    <div class="field__frame">
      <video class="field__vid" muted loop playsinline preload="none" poster="/assets/video/janyu-in-the-field.webp" width="960" height="540"><source data-src="/assets/video/janyu-in-the-field.mp4" type="video/mp4"></video>
      <span class="field__tag chip"><i aria-hidden="true"></i>In the field</span>
    </div>
    <figcaption class="field__cap"><span class="l2">Our robots at work</span><span class="p2">Robot arms, automated lines, lab automation and all-terrain crawlers — filmed where they work.</span></figcaption>
  </figure>
  <div class="duo" aria-hidden="true">
    <div class="duo__img">{scene_img("split-a", "")}</div>
    <div class="duo__img">{scene_img("split-b", "")}</div>
  </div>
</section>

<section class="eng" data-theme="dark" aria-label="Engineering">
  <div class="eng__bg">{scene_img("engineering", "The Kara robotic arm on the terrace, the sea behind it")}</div>
  <div class="eng__shade"></div>
  {marquee(["Engineering", "Robotics", "Automation"], "eng__marq", 1)}
  <div class="eng__q chip" data-reveal-w><p class="h6" data-reveal="p">Every JanyuTech robot balances rugged hardware with smart software — built to work where people shouldn’t.</p><p class="l2" data-reveal="label">JanyuTech R&amp;D · Vasai</p></div>
  {btn_pill("/contact-us/", "Book a demo", "pill--light eng__btn")}
</section>

<section class="cred" data-theme="light" aria-label="Credentials">
  <div class="cred__head" data-reveal-w><p class="l2" data-reveal="label">Leading the way</p><h2 class="h4" data-reveal="h">In human risk mitigation robotics</h2></div>
  <ul class="cred__grid" data-reveal-w>
    <li class="cred__card" data-reveal="ctn"><div class="cred__in"><span class="cred__plus" aria-hidden="true">+</span><h3 class="h5">Trusted by</h3><p class="p2">{", ".join(CLIENTS)} and many more across India.</p></div></li>
    <li class="cred__card" data-reveal="ctn"><div class="cred__in"><span class="cred__plus" aria-hidden="true">+</span><h3 class="h5">Awarded</h3><p class="p2">Recognised by industry and academia for robotics that reduce human risk. <a class="ulink" href="/awards-and-certificates/">See them all</a></p></div></li>
    <li class="cred__card" data-reveal="ctn"><div class="cred__in"><span class="cred__plus" aria-hidden="true">+</span><h3 class="h5">Made in India</h3><p class="p2">Designed, engineered and manufactured at our works in Vasai, Maharashtra.</p></div></li>
    <li class="cred__card" data-reveal="ctn"><div class="cred__in"><span class="cred__plus" aria-hidden="true">+</span><h3 class="h5">{date.today().year}</h3><p class="p2">New robots in the field every quarter — for cement, steel, aluminium, mining, power and defence.</p></div></li>
  </ul>
  <div class="cred__logos" data-marq="0.6"><div class="marq__row">{logos}</div></div>
</section>

<section class="cta" data-theme="dark">
  <div class="cta__in">
    <div class="cta__bg">{scene_img("cta", "The terrace at blue hour, the robots by the pool")}</div>
    <div class="cta__ctn" data-reveal-w>
      <p class="l2" data-reveal="label">From sewers to smelters</p>
      <h2 class="cta__h h1" data-reveal="h">Safer by design</h2>
      <p class="cta__small p1" data-reveal="p">A short conversation is enough to know which robot fits your plant — a cleaning robot, an inspection crawler or a fully automated line.</p>
      <div data-reveal="ctn">{btn_pill("/contact-us/", "Book a demo", "pill--light")}</div>
    </div>
  </div>
</section>'''
    return doc(p["title"], p["desc"], body, og=BASE + SCENE + "hero-day.webp", body_cls="home", canonical="/")


# ---------------------------------------------------------------- write
def relativize(html, depth):
    """Rewrite root-absolute URLs ("/assets/…") as relative ones ("../../assets/…"),
    so the site works at a domain root, under a sub-path (user.github.io/repo/) or locally."""
    pre = "../" * depth if depth else "./"
    def fix(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if url.startswith("//"): return m.group(0)
        return f"{attr}={q}{pre}{url[1:]}"
    return re.sub(r'\b(href|src|srcset|poster|data-src|data-depth|data-depth-m)=(["\'])(/[^"\']*)', fix, html)


def write(path, html):
    out = os.path.join(SITE, path, "index.html") if path else os.path.join(SITE, "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    depth = len([x for x in path.split("/") if x]) if path else 0
    open(out, "w").write(relativize(html, depth))


write("", home_page())
for slug, p in PAGES.items():
    if slug == "home": continue
    write(p["path"], inner_page(p))

nf = doc("Page not found – JanyuTech", "This page does not exist.",
         '<section class="phero" data-theme="light">' + flower("bl-rise", "flower--phero", flip=True) + '<p class="crumbs l2">Error 404</p><h1 class="phero__title h3">' + split_words("Page not found") + '</h1><p class="phero__lead p1">The page you are looking for has moved or no longer exists.</p><div class="btn-row"><a class="btn" href="/"><span>Back to home</span><i>→</i></a><a class="btn btn--ghost" href="/products/"><span>Browse products</span><i>→</i></a></div></section>',
         body_cls="inner", canonical="/404/")
open(os.path.join(SITE, "404.html"), "w").write(nf)

urls = ["/"] + ["/" + p["path"] + "/" for s, p in PAGES.items() if s != "home"]
open(os.path.join(SITE, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
open(os.path.join(SITE, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
print("built", len(urls), "pages;", len(IMG), "local images mapped")
