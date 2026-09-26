/*
 * The landing's production house: the room fitted out as Janyu Tech's workshop, people at work in it.
 *  – the arm cell: the robot arm lifts boxes off the infeed conveyor and sets them on the outfeed, an
 *    operator watching it on a tablet
 *  – the repair bay: a rover up on a stand with a wheel off, a technician kneeling at it with a wrench
 *  – the electronics bench under a pegboard of tools, an engineer soldering a board
 *  – the design office: two desks of monitors, two people at work, the project board on the wall
 *  – the store: racking with bins and boxes, and a runner carrying parts across the floor
 *  – the test zone in the middle, where the pilot drives the robot the visitor points at
 * The people are built here, not loaded: jointed figures, each one skinned mesh coloured per vertex,
 * posed by hand and by two-bone IK so their hands land on the keyboard, the tablet, the robot.
 * Everything is made in metres; the room works in half metres, hence the scale of 2 on the group.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = x => x * x * (3 - 2 * x);
const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const colors = new Map();
const C = hex => { if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex)); return colors.get(hex); };
const place = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

/* ------------------------------------------------ building blocks */
// static things: primitives coloured per vertex and merged, so a whole station is a mesh or two
class Kit {
  constructor() { this.geos = []; }
  put(geo, color, m) {
    geo.deleteAttribute("uv");
    if (m) geo.applyMatrix4(m);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3), k = C(color);
    for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    this.geos.push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  // a box between two corners, turned ry about its own middle
  slab(x0, y0, z0, x1, y1, z1, color, ry = 0) {
    return this.put(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), color, place((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, ry));
  }
  cyl(r0, r1, h, color, x, y, z, rx = 0, rz = 0, seg = 16) { return this.put(new THREE.CylinderGeometry(r0, r1, h, seg), color, place(x, y, z, rx, 0, rz)); }
  ball(r, color, x, y, z, sx = 1, sy = 1, sz = 1) { return this.put(new THREE.SphereGeometry(r, 16, 12), color, place(x, y, z, 0, 0, 0, sx, sy, sz)); }
  mesh(material, shadows = true) {
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.castShadow = m.receiveShadow = shadows;
    this.geos = [];
    return m;
  }
}
const canvasTex = (w, h, draw) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
};

/* ------------------------------------------------ people */
// bones: name, parent, rest offset from the parent (metres). The figure stands on y = 0 facing +z;
// L is the figure's own left (+x)
const BONES = [
  ["hips", -1, 0, 0.95, 0], ["spine", 0, 0, 0.12, 0], ["chest", 1, 0, 0.2, 0], ["neck", 2, 0, 0.19, 0], ["head", 3, 0, 0.08, 0],
  ["armL", 2, 0.18, 0.16, 0], ["foreL", 5, 0, -0.29, 0], ["handL", 6, 0, -0.255, 0],
  ["armR", 2, -0.18, 0.16, 0], ["foreR", 8, 0, -0.29, 0], ["handR", 9, 0, -0.255, 0],
  ["legL", 0, 0.095, -0.04, 0], ["shinL", 11, 0, -0.43, 0], ["footL", 12, 0, -0.405, 0],
  ["legR", 0, -0.095, -0.04, 0], ["shinR", 14, 0, -0.43, 0], ["footR", 15, 0, -0.405, 0],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const TORSO = [[0.001, 0.845], [0.11, 0.85], [0.155, 0.875], [0.168, 0.92], [0.165, 0.97], [0.152, 1.03], [0.146, 1.09], [0.152, 1.15], [0.166, 1.23], [0.178, 1.31], [0.184, 1.37], [0.176, 1.42], [0.14, 1.46], [0.075, 1.485], [0.001, 1.49]];
const band = (y, a, b) => smooth(clamp((y - a) / (b - a), 0, 1));
// the torso bends at the waist and below the chest: its vertices are shared between the bones there
const torsoBones = p => {
  const up = band(p.y, 1.0, 1.08), chest = band(p.y, 1.16, 1.26);
  if (chest > 0) return [[BI.chest, chest], [BI.spine, 1 - chest]];
  return [[BI.spine, up], [BI.hips, 1 - up]];
};
// one figure's body, in the rest pose
function bodyGeometry(look) {
  const pos = [], nor = [], col = [], si = [], sw = [], idx = [], v = V();
  const add = (geo, m, bone, paint) => {
    geo.applyMatrix4(m);
    const p = geo.attributes.position, n = geo.attributes.normal, base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      pos.push(v.x, v.y, v.z); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = C(typeof paint === "function" ? paint(v) : paint); col.push(c.r, c.g, c.b);
      const b = typeof bone === "function" ? bone(v) : [[bone, 1]];
      si.push(b[0][0], b[1] ? b[1][0] : 0, 0, 0); sw.push(b[0][1], b[1] ? b[1][1] : 0, 0, 0);
    }
    for (const i of geo.index.array) idx.push(base + i);
    geo.dispose();
  };
  const sleeve = look.sleeves === "short" ? y => (y > 1.25 ? look.shirt : look.skin) : () => look.shirt;
  const torso = new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  add(torso, place(0, 0, 0, 0, 0, 0, 1, 1, 0.64), torsoBones, p => (p.y < 0.955 ? look.trousers : p.y < 0.985 ? "#1c1f24" : look.shirt));
  if (look.vest) {                                               // a hi-vis vest over the shirt, two reflective bands round it
    const shell = new THREE.LatheGeometry(TORSO.slice(5, 12).map(([r, y]) => new THREE.Vector2(r + 0.013, y)), 28);
    add(shell, place(0, 0, 0, 0, 0, 0, 1, 1, 0.66), torsoBones, p => ((p.y > 1.1 && p.y < 1.135) || (p.y > 1.195 && p.y < 1.23) ? "#dfe4ea" : look.vest));
  }
  if (look.coat) {                                               // a lab coat, down to the knee
    const coat = new THREE.LatheGeometry([[0.2, 0.56], [0.19, 0.75], [0.176, 0.92], [0.168, 1.0], [0.163, 1.09], [0.168, 1.16], [0.18, 1.25], [0.192, 1.33], [0.197, 1.38], [0.188, 1.43]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    add(coat, place(0, 0, 0, 0, 0, 0, 1, 1, 0.68), p => (p.y < 0.93 ? [[BI.hips, 1]] : torsoBones(p)), look.coat);
  }
  add(new THREE.CylinderGeometry(0.043, 0.048, 0.13, 14), place(0, 1.5, 0), BI.neck, look.skin);
  const hairline = p => p.y - 1.625 > -0.012 + 0.667 * (p.z - 0.006);   // (the front of the head is +z)
  add(new THREE.SphereGeometry(1, 26, 18), place(0, 1.625, 0.006, 0, 0, 0, 0.083, 0.108, 0.097), BI.head, p => (hairline(p) ? look.hair : look.skin));
  add(new THREE.SphereGeometry(1, 10, 8), place(0, 1.603, 0.099, 0, 0, 0, 0.013, 0.02, 0.018), BI.head, look.skin);
  for (const s of [1, -1]) add(new THREE.SphereGeometry(1, 10, 8), place(0.082 * s, 1.616, -0.004, 0, 0, 0, 0.012, 0.026, 0.018), BI.head, look.skin);
  if (look.hat) {                                                // a hard hat: dome and brim
    add(new THREE.SphereGeometry(0.106, 22, 10, 0, TAU, 0, Math.PI / 2), place(0, 1.656, 0.004, 0, 0, 0, 1, 0.82, 1.1), BI.head, look.hat);
    add(new THREE.CylinderGeometry(0.126, 0.128, 0.012, 26), place(0, 1.657, 0.014, 0, 0, 0, 1, 1, 1.14), BI.head, look.hat);
  }
  if (look.headset) {
    add(new THREE.TorusGeometry(0.093, 0.009, 6, 18, Math.PI), place(0, 1.625, -0.005), BI.head, "#2b2f36");
    for (const s of [1, -1]) add(new THREE.CylinderGeometry(0.032, 0.032, 0.024, 14), place(0.09 * s, 1.616, -0.004, 0, 0, Math.PI / 2), BI.head, "#2b2f36");
  }
  add(new THREE.BoxGeometry(0.05, 0.068, 0.006), place(0.072, 1.3, 0.118), BI.chest, "#f4f6f8");   // ID badge
  for (const [s, side] of [[1, "L"], [-1, "R"]]) {
    add(new THREE.SphereGeometry(0.052, 14, 10), place(0.175 * s, 1.425, 0), BI["arm" + side], look.shirt);
    add(new THREE.CapsuleGeometry(0.046, 0.2, 6, 12), place(0.18 * s, 1.29, 0), BI["arm" + side], p => sleeve(p.y));
    add(new THREE.CapsuleGeometry(0.038, 0.17, 6, 12), place(0.18 * s, 1.02, 0), BI["fore" + side], look.sleeves === "short" ? look.skin : look.shirt);
    add(new THREE.SphereGeometry(1, 12, 10), place(0.18 * s, 0.835, 0.006, 0, 0, 0, 0.028, 0.072, 0.045), BI["hand" + side], look.skin);
    add(new THREE.CylinderGeometry(0.074, 0.056, 0.43, 14), place(0.095 * s, 0.695, 0), BI["leg" + side], look.trousers);
    add(new THREE.SphereGeometry(0.057, 12, 10), place(0.095 * s, 0.48, 0), BI["shin" + side], look.trousers);
    add(new THREE.CylinderGeometry(0.054, 0.04, 0.4, 14), place(0.095 * s, 0.28, 0), BI["shin" + side], look.trousers);
    add(new THREE.CapsuleGeometry(0.043, 0.16, 6, 12), place(0.095 * s, 0.045, 0.055, Math.PI / 2, 0, 0, 1.1, 1, 0.85), BI["foot" + side], look.shoes);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return g;
}
const PEOPLE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02 });
function makePerson(look) {
  const bones = BONES.map(([name]) => Object.assign(new THREE.Bone(), { name }));
  BONES.forEach(([, parent, x, y, z], i) => { bones[i].position.set(x, y, z); if (parent >= 0) bones[parent].add(bones[i]); });
  const mesh = new THREE.SkinnedMesh(bodyGeometry(look), PEOPLE_MAT);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  const b = Object.fromEntries(bones.map(x => [x.name, x]));
  return { root, mesh, b, ph: Math.random() * TAU, look: { yaw: 0, pitch: 0 } };
}

// posing. Rest: standing straight, arms down, facing +z. x turns lean or raise forward (a positive x
// tips the spine and the head forward, a negative x swings an arm or a thigh forward, a positive x
// bends a knee back); y turns to the figure's left
function stand(P, t, calm = 1) {
  const b = P.b, s = Math.sin(t * 0.37 + P.ph), br = Math.sin(t * 1.6 + P.ph);
  b.hips.position.set(0.012 * s * calm, 0.95, 0);
  b.hips.rotation.set(0, 0, 0.018 * s * calm);
  b.spine.rotation.set(0.01 * br, 0, -0.012 * s * calm);
  b.chest.rotation.set(0.012 * br, 0, -0.008 * s * calm);
  for (const side of ["L", "R"]) {
    const k = side === "L" ? 1 : -1;
    b["leg" + side].rotation.set(0, 0, -0.018 * s * calm);          // the legs undo the hips' sway, so the feet stay flat
    b["shin" + side].rotation.set(0, 0, 0);
    b["foot" + side].rotation.set(0, 0, 0);
    b["arm" + side].rotation.set(-0.04, 0, 0.07 * k);
    b["fore" + side].rotation.set(-0.16, 0, 0);
    b["hand" + side].rotation.set(0, 0, 0);
  }
}
// the head (and a little of the neck) turned to a point in the world, eased
const _a = V(), _b = V(), _c = V(), _dir = V(), _q = new THREE.Quaternion();
const DOWN = V(0, -1, 0);
function look(P, target, dt, lag = 5) {
  const b = P.b;
  b.chest.updateWorldMatrix(true, false);
  b.neck.getWorldPosition(_a);
  _dir.copy(target).sub(_a).applyQuaternion(b.chest.getWorldQuaternion(_q).invert());
  const yaw = clamp(Math.atan2(_dir.x, _dir.z), -1.2, 1.2), pitch = clamp(Math.atan2(-_dir.y, Math.hypot(_dir.x, _dir.z)), -0.5, 0.9);
  const k = dt ? 1 - Math.exp(-dt * lag) : 1;
  P.look.yaw += (yaw - P.look.yaw) * k; P.look.pitch += (pitch - P.look.pitch) * k;
  b.neck.rotation.set(P.look.pitch * 0.35, P.look.yaw * 0.4, 0);
  b.head.rotation.set(P.look.pitch * 0.65, P.look.yaw * 0.6, 0);
}
// point a bone (whose rest axis runs down -y) from one world point towards another
function aim(bone, from, to) {
  _dir.copy(to).sub(from).normalize().applyQuaternion(bone.parent.getWorldQuaternion(_q).invert());
  bone.quaternion.setFromUnitVectors(DOWN, _dir);
  bone.updateMatrixWorld(true);
}
// two-bone IK for an arm: the wrist to a point in the world, the elbow bent towards the pole
const UPPER = 0.29, LOWER = 0.255;
function reach(P, side, target, pole) {
  const arm = P.b["arm" + side], fore = P.b["fore" + side];
  arm.parent.updateWorldMatrix(true, false);
  arm.getWorldPosition(_a);
  const t = _b.copy(target).sub(_a), d = clamp(t.length(), 0.1, UPPER + LOWER - 0.002);
  t.normalize();
  const A = Math.acos(clamp((UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d), -1, 1));
  const pl = _c.copy(pole).sub(_a); pl.addScaledVector(t, -pl.dot(t)).normalize();
  const elbow = V().copy(_a).addScaledVector(t, UPPER * Math.cos(A)).addScaledVector(pl, UPPER * Math.sin(A));
  aim(arm, _a, elbow);
  aim(fore, elbow, V().copy(_a).addScaledVector(t, d));
}
// a point in a figure's own frame (metres, facing +z), in the world
const at = (P, x, y, z) => P.root.localToWorld(V(x, y, z));

/* ------------------------------------------------ the workshop */
export function workshop({ scene, loader, reduce, bot, merge, onLoad }) {
  const root = new THREE.Group();
  root.scale.setScalar(2);                                       // metres to the room's half metres
  scene.add(root);
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.04 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.7 });
  const url = f => new URL(`./assets/models/${f}`, import.meta.url).href;

  // the screens: one texture, a picture in each cell, lit from within
  const SCREENS = 8;
  const screenTex = canvasTex(1024, 512, (g, w) => {
    const cell = (i, bg, draw) => { g.save(); g.translate((i % 4) * 256, ((i / 4) | 0) * 256); g.fillStyle = bg; g.fillRect(0, 0, 256, 256); draw(); g.restore(); };
    const lines = (color, x, y, n, dy, wmax) => { g.fillStyle = color; for (let k = 0; k < n; k++) g.fillRect(x + (k % 3) * 8, y + k * dy, 30 + ((k * 53) % wmax), 5); };
    cell(0, "#0b1628", () => {                                   // CAD: a robot in wireframe on a grid
      g.strokeStyle = "rgba(90,140,230,.25)"; g.lineWidth = 1;
      for (let k = 0; k < 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
      g.strokeStyle = "#6fa8ff"; g.lineWidth = 2;
      g.strokeRect(70, 110, 116, 60); g.strokeRect(92, 88, 72, 26);
      for (const x of [86, 170]) { g.beginPath(); g.arc(x, 178, 20, 0, TAU); g.stroke(); }
      g.beginPath(); g.moveTo(128, 88); g.lineTo(150, 50); g.lineTo(190, 60); g.stroke();
      g.fillStyle = "#ff9f43"; g.fillRect(12, 12, 60, 8);
    });
    cell(1, "#10141c", () => { lines("#7aa2ff", 14, 18, 9, 16, 120); lines("#9be0a7", 40, 34, 7, 30, 90); lines("#e7c07a", 26, 60, 5, 40, 70); });
    cell(2, "#0d1522", () => {                                   // a dashboard: a trace and some bars
      g.strokeStyle = "#4fd1ff"; g.lineWidth = 3; g.beginPath();
      for (let x = 0; x <= 236; x += 4) g.lineTo(10 + x, 120 - 40 * Math.sin(x * 0.05) - 20 * Math.sin(x * 0.13));
      g.stroke();
      g.fillStyle = "#3b82f6"; for (let k = 0; k < 8; k++) g.fillRect(16 + k * 29, 236 - (30 + ((k * 37) % 70)), 18, 30 + ((k * 37) % 70));
    });
    cell(3, "#06110a", () => {                                   // the oscilloscope
      g.strokeStyle = "rgba(80,200,120,.3)"; for (let k = 0; k <= 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
      g.strokeStyle = "#57f287"; g.lineWidth = 3; g.beginPath();
      for (let x = 0; x <= 256; x += 3) g.lineTo(x, 128 + 60 * Math.sign(Math.sin(x * 0.06)) * (0.7 + 0.3 * Math.sin(x * 0.4)));
      g.stroke();
    });
    cell(4, "#1d5a3a", () => {                                   // a circuit board layout
      g.strokeStyle = "#d4af37"; g.lineWidth = 3;
      for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(10 + k * 17, 20); g.lineTo(10 + k * 17, 120 + (k % 4) * 20); g.lineTo(240 - k * 9, 236); g.stroke(); }
      g.fillStyle = "#101010"; g.fillRect(90, 90, 70, 70); g.fillRect(30, 170, 40, 26);
    });
    cell(5, "#f4f6f9", () => {                                   // a plan, light
      g.fillStyle = "#1d6ae5"; g.fillRect(14, 14, 110, 12);
      g.fillStyle = "#c9d5e8"; for (let k = 0; k < 6; k++) g.fillRect(14, 44 + k * 32, 60 + ((k * 41) % 150), 16);
      g.fillStyle = "#ff8a3d"; g.fillRect(160, 44, 70, 16);
    });
    cell(6, "#0f1723", () => {                                   // a camera feed with a target on it
      g.fillStyle = "#1f2b3b"; g.fillRect(60, 120, 140, 90);
      g.strokeStyle = "#ff5a5a"; g.lineWidth = 3; g.strokeRect(92, 96, 76, 76);
      g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 200); g.moveTo(58, 134); g.lineTo(198, 134); g.stroke();
      g.fillStyle = "#e84545"; g.beginPath(); g.arc(22, 22, 8, 0, TAU); g.fill();
    });
    cell(7, "#0a0d12", () => lines("#57f287", 12, 14, 13, 18, 150));
  });
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshStandardMaterial({ color: "#05070a", emissive: "#ffffff", emissiveMap: screenTex, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 });
  const screens = [];
  // a screen facing +z in some frame, showing cell i
  const screen = (frame, i, w, h, x, y, z, ry = 0, rx = 0) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, u0 = (i % 4) / 4, v0 = 1 - (((i / 4) | 0) + 1) / 2;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 2);
    g.applyMatrix4(place(x, y, z, rx, ry));
    screens.push({ frame, g });
  };
  // printed things: the pegboard, the project board, the painted names, the tape on the floor
  const labelTex = canvasTex(1024, 512, (g) => {
    g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, 1024, 512);
    const rows = [["ARM CELL", "PRJ 021 · pick & place"], ["REPAIR BAY", "service · overhaul"], ["ELECTRONICS LAB", "control boards"], ["DESIGN OFFICE", "mechanical · software"], ["STORE", "parts · spares"], ["TEST ZONE", ""]];
    rows.forEach(([a, b], i) => {
      const y = i * 85;
      g.fillStyle = "#1d6ae5"; g.font = '900 40px "Unbounded", sans-serif'; g.textBaseline = "top"; g.fillText(a, 8, y + 6);
      g.fillStyle = "#3b4352"; g.font = '600 24px "Inter Tight", sans-serif'; g.fillText(b.toUpperCase(), 10, y + 54);
    });
  });
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const label = (i, w) => {                                      // one row of the label sheet, w metres wide
    const g = new THREE.PlaneGeometry(w, w * 85 / 1024), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), 1 - (i * 85 + (1 - uv.getY(k)) * 85) / 512);
    const m = new THREE.Mesh(g, labelMat); m.receiveShadow = true;
    return m;
  };
  const pegTex = canvasTex(1024, 448, (g, w, h) => {
    g.fillStyle = "#dfe5ec"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b4bfcc"; for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 32) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
    g.lineCap = "round";
    const wrench = (x, y, len, s) => { g.strokeStyle = "#8a96a6"; g.lineWidth = 10 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len); g.stroke(); g.lineWidth = 6 * s; g.beginPath(); g.arc(x, y - 6, 12 * s, 0.6, Math.PI - 0.6, true); g.stroke(); };
    for (let k = 0; k < 7; k++) wrench(60 + k * 34, 60, 120 + k * 12, 0.7 + k * 0.06);
    const driver = (x, y, c) => { g.fillStyle = c; g.fillRect(x - 10, y, 20, 70); g.fillStyle = "#9aa6b5"; g.fillRect(x - 3, y + 70, 6, 90); };
    ["#1d6ae5", "#e8872c", "#1d6ae5", "#e84545", "#2b2f36", "#e8872c"].forEach((c, k) => driver(360 + k * 40, 50, c));
    g.fillStyle = "#e84545"; g.fillRect(640, 60, 26, 110); g.fillStyle = "#6b7482"; g.fillRect(610, 50, 86, 26);     // a hammer
    g.strokeStyle = "#2b2f36"; g.lineWidth = 12; g.beginPath(); g.moveTo(760, 60); g.lineTo(800, 190); g.moveTo(820, 60); g.lineTo(780, 190); g.stroke();   // pliers
    g.fillStyle = "#f2c230"; g.beginPath(); g.arc(920, 110, 44, 0, TAU); g.fill(); g.fillStyle = "#2b2f36"; g.beginPath(); g.arc(920, 110, 16, 0, TAU); g.fill();   // tape
    g.fillStyle = "#c7cfda"; for (let k = 0; k < 6; k++) g.fillRect(60 + k * 150, 300, 110, 90);                   // small parts bins
    g.fillStyle = "#1d6ae5"; for (let k = 0; k < 6; k++) g.fillRect(60 + k * 150, 300, 110, 16);
  });
  const boardTex = canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = "#fbfcfd"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#0b0b0c"; g.font = '900 34px "Unbounded", sans-serif'; g.textBaseline = "top"; g.fillText("PROJECT BOARD", 36, 28);
    g.fillStyle = "#5b6475"; g.font = '600 22px "Inter Tight", sans-serif'; g.fillText("SPRINT 14", 38, 76);
    const cols = ["DESIGN", "BUILD", "TEST", "SHIP"], notes = [["Solar panel cleaner", "Magnetic crawler NDT"], ["Varaha quadruped", "Sludge cleaner v3", "Arm cell PLC"], ["Defence rover", "Throwbot UGV"], ["Dozer A", "Miner A"]];
    const hues = ["#ffe58a", "#bcd7ff", "#ffc9a6", "#c8f0cf"];
    cols.forEach((c, i) => {
      const x = 36 + i * 248;
      g.fillStyle = "#1d6ae5"; g.font = '700 22px "Inter Tight", sans-serif'; g.fillText(c, x, 128);
      g.fillStyle = "#d9dfe8"; g.fillRect(x, 160, 226, 3);
      notes[i].forEach((n, k) => {
        const y = 180 + k * 138, nx = x + (k % 2) * 8;
        g.fillStyle = hues[(i + k) % 4]; g.fillRect(nx, y, 200, 116);
        g.fillStyle = "#2b2f36"; g.font = '600 22px "Inter Tight", sans-serif';
        let line = "", row = 0;
        for (const word of n.split(" ")) {
          const tryLine = line ? line + " " + word : word;
          if (line && g.measureText(tryLine).width > 172) { g.fillText(line, nx + 14, y + 16 + row++ * 28); line = word; } else line = tryLine;
        }
        g.fillText(line, nx + 14, y + 16 + row * 28);
      });
    });
  });
  const stripeTex = (a, b) => canvasTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 0); g.lineTo(0, 32); g.fill(); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 64); g.fill(); });
  const hazard = stripeTex("#f2c230", "#1b1d22");
  hazard.wrapS = hazard.wrapT = THREE.RepeatWrapping;
  const tapeMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  const tape = (frame, x0, z0, x1, z1, w = 0.06) => {             // a strip of floor tape from one point to another
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len, w);
    g.attributes.uv.array.forEach((_, k, a) => { if (k % 2 === 0) a[k] *= len / 0.12; });
    const m = new THREE.Mesh(g, tapeMat);
    m.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0)); m.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = false;
    frame.add(m);
  };
  const beltTex = canvasTex(64, 64, (g) => { g.fillStyle = "#26292f"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#3a3e46"; for (let k = 0; k < 64; k += 16) g.fillRect(k, 0, 5, 64); });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;

  const stations = {};
  const station = name => { const g = new THREE.Group(); g.name = name; root.add(g); stations[name] = g; return g; };
  const people = [];
  const person = (frame, look, job) => { const P = makePerson(look); frame.add(P.root); P.job = job; people.push(P); return P; };
  const blob = (frame, x, z, r, o = 0.35) => {                    // a soft shadow at someone's feet
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), shadowMat.clone());
    m.material.opacity = o; m.position.set(x, 0.004, z); m.renderOrder = 1; frame.add(m);
    return m;
  };
  const shadowMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(10,16,30,.8)"); gr.addColorStop(1, "rgba(10,16,30,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false, toneMapped: false });
  // looks: Janyu navy on the floor, hi-vis in the cell and the bay, shirts in the office
  const SKIN = ["#b98060", "#9a6446", "#c9906a", "#8b5a3e", "#d2a07c", "#a8714f", "#c28a66"];
  const HAIR = ["#1b1511", "#2a1d15", "#15110e", "#3a2a1e"];
  const crew = (i, extra) => Object.assign({ skin: SKIN[i % SKIN.length], hair: HAIR[i % HAIR.length], shirt: "#1f3b66", trousers: "#2f343d", shoes: "#16181c" }, extra);

  /* ---- the electronics lab: a bench under a pegboard, an engineer soldering */
  const lab = station("lab");
  {
    const k = new THREE.Group(); lab.add(k);
    const s = new Kit(), m = new Kit();
    s.slab(-1.0, 0.88, -0.36, 1.0, 0.925, 0.36, "#e9edf2");                 // the top
    s.slab(-1.0, 0.86, 0.33, 1.0, 0.925, 0.37, "#2b2f36");                  // its edge
    s.slab(-0.97, 0.12, -0.33, 0.97, 0.15, 0.3, "#c9d0da");                 // the shelf under it
    s.slab(-1.0, 0.925, -0.36, 1.0, 1.55, -0.33, "#d7dde5");                // the riser at the back
    s.slab(-1.0, 1.22, -0.36, 1.0, 1.25, -0.12, "#c9d0da");                 // and its shelf
    for (const x of [-0.97, 0.97]) for (const z of [-0.33, 0.33]) m.slab(x - 0.025, 0, z - 0.025, x + 0.025, 0.88, z + 0.025, "#8a93a0");
    // on the bench: two monitors, a keyboard, a board being soldered, the soldering station, a lamp, bins
    for (const [x, i] of [[-0.62, 0], [-0.02, 4]]) {
      s.slab(x - 0.29, 1.02, -0.2, x + 0.29, 1.36, -0.17, "#15181d"); s.slab(x - 0.03, 0.925, -0.2, x + 0.03, 1.03, -0.18, "#2b2f36"); s.slab(x - 0.12, 0.925, -0.24, x + 0.12, 0.935, -0.14, "#2b2f36");
      screen(lab, i, 0.54, 0.3, x, 1.19, -0.165);
    }
    s.slab(-0.55, 0.925, 0.02, -0.12, 0.945, 0.17, "#2b2f36");
    s.slab(0.33, 0.925, -0.02, 0.5, 0.936, 0.1, "#1d6a3a");                  // the board
    s.slab(0.62, 0.925, -0.2, 0.86, 1.02, -0.02, "#3a3f47"); s.slab(0.66, 1.02, -0.12, 0.82, 1.023, -0.04, "#e84545");
    s.slab(0.4, 1.25, -0.34, 0.74, 1.47, -0.14, "#2b2f36"); screen(lab, 3, 0.2, 0.14, 0.53, 1.36, -0.139);   // the oscilloscope on the shelf
    s.slab(-0.9, 1.25, -0.34, -0.72, 1.36, -0.16, "#1d6ae5"); s.slab(-0.68, 1.25, -0.34, -0.5, 1.36, -0.16, "#e8872c"); s.slab(-0.46, 1.25, -0.34, -0.28, 1.36, -0.16, "#1d6ae5");
    m.cyl(0.012, 0.012, 0.42, "#9aa6b5", 0.2, 1.1, -0.25, 0, -0.5); m.cyl(0.07, 0.08, 0.03, "#9aa6b5", 0.3, 1.28, -0.12, 0.5);   // the magnifier lamp
    k.add(s.mesh(solid), m.mesh(metal));
    const peg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.83), new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.85 }));
    peg.position.set(0, 1.98, -0.365); peg.receiveShadow = true; k.add(peg);
    const P = person(lab, crew(0, { coat: "#f2f4f7", shirt: "#dfe6f0" }), "solder");
    P.root.position.set(0.42, 0, 0.5); P.root.rotation.y = Math.PI;
    const iron = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.2, 8), new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.5 }));
    iron.position.set(0, -0.08, 0.03); iron.rotation.x = 1.1; P.b.handR.add(iron);
    blob(lab, 0.42, 0.5, 0.36);
  }

  /* ---- the design office: a desk against the wall, the project board beside it */
  const office = station("office");
  {
    const s = new Kit(), m = new Kit();
    s.slab(-0.7, 0.72, -0.4, 0.7, 0.75, 0.32, "#f1f3f6");                     // the desk
    for (const x of [-0.68, 0.68]) s.slab(x - 0.02, 0, -0.38, x + 0.02, 0.72, 0.3, "#c9d0da");
    s.slab(-0.66, 0.3, -0.36, 0.66, 0.7, -0.34, "#d7dde5");
    for (const [x, i] of [[-0.3, 1], [0.3, 2]]) {                           // two monitors: code, and the build's numbers
      s.slab(x - 0.28, 0.86, -0.28, x + 0.28, 1.19, -0.25, "#15181d"); s.slab(x - 0.025, 0.75, -0.3, x + 0.025, 0.87, -0.27, "#2b2f36"); s.slab(x - 0.1, 0.75, -0.33, x + 0.1, 0.76, -0.22, "#2b2f36");
      screen(office, i, 0.52, 0.29, x, 1.025, -0.247);
    }
    s.slab(-0.22, 0.75, 0.02, 0.22, 0.765, 0.17, "#2b2f36"); s.slab(0.3, 0.75, 0.05, 0.36, 0.77, 0.14, "#2b2f36");   // keyboard, mouse
    const cz = 0.62;                                                        // the chair
    s.slab(-0.23, 0.44, cz - 0.23, 0.23, 0.5, cz + 0.23, "#1f2530"); s.slab(-0.21, 0.52, cz + 0.2, 0.21, 1.02, cz + 0.26, "#1f2530");
    m.cyl(0.025, 0.025, 0.36, "#9aa6b5", 0, 0.26, cz);
    for (let k = 0; k < 5; k++) { const a2 = k * TAU / 5; m.put(new THREE.BoxGeometry(0.3, 0.025, 0.035), "#2b2f36", place(Math.cos(a2) * 0.15, 0.06, cz + Math.sin(a2) * 0.15, 0, -a2)); }
    s.cyl(0.08, 0.07, 0.2, "#e9edf2", 0.58, 0.85, -0.25); for (let k = 0; k < 7; k++) s.ball(0.07, "#3f8a54", 0.58 + Math.cos(k) * 0.07, 1.02 + (k % 3) * 0.06, -0.25 + Math.sin(k * 1.7) * 0.07, 1, 1.4, 1);   // a plant
    s.cyl(0.035, 0.03, 0.09, "#1d6ae5", -0.5, 0.8, 0.1);             // a mug
    office.add(s.mesh(solid), m.mesh(metal));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6 }));
    board.position.set(-1.62, 1.72, -0.395); board.receiveShadow = true; office.add(board);
    const frame = new Kit(); frame.slab(-2.4, 1.22, -0.41, -0.84, 1.25, -0.37, "#9aa6b5"); frame.slab(-2.4, 2.19, -0.41, -0.84, 2.22, -0.39, "#9aa6b5"); office.add(frame.mesh(metal));
    const A = person(office, crew(3, { shirt: "#c9dcf5", trousers: "#262a33" }), "type");
    A.root.position.set(0, 0, 0.62); A.root.rotation.y = Math.PI;
  }

  /* ---- the store: racking with bins and boxes */
  const store = station("store");
  {
    const s = new Kit(), m = new Kit();
    for (const x of [-0.85, 0.85]) for (const z of [-0.22, 0.22]) m.slab(x - 0.03, 0, z - 0.03, x + 0.03, 2.2, z + 0.03, "#1d6ae5");
    for (const y of [0.12, 0.72, 1.32, 1.92]) { s.slab(-0.85, y, -0.24, 0.85, y + 0.06, 0.24, "#e8872c"); s.slab(-0.84, y + 0.06, -0.22, 0.84, y + 0.075, 0.22, "#9aa6b5"); }
    const bins = ["#1d6ae5", "#e84545", "#f2c230", "#1d6ae5", "#3a3f47"];
    [0.195, 0.795, 1.395].forEach((y, r) => { for (let k = 0; k < 5; k++) { const x = -0.7 + k * 0.35; if ((k + r) % 3 === 0) s.slab(x - 0.14, y, -0.18, x + 0.14, y + 0.26, 0.18, "#c49a6c"); else s.slab(x - 0.13, y, -0.2, x + 0.13, y + 0.18, 0.2, bins[(k + r) % 5]); } });
    for (let k = 0; k < 3; k++) s.slab(-0.6 + k * 0.45, 1.995, -0.18, -0.25 + k * 0.45, 2.3, 0.18, "#c49a6c");
    store.add(s.mesh(solid), m.mesh(metal));
  }

  /* ---- the repair bay: a rover on a stand with a wheel off, a technician at it */
  const bay = station("bay");
  const bayP = person(bay, crew(1, { vest: "#ff7a1a", hat: "#f7f8fa" }), "wrench");
  {
    const s = new Kit(), m = new Kit();
    s.slab(-0.85, 0, -0.7, 0.8, 0.012, 1.0, "#3a3f47");                     // the mat
    s.slab(-0.62, 0.012, -0.42, 0.62, 0.24, 0.42, "#2b2f36"); s.slab(-0.6, 0.24, -0.4, 0.6, 0.26, 0.4, "#f2c230");   // the stand
    s.slab(-0.42, 0.012, 0.62, -0.1, 0.17, 0.82, "#d33a3a"); s.slab(-0.42, 0.17, 0.6, -0.1, 0.18, 0.84, "#9e2626");  // the toolbox, open by the technician
    m.slab(-0.38, 0.17, 0.66, -0.2, 0.19, 0.7, "#9aa6b5");
    bay.add(s.mesh(solid), m.mesh(metal));
    bayP.root.position.set(0.28, 0, 0.78); bayP.root.rotation.y = Math.PI + 0.25;
    const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.008), new THREE.MeshStandardMaterial({ color: "#9aa6b5", metalness: 0.8, roughness: 0.3 }));
    wrench.position.set(0, -0.09, 0.02); bayP.b.handR.add(wrench);
    blob(bay, 0.28, 0.72, 0.4);
    loader.load(url("defence-rover.glb"), g => {
      const r = g.scene;
      r.scale.setScalar(0.9); r.position.set(0, 0.26, 0); r.rotation.y = 0.35;
      r.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material.metalness > 0.5) o.material.roughness = Math.max(o.material.roughness, 0.28); } });
      const w = r.getObjectByName("Wheel_FR");                  // the wheel that's off, leaning on the stand
      if (w) {
        const off = w.clone(); w.visible = false;
        off.position.set(0.55, 0.23, 0.72); off.rotation.set(0.25, 1.25, 0);
        bay.add(off); off.scale.setScalar(0.9);
        off.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      }
      bay.add(r);
      merge(r, o => o === w);                                     // it stands still: a mesh a material
      bay.rover = r;
      onLoad();
    });
  }

  /* ---- the arm cell: the arm on its plinth between two conveyors, the stack light, the operator */
  const cell = station("cell");
  const arm = { model: null, t: 0, phase: -1, box: null, grip: 0, j: null, home: V(-0.75, 1.18, 0) };
  const BELT0 = -1.45;                                              // where the conveyors start (they end at the arm)
  const belts = [], boxes = [];
  const cellP = person(cell, crew(2, { vest: "#d8ff3a", hat: "#f2c230" }), "tablet");
  const pilot = person(new THREE.Group(), crew(5, { headset: true, shirt: "#1f3b66" }), "pilot");
  const runner = person(root, crew(6, { vest: "#ff7a1a", hat: "#f7f8fa" }), "carry");
  {
    const s = new Kit(), m = new Kit();
    s.slab(-0.42, 0, -0.42, 0.42, 0.15, 0.42, "#3a3f47");                    // the plinth
    for (const z of [0.85, -0.85]) {                                        // the two conveyors
      m.slab(BELT0, 0.66, z - 0.19, -0.33, 0.74, z - 0.16, "#9aa6b5"); m.slab(BELT0, 0.66, z + 0.16, -0.33, 0.74, z + 0.19, "#9aa6b5");
      for (const x of [BELT0 + 0.08, -0.42]) for (const zz of [z - 0.17, z + 0.17]) m.slab(x - 0.025, 0, zz - 0.025, x + 0.025, 0.66, zz + 0.025, "#6b7482");
      m.cyl(0.04, 0.04, 0.34, "#9aa6b5", BELT0, 0.705, z, Math.PI / 2); m.cyl(0.04, 0.04, 0.34, "#9aa6b5", -0.33, 0.705, z, Math.PI / 2);
      const len = -0.33 - BELT0;
      const belt = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: beltTex.clone(), roughness: 0.85 }));
      belt.material.map.repeat.set(len / 0.2, 1); belt.material.map.needsUpdate = true;
      belt.position.set(BELT0 + len / 2, 0.745, z); belt.receiveShadow = true; cell.add(belt);
      belts.push({ mesh: belt, dir: z > 0 ? 1 : -1 });
    }
    m.slab(-0.33, 0.74, 0.68, -0.3, 0.86, 1.02, "#2b2f36");                // the end stop on the infeed
    // the control cabinet and its stack light
    s.slab(0.62, 0, -0.95, 1.2, 1.7, -0.58, "#d7dde5"); s.slab(0.65, 0.9, -0.579, 1.17, 1.6, -0.575, "#c3cad4");   // the control cabinet
    m.cyl(0.02, 0.02, 0.2, "#6b7482", 1.1, 1.8, -0.78);
    const lamp = (y, c) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15, roughness: 0.4 })); l.position.set(1.1, y, -0.78); cell.add(l); return l; };
    arm.lights = [lamp(1.95, "#3fd46b"), lamp(2.03, "#f2c230"), lamp(2.11, "#e84545")];
    cell.add(s.mesh(solid), m.mesh(metal));
    screen(cell, 6, 0.4, 0.26, 0.91, 1.3, -0.573);
    // hazard tape round the cell
    tape(cell, BELT0 - 0.12, 1.2, 0.5, 1.2); tape(cell, 0.5, 1.2, 0.5, -0.5); tape(cell, BELT0 - 0.12, 1.2, BELT0 - 0.12, -0.9);
    const boxMat = new THREE.MeshStandardMaterial({ color: "#c79c6e", roughness: 0.8 });
    const tapeStripe = new THREE.MeshStandardMaterial({ color: "#e3d3b8", roughness: 0.7 });
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), boxMat); b.castShadow = b.receiveShadow = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.02, 0.122), tapeStripe); t.position.y = 0.035; b.add(t);
      b.visible = false; cell.add(b);
      boxes.push({ mesh: b, state: "idle", x: 0 });
    }
    cellP.root.position.set(0.95, 0, -0.1); cellP.root.rotation.y = -Math.PI / 2 - 0.35;
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.012), new THREE.MeshStandardMaterial({ color: "#15181d", roughness: 0.4 }));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshStandardMaterial({ color: "#05070a", emissive: "#ffffff", emissiveMap: screenTex, emissiveIntensity: 0.9 }));
    glass.position.z = 0.007; tablet.add(glass);
    { const uv = glass.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.25 + uv.getX(k) / 4, 0.5 + uv.getY(k) / 2); }
    tablet.position.set(0, 0.02, 0.33); tablet.rotation.x = -0.75; cellP.b.chest.add(tablet); cellP.tablet = tablet;
    blob(cell, 0.95, -0.1, 0.36);
    loader.load(url("robot-arm.glb"), g => {
      const a = g.scene;
      a.position.set(-0.34, 0.15, 0);
      a.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material.metalness > 0.5) o.material.roughness = Math.max(o.material.roughness, 0.28); } });
      cell.add(a);
      a.updateMatrixWorld(true);
      const j = n => a.getObjectByName(n);
      arm.j = { J1: j("J1"), J2: j("J2"), J3: j("J3"), J5: j("J5"), A: j("FingerA"), B: j("FingerB") };
      const joints = new Set(Object.values(arm.j));              // each link a mesh a material
      for (const link of [a, ...joints]) merge(link, o => joints.has(o));
      arm.fa = arm.j.A.position.x; arm.fb = arm.j.B.position.x;
      arm.model = a;
      onLoad();
    });
  }
  // the pilot's controller, and the runner's box
  {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: "#1f2530", roughness: 0.5 }));
    pad.position.set(0, -0.19, 0.3); pilot.b.chest.add(pad); pilot.pad = pad;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: "#c79c6e", roughness: 0.8 }));
    box.castShadow = true; box.position.set(0, -0.24, 0.3); runner.b.chest.add(box); runner.box = box;
  }
  const zoneG = station("zone");
  zoneG.add(pilot.root);
  const zoneLabel = label(5, 2.1); zoneLabel.rotation.x = -Math.PI / 2; zoneG.add(zoneLabel);
  const zoneTape = new THREE.Group(); zoneG.add(zoneTape);
  const pilotBlob = blob(zoneG, 0, 0, 0.38);

  // one mesh for every screen, in whichever station it stands
  const screenMeshes = [];
  for (const name of Object.keys(stations)) {
    const geos = screens.filter(s => s.frame === stations[name]).map(s => s.g);
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), screenMat);
    stations[name].add(mesh); screenMeshes.push(mesh);
  }

  /* ------------------------------------------------ where everything stands: it follows the room's width */
  const zone = { x0: -2, x1: 2, z0: -10, z1: -2.4 };              // the test zone, in room units
  const path = { a: V(), b: V(), t: 0 };
  function layout(xL, xR) {
    const hw = xR / 2, wide = hw > 2.65, D = 7;
    // along the back wall: the arm cell in the corner, the lab bench, the store in the other corner
    cell.position.set(-hw + (wide ? 1.55 : 1.2), 0, -D + 0.95); cell.scale.setScalar(wide ? 1 : 0.8);
    lab.position.set(wide ? 0.55 : 0.5, 0, -D + 0.37); lab.scale.setScalar(wide ? 1 : 0.75);
    store.position.set(hw - 0.95, 0, -D + 0.27); store.visible = wide && hw > 3.1;
    // down the side walls: the repair bay on the left, the office on the right
    bay.position.set(-hw + 0.9, 0, -3.95); bay.rotation.y = Math.PI / 2; bay.visible = wide;
    office.position.set(hw - 0.4, 0, -4.55); office.rotation.y = -Math.PI / 2; office.visible = wide;
    runner.root.visible = wide;
    // the test zone: the middle of the floor, taped out, the pilot at its corner
    const x0 = wide ? -hw + 1.8 : -hw + 0.35, x1 = wide ? hw - 1.35 : hw - 0.75, z0 = -5.25, z1 = -2.0;
    Object.assign(zone, { x0: x0 * 2, x1: x1 * 2, z0: z0 * 2, z1: z1 * 2 });
    zoneTape.clear();
    const f = new THREE.Group(); zoneTape.add(f);
    tape(f, x0, z0, x1, z0); tape(f, x1, z0, x1, z1); tape(f, x1, z1, x0, z1); tape(f, x0, z1, x0, z0);
    zoneLabel.position.set(x0 + 1.55, 0.004, -3.35);
    pilot.root.position.set(wide ? x1 + 0.4 : x1 + 0.3, 0, wide ? -3.45 : -4.5);
    pilotBlob.position.set(pilot.root.position.x, 0.004, pilot.root.position.z);
    path.a.set(hw - 1.2, 0, -5.62); path.b.set(-hw + 2.6, 0, -5.62);
  }

  /* ------------------------------------------------ the day's work */
  const _w = V(), _p = V(), _t = V(), _s = V();
  // the arm: its hand to a point in the cell's frame (metres), the gripper hanging straight down
  const J = { J2: V(0.34, 0.47), J3: V(0.67, 1.64), J5: V(-0.394, 1.05) };
  const L1 = J.J3.distanceTo(J.J2), L2 = J.J5.distanceTo(J.J3);
  const A0 = Math.atan2(J.J3.y - J.J2.y, J.J3.x - J.J2.x), B0 = Math.atan2(J.J5.y - J.J3.y, J.J5.x - J.J3.x);
  const BEND = Math.sign(A0 - Math.atan2(J.J5.y - J.J2.y, J.J5.x - J.J2.x)) || 1, GRIP = 0.65;
  function armTo(p, grip) {
    const j = arm.j, r = Math.hypot(p.x, p.z);
    j.J1.rotation.y = Math.atan2(p.z, -p.x);
    const wx = 0.34 - r + 0.013, wy = p.y + GRIP - 0.15;             // the wrist, in the arm's own plane
    const dx = wx - J.J2.x, dy = wy - J.J2.y, d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const t1 = Math.atan2(dy, dx) + BEND * Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const t2 = Math.atan2(wy - J.J2.y - L1 * Math.sin(t1), wx - J.J2.x - L1 * Math.cos(t1));
    j.J2.rotation.z = t1 - A0;
    j.J3.rotation.z = t2 - B0 - (t1 - A0);
    j.J5.rotation.z = -(t1 - A0) - (t2 - B0 - (t1 - A0));
    j.A.position.x = arm.fa + 0.028 * grip; j.B.position.x = arm.fb - 0.028 * grip;
  }
  // pick at the infeed's end, set down on the outfeed, go home; a cycle is 7 seconds
  const PICK = V(-0.5, 0.805, 0.85), DROP = V(-0.5, 0.805, -0.85), UP = 0.3;
  const WAY = [[0, "home", 0], [0.9, "abovePick", 0], [1.4, "pick", 0], [1.7, "pick", 1], [2.2, "abovePick", 1], [3.5, "aboveDrop", 1], [4.0, "drop", 1], [4.3, "drop", 0], [4.8, "aboveDrop", 0], [5.8, "home", 0], [7.0, "home", 0]];
  const spot = n => ({ home: arm.home, abovePick: V(PICK.x, PICK.y + UP, PICK.z), pick: PICK, aboveDrop: V(DROP.x, DROP.y + UP, DROP.z), drop: DROP })[n];
  const BELT = 0.26;                                                // metres a second
  function runArm(dt) {
    if (!arm.model) return;
    for (const b of belts) b.mesh.material.map.offset.x -= b.dir * BELT * dt / 0.2;
    // boxes ride the infeed to its stop; one is waiting when the arm comes for it
    const onIn = boxes.filter(b => b.state === "in").sort((p, q) => q.x - p.x), last = onIn[onIn.length - 1];
    if (onIn.length < 2 && (!last || last.x > BELT0 + 0.3)) {
      const b = boxes.find(b => b.state === "idle");
      if (b) { b.state = "in"; b.x = BELT0 + 0.06; b.mesh.visible = true; b.mesh.scale.setScalar(1); onIn.push(b); }
    }
    let ahead = -0.5;
    for (const b of onIn) { b.x = Math.min(ahead, b.x + BELT * dt); ahead = b.x - 0.16; b.mesh.position.set(b.x, 0.805, 0.85); b.mesh.rotation.set(0, 0, 0); }
    for (const b of boxes) if (b.state === "out") {
      b.x -= BELT * dt; b.mesh.position.set(b.x, 0.805, -0.85);
      if (b.x < BELT0 + 0.1) { const k = clamp((b.x - BELT0 + 0.05) / 0.15, 0, 1); b.mesh.scale.setScalar(k); if (k <= 0) { b.state = "idle"; b.mesh.visible = false; } }
    }
    // the cycle starts when a box is at the stop
    if (arm.phase < 0) { const ready = onIn.find(b => b.x >= -0.501); arm.phase = ready ? 0 : -1; if (ready) arm.t = 0; else { armTo(arm.home, 0); return; } }
    arm.t += dt;
    const T = arm.t;
    let i = 0; while (i < WAY.length - 2 && T > WAY[i + 1][0]) i++;
    const [ta, na, ga] = WAY[i], [tb, nb, gb] = WAY[i + 1], k = ease(clamp((T - ta) / (tb - ta), 0, 1));
    const target = _p.copy(spot(na)).lerp(spot(nb), k), grip = lerp(ga, gb, k);
    armTo(target, grip);
    if (T >= 1.7 && !arm.box) {                                     // got it
      arm.box = boxes.find(b => b.state === "in" && b.x >= -0.501);
      if (arm.box) { arm.box.state = "held"; arm.j.J5.attach(arm.box.mesh); }
    }
    if (T >= 4.3 && arm.box) { cell.attach(arm.box.mesh); arm.box.state = "out"; arm.box.x = DROP.x; arm.box.mesh.rotation.set(0, 0, 0); arm.box = null; }   // let go
    if (T >= WAY[WAY.length - 1][0]) arm.phase = -1;
    arm.lights[0].material.emissiveIntensity = 1.6; arm.lights[1].material.emissiveIntensity = arm.box ? 1.2 : 0.1;
  }
  // everyone's job, every frame
  const TW = V(), POLE = V();
  function work(P, t, dt) {
    const b = P.b;
    if (P.job === "solder") {                                        // leaning over the bench, iron in one hand, the board held with the other
      stand(P, t, 0.5);
      b.hips.rotation.x = 0.18; b.spine.rotation.x += 0.12; b.chest.rotation.x += 0.08;
      P.root.updateMatrixWorld(true);
      const w = Math.sin(t * 2.1 + P.ph) * 0.012;
      reach(P, "R", at(P, -0.12 + w, 0.99, 0.46 + w), at(P, -0.5, 1.0, -0.2));
      reach(P, "L", at(P, 0.14, 0.97, 0.47), at(P, 0.5, 1.0, -0.2));
      look(P, at(P, 0, 0.93, 0.5), dt);
    } else if (P.job === "type") {                                   // at the desk, typing, with a look at the project board now and then
      sit(P, t);
      P.root.updateMatrixWorld(true);
      const tap = s => 0.012 * Math.max(0, Math.sin(t * 13 + s + P.ph)), glance = Math.sin(t * 0.21 + P.ph) > 0.85;
      reach(P, "L", at(P, 0.12, 0.8 + tap(0), 0.47), at(P, 0.45, 0.8, 0));
      reach(P, "R", at(P, -0.12, 0.8 + tap(2), 0.47), at(P, -0.45, 0.8, 0));
      look(P, glance ? at(P, 1.6, 1.7, 0.2) : at(P, 0.1 * Math.sin(t * 0.3), 1.03, 0.9), dt, 3);
    } else if (P.job === "wrench") {                                 // kneeling at the rover, turning a nut
      kneel(P, t);
      P.root.updateMatrixWorld(true);
      const a = t * 4.2 + P.ph, turn = Math.sin(t * 0.9 + P.ph) > -0.3;
      reach(P, "R", at(P, -0.08 + (turn ? 0.04 * Math.cos(a) : 0), 0.62 + (turn ? 0.04 * Math.sin(a) : 0), 0.52), at(P, -0.6, 0.4, 0));
      reach(P, "L", at(P, 0.22, 0.72, 0.5), at(P, 0.6, 0.4, 0));
      look(P, at(P, -0.05, 0.62, 0.6), dt);
    } else if (P.job === "tablet") {                                 // watching the arm, checking the tablet
      stand(P, t);
      P.root.updateMatrixWorld(true);
      P.tablet.updateMatrixWorld(true);
      reach(P, "L", P.tablet.localToWorld(_t.set(0.12, -0.02, 0)), at(P, 0.5, 0.9, -0.3));
      reach(P, "R", P.tablet.localToWorld(_t.set(-0.12, -0.02, 0)), at(P, -0.5, 0.9, -0.3));
      const up = Math.sin(t * 0.35 + P.ph) > 0.1;                  // now the tablet, now the arm
      look(P, up && arm.model ? arm.j.J5.getWorldPosition(_s) : P.tablet.getWorldPosition(_s), dt, 3);
    } else if (P.job === "pilot") {                                  // driving the robot on the floor, watching it
      stand(P, t, 0.4);
      P.root.getWorldPosition(_a);
      const want = Math.atan2(bot.x - _a.x, bot.z - _a.z);
      P.root.rotation.y += turn(P.root.rotation.y, want) * (dt ? 1 - Math.exp(-dt * 1.4) : 1);   // the body comes round slowly, the head first
      P.root.updateMatrixWorld(true);
      P.pad.updateMatrixWorld(true);
      reach(P, "L", P.pad.localToWorld(_t.set(0.09, 0, 0)), at(P, 0.5, 0.8, -0.2));
      reach(P, "R", P.pad.localToWorld(_t.set(-0.09, 0, 0)), at(P, -0.5, 0.8, -0.2));
      look(P, _w.set(bot.x, 0.8, bot.z), dt, 4);
    } else if (P.job === "carry") {                                  // back and forth with a box
      walk(P, t, dt);
      P.root.updateMatrixWorld(true);
      P.box.updateMatrixWorld(true);
      reach(P, "L", P.box.localToWorld(_t.set(0.2, 0, 0)), at(P, 0.6, 0.9, -0.2));
      reach(P, "R", P.box.localToWorld(_t.set(-0.2, 0, 0)), at(P, -0.6, 0.9, -0.2));
      look(P, at(P, 0, 1.4, 2.5), dt);
    }
  }
  function sit(P, t) {
    const b = P.b, br = Math.sin(t * 1.6 + P.ph);
    b.hips.position.set(0, 0.56, 0); b.hips.rotation.set(-0.05, 0, 0);
    b.spine.rotation.set(0.1 + 0.01 * br, 0, 0); b.chest.rotation.set(0.06 + 0.01 * br, 0, 0);
    for (const s of ["L", "R"]) { b["leg" + s].rotation.set(-1.52, 0, s === "L" ? -0.06 : 0.06); b["shin" + s].rotation.set(1.45, 0, 0); b["foot" + s].rotation.set(0.05, 0, 0); b["hand" + s].rotation.set(0, 0, 0); }
  }
  function kneel(P, t) {
    const b = P.b, br = Math.sin(t * 1.6 + P.ph);
    b.hips.position.set(0.02, 0.5, 0); b.hips.rotation.set(0.25, 0, 0);
    b.spine.rotation.set(0.1 + 0.01 * br, 0, 0); b.chest.rotation.set(0.05, 0, 0);
    b.legL.rotation.set(-1.82, 0, -0.1); b.shinL.rotation.set(1.57, 0, 0); b.footL.rotation.set(0, 0, 0);       // one foot planted in front
    b.legR.rotation.set(-0.15, 0, 0.06); b.shinR.rotation.set(1.45, 0, 0); b.footR.rotation.set(0.45, 0, 0);    // the other knee down
    b.handL.rotation.set(0, 0, 0); b.handR.rotation.set(0, 0, 0);
  }
  // the runner: along the path and back, turning round at each end
  function walk(P, t, dt) {
    const b = P.b, len = path.a.distanceTo(path.b), speed = 1.15;
    if (len < 0.1) { stand(P, t); return; }
    path.t = (path.t + dt * speed / len) % 2;
    const leg = path.t < 1 ? path.t : 2 - path.t, dir = path.t < 1 ? 1 : -1;
    const k = smooth(clamp(Math.min(leg, 1 - leg) * len / 0.6, 0, 1));    // slows to a stop at each end
    P.root.position.lerpVectors(path.a, path.b, leg);
    const want = Math.atan2((path.b.x - path.a.x) * dir, (path.b.z - path.a.z) * dir);
    P.root.rotation.y += turn(P.root.rotation.y, want) * (1 - Math.exp(-dt * 6));
    P.walkPh = (P.walkPh || 0) + dt * 5.2 * k;
    const w = P.walkPh, s = Math.sin(w), c = Math.cos(w);
    b.hips.position.set(0, 0.95 - 0.02 * k * (1 - Math.abs(c)), 0); b.hips.rotation.set(0.04 * k, 0.08 * s * k, 0);
    b.spine.rotation.set(0.03, -0.06 * s * k, 0); b.chest.rotation.set(0.02, -0.04 * s * k, 0);
    for (const [side, sg] of [["L", 1], ["R", -1]]) {
      const ph = sg * s, swing = Math.max(0, -sg * c);
      b["leg" + side].rotation.set(-0.42 * ph * k, 0, 0);
      b["shin" + side].rotation.set((0.1 + 0.75 * swing) * k, 0, 0);
      b["foot" + side].rotation.set(-0.15 * ph * k, 0, 0);
    }
  }
  function update(t, dt) {
    t /= 1000;
    runArm(reduce ? 0 : dt);
    for (const P of people) if (P.root.visible !== false && (!P.root.parent || P.root.parent.visible !== false)) work(P, reduce ? 0 : t, reduce ? 0 : dt);
  }
  return { root, layout, update, zone };
}
