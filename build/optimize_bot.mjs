// Make the web copy of the robot: node build/optimize_bot.mjs <exported.glb> assets/models/janyu-tech-bot.glb
// The logo texture is cropped to the label it is used for, the geometry simplified (it is only ever
// a hundred-odd pixels wide on screen) and meshopt-compressed. The node tree is kept as it is,
// so the landing can still find and turn the wheels (Wheel_Left_Drive … Wheel_Right_Roller_4).
// Needs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const [input, output, ratio = "0.12", error = "0.005"] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node build/optimize_bot.mjs <in.glb> <out.glb> [ratio] [error]"); process.exit(1); }
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// crop each texture down to the part its meshes use (the label is a small patch of a reference sheet)
for (const tex of root.listTextures()) {
  const prims = [];
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial()?.getBaseColorTexture() === tex) prims.push(p);
  let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
  for (const p of prims) { const uv = p.getAttribute("TEXCOORD_0"), e = []; for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); u0 = Math.min(u0, e[0]); u1 = Math.max(u1, e[0]); v0 = Math.min(v0, e[1]); v1 = Math.max(v1, e[1]); } }
  if (!prims.length || u1 <= u0) continue;
  const { width: W, height: H } = await sharp(tex.getImage()).metadata();
  const left = Math.max(0, Math.floor(u0 * W) - 2), top = Math.max(0, Math.floor(v0 * H) - 2);
  const width = Math.min(W - left, Math.ceil(u1 * W) + 2 - left), height = Math.min(H - top, Math.ceil(v1 * H) + 2 - top);
  tex.setImage(await sharp(tex.getImage()).extract({ left, top, width, height }).resize({ width: width * 2, kernel: "lanczos3" }).png().toBuffer());
  for (const p of prims) {
    const uv = p.getAttribute("TEXCOORD_0").clone(), e = [];
    for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); uv.setElement(i, [(e[0] * W - left) / width, (e[1] * H - top) / height]); }
    p.setAttribute("TEXCOORD_0", uv);
  }
}
await doc.transform(
  dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +error }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: "high", quantizationVolume: "scene" }),
);
await io.write(output, doc);
let tris = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
console.log(`${output}: ${tris} triangles`);
