/*
 * Home landing: a black canvas with a light grid, blossom branches in two
 * corners, and petals and leaves drifting down across the whole screen.
 *  – wind: a slow breeze plus gusts every few seconds. Every twig hangs on a
 *    damped spring, so thin tips whip while the thick limbs sway, and gusts
 *    shake petals and leaves loose
 *  – pointer: parallax across five depths; it stirs the falling petals into
 *    eddies, and brushing a branch knocks it about and strips its blossoms
 *  – petals and leaves tumble in 3D (their back faces are a different shade)
 *    on three depth layers, the nearest ones soft-focused
 */
(() => {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = x => x * x * (3 - 2 * x);

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);

  /* ------------------------------------------------ pointer */
  const P = { x: -9999, y: -9999, px: 0, py: 0, vx: 0, vy: 0, speed: 0, nx: 0, ny: 0, sx: 0, sy: 0, inside: false };
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    P.x = e.clientX - r.left; P.y = e.clientY - r.top;
    P.nx = clamp(P.x / r.width * 2 - 1, -1, 1); P.ny = clamp(P.y / r.height * 2 - 1, -1, 1);
    if (!P.inside) { P.px = P.x; P.py = P.y; }
    P.inside = true;
  }, { passive: true });
  hero.addEventListener("pointerleave", () => { P.inside = false; P.nx = 0; P.ny = 0; });

  /* ------------------------------------------------ wind: breeze + gusts */
  const WIND = { x: 0.5, y: 0, gust: 0, g: 0, dir: 1, start: -1, len: 0, amp: 0, next: 2600, ptr: 0 };
  function wind(t) {
    const breeze = 0.42 + 0.26 * Math.sin(t * 0.00023) + 0.16 * Math.sin(t * 0.00061 + 1.7);
    if (WIND.start < 0 && t > WIND.next) {
      WIND.start = t; WIND.len = rand(2400, 4200); WIND.amp = rand(1.3, 2.6);
      WIND.dir = Math.random() < 0.82 ? 1 : -1;
    }
    let g = 0;
    if (WIND.start >= 0) {
      const u = (t - WIND.start) / WIND.len;
      if (u >= 1) { WIND.start = -1; WIND.next = t + rand(3000, 6500); }
      else g = (u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75)) * WIND.amp * (1 + 0.22 * Math.sin(t * 0.011));
    }
    WIND.ptr += (P.vx * 0.035 - WIND.ptr) * 0.05;
    WIND.gust = g;
    WIND.g = clamp(g / 2.6, 0, 1);                              // 0–1 gust strength
    WIND.x = breeze + g * WIND.dir + WIND.ptr;
    WIND.y = g * 0.55 * Math.sin(t * 0.0042);                   // gusty up/down turbulence
  }

  /* ------------------------------------------------ branches */
  const NS = "http://www.w3.org/2000/svg";
  const twigs = [], blossoms = [], leaves = [], branches = [];
  let seed = 7, cur = null;
  const srand = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const PETAL_D = "M0 0 C -5 -4 -6 -12 0 -17 C 6 -12 5 -4 0 0 Z";
  const qpt = (x0, y0, cx, cy, x1, y1, t) => { const u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; };
  // spring constants by twig depth (index 0 = thin tip … 4 = main limb)
  const GAIN = [3.2, 2.4, 1.7, 1.2, 0.8], STIFF = [52, 38, 28, 20, 15], DAMP = [4.6, 4.1, 3.7, 3.3, 3.0];
  const BREEZE = [1.4, 1.1, 0.8, 0.55, 0.35], KICK = [1, 0.7, 0.45, 0.25, 0.12];

  function blossom(parent, x, y, r, chain) {
    const b = { x, y, r, r0: srand(0, 72), s: r / 17, chain, br: cur, ph: srand(0, 6.28), fl: 0, fv: 0, pop: reduce ? 1 : 0, cool: 0, petals: [] };
    b.g = mk("g", { class: "bl", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${b.r0.toFixed(1)}) scale(${(b.s * b.pop).toFixed(3)})` }, parent);
    for (let i = 0; i < 5; i++) b.petals.push({ el: mk("path", { d: PETAL_D, transform: `rotate(${i * 72})`, fill: `url(#${cur.gid})`, class: "bl-petal" }, b.g), on: true });
    mk("circle", { r: 3.2, class: "bl-core" }, b.g);
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * Math.PI / 180;
      mk("circle", { cx: (Math.cos(a) * 5.2).toFixed(1), cy: (Math.sin(a) * 5.2).toFixed(1), r: 0.9, class: "bl-stamen" }, b.g);
    }
    blossoms.push(b);
  }
  function bud(parent, x, y) {
    mk("ellipse", { cx: x.toFixed(1), cy: y.toFixed(1), rx: 3.2, ry: 4.6, class: "bl-bud", transform: `rotate(${srand(-40, 40).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` }, parent);
  }
  function leaf(parent, x, y, ang, chain) {
    const a = ang * 180 / Math.PI + srand(-55, 55), s = srand(0.75, 1.15);
    const el = mk("path", { d: "M0 0 C 6 -5 16 -5 22 0 C 16 5 6 5 0 0 Z", class: "br-leaf", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(0)}) scale(${s.toFixed(2)})` }, parent);
    leaves.push({ el, x: x + Math.cos(a * Math.PI / 180) * 11 * s, y: y + Math.sin(a * Math.PI / 180) * 11 * s, chain, br: cur, on: true });
  }
  function grow(parent, x, y, ang, len, w, depth, droop, chain) {
    const g = mk("g", {}, parent);
    const bend = srand(-0.35, 0.35);
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    const cx = x + Math.cos(ang + bend) * len * 0.55, cy = y + Math.sin(ang + bend) * len * 0.55;
    mk("path", { class: "br-stroke", d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, "stroke-width": w.toFixed(2) }, g);
    const tw = {
      g, px: x, py: y, dx: Math.cos(ang), dy: Math.sin(ang), mid: qpt(x, y, cx, cy, x1, y1, 0.6), depth, a: 0, v: 0,
      ph: srand(0, 6.28), f1: srand(0.0007, 0.0012), f2: srand(0.004, 0.007), chain, br: cur,
    };
    twigs.push(tw);
    const inner = tw.full = [...chain, tw];
    if (depth > 0) {
      const n = depth >= 3 ? 2 : Math.round(srand(1.6, 2.6));
      for (let i = 0; i < n; i++) {
        const [px, py] = qpt(x, y, cx, cy, x1, y1, srand(0.42, 1));
        grow(g, px, py, ang + (i % 2 ? 1 : -1) * srand(0.3, 0.8) + droop, len * srand(0.56, 0.76), Math.max(0.8, w * 0.62), depth - 1, droop, inner);
      }
      if (depth <= 2) for (let i = 0; i < 2; i++) {
        if (srand(0, 1) < 0.35) continue;
        const [px, py] = qpt(x, y, cx, cy, x1, y1, srand(0.3, 0.9));
        leaf(g, px, py, ang, inner);
      }
    }
    if (depth === 0) {
      blossom(g, x1, y1, srand(15, 20), inner);
      if (srand(0, 1) > 0.55) { const [bx, by] = qpt(x, y, cx, cy, x1, y1, srand(0.35, 0.7)); bud(g, bx, by); }
    } else if (depth <= 2 && srand(0, 1) > 0.45) {
      const [bx, by] = qpt(x, y, cx, cy, x1, y1, srand(0.45, 0.85));
      blossom(g, bx, by, srand(12, 16), inner);
    }
  }
  function buildBranch(host, corner) {
    const svg = mk("svg", { "aria-hidden": "true", preserveAspectRatio: "xMinYMin meet" });
    const gid = "bl-grad-" + corner;
    const lg = mk("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "-1", gradientUnits: "objectBoundingBox" }, mk("defs", {}, svg));
    mk("stop", { offset: "0", "stop-color": "#2a5fd8" }, lg);
    mk("stop", { offset: ".5", "stop-color": "#6fa2ff" }, lg);
    mk("stop", { offset: "1", "stop-color": "#e3eeff" }, lg);
    const root = mk("g", {}, svg);
    host.appendChild(svg);
    cur = { host, svg, gid, corner, depth: parseFloat(host.dataset.depth) || 0, left: 0, top: 0, scale: 1, ox: 0, oy: 0 };
    if (corner === "tl") {
      seed = 11;
      grow(root, -14, 14, 0.1, 330, 8, 4, 0.14, []);
      grow(root, -14, 58, 0.66, 175, 5, 3, 0.1, []);
    } else {
      seed = 29;
      grow(root, 16, 8, -2.86, 320, 8, 4, -0.13, []);
      grow(root, 16, -30, -2.3, 160, 5, 3, -0.1, []);
    }
    // fit the viewBox around whatever grew, anchored to its corner
    const bb = root.getBBox();
    cur.vb = corner === "tl"
      ? { x: 0, y: 0, w: Math.ceil(bb.x + bb.width + 26), h: Math.ceil(bb.y + bb.height + 26) }
      : { x: Math.floor(bb.x - 26), y: Math.floor(bb.y - 26), w: Math.ceil(-bb.x + 26), h: Math.ceil(-bb.y + 26) };
    svg.setAttribute("viewBox", `${cur.vb.x} ${cur.vb.y} ${cur.vb.w} ${cur.vb.h}`);
    branches.push(cur);
  }
  $$("[data-branch]", hero).forEach(h => buildBranch(h, h.dataset.branch));

  // forward kinematics: a point inside nested twigs → the branch's SVG space
  function world(x, y, chain) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const tw = chain[i];
      if (!tw.a) continue;
      const r = tw.a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - tw.px, dy = y - tw.py;
      x = tw.px + dx * c - dy * s; y = tw.py + dx * s + dy * c;
    }
    return [x, y];
  }
  const toHero = (br, [x, y]) => [br.left + br.ox + (x - br.vb.x) * br.scale, br.top + br.oy + (y - br.vb.y) * br.scale];

  /* ------------------------------------------------ petal & leaf sprites */
  const SPR = 96, SPR_D = 60;                  // sprite canvas size, shape span inside it
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, amt) => {                 // amt < 0 → toward black, > 0 → toward white
    const c = hex(h).map(v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  function sprite(draw, blur) {
    const c = document.createElement("canvas");
    c.width = c.height = SPR;
    const g = c.getContext("2d");
    g.translate(SPR / 2, SPR / 2);
    if (blur && "filter" in g) g.filter = `blur(${blur}px)`;
    draw(g);
    return c;
  }
  function petalShape(g, r, notch) {
    g.beginPath();
    g.moveTo(0, r);
    g.bezierCurveTo(-r * 1.05, r * 0.35, -r * 0.82, -r * 0.95, -r * 0.16, -r * 0.98);
    if (notch) { g.lineTo(0, -r * 0.74); g.lineTo(r * 0.16, -r * 0.98); }
    else g.quadraticCurveTo(0, -r * 1.08, r * 0.16, -r * 0.98);
    g.bezierCurveTo(r * 0.82, -r * 0.95, r * 1.05, r * 0.35, 0, r);
    g.closePath();
  }
  function drawPetal(g, [c0, c1], back, notch, skew) {
    const r = SPR_D / 2;
    g.transform(1, 0, skew, 1, 0, 0);
    g.shadowColor = "rgba(96,150,255,.5)"; g.shadowBlur = 10;
    petalShape(g, r, notch);
    const lin = g.createLinearGradient(0, r, 0, -r);
    lin.addColorStop(0, back ? shade(c0, -0.3) : c0);
    lin.addColorStop(1, back ? shade(c1, -0.22) : c1);
    g.fillStyle = lin; g.fill();
    g.shadowBlur = 0;
    const sheen = g.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 1.1);
    sheen.addColorStop(0, `rgba(255,255,255,${back ? 0.05 : 0.22})`);
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen; g.fill();
    g.strokeStyle = `rgba(255,255,255,${back ? 0.1 : 0.26})`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, r * 0.85); g.quadraticCurveTo(r * 0.06, 0, 0, -r * 0.6); g.stroke();
  }
  function leafShape(g, r, narrow) {
    const w = narrow ? 0.3 : 0.46;
    g.beginPath();
    g.moveTo(0, r * 0.72);
    g.bezierCurveTo(-r * w * 1.3, r * 0.42, -r * w * 1.15, -r * 0.5, 0, -r);
    g.bezierCurveTo(r * w * 1.15, -r * 0.5, r * w * 1.3, r * 0.42, 0, r * 0.72);
    g.closePath();
  }
  function drawLeaf(g, [c0, c1], back, narrow) {
    const r = SPR_D / 2;
    g.strokeStyle = shade(c0, back ? 0.4 : 0.15); g.lineWidth = 2; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, r * 0.7); g.quadraticCurveTo(r * 0.02, r * 0.86, r * 0.07, r); g.stroke();
    g.shadowColor = "rgba(70,125,245,.5)"; g.shadowBlur = 8;
    leafShape(g, r, narrow);
    const lin = g.createLinearGradient(-r * 0.4, r * 0.7, r * 0.3, -r);
    lin.addColorStop(0, back ? shade(c0, 0.3) : c0);
    lin.addColorStop(1, back ? shade(c1, 0.32) : c1);
    g.fillStyle = lin; g.fill();
    g.shadowBlur = 0;
    g.save(); leafShape(g, r, narrow); g.clip();
    g.strokeStyle = `rgba(205,225,255,${back ? 0.28 : 0.36})`; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(0, r * 0.72); g.quadraticCurveTo(r * 0.06, 0, 0, -r * 0.92);
    for (let i = 0; i < 5; i++) {
      const y = r * (0.5 - i * 0.28), wv = r * (narrow ? 0.26 : 0.4) * (1 - i * 0.12);
      g.moveTo(0, y); g.quadraticCurveTo(-wv * 0.5, y - r * 0.08, -wv, y - r * 0.26);
      g.moveTo(0, y); g.quadraticCurveTo(wv * 0.5, y - r * 0.08, wv, y - r * 0.26);
    }
    g.stroke(); g.restore();
  }
  const PETAL_COLS = [["#4f86ee", "#e8f1ff"], ["#3b74e0", "#cfe0ff"], ["#2b5fd0", "#a8c7ff"], ["#6f9cf0", "#f5f9ff"], ["#4a6fc2", "#bdd2ff"], ["#8cb0f4", "#ffffff"]];
  const LEAF_COLS = [["#15398a", "#3f7ff0"], ["#1a45a8", "#5b95f7"], ["#123274", "#3570e0"], ["#24499c", "#7aa6f2"], ["#1d3d86", "#98b8f2"]];
  const PETALS = [], LEAVES = [];                               // [variant][face][sharp|soft]
  PETAL_COLS.forEach((c, i) => [true, false].forEach(notch => {
    const skew = ((i % 3) - 1) * 0.12;
    PETALS.push([false, true].map(back => [0, 3].map(bl => sprite(g => drawPetal(g, c, back, notch, skew), bl))));
  }));
  LEAF_COLS.forEach(c => [false, true].forEach(narrow => {
    LEAVES.push([false, true].map(back => [0, 3].map(bl => sprite(g => drawLeaf(g, c, back, narrow), bl))));
  }));

  /* ------------------------------------------------ particles */
  const cvBack = $(".petals--back", hero), cvFront = $(".petals--front", hero);
  const cB = cvBack.getContext("2d"), cF = cvFront.getContext("2d");
  const layers = $$("[data-depth]", hero).map(el => ({ el, d: parseFloat(el.dataset.depth) || 0, br: branches.find(b => b.host === el) }));
  let Wd = 1, Hd = 1, dprB = 1, dprF = 1, target = 60;
  const parts = [];

  function measure() {
    Wd = hero.offsetWidth; Hd = hero.offsetHeight;
    // the far layer is small, dim petals: 1× is plenty. The near layer gets a little more detail.
    const dev = devicePixelRatio || 1, fit = (d, cap) => (Wd * Hd * d * d > cap ? Math.sqrt(cap / (Wd * Hd)) : d);
    dprB = fit(Math.min(dev, 1), 1.6e6);
    dprF = fit(Math.min(dev, 1.5), 2.6e6);
    cvBack.width = Math.round(Wd * dprB); cvBack.height = Math.round(Hd * dprB);
    cvFront.width = Math.round(Wd * dprF); cvFront.height = Math.round(Hd * dprF);
    for (const br of branches) { br.left = br.host.offsetLeft; br.top = br.host.offsetTop; br.scale = br.host.offsetWidth / br.vb.w; }
    target = Math.round(fine ? clamp(Wd * Hd / 5600, 70, 230) : clamp(Wd * Hd / 7000, 40, 100));
  }

  function particle(kind, z, x, y, vx = 0, vy = 0) {
    const leafy = kind === 1;
    const p = {
      kind, z, x, y, vx, vy,
      size: (leafy ? rand(15, 22) : rand(8.5, 13)) * (0.42 + z * 1.15),
      fall: (leafy ? rand(0.95, 1.4) : rand(0.55, 0.95)) * (0.55 + z),
      rot: rand(0, 6.283), vr: rand(-0.035, 0.035) * (leafy ? 0.6 : 1),
      flip: rand(0, 6.283), vf: 0, vf0: (leafy ? rand(0.018, 0.04) : rand(0.035, 0.085)) * (Math.random() < 0.5 ? -1 : 1),
      ph: rand(0, 6.283), pf: rand(0.022, 0.04), pa: rand(0.5, 1.1),       // leaf pendulum
      sw: rand(0, 6.283), swf: rand(0.008, 0.02),                          // petal sway
      spr: (Math.random() * (leafy ? LEAVES.length : PETALS.length)) | 0,
      alpha: (0.38 + z * 0.62) * rand(0.85, 1),
    };
    p.vf = p.vf0;
    return p;
  }
  const depth = () => { const r = Math.random(); return r < 0.45 ? rand(0, 0.45) : r < 0.82 ? rand(0.45, 0.8) : rand(0.8, 1); };
  const kindOf = () => (Math.random() < 0.24 ? 1 : 0);
  function spawnTop() { parts.push(particle(kindOf(), depth(), rand(-60, Wd + 60), rand(-70, -20), WIND.x * 0.6, 0)); }
  function spawnSide() {                                                  // gusts carry petals in from the side
    const x = WIND.dir > 0 ? -40 : Wd + 40;
    parts.push(particle(kindOf(), depth(), x, rand(-20, Hd * 0.7), WIND.x * 0.8, rand(-0.3, 0.4)));
  }
  function prewarm() {
    for (let i = 0; i < target * 0.9; i++) {
      const p = particle(kindOf(), depth(), rand(0, Wd), rand(-Hd * 0.1, Hd));
      p.vx = WIND.x * 0.5; p.vy = p.fall;
      parts.push(p);
    }
  }

  /* ------------------------------------------------ petals knocked off the branches */
  function strip(b, n, vx, vy) {
    const now = performance.now();
    if (now < b.cool) return;
    b.cool = now + 160;
    const [hx, hy] = toHero(b.br, world(b.x, b.y, b.chain));
    const on = b.petals.filter(p => p.on);
    for (let i = 0; i < Math.min(n, on.length); i++) {
      const pe = on.splice((Math.random() * on.length) | 0, 1)[0];
      pe.on = false;
      pe.el.style.opacity = "0";
      const p = particle(0, rand(0.55, 0.9), hx + rand(-6, 6), hy + rand(-6, 6), vx + rand(-0.5, 0.5), vy + rand(-0.6, 0.2));
      p.size *= 1.15;
      parts.push(p);
      setTimeout(() => { pe.on = true; pe.el.style.opacity = ""; }, rand(3500, 7500));  // the blossom grows it back
    }
  }
  function dropLeaf(l, vx, vy) {
    l.on = false;
    l.el.style.opacity = "0";
    const [hx, hy] = toHero(l.br, world(l.x, l.y, l.chain));
    parts.push(particle(1, rand(0.55, 0.85), hx, hy, vx, vy));
    setTimeout(() => { l.on = true; l.el.style.opacity = ""; }, rand(8000, 14000));
  }

  /* ------------------------------------------------ the frame */
  function frame(t, dt, f) {
    // pointer velocity (px per 60 fps frame) and eased parallax
    if (P.inside) { P.vx = P.x - P.px; P.vy = P.y - P.py; P.px = P.x; P.py = P.y; }
    else { P.vx *= 0.8; P.vy *= 0.8; }
    P.speed = Math.hypot(P.vx, P.vy) / f;
    const ease = Math.min(1, 0.06 * f);
    P.sx += (P.nx - P.sx) * ease; P.sy += (P.ny - P.sy) * ease;

    wind(t);

    for (const L of layers) {
      const ox = -P.sx * L.d, oy = -P.sy * L.d * 0.6;
      L.el.style.transform = `translate3d(${ox.toFixed(2)}px,${oy.toFixed(2)}px,0)`;
      if (L.br) { L.br.ox = ox; L.br.oy = oy; }
    }

    // twigs: springs pulled by the breeze, the wind's torque and gust turbulence
    for (const tw of twigs) {
      const d = tw.depth, torque = tw.dx * WIND.y - tw.dy * WIND.x;
      const target = torque * GAIN[d] * (1 + 0.25 * Math.sin(t * tw.f2 + tw.ph))
        + Math.sin(t * tw.f1 + tw.ph) * BREEZE[d]
        + Math.sin(t * tw.f2 + tw.ph * 1.7) * BREEZE[d] * 1.6 * WIND.g;
      tw.v += ((target - tw.a) * STIFF[d] - tw.v * DAMP[d]) * dt;
      tw.a += tw.v * dt;
      tw.g.setAttribute("transform", `rotate(${tw.a.toFixed(2)} ${tw.px.toFixed(1)} ${tw.py.toFixed(1)})`);
    }
    // blossoms flutter on their own little springs
    for (const b of blossoms) {
      const target = Math.sin(t * 0.006 + b.ph) * (1.5 + 7 * WIND.g);
      b.fv += ((target - b.fl) * 60 - b.fv * 5) * dt;
      b.fl += b.fv * dt;
      const s = b.s * b.pop;
      b.g.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${(b.r0 + b.fl).toFixed(1)}) scale(${s.toFixed(3)})`);
    }

    // brushing the branches: twigs get knocked, blossoms lose petals
    if (P.inside && P.speed > 1.5) {
      const vx = P.vx / f, vy = P.vy / f;
      for (const b of blossoms) {
        const [hx, hy] = toHero(b.br, world(b.x, b.y, b.chain));
        if (Math.hypot(hx - P.x, hy - P.y) < b.r * b.br.scale + 16) {
          strip(b, 1 + ((P.speed / 9) | 0), vx * 0.3, vy * 0.2 - 0.3);
          b.fv += (vx > 0 ? 1 : -1) * Math.min(P.speed * 25, 260);
        }
      }
      for (const tw of twigs) {
        const [hx, hy] = toHero(tw.br, world(tw.mid[0], tw.mid[1], tw.full));
        if (Math.hypot(hx - P.x, hy - P.y) < 22 * tw.br.scale + 10) {
          const cr = tw.dx * vy - tw.dy * vx;
          tw.v += Math.sign(cr) * Math.min(P.speed * 4.5, 70) * KICK[tw.depth];
        }
      }
    }
    // gusts shake petals and leaves loose
    if (WIND.g > 0.25) {
      const pb = WIND.g * WIND.g * 0.02 * f, pl = WIND.g * WIND.g * WIND.g * 0.004 * f;
      for (const b of blossoms) if (Math.random() < pb) strip(b, 1, WIND.x * 0.7, -0.2);
      for (const l of leaves) if (l.on && Math.random() < pl) dropLeaf(l, WIND.x * 0.7, 0);
    }

    // keep the air full: new ones drift in from above (and from the side in gusts)
    const want = target * (1 + WIND.g * 0.4);
    for (let n = 0; n < 3 && parts.length < want; n++) spawnTop();
    if (WIND.g > 0.3 && Math.random() < WIND.g * 0.25 * f) spawnSide();

    // move
    const pr = 90, stir = P.inside && P.speed > 0.4;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], resp = 0.4 + p.z * 0.95;
      let tvx = WIND.x * resp * (p.kind ? 0.85 : 1.05), tvy = p.fall;
      if (p.kind) {                                    // leaves swing like a pendulum, gliding down at the bottom of each arc
        p.ph += p.pf * f;
        const c = Math.cos(p.ph);
        tvx += c * p.pa * (0.6 + p.z);
        tvy *= 0.35 + 0.9 * c * c;
      } else {
        p.sw += p.swf * f;
        tvx += Math.sin(p.sw) * 0.35 * (0.6 + p.z);
        tvy *= 0.85 + 0.3 * Math.sin(p.flip * 0.5);
      }
      tvy -= WIND.gust * 0.25 * resp * (0.6 + 0.4 * Math.sin(t * 0.004 + p.ph));
      p.vx += (tvx - p.vx) * 0.03 * f;
      p.vy += (tvy - p.vy) * 0.035 * f;
      if (stir) {                                      // the pointer stirs the air, leaving a curling wake
        const dx = p.x - P.sx * (8 + p.z * 46) - P.x, dy = p.y - P.sy * (5 + p.z * 28) - P.y;
        const R = pr + p.z * 90, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) + 0.001, w = (1 - d / R) ** 2, side = Math.sign(P.vx * dy - P.vy * dx) || 1;
          const vx = P.vx / f, vy = P.vy / f, spd = Math.min(P.speed, 40);
          p.vx += (vx * 0.09 - dy / d * spd * 0.035 * side) * w * f;
          p.vy += (vy * 0.07 + dx / d * spd * 0.035 * side) * w * f;
          p.vf += 0.004 * w * Math.sign(p.vf || 1);
        }
      }
      p.x += p.vx * f; p.y += p.vy * f;
      p.rot += (p.vr + WIND.gust * 0.004 * Math.sign(p.vr || 1)) * f;
      p.flip += p.vf * f * (1 + WIND.gust * 0.6);
      p.vf += (p.vf0 - p.vf) * 0.01 * f;                                    // spin eases back after a stir
      if (p.x > Wd + 80) p.x -= Wd + 160;
      else if (p.x < -80) p.x += Wd + 160;
      if (p.y > Hd + 60) parts.splice(i, 1);
    }
    draw();
  }

  function draw() {
    cB.setTransform(1, 0, 0, 1, 0, 0); cB.clearRect(0, 0, cvBack.width, cvBack.height);
    cF.setTransform(1, 0, 0, 1, 0, 0); cF.clearRect(0, 0, cvFront.width, cvFront.height);
    for (const p of parts) {
      const back = p.z < 0.62, ctx = back ? cB : cF, dpr = back ? dprB : dprF;
      const ox = -P.sx * (8 + p.z * 46), oy = -P.sy * (5 + p.z * 28);
      const c = Math.cos(p.flip), sxv = Math.max(0.1, Math.abs(c));
      const rot = p.kind ? p.rot + Math.sin(p.ph) * 0.7 : p.rot;
      const k = p.size / SPR_D * dpr, cr = Math.cos(rot) * k, sr = Math.sin(rot) * k;
      const sy = 1 - 0.16 * Math.abs(Math.sin(p.flip * 0.7 + p.ph));
      ctx.setTransform(cr * sxv, sr * sxv, -sr * sy, cr * sy, (p.x + ox) * dpr, (p.y + oy) * dpr);
      ctx.globalAlpha = p.alpha * (0.7 + 0.3 * sxv);
      ctx.drawImage((p.kind ? LEAVES : PETALS)[p.spr][c < 0 ? 1 : 0][p.z > 0.84 ? 1 : 0], -SPR / 2, -SPR / 2);
    }
    cB.globalAlpha = 1; cF.globalAlpha = 1;
  }

  /* ------------------------------------------------ start */
  measure();
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(measure, 120); });

  if (reduce) {                                        // a still scene: branches at rest, petals where they are
    hero.classList.add("is-live");
    prewarm(); draw();
    return;
  }

  // hidden until the landing is revealed, then the branches draw themselves in
  const strokes = $$(".br-stroke", hero), branchLeaves = $$(".br-leaf", hero);
  strokes.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
  branchLeaves.forEach(l => (l.style.opacity = "0"));
  let started = false;
  function intro() {
    if (started) return;
    started = true;
    measure();
    hero.classList.add("is-live");
    prewarm();
    if (window.gsap) {
      gsap.to(strokes, { strokeDashoffset: 0, duration: 1.8, ease: "power2.out", stagger: 0.008 });
      gsap.to(blossoms, { pop: 1, duration: 1, ease: "back.out(2)", stagger: 0.012, delay: 0.7 });
      gsap.to(branchLeaves, { opacity: 1, duration: 0.8, stagger: 0.01, delay: 0.9, clearProps: "opacity" });
    } else {
      strokes.forEach(p => (p.style.strokeDashoffset = 0));
      blossoms.forEach(b => (b.pop = 1));
      branchLeaves.forEach(l => (l.style.opacity = ""));
    }
    let last = performance.now();
    const t0 = last;
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = clamp((now - last) / 1000, 0.001, 1 / 20);
      last = now;
      if (!visible || document.hidden) return;
      frame(now - t0, dt, dt * 60);
    })(last);
  }
  document.addEventListener("jt:intro", intro, { once: true });
  setTimeout(intro, 4500);                              // in case the page script never signals
})();
