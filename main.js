/*
 * JanyuTech: motion and behaviour for every page.
 *  - smooth scrolling (Lenis) driving GSAP ScrollTrigger
 *  - text builds in as it scrolls into view: words rise out of a blur and overshoot a touch, lines follow,
 *    small labels decode from random characters
 *  - elasticity: pictures lean with the speed of the scroll and spring back; buttons and cards give like springs
 *  - blue petals drift down the screen, carried by the scroll and pushed aside by the pointer
 *  - home: the loader opens like an iris; the hero moves in depth with the cursor (WebGL and a depth map
 *    rendered with the scene); bands of words run with the scroll; sliders; India runs sideways along a
 *    circuit trace; the aerial blueprint is scanned into the real terrace; the footer slides up like a sheet
 *  - blue blossom: looping videos, loaded as they come near, one playing at a time
 * Everything is visible without JavaScript, and still for visitors who prefer reduced motion.
 */
(() => {
  const d = document, html = d.documentElement;
  const $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const desk = () => innerWidth >= 992;
  const isHome = d.body.classList.contains("home");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const store = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  html.classList.remove("no-js");
  if (!window.gsap || !window.ScrollTrigger) { html.classList.add("reduced"); $(".pre")?.remove(); return; }
  if (reduce) html.classList.add("reduced");

  gsap.registerPlugin(ScrollTrigger);
  const hasSplit = !!window.SplitText;
  if (hasSplit) gsap.registerPlugin(SplitText);
  const SPRING = "back.out(1.7)", SOFT = "power3.out", IN = "power2.in";
  const durS = 0.4, delayR = 0.15, stag = 0.08;

  /* ------------------------------------------------------------ smooth scroll */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.2, smoothWheel: true, touchMultiplier: 2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const lock = () => { d.body.classList.add("is-locked"); lenis && lenis.stop(); };
  const unlock = () => { d.body.classList.remove("is-locked"); lenis && lenis.start(); };
  const scrollTo = (target, opts = {}) => {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, ...opts });
    else if (typeof target === "number") window.scrollTo(0, target);
    else (typeof target === "string" ? $(target) : target)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };
  const velocity = () => (lenis ? lenis.velocity || 0 : 0);
  d.addEventListener("click", e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const el = url.hash === "#top" ? 0 : d.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (el === null || el === undefined) return;
    e.preventDefault(); closeMenu();
    scrollTo(el);
  });

  /* ------------------------------------------------------------ text: split, then build in */
  const splits = new WeakMap();
  const split = (el, type) => {
    if (!hasSplit) return null;
    let s = splits.get(el);
    if (s) return s;
    s = SplitText.create(el, type === "p" ? { type: "lines", linesClass: "split-line", aria: "auto" } : { type: "words", wordsClass: "split-word", aria: "auto" });
    splits.set(el, s);
    return s;
  };
  // small labels decode: random characters settle, left to right, into the words
  const GLYPHS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789+/";
  function decode(el, dl = 0) {
    const text = el.dataset.text ?? el.textContent;
    el.dataset.text = text;
    const o = { p: 0 }, n = text.length;
    return gsap.to(o, {
      p: 1, duration: Math.min(1, 0.35 + n * 0.022), delay: dl, ease: "none", overwrite: true,
      onStart: () => gsap.set(el, { opacity: 1 }),
      onUpdate: () => {
        const k = Math.floor(o.p * n);
        let out = "";
        for (let i = 0; i < n; i++) { const c = text[i]; out += i < k || /[\s·&.,:-]/.test(c) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
        el.textContent = out;
      },
      onComplete: () => { el.textContent = text; },
    });
  }
  // each kind has a hidden state, a reveal and a hide, the same everywhere on the site
  const K = {
    h: {  // headings: words rise out of a blur and overshoot a little
      set: el => { const s = split(el, "h"); gsap.set(s ? s.words : el, { yPercent: 70, opacity: 0, filter: "blur(10px)" }); },
      reveal: (el, dl = delayR) => { const s = split(el, "h"); return gsap.to(s ? s.words : el, { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 1.1, delay: dl, stagger: 0.06, ease: SPRING, overwrite: true, clearProps: "filter" }); },
      hide: (el, dl = 0) => { const s = split(el, "h"); return gsap.to(s ? s.words : el, { yPercent: -40, opacity: 0, filter: "blur(8px)", duration: durS, delay: dl, stagger: 0.025, ease: IN, overwrite: true }); },
    },
    p: {  // paragraphs: line by line, out of a soft blur
      set: el => { const s = split(el, "p"); gsap.set(s ? s.lines : el, { y: 22, opacity: 0, filter: "blur(6px)" }); },
      reveal: (el, dl = delayR) => { const s = split(el, "p"); return gsap.to(s ? s.lines : el, { y: 0, opacity: 1, filter: "blur(0px)", duration: 1, delay: dl, stagger: 0.07, ease: SOFT, overwrite: true, clearProps: "filter" }); },
      hide: (el, dl = 0) => { const s = split(el, "p"); return gsap.to(s ? s.lines : el, { y: -12, opacity: 0, duration: durS, delay: dl, stagger: 0.03, ease: IN, overwrite: true }); },
    },
    ctn: {  // blocks: rise on a spring
      set: el => gsap.set(el, { opacity: 0, y: 36, scale: 0.97 }),
      reveal: (el, dl = delayR) => gsap.to(el, { opacity: 1, y: 0, scale: 1, duration: 1.1, delay: dl, ease: SPRING, overwrite: true, onComplete: clean }),
      hide: (el, dl = 0) => gsap.to(el, { opacity: 0, y: -10, duration: durS, delay: dl, ease: IN, overwrite: true }),
    },
    line: {  // a vertical rule drops and bounces
      set: el => gsap.set(el, { scaleY: 0, transformOrigin: "50% 0%" }),
      reveal: (el, dl = delayR) => gsap.to(el, { scaleY: 1, duration: 1.5, delay: dl, ease: "elastic.out(1, 0.55)", overwrite: true, onComplete: clean }),
      hide: (el, dl = 0) => gsap.to(el, { scaleY: 0, duration: durS, delay: dl, ease: IN, overwrite: true }),
    },
    label: {  // labels decode
      set: el => { if (el.children.length) return K.ctn.set(el); el.dataset.text = el.dataset.text ?? el.textContent; gsap.set(el, { opacity: 0 }); },
      reveal: (el, dl = delayR) => (el.children.length ? K.ctn.reveal(el, dl) : decode(el, dl)),
      hide: (el, dl = 0) => gsap.to(el, { opacity: 0, duration: durS, delay: dl, ease: IN, overwrite: true }),
    },
  };
  const visible = el => gsap.set(el, { visibility: "visible" });
  // GSAP folds CSS translate/rotate/scale into its own transform and pins them to "none"; when it's done with an
  // element, hand its transform back to the stylesheet so hover springs (which use those properties) work again
  function clean() { (this && this.targets ? this.targets() : []).forEach(el => { gsap.set(el, { clearProps: "transform" }); ["translate", "rotate", "scale"].forEach(k => el.style.removeProperty(k)); }); }
  const run = (kind, els, mode, dl) => [].concat(els).forEach((el, i) => {
    if (!el) return;
    visible(el);
    const f = (K[kind] || K.ctn)[mode];
    mode === "set" ? f(el) : f(el, (dl ?? (mode === "reveal" ? delayR : 0)) + (mode === "reveal" ? i * stag : 0));
  });

  // everything marked data-reveal builds in the first time it scrolls into view (its wrapper decides when)
  function reveals(root = d) {
    const groups = new Map();
    $$("[data-reveal]", root).forEach(el => {
      if (el.closest("[data-sl-slide]")) return;                   // sliders run their own
      const w = el.closest("[data-reveal-w]") || el;
      if (!groups.has(w)) groups.set(w, []);
      groups.get(w).push(el);
    });
    groups.forEach((els, w) => {
      els.forEach(el => run(el.dataset.reveal, el, "set"));
      ScrollTrigger.create({
        trigger: w, start: "top 90%", once: true,
        onEnter: () => els.forEach((el, i) => run(el.dataset.reveal, el, "reveal", delayR + i * stag)),
      });
    });
  }

  /* ------------------------------------------------------------ the scroll gauge: a hex nut whose outline draws itself as the page goes by */
  const nut = $("[data-nut]");
  if (nut) {
    const bar = $(".nut__bar", nut), num = $(".nut__n", nut);
    let top = false;
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: s => {
        const p = s.progress;
        bar.style.strokeDashoffset = (1 - p).toFixed(4);
        bar.style.opacity = p > 0.002 ? 1 : 0;              // an empty stroke would still show its round cap as a dot
        num.textContent = String(Math.round(p * 100)).padStart(2, "0");
        if ((p > 0.985) !== top) { top = !top; nut.classList.toggle("is-top", top); nut.setAttribute("aria-label", top ? "Back to top" : "Scroll down"); }
        nut.classList.toggle("is-start", p < 0.02);          // "Scroll", in rubber letters, until the page moves
      },
    });
    // a press goes down a screen, or back to the top from the end
    nut.addEventListener("click", () => scrollTo(top ? 0 : (lenis ? lenis.animatedScroll : scrollY) + innerHeight * 0.9));
  }

  /* ------------------------------------------------------------ the nav: one underline that stretches from link to link like a rubber band */
  const nav = $("[data-nav]");
  const navLine = (() => {
    if (!nav) return { to() {}, rest() {}, hold() {}, place() {} };
    const line = $(".hdr__line", nav), items = $$(".hdr__link", nav);
    const here = items.find(a => a.tagName === "A" && new URL(a.href, location.href).pathname === location.pathname) || null;
    here && here.classList.add("is-here");
    const S = { l: 0, r: 0, o: 0 };
    let cur = null, held = null;
    const draw = () => { line.style.left = S.l.toFixed(1) + "px"; line.style.width = Math.max(0, S.r - S.l).toFixed(1) + "px"; line.style.opacity = S.o.toFixed(3); };
    const edges = el => { const t = $(".hdr__t", el) || el, r = t.getBoundingClientRect(), n = nav.getBoundingClientRect(); return [r.left - n.left, r.right - n.left]; };
    function to(el, instant) {
      if (!el) {                                   // nowhere to rest: shrink into its middle and fade
        const c = (S.l + S.r) / 2;
        cur = null;
        return reduce || instant ? (Object.assign(S, { l: c, r: c, o: 0 }), draw()) : gsap.to(S, { l: c, r: c, o: 0, duration: 0.45, ease: "power3.out", overwrite: "auto", onUpdate: draw });
      }
      const [l, r] = edges(el);
      if (reduce || instant) { Object.assign(S, { l, r, o: 1 }); cur = el; return draw(); }
      if (!cur || S.o < 0.05) {                    // appear: grow out from the middle of the word
        const c = (l + r) / 2;
        Object.assign(S, { l: c, r: c });
        gsap.to(S, { l, r, o: 1, duration: 0.8, ease: "elastic.out(1, 0.6)", overwrite: "auto", onUpdate: draw });
      } else if (el !== cur) {                     // the leading edge runs ahead, the trailing edge is pulled after it
        const right = l > S.l;
        gsap.to(S, { r, duration: right ? 0.38 : 0.9, delay: right ? 0 : 0.1, ease: right ? "power3.out" : "elastic.out(1, 0.5)", overwrite: "auto", onUpdate: draw });
        gsap.to(S, { l, duration: right ? 0.9 : 0.38, delay: right ? 0.1 : 0, ease: right ? "elastic.out(1, 0.5)" : "power3.out", overwrite: "auto", onUpdate: draw });
        gsap.to(S, { o: 1, duration: 0.2, overwrite: "auto", onUpdate: draw });
      }
      cur = el;
    }
    const rest = () => to(held || here);
    items.forEach(el => { el.addEventListener("mouseenter", () => to(el)); el.addEventListener("focus", () => to(el)); });
    nav.addEventListener("mouseleave", rest);
    nav.addEventListener("focusout", e => { if (!nav.contains(e.relatedTarget)) rest(); });
    addEventListener("resize", () => to(cur, true));
    return { to, rest, hold(el) { held = el; to(el || here); }, place() { to(here, true); } };
  })();

  /* ------------------------------------------------------------ menu: opens as a circle out of the Menu button */
  const menu = $("[data-menu]"), menuBtn = $("[data-menu-btn]");
  let origin = [0, 0];
  const circle = r => `circle(${r}px at ${origin[0]}px ${origin[1]}px)`;
  function openMenu() {
    if (!menu || d.body.classList.contains("menu-open")) return;
    d.body.classList.add("menu-open"); menuBtn?.setAttribute("aria-expanded", "true");
    navLine.hold(menuBtn);
    const r = menuBtn.getBoundingClientRect();
    origin = [r.left + r.width / 2, r.top + r.height / 2];
    const R = Math.hypot(Math.max(origin[0], innerWidth - origin[0]), Math.max(origin[1], innerHeight - origin[1])) + 24;
    lock();
    gsap.set(menu, { visibility: "visible" });
    if (reduce) { gsap.set(menu, { clipPath: "none" }); return; }
    gsap.timeline()
      .fromTo(menu, { clipPath: circle(0) }, { clipPath: circle(R), duration: 1, ease: "expo.inOut" })
      .fromTo($$(".om__item--d0", menu), { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 1, stagger: 0.045, ease: SPRING, onComplete: clean }, 0.35)
      .fromTo($$(".menu__side > *", menu), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1, stagger: 0.07, ease: SPRING, onComplete: clean }, 0.5);
  }
  function closeMenu() {
    if (!menu || !d.body.classList.contains("menu-open")) return;
    menuBtn?.setAttribute("aria-expanded", "false");
    d.body.classList.remove("menu-open");
    navLine.hold(null);
    unlock();
    if (reduce) { gsap.set(menu, { visibility: "hidden" }); return; }
    gsap.to(menu, { clipPath: circle(0), duration: 0.7, ease: "expo.in", overwrite: true, onComplete: () => gsap.set(menu, { visibility: "hidden" }) });
  }
  menuBtn?.addEventListener("click", () => (d.body.classList.contains("menu-open") ? closeMenu() : openMenu()));
  $$(".om__toggle").forEach(b => b.addEventListener("click", () => {
    const sub = b.closest(".om__item").querySelector(":scope > .om__sub");
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open); sub.hidden = !open;
    if (open && !reduce) gsap.fromTo($$(":scope > li", sub), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.8, stagger: 0.03, ease: SPRING });
  }));
  menu?.setAttribute("data-lenis-prevent", "");
  addEventListener("keydown", e => { if (e.key === "Escape") { closeMenu(); closeLightbox(); } });

  /* ------------------------------------------------------------ changing page: a blue veil */
  const curtain = $(".curtain");
  if (curtain) {
    if (html.classList.contains("pt-in")) {
      curtain.classList.add("is-in");
      requestAnimationFrame(() => requestAnimationFrame(() => { html.classList.remove("pt-in"); curtain.classList.remove("is-in"); }));
    }
    d.addEventListener("click", e => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.dataset.lightbox !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /\.(pdf|png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      store.set("pt", "1");
      curtain.classList.add("is-in");
      setTimeout(() => { location.href = url.href; }, reduce ? 0 : 700);
    });
    addEventListener("pageshow", e => { if (e.persisted) curtain.classList.remove("is-in"); });
  }

  /* ------------------------------------------------------------ blossom videos */
  const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const flowers = $$(".flower video");
  flowers.forEach(v => { if (safari) $$('source[type="video/webm"]', v).forEach(s => s.remove()); });
  // Only one plays at a time (the one most in view) because two transparent videos decoding at once pull
  // Chrome down to 30 frames a second; the others hold still and sway gently (CSS). Each loads as it comes near.
  const tryPlay = v => { if (v !== playing) return; const p = v.play(); p && p.catch(() => {}); };
  const loadVid = v => {
    if (v.dataset.loaded) return;
    v.dataset.loaded = "1";
    $$("source[data-src]", v).forEach(s => { s.src = s.dataset.src; });
    v.addEventListener("canplay", () => tryPlay(v));
    v.load();
  };
  let playing = null;
  const ratio = new Map();
  function pick() {
    let best = null, br = 0.08;
    ratio.forEach((r, v) => { if (r > br) { br = r; best = v; } });
    if (best === playing) return;
    if (playing) { playing.pause(); playing.parentElement.classList.remove("is-playing"); }
    playing = best;
    if (best) { best.parentElement.classList.add("is-playing"); loadVid(best); if (best.readyState >= 3) tryPlay(best); }
  }
  if (flowers.length && !reduce && "IntersectionObserver" in window) {
    const near = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { loadVid(e.target); near.unobserve(e.target); } }), { rootMargin: "60% 0px" });
    const seen = new IntersectionObserver(es => { es.forEach(e => ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0)); pick(); }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    flowers.forEach(v => { near.observe(v); seen.observe(v); });
    d.addEventListener("visibilitychange", () => { if (d.hidden) playing && playing.pause(); else if (playing) tryPlay(playing); });
  }

  // the film from the field: loads when it comes near, plays while it's in view
  const film = $(".field__vid");
  if (film && "IntersectionObserver" in window) {
    if (reduce) film.controls = true;
    let loaded = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!loaded) { loaded = true; $$("source[data-src]", film).forEach(s => { s.src = s.dataset.src; }); film.load(); }
        if (!reduce) { const p = film.play(); p && p.catch(() => {}); }
      } else film.pause();
    }, { rootMargin: "20% 0px", threshold: 0.01 }).observe(film);
  }

  /* ------------------------------------------------------------ elasticity */
  // pictures lean with the speed of the scroll, then spring back past straight and settle
  function elastic() {
    if (reduce || !lenis) return;
    const els = $$(".why__img, .prod__img, .loc__img, .inter__panel-img, .duo__img picture, .field__frame, .card__img, .photo a, .gallery__item, .event__img, .video__frame, .member__img, .phero__banner");
    const sprig = $(".hdr__sprig img");
    const vis = new Set();
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) vis.add(e.target); else { vis.delete(e.target); e.target.style.transform = ""; } }));
    els.forEach(el => io.observe(el));
    let x = 0, v = 0, rest = true;
    gsap.ticker.add((t, dtMs) => {
      const dt = Math.min(dtMs, 40) / 1000;
      const target = clamp(-velocity() / 28, -1, 1);
      v += ((target - x) * 180 - v * 14) * dt;       // stiffness 180, damping 14: a little under-damped
      x += v * dt;
      if (Math.abs(x) < 0.0004 && Math.abs(v) < 0.0004 && !target) {
        if (!rest) { vis.forEach(el => { el.style.transform = ""; }); sprig && sprig.style.removeProperty("rotate"); rest = true; }
        return;
      }
      rest = false;
      const s = `skewY(${(x * 2.4).toFixed(3)}deg) scale(${(1 - Math.abs(x) * 0.025).toFixed(4)})`;
      vis.forEach(el => { el.style.transform = s; });
      if (sprig) sprig.style.rotate = (x * 9).toFixed(2) + "deg";     // the blossom on the logo bends in the scroll's wind
    });
  }
  // magnetic: pills lean towards the pointer and spring back (past centre, then settle) when it leaves
  function magnetic() {
    if (!fine || reduce) return;
    const live = new Set();
    $$("[data-magnetic]").forEach(el => {
      const m = { el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
      el.addEventListener("mousemove", e => { const r = el.getBoundingClientRect(); m.tx = (e.clientX - r.left - r.width / 2 - m.x) * 0.24; m.ty = (e.clientY - r.top - r.height / 2 - m.y) * 0.34; live.add(m); });
      el.addEventListener("mouseleave", () => { m.tx = m.ty = 0; live.add(m); });
    });
    gsap.ticker.add((t, dtMs) => {
      if (!live.size) return;
      const dt = Math.min(dtMs, 40) / 1000;
      live.forEach(m => {
        m.vx += ((m.tx - m.x) * 150 - m.vx * 10) * dt; m.vy += ((m.ty - m.y) * 150 - m.vy * 10) * dt;
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (!m.tx && !m.ty && Math.abs(m.x) + Math.abs(m.y) + Math.abs(m.vx) + Math.abs(m.vy) < 0.02) { m.x = m.y = m.vx = m.vy = 0; live.delete(m); m.el.style.removeProperty("translate"); return; }
        m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      });
    });
  }

  /* ------------------------------------------------------------ bands of words that run sideways, faster (and backwards) with the scroll */
  const bands = [];
  let bandDir = 1, bandBoost = 0;
  function band(el) {
    const row = $(".marq__row", el);
    if (!row || !row.children.length) return;
    // repeat the items until one set is wider than the band, then double that so it can loop
    const orig = [...row.children], need = el.clientWidth + 60;
    for (let g = 0; row.scrollWidth < need && g < 12; g++) orig.forEach(c => row.appendChild(c.cloneNode(true)));
    [...row.children].forEach(c => row.appendChild(c.cloneNode(true)));
    [...row.children].forEach((c, k) => { if (k >= orig.length) { c.setAttribute("aria-hidden", "true"); if (c.tagName === "A") c.tabIndex = -1; } });
    const it = { el, row, base: +el.dataset.marq || 1, w: row.scrollWidth / 2, x: 0, vis: false };
    bands.push(it);
    addEventListener("resize", () => { it.w = row.scrollWidth / 2; });
    if (!reduce) new IntersectionObserver(([e]) => { it.vis = e.isIntersecting; }).observe(el);
  }
  function marquees() {
    $$("[data-marq]").forEach(el => {
      // a band of pictures (the client logos) is measured once its pictures have loaded
      const ims = $$("img", el).filter(im => !im.complete);
      if (!ims.length) return band(el);
      Promise.all(ims.map(im => new Promise(ok => { im.addEventListener("load", ok, { once: true }); im.addEventListener("error", ok, { once: true }); }))).then(() => band(el));
    });
    if (reduce) return;
    gsap.ticker.add((t, dtMs) => {
      const dt = Math.min(dtMs, 50) / 1000, v = velocity();
      if (Math.abs(v) > 0.4) bandDir = v > 0 ? 1 : -1;
      bandBoost += (Math.abs(v) * 0.16 - bandBoost) * Math.min(1, dt * 5);     // eases up with the scroll, and back down after
      for (const it of bands) {
        if (!it.vis || !it.w) continue;
        it.x -= 60 * (1 + bandBoost) * it.base * bandDir * dt;
        if (it.x <= -it.w) it.x += it.w; else if (it.x > 0) it.x -= it.w;
        it.row.style.transform = `translate3d(${it.x.toFixed(2)}px,0,0)`;
      }
    });
  }

  /* ------------------------------------------------------------ petals: blue blossom drifting down the screen */
  let petalsOn = false;
  function petals(count) {
    if (reduce || petalsOn || !count) return;
    petalsOn = true;
    const c = d.createElement("canvas"); c.className = "petals"; c.setAttribute("aria-hidden", "true");
    d.body.appendChild(c);
    const ctx = c.getContext("2d");
    const shape = new Path2D("M0 10 C-6.5 6 -8.6 -3 -4.2 -8.6 C-2.4 -10.6 -.9 -9.8 0 -8.1 C.9 -9.8 2.4 -10.6 4.2 -8.6 C8.6 -3 6.5 6 0 10 Z");
    const cols = ["#2f5fd9", "#4a7ae8", "#6f96f0", "#9db8f6", "#3d6fe6", "#1f4fc4"];
    let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(devicePixelRatio || 1, 1.5); W = innerWidth; H = innerHeight; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); };
    size(); addEventListener("resize", size);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const make = (y) => ({ x: rnd(0, W), y, z: rnd(0.4, 1), rot: rnd(0, 6.28), spin: rnd(-1.4, 1.4), flip: rnd(0, 6.28), flipV: rnd(1.4, 2.8), sway: rnd(0, 6.28), swayV: rnd(0.5, 1.1), vx: 0, vy: 0, col: cols[(Math.random() * cols.length) | 0] });
    const P = Array.from({ length: count }, () => make(rnd(-40, H)));
    let mx = -1e4, my = -1e4;
    if (fine) {
      addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; }, { passive: true });
      html.addEventListener("mouseleave", () => { mx = my = -1e4; });
    }
    let lastY = lenis ? lenis.animatedScroll : scrollY;
    gsap.ticker.add((t, dtMs) => {
      if (d.hidden) return;
      const dt = Math.min(dtMs, 50) / 1000;
      const sy = lenis ? lenis.animatedScroll : scrollY, dy = sy - lastY; lastY = sy;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const wind = 14 + Math.sin(t * 0.25) * 16;
      for (const p of P) {
        p.sway += p.swayV * dt; p.flip += p.flipV * dt * (1 + Math.abs(dy) * 0.02); p.rot += p.spin * dt;
        // fall and sway; nearer petals fall faster and are carried further by the scroll
        p.x += (wind * p.z + Math.sin(p.sway) * 30 * p.z + p.vx) * dt;
        p.y += (26 + 34 * p.z + p.vy) * dt - dy * (0.3 + p.z * 0.55);
        // the pointer pushes them aside; the push dies away
        const ex = p.x - mx, ey = p.y - my, dd = Math.hypot(ex, ey);
        if (dd < 120) { const f = (1 - dd / 120) * 1400 / (dd + 1); p.vx += ex * f * dt; p.vy += ey * f * dt; p.spin += (Math.random() - 0.5) * 0.3; }
        const damp = Math.pow(0.12, dt); p.vx *= damp; p.vy *= damp;
        if (p.y > H + 30) Object.assign(p, make(rnd(-60, -20)));
        else if (p.y < -70) Object.assign(p, make(H + rnd(10, 50)));
        if (p.x < -40) p.x += W + 80; else if (p.x > W + 40) p.x -= W + 80;
        const s = (0.65 + p.z * 0.85) * dpr, cr = Math.cos(p.rot), sr = Math.sin(p.rot), fx = Math.cos(p.flip);
        ctx.setTransform(cr * fx * s, sr * fx * s, -sr * s, cr * s, p.x * dpr, p.y * dpr);
        ctx.globalAlpha = (0.45 + p.z * 0.45) * (0.65 + 0.35 * Math.abs(fx));
        ctx.fillStyle = p.col;
        ctx.fill(shape);
      }
    });
  }

  /* ------------------------------------------------------------ small things */
  // pins pulse
  if (!reduce) $$(".pin__pulse").forEach((p, i) => gsap.fromTo(p, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 2, duration: 1.8, ease: "power2.out", repeat: -1, delay: i * 0.4 }));

  /* ------------------------------------------------------------ sliders (home): one at a time; the image wipes up, the words rise */
  function slider(root) {
    const slides = $$("[data-sl-slide]", root);
    if (slides.length < 2) return;
    const cur = $("[data-sl-cur]", root), segs = $$("[data-sl-seg]", root);
    const DUR = root.dataset.sl === "prod" ? 7 : 6;
    let i = 0, busy = false, timer = 0, fill = null, inView = false, hover = false;
    const parts = s => ({ h: $$("[data-part-h]", s), p: $$("[data-part-p]", s), c: $$("[data-part-c]", s), img: $$("[data-part-img]", s) });
    const R = () => (desk() ? "32px" : "24px");
    slides.forEach((s, k) => gsap.set(s, { autoAlpha: k ? 0 : 1, zIndex: k ? 0 : 1 }));
    const nums = () => {
      if (cur) cur.textContent = String(i + 1).padStart(2, "0");
      segs.forEach((g, k) => { g.classList.toggle("is-done", k < i); gsap.set($("b", g), { scaleX: k < i ? 1 : 0 }); });
    };
    const scan = (el, dl = 0) => {   // the robot's blueprint is scanned into its photo
      const ph = $(".prod__ph", el), ln = $(".prod__scan", el);
      if (!ph) return;
      gsap.fromTo(ph, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, delay: dl, ease: "power2.inOut", overwrite: true });
      ln && gsap.fromTo(ln, { top: "0%", opacity: 1 }, { top: "100%", duration: 1.6, delay: dl, ease: "power2.inOut", overwrite: true, onComplete: () => gsap.to(ln, { opacity: 0, duration: 0.3 }) });
    };
    const imgIn = (el, dl = 0) => {
      gsap.fromTo(el, { clipPath: `inset(100% 0% 0% 0% round ${R()})` }, { clipPath: `inset(0% 0% 0% 0% round ${R()})`, duration: 1.2, delay: dl, ease: "expo.out", overwrite: true });
      gsap.fromTo($$("img", el), { scale: 1.22 }, { scale: 1, duration: 1.7, delay: dl, ease: "expo.out", overwrite: true });
      if (el.hasAttribute("data-scan")) scan(el, dl + 0.5);
    };
    const imgOut = el => gsap.to(el, { clipPath: `inset(0% 0% 100% 0% round ${R()})`, duration: 0.7, ease: "expo.in", overwrite: true });
    const runBar = () => {
      fill && fill.kill(); clearTimeout(timer);
      if (!inView || hover || reduce) return;
      const b = segs[i] && $("b", segs[i]);
      if (b) fill = gsap.fromTo(b, { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: "none" });
      timer = setTimeout(() => go((i + 1) % slides.length), DUR * 1000);
    };
    function go(n) {
      if (busy || n === i) return;
      busy = true;
      const a = slides[i], b = slides[n], A = parts(a), B = parts(b);
      i = n; nums(); runBar();
      gsap.set(b, { autoAlpha: 1, zIndex: 2 }); gsap.set(a, { zIndex: 1 });
      if (reduce) { gsap.set(a, { autoAlpha: 0, zIndex: 0 }); busy = false; return; }
      run("h", A.h, "hide"); run("p", A.p, "hide"); run("ctn", A.c, "hide"); A.img.forEach(imgOut);
      run("h", B.h, "set"); run("p", B.p, "set"); run("ctn", B.c, "set");
      B.img.forEach(el => gsap.set(el, { clipPath: `inset(100% 0% 0% 0% round ${R()})` }));
      B.img.forEach(el => imgIn(el, 0.3));
      gsap.delayedCall(0.4, () => { run("h", B.h, "reveal", 0); run("p", B.p, "reveal", 0.12); run("ctn", B.c, "reveal", 0.2); });
      gsap.delayedCall(1.2, () => { gsap.set(a, { autoAlpha: 0, zIndex: 0 }); busy = false; });
    }
    nums();
    // the first slide builds in the first time the slider comes into view
    if (!reduce) {
      const F = parts(slides[0]);
      run("h", F.h, "set"); run("p", F.p, "set"); run("ctn", F.c, "set");
      F.img.forEach(el => gsap.set(el, { clipPath: `inset(100% 0% 0% 0% round ${R()})` }));
      ScrollTrigger.create({ trigger: root, start: "top 80%", once: true, onEnter: () => {
        F.img.forEach(el => imgIn(el, 0));
        run("h", F.h, "reveal", 0.15); run("p", F.p, "reveal", 0.3); run("ctn", F.c, "reveal", 0.35);
      } });
    }
    const step = s => { go((i + s + slides.length) % slides.length); };
    $$("[data-sl-prev]", root).forEach(b => b.addEventListener("click", () => step(-1)));
    $$("[data-sl-nextbtn]", root).forEach(b => b.addEventListener("click", () => step(1)));
    root.addEventListener("keydown", e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    if (fine) { root.addEventListener("mouseenter", () => { hover = true; runBar(); }); root.addEventListener("mouseleave", () => { hover = false; runBar(); }); }
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; runBar(); }, { threshold: 0.3 }).observe(root);
    // swipe on touch
    let sx = null;
    root.addEventListener("pointerdown", e => { if (!e.target.closest("a,button")) sx = e.clientX; });
    root.addEventListener("pointerup", e => { if (sx !== null && Math.abs(e.clientX - sx) > 50) step(e.clientX < sx ? 1 : -1); sx = null; });
  }

  /* ------------------------------------------------------------ the hero in depth: the render, displaced by its depth map as the cursor moves */
  function depthHero() {
    const hero = $(".hero"), bg = $(".hero__bg");
    if (!hero || !bg || reduce) return null;
    const dayImg = $('.hero__img[data-tab="day"] img', bg), nightImg = $('.hero__img[data-tab="night"] img', bg);
    if (!dayImg) return null;
    const canvas = d.createElement("canvas");
    canvas.className = "hero__gl"; canvas.setAttribute("aria-hidden", "true");
    let gl = null;
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}");
    const fs = sh(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 v;uniform sampler2D uDay,uNight,uDepth;uniform float uMix,uFocus,uAmt;uniform vec2 uM,uScale;
      void main(){
        vec2 uv=(v-.5)*uScale+.5;
        float z=texture2D(uDepth,uv).r;
        vec2 off=uM*(z-uFocus)*uAmt;
        float z2=texture2D(uDepth,uv+off).r;
        off=uM*(mix(z,z2,.5)-uFocus)*uAmt;
        vec2 st=uv+off;
        gl_FragColor=vec4(mix(texture2D(uDay,st).rgb,texture2D(uNight,st).rgb,uMix),1.);
      }`);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(prog, n);
    const u = { mix: U("uMix"), focus: U("uFocus"), amt: U("uAmt"), m: U("uM"), scale: U("uScale") };
    const tex = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]].forEach(([k, val]) => gl.texParameteri(gl.TEXTURE_2D, k, val));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([14, 37, 102]));
      return t;
    };
    const T = [tex(0), tex(1), tex(2)];
    gl.uniform1i(U("uDay"), 0); gl.uniform1i(U("uNight"), 1); gl.uniform1i(U("uDepth"), 2);
    const upload = (unit, im) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T[unit]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im); dirty = true; };
    const load = src => new Promise((ok, no) => { const im = new Image(); im.decoding = "async"; im.onload = () => ok(im); im.onerror = no; im.src = src; });
    const loaded = im => new Promise(ok => { if (im.complete && im.naturalWidth) ok(im); else { im.addEventListener("load", () => ok(im), { once: true }); im.addEventListener("error", () => ok(null), { once: true }); } });

    const F = 0.45, AMT = desk() ? 0.026 : 0.02, OVER = 0.97;
    const M = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    const S = { mix: 0 };
    let iw = 4, ih = 3, sx = 1, sy = 1, dirty = true, inView = true, dead = false, ok = false;
    const pins = $$(".pin", bg).map(el => ({ el, x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100, z: +el.dataset.z || F }));
    const ctn = $(".hero__in", hero), foot = $(".hero__foot-in", hero);
    const resize = () => {
      const bw = bg.clientWidth, bh = bg.clientHeight;
      if (!bw || !bh) return;
      const dpr = Math.min(devicePixelRatio || 1, 1.5, (iw * 1.1) / bw);
      canvas.width = Math.round(bw * dpr); canvas.height = Math.round(bh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const ba = bw / bh, ia = iw / ih;
      [sx, sy] = ba > ia ? [1, ia / ba] : [ba / ia, 1];
      sx *= OVER; sy *= OVER;
      pins.forEach(p => { p.el.style.left = ((p.x - 0.5) / sx + 0.5) * 100 + "%"; p.el.style.top = ((p.y - 0.5) / sy + 0.5) * 100 + "%"; });
      dirty = true;
    };
    const draw = () => {
      gl.uniform1f(u.mix, S.mix); gl.uniform1f(u.focus, F); gl.uniform1f(u.amt, AMT);
      gl.uniform2f(u.m, M.x, M.y); gl.uniform2f(u.scale, sx, sy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const bw = bg.clientWidth, bh = bg.clientHeight;
      pins.forEach(p => { const k = (p.z - F) * AMT; p.el.style.translate = `${(-M.x * k / sx * bw).toFixed(1)}px ${(-M.y * k / sy * bh).toFixed(1)}px`; });
    };
    if (fine) {
      addEventListener("pointermove", e => { M.tx = e.clientX / innerWidth * 2 - 1; M.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
      html.addEventListener("mouseleave", () => { M.tx = M.ty = 0; });
    }
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; dirty = true; }).observe(hero);
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); dead = true; hero.classList.remove("has-gl"); canvas.remove(); });
    gsap.ticker.add((t, dtMs) => {
      if (dead || !ok || !inView) return;
      const dt = Math.min(dtMs, 40) / 1000;
      if (!fine) { M.tx = Math.sin(t * 0.45) * 0.7; M.ty = Math.cos(t * 0.33) * 0.35; }     // no cursor: a slow drift
      // a spring towards the cursor, a little under-damped so fast moves overshoot and settle (the "shake")
      const ax = (M.tx - M.x) * 70 - M.vx * 11, ay = (M.ty - M.y) * 70 - M.vy * 11;
      M.vx += ax * dt; M.vy += ay * dt; M.x += M.vx * dt; M.y += M.vy * dt;
      const moving = Math.abs(M.vx) + Math.abs(M.vy) + Math.abs(M.tx - M.x) + Math.abs(M.ty - M.y) > 0.0008;
      if (moving || dirty) {
        draw(); dirty = false;
        ctn && (ctn.style.translate = `${(-M.x * 18).toFixed(2)}px ${(-M.y * 12).toFixed(2)}px`);
        foot && (foot.style.translate = `${(-M.x * 10).toFixed(2)}px ${(-M.y * 6).toFixed(2)}px`);
      }
    });
    const useM = () => /hero-m-/.test(dayImg.currentSrc || "");
    const ready = loaded(dayImg).then(im => {
      if (!im) throw new Error("no image");
      iw = im.naturalWidth; ih = im.naturalHeight;
      const depthSrc = useM() ? bg.dataset.depthM : bg.dataset.depth;
      return load(depthSrc).then(dm => {
        upload(0, im); upload(2, dm); upload(1, im);
        bg.appendChild(canvas);
        const sh = $(".hero__shade", bg); sh && bg.insertBefore(canvas, sh);
        resize(); addEventListener("resize", resize);
        ok = true; draw();
        hero.classList.add("has-gl");
      });
    }).catch(() => { dead = true; canvas.remove(); });
    const nightTex = () => (nightImg ? (nightImg.loading = "eager", loaded(nightImg).then(im => { if (im && !dead) upload(1, im); return im; })) : Promise.resolve(null));
    let nightP = null;
    return {
      ready,
      get on() { return ok && !dead; },
      night(on) {
        nightP = nightP || nightTex();
        return nightP.then(() => gsap.to(S, { mix: on ? 1 : 0, duration: 1.3, ease: "power2.inOut", overwrite: true, onUpdate: () => { dirty = true; } }));
      },
      prefetchNight() { nightP = nightP || nightTex(); },
    };
  }

  /* ============================================================ home */
  function home() {
    const pre = $("[data-pre]");
    const heroImg = $(".hero__img.is-on img");
    const heroParts = $$(".hero [data-part]");
    heroParts.forEach(el => run(el.dataset.part, el, "set"));
    const heroIn = (dl = 0) => heroParts.forEach((el, k) => run(el.dataset.part, el, "reveal", dl + k * 0.12));
    const G = depthHero();

    // the loader: the mark and the name, a count to a hundred; then an iris opens onto the terrace
    if (pre && !reduce) {
      const first = store.get("seen") !== "1";
      store.set("seen", "1");
      lock(); scrollTo(0, { immediate: true }); window.scrollTo(0, 0);
      pre.classList.add("is-on");
      const bg = $(".hero__bg"), ctn = $(".pre__ctn", pre), decor = $(".pre__decor", pre), bar = $(".pre__bar i", pre), count = $("[data-pre-count]", pre);
      gsap.set(bg, { scale: 1.3, transformOrigin: "50% 45%" });
      const ready = Promise.race([
        Promise.all([new Promise(ok => { if (!heroImg || heroImg.complete) ok(); else { heroImg.addEventListener("load", ok, { once: true }); heroImg.addEventListener("error", ok, { once: true }); } }), G ? G.ready.catch(() => {}) : null]),
        new Promise(ok => setTimeout(ok, 7000)),
      ]);
      const tl = gsap.timeline();
      if (first) {
        const c = { v: 0 };
        tl.fromTo([$(".pre__mark", pre), $(".pre__logo", pre)], { opacity: 0, y: 24, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 1, stagger: 0.1, ease: SPRING }, 0)
          .fromTo($(".pre__mark", pre), { rotate: -120 }, { rotate: 0, duration: 1.8, ease: "elastic.out(1, 0.45)" }, 0)
          .fromTo(decor, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)
          .to(c, { v: 100, duration: 1.5, ease: "power2.inOut", onUpdate: () => { count.textContent = Math.round(c.v); bar.style.transform = `scaleX(${(c.v / 100).toFixed(3)})`; } }, 0.15)
          .addPause(1.7, () => ready.then(() => tl.resume()))
          .to(ctn, { opacity: 0, scale: 0.94, duration: 0.45, ease: IN }, 1.75);
      } else {
        gsap.set(ctn, { display: "none" });
        tl.addPause(0.05, () => ready.then(() => tl.resume()));
      }
      tl.to(pre, { "--r": () => Math.hypot(innerWidth, innerHeight) / 2 + 60 + "px", duration: 1.3, ease: "expo.inOut" }, first ? 2.1 : 0.1)
        .to(decor, { opacity: 0, duration: 0.8 }, "<")
        .to(bg, { scale: 1, duration: 2, ease: "expo.out" }, "<0.25")
        .add(() => heroIn(0), "<0.1")
        .add(() => { pre.remove(); unlock(); ScrollTrigger.refresh(); petals(desk() ? 22 : 12); }, "<0.9");
      // in a hurry? a scroll, a tap or a key plays the rest faster
      const hurry = () => { tl.timeScale(2.6); ["wheel", "touchstart", "keydown", "pointerdown"].forEach(t => removeEventListener(t, hurry)); };
      ["wheel", "touchstart", "keydown", "pointerdown"].forEach(t => addEventListener(t, hurry, { passive: true }));
    } else {
      pre?.remove();
      heroIn(0.2);
      petals(desk() ? 22 : 12);
    }

    // day and night: a switch; with WebGL the two renders blend in the shader, otherwise they cross-fade
    const tabs = $("[data-tabs-hero]");
    if (tabs) {
      const btns = $$("button", tabs), imgs = $$(".hero__img");
      btns.forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("is-active")) return;
        const night = b.dataset.tab === "night";
        btns.forEach(x => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-pressed", x === b); });
        tabs.classList.toggle("is-night", night);
        imgs.forEach(x => x.classList.toggle("is-on", x.dataset.tab === b.dataset.tab));
        if (G && G.on) { G.night(night); return; }
        const on = imgs.find(x => x.dataset.tab === b.dataset.tab), off = imgs.find(x => x !== on), im = $("img", on);
        if (im.loading === "lazy") im.loading = "eager";
        const show = () => { gsap.set(on, { zIndex: 1 }); gsap.set(off, { zIndex: 0 }); gsap.fromTo(on, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: "power2.inOut", onComplete: () => gsap.set(off, { opacity: 0 }) }); };
        im.complete ? show() : im.addEventListener("load", show, { once: true });
      }));
      // fetch the night view once the page has settled
      addEventListener("load", () => setTimeout(() => { if (G && G.on) G.prefetchNight(); else { const n = $('.hero__img[data-tab="night"] img'); if (n) n.loading = "eager"; } }, 2500));
    }

    // the hero pans down the view and dives in, and dims as the pale sheet slides over it
    const hero = $(".hero");
    if (hero && !reduce) {
      const bg = $(".hero__bg"), ctn = $(".hero__ctn"), foot = $(".hero__foot"), dim = $(".hero__dim");
      ScrollTrigger.matchMedia({
        "(min-width: 992px)": () => {
          gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom bottom", scrub: true, invalidateOnRefresh: true } })
            .to(ctn, { y: () => -(bg.offsetHeight * 1.25 - innerHeight) - innerHeight * 0.3, ease: "power1.inOut", duration: 0.6 }, 0)
            .to(bg, { y: () => -(bg.offsetHeight - innerHeight), ease: "power1.inOut", duration: 0.6 }, 0)
            .to(foot, { opacity: 0, duration: 0.2 }, 0)
            .to(bg, { scale: 1.7, ease: "power2.in", duration: 0.6 }, 0.4)
            .to(dim, { opacity: 0.6, ease: "power1.in", duration: 0.35 }, 0.65);
        },
        "(max-width: 991px)": () => {
          gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom bottom", scrub: true } })
            .to(ctn, { y: () => -innerHeight * 0.6, ease: "none", duration: 0.5 }, 0).to(foot, { opacity: 0, duration: 0.2 }, 0)
            .to(bg, { scale: 1.5, ease: "power2.in", duration: 0.6 }, 0.3)
            .to(dim, { opacity: 0.6, ease: "power1.in", duration: 0.4 }, 0.6);
        },
      });
    }

    // the quote's view settles as it comes up
    const qimg = $(".quote__bg img");
    if (qimg && !reduce) gsap.fromTo(qimg, { scale: 1.15 }, { scale: 1, ease: "none", scrollTrigger: { trigger: ".quote", start: "top bottom", end: "top top", scrub: 0.3 } });

    // the concept: each word fills in as the page passes it
    if (!reduce && hasSplit) $$("[data-fill]").forEach(el => {
      const s = SplitText.create(el, { type: "words", wordsClass: "fw", aria: "auto" });
      gsap.to(s.words, { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 42%", scrub: true } });
    });

    // Make in India: sideways on desktop, the trace drawn as it arrives
    const loc = $(".loc");
    if (loc && !reduce) {
      ScrollTrigger.matchMedia({
        "(min-width: 992px)": () => {
          const track = $(".loc__track", loc);
          const dist = () => track.scrollWidth - innerWidth;
          const setH = () => { loc.style.height = track.scrollWidth + "px"; };
          setH();
          const tw = gsap.to(track, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: loc, start: "top top", end: "bottom bottom", scrub: 0.4, invalidateOnRefresh: true, onRefreshInit: setH } });
          $$(".loc__line", loc).forEach((l, k) => gsap.fromTo(l, { xPercent: [-5, 25, -15][k] }, { xPercent: [5, -25, 25][k], ease: "none", scrollTrigger: { trigger: loc, start: "top top", end: "bottom bottom", scrub: 0.4 } }));
          const fa = $(".flower--loc-a", loc); fa && gsap.fromTo(fa, { xPercent: 0 }, { xPercent: -25, ease: "none", scrollTrigger: { trigger: loc, start: "top top", end: "bottom bottom", scrub: 0.4 } });
          const im = $(".loc__img", loc);
          im && gsap.fromTo(im, { clipPath: "inset(0% 100% 0% 0% round 32px)" }, { clipPath: "inset(0% 0% 0% 0% round 32px)", duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: im, containerAnimation: tw, start: "left 85%", once: true } });
          const svg = $(".loc__path svg", loc);
          if (svg) {
            gsap.fromTo(svg, { clipPath: "inset(-20% 100% -20% 0%)" }, { clipPath: "inset(-20% 0% -20% 0%)", duration: 2.6, ease: "power2.inOut", scrollTrigger: { trigger: ".loc__path-w", containerAnimation: tw, start: "left 60%", once: true } });
            gsap.from($$(".loc__stop", loc), { opacity: 0, y: "+=24", scale: 0.8, duration: 1, stagger: 0.14, ease: SPRING, onComplete: clean, scrollTrigger: { trigger: ".loc__path-w", containerAnimation: tw, start: "left 55%", once: true } });
          }
          return () => { loc.style.height = ""; };
        },
        "(max-width: 991px)": () => {
          const p = $(".loc__path", loc); if (p) p.scrollLeft = (p.scrollWidth - p.clientWidth) / 2;
        },
      });
    }

    // the terrace from above: a scan line turns the blueprint into the render as the page moves
    const aer = $(".aerial");
    if (aer && !reduce) {
      const real = $(".aerial__real", aer), line = $(".aerial__scan", aer), notes = $$(".aerial__note", aer), pic = $(".aerial__pic", aer);
      const st = { p: 0 };
      const paint = () => {
        const p = st.p;
        real.style.clipPath = `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)`;
        line.style.top = (p * 100).toFixed(2) + "%";
        line.style.opacity = p > 0.004 && p < 0.996 ? 1 : 0;
        notes.forEach(n => n.classList.toggle("is-gone", p * 100 > +n.dataset.y - 3));
      };
      paint();
      gsap.timeline({ scrollTrigger: { trigger: aer, start: "top 25%", end: "bottom bottom", scrub: 0.5 } })
        .fromTo(pic, { scale: 1.08 }, { scale: 1, ease: "none", duration: 1 }, 0)
        .to(st, { p: 1, ease: "power1.inOut", duration: 0.85, onUpdate: paint }, 0.08);
      ScrollTrigger.create({ trigger: aer, start: "top 60%", once: true, onEnter: () => aer.classList.add("is-in") });
    }

    // what we do: a light pill springs from line to line as the page passes; then the list grows and fades
    const amen = $(".amen");
    if (amen) {
      const items = $$(".amen__list li", amen), hl = $(".amen__hl", amen);
      let now = -1;
      const place = (k, instant) => {
        const a = $("a", items[k]);
        const to = { x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight, opacity: 1 };
        instant || reduce ? gsap.set(hl, to) : gsap.to(hl, { ...to, duration: 1, ease: "elastic.out(1, 0.6)", overwrite: true });
      };
      ScrollTrigger.create({
        trigger: amen, start: "top 60%", end: "70% bottom",
        onUpdate: s => {
          const n = clamp(Math.floor(s.progress * items.length), 0, items.length - 1);
          if (n === now) return;
          items.forEach((li, k) => { li.classList.toggle("is-on", k <= n); li.classList.toggle("is-cur", k === n); });
          place(n, now < 0); now = n;
        },
      });
      addEventListener("resize", () => { if (now >= 0) place(now, true); });
      if (!reduce) gsap.timeline({ scrollTrigger: { trigger: amen, start: "60% bottom", end: "bottom bottom", scrub: true } })
        .to(".amen__listw", { scale: 1.25, ease: IN }, 0).to(".amen__w", { opacity: 0, ease: IN }, 0);
    }

    // the cream sheet widens to the edges as it rises; the blossom either side moves out
    const rely = $(".rely__sheet");
    if (rely && !reduce) {
      const r = desk() ? 56 : 32;
      gsap.fromTo(rely, { clipPath: `inset(0% 7% 0% 7% round ${r}px ${r}px 0px 0px)` }, { clipPath: `inset(0% 0% 0% 0% round ${r}px ${r}px 0px 0px)`, ease: "none", scrollTrigger: { trigger: ".rely", start: "top bottom", end: "top 15%", scrub: true } });
      if (desk()) gsap.timeline({ scrollTrigger: { trigger: ".rely", start: "top bottom", end: "top top", scrub: true } })
        .fromTo(".flower--arch-l", { xPercent: 14, yPercent: 10, scale: 0.9 }, { xPercent: -4, yPercent: -6, scale: 1.1, ease: "none" }, 0)
        .fromTo(".flower--arch-r", { xPercent: -14, yPercent: 10, scale: 0.9 }, { xPercent: 4, yPercent: -6, scale: 1.1, ease: "none" }, 0);
    }

    // the pair of close-ups drifts apart, the engineering view settles
    if (!reduce) {
      $$(".duo__img").forEach((s, k) => gsap.fromTo(s, { y: k ? "6rem" : "-2rem" }, { y: k ? "-6rem" : "4rem", ease: "none", scrollTrigger: { trigger: ".duo", start: "top bottom", end: "bottom top", scrub: 0.4 } }));
      const eimg = $(".eng__bg img");
      eimg && gsap.fromTo(eimg, { yPercent: -6, scale: 1.1 }, { yPercent: 6, scale: 1, ease: "none", scrollTrigger: { trigger: ".eng", start: "top bottom", end: "bottom top", scrub: 0.4 } });
    }

    // the footer slides up like a sheet: the last view sinks and shrinks under it
    const ftr = $(".ftr"), ctaIn = $(".cta__in");
    if (ftr && ctaIn && !reduce) {
      gsap.timeline({ scrollTrigger: { trigger: ftr, start: "top bottom", end: "top top", scrub: true } })
        .fromTo(ctaIn, { yPercent: 0, scale: 1 }, { yPercent: 42, scale: 0.9, ease: "none" }, 0)
        .fromTo(".cta__ctn", { opacity: 1 }, { opacity: 0, ease: "none", duration: 0.45 }, 0);
    }

    $$("[data-sl]").forEach(slider);

    // on desktop, a slider settles into the screen when the scroll comes to rest near it
    if (lenis) {
      const snaps = $$("[data-snap]"); let t = 0;
      lenis.on("scroll", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (!desk() || d.body.classList.contains("menu-open")) return;
          let best = null, bestK = 0;
          for (const s of snaps) {
            const r = s.getBoundingClientRect(), k = (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.min(s.offsetHeight, innerHeight);
            if (k > 0.55 && k < 0.985 && k > bestK) { bestK = k; best = s; }
          }
          if (best) lenis.scrollTo(best, { duration: 1.2, easing: x => 1 - Math.pow(1 - x, 3) });
        }, 180);
      });
    }
  }

  /* ============================================================ inner pages */
  function inner() {
    const title = $$(".phero__title .split");
    if (!reduce && title.length) {
      gsap.from(title, { yPercent: 105, opacity: 0, duration: 1.2, stagger: 0.06, ease: "back.out(1.4)", delay: 0.2 });
      gsap.from(".crumbs, .phero__lead, .phero__meta", { opacity: 0, y: 26, duration: 1.1, stagger: 0.1, ease: SPRING, delay: 0.4 });
      const ban = $(".phero__banner img");
      ban && gsap.fromTo(ban, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: ".phero__banner", start: "top bottom", end: "bottom top", scrub: true } });
    }
    if (reduce) return;
    // headings and lead paragraphs build in line by line; everything else rises into place on a spring
    $$(".sec-title, .sub-title, .f-title, .lead-p").forEach(el => { el.classList.remove("reveal-up"); el.dataset.reveal = "p"; });
    $$(".reveal-up").forEach(el => { if (!el.dataset.reveal) el.dataset.reveal = "ctn"; });
    $$(".eyebrow").forEach(el => { if (!el.dataset.reveal && !el.children.length) el.dataset.reveal = "label"; });
    $$(".reveal-media").forEach(el => gsap.fromTo(el, { clipPath: "inset(12% 8% 12% 8% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%" } }));
    $$(".timeline").forEach(tl => ScrollTrigger.create({ trigger: tl, start: "top 70%", end: "bottom 70%", scrub: true, onUpdate: s => tl.style.setProperty("--p", s.progress.toFixed(3)) }));
  }

  /* ============================================================ behaviours on every page */
  // inner-page sliders
  $$("[data-slider]").forEach(sl => {
    const slides = $$(".slider__slide", sl), dots = $$(".slider__dot", sl), count = $(".slider__count b", sl);
    let i = 0;
    const go = n => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle("is-active", k === i)); dots.forEach((x, k) => x.classList.toggle("is-active", k === i)); if (count) count.textContent = String(i + 1).padStart(2, "0"); };
    $(".slider__prev", sl)?.addEventListener("click", () => go(i - 1));
    $(".slider__next", sl)?.addEventListener("click", () => go(i + 1));
    dots.forEach((x, k) => x.addEventListener("click", () => go(k)));
    let sx = null;
    sl.addEventListener("pointerdown", e => { if (!e.target.closest("button,a")) sx = e.clientX; });
    sl.addEventListener("pointerup", e => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
    sl.tabIndex = 0; sl.setAttribute("aria-roledescription", "carousel");
    sl.addEventListener("keydown", e => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); });
  });

  // lightbox
  const lb = $(".lightbox");
  let group = [], gi = 0;
  const lbImg = lb && $("img", lb), lbCap = lb && $("figcaption", lb);
  const showLb = () => { const a = group[gi]; lbImg.src = a.getAttribute("href"); lbImg.alt = a.dataset.caption || ""; lbCap.textContent = a.dataset.caption || ""; };
  function closeLightbox() { if (lb && !lb.hidden) { lb.hidden = true; unlock(); } }
  d.addEventListener("click", e => {
    const a = e.target.closest("[data-lightbox]");
    if (!a || !lb) return;
    e.preventDefault();
    group = $$(`[data-lightbox="${a.dataset.lightbox}"]`); gi = group.indexOf(a);
    showLb(); lb.hidden = false; lock(); $(".lightbox__close", lb).focus();
  });
  if (lb) {
    $(".lightbox__close", lb).addEventListener("click", closeLightbox);
    $(".lightbox__prev", lb).addEventListener("click", () => { gi = (gi - 1 + group.length) % group.length; showLb(); });
    $(".lightbox__next", lb).addEventListener("click", () => { gi = (gi + 1) % group.length; showLb(); });
    lb.addEventListener("click", e => { if (e.target === lb) closeLightbox(); });
    addEventListener("keydown", e => { if (lb.hidden) return; if (e.key === "ArrowRight") { gi = (gi + 1) % group.length; showLb(); } if (e.key === "ArrowLeft") { gi = (gi - 1 + group.length) % group.length; showLb(); } });
  }

  // tabs
  $$("[data-tabs]").forEach(t => {
    const btns = $$(".tabs__btn", t), panels = $$(":scope > .tabs__panel", t);
    const sel = k => {
      btns.forEach((b, n) => { b.classList.toggle("is-active", n === k); b.setAttribute("aria-selected", n === k); });
      panels.forEach((p, n) => (p.hidden = n !== k));
      ScrollTrigger.refresh();
      if (!reduce) gsap.fromTo($$(".reveal-up, [data-reveal]", panels[k]), { y: 30, opacity: 0 }, { y: 0, opacity: 1, visibility: "visible", stagger: 0.03, duration: 0.9, ease: SPRING, overwrite: true, onComplete: clean });
    };
    btns.forEach((b, k) => {
      b.addEventListener("click", () => sel(k));
      b.addEventListener("keydown", e => { const s = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (s) { const n = (k + s + btns.length) % btns.length; btns[n].focus(); sel(n); } });
    });
  });

  // YouTube, loaded only when asked for
  d.addEventListener("click", e => {
    const b = e.target.closest("[data-yt]");
    if (!b) return;
    const f = d.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    f.title = b.getAttribute("aria-label") || "YouTube video";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
    b.replaceWith(f);
  });

  // the contact form opens the visitor's email app
  $$("form[data-mailto]").forEach(f => f.addEventListener("submit", e => {
    e.preventDefault();
    const data = [...new FormData(f)].map(([k, v]) => `${k}: ${v}`).join("\n");
    const name = f.querySelector("input")?.value || "website visitor";
    location.href = `mailto:${f.dataset.mailto}?subject=${encodeURIComponent("Website enquiry from " + name)}&body=${encodeURIComponent(data)}`;
  }));

  /* ------------------------------------------------------------ start */
  const start = () => {
    if (reduce) $$("[data-reveal], [data-part]").forEach(visible);
    if (isHome) { if (!reduce) reveals(); home(); }
    else { inner(); if (!reduce) reveals(); petals(desk() ? 12 : 7); }
    marquees(); elastic(); navLine.place();
    if (!reduce) magnetic();
    ScrollTrigger.refresh();
    if (location.hash && location.hash !== "#top") { const el = d.getElementById(decodeURIComponent(location.hash.slice(1))); el && setTimeout(() => scrollTo(el, { immediate: true, offset: -40 }), 300); }
  };
  // line breaks depend on the fonts: wait for them (but not for long)
  Promise.race([d.fonts ? d.fonts.ready : Promise.resolve(), new Promise(ok => setTimeout(ok, 1800))]).then(start);
  addEventListener("load", () => ScrollTrigger.refresh());
})();
