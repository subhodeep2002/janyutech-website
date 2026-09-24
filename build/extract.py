"""Extract every page of janyutech.com into structured JSON (content.json)."""
import glob, os, re, json, base64, html as H
from bs4 import BeautifulSoup, NavigableString, Tag

SP = os.path.dirname(os.path.abspath(__file__))
BASE = "https://janyutech.com/"

def clean(t):
    return re.sub(r"\s+", " ", (t or "").replace("​", "")).strip()

def txt(el):
    return clean(el.get_text(" ", strip=True)) if el else ""

def img_src(img):
    if not img: return ""
    for a in ("data-src", "data-lazy-src", "src"):
        v = img.get(a, "")
        if v and not v.startswith("data:"): return v
    return ""

def href(a):
    return (a.get("href") or "").strip() if a else ""

ALLOWED = {"p", "ul", "ol", "li", "strong", "b", "em", "i", "a", "br", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "blockquote", "span", "u", "sup", "sub"}

def sanitize(el, top=True):
    """Keep simple semantic HTML, drop styling/scripts."""
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            out.append(H.escape(str(c).replace("​", "")))
        elif isinstance(c, Tag):
            if c.name in ("script", "style", "svg", "noscript", "img", "figure", "iframe"): continue
            inner = sanitize(c, False)
            name = c.name
            if name == "h1": name = "h2"
            if name in ("div", "section", "font", "center"):
                out.append(inner if name != "div" else f"<p>{inner}</p>" if clean(BeautifulSoup(inner, "html.parser").get_text()) and not re.search(r"<(p|ul|ol|h\d|table)", inner) else inner)
            elif name in ALLOWED:
                if name == "span" or name == "u":
                    out.append(inner)
                elif name == "a":
                    out.append(f'<a href="{H.escape(href(c))}">{inner}</a>')
                elif name == "br":
                    out.append("<br>")
                elif name == "b":
                    out.append(f"<strong>{inner}</strong>")
                else:
                    out.append(f"<{name}>{inner}</{name}>")
            else:
                out.append(inner)
    s = "".join(out)
    s = re.sub(r"<p>\s*(&nbsp;|\xa0)?\s*</p>", "", s)
    s = re.sub(r"\s+", " ", s)
    if top:
        s = re.sub(r"\s*(</?(?:p|ul|ol|li|h\d|table|tr|td|th|thead|tbody|blockquote)>)\s*", r"\1", s)
    return s.strip() if top else s

SEEN = {}
def widget(w):
    t = w["data-widget_type"].split(".")[0]
    B = []
    if t == "heading":
        h = w.find(re.compile(r"^h[1-6]$")) or w.select_one(".elementor-heading-title")
        if h and txt(h):
            lvl = int(h.name[1]) if h.name and h.name[0] == "h" and h.name[1:].isdigit() else 3
            B.append({"t": "h", "lvl": lvl, "text": txt(h), "href": href(h.find("a"))})
    elif t == "elementskit-heading":
        sub = w.select_one(".elementskit-section-subtitle, .ekit-heading--subtitle")
        title = w.select_one(".ekit-heading--title, .elementskit-section-title") or w.find(re.compile(r"^h[1-6]$"))
        desc = w.select_one(".ekit-heading__description, .elementskit-section-description")
        if sub and txt(sub): B.append({"t": "eyebrow", "text": txt(sub)})
        if title and txt(title):
            lvl = int(title.name[1]) if title.name and re.match(r"h\d", title.name) else 2
            B.append({"t": "h", "lvl": lvl, "text": txt(title), "href": ""})
        if desc and txt(desc): B.append({"t": "html", "html": sanitize(desc) or f"<p>{H.escape(txt(desc))}</p>"})
    elif t == "text-editor":
        c = w.select_one(".elementor-widget-container") or w
        s = sanitize(c)
        if clean(BeautifulSoup(s, "html.parser").get_text()):
            if not re.search(r"<(p|ul|ol|h\d|table)", s): s = f"<p>{s}</p>"
            B.append({"t": "html", "html": s})
    elif t == "icon-list":
        items = []
        for li in w.select("li"):
            tx = txt(li.select_one(".elementor-icon-list-text") or li)
            if tx: items.append({"text": tx, "href": href(li.find("a"))})
        if items: B.append({"t": "list", "items": items})
    elif t == "image":
        img = w.find("img")
        cap = w.select_one("figcaption")
        if img_src(img):
            B.append({"t": "img", "src": img_src(img), "alt": clean(img.get("alt")), "caption": txt(cap), "href": href(w.find("a"))})
    elif t == "button":
        a = w.find("a")
        tx = txt(w.select_one(".elementor-button-text") or a)
        if tx: B.append({"t": "btn", "text": tx, "href": href(a)})
    elif t in ("image-box", "icon-box"):
        img = w.find("img")
        title = w.select_one(".elementor-image-box-title, .elementor-icon-box-title")
        desc = w.select_one(".elementor-image-box-description, .elementor-icon-box-description")
        B.append({"t": "card", "img": img_src(img), "title": txt(title), "text": txt(desc), "href": href((title or w).find("a")) if title else "", "btn": ""})
    elif t == "ucaddon_bold_price_box":
        img = w.find("img")
        title = w.select_one(".ue_title") or w
        desc = w.select_one(".ue_description, .ue_text")
        a = w.select_one(".ue_box_btn a") or w.find("a")
        B.append({"t": "card", "img": img_src(img), "title": txt(w.select_one(".ue_title")), "text": txt(desc), "href": href(a), "btn": txt(a)})
    elif t == "image-carousel":
        imgs = []
        for sl in w.select(".swiper-slide"):
            if "swiper-slide-duplicate" in (sl.get("class") or []): continue
            a = sl.find("a"); img = sl.find("img")
            src = href(a) if a and re.search(r"\.(png|jpe?g|webp|gif)$", href(a), re.I) else img_src(img)
            cap = txt(sl.select_one("figcaption, .elementor-image-carousel-caption")) or clean(a.get("data-elementor-lightbox-title") if a else "")
            if src and src not in [i["src"] for i in imgs]:
                imgs.append({"src": src, "alt": clean(img.get("alt") if img else ""), "caption": cap})
        if imgs: B.append({"t": "gallery", "imgs": imgs})
    elif t == "wpr-advanced-slider":
        slides = []
        for it in w.select(".wpr-slider-item"):
            img = it.select_one("img.wpr-slider-img") or it.find("img")
            title = it.select_one(".wpr-slider-title"); sub = it.select_one(".wpr-slider-sub-title"); desc = it.select_one(".wpr-slider-description")
            btns = [{"text": txt(a), "href": href(a)} for a in it.select(".wpr-slider-btns a, a.wpr-button") if txt(a)]
            src = img_src(img)
            if not src:
                m = re.search(r"url\(['\"]?([^'\")]+)", str(it)); src = m.group(1) if m else ""
            slides.append({"src": src, "title": txt(title), "sub": txt(sub), "text": txt(desc), "btns": btns})
        slides = [s for s in slides if s["src"] or s["title"]]
        if slides: B.append({"t": "slider", "slides": slides})
    elif t == "wpr-team-member":
        img = w.find("img")
        B.append({"t": "member", "img": img_src(img), "name": txt(w.select_one(".wpr-member-name")), "job": txt(w.select_one(".wpr-member-job")),
                  "text": txt(w.select_one(".wpr-member-description")),
                  "links": [href(a) for a in w.select(".wpr-member-social") if href(a)]})
    elif t in ("premium-addon-video-box", "video"):
        s = str(w)
        m = re.search(r"(?:youtube\.com/embed/|youtu\.be/|youtube\.com/watch\?v=)([\w-]{11})", s) or re.search(r'youtube_url[^:]*:\s*\\?"[^"]*?([\w-]{11})\\?"', s)
        if m: B.append({"t": "video", "yt": m.group(1)})
        else:
            v = w.find("video"); src = v.get("src") if v else ""
            if src: B.append({"t": "video", "src": src})
    elif t in ("elementskit-timeline", "wpr-posts-timeline"):
        items = []
        for it in w.select(".wpr-horizontal-timeline > .swiper-slide, .wpr-timeline-centered > .wpr-timeline-entry, .wpr-timeline-entry"):
            items.append({"title": txt(it.select_one(".wpr-title")), "year": txt(it.select_one(".wpr-label, .wpr-extra-label")),
                          "html": sanitize(it.select_one(".wpr-description")) if it.select_one(".wpr-description") else "",
                          "img": img_src(it.select_one(".wpr-timeline-media img"))})
        for it in ([] if items else w.select(".elementskit-single-timeline, .single-timeline")):
            h = it.select_one(".elementskit-timeline-title, h3, .wpr-title"); yr = it.select_one("h4, .elementskit-timeline-date, .wpr-extra-label, .wpr-timeline-date")
            body = it.select_one(".elementskit-timeline-content p, .wpr-description, .wpr-excerpt") or it.find("p")
            items.append({"title": txt(h), "year": txt(yr), "html": sanitize(body) if body else ""})
        if not items:
            for h in w.select("h3"):
                box = h.parent
                items.append({"title": txt(h), "year": "", "html": sanitize(box.find("p")) if box.find("p") else ""})
        items = [i for i in items if i["title"] or i["html"]]
        if items: B.append({"t": "timeline", "items": items})
    elif t == "google_maps":
        f = w.find("iframe")
        if f: B.append({"t": "map", "src": f.get("src") or f.get("data-src") or ""})
    elif t == "fluent-form-widget":
        fields = []
        for grp in w.select(".ff-el-group"):
            lab = grp.find("label"); inp = grp.find(["input", "textarea", "select"])
            if not inp or inp.get("type") in ("hidden", "submit"): continue
            f = {"label": txt(lab) or inp.get("placeholder", ""), "name": inp.get("name", ""), "type": inp.name if inp.name != "input" else inp.get("type", "text"),
                 "required": inp.get("aria-required") == "true", "options": [txt(o) for o in inp.find_all("option") if txt(o)] if inp.name == "select" else []}
            fields.append(f)
        sub = w.select_one("button[type=submit]")
        B.append({"t": "form", "fields": fields, "submit": txt(sub) or "Submit"})
    elif t == "shortcode":
        s = str(w)
        for m in re.finditer(r"FB3D_CLIENT_DATA\.push\('([^']+)'\)", s):
            try:
                d = json.loads(base64.b64decode(m.group(1) + "==").decode("utf-8", "ignore"))
                for p in d.get("posts", {}).values():
                    url = p.get("data", {}).get("guid", "")
                    if url: B.append({"t": "pdf", "title": p.get("title", "Document"), "url": url})
            except Exception:
                pass
        if not B:
            s2 = sanitize(w)
            if clean(BeautifulSoup(s2, "html.parser").get_text()): B.append({"t": "html", "html": s2})
    elif t == "social-icons":
        links = [{"href": href(a), "label": txt(a.select_one(".elementor-screen-only")) or txt(a)} for a in w.select("a") if href(a)]
        if links: B.append({"t": "social", "links": links})
    elif t == "ucaddon_card_carousel":
        for it in w.select(".ue-carousel-item"):
            a = it.select_one("a.uc_more_btn") or it.find("a")
            B.append({"t": "card", "img": img_src(it.find("img")), "title": txt(it.select_one(".card_carousel_title")),
                      "text": txt(it.select_one(".card_carousel_text")), "href": href(a), "btn": txt(it.select_one("a.uc_more_btn"))})
    elif t == "elementskit-icon-box":
        B.append({"t": "card", "img": "", "title": txt(w.select_one(".elementskit-info-box-title")),
                  "text": txt(w.select_one(".box-body p")), "href": href(w.select_one(".box-body a")), "btn": txt(w.select_one(".box-body a"))})
    elif t == "ucaddon_zoom_caption_reveal_content_box":
        src = ""
        a = w.select_one("a.ue-link")
        m = re.search(r"settings%3D([A-Za-z0-9%]+)", href(a))
        if m:
            try:
                raw = base64.b64decode(m.group(1).replace("%3D", "=").replace("%2B", "+").replace("%2F", "/") + "==").decode()
                src = json.loads(raw).get("url", "")
            except Exception: pass
        if not src:
            mm = re.search(r"url\(['\"]?([^'\")]+)", str(w)); src = mm.group(1) if mm else ""
        B.append({"t": "photo", "src": src, "title": txt(w.select_one(".icroh-title")), "text": txt(w.select_one(".icroh-text"))})
    elif t == "ucaddon_content_tabs":
        labels = [txt(x) for x in w.select(".ue-tab-btn")]
        panes = w.select(".tab-container.panes")
        tabs = []
        for i, pane in enumerate(panes):
            inner = []
            for iw in pane.select("[data-widget_type]"):
                if iw.find_parent(attrs={"data-widget_type": True}) is not w: continue
                inner += widget(iw)
            tabs.append({"label": labels[i] if i < len(labels) else f"Tab {i+1}", "blocks": inner})
        B.append({"t": "tabs", "tabs": tabs})
    elif t == "elementskit-unfold":
        c = w.select_one(".ekit-unfold-wrapper, .elementskit-unfold-wrapper") or w
        h = c.select_one(".ekit-unfold-heading") or c.find(re.compile(r"^h[1-6]$"))
        if h: B.append({"t": "h", "lvl": 4, "text": txt(h), "href": ""})
        body = c.select_one(".ekit-unfold-raw-content, .ekit-unfold-data-inner, .elementskit-unfold-data-inner")
        if body: B.append({"t": "html", "html": sanitize(body)})
    elif t in ("elementskit-button", "premium-addon-button"):
        a = w.find("a")
        if a and href(a) and not a.get("onclick"):
            B.append({"t": "btn", "text": txt(a), "href": href(a)})
    elif t in ("divider", "spacer", "premium-nav-menu", "ekit-nav-menu"):
        pass
    else:
        tx = txt(w)
        imgs = [{"src": img_src(i), "alt": clean(i.get("alt"))} for i in w.find_all("img") if img_src(i)]
        if tx: B.append({"t": "html", "html": f"<p>{H.escape(tx)}</p>", "unknown": t})
        if imgs: B.append({"t": "gallery", "imgs": imgs, "unknown": t})
    SEEN[t] = SEEN.get(t, 0) + 1
    return B

BAD_ID = re.compile(r"wpr-|elementor|premium|uc_|ff_|ekit|swiper|fluent|^e-|tab|slick|owl|carousel|ue_|^uc|menu", re.I)
def ANCHOR_OK(i): return bool(re.match(r"^[A-Za-z][\w-]*$", i)) and not BAD_ID.search(i)

def sections(root):
    tops = [c for c in root.find_all(recursive=False) if isinstance(c, Tag)]
    # unwrap wrappers until we reach the list of top-level containers
    while len(tops) == 1 and not tops[0].get("data-element_type"):
        tops = [c for c in tops[0].find_all(recursive=False) if isinstance(c, Tag)]
    out = []
    for top in tops:
        blocks = []
        els = ([top] if top.get("id") else []) + top.select("[data-widget_type], [id]")
        for w in els:
            if w.get("id") and ANCHOR_OK(w["id"]) and not w.find_parent(attrs={"data-widget_type": True}):
                blocks.append({"t": "anchor", "id": w["id"]})
            if not w.get("data-widget_type"): continue
            if w.find_parent(attrs={"data-widget_type": True}): continue   # nested widget inside widget
            blocks += widget(w)
        if blocks: out.append({"blocks": blocks})
    return out

def nav_menu(s):
    """Main menu from the header template."""
    menu = s.select_one("ul.elementskit-navbar-nav")
    def walk(ul):
        items = []
        for li in ul.find_all("li", recursive=False):
            a = li.find("a")
            sub = li.find("ul")
            items.append({"text": txt(a), "href": href(a), "children": walk(sub) if sub else []})
        return items
    return walk(menu) if menu else []

def footer(s):
    f = s.select_one('[data-elementor-type="footer"]')
    return {"text": [b for sec in sections(f) for b in sec["blocks"]]} if f else {}

pages = {}
menu, foot = None, None
for fpath in sorted(glob.glob(f"{SP}/raw/*.html")):
    slug = os.path.basename(fpath)[:-5]
    s = BeautifulSoup(open(fpath).read(), "html.parser")
    root = s.select_one('[data-elementor-type="wp-page"]')
    if not root:
        print("MISSING CONTENT", slug); continue
    title = clean(s.title.get_text()) if s.title else slug
    desc = (s.find("meta", attrs={"name": "description"}) or {}).get("content", "")
    og = (s.find("meta", attrs={"property": "og:image"}) or {}).get("content", "")
    path = "" if slug == "home" else slug.replace("__", "/")
    pages[slug] = {"slug": slug, "path": path, "title": title, "desc": clean(desc), "og": og,
                   "h1": "", "sections": sections(root), "words": len(txt(root).split())}
    if slug == "home":
        menu = nav_menu(BeautifulSoup(open(fpath).read(), "html5lib")); foot = footer(s)

json.dump({"pages": pages, "menu": menu, "footer": foot}, open(f"{SP}/content.json", "w"), indent=1, ensure_ascii=False)
from collections import Counter
c = Counter(b["t"] for p in pages.values() for sec in p["sections"] for b in sec["blocks"])
print(len(pages), "pages", dict(c))
unk = Counter(b.get("unknown") for p in pages.values() for sec in p["sections"] for b in sec["blocks"] if b.get("unknown"))
print("unknown widgets:", dict(unk)); print("ALL WIDGET TYPES:", SEEN)
