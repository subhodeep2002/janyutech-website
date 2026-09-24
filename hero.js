/*
 * Home hero
 *  – pointer parallax across layered depths
 *  – blueprint stage: each robot draws in as a blueprint, a scan line converts it
 *    to the photo, then back; a probe lens under the pointer shows the other layer
 *  – blue blossom branches in two corners that sway, react to the pointer and drop
 *    petals when brushed; petals fall on a canvas with a little wind physics
 */
(() => {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);

  let heroVisible = true;
  new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(hero);

  /* ------------------------------------------------ pointer state */
  const P = { x: -9999, y: -9999, vx: 0, vy: 0, nx: 0, ny: 0, inside: false, t: 0 };
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (P.inside) { P.vx = x - P.x; P.vy = y - P.y; }
    P.x = x; P.y = y; P.inside = true;
    P.nx = (x / r.width) * 2 - 1; P.ny = (y / r.height) * 2 - 1;
    P.t = performance.now();
  }, { passive: true });
  hero.addEventListener("pointerleave", () => { P.inside = false; P.nx = 0; P.ny = 0; });

  /* ------------------------------------------------ parallax */
  if (fine && !reduce) {
    const layers = $$("[data-depth]", hero).map(el => ({
      el, d: parseFloat(el.dataset.depth),
      x: gsap.quickTo(el, "x", { duration: 1.2, ease: "power3.out" }),
      y: gsap.quickTo(el, "y", { duration: 1.2, ease: "power3.out" })
    }));
    const frame = $(".stage__frame");
    const rx = gsap.quickTo(frame, "rotationX", { duration: 1.2, ease: "power3.out" });
    const ry = gsap.quickTo(frame, "rotationY", { duration: 1.2, ease: "power3.out" });
    gsap.ticker.add(() => {
      if (!heroVisible) return;
      layers.forEach(l => { l.x(-P.nx * l.d * 28); l.y(-P.ny * l.d * 18); });
      rx(P.ny * -3.5); ry(P.nx * 5);
    });
  }

  /* ------------------------------------------------ blueprint stage */
  const stage = $("[data-stage]");
  const frame = $(".stage__frame", stage);
  const items = $$(".stage__item", stage);
  const pages = $$(".stage__page", stage);
  const modeEl = $(".stage__mode", stage), figEl = $(".stage__fig", stage), xyEl = $(".stage__xy", stage);
  const nameEl = $(".stage__name", stage), catEl = $(".stage__cat", stage);
  const S = { scan: 0, draw: 0, lr: 0, scanOn: 0 };
  let cur = 0, mode = "bp", tl = null, hovering = false;

  const paint = () => {
    frame.style.setProperty("--scan", S.scan + "%");
    frame.style.setProperty("--scan-on", S.scanOn);
    frame.style.setProperty("--lr", S.lr + "px");
    items[cur].querySelector(".stage__bp").style.setProperty("--draw", S.draw + "%");
  };
  const setMode = m => {
    mode = m;
    modeEl.textContent = m === "bp" ? "Blueprint" : m === "scan" ? "Scanning" : "Render";
    const xr = items[cur].querySelector(".stage__xray");
    xr.src = m === "photo" ? xr.dataset.bp : xr.dataset.photo;   // the lens always shows the other layer
  };
  const label = k => {
    const it = items[k];
    figEl.textContent = "FIG. " + String(k + 1).padStart(2, "0");
    catEl.textContent = it.dataset.cat;
    nameEl.innerHTML = `${it.dataset.name} <i>→</i>`;
    nameEl.href = it.dataset.href;
    pages.forEach((p, i) => { p.classList.toggle("is-active", i === k); p.style.setProperty("--p", i < k ? 1 : 0); });
  };

  function play(k) {
    tl && tl.kill();
    items[cur].classList.remove("is-active");
    cur = (k + items.length) % items.length;
    items[cur].classList.add("is-active");
    label(cur);
    const page = pages[cur];
    Object.assign(S, { scan: 0, draw: 100, scanOn: 0 });
    setMode("bp"); paint();
    if (reduce) { S.scan = 100; S.draw = 0; setMode("photo"); paint(); return; }
    tl = gsap.timeline({ onUpdate: paint, onComplete: () => play(cur + 1) })
      .to(S, { draw: 0, duration: 1.3, ease: "power2.inOut" })                                  // blueprint draws in
      .add(() => setMode("scan"), "+=0.5")
      .to(S, { scanOn: 1, duration: 0.2 })
      .to(S, { scan: 100, duration: 1.8, ease: "power2.inOut" }, "<")                            // scan converts to photo
      .to(S, { scanOn: 0, duration: 0.3 })
      .add(() => setMode("photo"))
      .fromTo(page, { "--p": 0 }, { "--p": 1, duration: 3.6, ease: "none" }, "<")                 // hold, progress bar
      .add(() => setMode("scan"))
      .to(S, { scanOn: 1, duration: 0.2 })
      .to(S, { scan: 0, duration: 1.2, ease: "power2.inOut" }, "<")                              // back to blueprint
      .to(S, { scanOn: 0, duration: 0.3 })
      .add(() => setMode("bp"))
      .to({}, { duration: 0.5 });
    if (hovering) tl.pause();
  }
  pages.forEach((p, i) => p.addEventListener("click", () => play(i)));
  frame.addEventListener("click", () => { location.href = items[cur].dataset.href; });

  // probe lens + CAD crosshair
  const lensTo = gsap.quickTo(S, "lr", { duration: 0.6, ease: "power3.out", onUpdate: paint });
  frame.addEventListener("pointerenter", () => { hovering = true; tl && tl.pause(); frame.classList.add("is-probing"); lensTo(fine ? 110 : 0); });
  frame.addEventListener("pointerleave", () => { hovering = false; tl && tl.resume(); frame.classList.remove("is-probing"); lensTo(0); });
  frame.addEventListener("pointermove", e => {
    const r = frame.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    frame.style.setProperty("--lx", x * 100 + "%");
    frame.style.setProperty("--ly", y * 100 + "%");
    xyEl.textContent = `X ${x.toFixed(3)} · Y ${y.toFixed(3)}`;
  }, { passive: true });

  play(0);

  /* ------------------------------------------------ branches */
  const NS = "http://www.w3.org/2000/svg";
  const blossoms = [], twigs = [];
  let seed = 7;
  const srand = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent && parent.appendChild(el); return el; };
  const PETAL = "M0 0 C -5 -4 -6 -12 0 -17 C 6 -12 5 -4 0 0 Z";

  function blossom(parent, x, y, r, svg) {
    const g = mk("g", { class: "bl", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${srand(0, 72).toFixed(0)}) scale(${(r / 17).toFixed(2)})` }, parent);
    const petals = [];
    for (let i = 0; i < 5; i++) petals.push(mk("path", { d: PETAL, transform: `rotate(${i * 72})`, fill: "url(#bl-grad)", stroke: "#0f3d8f", "stroke-width": ".6", opacity: ".96" }, g));
    mk("circle", { r: 3.4, fill: "#0b2e6e" }, g);
    for (let i = 0; i < 6; i++) { const a = i * 60 + 30; mk("circle", { cx: (Math.cos(a * Math.PI / 180) * 5.2).toFixed(1), cy: (Math.sin(a * Math.PI / 180) * 5.2).toFixed(1), r: 0.9, fill: "#dbe8ff" }, g); }
    blossoms.push({ g, petals, left: 5, cool: 0, svg, r });
  }
  function bud(parent, x, y) { mk("ellipse", { cx: x.toFixed(1), cy: y.toFixed(1), rx: 3.2, ry: 4.6, fill: "#3b82f6", stroke: "#0f3d8f", "stroke-width": ".6", transform: `rotate(${srand(-40, 40).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` }, parent); }
  function leaf(parent, x, y, ang) {
    const a = ang * 180 / Math.PI + srand(-50, 50);
    mk("path", { d: "M0 0 C 6 -5 16 -5 22 0 C 16 5 6 5 0 0 Z", fill: "#1e4fa8", opacity: ".85", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(0)}) scale(${srand(0.7, 1.1).toFixed(2)})` }, parent);
  }
  function qpt(x0, y0, cx, cy, x1, y1, t) {
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
  }
  function grow(parent, x, y, ang, len, w, depth, svg, droop) {
    const g = mk("g", {}, parent);
    const bend = srand(-0.35, 0.35);
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    const cx = x + Math.cos(ang + bend) * len * 0.55, cy = y + Math.sin(ang + bend) * len * 0.55;
    mk("path", { class: "br-stroke", d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, "stroke-width": w.toFixed(2) }, g);
    twigs.push({ g, x, y, phase: srand(0, 6.28), amp: 0.35 + (4 - depth) * 0.35, kick: 0 });
    if (depth > 0) {
      const n = depth >= 3 ? 2 : Math.round(srand(1, 2));
      for (let i = 0; i < n; i++) {
        const t = srand(0.45, 1);
        const [px, py] = qpt(x, y, cx, cy, x1, y1, t);
        const side = i % 2 ? 1 : -1;
        grow(g, px, py, ang + side * srand(0.3, 0.75) + droop, len * srand(0.58, 0.78), Math.max(0.8, w * 0.62), depth - 1, svg, droop);
      }
      if (depth <= 2 && srand(0, 1) > 0.35) { const [px, py] = qpt(x, y, cx, cy, x1, y1, srand(0.3, 0.9)); leaf(g, px, py, ang); }
    }
    if (depth === 0) {
      blossom(g, x1, y1, srand(15, 20), svg);
      if (srand(0, 1) > 0.6) { const [bx, by] = qpt(x, y, cx, cy, x1, y1, srand(0.35, 0.7)); bud(g, bx, by); }
    } else if (depth === 1 && srand(0, 1) > 0.5) {
      const [bx, by] = qpt(x, y, cx, cy, x1, y1, srand(0.4, 0.8));
      blossom(g, bx, by, srand(12, 15), svg);
    }
  }
  function buildBranch(host, corner) {
    const svg = mk("svg", { viewBox: corner === "tl" ? "0 0 600 260" : "0 0 600 360", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    const defs = mk("defs", {}, svg);
    const lg = mk("linearGradient", { id: "bl-grad", x1: "0", y1: "0", x2: "0", y2: "-1", gradientUnits: "objectBoundingBox" }, defs);
    mk("stop", { offset: "0", "stop-color": "#1d4fc4" }, lg);
    mk("stop", { offset: ".55", "stop-color": "#4f8ff7" }, lg);
    mk("stop", { offset: "1", "stop-color": "#bcd6ff" }, lg);
    const root = mk("g", {}, svg);
    if (corner === "tl") { seed = 11; grow(root, -10, 18, 0.14, 250, 6.5, 3, svg, 0.16); grow(root, -10, 40, 0.55, 120, 4, 2, svg, 0.12); }
    else { seed = 23; grow(root, 610, 350, -2.78, 230, 6.5, 3, svg, -0.14); grow(root, 610, 320, -2.25, 110, 4, 2, svg, -0.1); }
    host.appendChild(svg);
    return svg;
  }
  $$("[data-branch]", hero).forEach(h => buildBranch(h, h.dataset.branch));

  // intro: branches draw in
  if (!reduce) {
    $$(".br-stroke", hero).forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
    gsap.to($$(".br-stroke", hero), { strokeDashoffset: 0, duration: 1.6, ease: "power2.out", stagger: 0.012, delay: 0.4 });
    gsap.from(blossoms.map(b => b.g), { scale: 0, transformOrigin: "50% 50%", duration: 0.9, ease: "back.out(2)", stagger: 0.02, delay: 1.1 });
  }

  /* ------------------------------------------------ petals canvas */
  const cvs = $(".petals", hero);
  const ctx = cvs.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.offsetWidth; H = hero.offsetHeight;
    cvs.width = W * dpr; cvs.height = H * dpr;
  };
  resize(); addEventListener("resize", resize);
  const COLORS = ["#1d6ae5", "#3b82f6", "#5b9bff", "#8fbaff", "#2a5fd0", "#b7d2ff"];
  const petals = [];
  const MAX = fine ? 160 : 60;

  function spawn(x, y, vx = 0, vy = 0) {
    if (petals.length >= MAX) petals.shift();
    petals.push({ x, y, vx: vx + rand(-0.6, 0.6), vy: vy + rand(-0.8, 0.2), rot: rand(0, 6.28), vr: rand(-0.05, 0.05),
                  flip: rand(0, 6.28), vf: rand(0.04, 0.1), s: rand(5, 9), c: COLORS[(Math.random() * COLORS.length) | 0], sway: rand(0, 6.28) });
  }
  const heroRect = () => hero.getBoundingClientRect();
  function blossomCenter(b) {
    const r = b.g.getBoundingClientRect(), hr = heroRect();
    return { x: r.left + r.width / 2 - hr.left, y: r.top + r.height / 2 - hr.top, rad: Math.max(r.width, r.height) / 2 };
  }
  function strip(b, speed) {
    const now = performance.now();
    if (now < b.cool || b.left === 0) return;
    b.cool = now + 220;
    const c = blossomCenter(b);
    const n = Math.min(b.left, 1 + Math.floor(speed / 9));
    for (let i = 0; i < n; i++) {
      const pe = b.petals[5 - b.left];
      b.left--;
      gsap.to(pe, { opacity: 0, duration: 0.25 });
      spawn(c.x + rand(-6, 6), c.y + rand(-6, 6), P.vx * 0.22, P.vy * 0.12 - 0.4);
    }
    gsap.fromTo(b.g, { rotation: 0 }, { rotation: rand(-18, 18), duration: 0.6, ease: "elastic.out(1.2, 0.3)", transformOrigin: "50% 50%", yoyo: true, repeat: 1 });
    if (b.left === 0) setTimeout(() => {                                    // blossoms regrow
      b.left = 5;
      gsap.fromTo(b.petals, { opacity: 0, scale: 0.2, transformOrigin: "0 0" }, { opacity: 0.96, scale: 1, duration: 1.2, ease: "back.out(1.6)", stagger: 0.08 });
    }, rand(5000, 8000));
  }

  let lastAmbient = 0, wind = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    if (!heroVisible || document.hidden) return;

    // pointer energy decays; it also becomes wind
    const speed = Math.hypot(P.vx, P.vy);
    wind += (P.vx * 0.02 - wind) * 0.05;
    P.vx *= 0.85; P.vy *= 0.85;

    // twig sway (+ kicks from brushing)
    if (!reduce) for (const tw of twigs) {
      tw.kick *= 0.94;
      const a = Math.sin(t * 0.0011 + tw.phase) * tw.amp + wind * tw.amp * 1.5 + Math.sin(t * 0.02 + tw.phase) * tw.kick;
      tw.g.setAttribute("transform", `rotate(${a.toFixed(3)} ${tw.x.toFixed(1)} ${tw.y.toFixed(1)})`);
    }

    // brushing the branches strips petals
    if (!reduce && P.inside && speed > 1.2 && performance.now() - P.t < 80) {
      for (const b of blossoms) {
        const c = blossomCenter(b);
        const d = Math.hypot(c.x - P.x, c.y - P.y);
        if (d < c.rad + 18) {
          strip(b, speed);
          for (const tw of twigs) if (tw.g.contains(b.g)) tw.kick = Math.min(6, tw.kick + speed * 0.08);
        }
      }
    }

    // ambient drift from random blossoms
    if (!reduce && t - lastAmbient > (fine ? 900 : 1500)) {
      lastAmbient = t;
      const b = blossoms[(Math.random() * blossoms.length) | 0];
      if (b) { const c = blossomCenter(b); spawn(c.x, c.y, rand(-0.2, 0.4), 0); }
    }

    // simulate + draw
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.vy = Math.min(p.vy + 0.018, 1.25);
      p.vx += Math.sin(t * 0.0015 + p.sway) * 0.012 + wind * 0.02;
      if (P.inside) {                                         // the pointer blows nearby petals
        const dx = p.x - P.x, dy = p.y - P.y, d2 = dx * dx + dy * dy;
        if (d2 < 5000) { p.vx += P.vx * 0.04; p.vy += P.vy * 0.03; }
      }
      p.vx *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.flip += p.vf;
      if (p.y > H + 20 || p.x < -40 || p.x > W + 40) { petals.splice(i, 1); continue; }
      const sx = Math.cos(p.flip);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sx, 1);
      ctx.globalAlpha = 0.55 + Math.abs(sx) * 0.4;
      ctx.fillStyle = p.c;
      const s = p.s;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.6, s * 0.8, 0, s);
      ctx.bezierCurveTo(-s * 0.6, s * 0.8, -s * 0.9, -s * 0.5, 0, -s);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke();
      ctx.restore();
    }
  }
  if (!reduce) requestAnimationFrame(tick);
})();
