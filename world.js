/*
 * JanyuTech landing: a moonlit terrain of dark rock and wind-rippled sand, traced with steady green
 * contour lines, and two drivable robots. The scroll (main.js, window.JT_XP) drives the flood and film.
 * The world renders directly while visible; postprocessing runs only during the water transition.
 * Once the film fills the screen, the browser plays the video without a WebGL copy.
 * Everything that glows does so in the ground shader itself: no bloom, no extra passes.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const xp = document.querySelector("[data-xp]");

// no WebGL: the title, the line and the robot cards (links to their pages) over a still backdrop;
// the flood and the film still play with the scroll, in CSS
function flat() {
  xp.classList.remove("is-gl", "is-booting", "is-ready");
  xp.classList.add("is-flat");
  xp.dataset.mode = "select";
}

/* ======================================================================== helpers */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2, G = 9.81;
function rng(seed) {                                   // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simplex(rand) {                               // 2D simplex noise, about -1..1
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const corner = (g, x, y) => { let t = 0.5 - x * x - y * y; if (t < 0) return 0; t *= t; const k = g & 7; return t * t * (GX[k] * x + GY[k] * y); };
  return (x, y) => {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const ii = i & 255, jj = j & 255;
    return 70 * (corner(p[ii + p[jj]], x0, y0) + corner(p[ii + i1 + p[jj + j1]], x0 - i1 + G2, y0 - j1 + G2) + corner(p[ii + 1 + p[jj + 1]], x0 - 1 + 2 * G2, y0 - 1 + 2 * G2));
  };
}
const fbm = (nz, x, y, oct) => { let a = 1, f = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * nz(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };

/* ======================================================================== the world */
async function world() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(hover: none), (pointer: coarse)").matches;
  const low = coarse || matchMedia("(max-width: 760px)").matches;
  const $ = s => xp.querySelector(s), $$ = s => [...xp.querySelectorAll(s)];
  const canvas = $(".xp__gl"), stage = $(".xp__stage");
  // the scroll, as main.js measures it
  const S = window.JT_XP || { q: 0, flood: 0, rise: 0, surf: 0, inView: true };
  xp.classList.add("is-gl", "is-booting");
  xp.dataset.mode = "boot";
  const bootN = $(".xp__boot-n");
  const setBoot = p => { if (bootN) bootN.textContent = String(Math.round(p * 100)).padStart(3, "0"); };

  /* ------------------------------------------------ renderer, scene, camera */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  let dpr = Math.min(devicePixelRatio || 1, low ? 1 : 1.25);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050b14, 0.0105);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1500);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.35;
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); renderer.setAnimationLoop(null); flat(); });

  const U = { uTime: { value: 0 } };

  /* ------------------------------------------------ the ground: a heightfield */
  const WORLD = 360, SEG = low ? 128 : 192, N = SEG + 1, CELL = WORLD / SEG, HALF = WORLD / 2;
  const rand = rng(20260929), nz = simplex(rand);
  // big smooth hills to drive up and fly down, around the start: x, z, radius, height
  const HILLS = [[4, 62, 24, 17], [-58, 18, 20, 12], [52, -24, 26, 15], [-34, -78, 24, 13], [88, 58, 22, 11], [-96, -18, 26, 16], [30, 120, 30, 14]];
  const rawH = (x, z) => {
    let h = fbm(nz, x * 0.0065, z * 0.0065, 4) * 16;
    const r = Math.abs(nz(x * 0.021 + 31.7, z * 0.021 - 11.3));
    h += (1 - r) * (1 - r) * 5.5;                         // ridges
    h += fbm(nz, x * 0.05 + 5.3, z * 0.05 + 2.1, 2) * 1.5; // bumps to fly off
    h += nz(x * 0.22 + 9.1, z * 0.22 - 4.4) * 0.12;       // texture
    for (const [cx, cz, rr, hh] of HILLS) h += hh * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * rr * rr));
    return h;
  };
  const PAD = rawH(0, 0);
  const baseH = (x, z) => {
    let h = lerp(PAD, rawH(x, z), smooth(10, 46, Math.hypot(x, z)));  // a level start; the hills stand back
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += Math.pow(smooth(HALF - 60, HALF - 4, e), 2) * 48;          // the rim: ridges rise at the edge
    return h;
  };
  // Where the finds are (see "things to find" below): a camp in the valley past the western hills, the top of the
  // big hill ahead, and a trail of years in the sand from near the start to the camp. Each spot is levelled a
  // little, and sanded where the writing is in the sand.
  const CAMP = { x: -52, z: 100 }, SUMMIT = { x: 13, z: 61 };
  const TRAIL = (() => {
    const A = [-8, 27], C = [-50, 40], B = [-50, 86];
    const at = t => [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
    const dense = [];
    for (let i = 0, len = 0, prev = A; i <= 400; i++) { const p = at(i / 400); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; dense.push([p, len]); }
    const total = dense[dense.length - 1][1];
    return Array.from({ length: 10 }, (_, k) => {
      const want = total * k / 9, i = Math.max(1, dense.findIndex(d => d[1] >= want));
      const [p] = dense[i], [q] = dense[Math.min(i + 4, dense.length - 1)], [o] = dense[Math.max(i - 4, 0)];
      return { x: p[0], z: p[1], th: Math.atan2(q[0] - o[0], q[1] - o[1]) };   // th: the way the trail runs here
    });
  })();
  const CLEAR = [
    { x: SUMMIT.x, z: SUMMIT.z, r: 10, k: 0.85, sand: 1 },
    { x: CAMP.x, z: CAMP.z - 3, r: 17, k: 0.92, sand: 0.45 },
    ...TRAIL.map(p => ({ x: p.x, z: p.z, r: 7, k: 0.55, sand: 1 })),
  ];
  for (const c of CLEAR) c.h = baseH(c.x, c.z);
  const heightFn = (x, z) => {
    let h = baseH(x, z);
    for (const c of CLEAR) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) h = lerp(h, c.h, c.k * (1 - smooth(c.r * 0.5, c.r, d)));
    }
    return h;
  };
  const sandAt = (x, z) => {
    let s = 0;
    for (const c of CLEAR) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r) s = Math.max(s, c.sand * (1 - smooth(c.r * 0.45, c.r * 0.95, d))); }
    return s;
  };
  const H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = heightFn(-HALF + ix * CELL, -HALF + iz * CELL);
  // exactly the surface that is drawn: each cell is split a-b-d / b-c-d
  function heightAt(x, z) {
    const fx = clamp((x + HALF) / CELL, 0, SEG - 1e-4), fz = clamp((z + HALF) / CELL, 0, SEG - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * N + ix;
    const ha = H[i], hd = H[i + 1], hb = H[i + N], hc = H[i + N + 1];
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  const _n = new THREE.Vector3();
  function normalAt(x, z, e = 0.7, out = _n) {
    return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }
  // sand in flat hollows and grass in patches on gentle slopes (0..1 each)
  const zoneAt = (x, z, slope) => {
    const sandN = fbm(nz, x * 0.018 + 71.2, z * 0.018 - 13.8, 3), grassN = fbm(nz, x * 0.034 - 40.1, z * 0.034 + 22.7, 3);
    const flatK = 1 - smooth(0.04, 0.16, slope);
    const sand = Math.max(smooth(0.18, 0.42, sandN) * flatK, sandAt(x, z));
    const grass = smooth(0.08, 0.36, grassN) * (1 - sand) * (1 - smooth(0.22, 0.42, slope));
    return [sand, grass];
  };
  const terrainGeo = (() => {
    const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3), zone = new Float32Array(N * N * 2);
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix, x = -HALF + ix * CELL, z = -HALF + iz * CELL;
      pos[i * 3] = x; pos[i * 3 + 1] = H[i]; pos[i * 3 + 2] = z;
      const hl = H[iz * N + Math.max(ix - 1, 0)], hr = H[iz * N + Math.min(ix + 1, SEG)];
      const hd = H[Math.max(iz - 1, 0) * N + ix], hu = H[Math.min(iz + 1, SEG) * N + ix];
      _n.set(hl - hr, 2 * CELL, hd - hu).normalize();
      nrm[i * 3] = _n.x; nrm[i * 3 + 1] = _n.y; nrm[i * 3 + 2] = _n.z;
      const [s, g] = zoneAt(x, z, 1 - _n.y);
      zone[i * 2] = s; zone[i * 2 + 1] = g;
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let iz = 0; iz < SEG; iz++) for (let ix = 0; ix < SEG; ix++) {
      const a = iz * N + ix, b = a + N, c = b + 1, d = a + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("aZone", new THREE.BufferAttribute(zone, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  })();

  // Surface detail, generated once and tiled across the ground: grit and pebbles for the rock, wind ripples
  // and grains for the sand. Stored as the slope of each (for the light) and a brightness (for the colour),
  // mipmapped so it's crisp underfoot and melts smoothly with distance instead of shimmering.
  const detail = (() => {
    const S2 = 256, rnd = rng(4242);
    const lattice = n => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
    const tileNoise = (lat, n, x, y) => {                  // value noise that wraps every S2 pixels
      const fx = x / S2 * n, fy = y / S2 * n, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
      const at = (i, j) => lat[((j % n + n) % n) * n + ((i % n + n) % n)];
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      return lerp(lerp(at(ix, iy), at(ix + 1, iy), su), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), su), sv);
    };
    const L = [4, 8, 16, 32, 64].map(n => [n, lattice(n)]);
    const rockH = new Float32Array(S2 * S2), sandH = new Float32Array(S2 * S2), grain = new Float32Array(S2 * S2);
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      const i = y * S2 + x;
      let r = 0, a = 1, n = 0;
      for (const [k, lat] of L) { r += a * tileNoise(lat, k, x, y); n += a; a *= 0.55; }
      const g = rnd();
      grain[i] = g;
      rockH[i] = r / n + (g > 0.94 ? (g - 0.94) * 4 : 0);   // rough ground with the odd pebble
      const warp = tileNoise(L[1][1], 8, x, y) * 2.2 + tileNoise(L[2][1], 16, x, y) * 0.6;
      const ph = (x * 9 + y * 3) / S2 * TAU + warp;          // 9 x 3 whole ripples per tile, so it wraps
      sandH[i] = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.6) * 0.8 + g * 0.08;
    }
    const slope = new Uint8Array(S2 * S2 * 4), tone = new Uint8Array(S2 * S2 * 4);
    const at = (h, x, y) => h[((y + S2) % S2) * S2 + ((x + S2) % S2)];
    const enc = v => Math.max(0, Math.min(255, Math.round(128 + v * 127)));
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      const i = (y * S2 + x) * 4;
      slope[i] = enc((at(rockH, x + 1, y) - at(rockH, x - 1, y)) * 6);
      slope[i + 1] = enc((at(rockH, x, y + 1) - at(rockH, x, y - 1)) * 6);
      slope[i + 2] = enc((at(sandH, x + 1, y) - at(sandH, x - 1, y)) * 2.2);
      slope[i + 3] = enc((at(sandH, x, y + 1) - at(sandH, x, y - 1)) * 2.2);
      tone[i] = Math.round(255 * Math.min(1, rockH[y * S2 + x]));
      tone[i + 1] = Math.round(255 * (0.55 + 0.3 * sandH[y * S2 + x] + 0.15 * grain[y * S2 + x]));
      tone[i + 3] = 255;
    }
    const tex = data => {
      const t = new THREE.DataTexture(data, S2, S2);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      return t;
    };
    return { slope: tex(slope), tone: tex(tone) };
  })();

  // Dark rock and soil, wind-rippled sand in the hollows, and green contour lines that glow on their own
  // (a sharp core and a soft halo, drawn here rather than by a bloom pass). Nothing flashes or moves.
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, envMapIntensity: 0 });
  terrainMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { tSlope: { value: detail.slope }, tTone: { value: detail.tone } });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aZone;\nvarying vec2 vZone;\nvarying vec3 vW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvZone = aZone;\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vZone; varying vec3 vW;
        uniform sampler2D tSlope, tTone;
        
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
        `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float n1 = vn(vW.xz * 0.31);
        vec2 duv = vW.xz / 1.3, duv2 = vW.xz / 4.9 + 0.37;         // the detail tile, at two sizes so it doesn't repeat
        vec4 dt = (texture2D(tTone, duv) + texture2D(tTone, duv2)) * 0.5;
        vec3 rock = mix(vec3(0.014, 0.017, 0.022), vec3(0.05, 0.051, 0.056), n1 * 0.55 + dt.r * 0.45);
        vec3 sand = mix(vec3(0.05, 0.039, 0.026), vec3(0.11, 0.084, 0.055), dt.g);
        vec3 turf = mix(vec3(0.008, 0.024, 0.014), vec3(0.014, 0.042, 0.023), n1);
        diffuseColor.rgb = mix(mix(rock, turf, vZone.y), sand, vZone.x);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {  // grit on the rock and ripples on the sand, as a tilt of the surface that catches the moon
          vec4 sl = (texture2D(tSlope, duv) + texture2D(tSlope, duv2)) - 1.0;   // back to -1..1, both sizes
          vec2 tilt = mix(sl.xy * 0.55, sl.zw * 0.8, vZone.x);
          normal = normalize(normal - (viewMatrix * vec4(tilt.x, 0.0, tilt.y, 0.0)).xyz);
        }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {  // green contour lines, every 1.6 m of height, each fifth one brighter
          float dist = length(vW - cameraPosition);
          float hc = vW.y / 1.6, fh = max(fwidth(vW.y), 1e-4);
          float px = abs(fract(hc + 0.5) - 0.5) * 1.6 / fh;       // pixels to the nearest line
          float dens = 1.0 - smoothstep(0.16, 0.45, fwidth(hc));  // fade where lines would crowd together
          float major = step(0.79, fract((floor(hc + 0.5) + 0.5) / 5.0));
          float core = 1.0 - smoothstep(0.5, 1.5, px);
          float halo = exp(-px * 0.25);
          float far = 0.3 + 0.7 * exp(-dist * 0.011);
          totalEmissiveRadiance += vec3(0.14, 0.95, 0.45) * (core * (0.42 + 0.55 * major) + halo * (0.05 + 0.06 * major)) * dens * far;
        }`);
  };
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  setBoot(0.08);

  /* ------------------------------------------------ sky and stars */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec3 vD;
      void main() {
        float h = vD.y;
        vec3 c = mix(vec3(0.020, 0.043, 0.078), vec3(0.002, 0.004, 0.011), smoothstep(-0.02, 0.45, h));
        c += vec3(0.05, 0.22, 0.42) * exp(-abs(h) * 16.0) * 0.55;
        c += vec3(0.1, 0.9, 0.55) * exp(-abs(h - 0.012) * 90.0) * 0.05;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -2;
  scene.add(sky);
  {
    const n = 1600, p = new Float32Array(n * 3), c = new Float32Array(n * 3), r2 = rng(7);
    for (let i = 0; i < n; i++) {
      const u = r2() * TAU, v = 0.04 + r2() * 0.96, y = v * v, rr = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * rr * 800, y * 800, Math.sin(u) * rr * 800], i * 3);
      const b = 0.4 + r2() * 0.9, blue = r2() < 0.2;
      c.set(blue ? [0.5 * b, 0.8 * b, 1.4 * b] : [b, b, b * 1.1], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: low ? 1.4 : 1.7, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    stars.renderOrder = -1;
    sky.add(stars);
  }

  /* ------------------------------------------------ light: moonlight, and one lamp that goes with the robot */
  scene.add(new THREE.HemisphereLight(0x4d628f, 0x040507, 0.32));
  const moon = new THREE.DirectionalLight(0xaec6ff, 1.55);
  moon.castShadow = true;
  moon.shadow.mapSize.set(low ? 512 : 1024, low ? 512 : 1024);
  Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
  moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);
  const MOON = new THREE.Vector3(-0.45, 0.78, -0.43).normalize().multiplyScalar(60);
  // always in the scene, so the number of lights never changes (that would rebuild every shader)
  const lamp = new THREE.SpotLight(0xd6ecff, 40, 60, 0.55, 0.6, 1.4);
  scene.add(lamp, lamp.target);

  /* ------------------------------------------------ grass: sparse, softly lit tufts */
  const grass = (() => {
    const segs = 3, bp = [], bi = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs, w = 0.5 * (1 - t * 0.9); bp.push(-w, t, 0, w, t, 0); }
    for (let i = 0; i < segs; i++) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
    geo.setIndex(bi);
    const want = low ? 1800 : 6000, off = [], rot = [], scl = [], hue = [];
    const r3 = rng(99), nn = new THREE.Vector3();
    let tries = 0;
    while (off.length / 3 < want && tries++ < want * 30) {
      const x = (r3() - 0.5) * (WORLD - 70), z = (r3() - 0.5) * (WORLD - 70);
      normalAt(x, z, 1, nn);
      const [, g] = zoneAt(x, z, 1 - nn.y);
      if (r3() > g * 0.9 || Math.hypot(x, z) < 6) continue;
      const tuft = 5 + Math.floor(r3() * 11), red = r3() < 0.07;
      for (let k = 0; k < tuft && off.length / 3 < want; k++) {
        const a = r3() * TAU, d = Math.sqrt(r3()) * 0.55, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
        off.push(bx, heightAt(bx, bz) - 0.02, bz);
        rot.push(r3() * TAU);
        scl.push(0.045 + r3() * 0.04, 0.22 + r3() * 0.45);
        hue.push(red || r3() < 0.025 ? 1 : 0);
      }
    }
    geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(off), 3));
    geo.setAttribute("iRot", new THREE.InstancedBufferAttribute(new Float32Array(rot), 1));
    geo.setAttribute("iScale", new THREE.InstancedBufferAttribute(new Float32Array(scl), 2));
    geo.setAttribute("iHue", new THREE.InstancedBufferAttribute(new Float32Array(hue), 1));
    geo.instanceCount = off.length / 3;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBot: { value: new THREE.Vector3(0, -99, 0) } }]),
      vertexShader: `
        attribute vec3 iPos; attribute float iRot; attribute vec2 iScale; attribute float iHue;
        uniform float uTime; uniform vec3 uBot;
        varying float vT; varying float vHue;
        #include <fog_pars_vertex>
        void main() {
          float t = position.y, c = cos(iRot), s = sin(iRot);
          vec3 p = vec3(position.x * iScale.x * c, t * iScale.y, position.x * iScale.x * s);
          float w = sin(uTime * 1.6 + iPos.x * 0.31 + iPos.z * 0.23) * 0.6 + sin(uTime * 3.3 + iPos.x * 1.7) * 0.25;
          vec2 bend = vec2(0.16, 0.07) * (0.6 + w);
          vec2 away = iPos.xz - uBot.xz; float d = length(away);
          float push = (1.0 - smoothstep(0.5, 2.1, d)) * step(abs(iPos.y - uBot.y), 3.0);   // pressed flat and aside under a robot
          bend += away / max(d, 0.001) * push * 1.3;
          p.xz += bend * t * t * iScale.y;
          p.y *= 1.0 - push * 0.6;
          vec4 mvPosition = viewMatrix * vec4(iPos + p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vT = t; vHue = iHue;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying float vT; varying float vHue;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec3 tip = mix(vec3(0.16, 0.95, 0.42), vec3(0.85, 0.1, 0.12), vHue);
          vec3 root = mix(vec3(0.01, 0.05, 0.025), vec3(0.06, 0.008, 0.01), vHue);
          gl_FragColor = vec4(mix(root, tip, pow(vT, 1.4)) * (0.35 + 0.65 * vT), 1.0);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mat;
  })();
  setBoot(0.2);

  /* ------------------------------------------------ tracks, footprints, dust */
  // tyre tracks: a ribbon of quads laid on the ground behind each wheel, all in one ring buffer
  const tracks = (() => {
    const CAP = low ? 7000 : 16000;
    const pos = new Float32Array(CAP * 12), uvs = new Float32Array(CAP * 8), meta = new Float32Array(CAP * 8);
    const idx = new Uint32Array(CAP * 6);
    for (let i = 0; i < CAP; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const aUv = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
    const aMeta = new THREE.BufferAttribute(meta, 2).setUsage(THREE.DynamicDrawUsage);   // laid at, how dark
    g.setAttribute("position", aPos); g.setAttribute("uv", aUv); g.setAttribute("aMeta", aMeta);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: `attribute vec2 aMeta; varying vec2 vUv; varying vec2 vMeta;
        #include <fog_pars_vertex>
        void main() { vUv = uv; vMeta = aMeta; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec2 vMeta;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          if (vMeta.y <= 0.0) discard;
          float age = uTime - vMeta.x;
          float e = abs(vUv.x);                                            // 0 in the middle, 1 at the edge
          float tread = 0.7 + 0.3 * step(0.45, fract(vUv.y * 4.5));        // the tread's bars
          float a = (1.0 - smoothstep(0.72, 1.0, e)) * tread * vMeta.y * (1.0 - smoothstep(70.0, 110.0, age));
          float fresh = exp(-age * 0.55);
          vec3 c = mix(vec3(0.0, 0.004, 0.006), vec3(0.14, 0.95, 0.45) * 1.3, fresh * smoothstep(0.55, 0.95, e));
          gl_FragColor = vec4(c, a * 0.86);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
    let head = 0;
    const wheels = new Map();
    const lay = (i, v, x, z, u, along, t, s) => {
      const k = i * 4 + v;
      pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, z) + 0.025; pos[k * 3 + 2] = z;
      uvs[k * 2] = u; uvs[k * 2 + 1] = along; meta[k * 2] = t; meta[k * 2 + 1] = s;
    };
    // lay track from where this wheel last was to (x, z)
    function add(key, x, z, width, strength, t) {
      const e = wheels.get(key);
      if (!e) { wheels.set(key, { x, z, along: 0 }); return; }
      const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
      if (d < 0.22) return;
      if (d > 3) { e.x = x; e.z = z; return; }                        // a jump or a reset: start afresh
      const px = -dz / d * width * 0.5, pz = dx / d * width * 0.5;
      const i = head; head = (head + 1) % CAP;
      lay(i, 0, e.x - px, e.z - pz, -1, e.along, t, strength);
      lay(i, 1, e.x + px, e.z + pz, 1, e.along, t, strength);
      lay(i, 2, x - px, z - pz, -1, e.along + d, t, strength);
      lay(i, 3, x + px, z + pz, 1, e.along + d, t, strength);
      for (const a of [aPos, aUv, aMeta]) { a.addUpdateRange(i * 4 * a.itemSize, 4 * a.itemSize); a.needsUpdate = true; }
      e.x = x; e.z = z; e.along += d;
    }
    const lift = () => wheels.clear();
    return { add, lift, mat };
  })();

  // footprints: round rubber pads, stamped where a foot comes down
  const prints = (() => {
    const CAP = low ? 900 : 2400;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5], 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const iP = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const iN = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const iM = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);   // stamped at, size, heading
    geo.setAttribute("iP", iP); geo.setAttribute("iN", iN); geo.setAttribute("iM", iM);
    geo.instanceCount = CAP;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: `attribute vec3 iP; attribute vec3 iN; attribute vec3 iM; varying vec2 vUv; varying vec2 vM;
        #include <fog_pars_vertex>
        void main() {
          vec3 up = normalize(iN + vec3(0.0, 1e-4, 0.0));
          vec3 fw = normalize(vec3(sin(iM.z), 0.0, cos(iM.z)));
          vec3 rt = normalize(cross(fw, up)); fw = cross(up, rt);
          vec3 p = iP + (rt * position.x + fw * position.z) * iM.y + up * 0.02;
          vUv = position.xz * 2.0; vM = iM.xy;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec2 vM;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          if (vM.y <= 0.0) discard;
          float age = uTime - vM.x, r = length(vUv);
          float pad = 1.0 - smoothstep(0.78, 0.95, r);
          float rings = 0.75 + 0.25 * step(0.5, fract(r * 3.2));
          float a = pad * rings * (1.0 - smoothstep(90.0, 130.0, age));
          float fresh = exp(-age * 0.5);
          vec3 c = mix(vec3(0.0, 0.004, 0.006), vec3(0.14, 0.95, 0.45) * 1.4, fresh * smoothstep(0.55, 0.9, r));
          gl_FragColor = vec4(c, a * 0.8);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
    let head = 0;
    const nn = new THREE.Vector3();
    function stamp(x, z, size, yaw, t) {
      const i = head; head = (head + 1) % CAP;
      normalAt(x, z, 0.35, nn);
      iP.setXYZ(i, x, heightAt(x, z), z); iN.setXYZ(i, nn.x, nn.y, nn.z); iM.setXYZ(i, t, size, yaw);
      for (const a of [iP, iN, iM]) { a.addUpdateRange(i * 3, 3); a.needsUpdate = true; }
    }
    return { stamp, mat };
  })();

  // dust kicked up by slides and landings: a pool of soft additive points
  const dust = (() => {
    const CAP = 380, p = new Float32Array(CAP * 3), v = new Float32Array(CAP * 3), life = new Float32Array(CAP), size = new Float32Array(CAP);
    const g = new THREE.BufferGeometry();
    const aP = new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage), aL = new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage), aS = new THREE.BufferAttribute(size, 1);
    g.setAttribute("position", aP); g.setAttribute("aLife", aL); g.setAttribute("aSize", aS);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vL;
        void main() { vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z * (0.5 + 0.8 * (1.0 - aLife)); }`,
      fragmentShader: `varying float vL;
        void main() { if (vL <= 0.0) discard; float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vL * vL;
          gl_FragColor = vec4(mix(vec3(0.5, 0.42, 0.32), vec3(0.25, 0.65, 1.0), 0.35) * a * 0.55, 1.0); }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let head = 0, busy = 0;
    const r5 = rng(3);
    function puff(x, y, z, vx, vz, n, spread = 1) {
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % CAP;
        p[i * 3] = x + (r5() - 0.5) * 0.3; p[i * 3 + 1] = y + 0.05; p[i * 3 + 2] = z + (r5() - 0.5) * 0.3;
        v[i * 3] = vx * 0.25 + (r5() - 0.5) * 1.6 * spread; v[i * 3 + 1] = 0.5 + r5() * 1.3 * spread; v[i * 3 + 2] = vz * 0.25 + (r5() - 0.5) * 1.6 * spread;
        life[i] = 1; size[i] = 0.35 + r5() * 0.5;
      }
      aS.needsUpdate = true; busy = 2;
    }
    function step(dt) {
      if (!busy) return;
      let any = false;
      for (let i = 0; i < CAP; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt * 0.9;
        v[i * 3 + 1] -= dt * 0.9; v[i * 3] *= 1 - dt * 1.4; v[i * 3 + 2] *= 1 - dt * 1.4;
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      }
      aP.needsUpdate = true; aL.needsUpdate = true;
      if (!any) busy--;
    }
    return { puff, step, mat };
  })();
  setBoot(0.3);

  /* ------------------------------------------------ things to find: in the sand, in the stone, by a fire
     Four finds, their words taken from the page (XP_FINDS in build/build.py): contact details written in the
     sand on the hilltop ahead, a trail of years in the sand from near the start to a camp, and at the camp,
     behind a giant rock, a fire. The rock's face is cut with where it all started, and two standing stones
     carry the awards. The writing is drawn once into textures (the groove, and in sand the rim it pushes up)
     and laid on the ground or the stone. When a robot gets close the grooves light up green and a card says
     what was found. */
  const fireLight = new THREE.PointLight(0xff7a2e, 0, 36, 1.6);     // always in the scene: a fixed light count
  fireLight.position.set(CAMP.x, heightAt(CAMP.x, CAMP.z) + 1.3, CAMP.z);
  scene.add(fireLight);
  let finds = null, colliders = [];
  async function buildFinds() {
    const cards = new Map($$(".xp__find[data-find]").map(el => [el.dataset.find, el]));
    const carveOf = key => { try { return JSON.parse(cards.get(key)?.dataset.carve || "[]"); } catch (e) { return []; } };
    const RES = low ? 0.5 : 1;                                       // texture size for the writing
    const pause = () => new Promise(r => setTimeout(r, 0));          // let the page breathe between textures
    await Promise.all([document.fonts.load('700 100px "Unbounded"'), document.fonts.load('400 100px "Inter Tight"'),
      document.fonts.load('600 100px "Inter Tight"')]).catch(() => {});

    // one channel of a blurred copy of a drawing, 0..1 (a box blur where the browser can't filter a canvas)
    const canBlur = (() => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 9;
        const x = c.getContext("2d", { willReadFrequently: true }); x.filter = "blur(2px)"; x.fillStyle = "#fff"; x.fillRect(4, 4, 1, 1);
        return x.getImageData(2, 4, 1, 1).data[0] > 0;
      } catch (e) { return false; }
    })();
    const boxBlur = (a, w, h, r) => {
      const t = new Float32Array(a.length), n = 2 * r + 1;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { t[y * w + x] = s / n; s += a[y * w + Math.min(x + r + 1, w - 1)] - a[y * w + Math.max(x - r, 0)]; } }
        for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / n; s += t[Math.min(y + r + 1, h - 1) * w + x] - t[Math.max(y - r, 0) * w + x]; } }
      }
    };
    const channel = (src, blur) => {
      const w = src.width, h = src.height, c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      if (canBlur && blur > 0) x.filter = `blur(${blur}px)`;
      x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
      if (!canBlur && blur > 0) boxBlur(out, w, h, Math.max(1, Math.round(blur)));
      return out;
    };
    // a line of words fitted to maxW; by hand, letter by letter, each a little turned, as if with a stick
    const write = (x, text, cx, cy, px, font, maxW, hand, rnd) => {
      x.font = font(px);
      let w = x.measureText(text).width;
      if (w > maxW) { px *= maxW / w; x.font = font(px); w = maxW; }
      if (!hand) { x.textAlign = "center"; x.fillText(text, cx, cy); return; }
      x.textAlign = "left";
      let at = cx - w / 2;
      for (const ch of text) {
        const cw = x.measureText(ch).width;
        x.save(); x.translate(at + cw / 2, cy + (rnd() - 0.5) * px * 0.08); x.rotate((rnd() - 0.5) * 0.14);
        x.fillText(ch, -cw / 2, 0); x.restore();
        at += cw;
      }
    };
    const SAND_FONT = px => `400 ${px}px "Inter Tight", sans-serif`, CUT_BIG = px => `700 ${px}px "Unbounded", sans-serif`, CUT_TEXT = px => `600 ${px}px "Inter Tight", sans-serif`;
    // grooves from a white-on-black drawing: in sand a soft groove with a raised rim, in stone a sharp V.
    // Returns the colour (alpha: where the writing is) and the normal map (alpha: the groove, for the glow).
    const carve = (W, H, draw, sand) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.textBaseline = "middle";
      draw(x, W, H);
      const g = channel(c, (sand ? 2.2 : 1.2) * RES), wide = channel(c, (sand ? 7 : 2.6) * RES);
      const n = W * H, hgt = new Float32Array(n);
      for (let i = 0; i < n; i++) hgt[i] = sand ? 0.5 * wide[i] - g[i] : -g[i];
      const color = new Uint8Array(n * 4), normal = new Uint8Array(n * 4), base = sand ? [0.09, 0.068, 0.045] : [0.08, 0.075, 0.07];
      const k = (sand ? 3.2 : 7) * RES, srgb = v => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx, j = i * 4;
        const dx = (hgt[y * W + Math.min(xx + 1, W - 1)] - hgt[y * W + Math.max(xx - 1, 0)]) * 0.5 * k;
        const dy = (hgt[Math.min(y + 1, H - 1) * W + xx] - hgt[Math.max(y - 1, 0) * W + xx]) * 0.5 * k;
        const l = Math.hypot(dx, dy, 1);                               // uploaded flipped, so +v runs up the picture
        normal[j] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[j + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
        normal[j + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[j + 3] = Math.round(Math.min(1, g[i] * 1.4) * 255);
        const shade = sand ? 1 - 0.5 * g[i] + 0.22 * Math.max(0, wide[i] - g[i]) : 1 - 0.62 * g[i];
        color[j] = srgb(base[0] * shade); color[j + 1] = srgb(base[1] * shade); color[j + 2] = srgb(base[2] * shade);
        color[j + 3] = Math.round(Math.min(1, wide[i] * (sand ? 2.4 : 2.2)) * 255);
      }
      const tex = (data, srgbSpace) => {
        const t = new THREE.DataTexture(data, W, H);
        t.flipY = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (srgbSpace) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        return t;
      };
      return { map: tex(color, true), normalMap: tex(normal, false) };
    };
    const carvedMaterial = (t, glow, stone) => {
      const m = new THREE.MeshStandardMaterial({
        map: t.map, normalMap: t.normalMap, roughness: stone ? 0.86 : 0.97, metalness: 0,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      m.onBeforeCompile = sh => {
        sh.uniforms.uGlow = glow;
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uGlow;")
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(0.12, 0.9, 0.4) * uGlow * texture2D(normalMap, vNormalMapUv).a * ${stone ? "1.0" : "0.7"};`);
      };
      m.customProgramCacheKey = () => "jt-carve-" + (stone ? "stone" : "sand");
      return m;
    };
    // a strip of ground to write on, lying on the terrain: centred at (x, z), the tops of the letters towards th
    const groundStrip = (x, z, th, w, h, uv, sx = 40, sz = 8) => {
      const fx = Math.sin(th), fz = Math.cos(th), rx = -fz, rz = fx;   // forward, and to the right
      const pos = [], uvs = [], idx = [];
      for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++) {
        const a = i / sx - 0.5, b = j / sz - 0.5, px = x + rx * a * w + fx * b * h, pz = z + rz * a * w + fz * b * h;
        pos.push(px, heightAt(px, pz) + 0.04, pz);
        uvs.push(lerp(uv[0], uv[1], i / sx), lerp(uv[2], uv[3], j / sz));
      }
      for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) { const a = j * (sx + 1) + i, b = a + sx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    // a rock: a lumpy ellipsoid, darker in its hollows; "cut" flattens its front (+z) where the words go
    const rockGeometry = (seed, w, h, d, cut, detailLevel) => {
      let g = new THREE.IcosahedronGeometry(1, detailLevel);
      g.deleteAttribute("normal"); g.deleteAttribute("uv");
      g = mergeVertices(g);
      const r = rng(seed), nzR = simplex(r), o1 = r() * 50, o2 = r() * 50;
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = fbm(nzR, x * 1.2 + o1, y * 1.2 + z * 0.8, 4) * 0.2 + fbm(nzR, z * 3.1 + o2, x * 3.1 - y * 0.7, 2) * 0.06;
        let Z = z * (1 + n) * d / 2;
        if (cut !== undefined && Z > cut) Z = cut;                     // a clean flat face to carve
        pos.setXYZ(i, x * (1 + n) * w / 2, y * (1 + n) * h / 2, Z);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = clamp(0.55 + n * 1.8, 0.28, 1);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    const placed = (g, x, y, z, ry) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));

    const F = ["contact", "journey", "origin", "awards"].map(key => ({ key, glow: { value: 0 }, found: false }));
    const glowOf = key => F.find(f => f.key === key).glow;

    // the rocks: the giant one with the fire behind it, two standing stones by the fire, the ring round the fire
    // and a few boulders, all one mesh
    const ground = (x, z) => heightAt(x, z);
    const ROCK = { x: CAMP.x, z: CAMP.z - 7.5, w: 6.4, h: 5.8, d: 4.6 };
    const STONES = [{ x: CAMP.x - 6.5, z: CAMP.z + 1.5 }, { x: CAMP.x + 6.5, z: CAMP.z + 1.5 }].map(s => ({ ...s, ry: Math.atan2(CAMP.x - s.x, CAMP.z - s.z), w: 3.4, h: 4.6, d: 1.8 }));
    const rockParts = [];
    const rockCut = ROCK.d / 2 * 0.6, rockY = ground(ROCK.x, ROCK.z) + ROCK.h * 0.22;
    rockParts.push(placed(rockGeometry(11, ROCK.w, ROCK.h, ROCK.d, rockCut, low ? 5 : 7), ROCK.x, rockY, ROCK.z, 0));
    const stoneCut = 1.8 / 2 * 0.45;
    STONES.forEach((s, i) => { s.y = ground(s.x, s.z) + s.h * 0.36; rockParts.push(placed(rockGeometry(21 + i, s.w, s.h, s.d, stoneCut, low ? 4 : 5), s.x, s.y, s.z, s.ry)); });
    for (let i = 0; i < 9; i++) {                                    // the ring of stones round the fire
      const a = i / 9 * TAU, x = CAMP.x + Math.cos(a) * 1.05, z = CAMP.z + Math.sin(a) * 1.05;
      rockParts.push(placed(rockGeometry(40 + i, 0.55, 0.36, 0.45, undefined, 1), x, ground(x, z) + 0.08, z, a));
    }
    const r6 = rng(77);
    for (const [bx, bz, sz] of [[CAMP.x - 11, CAMP.z - 9, 2.6], [CAMP.x + 10, CAMP.z - 11, 3.4], [CAMP.x + 13, CAMP.z + 7, 2.2], [SUMMIT.x - 9, SUMMIT.z + 6, 2.8], [TRAIL[4].x - 8, TRAIL[4].z + 3, 3.2], [22, 18, 2.4], [-24, -30, 3.6], [48, 30, 3]]) {
      rockParts.push(placed(rockGeometry(90 + Math.round(bx * 7 + bz), sz * (1.1 + r6() * 0.5), sz, sz * (0.9 + r6() * 0.4), undefined, low ? 3 : 4), bx, ground(bx, bz) + sz * 0.2, bz, r6() * TAU));
      colliders.push({ x: bx, z: bz, r: sz * 0.55 });
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.085, 0.08, 0.075), vertexColors: true, roughness: 0.92, metalness: 0 });
    rockMat.onBeforeCompile = sh => {
      sh.uniforms.tSlope = { value: detail.slope };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vW; uniform sampler2D tSlope;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          {  // grit, mapped on the three planes and blended by the way the surface faces
            vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
            vec3 bw = pow(abs(wn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
            vec2 a = texture2D(tSlope, vW.zy / 0.9).xy * 2.0 - 1.0, b = texture2D(tSlope, vW.xz / 0.9).xy * 2.0 - 1.0, c = texture2D(tSlope, vW.xy / 0.9).xy * 2.0 - 1.0;
            vec3 tw = bw.x * vec3(0.0, a.y, a.x) + bw.y * vec3(b.x, 0.0, b.y) + bw.z * vec3(c.x, c.y, 0.0);
            normal = normalize(normal - (viewMatrix * vec4(tw * 0.9, 0.0)).xyz);
          }`);
    };
    const rocks = new THREE.Mesh(mergeGeometries(rockParts), rockMat);
    rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks);
    colliders.push({ x: ROCK.x, z: ROCK.z, r: 3.1 }, ...STONES.map(s => ({ x: s.x, z: s.z, r: 1.35 })), { x: CAMP.x, z: CAMP.z, r: 1.3 });
    await pause();

    // the rock's face: where it started
    const origin = carveOf("origin")[0] || [];
    const oT = carve(Math.round(1024 * RES), Math.round(768 * RES), (x, W, H) => {
      write(x, origin[0] || "", W / 2, H * 0.27, 150 * RES, CUT_BIG, W * 0.86);
      write(x, origin[1] || "", W / 2, H * 0.52, 92 * RES, CUT_BIG, W * 0.7);
      write(x, origin[2] || "", W / 2, H * 0.74, 50 * RES, CUT_TEXT, W * 0.86);
    }, false);
    const oPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.15), carvedMaterial(oT, glowOf("origin"), true));
    oPlane.position.set(ROCK.x, rockY + ROCK.h * 0.12, ROCK.z + rockCut + 0.03);
    scene.add(oPlane);
    await pause();

    // the standing stones: the awards, one list on each
    const awards = carveOf("awards");
    const split = t => {                                             // a long name on two lines, broken near the middle
      if (t.length < 15 || !t.includes(" ")) return [t];
      const mid = t.length / 2, at = [...t].map((c, i) => (c === " " ? i : -1)).filter(i => i > 0).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
      return [t.slice(0, at), t.slice(at + 1)];
    };
    const aT = carve(Math.round(1024 * RES), Math.round(768 * RES), (x, W, H) => {
      awards.slice(0, 2).forEach((lines, k) => {
        const cx = W * (0.25 + 0.5 * k), cw = W * 0.44, rows = lines.slice(1).flatMap(split);
        write(x, lines[0] || "", cx, H * 0.13, 70 * RES, CUT_BIG, cw);
        rows.forEach((line, i) => write(x, line, cx, H * (0.3 + i * (0.64 / Math.max(rows.length - 1, 1))), 58 * RES, CUT_TEXT, cw));
      });
    }, false);
    const aMat = carvedMaterial(aT, glowOf("awards"), true);
    STONES.forEach((s, k) => {
      const g = new THREE.PlaneGeometry(2.5, 3.3), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + 0.5 * k);   // each stone its half of the picture
      g.translate(0, 0.2, stoneCut + 0.03).rotateY(s.ry).translate(s.x, s.y, s.z);
      scene.add(new THREE.Mesh(g, aMat));
    });
    await pause();

    // in the sand: the contact details on the hilltop, and the years along the trail
    const contact = carveOf("contact")[0] || [];
    const cT = carve(Math.round(1024 * RES), Math.round(256 * RES), (x, W, H) => {
      const rnd = rng(5);
      write(x, contact[0] || "", W / 2, H * 0.33, 86 * RES, SAND_FONT, W * 0.92, true, rnd);
      write(x, contact[1] || "", W / 2, H * 0.72, 80 * RES, SAND_FONT, W * 0.7, true, rnd);
    }, true);
    scene.add(new THREE.Mesh(groundStrip(SUMMIT.x, SUMMIT.z, 0, 12, 3, [0, 1, 0, 1]), carvedMaterial(cT, glowOf("contact"), false)));
    await pause();
    const years = carveOf("journey");
    const cols = 2, rows = 5, CW = 1024 * RES, CH = 200 * RES;
    const tT = carve(Math.round(CW * cols), Math.round(1024 * RES), (x) => {
      const rnd = rng(9);
      years.slice(0, cols * rows).forEach((lines, k) => {
        const cx = (k % cols + 0.5) * CW, top = Math.floor(k / cols) * CH;
        write(x, lines[0] || "", cx, top + CH * 0.34, 96 * RES, SAND_FONT, CW * 0.9, true, rnd);
        write(x, lines[1] || "", cx, top + CH * 0.76, 52 * RES, SAND_FONT, CW * 0.92, true, rnd);
      });
    }, true);
    const TH = 1024 * RES;
    const strips = TRAIL.slice(0, years.length).map((p, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      return groundStrip(p.x, p.z, p.th, 10.2, 2, [c / cols, (c + 1) / cols, 1 - (r + 1) * CH / TH, 1 - r * CH / TH]);
    });
    if (strips.length) scene.add(new THREE.Mesh(mergeGeometries(strips), carvedMaterial(tT, glowOf("journey"), false)));
    await pause();

    // the fire: logs, flames that always face you, rising embers, and a warm glow that shows from far off
    const fy = ground(CAMP.x, CAMP.z);
    const logs = [];
    for (let i = 0; i < 4; i++) logs.push(new THREE.CylinderGeometry(0.09, 0.11, 1.4, 7).rotateZ(Math.PI / 2 - 0.25).rotateY(i / 4 * Math.PI + 0.3).translate(CAMP.x, fy + 0.2, CAMP.z));
    const logMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.02, 0.014, 0.01), roughness: 0.95, emissive: new THREE.Color(0.9, 0.22, 0.03), emissiveIntensity: 0.25 });
    scene.add(new THREE.Mesh(mergeGeometries(logs), logMat));
    const flameMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aSeed; uniform float uTime; varying vec2 vUv; varying float vSeed;
        void main() {
          vUv = uv; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = 1.0 + 0.3 * aSeed;
          mv.xy += vec2(position.x * 1.25 * s, (position.y + 0.5) * 2.1 * s);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vSeed;
        float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
        void main() {
          vec2 p = vUv;
          float q = n(vec2(p.x * 3.0 + vSeed * 7.0, p.y * 3.4 - uTime * 2.3)) * 0.65 + n(vec2(p.x * 7.0, p.y * 7.0 - uTime * 3.7)) * 0.35;
          float w = 1.0 - abs(p.x - 0.5) * 2.0;
          float body = smoothstep(0.0, 0.45, w - p.y * 0.95 + (q - 0.5) * 0.6);
          float f = body * (1.0 - smoothstep(0.45, 1.0, p.y + (q - 0.5) * 0.35));
          vec3 col = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.7, 0.28), smoothstep(0.25, 0.95, f));
          gl_FragColor = vec4(col * f * 2.2, 1.0);
        }`,
    });
    const flameGeo = new THREE.PlaneGeometry(1, 1);
    for (const seed of [0, 0.6]) {
      const g = flameGeo.clone();
      g.setAttribute("aSeed", new THREE.Float32BufferAttribute([seed, seed, seed, seed], 1));
      const m = new THREE.Mesh(g, flameMat);
      m.position.set(CAMP.x + (seed - 0.3) * 0.25, fy + 0.15, CAMP.z + (seed - 0.3) * 0.2);
      m.frustumCulled = false; m.renderOrder = 3;
      scene.add(m);
    }
    const EMB = 36, eSeed = new Float32Array(EMB);
    for (let i = 0; i < EMB; i++) eSeed[i] = i / EMB;
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMB * 3), 3));
    eGeo.setAttribute("aSeed", new THREE.BufferAttribute(eSeed, 1));
    const emberMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 } },
      vertexShader: `attribute float aSeed; uniform float uTime, uScale; varying float vT;
        void main() {
          float t = fract(uTime * (0.16 + fract(aSeed * 7.3) * 0.2) + aSeed * 13.7);
          vec3 p = vec3(sin(aSeed * 91.0 + t * 5.0) * (0.25 + t * 0.9), 0.3 + t * 5.5, cos(aSeed * 57.0 + t * 4.0) * (0.25 + t * 0.9));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * 0.05 * (1.0 - t) / -mv.z;
          vT = t;
        }`,
      fragmentShader: `varying float vT;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * (1.0 - smoothstep(0.1, 0.5, d)) * (1.0 - vT) * 1.6, 1.0); }`,
    });
    const embers = new THREE.Points(eGeo, emberMat);
    embers.position.set(CAMP.x, fy, CAMP.z); embers.frustumCulled = false; embers.renderOrder = 3;
    scene.add(embers);
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uI: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * 9.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uI; varying vec2 vUv;
        void main() { float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.42, 0.12) * pow(max(0.0, 1.0 - d), 2.4) * 0.34 * uI, 1.0); }`,
    });
    const halo = new THREE.Mesh(flameGeo, haloMat);
    halo.position.set(CAMP.x, fy + 1.4, CAMP.z); halo.frustumCulled = false; halo.renderOrder = 2;
    scene.add(halo);

    // what counts as found: close to the writing, or at the fire for the rock's face and the stones
    const near = (x, z, p, r) => (x - p.x) ** 2 + (z - p.z) ** 2 < r * r;
    const tests = {
      contact: (x, z) => near(x, z, SUMMIT, 8),
      journey: (x, z) => TRAIL.some(p => near(x, z, p, 5.5)),
      origin: (x, z) => near(x, z, CAMP, 8.5),
      awards: (x, z) => STONES.some(s => near(x, z, s, 6.5)),
    };
    return {
      F, cards, tests,
      update(t, dt) {
        const fl = reduce ? 0.9 : 0.8 + 0.1 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 17.1 + 1.7) + 0.05 * Math.sin(t * 31.7 + 0.4);
        fireLight.intensity = 75 * fl;
        haloMat.uniforms.uI.value = fl;
        logMat.emissiveIntensity = 0.18 + 0.12 * fl;
        flameMat.uniforms.uTime.value = emberMat.uniforms.uTime.value = t;
        emberMat.uniforms.uScale.value = Hh * dpr;
        for (const f of F) f.glow.value += ((f.found ? 1 : 0) - f.glow.value) * damp(1.4, dt);
      },
    };
  }

  /* ------------------------------------------------ the robots */
  const BOTS = {
    rover: { key: "rover", name: "Defence Bot", file: "defence-rover", scale: 1.75, vmax: 13.5, vrev: 5, acc: 9.5, brake: 17, turn: 2.2, turnMin: 0.45, grip: 6.5, scrub: 0.8, roll: 0.45, drag: 0.011, hop: 4.8, camD: 5.8, camH: 2.1 },
    quad: { key: "quad", name: "Quad Bot", file: "quadruped-robot", scale: 1.35, vmax: 6.8, vrev: 3, acc: 7.5, brake: 13, turn: 2.6, turnMin: 0.95, grip: 14, scrub: 0.6, roll: 0.9, drag: 0.02, hop: 4.3, camD: 5.2, camH: 2.2 },
  };
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const modelURL = f => new URL(`./assets/models/${f}.glb`, import.meta.url).href;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4();

  // A steady rim light keeps the robots legible against the terrain.
  function botShader(m, R) {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uRim: R.rim, uRimC: R.rimC });
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uRim; uniform vec3 uRimC;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uRimC * fr * uRim;`);
    };
    m.customProgramCacheKey = () => "jt-bot";
  }
  function loadBot(R) {
    return loader.loadAsync(modelURL(R.file)).then(g => rig(R, g.scene));
  }
  const groundGlow = (() => {
    const surface = document.createElement("canvas"); surface.width = surface.height = 128;
    const ctx = surface.getContext("2d");
    const light = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    light.addColorStop(0, "rgba(255,255,255,0.8)");
    light.addColorStop(0.35, "rgba(255,255,255,0.35)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = light; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(surface);
  })();
  function rig(R, model) {
    R.rim = { value: 0.55 }; R.rimC = { value: new THREE.Color(0.25, 0.6, 1.0) };
    model.rotation.y = Math.PI / 2;                          // the models face -x; the robot's forward is +z
    model.scale.setScalar(R.scale);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (!m || !m.isMeshStandardMaterial || m.userData.jt) return;
      m.userData.jt = true;
      m.envMapIntensity = 0.8;
      if (/glass/i.test(m.name)) { m.emissive = new THREE.Color(0.1, 0.8, 1); m.emissiveIntensity = 1.4; }
      if (/cobalt/i.test(m.name)) { m.emissive = new THREE.Color(0.05, 0.25, 1); m.emissiveIntensity = 0.35; }
      botShader(m, R);
    });
    const g = new THREE.Group();
    g.add(model); g.visible = false;
    scene.add(g);
    g.updateMatrixWorld(true);
    Object.assign(R, { group: g, model, wheels: [], legs: null, ant: null });
    R.tilt = model.getObjectByName("BodyTilt");
    R.tilt0 = R.tilt ? R.tilt.position.clone() : null;
    // wheels, measured in the group's frame (x is the robot's left, z its forward, metres)
    model.traverse(o => {
      if (!/^Wheel_[FR][LR]$/.test(o.name)) return;
      const box = new THREE.Box3().setFromObject(o);
      g.worldToLocal(o.getWorldPosition(_v));
      R.wheels.push({ pivot: o, x: _v.x, z: _v.z, r: (box.max.y - box.min.y) / 2, w: box.max.x - box.min.x });
    });
    const ant = model.getObjectByName("Antenna");
    if (ant) R.ant = { node: ant, p: 0, pv: 0, r: 0, rv: 0 };
    if (model.getObjectByName("Hip_FL")) rigLegs(R, model);
    const moving = new Set([...R.wheels.map(w => w.pivot), ant, ...(R.legs || []).flatMap(L => [L.hip, L.knee])]);
    mergeStatic(R.tilt || model, o => moving.has(o));
    // a soft green pool of light on the ground (brighter when it's the one you're pointing at), and a dark
    // contact shadow under the body so it stands on the ground rather than hovering over it
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: groundGlow, color: 0x3dff8e, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1 }));
    ring.position.y = 0.025;
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(R.legs ? 1.9 : 1.7, R.legs ? 1.5 : 1.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: groundGlow, color: 0x000000, transparent: true, opacity: 0.75,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    contact.position.y = 0.03;
    g.add(ring, contact); R.ring = ring;
    return R;
  }
  // one mesh per material for the parts that don't move by themselves (fewer draw calls)
  function mergeStatic(root, moving) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), sets = new Map();
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (moving(p)) return;
      if (!sets.has(o.material)) sets.set(o.material, []);
      sets.get(o.material).push(o);
    });
    for (const [material, meshes] of sets) {
      if (meshes.length < 2) continue;
      const geos = meshes.map(o => {
        const g = new THREE.BufferGeometry(), src = o.geometry;
        for (const name of ["position", "normal", "uv"]) {
          const a = src.attributes[name];
          if (!a) continue;
          const f = new Float32Array(a.count * a.itemSize), get = [a.getX, a.getY, a.getZ, a.getW];
          for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = get[k].call(a, i);
          g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
        }
        g.setIndex(src.index ? [...src.index.array] : [...Array(src.attributes.position.count).keys()]);
        return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      });
      const names = ["position", "normal", "uv"].filter(n => geos.every(g => g.attributes[n]));
      for (const g of geos) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, material);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      for (const o of meshes) { o.removeFromParent(); o.geometry.dispose(); }
    }
  }
  // a leg: the hip rolls it out sideways, the thigh swings on the hip and the shin on the knee; worked out
  // in BodyTilt's frame (model units) so the body can bob and pitch over feet that stay planted
  function rigLegs(R, model) {
    const tilt = R.tilt;
    model.updateMatrixWorld(true);
    _inv.copy(tilt.matrixWorld).invert();
    R.legs = ["FL", "FR", "RL", "RR"].map(T => {
      const hip = model.getObjectByName("Hip_" + T), knee = model.getObjectByName("Knee_" + T), tip = new THREE.Box3();
      knee.traverse(m => { if (m.isMesh && /rubber/i.test(m.material.name)) { m.geometry.computeBoundingBox(); tip.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(_inv, m.matrixWorld))); } });
      const A = hip.position.clone(), K = A.clone().add(knee.position), F = new THREE.Vector3((tip.min.x + tip.max.x) / 2, tip.min.y, (tip.min.z + tip.max.z) / 2);
      const a0 = Math.atan2(K.y - A.y, K.x - A.x), b0 = Math.atan2(F.y - K.y, F.x - K.x), base = Math.atan2(F.y - A.y, F.x - A.x);
      return {
        hip, knee, A, a0, b0, l1: Math.hypot(K.x - A.x, K.y - A.y), l2: Math.hypot(F.x - K.x, F.y - K.y),
        z0: F.z - A.z, bend: Math.sign(wrap(a0 - base)) || 1,
        rest: F.clone().applyMatrix4(tilt.matrix),                       // the foot at rest, in the model's frame
        phase: T === "FL" || T === "RR" ? 0 : 0.5, down: true,          // a trot: diagonal pairs together
      };
    });
    R.gait = { ph: 0, amp: 0 };
  }
  function legIK(L, x, y, z) {
    const dy = y - L.A.y, dz = z - L.A.z, l1 = L.l1, l2 = L.l2;
    const yp = -Math.sqrt(Math.max(dy * dy + dz * dz - L.z0 * L.z0, 1e-6));
    const roll = Math.atan2(dz, dy) - Math.atan2(L.z0, yp), px = x - L.A.x;
    const dd = clamp(Math.hypot(px, yp), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const t1 = Math.atan2(yp, px) + L.bend * Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
    const t2 = Math.atan2(yp - l1 * Math.sin(t1), px - l1 * Math.cos(t1));
    L.hip.rotation.set(roll, 0, t1 - L.a0);
    L.knee.rotation.z = t2 - L.b0 - (t1 - L.a0);
  }

  /* ------------------------------------------------ the one being driven */
  const car = {
    R: null, x: 0, z: 0, y: PAD, vx: 0, vz: 0, vy: 0, vyT: 0, th: 0, w: 0, vf: 0, vl: 0, ground: true,
    pitch: 0, roll: 0, pv: 0, rv: 0, acc: 0, sus: 0, susV: 0, up: new THREE.Vector3(0, 1, 0), shake: 0, sand: 0,
  };
  const input = { thr: 0, steer: 0, hop: false, joy: null };
  let mode = "boot";                                          // boot, select, drive
  let hover = null;

  // stand a robot's group on the ground at (x, z), turned to th, leaning with the ground under it
  const _fw = new THREE.Vector3(), _lt = new THREE.Vector3(), _basis = new THREE.Matrix4();
  function placeBot(R, x, z, th, y, up) {
    const g = R.group;
    g.position.set(x, y, z);
    _fw.set(Math.sin(th), 0, Math.cos(th));
    _fw.addScaledVector(up, -_fw.dot(up)).normalize();
    _lt.crossVectors(up, _fw);                               // the robot's left
    _basis.makeBasis(_lt, up, _fw);
    g.quaternion.setFromRotationMatrix(_basis);
    g.updateMatrixWorld(true);
  }
  // the ground plane under the robot, from four points about where its wheels or feet are; returns the mean height
  function groundUp(R, x, z, th, out) {
    const fx = Math.sin(th), fz = Math.cos(th), lx = fz, lz = -fx;
    const b = R.key === "rover" ? 0.49 : 0.62, t = R.key === "rover" ? 0.53 : 0.5;
    const hFL = heightAt(x + fx * b + lx * t, z + fz * b + lz * t), hFR = heightAt(x + fx * b - lx * t, z + fz * b - lz * t);
    const hRL = heightAt(x - fx * b + lx * t, z - fz * b + lz * t), hRR = heightAt(x - fx * b - lx * t, z - fz * b - lz * t);
    const dF = ((hFL + hFR) - (hRL + hRR)) / (4 * b), dL = ((hFL + hRL) - (hFR + hRR)) / (4 * t);
    out.set(-dF * fx - dL * lx, 1, -dF * fz - dL * lz).normalize();
    return (hFL + hFR + hRL + hRR) / 4;
  }

  /* ------------------------------------------------ physics, in fixed steps */
  function physics(dt) {
    const R = car.R;
    if (!R) return;
    const drive = mode === "drive" && S.q < 0.05;
    const thr = drive ? input.thr : 0, steer = drive ? input.steer : 0;
    const fx = Math.sin(car.th), fz = Math.cos(car.th), lx = fz, lz = -fx;
    let vf = car.vx * fx + car.vz * fz, vl = car.vx * lx + car.vz * lz;
    if (car.ground) {
      const n = normalAt(car.x, car.z, 0.8);
      const gx = G * n.y * n.x, gz = G * n.y * n.z;                    // gravity along the slope
      let af = gx * fx + gz * fz;
      if (thr > 0) af += R.acc * thr * (1 - clamp(vf / R.vmax, 0, 1));
      else if (thr < 0) { if (vf > 0.5) af -= R.brake * -thr; else af += R.acc * 0.7 * thr * (1 - clamp(-vf / R.vrev, 0, 1)); }
      car.sand = zoneAt(car.x, car.z, 1 - n.y)[0];
      vf += af * dt;
      vl += (gx * lx + gz * lz) * dt;
      // rolling resistance and drag: slow it, but never turn it round (so it rests on a gentle slope)
      const dec = (R.roll * (1 + car.sand * 1.6) + R.drag * vf * vf) * dt;
      vf = Math.abs(vf) <= dec ? 0 : vf - Math.sign(vf) * dec;
      // the tyres (or feet) swing the velocity round to where the robot points; until they do, it slides
      const sp = Math.hypot(vf, vl);
      if (sp > 0.01) {
        const a = Math.atan2(vl, vf), aim = Math.abs(a) > Math.PI / 2 ? Math.sign(a) * Math.PI : 0;
        const na = a + (aim - a) * damp(R.grip * (1 - car.sand * 0.45), dt);
        const keep = 1 - Math.abs(Math.sin(a)) * R.scrub * dt;
        vf = Math.cos(na) * sp * keep; vl = Math.sin(na) * sp * keep;
      }
      const spd = Math.abs(vf);
      const k = Math.max(R.turnMin, smooth(0, 3, spd)) * (1 - 0.35 * smooth(R.vmax * 0.6, R.vmax * 1.6, spd));
      const wWant = -steer * R.turn * k * (vf < -0.3 ? -1 : 1);     // D turns right (clockwise from above)
      car.w += (wWant - car.w) * damp(9, dt);
      if (input.hop) { input.hop = false; car.ground = false; car.vy = car.vyT + R.hop; car.susV -= 0.6; }
    } else {
      input.hop = false;
      car.w *= Math.exp(-2 * dt);
      car.w += -steer * 0.8 * dt;                                     // a little air control
    }
    car.th = wrap(car.th + car.w * dt);
    const v0 = car.vf;
    // back to world velocity in the frame it was measured in: turning doesn't drag the velocity round by itself
    car.vx = fx * vf + lx * vl; car.vz = fz * vf + lz * vl;
    car.vf = vf; car.vl = vl;
    let nx = car.x + car.vx * dt, nz2 = car.z + car.vz * dt;
    const lim = HALF - 8;
    if (Math.abs(nx) > lim) { nx = Math.sign(nx) * lim; car.vx *= -0.3; }
    if (Math.abs(nz2) > lim) { nz2 = Math.sign(nz2) * lim; car.vz *= -0.3; }
    car.x = nx; car.z = nz2;
    for (const c of colliders) {                                    // rocks, standing stones and the fire are solid
      const dx = car.x - c.x, dz = car.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.85;
      if (d >= min || d < 1e-4) continue;
      const ux = dx / d, uz = dz / d, vn = car.vx * ux + car.vz * uz;
      car.x = c.x + ux * min; car.z = c.z + uz * min;
      if (vn < 0) { car.vx -= ux * vn * 1.3; car.vz -= uz * vn * 1.3; if (vn < -3) car.shake = Math.min(1, car.shake - vn * 0.05); }
    }
    const h = heightAt(car.x, car.z);
    if (car.ground) {
      // how fast the ground is rising under it, and whether it falls away ahead faster than gravity could follow
      const sp = Math.hypot(car.vx, car.vz);
      let slope = 0;
      if (sp > 0.05) {
        const ux = car.vx / sp, uz = car.vz / sp;
        slope = heightAt(car.x + ux * 0.5, car.z + uz * 0.5) - heightAt(car.x - ux * 0.5, car.z - uz * 0.5);
      }
      car.vyT = slope * sp;
      let fly = false;
      if (sp > 4.5 && car.vy <= car.vyT + 0.5) {
        const tau = 0.12, yBall = h + car.vyT * tau - 0.5 * G * tau * tau;
        fly = yBall > heightAt(car.x + car.vx * tau, car.z + car.vz * tau) + 0.06;
      }
      if (fly) { car.ground = false; car.vy = car.vyT; car.y = h; }
      else { car.vy = car.vyT; car.y = h; }
    }
    if (!car.ground) {
      car.vy -= G * dt; car.y += car.vy * dt;
      if (car.y <= h) {
        // touch down: the part of the velocity going into the ground stops, the rest carries on along it
        const n = normalAt(car.x, car.z, 0.8);
        const vn = car.vx * n.x + car.vy * n.y + car.vz * n.z;
        if (vn < 0) { car.vx -= n.x * vn; car.vy -= n.y * vn; car.vz -= n.z * vn; }
        car.y = h; car.ground = true;
        const hit = Math.max(0, -vn);
        car.susV -= Math.min(hit, 12) * 0.16;
        if (hit > 2.5) {
          car.shake = Math.min(1, car.shake + hit * 0.06);
          dust.puff(car.x, h, car.z, car.vx, car.vz, Math.min(40, Math.round(hit * 4)), 1.3);
        }
      }
    }
    car.acc += ((car.vf - v0) / dt - car.acc) * damp(8, dt);
    // the body dips as it brakes, lifts as it pulls away, leans out of a turn, and sits down on a landing
    const pT = clamp(car.acc * 0.012, -0.08, 0.08), rT = clamp(-car.w * car.vf * 0.014, -0.09, 0.09);
    car.pv += (-(car.pitch - pT) * 90 - car.pv * 13) * dt; car.pitch += car.pv * dt;
    car.rv += (-(car.roll - rT) * 90 - car.rv * 13) * dt; car.roll += car.rv * dt;
    car.susV += (-car.sus * 160 - car.susV * 14) * dt; car.sus = clamp(car.sus + car.susV * dt, -0.12, 0.08);
  }

  /* ------------------------------------------------ robot animation, tracks and prints */
  const DUTY = 0.56;
  function animateBot(R, dt, t) {
    groundUp(R, car.x, car.z, car.th, _w);
    if (!car.ground) _w.copy(car.up).lerp(_v.set(0, 1, 0), 0.03).normalize();
    car.up.lerp(_w, damp(car.ground ? 14 : 3, dt)).normalize();
    placeBot(R, car.x, car.z, car.th, car.y, car.up);
    if (R.tilt && !R.legs) {
      R.tilt.rotation.z = -car.pitch;                        // model x points backwards, so pitch is about z
      R.tilt.rotation.x = car.roll;
      R.tilt.position.y = R.tilt0.y + car.sus / R.scale;
    }
    for (const wh of R.wheels) {
      const v = car.vf - car.w * wh.x;                       // this wheel's ground speed
      wh.pivot.rotation.z += (car.ground ? v : v * 0.97) / wh.r * dt;
    }
    if (R.ant) {                                             // the whip antenna lags and swings
      const A = R.ant, pT = clamp(-car.acc * 0.05 - car.susV * 0.4, -0.4, 0.4), rT = clamp(-car.w * car.vf * 0.08, -0.3, 0.3);
      A.pv += ((pT - A.p) * 140 - A.pv * 3.2) * dt; A.p += A.pv * dt;
      A.rv += ((rT - A.r) * 140 - A.rv * 3.2) * dt; A.r += A.rv * dt;
      A.node.rotation.z = A.p; A.node.rotation.x = A.r;
    }
    if (R.legs) walk(R, dt, t);
    else if (mode === "drive") {
      // tyre tracks from all four wheels: darker where they slide
      const fx = Math.sin(car.th), fz = Math.cos(car.th), lx = fz, lz = -fx;
      const slide = clamp(Math.abs(car.vl) / 2.5, 0, 1);
      if (!car.ground) tracks.lift();
      else for (const wh of R.wheels) {
        const x = car.x + fx * wh.z + lx * wh.x, z = car.z + fz * wh.z + lz * wh.x;
        tracks.add(wh.pivot.name, x, z, wh.w * 0.9, 0.5 + 0.5 * slide, t);
        if (wh.z < 0 && slide > 0.35 && Math.random() < slide * 0.35) dust.puff(x, heightAt(x, z), z, car.vx, car.vz, 1, 0.6);
      }
    }
  }
  function walk(R, dt, t) {
    const Gt = R.gait, s = R.scale, tilt = R.tilt;
    const moving = clamp((Math.abs(car.vf) + Math.abs(car.w) * 0.45) / 0.16, 0, 1) * (car.ground ? 1 : 0.2);
    Gt.amp += (moving - Gt.amp) * damp(5, dt);
    const hz = 1.5 + 1.6 * clamp(Math.abs(car.vf) / R.vmax, 0, 1.4) + 0.5 * clamp(Math.abs(car.w), 0, 1);
    if (Gt.amp > 0.01) Gt.ph = (Gt.ph + hz * dt) % 1;
    tilt.position.y = R.tilt0.y + car.sus / s - 0.016 * Gt.amp * (0.5 + 0.5 * Math.cos(Gt.ph * 4 * Math.PI)) + (car.ground ? 0 : 0.03);
    tilt.rotation.z = -car.pitch + 0.014 * Gt.amp * Math.sin(Gt.ph * TAU);
    tilt.rotation.x = car.roll;
    tilt.updateMatrix();
    R.group.updateMatrixWorld(true);
    _inv.copy(tilt.matrix).invert();
    const T = DUTY / hz * Gt.amp;                            // how long a foot stays down
    for (const L of R.legs) {
      // the foot at rest in the robot's frame (x left, z forward), metres
      const xg = L.rest.z * s, zg = -L.rest.x * s;
      // a planted foot slides back under the body: the walk, plus the turn about the middle
      const dxm = clamp((car.vf - car.w * xg) * T / s, -0.34, 0.34), dzm = clamp(-car.w * zg * T / s, -0.22, 0.22);
      const p = (Gt.ph + L.phase) % 1, down = p < DUTY || Gt.amp < 0.02;
      let k, y = L.rest.y;
      if (p < DUTY) k = p / DUTY - 0.5;
      else { const q = (p - DUTY) / (1 - DUTY); k = 0.5 - smooth(0, 1, q); y += (0.04 + 0.32 * Math.hypot(dxm, dzm)) * Gt.amp * Math.sin(Math.PI * q); }
      const x = L.rest.x + dxm * k, z = L.rest.z + dzm * k;
      if (car.ground) {                                      // reach for the ground under this foot
        _v.set(x, L.rest.y, z).applyMatrix4(R.model.matrixWorld);
        y += clamp((heightAt(_v.x, _v.z) - _v.y) / s, -0.14, 0.14);
      } else y += 0.06;                                      // legs tucked up a little in the air
      _v.set(x, y, z).applyMatrix4(_inv);
      legIK(L, _v.x, _v.y, _v.z);
      if (down && !L.down && Gt.amp > 0.25 && car.ground && mode === "drive") {   // a foot comes down: a print
        _w.set(x, L.rest.y, z).applyMatrix4(R.model.matrixWorld);
        prints.stamp(_w.x, _w.z, 0.2 * s, car.th, t);
      }
      L.down = down;
    }
  }
  // while choosing: the quadruped breathes and shifts its weight, the antenna sways
  function idleAnimate(R, dt, t) {
    if (R.legs) {
      R.gait.amp *= Math.exp(-dt * 5);
      R.tilt.position.y = R.tilt0.y - 0.01 - 0.008 * Math.sin(t * 1.3);
      R.tilt.rotation.set(0.012 * Math.sin(t * 0.9), 0, 0.02 * Math.sin(t * 0.7));
      R.tilt.updateMatrix();
      _inv.copy(R.tilt.matrix).invert();
      for (const L of R.legs) { _v.copy(L.rest).applyMatrix4(_inv); legIK(L, _v.x, _v.y, _v.z); }
    }
    if (R.ant) R.ant.node.rotation.set(0.03 * Math.sin(t * 1.7), 0, 0.05 * Math.sin(t * 2.1));
    const hot = mode === "select" && hover === R.key;
    R.ring.material.opacity += ((mode === "select" ? (hot ? 0.5 : 0.2) : 0) - R.ring.material.opacity) * damp(8, dt);
    R.rim.value += ((hot ? 1.7 : 0.55) - R.rim.value) * damp(8, dt);
  }

  /* ------------------------------------------------ camera */
  const cam = { pos: new THREE.Vector3(0, PAD + 1.6, 7), look: new THREE.Vector3(0, PAD + 0.6, 0), fov: 42, shift: 0, yaw: 0, dist: 6, h: 2, orbit: false };
  const pointer = { x: 0, y: 0 };
  const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
  let W = 1, Hh = 1;
  // where the camera sits while choosing: wide screens keep the left side for the words
  const view = () => {
    const a = W / Hh;
    if (a >= 1.05) { const d = Math.max(6.4, 10.8 / a); return { shift: 0.2, pos: [0, 0.9 + d * 0.1, d], look: [0, 0.6, 0], fov: 42 }; }
    const d = clamp(4.6 / a, 7.5, 11.5);
    return { shift: 0, pos: [0, 1.2 + d * 0.12, d], look: [0, 0.35, 0], fov: 50 };
  };
  function selectCamera(snap) {
    const v = view(), lean = hover === "rover" ? -1 : hover === "quad" ? 1 : 0, drift = reduce ? 0 : Math.sin(U.uTime.value * 0.15) * 0.3;
    _cp.set(v.pos[0] + pointer.x * 0.7 + drift + lean * 0.35, PAD + v.pos[1] - pointer.y * 0.3, v.pos[2]);
    _cl.set(v.look[0] + lean * 0.5, PAD + v.look[1], v.look[2]);
    if (snap) { cam.pos.copy(_cp); cam.look.copy(_cl); cam.fov = v.fov; cam.shift = v.shift; }
    return v;
  }
  function updateCamera(dt) {
    const R = car.R;
    if (mode === "drive" && R) {
      if (!cam.orbit) {                                      // take over from wherever the camera is: it swings round
        cam.orbit = true;
        cam.yaw = Math.atan2(cam.pos.x - car.x, cam.pos.z - car.z);
        cam.dist = Math.hypot(cam.pos.x - car.x, cam.pos.z - car.z);
        cam.h = cam.pos.y - car.y;
      }
      const fwd = clamp(car.vf, 0, 20);
      cam.yaw += wrap(car.th + Math.PI - cam.yaw) * damp(3.2, dt);
      cam.dist += (R.camD + fwd * 0.07 - cam.dist) * damp(2.4, dt);
      cam.h += (R.camH + fwd * 0.02 - cam.h) * damp(2.4, dt);
      _cp.set(car.x + Math.sin(cam.yaw) * cam.dist, 0, car.z + Math.cos(cam.yaw) * cam.dist);
      _cp.y = Math.max(car.y + cam.h, heightAt(_cp.x, _cp.z) + 1.1);
      cam.pos.lerp(_cp, damp(12, dt));
      _cl.set(car.x + Math.sin(car.th) * 2.2, car.y + 0.9, car.z + Math.cos(car.th) * 2.2);
      cam.look.lerp(_cl, damp(8, dt));
      cam.fov += (58 + clamp(Math.abs(car.vf) - 4, 0, 18) * 0.75 - cam.fov) * damp(3, dt);
      cam.shift += (0 - cam.shift) * damp(3, dt);
    } else {
      cam.orbit = false;
      const v = selectCamera(false);
      cam.pos.lerp(_cp, damp(mode === "boot" ? 1.4 : 2.6, dt));
      cam.look.lerp(_cl, damp(3, dt));
      cam.fov += (v.fov - cam.fov) * damp(2, dt);
      cam.shift += (v.shift - cam.shift) * damp(3, dt);
    }
    camera.position.copy(cam.pos);
    camera.position.y -= S.flood * 1.4;                      // sinking with the flood
    if (car.shake > 0.001) {
      const s = car.shake * 0.12;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
      car.shake *= Math.exp(-dt * 6);
    }
    for (const c of colliders) {                                    // nor the camera
      const dx = camera.position.x - c.x, dz = camera.position.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.6;
      if (d < min && d > 1e-4) { camera.position.x = c.x + dx / d * min; camera.position.z = c.z + dz / d * min; }
    }
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.6);
    _v.copy(cam.look); _v.y -= S.flood * 2.2;
    camera.lookAt(_v);
    camera.fov = cam.fov;
    camera.setViewOffset(W, Hh, -cam.shift * W, 0, W, Hh);   // this also updates the projection
    sky.position.copy(camera.position);
  }

  /* ------------------------------------------------ post: water transition only */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const output = new OutputPass();
  const video = $(".xp__film");
  const filmTex = video ? new THREE.VideoTexture(video) : null;
  if (filmTex) { filmTex.colorSpace = THREE.NoColorSpace; filmTex.generateMipmaps = false; }
  let posterTex = null;
  if (video && video.poster) new THREE.TextureLoader().load(video.poster, tx => { tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; posterTex = tx; });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const final = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tFilm: { value: black }, uRes: { value: new THREE.Vector2(1, 1) }, uFilmSize: { value: new THREE.Vector2(16, 9) },
      uTime: { value: 0 }, uFlood: { value: 0 }, uRise: { value: 0 }, uSurf: { value: 0 },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: FINAL_FS,
  });
  composer.addPass(renderPass); composer.addPass(output); composer.addPass(final);

  /* ------------------------------------------------ input */
  const blocked = () => {
    const a = document.activeElement;
    return document.body.classList.contains("menu-open") || !!document.querySelector("dialog[open]") ||
      !!(a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName)));
  };
  const held = new Set();
  const KEYS = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
  const kbds = $$(".xp__keys kbd");
  function readKeys() {
    input.thr = input.joy ? input.joy.y : (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0);
    input.steer = input.joy ? input.joy.x : (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    for (const k of kbds) k.classList.toggle("is-down", held.has(k.dataset.k));
  }
  // capture phase, so Escape is seen here before main.js closes the menu with it
  addEventListener("keydown", e => {
    if (!S.inView || e.metaKey || e.ctrlKey || e.altKey || blocked()) return;
    const k = e.key.toLowerCase();
    if (mode === "select" && S.q < 0.05) {
      if (k === "1" || k === "2") { e.preventDefault(); choose(k === "1" ? "rover" : "quad"); }
      return;
    }
    if (mode !== "drive" || S.q >= 0.05) return;
    if (KEYS[k]) { e.preventDefault(); held.add(KEYS[k]); }
    else if (k === " ") { e.preventDefault(); if (!e.repeat && car.ground) input.hop = true; held.add("hop"); }
    else if (k === "r") { e.preventDefault(); respawn(); }
    else if (k === "q") { e.preventDefault(); swap(); }
    else if (k === "escape") { e.preventDefault(); toSelect(); return; }
    else return;
    document.body.classList.add("xp-keys");
    readKeys();
  }, true);
  addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (KEYS[k]) held.delete(KEYS[k]);
    if (k === " ") held.delete("hop");
    readKeys();
  });
  addEventListener("blur", () => { held.clear(); readKeys(); });
  addEventListener("mousemove", () => document.body.classList.remove("xp-keys"), { passive: true });

  // on a touch screen: a thumbstick and a hop button
  const joy = $(".xp__joy"), knob = $(".xp__joy-knob");
  if (joy && knob) {
    let id = null, cx = 0, cy = 0;
    const R0 = 46;
    const set = (x, y) => {
      const d = Math.hypot(x, y), k = d > R0 ? R0 / d : 1;
      knob.style.transform = `translate(${x * k}px, ${y * k}px)`;
      input.joy = { x: clamp(x / R0, -1, 1), y: clamp(-y / R0, -1, 1) };
      readKeys();
    };
    joy.addEventListener("pointerdown", e => { id = e.pointerId; joy.setPointerCapture(id); const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e.clientX - cx, e.clientY - cy); });
    joy.addEventListener("pointermove", e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; input.joy = null; readKeys(); };
    joy.addEventListener("pointerup", end); joy.addEventListener("pointercancel", end);
  }
  $(".xp__hop")?.addEventListener("pointerdown", e => { e.preventDefault(); if (car.ground) input.hop = true; });

  // the pointer: a gentle parallax while choosing, and picking a robot out of the scene
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3();
  const cards = $$(".xp__bot");
  let hoverCard = null;
  function botUnder(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const R of Object.values(BOTS)) {
      if (!R.group || !R.group.visible) continue;
      if (ray.ray.intersectsBox(box.setFromObject(R.model).expandByScalar(0.12))) return R.key;
    }
    return null;
  }
  function setHover(k) {
    if (k === hover) return;
    hover = k;
    canvas.style.cursor = k && mode === "select" ? "pointer" : "";
    for (const b of cards) b.classList.toggle("is-hot", b.dataset.bot === k);
  }
  stage.addEventListener("pointermove", e => {
    const r = stage.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1; pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (mode === "select" && e.pointerType === "mouse") setHover(e.target === canvas ? botUnder(e) : hoverCard);
  }, { passive: true });
  canvas.addEventListener("click", e => { if (mode === "select" && S.q < 0.05) { const k = botUnder(e); if (k) choose(k); } });
  canvas.addEventListener("pointerleave", () => { if (mode === "select") setHover(hoverCard); });
  for (const b of cards) {
    b.addEventListener("pointerenter", () => { hoverCard = b.dataset.bot; setHover(hoverCard); });
    b.addEventListener("pointerleave", () => { hoverCard = null; setHover(null); });
    b.addEventListener("focus", () => setHover(b.dataset.bot));
    b.addEventListener("blur", () => setHover(hoverCard));
    b.addEventListener("click", e => { e.preventDefault(); if (mode === "select") choose(b.dataset.bot); });
  }
  $$("[data-act]").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "swap") swap(); else if (a === "exit") toSelect(); else if (a === "reset") respawn();
  }));


  /* ------------------------------------------------ what's been found, and the cards that say so */
  const foundN = $(".xp__found-n");
  const seen = (() => { try { return JSON.parse(sessionStorage.getItem("jt-finds") || "{}") || {}; } catch (e) { return {}; } })();
  const saveFinds = () => { try { sessionStorage.setItem("jt-finds", JSON.stringify(seen)); } catch (e) { /* private mode */ } };
  const countFinds = () => { if (foundN) foundN.textContent = finds ? finds.F.filter(f => f.found).length : 0; };
  function restoreFinds() {                                         // already found earlier in this visit: glowing
    for (const f of finds.F) if (seen[f.key]) { f.found = true; f.glow.value = 1; }
    countFinds();
  }
  function discover(f) {
    f.found = true; seen[f.key] = true; saveFinds(); countFinds();
    showCard(f.key);
  }
  const cardQueue = [];
  let cardOn = null, cardTimer = 0;
  function showCard(key) {
    const el = xp.querySelector(`.xp__find[data-find="${key}"]`);
    if (!el) return;
    if (cardOn) { cardQueue.push(el); return; }
    cardOn = el; el.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    clearTimeout(cardTimer); cardTimer = setTimeout(() => hideCard(el), key === "intro" ? 8000 : 10000);
  }
  function hideCard(el) {
    if (cardOn !== el) return;
    el.classList.remove("is-in"); cardOn = null;
    setTimeout(() => { if (!el.classList.contains("is-in")) el.hidden = true; if (cardQueue.length && !cardOn) showCard(cardQueue.shift().dataset.find); }, 420);
  }
  $$(".xp__find-x").forEach(b => b.addEventListener("click", () => hideCard(b.closest(".xp__find"))));

  /* ------------------------------------------------ choosing and driving */
  const SHOW = { rover: { x: -1.1, z: 0.3, th: 0.5 }, quad: { x: 1.1, z: -0.3, th: -0.45 } };   // where each stands to be chosen
  const hudName = $(".xp__hud-name");
  function stand(R) {
    const P = SHOW[R.key];
    const y = groundUp(R, P.x, P.z, P.th, _w);
    placeBot(R, P.x, P.z, P.th, y, _w);
    R.group.visible = true;
    if (R.gait) R.gait.amp = 0;
  }
  function start(R, x, z, th, keepVelocity) {
    car.R = R;
    Object.assign(car, { x, z, th, w: 0, ground: true, pitch: 0, roll: 0, pv: 0, rv: 0, acc: 0, sus: 0, susV: 0, vy: 0, vyT: 0 });
    if (!keepVelocity) Object.assign(car, { vx: 0, vz: 0, vf: 0, vl: 0 });
    car.y = heightAt(x, z);
    groundUp(R, x, z, th, car.up);
    R.ring.material.opacity = 0; R.rim.value = 0.5;
    tracks.lift();
    if (hudName) hudName.textContent = R.name;
  }
  function choose(key) {
    if (mode !== "select") return;
    const R = BOTS[key], other = BOTS[key === "rover" ? "quad" : "rover"];
    other.group.visible = false;
    const P = SHOW[key];
    start(R, P.x, P.z, P.th);
    mode = "drive"; xp.dataset.mode = "drive";
    setHover(null); held.clear(); readKeys();
    stage.focus({ preventScroll: true });
    if (finds && !seen.intro) { seen.intro = true; saveFinds(); showCard("intro"); }
  }
  function toSelect() {
    if (mode !== "drive") return;
    const R = car.R;
    mode = "select"; xp.dataset.mode = "select";
    car.R = null; held.clear(); readKeys(); tracks.lift();
    for (const B of Object.values(BOTS)) stand(B);
    selectCamera(false);
    cards.find(b => b.dataset.bot === R.key)?.focus({ preventScroll: true });
  }
  function swap() {
    if (mode !== "drive" || !car.R) return;
    const from = car.R, to = BOTS[from.key === "rover" ? "quad" : "rover"];
    from.group.visible = false;
    to.group.visible = true;
    if (to.gait) to.gait.amp = 0;
    start(to, car.x, car.z, car.th, true);
  }
  function respawn() {
    if (!car.R) return;
    start(car.R, 0, -2, 0);
    cam.yaw = Math.PI; cam.orbit = true;
    cam.pos.set(0, PAD + 2.2, -2 - car.R.camD);
  }
  /* ------------------------------------------------ sizing */
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === W && h === Hh && renderer.getPixelRatio() === dpr) return;
    W = w; Hh = h;
    // Bound fill rate on large and Retina screens, independently of CSS size.
    dpr = Math.min(dpr, Math.sqrt((low ? 900000 : 1600000) / (W * Hh)));
    renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr);
    renderer.setSize(W, Hh, false); composer.setSize(W, Hh);
    camera.aspect = W / Hh;
    final.uniforms.uRes.value.set(W * dpr, Hh * dpr);
    dust.mat.uniforms.uScale.value = Hh * dpr * 0.6;
  }
  resize();
  addEventListener("resize", resize);

  /* ------------------------------------------------ load the robots, then boot */
  let loaded = 0;
  const botsReady = Promise.all(Object.values(BOTS).map(R => loadBot(R).then(() => setBoot(0.3 + 0.6 * ++loaded / 2))));
  finds = await buildFinds().catch(e => { console.warn("finds:", e); return null; });   // while the robots download
  await botsReady;
  if (finds) restoreFinds();
  for (const R of Object.values(BOTS)) stand(R);
  selectCamera(true);
  updateCamera(0);
  await renderer.compileAsync(scene, camera).catch(() => {});    // build the shaders now, not mid-drive
  {  // and the flood and film passes, so the first scroll into them doesn't stall on compiling
    const F = final.uniforms;
    F.uFlood.value = 0.5; composer.render(0);
    F.uFlood.value = 1; F.uSurf.value = 0.5; composer.render(0);
    F.uFlood.value = F.uSurf.value = 0;
  }
  setBoot(1);
  mode = "select"; xp.dataset.mode = "select";
  xp.classList.remove("is-booting");
  xp.classList.add("is-ready");

  /* ------------------------------------------------ the loop */
  let last = performance.now(), acc = 0, frames = 0, slow = 0, menuSince = 0, lastQ = -1;
  const t0 = last, STEP = 1 / 120;
  const speedEl = $(".xp__speed-n");
  let shownSpeed = -1;
  renderer.setAnimationLoop(now => {
    now = now || performance.now();
    if (!S.inView || document.hidden || S.surf >= 0.999 || document.querySelector("dialog[open]")) { last = now; return; }
    // Let the menu finish covering the scene, then stop all scene work.
    if (document.body.classList.contains("menu-open")) { if (!menuSince) menuSince = now; if (now - menuSince > 1300) { last = now; return; } } else menuSince = 0;
    const scrolling = Math.abs(S.q - lastQ) > 0.00001;
    const budget = mode === "drive" || scrolling ? 1000 / 60 : 1000 / 30;
    const elapsed = now - last;
    if (elapsed < budget - 1) return;
    const dt = Math.min(elapsed / 1000, 1 / 20), t = reduce ? 0 : (now - t0) / 1000;
    last = now; lastQ = S.q;
    if (S.flood < 0.999) {
      U.uTime.value = t;
      acc += dt;
      while (acc >= STEP) { physics(STEP); acc -= STEP; }
      for (const R of Object.values(BOTS)) {
        if (!R.group || !R.group.visible) continue;
        if (R === car.R) animateBot(R, dt, t); else idleAnimate(R, dt, t);
      }
      dust.step(dt);
      // the one lamp: headlight on the robot being driven, a key light on the two waiting to be chosen
      if (car.R) {
        const fx = Math.sin(car.th), fz = Math.cos(car.th);
        lamp.position.set(car.x + fx * 0.8, car.y + (car.R.legs ? 1.0 : 0.62), car.z + fz * 0.8);
        lamp.target.position.set(car.x + fx * 10, car.y - 0.5, car.z + fz * 10);
        lamp.intensity = car.R.legs ? 26 : 55; lamp.angle = car.R.legs ? 0.62 : 0.5;
      } else {
        lamp.position.set(1.4, PAD + 6.5, 4.6);
        lamp.target.position.set(0, PAD + 0.2, -0.3);
        lamp.intensity = 16; lamp.angle = 0.4;
      }
      const px = car.R ? car.x : 0, pz = car.R ? car.z : 0, py = car.R ? car.y : PAD;
      grass.uniforms.uBot.value.set(px, car.R ? py : -99, pz);
      grass.uniforms.uTime.value = t; tracks.mat.uniforms.uTime.value = t; prints.mat.uniforms.uTime.value = t;
      // the moon's shadow follows the robot
      moon.position.set(px + MOON.x, py + MOON.y, pz + MOON.z);
      moon.target.position.set(px, py, pz);
      updateCamera(dt);
      if (speedEl && mode === "drive") { const kmh = Math.round(Math.hypot(car.vx, car.vz) * 3.6); if (kmh !== shownSpeed) { speedEl.textContent = kmh; shownSpeed = kmh; } }
      if (finds) {
        finds.update(t, dt);
        if (mode === "drive" && car.R && S.q < 0.05) for (const f of finds.F) if (!f.found && finds.tests[f.key](car.x, car.z)) discover(f);
      }
    }
    const F = final.uniforms;
    F.uTime.value = t;
    F.uFlood.value = S.flood; F.uRise.value = S.rise; F.uSurf.value = S.surf;
    // the film: its moving picture once it's playing, the poster until then
    if (S.surf > 0) {
      const live = video && video.readyState >= 2 && !video.paused;
      const tex = live ? filmTex : posterTex;
      if (tex) {
        F.tFilm.value = tex;
        F.uFilmSize.value.set(live ? video.videoWidth : tex.image.width, live ? video.videoHeight : tex.image.height);
      }
    }
    // the world only needs drawing until it's under
    if (S.flood <= 0.001) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    } else {
      renderPass.enabled = output.enabled = S.flood < 0.999;
      composer.render(dt);
    }
    // if it can't keep up, draw fewer pixels
    frames++;
    if (elapsed > budget * 1.6) slow++;
    if (frames % 90 === 0) {
      if (slow > 45 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.2); resize(); }
      slow = 0;
    }
  });
}

/* ======================================================================== the final pass
 * In display colour, after tone mapping:
 *   the flood  – a waterline rises from the bottom; below it a dark liquid (rippled, mirroring what is above
 *                it, glinting), at it a band of spray, above it the world turning to silver
 *   the rise   – the camera comes up: the sea's horizon drops to 42% and a starry sky opens above
 *   the film   – a line comes down from the top with the field film behind it, wet silver at its edge
 * No flashing, colour fringes, grain or screen distortion. */
const FINAL_FS = `
uniform sampler2D tDiffuse; uniform sampler2D tFilm;
uniform vec2 uRes, uFilmSize;
uniform float uTime, uFlood, uRise, uSurf;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 2; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec2 cover(vec2 uv) {                        // the film, cropped to fill the screen
  float sa = uRes.x / uRes.y, fa = uFilmSize.x / max(uFilmSize.y, 1.0);
  vec2 f = uv - 0.5;
  if (sa > fa) f.y *= fa / sa; else f.x *= sa / fa;
  return f + 0.5;
}
vec3 world(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
vec3 filmAt(vec2 uv) { return texture2D(tFilm, cover(uv)).rgb; }

// liquid silver: the picture's brightness read as a relief and lit like polished metal
vec3 silver(vec3 c, vec3 cx, vec3 cy, vec2 uv) {
  float l = lum(c);
  vec3 n = normalize(vec3((l - lum(cx)) * 9.0, (l - lum(cy)) * 9.0, 1.0));
  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  float dif = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
  float env = 0.5 + 0.5 * sin((n.x * 2.2 + n.y * 3.4 + uv.y * 5.0 + uTime * 0.4) * 2.2);
  vec3 base = mix(vec3(0.05, 0.07, 0.1), vec3(0.72, 0.8, 0.92), clamp(l * 0.7 + env * 0.45, 0.0, 1.0));
  return base * (0.3 + 0.8 * dif) + vec3(0.85, 0.93, 1.0) * spec;
}
vec3 worldSilver(vec2 uv, float k) {
  vec3 c = world(uv);
  if (k < 0.002) return c;
  vec2 px = 1.5 / uRes;
  return mix(c, silver(c, texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb, texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb, uv), k);
}
vec3 filmSilver(vec2 uv, float k) {
  vec3 c = filmAt(uv);
  if (k < 0.002) return c;
  vec2 px = 1.5 / uRes;
  return mix(c, silver(c, filmAt(uv + vec2(px.x, 0.0)), filmAt(uv + vec2(0.0, px.y)), uv), k);
}

float wave(float x) {                        // the waterline isn't straight
  return 0.013 * sin(x * 7.0 + uTime * 1.9) + 0.008 * sin(x * 17.0 - uTime * 2.7) + 0.014 * (noise(vec2(x * 5.0, uTime * 0.6)) - 0.5);
}

// the liquid below a horizon H, seen at a low angle; near the line it can mirror the world above it
vec3 sea(vec2 uv, float H, bool mirror) {
  float d = max(H - uv.y, 0.0008);
  float depth = 0.07 / d;
  vec2 p = vec2((uv.x - 0.5) * depth * 2.0, depth);
  vec2 q1 = p * vec2(2.6, 0.9) + vec2(uTime * 0.05, -uTime * 0.25);
  vec2 q2 = p * vec2(6.5, 2.2) + vec2(-uTime * 0.08, -uTime * 0.4);
  float e = 0.04;
  float h0 = fbm(q1) * 0.65 + noise(q2) * 0.35;
  float hx = fbm(q1 + vec2(e, 0.0)) * 0.65 + noise(q2 + vec2(e, 0.0)) * 0.35;
  float hz = fbm(q1 + vec2(0.0, e)) * 0.65 + noise(q2 + vec2(0.0, e)) * 0.35;
  vec3 n = normalize(vec3((h0 - hx) / e * 0.3, 1.0, (h0 - hz) / e * 0.3));
  vec3 V = normalize(vec3((uv.x - 0.5) * 1.6, -(d * 1.3 + 0.015), 1.0));
  vec3 R = reflect(V, n);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
  vec3 skyR = mix(vec3(0.02, 0.05, 0.09), vec3(0.003, 0.006, 0.014), smoothstep(0.0, 0.6, R.y));
  skyR += vec3(0.08, 0.36, 0.72) * exp(-abs(R.y) * 9.0) * 0.4;
  vec3 md = normalize(vec3(0.12, 0.2, 1.0));
  float m = max(dot(R, md), 0.0);
  skyR += vec3(0.85, 0.92, 1.0) * pow(m, 220.0) * 2.5 + vec3(0.3, 0.5, 0.9) * pow(m, 14.0) * 0.18;
  if (mirror) {
    vec2 ru = clamp(vec2(uv.x + n.x * 0.05, H + (H - uv.y) * 1.2 + n.z * 0.02), 0.0, 1.0);
    skyR = mix(skyR, texture2D(tDiffuse, ru).rgb * vec3(0.55, 0.65, 0.85), 0.55 * exp(-d * 9.0));
  }
  vec3 col = mix(vec3(0.003, 0.009, 0.018), skyR, fres);
  col += vec3(0.45, 0.85, 1.0) * pow(m, 50.0) * smoothstep(0.8, 0.93, noise(p * vec2(38.0, 11.0) + uTime * 0.7)) * 0.9;   // glints
  return col * mix(1.0, 0.4, smoothstep(0.0, 0.7, d));
}
vec3 sky(vec2 uv, float H) {
  float h = uv.y - H;
  vec3 c = mix(vec3(0.018, 0.045, 0.08), vec3(0.002, 0.004, 0.011), smoothstep(0.0, 0.5, h));
  c += vec3(0.08, 0.36, 0.72) * exp(-h * 20.0) * 0.28;
  vec2 sp = uv * vec2(uRes.x / uRes.y, 1.0) * 120.0, cell = floor(sp);
  float r = hash(cell);
  float s = step(0.986, r) * (1.0 - smoothstep(0.02, 0.12, length(fract(sp) - 0.5 - (hash(cell + 7.1) - 0.5) * 0.6)));
  c += vec3(0.75, 0.85, 1.0) * s * 0.65 * smoothstep(0.02, 0.25, h);
  return c;
}
// the spray where the liquid meets the air (up: which side of the line the air is)
float spray(vec2 uv, float L, float up) {
  float dy = (uv.y - L) * up;
  float line = exp(-abs(dy) * 110.0);
  float band = smoothstep(-0.005, 0.03, dy) * (1.0 - smoothstep(0.03, 0.11, dy));
  float ax = uv.x * uRes.x / uRes.y;
  float drops = smoothstep(0.84, 0.97, noise(vec2(ax * 170.0, dy * 150.0 - uTime * 5.0))) * band * 0.55;
  float mist = smoothstep(0.5, 1.0, noise(vec2(ax * 40.0, dy * 30.0 - uTime * 2.4))) * exp(-max(dy, 0.0) * 50.0) * step(0.0, dy);
  return line * 0.85 + drops + mist * 0.3;
}

void main() {
  vec2 uv = vUv;
  vec2 c0 = uv - 0.5;
  vec3 col;
  if (uSurf > 0.0) {
    float L = mix(1.14, -0.14, uSurf) + wave(uv.x);
    if (uv.y > L) col = filmSilver(uv, (1.0 - smoothstep(0.0, 0.2, uv.y - L)) * 0.9 * (1.0 - uSurf * uSurf));
    else col = uv.y < 0.42 ? sea(uv, 0.42, false) : sky(uv, 0.42);
    if (uSurf < 1.0) col += vec3(0.78, 0.9, 1.0) * spray(uv, L, -1.0) * (1.0 - smoothstep(0.85, 1.0, uSurf));
  } else if (uFlood < 0.999) {
    float L = mix(-0.14, 1.14, uFlood) + wave(uv.x);
    if (uv.y < L) col = sea(uv, L, true);
    else col = worldSilver(uv, uFlood > 0.001 ? max(1.0 - smoothstep(0.0, 0.24, uv.y - L), uFlood * 0.3) : 0.0);
    if (uFlood > 0.001) col += vec3(0.78, 0.9, 1.0) * spray(uv, L, 1.0);
  } else {
    float H = mix(1.08, 0.42, uRise);
    col = uv.y < H ? sea(uv, H, false) : sky(uv, H);
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* ======================================================================== start */
if (xp) {
  let ok = false;
  try { ok = !!document.createElement("canvas").getContext("webgl2"); } catch (e) { /* no WebGL */ }
  if (!ok) flat();
  else world().catch(err => { console.error("world:", err); flat(); });
}
