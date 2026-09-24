(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isHome = document.body.classList.contains("home");
  const store = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Split letters ---------- */
  $$(".split").forEach(el => {
    el.innerHTML = [...el.textContent].map(c => `<span class="ch">${c === " " ? "&nbsp;" : c}</span>`).join("");
  });
  $$(".reveal-lines > span").forEach(el => { el.innerHTML = `<span>${el.innerHTML}</span>`; });

  /* ---------- Smooth scroll ---------- */
  const headerOffset = () => -(($("[data-header]")?.offsetHeight || 80) + 12);
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollToEl = (el, immediate) => {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: headerOffset(), duration: immediate ? 0 : 1.4, immediate });
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + headerOffset(), behavior: immediate ? "auto" : "smooth" });
  };
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash || url.hash === "#") return;
    const el = url.hash === "#top" ? document.body : document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!el) return;
    e.preventDefault();
    closeMenu();
    if (url.hash === "#top") lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: "smooth" });
    else { scrollToEl(el); history.replaceState(null, "", url.hash); }
  });

  /* ---------- Header: solid on scroll, hides going down ---------- */
  const header = $("[data-header]");
  let lastY = 0;
  const onScroll = y => {
    if (!header) return;
    header.classList.toggle("is-solid", y > 20 || !isHome);
    const down = y > lastY + 4, up = y < lastY - 4;
    if (down && y > 240 && !document.body.classList.contains("menu-open")) header.classList.add("is-hidden");
    if (up || y < 240) header.classList.remove("is-hidden");
    lastY = y;
  };
  lenis ? lenis.on("scroll", e => onScroll(e.scroll)) : addEventListener("scroll", () => onScroll(scrollY), { passive: true });
  onScroll(scrollY);
  header?.addEventListener("mouseenter", () => header.classList.remove("is-hidden"));

  /* ---------- Overlay menu ---------- */
  const burger = $(".burger"), overlay = $("#overlay-menu");
  function openMenu() {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    burger.setAttribute("aria-expanded", "true");
    $(".burger__label").textContent = "Close";
    document.body.classList.add("menu-open");
    lenis && lenis.stop();
  }
  function closeMenu() {
    if (!overlay || !overlay.classList.contains("is-open")) return;
    overlay.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    $(".burger__label").textContent = "Menu";
    document.body.classList.remove("menu-open");
    lenis && lenis.start();
    setTimeout(() => { if (!overlay.classList.contains("is-open")) overlay.hidden = true; }, 800);
  }
  burger?.addEventListener("click", () => (overlay.classList.contains("is-open") ? closeMenu() : openMenu()));
  addEventListener("keydown", e => { if (e.key === "Escape") { closeMenu(); closeLightbox(); } });
  $$(".om__toggle").forEach(b => b.addEventListener("click", () => {
    const sub = b.closest(".om__item").querySelector(":scope > .om__sub");
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open);
    sub.hidden = !open;
  }));
  overlay?.setAttribute("data-lenis-prevent", "");

  /* ---------- Page transitions ---------- */
  const curtain = $(".curtain");
  if (curtain && !reduce) {
    if (store.get("pt") === "1") {
      curtain.style.transition = "none";
      curtain.classList.add("is-in");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        curtain.style.transition = "";
        curtain.classList.remove("is-in");
        curtain.classList.add("is-out");
      }));
      store.set("pt", "0");
    }
    document.addEventListener("click", e => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.dataset.lightbox !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /\.(pdf|png|jpe?g|webp|gif)$/i.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      store.set("pt", "1");
      curtain.classList.remove("is-out");
      curtain.classList.add("is-in");
      setTimeout(() => { location.href = url.href; }, 480);
    });
    addEventListener("pageshow", e => { if (e.persisted) { curtain.classList.remove("is-in"); curtain.classList.add("is-out"); } });
  }

  /* ---------- Sliders ---------- */
  $$("[data-slider]").forEach(sl => {
    const slides = $$(".slider__slide", sl), dots = $$(".slider__dot", sl), count = $(".slider__count b", sl);
    let i = 0;
    const go = n => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle("is-active", k === i));
      dots.forEach((d, k) => d.classList.toggle("is-active", k === i));
      if (count) count.textContent = String(i + 1).padStart(2, "0");
    };
    $(".slider__prev", sl)?.addEventListener("click", () => go(i - 1));
    $(".slider__next", sl)?.addEventListener("click", () => go(i + 1));
    dots.forEach((d, k) => d.addEventListener("click", () => go(k)));
    let sx = null;
    sl.addEventListener("pointerdown", e => { if (!e.target.closest("button,a")) sx = e.clientX; });
    sl.addEventListener("pointerup", e => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
    sl.tabIndex = 0;
    sl.setAttribute("aria-roledescription", "carousel");
    sl.addEventListener("keydown", e => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); });
  });

  /* ---------- Lightbox ---------- */
  const lb = $(".lightbox");
  let group = [], gi = 0;
  const lbImg = lb && $("img", lb), lbCap = lb && $("figcaption", lb);
  const showLb = () => { const a = group[gi]; lbImg.src = a.getAttribute("href"); lbImg.alt = a.dataset.caption || ""; lbCap.textContent = a.dataset.caption || ""; };
  function closeLightbox() { if (lb && !lb.hidden) { lb.hidden = true; lenis && lenis.start(); } }
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-lightbox]");
    if (!a || !lb) return;
    e.preventDefault();
    group = $$(`[data-lightbox="${a.dataset.lightbox}"]`);
    gi = group.indexOf(a);
    showLb(); lb.hidden = false; lenis && lenis.stop();
    $(".lightbox__close", lb).focus();
  });
  if (lb) {
    $(".lightbox__close", lb).addEventListener("click", closeLightbox);
    $(".lightbox__prev", lb).addEventListener("click", () => { gi = (gi - 1 + group.length) % group.length; showLb(); });
    $(".lightbox__next", lb).addEventListener("click", () => { gi = (gi + 1) % group.length; showLb(); });
    lb.addEventListener("click", e => { if (e.target === lb) closeLightbox(); });
    addEventListener("keydown", e => {
      if (lb.hidden) return;
      if (e.key === "ArrowRight") { gi = (gi + 1) % group.length; showLb(); }
      if (e.key === "ArrowLeft") { gi = (gi - 1 + group.length) % group.length; showLb(); }
    });
  }

  /* ---------- Tabs ---------- */
  $$("[data-tabs]").forEach(t => {
    const btns = $$(".tabs__btn", t), panels = $$(":scope > .tabs__panel", t);
    const sel = k => {
      btns.forEach((b, n) => { b.classList.toggle("is-active", n === k); b.setAttribute("aria-selected", n === k); });
      panels.forEach((p, n) => (p.hidden = n !== k));
      ScrollTrigger.refresh();
      const fresh = $$(".reveal-up", panels[k]);
      if (!reduce) gsap.fromTo(fresh, { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.03, duration: 0.7, ease: "expo.out", overwrite: true });
    };
    btns.forEach((b, k) => {
      b.addEventListener("click", () => sel(k));
      b.addEventListener("keydown", e => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (d) { const n = (k + d + btns.length) % btns.length; btns[n].focus(); sel(n); }
      });
    });
  });

  /* ---------- Lite YouTube ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-yt]");
    if (!b) return;
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    f.title = b.getAttribute("aria-label") || "YouTube video";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    b.replaceWith(f);
  });

  /* ---------- Contact form → email ---------- */
  $$("form[data-mailto]").forEach(f => f.addEventListener("submit", e => {
    e.preventDefault();
    const data = [...new FormData(f)].map(([k, v]) => `${k}: ${v}`).join("\n");
    const name = f.querySelector("input")?.value || "website visitor";
    location.href = `mailto:${f.dataset.mailto}?subject=${encodeURIComponent("Website enquiry from " + name)}&body=${encodeURIComponent(data)}`;
  }));

  /* ---------- Product view toggle (home) ---------- */
  const list = $("#plist");
  if (list) {
    const btns = $$(".toggle__btn"), pill = $(".toggle__pill");
    const placePill = b => { pill.style.width = b.offsetWidth + "px"; pill.style.transform = `translateX(${b.offsetLeft - 4}px)`; };
    placePill($(".toggle__btn.is-active"));
    addEventListener("resize", () => placePill($(".toggle__btn.is-active")));
    btns.forEach(b => b.addEventListener("click", () => {
      if (b.classList.contains("is-active")) return;
      btns.forEach(o => { o.classList.toggle("is-active", o === b); o.setAttribute("aria-selected", o === b); });
      placePill(b);
      const swap = () => { list.className = "plist is-" + b.dataset.view; ScrollTrigger.refresh(); };
      if (reduce) return swap();
      gsap.to(list, { opacity: 0, y: 20, duration: 0.3, ease: "power2.in", onComplete: () => {
        swap();
        gsap.set(list, { opacity: 1, y: 0 });
        gsap.fromTo(list.children, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: "expo.out" });
      }});
    }));
  }

  /* ---------- Hash on load ---------- */
  const jumpToHash = () => {
    if (!location.hash || location.hash === "#top") return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) scrollToEl(el, true);
  };

  /* =========================================================
     Motion (skipped for reduced-motion users)
     ========================================================= */
  if (reduce) {
    $(".loader")?.remove();
    addEventListener("load", jumpToHash);
    return;
  }

  /* ---------- Liquid / black-hole mouse effect (fluid.js) ---------- */
  const fluidMade = new WeakSet();
  let fluidCount = 0;
  const FLUID_MAX = 14;
  function makeFluid(host, src, o) {
    if (!window.FluidLens || fluidMade.has(host) || fluidCount >= FLUID_MAX) return;
    fluidMade.add(host);
    try { new FluidLens(host, src, o); fluidCount++; } catch (e) { console.warn("FluidLens off:", e); }
  }
  const sameOrigin = im => { try { return new URL(im.currentSrc || im.src, location.href).origin === location.origin; } catch (e) { return false; } };
  function lazyFluid(host, opts) {
    const im = host.querySelector("img");
    if (!im || !sameOrigin(im)) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const go = () => makeFluid(host, im, opts);
      im.complete && im.naturalWidth ? go() : im.addEventListener("load", go, { once: true });
    }, { rootMargin: "200px" });
    io.observe(host);
  }
  function setupFluid() {
    if (!window.FluidLens) return;
    $$(".panel__bg").forEach(h => lazyFluid(h, { strength: 0.05, rgb: 0.8, radius: 0.2 }));
    $$("[data-fluid]").forEach(h => lazyFluid(h, { strength: 0.05, rgb: 0.9 }));

    const title = $(".hero__title");
    if (!title) return;
    const chars = $$(".ch", title);
    const src = document.createElement("canvas");
    const ctx = src.getContext("2d");
    let key = "";
    makeFluid(title, src, {
      strength: 0.05, rgb: 1.1, lens: 0.8, radius: 0.16, transparent: true,
      onResize: inst => { src.width = inst.canvas.width; src.height = inst.canvas.height; key = ""; },
      update: inst => {
        const k = scrollY + "|" + inst.w;
        if (k === key) return false;
        key = k;
        const tr = title.getBoundingClientRect(), cs = getComputedStyle(title), d = inst.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, src.width, src.height);
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.fillStyle = "#0b0b0c";
        chars.forEach(ch => {
          const r = ch.getBoundingClientRect();
          const t = ch.textContent.toUpperCase();
          const m = ctx.measureText(t);
          const A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
          ctx.fillText(t, r.left - tr.left, r.top - tr.top + (r.height - (A + D)) / 2 + A);
        });
        return true;
      }
    });
  }

  /* ---------- Generic scroll reveals ---------- */
  function reveals() {
    gsap.set(".reveal-up", { opacity: 0, y: 40 });
    ScrollTrigger.batch(".reveal-up", {
      start: "top 92%", once: true,
      onEnter: els => gsap.to(els.filter(el => !el.closest("[hidden]")), { y: 0, opacity: 1, duration: 1, stagger: 0.06, ease: "expo.out", overwrite: true })
    });
    // items inside hidden tab panels are revealed when their tab opens
    $$("[hidden] .reveal-up").forEach(el => gsap.set(el, { opacity: 1, y: 0 }));

    $$(".reveal-media").forEach(el => gsap.fromTo(el, { clipPath: "inset(10% 10% 10% 10% round 6px)" }, {
      clipPath: "inset(0% 0% 0% 0% round 6px)", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%" }
    }));
    $$(".reveal-lines").forEach(el => gsap.from(el.querySelectorAll(":scope > span > span"), {
      yPercent: 105, duration: 1.1, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%" }
    }));
    $$(".reveal").forEach(el => gsap.from(el, { y: 40, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } }));

    $$(".timeline").forEach(tl => ScrollTrigger.create({
      trigger: tl, start: "top 70%", end: "bottom 70%", scrub: true,
      onUpdate: s => tl.style.setProperty("--p", s.progress.toFixed(3))
    }));
    $$(".phero__banner img").forEach(im => gsap.fromTo(im, { yPercent: -5 }, { yPercent: 5, ease: "none", scrollTrigger: { trigger: im.parentElement, start: "top bottom", end: "bottom top", scrub: true } }));

    const big = $(".contact__big");
    if (big) gsap.from($$(".ch", big), { yPercent: 110, stagger: 0.05, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: big, start: "top 85%" } });
    addEventListener("load", () => ScrollTrigger.refresh());
  }

  /* ---------- Inner page intro ---------- */
  function innerIntro() {
    const tl = gsap.timeline({ onComplete: setupFluid });
    tl.from(".crumbs", { y: 20, opacity: 0, duration: 0.8, ease: "expo.out" })
      .from(".phero__title .ch", { yPercent: 110, duration: 1.1, stagger: 0.02, ease: "expo.out" }, "<0.05")
      .from(".phero__lead, .phero__meta", { y: 30, opacity: 0, duration: 0.9, stagger: 0.1, ease: "expo.out" }, "<0.3");
    if ($(".phero__banner")) {
      tl.from(".phero__banner", { clipPath: "inset(30% 8% 0% 8% round 6px)", duration: 1.5, ease: "expo.out" }, "<0.1")
        .from(".phero__banner img", { scale: 1.25, duration: 1.8, ease: "expo.out" }, "<");
    }
    reveals();
    addEventListener("load", jumpToHash);
    setTimeout(jumpToHash, 350);
  }

  /* ---------- Home ---------- */
  function home() {
    const loader = $(".loader"), num = $(".loader__num");
    const intro = () => {
      const tl = gsap.timeline({ onComplete: () => { document.body.classList.remove("is-loading"); lenis && lenis.start(); setupFluid(); } });
      if (loader) tl.to(loader, { clipPath: "inset(0 0 100% 0)", duration: 1, ease: "expo.inOut" }).set(loader, { display: "none" });
      tl.from(".hero__title .ch", { yPercent: 110, duration: 1.1, stagger: 0.04, ease: "expo.out" }, loader ? "-=0.45" : 0)
        .from(".badge", { scale: 0, rotate: -180, duration: 1.2, ease: "expo.out" }, "<0.2")
        .from(".site-header", { yPercent: -100, opacity: 0, duration: 0.9, ease: "expo.out", clearProps: "transform,opacity" }, "<0.2")
        .from(".hero__eyebrow, .hero__intro > *, .hero__scroll", { y: 30, opacity: 0, duration: 0.9, stagger: 0.08, ease: "expo.out" }, "<0.1")
        .from(".stage", { y: 60, opacity: 0, duration: 1.2, ease: "expo.out" }, "<0.1");
    };
    if (loader && store.get("seenLoader") !== "1") {
      store.set("seenLoader", "1");
      document.body.classList.add("is-loading");
      lenis && lenis.stop();
      loader.style.clipPath = "inset(0 0 0% 0)";
      const counter = { v: 0 };
      gsap.timeline()
        .to(counter, { v: 100, duration: 1.6, ease: "power2.inOut", onUpdate: () => (num.textContent = Math.round(counter.v)) })
        .to(".loader__bar span", { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0)
        .add(intro, "+=0.1");
    } else {
      loader?.remove();
      intro();
    }

    const badge = $(".badge > svg:first-child");
    let rot = 0, boost = 0;
    gsap.ticker.add(() => { boost *= 0.92; rot += 0.25 + boost; if (badge) badge.style.transform = `rotate(${rot}deg)`; });

    gsap.to(".hero__title .line:first-child", { xPercent: -8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__title .line--indent", { xPercent: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".badge", { y: -120, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

    // first scroll: the robot rises as a blueprint, a scan converts it to the render, then it flies past
    const wf = $(".warp__frame"), wPct = $(".warp__pct"), wMode = $(".warp__mode");
    const scan = { p: 0 };
    const paintScan = () => {
      if (!wf) return;
      const p = scan.p, pct = Math.round(p * 100);
      wf.style.setProperty("--scan", (p * 100).toFixed(2) + "%");
      wf.style.setProperty("--scan-on", pct > 0 && pct < 100 ? 1 : 0);
      if (wPct) wPct.textContent = "Scan " + String(pct).padStart(3, "0") + "%";
      if (wMode) wMode.textContent = pct === 0 ? "Blueprint" : pct === 100 ? "Render" : "Scanning";
    };
    paintScan();
    gsap.timeline({ scrollTrigger: { trigger: ".warp", start: "top top", end: "bottom bottom", scrub: 1 } })
      .fromTo(".warp__img", { scale: 0.55, rotateX: 28, rotateZ: -6, skewY: 2, yPercent: 40 }, { scale: 1, rotateX: 0, rotateZ: 0, skewY: 0, yPercent: 0, ease: "power2.out", duration: 1 }, 0)
      .to(scan, { p: 1, ease: "none", duration: 0.8, onUpdate: paintScan }, 0.6)
      .to(".warp__img", { scale: 1.5, opacity: 0, ease: "power2.in", duration: 0.6 }, 1.55)
      .fromTo(".warp__text span:first-child", { xPercent: -20 }, { xPercent: 20, ease: "none", duration: 2.15 }, 0)
      .fromTo(".warp__text span:last-child", { xPercent: 20 }, { xPercent: -20, ease: "none", duration: 2.15 }, 0);

    gsap.fromTo(".intro__shot", { yPercent: 8 }, { yPercent: -8, ease: "none", stagger: 0.1, scrollTrigger: { trigger: ".intro__gallery", start: "top bottom", end: "bottom top", scrub: true } });

    const track = $(".marquee__track");
    let x = 0, dir = -1, vel = 0;
    ScrollTrigger.create({ onUpdate: s => { const v = s.getVelocity(); dir = v > 0 ? -1 : v < 0 ? 1 : dir; vel = Math.min(Math.abs(v) / 200, 8); boost = Math.min(Math.abs(v) / 400, 3); } });
    gsap.ticker.add(() => {
      if (!track) return;
      vel *= 0.94; x += dir * (1.2 + vel);
      const w = track.firstElementChild.offsetWidth;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      track.style.transform = `translate3d(${x}px,0,0)`;
    });
    gsap.fromTo(".marquee__row i", { rotate: 0 }, { rotate: 360, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: true } });

    const panels = $$(".panel");
    panels.forEach((p, i) => {
      gsap.fromTo(p.querySelector(".panel__bg"), { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
      gsap.from(p.querySelectorAll(".panel__body > *"), { y: 60, opacity: 0, stagger: 0.07, duration: 1, ease: "expo.out", scrollTrigger: { trigger: p, start: "top 55%" } });
      if (i < panels.length - 1) gsap.fromTo(p, { scale: 1, borderRadius: 0, filter: "brightness(1)" }, {
        scale: 0.94, borderRadius: 14, filter: "brightness(.5)", ease: "none",
        scrollTrigger: { trigger: panels[i + 1], start: "top bottom", end: "top top", scrub: true }
      });
    });
    gsap.from("#plist > li", { y: 50, opacity: 0, stagger: 0.06, duration: 1, ease: "expo.out", scrollTrigger: { trigger: "#plist", start: "top 85%" } });
    reveals();
  }

  isHome ? home() : innerIntro();

  /* ---------- Cursor, hover preview, magnetic (mouse only) ---------- */
  if (!fine) return;
  const cursor = $(".cursor"), dot = $(".cursor-dot"), hImg = $(".hover-img");
  const hImgEl = hImg && $("img", hImg);
  const m = { x: innerWidth / 2, y: innerHeight / 2 }, c = { ...m }, h = { ...m };
  let prevX = m.x;
  addEventListener("mousemove", e => { m.x = e.clientX; m.y = e.clientY; }, { passive: true });
  gsap.ticker.add(() => {
    c.x += (m.x - c.x) * 0.18; c.y += (m.y - c.y) * 0.18;
    h.x += (m.x - h.x) * 0.1; h.y += (m.y - h.y) * 0.1;
    const tilt = Math.max(-12, Math.min(12, (m.x - prevX) * 0.6));
    prevX += (m.x - prevX) * 0.2;
    cursor.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
    dot.style.transform = `translate3d(${m.x}px,${m.y}px,0)`;
    if (hImg) { hImg.style.left = h.x + 24 + "px"; hImg.style.top = h.y - 110 + "px"; hImg.style.rotate = tilt + "deg"; }
  });
  document.addEventListener("mouseover", e => {
    cursor.classList.toggle("is-hover", !!e.target.closest("a, button, [data-lightbox], [data-yt]"));
    const view = e.target.closest(".gallery__item, .photo a, a.card, .video__frame, .warp__frame");
    cursor.classList.toggle("is-view", !!view && !e.target.closest(".pitem"));
    if (view) $(".cursor__label", cursor).textContent = view.matches(".video__frame") ? "Play" : "View";
  });
  $$(".pitem").forEach(li => {
    li.addEventListener("mouseenter", () => {
      if (list && list.classList.contains("is-list") && hImg) {
        const bp = hImg.querySelector(".bpx__bp"), ph = hImg.querySelector(".bpx__photo");
        if (bp && ph) { bp.src = li.dataset.bp || li.dataset.img; ph.src = li.dataset.photo || li.dataset.img; }
        else hImgEl.src = li.dataset.img;
        hImg.classList.remove("is-on"); void hImg.offsetWidth; hImg.classList.add("is-on");
      }
      else { $(".cursor__label", cursor).textContent = "View"; cursor.classList.add("is-view"); }
    });
    li.addEventListener("mouseleave", () => { hImg?.classList.remove("is-on"); cursor.classList.remove("is-view"); });
  });
  $$("[data-magnetic]").forEach(el => {
    const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    el.addEventListener("mousemove", e => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * 0.3); yTo((e.clientY - r.top - r.height / 2) * 0.3); });
    el.addEventListener("mouseleave", () => { xTo(0); yTo(0); });
  });
})();
