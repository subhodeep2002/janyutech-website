/*
 * Home landing: an empty white room seen from its open end, in 3D (three.js).
 * Ceiling, walls, floor and back wall are ruled with a fine grid, a few vines
 * creep over the walls, and JANYU TECH floats in the middle with the quote.
 *  – a tube light hangs from the ceiling and lights the room: Dark, White or
 *    Warm, chosen on a half-protractor dial on the right edge (or by clicking
 *    the tube). It flickers now and then like a real one – a stutter, a hum,
 *    a tired tube blinking – and everything, petals and leaves too, is lit
 *    and shadowed by it
 *  – the robot (Janyu Tech's tracked cleaner) follows the pointer over the
 *    floor: it turns towards it, drives in smooth arcs, rolls its wheels, dips
 *    and leans a little, and its brush sweeps the leaves it meets
 *  – leaves and petals blow in from the two branches, tumble down and settle;
 *    sweeping the pointer across the floor kicks them back into the air
 *  – camera: pointer parallax; scrolling (the stage is pinned for a moment)
 *    carries it into the room and past the lettering
 * World units: y up, the floor at 0; the camera stands in the opening at z = 0
 * and looks down -z. The two branches in the top corners are SVG over the scene.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const hero = document.querySelector("[data-hero]");
const stage = hero && hero.querySelector(".room__stage");
const canvas = stage && stage.querySelector(".room__gl");
if (canvas) {
  try { room(); } catch (err) { console.error(err); stage.classList.remove("is-3d"); }
}

function room() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = x => x * x * (3 - 2 * x);
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const TAU = Math.PI * 2;
  const srgb = h => new THREE.Vector3(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));   // raw sRGB, for unlit shaders

  /* ------------------------------------------------ renderer and scene */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.classList.add("is-3d");
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#ffffff", 0);
  const pmrem = new THREE.PMREMGenerator(renderer);

  // the room: HR tall, D deep, as wide as the screen is (a portrait screen still gets a room,
  // not a shaft). The camera's eye is EYE above the floor, and VP is how far down the screen
  // the vanishing point sits (a lens shift keeps the verticals upright). The lettering floats ZT in.
  const HR = 9, D = 14, ZN = 0.4, EYE = 5.4, ZT = 8.4, ZB = 3.2, DOLLY = 8.9, VP = 0.41;
  const LAMP_Z = -9.6;                                             // the tube light hangs over the middle of the room
  const camera = new THREE.PerspectiveCamera();
  const cam = { z: 0, vz: 0 };                                     // the dolly into the room
  let W = 1, H = 1, f = 1, cx = 0, cy = 0, xL = -8, xR = 8;
  const eye = () => camera.position;
  const depthOf = z => -z - cam.z;                                 // how far in front of the camera
  const proj = (x, y, z) => { const d = depthOf(z); return [cx + f * (x - eye().x) / d, cy - f * (y - eye().y) / d]; };
  function setProjection() {
    const n = 0.05, fr = 80;
    camera.near = n; camera.far = fr;
    camera.projectionMatrix.makePerspective(-cx / f * n, (W - cx) / f * n, cy / f * n, -(H - cy) / f * n, n, fr);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /* ------------------------------------------------ light: a tube light on the ceiling */
  const ambient = new THREE.AmbientLight("#ffffff", 1);
  const hemi = new THREE.HemisphereLight("#ffffff", "#dfe5ee", 1);
  const fill = new THREE.DirectionalLight("#ffffff", 1);           // daylight through the opening (no shadows)
  fill.position.set(0.5, 7, 6); fill.target.position.set(0, 1, -9);
  const lamp = new THREE.SpotLight("#ffffff", 50, 0, 1.2, 1, 2);    // the tube's light on the room, and its shadows
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(fine ? 2048 : 1024, fine ? 2048 : 1024);
  lamp.shadow.camera.near = 0.3; lamp.shadow.camera.far = 17;
  lamp.shadow.bias = -0.0005; lamp.shadow.normalBias = 0.025; lamp.shadow.radius = 3;
  const ends = [0, 1].map(() => new THREE.PointLight("#ffffff", 0, 0, 2));   // the rest of the tube's length
  scene.add(ambient, hemi, fill, fill.target, lamp, lamp.target, ...ends);

  // the fixture: a slim aluminium channel hung on two wires, the tube glowing under it, a cap at each end
  const TUBE_Y = HR - 0.62;
  const fixture = new THREE.Group();
  const channel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.2), new THREE.MeshStandardMaterial({ color: "#b8bfc9", metalness: 0.45, roughness: 0.38 }));
  channel.position.y = 0.09;
  const tubeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#ffffff") }, uPower: { value: 1 }, uDying: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying float vS; varying vec3 vN, vV;
      void main() { vS = position.y + 0.5; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower, uDying, uTime; varying float vS; varying vec3 vN, vV;
      void main() {
        float ends = mix(1.0, smoothstep(0.0, 0.14, vS) * smoothstep(1.0, 0.86, vS), uDying * 0.75);   // a tired tube darkens at its ends
        float crawl = 1.0 - uDying * 0.32 * (0.5 + 0.5 * sin(vS * 19.0 - uTime * 0.0021));           // and light crawls along it
        float core = 0.74 + 0.26 * pow(abs(dot(normalize(vN), normalize(vV))), 0.6);
        gl_FragColor = vec4(uColor * (0.16 + 0.84 * uPower) * ends * crawl * core * 1.15, 1.0);
      }`,
    fog: false,
  });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 24), tubeMat);
  tube.rotation.z = Math.PI / 2;
  const capGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.1, 16), capMat = new THREE.MeshStandardMaterial({ color: "#8f98a4", metalness: 0.5, roughness: 0.45 });
  const caps = [0, 1].map(() => { const c = new THREE.Mesh(capGeo, capMat); c.rotation.z = Math.PI / 2; return c; });
  const wireGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6), wireMat = new THREE.MeshStandardMaterial({ color: "#5d6470", roughness: 0.6 });
  const wires = [0, 1].map(() => new THREE.Mesh(wireGeo, wireMat));
  const glow = (w, h) => {                                        // a soft oval of light, for the tube's halo and the ceiling
    const c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = w; c.height = h;
    g.scale(w / h, 1);
    const gr = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.42)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, h, h);
    return new THREE.CanvasTexture(c);
  };
  const additive = map => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(glow(512, 64)));
  const ceilGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(glow(512, 128)));
  halo.renderOrder = ceilGlow.renderOrder = 4;
  ceilGlow.rotation.x = Math.PI / 2;
  fixture.add(channel, tube, ...caps, ...wires, halo);
  scene.add(fixture, ceilGlow);

  // the light falling from the tube, made visible by dust in the air, and the dust itself
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uH: { value: 8 } },
    vertexShader: `uniform float uH; varying float vH; varying vec3 vN, vV;
      void main() { vH = -position.y / uH; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vH; varying vec3 vN, vV;
      void main() { float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = uOpacity * rim * pow(1.0 - vH, 1.3) * smoothstep(0.0, 0.06, vH); gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
  beam.renderOrder = 4;
  scene.add(beam);
  const MOTES = 170, motePos = new Float32Array(MOTES * 3), moteV = [];
  for (let i = 0; i < MOTES; i++) moteV.push({ ph: rand(0, TAU), sp: rand(0.05, 0.16), s: rand(-1, 1), d: rand(-1, 1), h: Math.random() });
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ map: glow(32, 32), size: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false; motes.renderOrder = 4;
  scene.add(motes);
  let TUBE_L = 5, beamBox = null;
  function placeFixture() {
    TUBE_L = Math.min(5.2, (xR - xL) * 0.55);
    fixture.position.set(0, TUBE_Y, LAMP_Z);
    channel.scale.x = TUBE_L + 0.14;
    tube.scale.y = TUBE_L;
    caps.forEach((c, i) => c.position.set((i ? 1 : -1) * (TUBE_L / 2 + 0.03), 0, 0));
    const wh = HR - TUBE_Y - 0.12;
    wires.forEach((w, i) => { w.scale.y = wh; w.position.set((i ? 1 : -1) * (TUBE_L / 2 - 0.45), 0.12 + wh / 2, 0); });
    halo.scale.set(TUBE_L + 1.7, 1.15, 1); halo.position.set(0, -0.01, 0.13);
    ceilGlow.scale.set(TUBE_L * 1.9, 3.4, 1); ceilGlow.position.set(0, HR - 0.012, LAMP_Z);
    lamp.position.set(0, TUBE_Y - 0.08, LAMP_Z); lamp.target.position.set(0, 0, LAMP_Z + 0.3);
    ends.forEach((l, i) => l.position.set((i ? 1 : -1) * TUBE_L * 0.36, TUBE_Y - 0.15, LAMP_Z));
    // the lit air: the four sides of a frustum from the tube down to the floor
    const top = TUBE_Y - 0.06, tw = TUBE_L / 2, td = 0.12, bw = tw + 2.8, bd = 2.7;
    beamBox = { top, tw, td, bw, bd };
    const P = [[-tw, 0, -td], [tw, 0, -td], [tw, 0, td], [-tw, 0, td], [-bw, -top, -bd], [bw, -top, -bd], [bw, -top, bd], [-bw, -top, bd]];
    const pos = [];
    for (const [a, b, c, d] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) pos.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]);
    beam.geometry.dispose();
    beam.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    beam.geometry.computeVertexNormals();
    beam.position.set(0, top, LAMP_Z);
    beamMat.uniforms.uH.value = top;
  }
  function moteStep(t, dt) {                                       // dust turning slowly in the light
    const B = beamBox;
    for (let i = 0; i < MOTES; i++) {
      const m = moteV[i];
      m.h = (m.h + m.sp * dt * 0.07) % 1;
      const k = m.h, w = B.tw + (B.bw - B.tw) * k, dd = B.td + (B.bd - B.td) * k;
      motePos[i * 3] = m.s * w * 0.9 + Math.sin(t * 0.0004 + m.ph) * 0.18;
      motePos[i * 3 + 1] = B.top * (1 - k) + Math.sin(t * 0.0007 + m.ph) * 0.1;
      motePos[i * 3 + 2] = LAMP_Z + m.d * dd * 0.9 + Math.cos(t * 0.0005 + m.ph) * 0.14;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }

  // the three moods, in dial order. Lamp intensities are in candela; everything else follows the tube
  const MOODS = {
    dark:  { amb: ["#8ea3c9", 0.04], hemi: ["#223049", "#04060a", 0.22], fill: 0, lamp: ["#dfe8ff", 100], ends: 7, tube: "#e6eeff", halo: 0.6, ceil: 0.45, dying: 1,
             beam: 0.15, motes: 0.8, grid: 0.5, lift: 0, fog: ["#03050a", 0.028], wall: "#eef1f5", env: 0.22, exp: 1.12,
             ink: "#f1f4f8", tech: "#4d8df5", quote: "#a9b4c6", kind: "fail" },
    white: { amb: ["#ffffff", 1.4], hemi: ["#ffffff", "#f1f4f8", 0.85], fill: 1.0, lamp: ["#f5f8ff", 36], ends: 4, tube: "#ffffff", halo: 0.1, ceil: 0.1, dying: 0,
             beam: 0, motes: 0, grid: 0, lift: 0.3, fog: ["#ffffff", 0], wall: "#f6f8fb", env: 0.95, exp: 1,
             ink: "#0b0b0c", tech: "#1d6ae5", quote: "#3b4352", kind: "tube" },
    warm:  { amb: ["#ffd9ad", 0.3], hemi: ["#ffcf97", "#5a3c27", 0.5], fill: 0.1, lamp: ["#ffb466", 135], ends: 12, tube: "#ffd6a0", halo: 0.5, ceil: 0.55, dying: 0,
             beam: 0.07, motes: 0.45, grid: 0, lift: 0.04, fog: ["#38220f", 0.016], wall: "#f8f0e6", env: 0.55, exp: 1.05,
             ink: "#1c130c", tech: "#1d6ae5", quote: "#4a3a2c", kind: "hum" },
  };
  const ORDER = ["dark", "white", "warm"];
  const C = h => new THREE.Color(h);
  const resolve = m => ({
    amb: C(m.amb[0]), ambI: m.amb[1], hs: C(m.hemi[0]), hg: C(m.hemi[1]), hemiI: m.hemi[2], fill: m.fill,
    lamp: C(m.lamp[0]), lampI: m.lamp[1], endsI: m.ends, tube: C(m.tube), halo: m.halo, ceil: m.ceil, dying: m.dying,
    beam: m.beam, motes: m.motes, grid: m.grid, lift: m.lift, fog: C(m.fog[0]), fogD: m.fog[1], wall: C(m.wall), env: m.env, exp: m.exp,
    ink: srgb(m.ink), tech: srgb(m.tech), quote: srgb(m.quote), kind: m.kind,
  });
  const RS = ORDER.map(k => resolve(MOODS[k])), cur = resolve(MOODS.white), L = { power: 1 };
  const INK = { value: cur.ink.clone() }, TECH = { value: cur.tech.clone() }, QUOTE = { value: cur.quote.clone() };
  const WALL = { value: cur.wall.clone() }, GLOW = { value: 0 }, LIFT = { value: 0 };
  // the dial's position: 0 dark, 1 white, 2 warm, and anything between while it turns
  const dial = { u: 1, spin: 0, envU: -9, envAt: -1e9, settled: "", drag: null };

  // a real tube is never quite steady: it stutters, it hums, and a tired one blinks and fails
  const FL = { next: 2500, seq: [], buzz: [0, 0] };
  function flicker(t, kind) {
    if (reduce) return 1;
    let m = 1 + 0.005 * Math.sin(t * 0.047) + 0.004 * Math.sin(t * 0.113 + 2);
    if (kind === "hum") m += 0.012 * Math.sin(t * 0.0093) + 0.008 * Math.sin(t * 0.0231 + 1);
    if (t > FL.next) {
      const s = [];
      if (kind === "tube") {
        FL.next = t + rand(8000, 16000);
        for (let i = 0, a = t, n = 2 + ((Math.random() * 3) | 0); i < n; i++) { const d = rand(30, 80); s.push([a, a + d, rand(0.3, 0.7)]); a += d + rand(40, 140); }
      } else if (kind === "hum") {
        FL.next = t + rand(9000, 18000);
        s.push([t, t + rand(40, 90), rand(0.55, 0.8)]);
      } else {
        FL.next = t + rand(5500, 11000);
        for (let i = 0, a = t, n = 2 + ((Math.random() * 5) | 0); i < n; i++) { const d = rand(40, 140); s.push([a, a + d, rand(0.05, 0.45)]); a += d + rand(30, 160); }
        if (Math.random() < 0.5) FL.buzz = [t, t + rand(600, 1400)];
      }
      FL.seq = s;
    }
    for (const [a, b, v] of FL.seq) if (t >= a && t < b) m *= v;
    if (t >= FL.buzz[0] && t < FL.buzz[1]) m *= 0.88 + 0.12 * Math.sin(t * 0.38);
    return m;
  }
  let envRT = null;
  function setEnv(m) {                                              // what the robot's metal reflects: this room, lit this way
    const s = new THREE.Scene(), M = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 14), M(m.wall, 0.55 * m.ambI + 0.25 * m.hemiI + 0.12)); box.position.set(0, 4.5, -3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), M(m.wall, 0.5 * m.ambI + 0.3 * m.hemiI + 0.1)); floor.rotation.x = Math.PI / 2; floor.position.set(0, 0.01, -3);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.35), M(m.tube, m.lampI / 10)); strip.rotation.x = -Math.PI / 2; strip.position.set(0, 7.8, -1.5);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), M("#ffffff", m.fill * 1.6)); opening.position.set(0, 4.5, 4);
    s.add(box, floor, strip, opening);
    const rt = pmrem.fromScene(s, 0.03);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
    s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  function applyLight(t) {
    const u = clamp(dial.u, 0, 2), i = Math.min(1, Math.floor(u)), k = u - i, a = RS[i], b = RS[i + 1];
    for (const key of ["amb", "hs", "hg", "lamp", "tube", "fog", "wall"]) cur[key].copy(a[key]).lerp(b[key], k);
    for (const key of ["ambI", "hemiI", "fill", "lampI", "endsI", "halo", "ceil", "dying", "beam", "motes", "grid", "lift", "fogD", "env", "exp"]) cur[key] = lerp(a[key], b[key], k);
    cur.ink.lerpVectors(a.ink, b.ink, k); cur.tech.lerpVectors(a.tech, b.tech, k); cur.quote.lerpVectors(a.quote, b.quote, k);
    const fl = flicker(t, RS[Math.round(u)].kind) * L.power;
    ambient.color.copy(cur.amb); ambient.intensity = cur.ambI * (0.9 + 0.1 * fl);
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hemiI * (0.9 + 0.1 * fl);
    fill.intensity = cur.fill;
    lamp.color.copy(cur.lamp); lamp.intensity = cur.lampI * fl;
    for (const e of ends) { e.color.copy(cur.lamp); e.intensity = cur.endsI * fl; }
    tubeMat.uniforms.uColor.value.copy(cur.tube); tubeMat.uniforms.uPower.value = clamp(fl, 0, 1.2); tubeMat.uniforms.uDying.value = cur.dying; tubeMat.uniforms.uTime.value = t;
    halo.material.color.copy(cur.tube).multiplyScalar(cur.halo * fl); ceilGlow.material.color.copy(cur.lamp).multiplyScalar(cur.ceil * fl);
    beamMat.uniforms.uColor.value.copy(cur.lamp); beamMat.uniforms.uOpacity.value = cur.beam * fl;
    moteMat.color.copy(cur.lamp); moteMat.opacity = cur.motes * Math.min(1, fl);
    beam.visible = cur.beam > 0.002; motes.visible = cur.motes > 0.01;
    scene.fog.color.copy(cur.fog); scene.fog.density = cur.fogD;
    scene.environmentIntensity = cur.env;
    renderer.toneMappingExposure = cur.exp;
    WALL.value.copy(cur.wall); GLOW.value = cur.grid * (0.8 + 0.2 * fl); LIFT.value = cur.lift * (0.9 + 0.1 * fl);
    INK.value.copy(cur.ink); TECH.value.copy(cur.tech); QUOTE.value.copy(cur.quote);
  }
  let saved = null;
  try { saved = localStorage.getItem("jt-light"); } catch (e) { /* private mode */ }
  // the dial settles on a mood: the tube re-strikes (a quick double blink), and the choice is kept
  function settle(i, instant) {
    i = clamp(Math.round(i), 0, 2);
    const name = ORDER[i];
    if (instant || reduce || !window.gsap) dial.u = i;
    else { gsap.killTweensOf(dial, "u"); gsap.to(dial, { u: i, duration: 0.85, ease: "back.out(1.7)" }); }
    if (name === dial.settled) return;
    const first = !dial.settled;
    dial.settled = name;
    stage.dataset.light = name;
    if (dialEl) { dialEl.setAttribute("aria-valuenow", String(i)); dialEl.setAttribute("aria-valuetext", name[0].toUpperCase() + name.slice(1) + " light"); }
    try { localStorage.setItem("jt-light", name); } catch (e) { /* private mode */ }
    if (first || instant || reduce || !window.gsap) return;
    gsap.killTweensOf(L);
    gsap.timeline().to(L, { power: 0.35, duration: 0.05 }).to(L, { power: 0.95, duration: 0.05 }).to(L, { power: 0.5, duration: 0.07 }).to(L, { power: 1, duration: 0.3, ease: "power2.out" });
  }
  const setMood = (name, instant) => settle(ORDER.indexOf(name), instant);

  /* ------------------------------------------------ the dial: half a protractor on the right edge */
  // rolled by dragging it round, the wheel, a tap on a mood or the arrow keys. The light blends as it
  // turns and it springs to the nearest mood. Its scale magnifies where it passes the mark.
  const dialEl = $(".room__dial", stage), DT = [], DL = [], DEG = Math.PI / 180;
  let dialScale = null, dialRot = null;
  if (dialEl) {
    const S = (tag, attrs, parent) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
    const svg = S("svg", { viewBox: "0 0 120 240", "aria-hidden": "true" });
    S("path", { class: "room__dial-plate", d: "M120 0 A120 120 0 0 0 120 240 Z" }, svg);
    S("path", { class: "room__dial-rim", d: "M120 5 A115 115 0 0 0 120 235" }, svg);
    S("path", { class: "room__dial-rim", d: "M120 44 A76 76 0 0 0 120 196" }, svg);
    dialScale = S("g", { class: "room__dial-scale" }, svg);
    for (let a = -177; a <= 180; a += 3) {                         // a tick every 3°, longer every 15° and 30°
      const major = a % 30 === 0, mid = a % 15 === 0;
      DT.push({ a, base: major ? 10 : mid ? 7 : 4, el: S("line", { class: major ? "is-major" : mid ? "is-mid" : "" }, dialScale) });
      if (major) {
        const r = 96, x = 120 - r * Math.cos(a * DEG), y = 120 - r * Math.sin(a * DEG);
        S("text", { class: "room__dial-num", x: x.toFixed(2), y: y.toFixed(2), transform: `rotate(${a - 90} ${x.toFixed(2)} ${y.toFixed(2)})` }, dialScale).textContent = String((180 - a + 360) % 360);
      }
    }
    ORDER.forEach((m, i) => {
      const g = S("g", { class: "room__dial-label", "data-mood": m }, svg);
      S("circle", { class: "room__dial-dot", r: 3.4 }, g);
      S("text", { x: 7.5, y: 3.4 }, g).textContent = m.toUpperCase();
      DL.push({ g, a: 60 - 60 * i });
    });
    S("path", { class: "room__dial-mark", d: "M3 113 L12.5 120 L3 127 Z" }, svg);
    dialEl.appendChild(svg);

    const centre = () => { const r = dialEl.getBoundingClientRect(); return [r.right, r.top + r.height / 2]; };
    const angleAt = (x, y) => { const [ax, ay] = centre(); return Math.atan2(ay - y, ax - x) / DEG; };
    const rubber = x => 0.3 * (1 - Math.exp(-x / 0.3));           // pulling past the ends meets resistance
    dialEl.addEventListener("pointerdown", e => {
      try { dialEl.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
      if (window.gsap) gsap.killTweensOf(dial, "u");
      dial.drag = { a0: angleAt(e.clientX, e.clientY), u0: dial.u, x: e.clientX, y: e.clientY, moved: 0 };
    });
    dialEl.addEventListener("pointermove", e => {
      if (!dial.drag) return;
      const d = dial.drag;
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
      let u = d.u0 - (angleAt(e.clientX, e.clientY) - d.a0) / 60;
      if (u < 0) u = -rubber(-u); else if (u > 2) u = 2 + rubber(u - 2);
      dial.u = u;
    });
    const release = e => {
      const d = dial.drag;
      if (!d) return;
      dial.drag = null;
      if (d.moved > 5) return settle(dial.u);
      const lb = e.target.closest && e.target.closest(".room__dial-label");    // a tap: that mood, or a step towards the side tapped
      settle(lb ? ORDER.indexOf(lb.dataset.mood) : Math.round(dial.u) + (e.clientY < centre()[1] ? -1 : 1));
    };
    dialEl.addEventListener("pointerup", release);
    dialEl.addEventListener("pointercancel", release);
    let wheelT = 0;
    dialEl.addEventListener("wheel", e => {
      e.preventDefault();
      if (window.gsap) gsap.killTweensOf(dial, "u");
      dial.u = clamp(dial.u + e.deltaY * 0.0032, -0.25, 2.25);
      clearTimeout(wheelT); wheelT = setTimeout(() => settle(dial.u), 170);
    }, { passive: false });
    dialEl.addEventListener("keydown", e => {
      const step = { ArrowUp: -1, ArrowLeft: -1, PageUp: -1, ArrowDown: 1, ArrowRight: 1, PageDown: 1 }[e.key];
      if (step) { e.preventDefault(); settle(Math.round(dial.u) + step); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); settle(e.key === "Home" ? 0 : 2); }
    });
  }
  function drawDial() {
    if (!dialScale) return;
    const rot = 60 * dial.u - 60 + dial.spin;                       // degrees, clockwise
    if (rot === dialRot) return;
    dialRot = rot;
    dialScale.setAttribute("transform", `rotate(${rot.toFixed(3)} 120 120)`);
    for (const T of DT) {
      const th = ((T.a + rot + 540) % 360) - 180, w = Math.exp(-((th / 15) ** 2));
      const r2 = 114, r1 = r2 - T.base * (1 + 0.9 * w), c = Math.cos(T.a * DEG), s = Math.sin(T.a * DEG);
      T.el.setAttribute("x1", (120 - r1 * c).toFixed(2)); T.el.setAttribute("y1", (120 - r1 * s).toFixed(2));
      T.el.setAttribute("x2", (120 - r2 * c).toFixed(2)); T.el.setAttribute("y2", (120 - r2 * s).toFixed(2));
      T.el.style.opacity = (0.3 + 0.7 * w).toFixed(3);
    }
    for (const Lb of DL) {
      const th = Lb.a + rot, w = Math.exp(-((th / 24) ** 2)), r = 60;
      const x = 120 - r * Math.cos(th * DEG), y = 120 - r * Math.sin(th * DEG);
      Lb.g.setAttribute("transform", `translate(${(x - 14).toFixed(2)} ${y.toFixed(2)}) scale(${(0.82 + 0.34 * w).toFixed(3)})`);
      Lb.g.style.opacity = (clamp(1 - Math.abs(th) / 100, 0, 1) * (0.4 + 0.6 * w)).toFixed(3);
    }
  }

  /* ------------------------------------------------ the room: five ruled surfaces, lit */
  const ROOM = new THREE.Vector4(), LINE = { value: new THREE.Color("#345ca8") }, EDGE = { value: new THREE.Color("#244078") };
  const roomMat = face => {
    const m = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uFace: { value: face }, uRoom: { value: ROOM }, uLine: LINE, uEdge: EDGE, uWall: WALL, uGlow: GLOW, uLift: LIFT });
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRoomW;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvRoomW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform int uFace; uniform vec4 uRoom; uniform vec3 uLine, uEdge, uWall; uniform float uGlow, uLift; varying vec3 vRoomW;
          float gridL(float c) { float d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4); return clamp(1.0 - d, 0.0, 1.0); }`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          float xL = uRoom.x, xR = uRoom.y, D = uRoom.z, HR = uRoom.w, back = vRoomW.z + D, up = HR - vRoomW.y;
          vec2 p, per; float e;
          if (uFace == 0) { p = vec2(vRoomW.x, up); per = vec2(4.0, 3.0); e = min(min(vRoomW.x - xL, xR - vRoomW.x), min(vRoomW.y, up)); }
          else if (uFace < 3) { p = vec2(vRoomW.x, back); per = vec2(4.0); e = min(min(vRoomW.x - xL, xR - vRoomW.x), back); }
          else { p = vec2(back, up); per = vec2(4.0, 3.0); e = min(min(vRoomW.y, up), back); }
          vec3 alb = uWall * (1.0 - 0.07 * clamp((-vRoomW.z - 5.5) / (D - 5.5), 0.0, 1.0));
          alb *= 1.0 - 0.06 * exp(-e / 0.35) - 0.04 * exp(-e / 1.5);          // shade gathering in the corners
          float gMinor = max(gridL(p.x), gridL(p.y)), gMajor = max(gridL(p.x / per.x), gridL(p.y / per.y));
          float gEdge = clamp(1.1 - e / max(fwidth(e), 1e-4), 0.0, 1.0);
          alb = mix(alb, uLine, gMinor * 0.12); alb = mix(alb, uLine, gMajor * 0.22); alb = mix(alb, uEdge, gEdge * 0.32);
          diffuseColor.rgb = alb;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += uLine * uGlow * (gMinor * 0.22 + gMajor * 0.5 + gEdge * 0.7);   // in the dark the grid glows
          if (uFace == 2) totalEmissiveRadiance += diffuseColor.rgb * uLift;                        // light bouncing up to the ceiling`);
    };
    return m;
  };
  const FACES = [0, 1, 2, 3, 4].map(i => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), roomMat(i));
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  });
  function placeRoom() {
    const wr = xR - xL, len = D - ZN, zc = -(D + ZN) / 2;
    ROOM.set(xL, xR, D, HR);
    const [back, floor, ceil, left, right] = FACES;
    back.scale.set(wr, HR, 1); back.position.set(0, HR / 2, -D);
    floor.scale.set(wr, len, 1); floor.rotation.set(-Math.PI / 2, 0, 0); floor.position.set(0, 0, zc);
    ceil.scale.set(wr, len, 1); ceil.rotation.set(Math.PI / 2, 0, 0); ceil.position.set(0, HR, zc);
    left.scale.set(len, HR, 1); left.rotation.set(0, Math.PI / 2, 0); left.position.set(xL, HR / 2, zc);
    right.scale.set(len, HR, 1); right.rotation.set(0, -Math.PI / 2, 0); right.position.set(xR, HR / 2, zc);
    placeFixture();
    placeVines();
  }

  /* ------------------------------------------------ vines creeping over the walls */
  function vine(seed, root, dir, reach) {                            // a canvas: a few tendrils with leaves, the odd flower
    const S = 1024, c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = c.height = S;
    let s = seed;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.lineCap = "round"; g.lineJoin = "round";
    const leafAt = (x, y, a, sz) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(sz * 0.3, -sz * 0.42, sz * 0.8, -sz * 0.36, sz * 1.1, 0); g.bezierCurveTo(sz * 0.8, sz * 0.36, sz * 0.3, sz * 0.42, 0, 0);
      const gr = g.createLinearGradient(0, 0, sz, 0); gr.addColorStop(0, "rgba(31,79,190,.72)"); gr.addColorStop(1, "rgba(110,156,240,.66)");
      g.fillStyle = gr; g.fill();
      g.strokeStyle = "rgba(225,236,255,.45)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(sz * 0.1, 0); g.lineTo(sz * 0.95, 0); g.stroke();
      g.restore();
    };
    const bloom = (x, y, sz) => {
      g.save(); g.translate(x, y);
      for (let i = 0; i < 5; i++) {
        g.rotate(TAU / 5); g.beginPath(); g.ellipse(0, -sz * 0.55, sz * 0.32, sz * 0.55, 0, 0, TAU);
        g.fillStyle = "rgba(92,142,238,.7)"; g.fill();
      }
      g.beginPath(); g.arc(0, 0, sz * 0.22, 0, TAU); g.fillStyle = "rgba(18,51,127,.8)"; g.fill();
      g.restore();
    };
    const stem = (x, y, a, len, wid, depth) => {
      const pts = [[x, y, a]];
      for (let i = 0, n = Math.ceil(len / 12); i < n; i++) {
        a += (R() - 0.5) * 0.32 + Math.sin(i * 0.28 + seed) * 0.045;
        x += Math.cos(a) * 12; y += Math.sin(a) * 12;
        pts.push([x, y, a]);
      }
      for (let i = 1; i < pts.length; i++) {
        g.lineWidth = Math.max(0.8, wid * (1 - (i / pts.length) * 0.8));
        g.strokeStyle = "rgba(86,98,122,.5)";
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      }
      for (let i = 3; i < pts.length; i += 3) {
        if (R() < 0.3) continue;
        const [px, py, pa] = pts[i], side = i % 2 ? 1 : -1;
        leafAt(px, py, pa + side * (0.75 + R() * 0.5), (15 + R() * 10) * (1 - (i / pts.length) * 0.45));
      }
      if (depth > 0) for (let i = 5; i < pts.length - 3; i += 6 + ((R() * 5) | 0)) {
        if (R() < 0.4) continue;
        const [px, py, pa] = pts[i];
        stem(px, py, pa + (R() < 0.5 ? -1 : 1) * (0.55 + R() * 0.6), len * (0.3 + R() * 0.25), wid * 0.6, depth - 1);
      }
      if (R() < 0.55) bloom(x, y, 9 + R() * 5);
    };
    stem(root[0] * S, root[1] * S, dir, reach * S, 5.5, 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }
  const VINES = [
    { tex: vine(17, [0.86, 1.0], -Math.PI / 2 - 0.55, 1.05), size: 6.2 },   // left wall, climbing from the far corner
    { tex: vine(41, [0.2, 0.0], Math.PI / 2 + 0.25, 0.8), size: 5.2 },     // right wall, hanging from the ceiling
    { tex: vine(73, [0.0, 0.04], 0.45, 0.62), size: 3.6 },                // the back wall's top-left corner
  ].map(v => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: v.tex, transparent: true, depthWrite: false }));
    m.scale.set(v.size, v.size, 1); m.renderOrder = 2; m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  function placeVines() {
    const [l, r, b] = VINES;
    l.rotation.set(0, Math.PI / 2, 0); l.position.set(xL + 0.015, 3.1, -9.8);
    r.rotation.set(0, -Math.PI / 2, 0); r.position.set(xR - 0.015, HR - 2.6, -8.2);
    b.rotation.set(0, 0, 0); b.position.set(xL + 1.8, HR - 1.8, -D + 0.015);
  }

  /* ------------------------------------------------ petal and leaf sprites, in one atlas */
  const SPR = 96, SPR_D = 60, CELL = 128, COLS = 8;              // the shapes span SPR_D of each SPR sprite
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, amt) => {
    const c = hex(h).map(v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
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
  const cells = [], PETALS = [], LEAVES = [];                     // [front cell, back cell] per variant
  const atlas = document.createElement("canvas");
  {
    const draws = [];
    PETAL_COLS.forEach((c, i) => [true, false].forEach(notch => {
      const skew = ((i % 3) - 1) * 0.12;
      PETALS.push(draws.length / 2);
      draws.push(g => drawPetal(g, c, false, notch, skew), g => drawPetal(g, c, true, notch, skew));
    }));
    LEAF_COLS.forEach(c => [false, true].forEach(narrow => {
      LEAVES.push(draws.length / 2);
      draws.push(g => drawLeaf(g, c, false, narrow), g => drawLeaf(g, c, true, narrow));
    }));
    atlas.width = COLS * CELL; atlas.height = Math.ceil(draws.length / COLS) * CELL;
    const g = atlas.getContext("2d");
    draws.forEach((d, i) => {
      g.save(); g.translate((i % COLS + 0.5) * CELL, (((i / COLS) | 0) + 0.5) * CELL); g.scale(CELL / SPR, CELL / SPR);
      d(g); g.restore();
    });
    for (let i = 0; i < draws.length; i += 2) cells.push([i % COLS, (i / COLS) | 0, (i + 1) % COLS, ((i + 1) / COLS) | 0]);
  }
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.flipY = false; atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
  const LEAF_U = { uGrid: { value: new THREE.Vector2(COLS, atlas.height / CELL) }, uFade: { value: 0 } };

  // leaves and petals: one instanced quad each, lit by the lamp, casting real shadows.
  // Each quad picks its sprite from the atlas, and its underside shows the sprite's back.
  const MAXP = 420;
  const leafVert = sh => sh.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec4 aCell; attribute float aAlpha; uniform vec2 uGrid; varying vec2 vFrontUv, vBackUv; varying float vLeafA;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\n{ vec2 t = vec2(uv.x, 1.0 - uv.y); vFrontUv = (aCell.xy + t) / uGrid; vBackUv = (aCell.zw + vec2(1.0 - t.x, t.y)) / uGrid; vLeafA = aAlpha; }");
  const leafFrag = sh => sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vFrontUv, vBackUv; varying float vLeafA; uniform float uFade;")
    .replace("#include <map_fragment>", "vec4 leafTex = texture2D(map, gl_FrontFacing ? vFrontUv : vBackUv); diffuseColor *= leafTex; diffuseColor.a *= vLeafA * uFade;");
  const leafMat = new THREE.MeshLambertMaterial({ map: atlasTex, side: THREE.DoubleSide, alphaTest: 0.3, alphaToCoverage: true });
  leafMat.onBeforeCompile = sh => { Object.assign(sh.uniforms, LEAF_U); sh.vertexShader = leafVert(sh); sh.fragmentShader = leafFrag(sh); };
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlasTex, alphaTest: 0.3, side: THREE.DoubleSide });
  leafDepth.onBeforeCompile = sh => { Object.assign(sh.uniforms, LEAF_U); sh.vertexShader = leafVert(sh); sh.fragmentShader = leafFrag(sh); };
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4), aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAXP), 1);
  aCell.setUsage(THREE.DynamicDrawUsage); aAlpha.setUsage(THREE.DynamicDrawUsage);
  leafGeo.setAttribute("aCell", aCell); leafGeo.setAttribute("aAlpha", aAlpha);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, MAXP);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); leafMesh.frustumCulled = false; leafMesh.count = 0;
  leafMesh.castShadow = true; leafMesh.receiveShadow = true; leafMesh.customDepthMaterial = leafDepth;
  scene.add(leafMesh);

  /* ------------------------------------------------ the lettering, as planes in the room */
  const letterMat = (tex, color) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uColor: color, uOpacity: { value: 0 }, uBlur: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uColor; uniform float uOpacity, uBlur; varying vec2 vUv;
      void main() { float a = texture2D(map, vUv, uBlur).a * uOpacity; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
  });
  const floaters = [
    ...$$(".room__ch", stage).map(el => ({ el, dz: rand(-0.3, 0.3), ph: rand(0, TAU), letter: true, color: el.closest(".room__word--tech") ? TECH : INK })),
    ...$$(".room__quote", stage).map(el => ({ el, dz: 0.8, ph: 0, letter: false, color: QUOTE })),
  ].map(F => Object.assign(F, { intro: reduce ? 0 : 1, op: reduce ? 1 : 0, blur: reduce ? 0 : 4, bob: 0, z: -ZT, mesh: null }));
  const cue = $(".room__scroll", stage), cueIn = cue && $(".room__scroll-in", cue);
  // the letters are drawn from the same web font, the same size, where CSS laid them out
  function buildFloaters() {
    const sr = stage.getBoundingClientRect(), k = Math.min(3, (devicePixelRatio || 1) * 2);
    for (const F of floaters) {
      const r = F.el.getBoundingClientRect(), cs = getComputedStyle(F.el), pad = 0.14 * parseFloat(cs.fontSize);
      const c = document.createElement("canvas"), g = c.getContext("2d");
      c.width = Math.ceil((r.width + pad * 2) * k); c.height = Math.ceil((r.height + pad * 2) * k);
      g.scale(k, k);
      g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      g.fillStyle = "#fff";
      g.textBaseline = "alphabetic";
      if (F.letter) {
        const m = g.measureText(F.el.textContent), lh = r.height;
        g.fillText(F.el.textContent, pad, pad + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent);
      } else {                                                    // the quote, broken into lines exactly as the page breaks it
        const range = document.createRange(), text = F.el.firstChild, lines = [];
        for (const w of F.el.textContent.matchAll(/\S+/g)) {
          range.setStart(text, w.index); range.setEnd(text, w.index + w[0].length);
          const b = range.getBoundingClientRect(), line = lines.find(l => Math.abs(l.top - b.top) < 2);
          if (line) line.words.push(w[0]); else lines.push({ top: b.top, left: b.left, words: [w[0]] });
        }
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
        for (const l of lines) {
          const m = g.measureText(l.words.join(" "));
          g.fillText(l.words.join(" "), pad + l.left - r.left, pad + l.top - r.top + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.premultiplyAlpha = true; tex.anisotropy = 8; tex.minFilter = THREE.LinearMipmapLinearFilter;
      F.ex = r.left - sr.left + r.width / 2; F.ey = r.top - sr.top + r.height / 2;
      F.z0 = ZT + F.dz;
      F.xw = (F.ex - W / 2) * F.z0 / f;                            // where it sits in the room with the camera at rest
      F.yw = EYE + (VP * H - F.ey) * F.z0 / f;
      if (F.mesh) { F.mesh.material.uniforms.map.value.dispose(); F.mesh.material.uniforms.map.value = tex; F.mesh.geometry.dispose(); }
      else { F.mesh = new THREE.Mesh(undefined, letterMat(tex, F.color)); F.mesh.renderOrder = 3; scene.add(F.mesh); }
      F.mesh.geometry = new THREE.PlaneGeometry((r.width + pad * 2) * F.z0 / f, (r.height + pad * 2) * F.z0 / f);
    }
    placeFloaters(0);
  }
  function placeFloaters(t) {
    for (const F of floaters) {
      if (!F.mesh) continue;
      F.z = -(F.z0 + F.intro * (D - 0.6 - F.z0));
      F.bob = F.letter && !reduce ? Math.sin(t * 0.0011 + F.ph) * 0.05 : 0;
      F.mesh.position.set(F.xw, F.yw + F.bob, F.z);
      const u = F.mesh.material.uniforms, d = depthOf(F.z);
      u.uOpacity.value = F.op * clamp((d - 0.8) / 2.2, 0, 1);
      u.uBlur.value = F.blur;
      F.mesh.visible = u.uOpacity.value > 0.002;
    }
  }

  /* ------------------------------------------------ the robot */
  const BOT_SCALE = 1.15, HL = 0.61 * BOT_SCALE, HW = 0.34 * BOT_SCALE, TRACK = 0.27 * BOT_SCALE;
  const bot = { obj: null, x: -1.6, z: -8.4, th: -0.6, v: 0, w: 0, vx: 0, vz: 0, gx: -1.6, gz: -8.4, tx: -1.6, tz: -8.4, wheels: [], tilt: null, acc: 0, pitch: 0, pv: 0, roll: 0, rv: 0 };
  // a soft dark patch under the chassis, so it sits on the floor whatever the light
  const contact = document.createElement("canvas"); contact.width = contact.height = 128;
  { const g = contact.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(10,16,30,.85)"); gr.addColorStop(0.5, "rgba(10,16,30,.45)"); gr.addColorStop(1, "rgba(10,16,30,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const contactMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contact), transparent: true, depthWrite: false, opacity: 0.5, toneMapped: false });
  const contactMesh = new THREE.Mesh(new THREE.PlaneGeometry(HL * 2.5, HW * 2.9).rotateX(-Math.PI / 2), contactMat);
  contactMesh.position.y = 0.006; contactMesh.renderOrder = 1;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(new URL("./assets/models/janyu-tech-bot.glb", import.meta.url).href, gltf => {
    const model = gltf.scene;
    model.scale.setScalar(BOT_SCALE);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (m && m.isMeshStandardMaterial) { m.envMapIntensity = 1; if (m.metalness > 0.5) m.roughness = Math.max(m.roughness, 0.28); }
    });
    const g = new THREE.Group();
    g.add(model, contactMesh); scene.add(g);
    g.updateMatrixWorld(true);
    // each wheel turns on its own centre (compression can move a node's origin)
    model.traverse(o => {
      const m = /^Wheel_(Left|Right)_(Drive|Idler|Roller_\d)$/.exec(o.name);
      if (!m) return;
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), box = new THREE.Box3();
      o.traverse(n => { if (n.isMesh) { n.geometry.computeBoundingBox(); box.union(n.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld))); } });
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), pivot = new THREE.Group();
      pivot.position.copy(c);
      for (const ch of [...o.children]) { ch.position.sub(c); pivot.add(ch); }
      o.add(pivot);
      bot.wheels.push({ pivot, left: m[1] === "Left", r: Math.max(Math.max(size.x, size.y) / 2 * o.getWorldScale(new THREE.Vector3()).x, 0.01) });
    });
    bot.tilt = model.getObjectByName("BodyTilt");
    bot.obj = g;
    placeBot(0);
    if (!running) still();
  });
  function placeBot(dt) {
    if (!bot.obj) return;
    bot.obj.position.set(bot.x, 0, bot.z);
    bot.obj.rotation.y = bot.th;
    for (const wh of bot.wheels) wh.pivot.rotation.z -= (bot.v + (wh.left ? -1 : 1) * bot.w * TRACK) / wh.r * dt;
    if (bot.tilt) { bot.tilt.rotation.z = bot.pitch; bot.tilt.rotation.x = bot.roll; }
  }
  // follow the goal in smooth arcs: turn towards it, drive while roughly facing it, ease off as it arrives.
  // Speeds and turn rates ease towards what's wanted, so there is never a jolt.
  function drive(dt) {
    if (!bot.obj) return;
    const k = 1 - Math.exp(-dt * 3.5);
    bot.tx += (bot.gx - bot.tx) * k; bot.tz += (bot.gz - bot.tz) * k;       // the goal itself glides
    const dx = bot.tx - bot.x, dz = bot.tz - bot.z, dist = Math.hypot(dx, dz);
    const err = dist > 0.05 ? wrapAngle(Math.atan2(-dz, dx) - bot.th) : 0;
    const arrive = clamp((dist - 0.3) / 1.8, 0, 1);
    const vWant = 1.45 * arrive * Math.max(0, Math.cos(err)) ** 1.5;
    const wWant = clamp(2.2 * err, -1.5, 1.5) * clamp(dist / 0.4, 0, 1);
    const v0 = bot.v;
    bot.v += (vWant - bot.v) * (1 - Math.exp(-dt * 2.4));
    bot.w += (wWant - bot.w) * (1 - Math.exp(-dt * 4));
    bot.th = wrapAngle(bot.th + bot.w * dt);
    const fx = Math.cos(bot.th), fz = -Math.sin(bot.th);
    const nx = clamp(bot.x + fx * bot.v * dt, xL + 0.9, xR - 0.9), nz = clamp(bot.z + fz * bot.v * dt, -D + 0.9, -3);
    bot.vx = (nx - bot.x) / dt; bot.vz = (nz - bot.z) / dt;
    bot.x = nx; bot.z = nz;
    // the body dips as it brakes and lifts as it pulls away, and leans out of a turn (critically damped)
    bot.acc += ((bot.v - v0) / dt - bot.acc) * (1 - Math.exp(-dt * 8));
    const pT = clamp(bot.acc * 0.02, -0.045, 0.045), rT = clamp(-bot.w * bot.v * 0.022, -0.04, 0.04);
    bot.pv += (-(bot.pitch - pT) * 64 - bot.pv * 16) * dt; bot.pitch += bot.pv * dt;
    bot.rv += (-(bot.roll - rT) * 64 - bot.rv * 16) * dt; bot.roll += bot.rv * dt;
  }

  /* ------------------------------------------------ pointer and scroll */
  const Pt = { x: -9999, y: -9999, px: 0, py: 0, vx: 0, vy: 0, speed: 0, nx: 0, ny: 0, sx: 0, sy: 0, inside: false, moved: false };
  const point = (X, Y) => {
    const r = stage.getBoundingClientRect();
    Pt.x = X - r.left; Pt.y = Y - r.top;
    Pt.nx = clamp(Pt.x / r.width * 2 - 1, -1, 1); Pt.ny = clamp(Pt.y / r.height * 2 - 1, -1, 1);
    if (!Pt.inside) { Pt.px = Pt.x; Pt.py = Pt.y; }
    Pt.inside = true; Pt.moved = true;
  };
  const leave = () => { Pt.inside = false; Pt.nx = 0; Pt.ny = 0; };
  stage.addEventListener("pointermove", e => point(e.clientX, e.clientY), { passive: true });
  stage.addEventListener("pointerdown", e => point(e.clientX, e.clientY), { passive: true });
  stage.addEventListener("touchmove", e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("touchend", leave);
  let heroTop = 0, span = 0;
  const progress = () => (span > 1 ? clamp((scrollY - heroTop) / span, 0, 1) : 0);
  // where the pointer's line of sight meets the room: [x, z, on the floor?], or null on the ceiling
  function aim(u, v) {
    const o = eye(), dx = (u - cx) / f, dy = -(v - cy) / f;
    if (dy < -0.02) {
      const t = o.y / -dy, x = o.x + dx * t, z = o.z - t;
      if (z > -D && x > xL && x < xR) return [x, z, true];
    }
    const t = D + o.z, xb = o.x + dx * t, yb = o.y + dy * t;          // otherwise the back wall, or a side wall
    if (xb > xL && xb < xR && yb > 0 && yb < HR) return [xb, -D + 1, false];
    const ts = ((dx < 0 ? xL : xR) - o.x) / dx, zs = o.z - ts, ys = o.y + dy * ts;
    return ys > 0 && ys < HR ? [dx < 0 ? xL + 1 : xR - 1, zs, false] : null;
  }
  // the tube answers a click: the dial rolls on to the next mood
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const overLamp = (X, Y) => {
    const r = stage.getBoundingClientRect();
    ndc.set((X - r.left) / r.width * 2 - 1, -((Y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects([tube, channel, ...caps], false).length > 0;
  };
  stage.addEventListener("click", e => {
    if (e.target.closest("a, button") || !overLamp(e.clientX, e.clientY)) return;
    settle((Math.round(dial.u) + 1) % 3);
  });
  let hoverCheck = 0;
  stage.addEventListener("pointermove", e => {
    const now = performance.now();
    if (!fine || now < hoverCheck) return;
    hoverCheck = now + 80;
    canvas.style.cursor = overLamp(e.clientX, e.clientY) ? "pointer" : "";
  }, { passive: true });
  const floorVel = { x: 0, z: 0, fx: 0, fz: 0, on: false, speed: 0 };

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
    WIND.bx = breeze + g * WIND.dir + WIND.ptr;                      // on the branches, in screen terms
    WIND.by = g * 0.4 * Math.sin(t * 0.0042);
    WIND.x = 0.08 * Math.sin(t * 0.00017) + g * WIND.dir * 0.35;    // in the room, units a second
    WIND.z = 0.42 + 0.12 * Math.sin(t * 0.00029) + g * 0.8;          // blowing in through the opening
    WIND.lift = g * 0.28;
  }

  /* ------------------------------------------------ branches (SVG, in the two top corners) */
  const NS = "http://www.w3.org/2000/svg";
  const twigs = [], blossoms = [], leaves = [], branches = [];
  let seed = 7, cur2 = null;
  const srand = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const PETAL_D = "M0 0 C -5 -4 -6 -12 0 -17 C 6 -12 5 -4 0 0 Z";
  const qpt = (x0, y0, cx1, cy1, x1, y1, t) => { const u = 1 - t; return [u * u * x0 + 2 * u * t * cx1 + t * t * x1, u * u * y0 + 2 * u * t * cy1 + t * t * y1]; };
  // spring constants by twig depth (index 0 = thin tip … 4 = main limb): a gentle sway
  const GAIN = [1.7, 1.3, 0.95, 0.7, 0.45], STIFF = [52, 38, 28, 20, 15], DAMP = [5.4, 4.8, 4.3, 3.9, 3.5];
  const BREEZE = [0.8, 0.62, 0.46, 0.32, 0.2], KICK = [0.7, 0.5, 0.32, 0.18, 0.08];
  function blossom(parent, x, y, r, chain) {
    const b = { x, y, r, r0: srand(0, 72), s: r / 17, chain, br: cur2, ph: srand(0, 6.28), fl: 0, fv: 0, pop: reduce ? 1 : 0, cool: 0, petals: [] };
    b.g = mk("g", { class: "bl", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${b.r0.toFixed(1)}) scale(${(b.s * b.pop).toFixed(3)})` }, parent);
    for (let i = 0; i < 5; i++) b.petals.push({ el: mk("path", { d: PETAL_D, transform: `rotate(${i * 72})`, fill: `url(#${cur2.gid})`, class: "bl-petal" }, b.g), on: true });
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
    leaves.push({ el, x: x + Math.cos(a * Math.PI / 180) * 11 * s, y: y + Math.sin(a * Math.PI / 180) * 11 * s, chain, br: cur2, on: true });
  }
  function grow(parent, x, y, ang, len, w, depth, droop, chain) {
    const g = mk("g", {}, parent);
    const bend = srand(-0.35, 0.35);
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    const cx1 = x + Math.cos(ang + bend) * len * 0.55, cy1 = y + Math.sin(ang + bend) * len * 0.55;
    mk("path", { class: "br-stroke", d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx1.toFixed(1)} ${cy1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, "stroke-width": w.toFixed(2) }, g);
    const tw = {
      g, px: x, py: y, dx: Math.cos(ang), dy: Math.sin(ang), mid: qpt(x, y, cx1, cy1, x1, y1, 0.6), depth, a: 0, v: 0,
      ph: srand(0, 6.28), f1: srand(0.0007, 0.0012), f2: srand(0.004, 0.007), chain, br: cur2,
    };
    twigs.push(tw);
    const inner = tw.full = [...chain, tw];
    if (depth > 0) {
      const n = depth >= 3 ? 2 : Math.round(srand(1.6, 2.6));
      for (let i = 0; i < n; i++) {
        const [px, py] = qpt(x, y, cx1, cy1, x1, y1, srand(0.42, 1));
        grow(g, px, py, ang + (i % 2 ? 1 : -1) * srand(0.3, 0.8) + droop, len * srand(0.56, 0.76), Math.max(0.8, w * 0.62), depth - 1, droop, inner);
      }
      if (depth <= 2) for (let i = 0; i < 2; i++) {
        if (srand(0, 1) < 0.35) continue;
        const [px, py] = qpt(x, y, cx1, cy1, x1, y1, srand(0.3, 0.9));
        leaf(g, px, py, ang, inner);
      }
    }
    if (depth === 0) {
      blossom(g, x1, y1, srand(15, 20), inner);
      if (srand(0, 1) > 0.55) { const [bx, by] = qpt(x, y, cx1, cy1, x1, y1, srand(0.35, 0.7)); bud(g, bx, by); }
    } else if (depth <= 2 && srand(0, 1) > 0.45) {
      const [bx, by] = qpt(x, y, cx1, cy1, x1, y1, srand(0.45, 0.85));
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
    cur2 = { host, svg, gid, corner, left: 0, top: 0, scale: 1, ox: 0, oy: 0 };
    if (corner === "tl") {
      seed = 11;
      grow(root, -14, 14, 0.1, 330, 8, 4, 0.14, []);
      grow(root, -14, 58, 0.66, 175, 5, 3, 0.1, []);
    } else {                                                      // the same kind of spray, coming in from the right
      seed = 23;
      grow(root, 14, 14, Math.PI - 0.12, 300, 7.5, 4, -0.14, []);
      grow(root, 14, 62, Math.PI - 0.7, 160, 4.8, 3, -0.1, []);
    }
    const bb = root.getBBox();
    cur2.vb = corner === "tl"
      ? { x: 0, y: 0, w: Math.ceil(bb.x + bb.width + 26), h: Math.ceil(bb.y + bb.height + 26) }
      : { x: Math.floor(bb.x - 26), y: 0, w: -Math.floor(bb.x - 26), h: Math.ceil(bb.y + bb.height + 26) };
    svg.setAttribute("viewBox", `${cur2.vb.x} ${cur2.vb.y} ${cur2.vb.w} ${cur2.vb.h}`);
    branches.push(cur2);
  }
  $$("[data-branch]", stage).forEach(h => buildBranch(h, h.dataset.branch));
  function worldPt(x, y, chain) {                                  // forward kinematics through the nested twigs
    for (let i = chain.length - 1; i >= 0; i--) {
      const tw = chain[i];
      if (!tw.a) continue;
      const r = tw.a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - tw.px, dy = y - tw.py;
      x = tw.px + dx * c - dy * s; y = tw.py + dx * s + dy * c;
    }
    return [x, y];
  }
  const toStage = (br, [x, y]) => [br.left + br.ox + (x - br.vb.x) * br.scale, br.top + br.oy + (y - br.vb.y) * br.scale];

  /* ------------------------------------------------ leaves and petals in the room */
  const parts = [];
  let settledCap = 160, airTarget = 30;
  function particle(kind, x, y, z, air) {
    const leafy = kind === 1, v = (Math.random() * (leafy ? LEAVES.length : PETALS.length)) | 0;
    return {
      kind, x, y, z, vx: 0, vy: 0, vz: 0, air, land: air ? 0 : 1, fade: 1, dying: false, age: 0,
      size: leafy ? rand(0.2, 0.3) : rand(0.13, 0.19),
      vt: leafy ? rand(0.95, 1.3) : rand(0.6, 0.9),                 // falling speed, units a second
      ph: rand(0, TAU), pf: leafy ? rand(1.3, 2.3) : rand(0.5, 1.2), sa: rand(0.2, 0.55), dir: rand(0, TAU),
      yaw: rand(0, TAU), vyaw: rand(-0.6, 0.6), spin: rand(0, TAU), vs: (leafy ? rand(1.2, 2.4) : rand(2.2, 5)) * (Math.random() < 0.5 ? -1 : 1),
      axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
      curl: rand(-0.14, 0.14), lift: rand(0.012, 0.03),
      cell: cells[leafy ? LEAVES[v] : PETALS[v]], alpha: rand(0.86, 1),
    };
  }
  const kindOf = () => (Math.random() < 0.5 ? 1 : 0);
  const halfView = d => (W / 2) / f * d;
  function spawn() {
    let x, y, z, fadeIn = false;
    if (Math.random() < 0.7) {                                    // blown in from the branches, above the top of the view
      const d = rand(1.8, 5.8);
      z = -(cam.z + d);
      x = eye().x + (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 1) * halfView(d);
      y = Math.min(HR - 0.15, eye().y + (cy / f) * d + rand(0.3, 1));
    } else {                                                      // or drifting down deeper in the room
      z = -rand(Math.max(6.5, cam.z + 2), 12.5); x = rand(xL + 0.4, xR - 0.4); y = HR - rand(0.1, 0.7); fadeIn = true;
    }
    if (z < -D + 0.3) return;
    const p = particle(kindOf(), clamp(x, xL + 0.2, xR - 0.2), y, z, true);
    p.vz = -WIND.z * 0.6;
    if (fadeIn) p.fade = 0;
    parts.push(p);
  }
  function prewarm() {
    for (let i = 0; i < settledCap * 0.62; i++) {                 // already lying about the floor
      const d = rand(6.2, D - 0.25), hv = Math.min(halfView(d), xR - 0.25);
      parts.push(particle(kindOf(), rand(-hv, hv), 0, -d, false));
    }
    for (let i = 0; i < airTarget; i++) {
      const d = rand(3, D - 1), hv = Math.min(halfView(d), xR - 0.3);
      parts.push(particle(kindOf(), rand(-hv, hv), rand(0.6, HR - 0.4), -d, true));
    }
    for (const p of parts) if (!p.air) p.y = p.lift;
  }
  function loose(kind, sx, sy, vx, vy) {                          // knocked off a branch at screen point sx, sy
    const d = rand(2.3, 3.4), o = eye();
    const p = particle(kind, o.x + (sx - cx) / f * d, o.y - (sy - cy) / f * d, o.z - d, true);
    p.vx = vx; p.vy = -vy; p.vz = -WIND.z * 0.8;
    parts.push(p);
  }
  function strip(b, n, vx, vy) {
    const now = performance.now();
    if (now < b.cool) return;
    b.cool = now + 200;
    const [hx, hy] = toStage(b.br, worldPt(b.x, b.y, b.chain));
    const on = b.petals.filter(p => p.on);
    for (let i = 0; i < Math.min(n, on.length); i++) {
      const pe = on.splice((Math.random() * on.length) | 0, 1)[0];
      pe.on = false;
      pe.el.style.opacity = "0";
      loose(0, hx + rand(-6, 6), hy + rand(-6, 6), vx + rand(-0.3, 0.3), vy + rand(-0.4, 0.1));
      setTimeout(() => { pe.on = true; pe.el.style.opacity = ""; }, rand(3500, 7500));
    }
  }
  function dropLeaf(l, vx) {
    l.on = false;
    l.el.style.opacity = "0";
    const [hx, hy] = toStage(l.br, worldPt(l.x, l.y, l.chain));
    loose(1, hx, hy, vx, 0);
    setTimeout(() => { l.on = true; l.el.style.opacity = ""; }, rand(8000, 14000));
  }
  function kick(p, vx, up, vz, w) {                               // throw a leaf about (and lift it off the floor)
    p.air = true; p.dying = false; p.fade = Math.max(p.fade, 0.6);
    p.vx += vx; p.vz += vz;
    p.vy = Math.min(4.2, Math.max(p.vy, 0) + up);
    p.vs += rand(2, 6) * w * Math.sign(p.vs || 1); p.vyaw += rand(-2, 2) * w;
  }
  function step(t, dt, fp) {
    let air = 0, settled = 0;
    for (const p of parts) if (p.air) air++; else if (!p.dying) settled++;
    if (air < airTarget * (1 + WIND.g * 0.5) && Math.random() < dt * airTarget / 5 && parts.length < MAXP) spawn();
    if (settled > settledCap) {
      let old = null;
      for (const p of parts) if (!p.air && !p.dying && (!old || p.age > old.age)) old = p;
      if (old) old.dying = true;
    }
    const sp = Math.min(floorVel.speed, 12), sweep = fp && sp > 0.5, R = 0.5 + sp * 0.035;
    const stir = Pt.inside && Pt.speed > 0.4, push = cam.vz > 0.05 ? cam.vz : 0, o = eye();
    const bfx = Math.cos(bot.th), bfz = -Math.sin(bot.th), bsp = Math.abs(bot.v) + Math.abs(bot.w) * 0.4;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], leafy = p.kind === 1;
      p.age += dt;
      if (p.fade < 1 && !p.dying) p.fade = Math.min(1, p.fade + dt * 1.4);
      if (p.dying && (p.fade -= dt * 0.35) <= 0) { parts.splice(i, 1); continue; }
      const low = p.y < 1.1;
      // the pointer's sweep kicks up the leaves along its path
      if (sweep && low) {
        const dx = p.x - fp[0], dz = p.z - fp[1], d = Math.hypot(dx, dz);
        if (d < R) {
          const w = (1 - d / R) ** 1.4, n = 1 / (d + 1e-3);
          kick(p, (floorVel.x * 0.5 + dx * n * sp * 0.22) * w, (0.8 + sp * 0.3) * w * rand(0.6, 1.2), (floorVel.z * 0.5 + dz * n * sp * 0.22) * w, w);
        }
      }
      // the robot: its front brush sweeps leaves ahead of it, and it shoves aside the ones it runs into
      if (bot.obj && low && bsp > 0.05) {
        const rx = p.x - bot.x, rz = p.z - bot.z, lx = rx * bfx + rz * bfz, lz = -rx * bfz + rz * bfx;
        if (Math.abs(lx) < HL + 0.35 && Math.abs(lz) < HW + 0.3) {
          const ahead = bot.v >= 0 ? lx > HL - 0.15 : lx < -HL + 0.15;
          const sx = -bfz, sz = bfx, side = lz < 0 ? -1 : 1;
          if (ahead) kick(p, bot.vx * 1.15 + sx * side * bsp * 0.35, Math.max(0, Math.abs(bot.v) - 0.5) * rand(0.2, 0.6), bot.vz * 1.15 + sz * side * bsp * 0.35, 0.5);
          else kick(p, sx * side * (bsp * 1.2 + 0.6) + bot.vx * 0.5, bsp * rand(0.15, 0.5), sz * side * (bsp * 1.2 + 0.6) + bot.vz * 0.5, 0.6);
        }
      }
      if (p.air) {
        const d = depthOf(p.z);
        if (stir && d > 0.5) {                                    // the pointer stirs the air it passes through
          const [u, v] = proj(p.x, p.y, p.z), ux = u - Pt.x, vy = v - Pt.y, Rs = 70 + 260 / d, d2 = ux * ux + vy * vy;
          if (d2 < Rs * Rs) {
            const w = (1 - Math.sqrt(d2) / Rs) ** 2, k = d / f * 60 * w * 0.05;
            p.vx += Pt.vx * k; p.vy -= Pt.vy * k;
            p.vs += 0.25 * w * Math.sign(p.vs || 1);
          }
        }
        if (push && d < 3.2 && d > 0) {                           // the camera moving in pushes the air aside
          const w = (1 - d / 3.2) * push * dt;
          p.vx += Math.sign(p.x - o.x || 1) * w * 2.2; p.vy += w * 1.2;
        }
        // leaves swing like a pendulum; petals flutter and drift
        p.ph += p.pf * dt;
        const sw = Math.sin(p.ph) * p.sa;
        const tvx = WIND.x + Math.cos(p.dir) * sw, tvz = -WIND.z * 0.7 + Math.sin(p.dir) * sw * 0.6;
        let tvy = -p.vt * (leafy ? 0.35 + 0.9 * Math.cos(p.ph) ** 2 : 0.85 + 0.3 * Math.sin(p.spin * 0.5));
        tvy += WIND.lift * (0.6 + 0.4 * Math.sin(t * 0.003 + p.ph));
        const k = Math.min(1, dt * (leafy ? 1.5 : 2));
        p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k; p.vy += (tvy - p.vy) * Math.min(1, dt * 1.35);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.spin += p.vs * dt; p.vs *= 1 - Math.min(1, dt * 0.02);
        p.yaw += p.vyaw * dt;
        if (p.x < xL + 0.12) { p.x = xL + 0.12; p.vx = Math.abs(p.vx) * 0.3; }
        else if (p.x > xR - 0.12) { p.x = xR - 0.12; p.vx = -Math.abs(p.vx) * 0.3; }
        if (p.z < -D + 0.1) { p.z = -D + 0.1; p.vz = Math.abs(p.vz) * 0.3; }
        if (p.y > HR - 0.1) { p.y = HR - 0.1; p.vy = -Math.abs(p.vy) * 0.2; }
        if (d < 0.3 || p.z > -ZN) { parts.splice(i, 1); continue; }
        p.land = clamp(1 - p.y / 0.55, 0, 1);                      // nearing the floor it lies over flat, and settles
        if (p.y <= p.lift) { p.y = p.lift; p.air = false; p.land = 1; p.vy = 0; p.vx *= 0.35; p.vz *= 0.35; p.age = 0; }
      } else {                                                    // sliding to a stop on the floor
        const k = Math.exp(-dt * 6);
        p.vx *= k; p.vz *= k;
        p.x = clamp(p.x + p.vx * dt, xL + 0.12, xR - 0.12); p.z = clamp(p.z + p.vz * dt, -D + 0.12, -ZN);
        p.yaw += (p.vx * 0.6 - p.vz * 0.4) * dt;
      }
    }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function writeLeaves() {
    let n = 0;
    for (const p of parts) {
      // tumbling in the air: a leaf rocks like a pendulum under a slow turn, a petal spins about its own axis
      if (p.kind === 1) _qa.setFromEuler(_e.set(-Math.PI / 2 + Math.sin(p.ph) * 0.65, p.yaw, Math.cos(p.ph * 0.5) * 0.4, "YXZ"));
      else _qa.setFromAxisAngle(p.axis, p.spin);
      _qb.setFromEuler(_e.set(-Math.PI / 2 + p.curl, p.yaw, 0, "YXZ"));   // lying on the floor
      _q.slerpQuaternions(_qa, _qb, smooth(p.land));
      const sz = p.size * SPR / SPR_D;
      leafMesh.setMatrixAt(n, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(sz, sz, sz)));
      aCell.setXYZW(n, ...p.cell);
      aAlpha.setX(n, p.alpha * p.fade);
      n++;
    }
    leafMesh.count = n;
    leafMesh.instanceMatrix.needsUpdate = true; aCell.needsUpdate = true; aAlpha.needsUpdate = true;
  }

  /* ------------------------------------------------ the frame */
  function frame(t, dt) {
    const f60 = dt * 60;
    if (Pt.inside) { Pt.vx = Pt.x - Pt.px; Pt.vy = Pt.y - Pt.py; Pt.px = Pt.x; Pt.py = Pt.y; }
    else { Pt.vx *= 0.8; Pt.vy *= 0.8; }
    Pt.speed = Math.hypot(Pt.vx, Pt.vy) / f60;
    const ease = Math.min(1, 3.2 * dt);
    Pt.sx += (Pt.nx - Pt.sx) * ease; Pt.sy += (Pt.ny - Pt.sy) * ease;

    // camera: a little parallax, and the dolly into the room as the page scrolls
    const pz = DOLLY * smooth(progress()), z0 = cam.z;
    cam.z += (pz - cam.z) * Math.min(1, dt * 7);
    cam.vz = (cam.z - z0) / dt;
    camera.position.set(Pt.sx * 0.32, EYE - Pt.sy * 0.2, -cam.z);
    camera.updateMatrixWorld();
    if (cue) cue.style.setProperty("--gone", clamp(cam.z / 0.8, 0, 1).toFixed(3));

    wind(t);
    applyLight(t);
    envCheck(t);
    drawDial();
    if (motes.visible) moteStep(t, dt);

    // the branches hang in the opening: they slide with the camera and leave the frame as it moves in
    const out = clamp(cam.z / 2.6, 0, 1);
    for (const br of branches) {
      const side = br.corner === "tl" ? -1 : 1;
      br.ox = -f * camera.position.x / ZB * 0.35 + side * out * W * 0.18;
      br.oy = f * (camera.position.y - EYE) / ZB * 0.35 - out * H * 0.12;
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
    if (Pt.inside && Pt.speed > 1.5 && out < 0.5) {             // brushing a branch knocks it about and strips its blossoms
      const vx = Pt.vx / f60, vy = Pt.vy / f60;
      for (const b of blossoms) {
        const [hx, hy] = toStage(b.br, worldPt(b.x, b.y, b.chain));
        if (Math.hypot(hx - Pt.x, hy - Pt.y) < b.r * b.br.scale + 14) {
          strip(b, 1 + ((Pt.speed / 12) | 0), vx * 0.02, vy * 0.02 - 0.2);
          b.fv += (vx > 0 ? 1 : -1) * Math.min(Pt.speed * 18, 180);
        }
      }
      for (const tw of twigs) {
        const [hx, hy] = toStage(tw.br, worldPt(tw.mid[0], tw.mid[1], tw.full));
        if (Math.hypot(hx - Pt.x, hy - Pt.y) < 22 * tw.br.scale + 10) tw.v += Math.sign(tw.dx * vy - tw.dy * vx) * Math.min(Pt.speed * 3, 45) * KICK[tw.depth];
      }
    }
    if (WIND.g > 0.3) {                                           // gusts shake a few petals and leaves loose
      const pb = WIND.g * WIND.g * 0.008 * f60, pl = WIND.g ** 3 * 0.0015 * f60;
      for (const b of blossoms) if (Math.random() < pb) strip(b, 1, WIND.x * 0.5, -0.1);
      for (const l of leaves) if (l.on && Math.random() < pl) dropLeaf(l, WIND.x * 0.5);
    }

    // where the pointer points: the robot heads for the floor under it (and the pointer's sweep stirs it)
    const hit = Pt.inside ? aim(Pt.x, Pt.y) : null, fp = hit && hit[2] ? hit : null;
    if (fp && floorVel.on) {
      const k = Math.min(1, dt * 18);
      floorVel.x += ((fp[0] - floorVel.fx) / dt - floorVel.x) * k;
      floorVel.z += ((fp[1] - floorVel.fz) / dt - floorVel.z) * k;
    } else { floorVel.x *= 0.8; floorVel.z *= 0.8; }
    floorVel.on = !!fp;
    if (fp) { floorVel.fx = fp[0]; floorVel.fz = fp[1]; }
    floorVel.speed = Math.hypot(floorVel.x, floorVel.z);
    if (hit && Pt.moved) {                                         // only the pointer moves it; it stays put otherwise
      const near = -(cam.z + f * EYE / (H - cy) + 0.9);           // not so near that it drives out of view
      bot.gx = clamp(hit[0], xL + 0.9, xR - 0.9); bot.gz = clamp(Math.min(hit[1], near), -D + 0.9, -3);
      Pt.moved = false;
    }
    drive(dt);
    placeBot(dt);
    step(t, dt, fp);
    placeFloaters(t);
    writeLeaves();
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------ size and start */
  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    const wr = HR * Math.max(W / H, 0.74);
    xL = -wr / 2; xR = wr / 2;
    f = 0.42 * H * D / HR;                                          // the back wall is 42% of the screen tall
    cx = W / 2; cy = VP * H;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, fine ? 1.75 : 1.5));
    renderer.setSize(W, H, false);
    setProjection();
    camera.position.set(0, EYE, -cam.z); camera.updateMatrixWorld();
    for (const br of branches) { br.left = br.host.offsetLeft; br.top = br.host.offsetTop; br.scale = br.host.offsetWidth / br.vb.w; }
    settledCap = Math.round(fine ? clamp(W * H / 6800, 90, 200) : clamp(W * H / 7500, 50, 100));
    airTarget = Math.round(fine ? clamp(W * H / 40000, 14, 36) : clamp(W * H / 48000, 8, 18));
    heroTop = hero.offsetTop; span = hero.offsetHeight - stage.offsetHeight;
    placeRoom();
  }
  let running = false;
  // the reflections follow the light, a few times a second at most while the dial turns
  function envCheck(t) {
    const u = clamp(dial.u, 0, 2);
    if (Math.abs(u - dial.envU) > 0.02 && t - dial.envAt > 240) { setEnv(cur); dial.envU = u; dial.envAt = t; }
  }
  const still = () => { applyLight(0); envCheck(performance.now()); drawDial(); placeFloaters(0); placeBot(0); writeLeaves(); renderer.render(scene, camera); };
  measure();
  prewarm();
  setMood(MOODS[saved] ? saved : "white", true);
  let fontsReady = false;
  Promise.all([document.fonts.load(`900 100px "Unbounded"`), document.fonts.load(`500 20px "Inter Tight"`)]).catch(() => {}).then(() => {
    fontsReady = true; buildFloaters(); if (!running) still();
  });
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { measure(); if (fontsReady) buildFloaters(); if (!running) still(); }, 150); });
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);
  if (/[?&]roomdebug/.test(location.search)) window.__room = { bot, parts, L, dial, settle, setMood, lamp };

  if (reduce) {                                                   // a still room: everything where it stands
    LEAF_U.uFade.value = 1;
    stage.classList.add("is-live");
    still();
    return;
  }

  // hidden until the landing is revealed, then the branches draw themselves in
  const strokes = $$(".br-stroke", stage), branchLeaves = $$(".br-leaf", stage);
  strokes.forEach(p => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
  branchLeaves.forEach(l => (l.style.opacity = "0"));
  still();
  let started = false;
  function intro() {
    if (started) return;
    started = true;
    stage.classList.add("is-live");
    const Ls = floaters.filter(F => F.letter), Q = floaters.filter(F => !F.letter);
    if (window.gsap) {
      gsap.to(strokes, { strokeDashoffset: 0, duration: 1.8, ease: "power2.out", stagger: 0.008, delay: 0.3 });
      gsap.to(blossoms, { pop: 1, duration: 1, ease: "back.out(2)", stagger: 0.012, delay: 1 });
      gsap.to(branchLeaves, { opacity: 1, duration: 0.8, stagger: 0.01, delay: 1.2, clearProps: "opacity" });
      gsap.to(LEAF_U.uFade, { value: 1, duration: 1.4, ease: "power1.out", delay: 0.4 });
      // the letters come forward out of the back wall one after another, then the quote
      gsap.fromTo(Ls, { intro: 1, op: 0, blur: 4 }, { intro: 0, op: 1, blur: 0, duration: 1.7, ease: "expo.out", stagger: 0.07, delay: 0.25 });
      gsap.fromTo(Q, { intro: 0.35, op: 0, blur: 3 }, { intro: 0, op: 1, blur: 0, duration: 1.4, ease: "expo.out", delay: 1.1 });
      if (cueIn) gsap.fromTo(cueIn, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: "expo.out", delay: 1.7 });
      gsap.fromTo(dial, { spin: -220 }, { spin: 0, duration: 2, ease: "power4.out", delay: 1.25 });   // the dial rolls in
    } else {
      strokes.forEach(p => (p.style.strokeDashoffset = 0));
      blossoms.forEach(b => (b.pop = 1));
      branchLeaves.forEach(l => (l.style.opacity = ""));
      floaters.forEach(F => { F.intro = 0; F.op = 1; F.blur = 0; });
      LEAF_U.uFade.value = 1;
    }
    running = true;
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
  // main.js raises jt:intro when the loader lifts; this module may only arrive after that
  if (document.documentElement.dataset.intro) intro();
  else document.addEventListener("jt:intro", intro, { once: true });
  setTimeout(intro, 4500);
}
