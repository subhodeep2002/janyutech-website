/*
 * Home landing: an empty white room seen from its open end. Ceiling, walls,
 * floor and back wall are ruled with a fine grid, and JANYU TECH floats in the
 * middle of it with the quote beneath.
 *  – camera: the pointer moves it a little, so the room and the lettering shift
 *    against each other; scrolling (the stage is pinned for a moment) carries
 *    it into the room and past the lettering
 *  – leaves and petals blow in through the opening from the branches, tumble
 *    down and settle on the floor, each with a soft shadow. Sweeping the
 *    pointer across the floor kicks them back up into the air
 *  – two branches hang into the top corners on damped springs; a breeze and
 *    the odd gust move them gently, and brushing a blossom knocks petals loose
 * The room is drawn with a small perspective projection on a canvas; the
 * lettering is HTML placed by the same projection.
 */
(() => {
  const hero = document.querySelector("[data-hero]");
  const stage = hero && hero.querySelector(".room__stage");
  if (!stage) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = x => x * x * (3 - 2 * x);
  const TAU = Math.PI * 2;

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

  /* ------------------------------------------------ the room and the camera */
  // world units with y pointing down. The room is HR tall, D deep and as wide as the
  // screen is (a portrait screen still gets a room rather than a shaft). The camera
  // stands in the opening, a little above the middle, looking at the title (VP: the vanishing
  // point, as a share of the screen height); ZT is where the lettering floats.
  const HR = 9, D = 14, ZN = 0.4, EYE = -0.9, ZT = 8.4, ZB = 3.2, DOLLY = 8.9, VP = 0.41;
  const cam = { x: 0, y: EYE, z: 0, vz: 0 };
  let W = 1, H = 1, f = 1, cx = 0, cy = 0, xL = -8, xR = 8, dprR = 1, dprB = 1, dprF = 1;
  const yC = -HR / 2, yF = HR / 2;
  const proj = (x, y, z) => { const r = z - cam.z; return [cx + f * (x - cam.x) / r, cy + f * (y - cam.y) / r]; };

  const cvRoom = $(".room__walls", stage), cR = cvRoom.getContext("2d");
  const cvBack = $(".room__leaves--back", stage), cB = cvBack.getContext("2d");
  const cvFront = $(".room__leaves--front", stage), cF = cvFront.getContext("2d");
  let FACES = [], LINES = { minor: [], major: [], edges: [] }, roomKey = "";

  function buildRoom() {
    const P = (x, y, z) => [x, y, z];
    FACES = [
      { k: "back", p: [P(xL, yC, D), P(xR, yC, D), P(xR, yF, D), P(xL, yF, D)] },
      { k: "floor", p: [P(xL, yF, ZN), P(xR, yF, ZN), P(xR, yF, D), P(xL, yF, D)] },
      { k: "ceil", p: [P(xL, yC, ZN), P(xR, yC, ZN), P(xR, yC, D), P(xL, yC, D)] },
      { k: "left", p: [P(xL, yC, ZN), P(xL, yC, D), P(xL, yF, D), P(xL, yF, ZN)] },
      { k: "right", p: [P(xR, yC, ZN), P(xR, yC, D), P(xR, yF, D), P(xR, yF, ZN)] },
    ];
    const minor = [], major = [], add = (a, b, m) => (m ? major : minor).push([a, b]);
    for (let i = 0; i < xR - 0.01; i++) for (const x of i ? [i, -i] : [0]) {       // centred on the middle of the room
      const m = i % 4 === 0;
      add(P(x, yF, ZN), P(x, yF, D), m); add(P(x, yC, ZN), P(x, yC, D), m); add(P(x, yC, D), P(x, yF, D), m);
    }
    for (let j = 1; j < HR; j++) {
      const y = yC + j, m = j % 3 === 0;
      add(P(xL, y, ZN), P(xL, y, D), m); add(P(xR, y, ZN), P(xR, y, D), m); add(P(xL, y, D), P(xR, y, D), m);
    }
    for (let k = 1; D - k > ZN; k++) {
      const z = D - k, m = k % 4 === 0;
      add(P(xL, yF, z), P(xR, yF, z), m); add(P(xL, yC, z), P(xR, yC, z), m);
      add(P(xL, yC, z), P(xL, yF, z), m); add(P(xR, yC, z), P(xR, yF, z), m);
    }
    const edges = [
      [P(xL, yC, D), P(xR, yC, D)], [P(xR, yC, D), P(xR, yF, D)], [P(xR, yF, D), P(xL, yF, D)], [P(xL, yF, D), P(xL, yC, D)],
      [P(xL, yC, ZN), P(xL, yC, D)], [P(xR, yC, ZN), P(xR, yC, D)], [P(xL, yF, ZN), P(xL, yF, D)], [P(xR, yF, ZN), P(xR, yF, D)],
    ];
    LINES = { minor, major, edges };
  }
  // keep only the part in front of the camera
  function clipPoly(Pts, zmin) {
    const out = [];
    for (let i = 0; i < Pts.length; i++) {
      const a = Pts[i], b = Pts[(i + 1) % Pts.length], ia = a[2] >= zmin, ib = b[2] >= zmin;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (zmin - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, zmin]); }
    }
    return out;
  }
  function drawRoom() {
    const g = cR, zmin = cam.z + 0.05;
    g.setTransform(dprR, 0, 0, dprR, 0, 0);
    const [uL, vT] = proj(xL, yC, D), [uR, vB] = proj(xR, yF, D);
    const lin = (x0, y0, x1, y1, a, b) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    // light comes in through the opening: the far end of every surface is a shade darker
    const fills = {
      back: "#f1f4f8",
      floor: lin(0, vB, 0, H, "#e8ecf2", "#fcfdfe"),
      ceil: lin(0, vT, 0, 0, "#e9edf2", "#fbfcfd"),
      left: lin(uL, 0, 0, 0, "#eaeef3", "#fdfdfe"),
      right: lin(uR, 0, W, 0, "#eaeef3", "#fdfdfe"),
    };
    for (const F of FACES) {
      const Pts = clipPoly(F.p, zmin);
      if (Pts.length < 3) continue;
      g.beginPath();
      Pts.forEach((p, i) => { const [u, v] = proj(p[0], p[1], p[2]); i ? g.lineTo(u, v) : g.moveTo(u, v); });
      g.closePath();
      g.fillStyle = fills[F.k];
      g.fill();
      if (F.k === "back") {                         // a soft pool of light on the back wall
        const rw = Math.max(uR - uL, 1), mx = (uL + uR) / 2, my = vT + (vB - vT) * 0.42;
        const glow = g.createRadialGradient(mx, my, 0, mx, my, rw * 0.62);
        glow.addColorStop(0, "rgba(255,255,255,.75)"); glow.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = glow; g.fill();
      }
    }
    const lines = (L, style, w) => {
      g.beginPath();
      for (const [a, b] of L) {
        let A = a, B = b;
        if (A[2] < zmin && B[2] < zmin) continue;
        if (A[2] < zmin) { const t = (zmin - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, zmin]; }
        else if (B[2] < zmin) { const t = (zmin - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, zmin]; }
        const pa = proj(A[0], A[1], A[2]), pb = proj(B[0], B[1], B[2]);
        g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]);
      }
      g.strokeStyle = style; g.lineWidth = w; g.stroke();
    };
    lines(LINES.edges, "rgba(24,44,84,.035)", 26);    // shade gathering in the corners
    lines(LINES.edges, "rgba(24,44,84,.04)", 9);
    lines(LINES.minor, "rgba(52,92,168,.12)", 1);
    lines(LINES.major, "rgba(52,92,168,.22)", 1);
    lines(LINES.edges, "rgba(36,64,120,.32)", 1.2);
    const vig = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.78);
    vig.addColorStop(0, "rgba(20,32,60,0)"); vig.addColorStop(1, "rgba(20,32,60,.05)");
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------ pointer and scroll */
  const Pt = { x: -9999, y: -9999, px: 0, py: 0, vx: 0, vy: 0, speed: 0, nx: 0, ny: 0, sx: 0, sy: 0, inside: false };
  const point = (X, Y) => {
    const r = stage.getBoundingClientRect();
    Pt.x = X - r.left; Pt.y = Y - r.top;
    Pt.nx = clamp(Pt.x / r.width * 2 - 1, -1, 1); Pt.ny = clamp(Pt.y / r.height * 2 - 1, -1, 1);
    if (!Pt.inside) { Pt.px = Pt.x; Pt.py = Pt.y; }
    Pt.inside = true;
  };
  const leave = () => { Pt.inside = false; Pt.nx = 0; Pt.ny = 0; };
  stage.addEventListener("pointermove", e => point(e.clientX, e.clientY), { passive: true });
  stage.addEventListener("touchmove", e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("touchend", leave);
  let heroTop = 0, span = 0;
  const progress = () => (span > 1 ? clamp((scrollY - heroTop) / span, 0, 1) : 0);
  const floorVel = { x: 0, z: 0, fx: 0, fz: 0, on: false, speed: 0 };
  // the point on the floor under the pointer, or null when it is on a wall
  function floorAt(u, v) {
    const dy = (v - cy) / f;
    if (dy <= 0.02) return null;
    const t = (yF - cam.y) / dy, z = cam.z + t, x = cam.x + (u - cx) / f * t;
    return z < D && x > xL && x < xR ? [x, z] : null;
  }

  /* ------------------------------------------------ wind: a breeze and the odd gust */
  const WIND = { bx: 0.3, by: 0, x: 0, z: 0.4, lift: 0, g: 0, dir: 1, start: -1, len: 0, amp: 0, next: 4000, ptr: 0 };
  function wind(t) {
    const breeze = 0.26 + 0.16 * Math.sin(t * 0.00021) + 0.1 * Math.sin(t * 0.00057 + 1.7);
    if (WIND.start < 0 && t > WIND.next) {
      WIND.start = t; WIND.len = rand(2600, 4200); WIND.amp = rand(0.7, 1.4);
      WIND.dir = Math.random() < 0.8 ? 1 : -1;
    }
    let g = 0;
    if (WIND.start >= 0) {
      const u = (t - WIND.start) / WIND.len;
      if (u >= 1) { WIND.start = -1; WIND.next = t + rand(4500, 9000); }
      else g = (u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75)) * WIND.amp;
    }
    WIND.ptr += (Pt.vx * 0.02 - WIND.ptr) * 0.05;
    WIND.g = clamp(g / 1.4, 0, 1);
    WIND.bx = breeze + g * WIND.dir + WIND.ptr;            // on the branches, in screen terms
    WIND.by = g * 0.4 * Math.sin(t * 0.0042);
    WIND.x = 0.08 * Math.sin(t * 0.00017) + g * WIND.dir * 0.35;   // in the room, units per second
    WIND.z = 0.42 + 0.12 * Math.sin(t * 0.00029) + g * 0.8;          // blowing in through the opening
    WIND.lift = g * 0.28;
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
  // spring constants by twig depth (index 0 = thin tip … 4 = main limb): a gentle sway
  const GAIN = [1.7, 1.3, 0.95, 0.7, 0.45], STIFF = [52, 38, 28, 20, 15], DAMP = [5.4, 4.8, 4.3, 3.9, 3.5];
  const BREEZE = [0.8, 0.62, 0.46, 0.32, 0.2], KICK = [0.7, 0.5, 0.32, 0.18, 0.08];

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
    const svg = mk("svg", { "aria-hidden": "true", preserveAspectRatio: corner === "tl" ? "xMinYMin meet" : "xMaxYMin meet" });
    const gid = "bl-grad-" + corner;
    const lg = mk("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "-1", gradientUnits: "objectBoundingBox" }, mk("defs", {}, svg));
    mk("stop", { offset: "0", "stop-color": "#2f66d6" }, lg);
    mk("stop", { offset: ".55", "stop-color": "#6d9ef4" }, lg);
    mk("stop", { offset: "1", "stop-color": "#d3e2ff" }, lg);
    const root = mk("g", {}, svg);
    host.appendChild(svg);
    cur = { host, svg, gid, corner, left: 0, top: 0, scale: 1, ox: 0, oy: 0 };
    if (corner === "tl") {
      seed = 11;
      grow(root, -14, 14, 0.1, 330, 8, 4, 0.14, []);
      grow(root, -14, 58, 0.66, 175, 5, 3, 0.1, []);
    } else {                                           // the same kind of spray, coming in from the right
      seed = 23;
      grow(root, 14, 14, Math.PI - 0.12, 300, 7.5, 4, -0.14, []);
      grow(root, 14, 62, Math.PI - 0.7, 160, 4.8, 3, -0.1, []);
    }
    // fit the viewBox around whatever grew, anchored to its corner
    const bb = root.getBBox();
    cur.vb = corner === "tl"
      ? { x: 0, y: 0, w: Math.ceil(bb.x + bb.width + 26), h: Math.ceil(bb.y + bb.height + 26) }
      : { x: Math.floor(bb.x - 26), y: 0, w: -Math.floor(bb.x - 26), h: Math.ceil(bb.y + bb.height + 26) };
    svg.setAttribute("viewBox", `${cur.vb.x} ${cur.vb.y} ${cur.vb.w} ${cur.vb.h}`);
    branches.push(cur);
  }
  $$("[data-branch]", stage).forEach(h => buildBranch(h, h.dataset.branch));

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
  const toStage = (br, [x, y]) => [br.left + br.ox + (x - br.vb.x) * br.scale, br.top + br.oy + (y - br.vb.y) * br.scale];

  /* ------------------------------------------------ petal, leaf and shadow sprites */
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
    petalShape(g, r, notch);
    const lin = g.createLinearGradient(0, r, 0, -r);
    lin.addColorStop(0, back ? shade(c0, 0.25) : c0);
    lin.addColorStop(1, back ? shade(c1, 0.3) : c1);
    g.fillStyle = lin; g.fill();
    const sheen = g.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r * 1.1);
    sheen.addColorStop(0, `rgba(255,255,255,${back ? 0.12 : 0.3})`);
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen; g.fill();
    g.strokeStyle = back ? "rgba(40,90,200,.22)" : "rgba(22,66,172,.32)"; g.lineWidth = 2; g.stroke();
    g.strokeStyle = `rgba(255,255,255,${back ? 0.2 : 0.35})`; g.lineWidth = 1.4;
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
    g.strokeStyle = shade(c0, back ? 0.2 : -0.2); g.lineWidth = 2; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, r * 0.7); g.quadraticCurveTo(r * 0.02, r * 0.86, r * 0.07, r); g.stroke();
    leafShape(g, r, narrow);
    const lin = g.createLinearGradient(-r * 0.4, r * 0.7, r * 0.3, -r);
    lin.addColorStop(0, back ? shade(c0, 0.3) : c0);
    lin.addColorStop(1, back ? shade(c1, 0.32) : c1);
    g.fillStyle = lin; g.fill();
    g.strokeStyle = "rgba(12,30,80,.25)"; g.lineWidth = 1.4; g.stroke();
    g.save(); leafShape(g, r, narrow); g.clip();
    g.strokeStyle = `rgba(225,236,255,${back ? 0.3 : 0.42})`; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(0, r * 0.72); g.quadraticCurveTo(r * 0.06, 0, 0, -r * 0.92);
    for (let i = 0; i < 5; i++) {
      const y = r * (0.5 - i * 0.28), wv = r * (narrow ? 0.26 : 0.4) * (1 - i * 0.12);
      g.moveTo(0, y); g.quadraticCurveTo(-wv * 0.5, y - r * 0.08, -wv, y - r * 0.26);
      g.moveTo(0, y); g.quadraticCurveTo(wv * 0.5, y - r * 0.08, wv, y - r * 0.26);
    }
    g.stroke(); g.restore();
  }
  const PETAL_COLS = [["#1f5fd6", "#86adf3"], ["#2c6fe6", "#a3c1f7"], ["#1a4fbf", "#739ff0"], ["#3a7de8", "#b5cef9"], ["#2358c4", "#8db2f3"], ["#4b8af0", "#c3d7fb"]];
  const LEAF_COLS = [["#123f9e", "#3f7ae6"], ["#17469f", "#5a8ff0"], ["#0f3480", "#346fe0"], ["#1f4fb0", "#6e9cf0"], ["#15397f", "#4f84e8"]];
  const PETALS = [], LEAVES = [];                               // [variant][face][sharp|soft]
  PETAL_COLS.forEach((c, i) => [true, false].forEach(notch => {
    const skew = ((i % 3) - 1) * 0.12;
    PETALS.push([false, true].map(back => [0, 3].map(bl => sprite(g => drawPetal(g, c, back, notch, skew), bl))));
  }));
  LEAF_COLS.forEach(c => [false, true].forEach(narrow => {
    LEAVES.push([false, true].map(back => [0, 3].map(bl => sprite(g => drawLeaf(g, c, back, narrow), bl))));
  }));
  const SHADOW = sprite(g => {                                  // a soft round shadow, squashed onto the floor when drawn
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, SPR_D / 2);
    gr.addColorStop(0, "rgba(16,28,60,.55)"); gr.addColorStop(0.55, "rgba(16,28,60,.22)"); gr.addColorStop(1, "rgba(16,28,60,0)");
    g.fillStyle = gr; g.fillRect(-SPR / 2, -SPR / 2, SPR, SPR);
  });

  /* ------------------------------------------------ the lettering, floating in the room */
  const floaters = [
    ...$$(".room__ch", stage).map(el => ({ el, dz: rand(-0.3, 0.3), ph: rand(0, TAU), letter: true })),
    ...$$(".room__quote", stage).map(el => ({ el, dz: 0.8, ph: 0, letter: false })),
  ].map(F => Object.assign(F, { intro: reduce ? 0 : 1, op: reduce ? 1 : 0, blur: 0, bob: 0, z: ZT }));
  const cue = $(".room__scroll", stage), cueIn = cue && $(".room__scroll-in", cue);
  function placeFloaters() {                       // where each one sits in the room, from where CSS put it
    floaters.forEach(F => (F.el.style.transform = "none"));
    const sr = stage.getBoundingClientRect(), cy0 = VP * H;
    for (const F of floaters) {
      const r = F.el.getBoundingClientRect();
      F.ex = r.left - sr.left + r.width / 2; F.ey = r.top - sr.top + r.height / 2;
      F.z0 = ZT + F.dz;
      F.xw = (F.ex - W / 2) * F.z0 / f;
      F.yw = EYE + (F.ey - cy0) * F.z0 / f;
      F.ww = r.width * F.z0 / f;
    }
  }
  function floatersFrame(t) {
    for (const F of floaters) {
      const z = F.z0 + F.intro * (D - 0.6 - F.z0), zr = z - cam.z;
      F.z = z; F.bob = F.letter && !reduce ? Math.sin(t * 0.0011 + F.ph) * 0.05 : 0;
      if (zr < 0.35) { F.el.style.opacity = "0"; continue; }
      const [u, v] = proj(F.xw, F.yw + F.bob, z);
      F.el.style.transform = `translate3d(${(u - F.ex).toFixed(2)}px,${(v - F.ey).toFixed(2)}px,0) scale(${(F.z0 / zr).toFixed(4)})`;
      F.el.style.opacity = (F.op * clamp((zr - 0.8) / 2.2, 0, 1)).toFixed(3);
      if (F.blur > 0.05) F.el.style.filter = `blur(${F.blur.toFixed(2)}px)`;
      else if (F.el.style.filter) F.el.style.filter = "";
    }
  }

  /* ------------------------------------------------ leaves and petals in the room */
  const parts = [];
  let settledCap = 160, airTarget = 30;
  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    const wr = HR * Math.max(W / H, 0.74);
    xL = -wr / 2; xR = wr / 2;
    f = 0.42 * H * D / HR;                                          // the back wall is 42% of the screen tall
    cx = W / 2; cy = VP * H;                                        // (a lens shift, so the verticals stay upright)
    const dev = devicePixelRatio || 1, fit = (d, cap) => (W * H * d * d > cap ? Math.sqrt(cap / (W * H)) : d);
    dprR = fit(Math.min(dev, 2), 4.2e6); dprB = fit(Math.min(dev, 1.25), 2e6); dprF = fit(Math.min(dev, 1.5), 2.6e6);
    [[cvRoom, dprR], [cvBack, dprB], [cvFront, dprF]].forEach(([c, d]) => { c.width = Math.round(W * d); c.height = Math.round(H * d); });
    for (const br of branches) { br.left = br.host.offsetLeft; br.top = br.host.offsetTop; br.scale = br.host.offsetWidth / br.vb.w; }
    settledCap = Math.round(fine ? clamp(W * H / 6800, 90, 200) : clamp(W * H / 7500, 50, 100));
    airTarget = Math.round(fine ? clamp(W * H / 40000, 14, 36) : clamp(W * H / 48000, 8, 18));
    heroTop = hero.offsetTop; span = hero.offsetHeight - stage.offsetHeight;
    buildRoom(); roomKey = "";
    placeFloaters();
  }

  function particle(kind, x, y, z, air) {
    const leafy = kind === 1;
    const p = {
      kind, x, y, z, vx: 0, vy: 0, vz: 0, air, land: air ? 0 : 1, fade: 1, dying: false, age: 0,
      size: leafy ? rand(0.2, 0.3) : rand(0.13, 0.19),
      vt: leafy ? rand(0.95, 1.3) : rand(0.6, 0.9),                 // falling speed, units a second
      rot: rand(0, TAU), vr: rand(-1.8, 1.8) * (leafy ? 0.6 : 1),
      flip: rand(0, TAU), vf0: (leafy ? rand(1.1, 2.4) : rand(2.1, 5)) * (Math.random() < 0.5 ? -1 : 1),
      ph: rand(0, TAU), pf: leafy ? rand(1.3, 2.3) : rand(0.5, 1.2), sa: rand(0.2, 0.55), dir: rand(0, TAU),
      yaw: rand(0, TAU), face: Math.random() < 0.3 ? 1 : 0,
      spr: (Math.random() * (leafy ? LEAVES.length : PETALS.length)) | 0,
      alpha: rand(0.86, 1),
    };
    p.vf = p.vf0;
    return p;
  }
  const kindOf = () => (Math.random() < 0.5 ? 1 : 0);
  const halfView = zr => (W / 2) / f * zr;                        // half the screen's width at a depth, in units
  function spawn() {
    let x, y, z, fadeIn = false;
    if (Math.random() < 0.7) {                                    // blown in from the branches, above the top of the view
      z = cam.z + rand(1.8, 5.8);
      x = cam.x + (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 1) * halfView(z - cam.z);
      y = Math.max(yC + 0.15, cam.y - (cy / f) * (z - cam.z) - rand(0.3, 1));
    } else {                                                      // or drifting down deeper in the room
      z = rand(Math.max(6.5, cam.z + 2), 12.5); x = rand(xL + 0.4, xR - 0.4); y = yC + rand(0.1, 0.7); fadeIn = true;
    }
    if (z > D - 0.3) return;
    const p = particle(kindOf(), clamp(x, xL + 0.2, xR - 0.2), y, z, true);
    p.vz = WIND.z * 0.6;
    if (fadeIn) p.fade = 0;
    parts.push(p);
  }
  function prewarm() {
    for (let i = 0; i < settledCap * 0.62; i++) {                 // already lying about the floor
      const z = rand(5.6, D - 0.25), hv = Math.min(halfView(z), xR - 0.25);
      parts.push(particle(kindOf(), rand(-hv, hv), yF, z, false));
    }
    for (let i = 0; i < airTarget; i++) {
      const z = rand(3, D - 1), hv = Math.min(halfView(z), xR - 0.3);
      parts.push(particle(kindOf(), rand(-hv, hv), rand(yC + 0.4, yF - 0.6), z, true));
    }
  }
  function loose(kind, sx, sy, vx, vy) {                          // knocked off a branch at screen point sx, sy
    const zr = rand(2.3, 3.4);
    const p = particle(kind, cam.x + (sx - cx) / f * zr, cam.y + (sy - cy) / f * zr, cam.z + zr, true);
    p.vx = vx; p.vy = vy; p.vz = WIND.z * 0.8;
    parts.push(p);
  }
  function strip(b, n, vx, vy) {
    const now = performance.now();
    if (now < b.cool) return;
    b.cool = now + 200;
    const [hx, hy] = toStage(b.br, world(b.x, b.y, b.chain));
    const on = b.petals.filter(p => p.on);
    for (let i = 0; i < Math.min(n, on.length); i++) {
      const pe = on.splice((Math.random() * on.length) | 0, 1)[0];
      pe.on = false;
      pe.el.style.opacity = "0";
      loose(0, hx + rand(-6, 6), hy + rand(-6, 6), vx + rand(-0.3, 0.3), vy + rand(-0.4, 0.1));
      setTimeout(() => { pe.on = true; pe.el.style.opacity = ""; }, rand(3500, 7500));  // the blossom grows it back
    }
  }
  function dropLeaf(l, vx) {
    l.on = false;
    l.el.style.opacity = "0";
    const [hx, hy] = toStage(l.br, world(l.x, l.y, l.chain));
    loose(1, hx, hy, vx, 0);
    setTimeout(() => { l.on = true; l.el.style.opacity = ""; }, rand(8000, 14000));
  }

  /* ------------------------------------------------ the frame */
  function frame(t, dt) {
    const f60 = dt * 60;
    // pointer velocity (px per 60 fps frame) and the eased parallax
    if (Pt.inside) { Pt.vx = Pt.x - Pt.px; Pt.vy = Pt.y - Pt.py; Pt.px = Pt.x; Pt.py = Pt.y; }
    else { Pt.vx *= 0.8; Pt.vy *= 0.8; }
    Pt.speed = Math.hypot(Pt.vx, Pt.vy) / f60;
    const ease = Math.min(1, 3.2 * dt);
    Pt.sx += (Pt.nx - Pt.sx) * ease; Pt.sy += (Pt.ny - Pt.sy) * ease;

    // camera: a little parallax, and the dolly into the room as the page scrolls
    const pz = DOLLY * smooth(progress()), z0 = cam.z;
    cam.x = Pt.sx * 0.32; cam.y = EYE + Pt.sy * 0.2;
    cam.z += (pz - cam.z) * Math.min(1, dt * 7);
    cam.vz = (cam.z - z0) / dt;
    const key = cam.x.toFixed(4) + cam.y.toFixed(4) + cam.z.toFixed(4);
    if (key !== roomKey) { drawRoom(); roomKey = key; }
    if (cue) cue.style.setProperty("--gone", clamp(cam.z / 0.8, 0, 1).toFixed(3));

    wind(t);

    // the branches hang in the opening: they slide with the camera and leave the frame as it moves in
    const out = clamp(cam.z / 2.6, 0, 1);
    for (const br of branches) {
      const side = br.corner === "tl" ? -1 : 1;
      br.ox = -f * cam.x / ZB * 0.35 + side * out * W * 0.18;
      br.oy = -f * (cam.y - EYE) / ZB * 0.35 - out * H * 0.12;
      br.host.style.transform = `translate3d(${br.ox.toFixed(2)}px,${br.oy.toFixed(2)}px,0) scale(${(1 + out * 0.35).toFixed(3)})`;
      br.host.style.opacity = (1 - out).toFixed(3);
    }
    for (const tw of twigs) {
      const d = tw.depth, torque = tw.dx * WIND.by - tw.dy * WIND.bx;
      const target = torque * GAIN[d] * (1 + 0.25 * Math.sin(t * tw.f2 + tw.ph))
        + Math.sin(t * tw.f1 + tw.ph) * BREEZE[d]
        + Math.sin(t * tw.f2 + tw.ph * 1.7) * BREEZE[d] * 1.3 * WIND.g;
      tw.v += ((target - tw.a) * STIFF[d] - tw.v * DAMP[d]) * dt;
      tw.a += tw.v * dt;
      tw.g.setAttribute("transform", `rotate(${tw.a.toFixed(2)} ${tw.px.toFixed(1)} ${tw.py.toFixed(1)})`);
    }
    for (const b of blossoms) {
      const target = Math.sin(t * 0.005 + b.ph) * (1 + 3.5 * WIND.g);
      b.fv += ((target - b.fl) * 60 - b.fv * 5.5) * dt;
      b.fl += b.fv * dt;
      b.g.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${(b.r0 + b.fl).toFixed(1)}) scale(${(b.s * b.pop).toFixed(3)})`);
    }
    // brushing a branch: twigs get knocked, blossoms lose petals
    if (Pt.inside && Pt.speed > 1.5 && out < 0.5) {
      const vx = Pt.vx / f60, vy = Pt.vy / f60;
      for (const b of blossoms) {
        const [hx, hy] = toStage(b.br, world(b.x, b.y, b.chain));
        if (Math.hypot(hx - Pt.x, hy - Pt.y) < b.r * b.br.scale + 14) {
          strip(b, 1 + ((Pt.speed / 12) | 0), vx * 0.02, vy * 0.02 - 0.2);
          b.fv += (vx > 0 ? 1 : -1) * Math.min(Pt.speed * 18, 180);
        }
      }
      for (const tw of twigs) {
        const [hx, hy] = toStage(tw.br, world(tw.mid[0], tw.mid[1], tw.full));
        if (Math.hypot(hx - Pt.x, hy - Pt.y) < 22 * tw.br.scale + 10) tw.v += Math.sign(tw.dx * vy - tw.dy * vx) * Math.min(Pt.speed * 3, 45) * KICK[tw.depth];
      }
    }
    // gusts shake a few petals and leaves loose
    if (WIND.g > 0.3) {
      const pb = WIND.g * WIND.g * 0.008 * f60, pl = WIND.g ** 3 * 0.0015 * f60;
      for (const b of blossoms) if (Math.random() < pb) strip(b, 1, WIND.x * 0.5, -0.1);
      for (const l of leaves) if (l.on && Math.random() < pl) dropLeaf(l, WIND.x * 0.5);
    }

    // the pointer on the floor: its movement sweeps
    const fp = Pt.inside ? floorAt(Pt.x, Pt.y) : null;
    if (fp && floorVel.on) {
      const k = Math.min(1, dt * 18);
      floorVel.x += ((fp[0] - floorVel.fx) / dt - floorVel.x) * k;
      floorVel.z += ((fp[1] - floorVel.fz) / dt - floorVel.z) * k;
    } else { floorVel.x *= 0.8; floorVel.z *= 0.8; }
    floorVel.on = !!fp;
    if (fp) { floorVel.fx = fp[0]; floorVel.fz = fp[1]; }
    floorVel.speed = Math.hypot(floorVel.x, floorVel.z);

    step(t, dt, fp);
    floatersFrame(t);
    draw();
  }

  function step(t, dt, fp) {
    // keep the air lightly filled, and the floor from filling up
    let air = 0, settled = 0;
    for (const p of parts) if (p.air) air++; else if (!p.dying) settled++;
    if (air < airTarget * (1 + WIND.g * 0.5) && Math.random() < dt * airTarget / 5) spawn();
    if (settled > settledCap) {
      let old = null;
      for (const p of parts) if (!p.air && !p.dying && (!old || p.age > old.age)) old = p;
      if (old) old.dying = true;
    }
    const sp = Math.min(floorVel.speed, 12), sweep = fp && sp > 0.5, R = 0.5 + sp * 0.035;
    const stir = Pt.inside && Pt.speed > 0.4, push = cam.vz > 0.05 ? cam.vz : 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], leafy = p.kind === 1;
      p.age += dt;
      if (p.fade < 1 && !p.dying) p.fade = Math.min(1, p.fade + dt * 1.4);
      if (p.dying && (p.fade -= dt * 0.35) <= 0) { parts.splice(i, 1); continue; }
      // the sweeper: leaves near the pointer on the floor are kicked up along its path
      if (sweep && p.y > yF - 1.1) {
        const dx = p.x - fp[0], dz = p.z - fp[1], d = Math.hypot(dx, dz);
        if (d < R) {
          const w = (1 - d / R) ** 1.4, n = 1 / (d + 1e-3);
          p.air = true; p.dying = false; p.fade = Math.max(p.fade, 0.6);
          p.vx += (floorVel.x * 0.5 + dx * n * sp * 0.22) * w;
          p.vz += (floorVel.z * 0.5 + dz * n * sp * 0.22) * w;
          p.vy = Math.max(-4.2, p.vy - (0.8 + sp * 0.3) * w * rand(0.6, 1.2));
          p.vf += rand(2, 6) * w * Math.sign(p.vf || 1); p.vr += rand(-2.5, 2.5) * w;
        }
      }
      if (p.air) {
        const zr = p.z - cam.z;
        // the pointer stirs the air it passes through
        if (stir && zr > 0.5) {
          const [u, v] = proj(p.x, p.y, p.z), dx = u - Pt.x, dy = v - Pt.y, Rs = 70 + 260 / zr, d2 = dx * dx + dy * dy;
          if (d2 < Rs * Rs) {
            const w = (1 - Math.sqrt(d2) / Rs) ** 2, k = zr / f * 60 * w * 0.05;
            p.vx += Pt.vx * k; p.vy += Pt.vy * k;
            p.vf += 0.25 * w * Math.sign(p.vf || 1);
          }
        }
        // the camera moving in pushes the air aside
        if (push && zr < 3.2 && zr > 0) {
          const w = (1 - zr / 3.2) * push * dt;
          p.vx += Math.sign(p.x - cam.x || 1) * w * 2.2; p.vy -= w * 1.2;
        }
        // leaves swing like a pendulum; petals flutter and drift
        p.ph += p.pf * dt;
        const sw = Math.sin(p.ph) * p.sa;
        const tvx = WIND.x + Math.cos(p.dir) * sw, tvz = WIND.z * 0.7 + Math.sin(p.dir) * sw * 0.6;
        let tvy = p.vt * (leafy ? 0.35 + 0.9 * Math.cos(p.ph) ** 2 : 0.85 + 0.3 * Math.sin(p.flip * 0.5));
        tvy -= WIND.lift * (0.6 + 0.4 * Math.sin(t * 0.003 + p.ph));
        const k = Math.min(1, dt * (leafy ? 1.5 : 2));
        p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k; p.vy += (tvy - p.vy) * Math.min(1, dt * 1.35);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += p.vr * dt; p.vr += (Math.sign(p.vr || 1) * 0.9 - p.vr) * dt * 0.6;
        p.flip += p.vf * dt; p.vf += (p.vf0 - p.vf) * dt * 0.6;
        // the walls
        if (p.x < xL + 0.12) { p.x = xL + 0.12; p.vx = Math.abs(p.vx) * 0.3; }
        else if (p.x > xR - 0.12) { p.x = xR - 0.12; p.vx = -Math.abs(p.vx) * 0.3; }
        if (p.z > D - 0.1) { p.z = D - 0.1; p.vz = -Math.abs(p.vz) * 0.3; }
        if (p.y < yC + 0.1) { p.y = yC + 0.1; p.vy = Math.abs(p.vy) * 0.2; }
        if (zr < 0.3 || p.z < ZN) { parts.splice(i, 1); continue; }
        // coming down to the floor it lies over flat, and settles
        p.land = clamp(1 - (yF - p.y) / 0.55, 0, 1);
        if (p.y >= yF) {
          p.y = yF; p.air = false; p.land = 1; p.vy = 0; p.vx *= 0.35; p.vz *= 0.35;
          p.yaw = p.rot; p.face = Math.cos(p.flip) < 0 ? 1 : 0; p.age = 0;
        }
      } else {                                                    // sliding to a stop on the floor
        const k = Math.exp(-dt * 6);
        p.vx *= k; p.vz *= k;
        p.x = clamp(p.x + p.vx * dt, xL + 0.12, xR - 0.12); p.z = clamp(p.z + p.vz * dt, ZN, D - 0.12);
        p.yaw += (p.vx * 0.6 - p.vz * 0.4) * dt;
      }
    }
  }

  /* ------------------------------------------------ drawing the leaves */
  const list = [];
  function draw() {
    cB.setTransform(1, 0, 0, 1, 0, 0); cB.clearRect(0, 0, cvBack.width, cvBack.height);
    cF.setTransform(1, 0, 0, 1, 0, 0); cF.clearRect(0, 0, cvFront.width, cvFront.height);
    list.length = 0;
    for (const p of parts) list.push(p);
    for (const F of floaters) if (F.letter) list.push(F);
    list.sort((a, b) => b.z - a.z);                               // far to near
    const split = ZT - cam.z;
    for (const p of list) {
      const zr = p.z - cam.z;
      if (zr < 0.3) continue;
      const back = zr > split, g = back ? cB : cF, dpr = back ? dprB : dprF;
      // the floor's Jacobian at (x, z): how a small step on the floor moves on screen
      const px = p.el ? p.xw : p.x, J00 = f / zr, J01 = -f * (px - cam.x) / (zr * zr), J11 = -f * (yF - cam.y) / (zr * zr);
      if (p.el) {                                                 // a letter's shadow on the floor
        const h = yF - (p.yw + p.bob), a = 0.075 * p.op * clamp((zr - 0.8) / 2.2, 0, 1);
        if (a < 0.004) continue;                                  // wide and soft, so a word's shadows run together
        const [u, v] = proj(p.xw, yF, p.z + h * 0.1), sx = p.ww * 1.9 / SPR_D, sz = 1.6 / SPR_D;
        g.setTransform(J00 * sx * dpr, 0, J01 * sz * dpr, J11 * sz * dpr, u * dpr, v * dpr);
        g.globalAlpha = a;
        g.drawImage(SHADOW, -SPR / 2, -SPR / 2);
        continue;
      }
      const [u, v] = proj(p.x, p.y, p.z), s = f * p.size / zr;
      if (u < -s * 2 || u > W + s * 2 || v < -s * 2 || v > H + s * 3) continue;
      const alpha = p.alpha * p.fade;
      // its shadow: sharper and darker the nearer it is to the floor, falling a little away from the light
      const h = yF - p.y, sa = 0.3 * clamp(1 - h / 4.5, 0, 1) ** 1.6 * alpha;
      if (sa > 0.01) {
        const [su, sv] = proj(p.x, yF, p.z + h * 0.08), ss = p.size * (0.9 + h * 0.3) / SPR_D;
        g.setTransform(J00 * ss * dpr, 0, J01 * ss * dpr, J11 * ss * dpr, su * dpr, sv * dpr);
        g.globalAlpha = sa;
        g.drawImage(SHADOW, -SPR / 2, -SPR / 2);
      }
      // tumbling in the air…
      const leafy = p.kind === 1, k = s / SPR_D, c = Math.cos(p.flip), sxv = Math.max(0.1, Math.abs(c));
      const rot = leafy ? p.rot + Math.sin(p.ph) * 0.7 : p.rot, cr = Math.cos(rot) * k, sr = Math.sin(rot) * k;
      const sy = 1 - 0.16 * Math.abs(Math.sin(p.flip * 0.7 + p.ph));
      let a = cr * sxv, b = sr * sxv, cc = -sr * sy, d = cr * sy, face = c < 0 ? 1 : 0;
      // …or lying on the floor, foreshortened (and a little curled, so it never goes flat to nothing)
      if (p.land > 0) {
        const q = p.size / SPR_D, cw = Math.cos(p.yaw), sw = Math.sin(p.yaw), L = smooth(p.land), curl = 0.14;
        const fa = (J00 * -sw + J01 * cw) * q, fb = J11 * cw * q, fc = (J00 * cw + J01 * sw) * q, fd = J11 * sw * q;
        a = a * (1 - L) + (fa * (1 - curl) + a * curl) * L; b = b * (1 - L) + (fb * (1 - curl) + b * curl) * L;
        cc = cc * (1 - L) + (fc * (1 - curl) + cc * curl) * L; d = d * (1 - L) + (fd * (1 - curl) + d * curl) * L;
        if (L > 0.5) face = p.face;
      }
      g.setTransform(a * dpr, b * dpr, cc * dpr, d * dpr, u * dpr, v * dpr);
      g.globalAlpha = alpha * (p.land > 0.5 ? 0.95 : 0.72 + 0.28 * sxv);
      g.drawImage((leafy ? LEAVES : PETALS)[p.spr][face][zr < 3.2 ? 1 : 0], -SPR / 2, -SPR / 2);
    }
    cB.globalAlpha = 1; cF.globalAlpha = 1;
  }

  /* ------------------------------------------------ start */
  measure();
  prewarm();
  const still = () => { drawRoom(); floatersFrame(0); draw(); };
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { measure(); if (reduce) still(); }, 120); });
  // the lettering is placed from where CSS lays it out, so place it again whenever that changes (the web font arriving)
  let placed = 0;
  const ro = new ResizeObserver(() => { if (placed++) { placeFloaters(); if (reduce) still(); } });
  $$(".room__title, .room__quote", stage).forEach(el => ro.observe(el));

  if (reduce) {                                        // a still room: leaves where they lie, lettering in place
    stage.classList.add("is-live");
    still();
    return;
  }

  // hidden until the landing is revealed, then the branches draw themselves in
  const strokes = $$(".br-stroke", stage), branchLeaves = $$(".br-leaf", stage);
  strokes.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
  branchLeaves.forEach(l => (l.style.opacity = "0"));
  drawRoom(); floatersFrame(0);
  let started = false;
  function intro() {
    if (started) return;
    started = true;
    measure();
    stage.classList.add("is-live");
    if (window.gsap) {
      gsap.to(strokes, { strokeDashoffset: 0, duration: 1.8, ease: "power2.out", stagger: 0.008, delay: 0.3 });
      gsap.to(blossoms, { pop: 1, duration: 1, ease: "back.out(2)", stagger: 0.012, delay: 1 });
      gsap.to(branchLeaves, { opacity: 1, duration: 0.8, stagger: 0.01, delay: 1.2, clearProps: "opacity" });
      // the letters come forward out of the back wall one after another, then the quote
      const L = floaters.filter(F => F.letter), Q = floaters.filter(F => !F.letter);
      gsap.fromTo(L, { intro: 1, op: 0, blur: 10 }, { intro: 0, op: 1, blur: 0, duration: 1.7, ease: "expo.out", stagger: 0.07, delay: 0.25 });
      gsap.fromTo(Q, { intro: 0.35, op: 0, blur: 6 }, { intro: 0, op: 1, blur: 0, duration: 1.4, ease: "expo.out", delay: 1.1 });
      if (cueIn) gsap.fromTo(cueIn, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: "expo.out", delay: 1.7 });
    } else {
      strokes.forEach(p => (p.style.strokeDashoffset = 0));
      blossoms.forEach(b => (b.pop = 1));
      branchLeaves.forEach(l => (l.style.opacity = ""));
      floaters.forEach(F => { F.intro = 0; F.op = 1; F.blur = 0; });
    }
    let last = performance.now();
    const t0 = last;
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = clamp((now - last) / 1000, 0.001, 1 / 20);
      last = now;
      if (!visible || document.hidden) return;
      frame(now - t0, dt);
    })(last);
  }
  document.addEventListener("jt:intro", intro, { once: true });
  setTimeout(intro, 4500);                              // in case the page script never signals
})();
