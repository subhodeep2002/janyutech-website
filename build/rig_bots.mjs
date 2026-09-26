// Make the web copies of the other robots, rigged for the landing:
//   node build/rig_bots.mjs <defence_rover.glb> <quadruped_robot.glb> <robot_arm.glb> [out dir = assets/models]
// – the rover: each wheel hangs from its own pivot at its hub (Wheel_FL …), and the whip antenna
//   is cut off the body so it can sway (Antenna, pivoting at its base)
// – the quadruped: each leg is cut into the bracket that stays on the body, the thigh (under
//   Hip_FL …, pivoting on the hip actuator) and the shin (under Knee_FL …, pivoting at the knee)
// – the arm: its castings are hung on a chain of joints, J1 (the waist, turning about y) and J2, J3
//   and J5 (shoulder, elbow and wrist, about z), with the gripper's two fingers (FingerA, FingerB)
//   free to slide; the cable harness is cut along the arm and each stretch goes with its link
// The pivots are empty nodes, so compression can't move them. Bolts and washers too small to see
// at this size are dropped, the rest simplified and meshopt-compressed. In the rover and the
// quadruped the front is -x; the arm reaches along -x.
// Needs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, meshopt, transformMesh } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";

const [roverIn, dogIn, armIn, outDir = "assets/models"] = process.argv.slice(2);
if (!roverIn || !dogIn || !armIn) { console.error("usage: node build/rig_bots.mjs <defence_rover.glb> <quadruped_robot.glb> <robot_arm.glb> [out dir]"); process.exit(1); }
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const TINY = 0.015;                                             // parts smaller than this (in metres) go

// the connected parts of a primitive: a part id per triangle, and each part's triangle count, centre and bounds
function parts(prim) {
  const pos = prim.getAttribute("POSITION"), idx = prim.getIndices(), nv = pos.getCount(), nt = idx.getCount() / 3, e = [];
  const seen = new Map(), rep = new Int32Array(nv);             // split normals leave twin vertices: join them by position
  for (let i = 0; i < nv; i++) { pos.getElement(i, e); const k = e.map(v => Math.round(v * 1e5)).join(); if (!seen.has(k)) seen.set(k, i); rep[i] = seen.get(k); }
  const up = Int32Array.from({ length: nv }, (_, i) => i);
  const find = x => { while (up[x] !== x) { up[x] = up[up[x]]; x = up[x]; } return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) up[a] = b; };
  for (let t = 0; t < nt; t++) { const a = rep[idx.getScalar(t * 3)]; join(a, rep[idx.getScalar(t * 3 + 1)]); join(a, rep[idx.getScalar(t * 3 + 2)]); }
  const ids = new Map(), tri = new Int32Array(nt), list = [];
  for (let t = 0; t < nt; t++) {
    const r = find(rep[idx.getScalar(t * 3)]);
    if (!ids.has(r)) { ids.set(r, list.length); list.push({ tris: 0, sum: [0, 0, 0], n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }); }
    const P = list[tri[t] = ids.get(r)];
    P.tris++;
    for (let j = 0; j < 3; j++) {
      pos.getElement(idx.getScalar(t * 3 + j), e);
      for (let a = 0; a < 3; a++) { P.sum[a] += e[a]; P.min[a] = Math.min(P.min[a], e[a]); P.max[a] = Math.max(P.max[a], e[a]); }
      P.n++;
    }
  }
  for (const P of list) { P.c = P.sum.map(v => v / P.n); P.size = Math.max(...[0, 1, 2].map(a => P.max[a] - P.min[a])); }
  return { tri, list };
}

// cut a mesh (already in model space) into several, sorting each part with pick(part, material name):
// it returns a group index, or -1 to drop the part
function cut(doc, mesh, groups, pick) {
  const out = groups.map(name => doc.createMesh(name));
  for (const prim of mesh.listPrimitives()) {
    const { tri, list } = parts(prim), where = list.map(P => pick(P, prim.getMaterial().getName()));
    emit(doc, prim, t => where[tri[t]], out);
  }
  return out;
}
// the same, triangle by triangle: pick(centre) sorts each by where it is
function split(doc, mesh, groups, pick) {
  const out = groups.map(name => doc.createMesh(name));
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), idx = prim.getIndices(), where = [], v = [[], [], []];
    for (let t = 0; t < idx.getCount() / 3; t++) {
      for (let j = 0; j < 3; j++) pos.getElement(idx.getScalar(t * 3 + j), v[j]);
      where.push(pick([0, 1, 2].map(a => (v[0][a] + v[1][a] + v[2][a]) / 3)));
    }
    emit(doc, prim, t => where[t], out);
  }
  return out;
}
// a primitive's triangles, shared out among the meshes in out by group(triangle index)
function emit(doc, prim, group, out) {
  const idx = prim.getIndices(), mat = prim.getMaterial(), nt = idx.getCount() / 3;
  out.forEach((_, g) => {
    const keep = [];
    for (let t = 0; t < nt; t++) if (group(t) === g) keep.push(idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2));
    if (!keep.length) return;
    const remap = new Map(), order = [];                        // only the vertices this piece uses
    const ind = keep.map(v => { if (!remap.has(v)) { remap.set(v, order.length); order.push(v); } return remap.get(v); });
    const p = doc.createPrimitive().setMaterial(mat).setIndices(doc.createAccessor().setType("SCALAR").setArray(order.length > 65535 ? new Uint32Array(ind) : new Uint16Array(ind)));
    for (const sem of prim.listSemantics()) {
      const src = prim.getAttribute(sem), size = src.getElementSize(), arr = new (src.getArray().constructor)(order.length * size), e = [];
      order.forEach((v, i) => { src.getElement(v, e); for (let k = 0; k < size; k++) arr[i * size + k] = e[k]; });
      p.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(arr).setNormalized(src.getNormalized()));
    }
    out[g].addPrimitive(p);
  });
}
// several meshes' primitives gathered into one
function merge(doc, name, meshes) {
  const m = doc.createMesh(name);
  for (const src of meshes) for (const p of src.listPrimitives()) { src.removePrimitive(p); m.addPrimitive(p); }
  return m;
}
// a node's mesh, moved into model space (its own copy, so nothing else is touched)
function baked(node) {
  const mesh = node.getMesh().clone();
  transformMesh(mesh, node.getWorldMatrix());
  return mesh;
}
const empty = (doc, name, t) => doc.createNode(name).setTranslation(t);
const holder = (doc, name, mesh, at) => doc.createNode(name).setMesh(mesh).setTranslation(at.map(v => -v));   // geometry in model space, hung from a pivot at `at`
const sub = (a, b) => a.map((v, i) => v - b[i]);
const tag = n => n.replace(/^(Front|Rear) (left|right).*$/i, (_, a, b) => a[0].toUpperCase() + b[0].toUpperCase());   // "Front left leg assembly" → FL

async function finish(doc, file, ratio, error) {
  await doc.transform(
    dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "high", quantizationVolume: "scene" }),
  );
  await io.write(file, doc);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(`${file}: ${tris} triangles`);
}

/* ---------------- the rover */
{
  const doc = await io.read(roverIn), root = doc.getRoot(), scene = root.listScenes()[0];
  const top = scene.listChildren()[0], nodes = top.listChildren();
  const chassisNode = nodes.find(n => /chassis/i.test(n.getName()));
  const AXLE = 0.25;                                             // the hubs' height
  const body = empty(doc, "BodyTilt", [0, AXLE, 0]);
  // the whip antenna on top: its spring and everything above it sway, pivoting where the spring starts
  const [shell, whip] = cut(doc, baked(chassisNode), ["Chassis", "Antenna"], (P) =>
    P.size < TINY ? -1 : Math.abs(P.c[0] - 0.032) < 0.05 && Math.abs(P.c[2]) < 0.05 && P.c[1] > 0.49 ? 1 : 0);
  const base = [0.032, 0.49, 0];
  const antenna = empty(doc, "Antenna", sub(base, [0, AXLE, 0])).addChild(holder(doc, "Antenna_mesh", whip, base));
  body.addChild(holder(doc, "Chassis_mesh", shell, [0, AXLE, 0])).addChild(antenna);
  const out = doc.createNode("Defence rover").addChild(body);
  for (const n of nodes) {
    if (!/wheel/i.test(n.getName())) continue;
    const hub = n.getTranslation(), [wheel] = cut(doc, baked(n), ["Wheel"], P => (P.size < TINY ? -1 : 0));
    out.addChild(empty(doc, "Wheel_" + tag(n.getName()), hub).addChild(holder(doc, "Wheel_" + tag(n.getName()) + "_mesh", wheel, hub)));
  }
  scene.removeChild(top); top.dispose();
  scene.addChild(out);
  await finish(doc, `${outDir}/defence-rover.glb`, 0.1, 0.009);
}

/* ---------------- the quadruped */
{
  const doc = await io.read(dogIn), root = doc.getRoot(), scene = root.listScenes()[0];
  const top = scene.listChildren()[0], nodes = top.listChildren();
  const HIP_Y = 0.75;
  const body = empty(doc, "BodyTilt", [0, HIP_Y, 0]);
  const chassisNode = nodes.find(n => /chassis/i.test(n.getName()));
  const [shell] = cut(doc, baked(chassisNode), ["Chassis"], P => (P.size < TINY ? -1 : 0));
  body.addChild(holder(doc, "Chassis_mesh", shell, [0, HIP_Y, 0]));
  for (const n of nodes) {
    if (!/leg/i.test(n.getName())) continue;
    const T = tag(n.getName()), mesh = baked(n);
    // the hip actuator's centre (its flange: the biggest machined disc) and the knee (the lowest bearing)
    let hip = null, knee = null;
    for (const prim of mesh.listPrimitives()) {
      const name = prim.getMaterial().getName();
      for (const P of parts(prim).list) {
        if (/machined/i.test(name) && (!hip || P.tris > hip.tris)) hip = P;
        if (/bearing/i.test(name) && (!knee || P.c[1] < knee.c[1])) knee = P;
      }
    }
    const A = [hip.c[0], hip.c[1], n.getTranslation()[2]], K = [knee.c[0], knee.c[1], n.getTranslation()[2]];
    const zOut = Math.abs(n.getTranslation()[2]) + 0.093;       // beyond the outer bracket plate: the actuator
    const [bracket, thigh, shin] = cut(doc, mesh, ["Bracket_" + T, "Thigh_" + T, "Shin_" + T], P => {
      if (P.size < TINY) return -1;
      if (Math.hypot(P.c[0] - K[0], P.c[1] - K[1]) < 0.06) return 1;   // the knee's own hardware turns with the thigh
      if (P.c[1] < K[1]) return 2;
      return P.c[1] > HIP_Y - 0.015 && Math.abs(P.c[2]) < zOut ? 0 : 1;
    });
    body.addChild(holder(doc, "Bracket_" + T + "_mesh", bracket, [0, HIP_Y, 0]));
    const kneeNode = empty(doc, "Knee_" + T, sub(K, A)).addChild(holder(doc, "Shin_" + T + "_mesh", shin, K));
    body.addChild(empty(doc, "Hip_" + T, sub(A, [0, HIP_Y, 0])).addChild(holder(doc, "Thigh_" + T + "_mesh", thigh, A)).addChild(kneeNode));
    console.log(T, "hip", A.map(v => v.toFixed(3)).join(), "knee", K.map(v => v.toFixed(3)).join());
  }
  const out = doc.createNode("Quadruped robot").addChild(body);
  scene.removeChild(top); top.dispose();
  scene.addChild(out);
  await finish(doc, `${outDir}/quadruped-robot.glb`, 0.3, 0.004);
}

/* ---------------- the robot arm */
{
  const doc = await io.read(armIn), root = doc.getRoot(), scene = root.listScenes()[0];
  const top = scene.listChildren()[0], nodes = top.listChildren();
  const part = re => baked(nodes.find(n => re.test(n.getName())));
  const base = part(/^base$/i), waist = part(/waist/i), air = part(/pneumatic/i), upper = part(/upper arm/i), elbow = part(/^elbow$/i);
  const fore = part(/^forearm$/i), wrist = part(/^wrist$/i), grip = part(/gripper/i), cable = part(/cable/i);
  // the joints, found on the castings: the shoulder's axle cap, the elbow's bearing, the round housing the
  // wrist pitches in and the flange at the end of the forearm (the arm moves in the plane z = 0)
  const find = (mesh, test) => {
    let best = null;
    for (const prim of mesh.listPrimitives()) for (const P of parts(prim).list) if (test(P, prim.getMaterial().getName()) && (!best || P.tris > best.tris)) best = P;
    return best;
  };
  const flat = P => [P.c[0], P.c[1], 0];
  const J2 = flat(find(waist, (P, m) => /cast aluminium/i.test(m) && P.size < 0.15));
  const J3 = flat(find(elbow, (P, m) => /bearing/i.test(m)));
  const J5 = flat(find(wrist, (P, m) => /enamel/i.test(m) && P.c[1] < 1.1 && Math.abs((P.max[0] - P.min[0]) - (P.max[1] - P.min[1])) < 0.01));
  const J4 = flat(find(fore, (P, m) => /enamel/i.test(m) && P.c[0] < 0.1));
  const J1 = [J2[0], 0.21, 0];
  const fingers = [];                                            // the gripper's two fingers: its biggest machined plates
  for (const prim of grip.listPrimitives()) if (/machined/i.test(prim.getMaterial().getName())) for (const P of parts(prim).list) if (P.c[1] < 0.69) fingers.push(P);
  const [fA, fB] = fingers.sort((a, b) => b.tris - a.tris).slice(0, 2).sort((a, b) => a.c[0] - b.c[0]).map(P => [P.c[0], P.c[1], 0]);
  const keep = P => P.size >= TINY;
  const [baseM] = cut(doc, base, ["Base"], P => (keep(P) ? 0 : -1));
  const [waistM] = cut(doc, waist, ["Waist"], P => (keep(P) ? 0 : -1));
  const [airM] = cut(doc, air, ["Air"], P => (keep(P) ? 0 : -1));
  const [upperM] = cut(doc, upper, ["Upper"], P => (keep(P) ? 0 : -1));
  const [elbowM] = cut(doc, elbow, ["Elbow"], P => (keep(P) ? 0 : -1));
  const [foreM] = cut(doc, fore, ["Fore"], P => (keep(P) ? 0 : -1));
  const [wristUp, wristDown] = cut(doc, wrist, ["WristUp", "WristDown"], P => (!keep(P) ? -1 : P.c[1] > J5[1] - 0.03 ? 0 : 1));
  const [gripM, fingerA, fingerB] = cut(doc, grip, ["Grip", "FingerA", "FingerB"], P => {
    if (!keep(P)) return -1;
    if (P.c[1] < 0.69 && Math.abs(P.c[0] - fA[0]) < 0.06) return 1;
    if (P.c[1] < 0.69 && Math.abs(P.c[0] - fB[0]) < 0.06) return 2;
    return 0;
  });
  // the harness, triangle by triangle, to the link it runs along (the nearest stretch of the arm's centre line)
  const seg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
  };
  const lines = [[[J1[0], 0], J2, 0], [J2, J3, 1], [J3, J4, 2], [J4, J5, 2], [J5, [J5[0], 0.3], 3]];
  const [cT, cU, cF, cW] = split(doc, cable, ["CableT", "CableU", "CableF", "CableW"], p => {
    let best = 0, d = 1e9;
    for (const [a, b, g] of lines) { const e = seg(p, a, b); if (e < d) { d = e; best = g; } }
    return best;
  });
  const node = (name, t) => doc.createNode(name).setTranslation(t);
  const hang = (name, mesh, at) => doc.createNode(name).setMesh(mesh).setTranslation(at.map(v => -v));
  const j5 = node("J5", sub(J5, J3)).addChild(hang("Tool_mesh", merge(doc, "Tool", [wristDown, gripM, cW]), J5))
    .addChild(node("FingerA", sub(fA, J5)).addChild(hang("FingerA_mesh", fingerA, fA)))
    .addChild(node("FingerB", sub(fB, J5)).addChild(hang("FingerB_mesh", fingerB, fB)));
  const j3 = node("J3", sub(J3, J2)).addChild(hang("Fore_mesh", merge(doc, "Fore", [elbowM, foreM, wristUp, cF]), J3)).addChild(j5);
  const j2 = node("J2", sub(J2, J1)).addChild(hang("Upper_mesh", merge(doc, "Upper", [upperM, cU]), J2)).addChild(j3);
  const j1 = node("J1", J1).addChild(hang("Turret_mesh", merge(doc, "Turret", [waistM, airM, cT]), J1)).addChild(j2);
  const out = doc.createNode("Robot arm").addChild(doc.createNode("Base_mesh").setMesh(baseM)).addChild(j1);
  console.log("arm joints", [J1, J2, J3, J4, J5, fA, fB].map(v => v.map(x => x.toFixed(3)).join()).join(" | "));
  scene.removeChild(top); top.dispose();
  scene.addChild(out);
  await finish(doc, `${outDir}/robot-arm.glb`, 0.25, 0.003);
}
