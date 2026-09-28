"""
Janyu Tech's rooftop terrace over the sea, for the website's full-bleed images: the robots stand on travertine
between weeping blue cherry trees, by day (clear sky) or at blue hour (the night view).

  blender -b --factory-startup -P terrace.py -- --shot hero --time day --res 2400 1800 --samples 256 --out FILE.png

Shots are cameras on the same scene (see SHOTS below). Cycles on the GPU. Two more outputs from the same cameras:
  --depth   how far each pixel is (white near, black at 40 m), turned into the hero's parallax maps
            (assets/scene/hero-depth.webp and hero-m-depth.webp; see the README for the conversion)
  --lines   the view as a blueprint: flat blue, the geometry's edges drawn in white by Freestyle, no blossom
            (assets/scene/aerial-bp.webp, from --shot aerial --res 2400 1500)
The robots are linked from robots.blend, made by make_lib.py.
"""
import bpy, bmesh, math, random, sys, os, time, addon_utils
from mathutils import Vector, Matrix, Quaternion

T0 = time.time()
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default, cast=str, n=1):
    if name not in argv: return default
    i = argv.index(name)
    return cast(argv[i + 1]) if n == 1 else [cast(x) for x in argv[i + 1:i + 1 + n]]
SHOT = arg("--shot", "hero")
TIME = arg("--time", "day")
RES = arg("--res", [1200, 1200], int, 2)
SAMPLES = arg("--samples", 64, int)
OUT = arg("--out", "/tmp/terrace.png")
SEED = arg("--seed", 7, int)
TREE_DENSITY = arg("--trees", 1.0, float)
rng = random.Random(SEED)
TAU = math.tau
NIGHT = TIME == "night"

OUTPUTS = os.environ.get("ROBOT_MODELS", "/Users/subhodeepsarkar/Documents/Codex/2026-09-26/make/outputs")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ------------------------------------------------------------------ render setup
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("cycles", default_set=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"; prefs.get_devices()
for d in prefs.devices: d.use = d.type == "METAL"
scene.cycles.device = "GPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 12
scene.cycles.transmission_bounces = 12
scene.cycles.glossy_bounces = 6
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.0

def hexc(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*c, a)

def link(ob, coll=None):
    (coll or scene.collection).objects.link(ob); return ob

# ------------------------------------------------------------------ materials
def principled(name, color, rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = hexc(color) if isinstance(color, str) else color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    for k, v in kw.items(): p.inputs[k].default_value = v
    return m

def travertine():
    """large-format travertine tiles: pale, veined a little, with fine joints"""
    m = bpy.data.materials.new("travertine"); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    p = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1, 1, 1)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    br = N.new("ShaderNodeTexBrick")
    br.offset = 0.5; br.squash = 1.0
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Mortar Size"].default_value = 0.004
    br.inputs["Mortar Smooth"].default_value = 0.2
    br.inputs["Brick Width"].default_value = 1.2
    br.inputs["Row Height"].default_value = 0.6
    br.inputs["Color1"].default_value = hexc("#dbd0bd")
    br.inputs["Color2"].default_value = hexc("#cfc2ab")
    br.inputs["Mortar"].default_value = hexc("#b9ad99")
    L.new(mp.outputs["Vector"], br.inputs["Vector"])
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 3.5; nz.inputs["Detail"].default_value = 8
    L.new(mp.outputs["Vector"], nz.inputs["Vector"])
    vein = N.new("ShaderNodeTexWave"); vein.inputs["Scale"].default_value = 2.2; vein.inputs["Distortion"].default_value = 9
    vein.inputs["Detail"].default_value = 6
    L.new(mp.outputs["Vector"], vein.inputs["Vector"])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.12
    L.new(br.outputs["Color"], mix.inputs[6])
    ramp = N.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = hexc("#cdbfa8"); ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    L.new(vein.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], mix.inputs[7])
    L.new(mix.outputs[2], p.inputs["Base Color"])
    rr = N.new("ShaderNodeMapRange"); rr.inputs["To Min"].default_value = 0.32; rr.inputs["To Max"].default_value = 0.55
    L.new(nz.outputs["Fac"], rr.inputs["Value"]); L.new(rr.outputs["Result"], p.inputs["Roughness"])
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.002
    L.new(br.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], p.inputs["Normal"])
    return m

def plaster():
    m = principled("plaster", "#efece6", 0.85)
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 40; nz.inputs["Detail"].default_value = 10
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = 0.08
    nt.links.new(nz.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m

def sea():
    m = principled("sea", "#0b3a78", 0.03, IOR=1.33)
    m.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.6
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.08, 0.25, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.0; nz.inputs["Detail"].default_value = 12
    nz.inputs["Roughness"].default_value = 0.62
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = 0.35; b.inputs["Distance"].default_value = 0.4
    nt.links.new(nz.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m

def glow(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = hexc(color); e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], o.inputs["Surface"])
    return m

M_TRAV = travertine()
M_PLASTER = plaster()
M_COPING = principled("coping", "#ddd3c2", 0.45)
M_SEA = sea()
M_HILLS = principled("hills", "#6f86a8", 0.9)
M_SOIL = principled("soil", "#3a3029", 0.95)
M_PLANTER = principled("planter", "#d9cfbf", 0.6)
M_BARK = principled("bark", "#3a3441", 0.75)
M_STEM = principled("stem", "#34465e", 0.6)
M_GRASS = principled("moss", "#3f5a3a", 0.9)

def petal_material():
    m = bpy.data.materials.new("petal"); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(uv.outputs[0], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); el = ramp.color_ramp.elements
    el[0].position = 0.0; el[0].color = hexc("#1b46c4")
    el[1].position = 1.0; el[1].color = hexc("#f2f6ff")
    e = el.new(0.22); e.color = hexc("#3d6fe6")
    e = el.new(0.55); e.color = hexc("#a9c4f7")
    e = el.new(0.82); e.color = hexc("#dde8ff")
    nt.links.new(sep.outputs[0], ramp.inputs[0])
    info = nt.nodes.new("ShaderNodeAttribute"); info.attribute_type = "INSTANCER"; info.attribute_name = "tint"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 1.0
    nt.links.new(ramp.outputs[0], mix.inputs[6]); nt.links.new(info.outputs["Color"], mix.inputs[7])
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.5
    p.inputs["Sheen Weight"].default_value = 0.35
    p.inputs["Sheen Tint"].default_value = hexc("#dfe9ff")
    p.inputs["Thin Wall"].default_value = True
    p.inputs["Transmission Weight"].default_value = 0.28
    p.inputs["Specular IOR Level"].default_value = 0.35
    nt.links.new(p.outputs[0], out.inputs["Surface"])
    return m
M_PETAL = petal_material()
M_CENTER = principled("center", "#122f86", 0.55, **{"Sheen Weight": 0.3})
M_FILAMENT = principled("filament", "#d5e3ff", 0.5)
M_ANTHER = principled("anther", "#2350c9", 0.45)
M_BUD = principled("bud", "#6f97ee", 0.45, **{"Sheen Weight": 0.4})

# ------------------------------------------------------------------ helpers
def box(name, size, loc, mat, bevel=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc
    if bevel:
        md = ob.modifiers.new("bev", "BEVEL"); md.width = bevel; md.segments = 3; md.limit_method = "ANGLE"
    return ob

def plane(name, sx, sy, loc, mat, subdiv=0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=max(1, subdiv), y_segments=max(1, subdiv), size=0.5)
    for v in bm.verts: v.co.x *= sx; v.co.y *= sy
    bm.to_mesh(me); bm.free(); me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc
    return ob

def set_parent(ob, parent):
    mw = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    ob.matrix_world = mw

# ------------------------------------------------------------------ the deck: an infinity pool that meets the sea
PX, PY0, PY1 = 2.4, 2.2, 14.2               # the pool: |x| < PX, from PY0 out to its vanishing edge at PY1
DECK_END = 14.5
M_TILE = principled("pooltile", "#a9d8e6", 0.35)
def mosaic(m):
    nt = m.node_tree; pr = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick"); br.offset = 0.0
    br.inputs["Scale"].default_value = 1.0; br.inputs["Brick Width"].default_value = 0.05; br.inputs["Row Height"].default_value = 0.05
    br.inputs["Mortar Size"].default_value = 0.003
    br.inputs["Color1"].default_value = hexc("#a4d4e4"); br.inputs["Color2"].default_value = hexc("#94c8dc"); br.inputs["Mortar"].default_value = hexc("#e8f4f8")
    nt.links.new(tc.outputs["Object"], br.inputs["Vector"]); nt.links.new(br.outputs["Color"], pr.inputs["Base Color"])
mosaic(M_TILE)
M_WATER = principled("water", "#dff4ff", 0.012, IOR=1.333, **{"Transmission Weight": 1.0})
def water_bump(m, scale, strength):
    nt = m.node_tree; pr = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1, 2.5, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 6
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = strength; b.inputs["Distance"].default_value = 0.02
    nt.links.new(nz.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], pr.inputs["Normal"])
water_bump(M_WATER, 2.2, 0.25)
def shadow_clear(m):
    nt = m.node_tree; out = nt.nodes["Material Output"]; pr = nt.nodes["Principled BSDF"]
    lp = nt.nodes.new("ShaderNodeLightPath"); tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Shadow Ray"], mx.inputs["Fac"])
    nt.links.new(pr.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
shadow_clear(M_WATER)
def slab(name, x0, x1, y0, y1, z0, z1, mat):
    return box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat)
slab("deck_near", -16, 16, -6, PY0, -0.3, 0, M_TRAV)
slab("deck_left", -16, -PX, PY0, DECK_END, -0.3, 0, M_TRAV)
slab("deck_right", PX, 16, PY0, DECK_END, -0.3, 0, M_TRAV)
slab("pool_floor", -PX, PX, PY0, PY1, -1.45, -1.35, M_TILE)
slab("pool_wl", -PX - 0.05, -PX, PY0, PY1, -1.4, 0, M_TILE)
slab("pool_wr", PX, PX + 0.05, PY0, PY1, -1.4, 0, M_TILE)
slab("pool_wn", -PX, PX, PY0 - 0.05, PY0, -1.4, 0, M_TILE)
slab("pool_lip", -PX, PX, PY1, PY1 + 0.25, -1.4, -0.06, M_TILE)      # the weir the water spills over
plane("water", 2 * PX, PY1 + 0.25 - PY0, (0, (PY0 + PY1 + 0.25) / 2, -0.035), M_WATER)
slab("cliff", -16, 16, DECK_END - 0.2, DECK_END, -4, -0.3, M_PLASTER)
sea_ob = plane("sea", 30000, 30000, (0, 15000 + 30, -60), M_SEA)
def hills():
    me = bpy.data.meshes.new("hills"); bm = bmesh.new()
    n = 160; rows = []
    for i in range(n + 1):
        x = -5200 + i * 3900 / n
        h = 70 + 120 * math.sin(i * 0.09) ** 2 + 50 * math.sin(i * 0.31 + 1) + 22 * math.sin(i * 1.1)
        h *= max(0.0, min(1.0, (i / n) * 3.0)) * max(0.0, 1 - (i / n) ** 4)
        y = 3400 + 250 * math.sin(i * 0.04)
        rows.append((bm.verts.new((x, y, -60)), bm.verts.new((x, y + 30, -60 + h))))
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    bm.to_mesh(me); bm.free(); me.materials.append(M_HILLS)
    return link(bpy.data.objects.new("hills", me))
hills()
print("T deck %.1fs" % (time.time() - T0))

# ------------------------------------------------------------------ blossoms (the same flowers as the site's videos)
def petal_geo(bm, rot, tilt, length, width, cup, notch, uv_layer, r0=0.1, nu=8, nv=6):
    verts = []
    for i in range(nu + 1):
        u = i / nu; row = []
        for j in range(nv + 1):
            v = j / nv * 2 - 1
            if u < 0.68: hw = 0.16 + 0.84 * math.sin(u / 0.68 * math.pi / 2) ** 1.15
            else: hw = 1 - 0.3 * ((u - 0.68) / 0.32) ** 2
            hw *= width / 2
            t = max(0.0, (u - 0.72) / 0.28); t = t * t * (3 - 2 * t)
            x = u * (1 - notch * (1 - abs(v)) ** 5 * t) * (1 - 0.2 * abs(v) ** 3 * t)
            y = v * hw
            z = cup * (y / (width / 2)) ** 2 * 0.22 * u ** 0.6 + 0.03 * math.sin(7 * v + 4 * u) * u
            p = Vector((r0 + x, y, z)) * length
            p = Matrix.Rotation(-tilt, 3, "Y") @ p
            p = Matrix.Rotation(rot, 3, "Z") @ p
            row.append(bm.verts.new(p))
        verts.append(row)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1])); f.smooth = True
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv_layer].uv = (a / nu, b / nv)

def make_flower(name, openness):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    tilt = 0.18 + (1 - openness) * 0.95; cup = 0.8 + (1 - openness) * 1.2
    for k in range(5):
        petal_geo(bm, k * TAU / 5 + rng.uniform(-0.12, 0.12), tilt + rng.uniform(-0.08, 0.1), 1 + rng.uniform(-0.06, 0.06), 0.86, cup, 0.13, uvl)
    # the centre and a ring of stamens, in the same mesh (their own material slots)
    c0 = len(bm.faces)
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.13)
    for v in bm.verts[:]:
        pass
    bm.verts.ensure_lookup_table()
    n = 14
    for k in range(n):
        a = k * TAU / n + rng.uniform(-0.1, 0.1)
        el = math.radians(rng.uniform(28, 48)) * (0.7 + 0.3 * openness)
        Ls = rng.uniform(0.36, 0.5)
        d = Vector((math.cos(a) * math.sin(el), math.sin(a) * math.sin(el), math.cos(el)))
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=4, radius1=0.012, radius2=0.008, depth=Ls)
        q = Vector((0, 0, 1)).rotation_difference(d)
        for v in res["verts"]: v.co = q @ v.co + Vector((0, 0, 0.04)) + d * Ls / 2
        sph = bmesh.ops.create_uvsphere(bm, u_segments=5, v_segments=3, radius=0.03)
        for v in sph["verts"]: v.co += Vector((0, 0, 0.04)) + d * Ls
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free()
    for m in (M_PETAL, M_CENTER, M_FILAMENT, M_ANTHER): me.materials.append(m)
    for i, poly in enumerate(me.polygons):
        if i < c0: poly.material_index = 0
        else:
            c = poly.center
            poly.material_index = 1 if (c.length < 0.16 and c.z < 0.12) else (3 if poly.area < 0.004 and c.length > 0.3 else 2)
    return me

FLOWER_MESHES = [make_flower(f"fl{i}", o) for i, o in enumerate([1.0, 0.95, 0.85, 0.7])]
print("T flowers-made %.1fs" % (time.time() - T0))
def bud_mesh():
    me = bpy.data.meshes.new("bud"); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.3)
    for v in bm.verts: v.co.z = v.co.z * 1.45 + 0.25
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free(); me.materials.append(M_BUD); return me
BUD_MESH = bud_mesh()

PTS = []            # (position, rotation quaternion, size, variant, tint)
protos = bpy.data.collections.new("protos"); scene.collection.children.link(protos)
for i, me in enumerate(FLOWER_MESHES + [BUD_MESH]):
    o = bpy.data.objects.new(f"proto{i}", me); protos.objects.link(o); o.location = (0, 0, -10000)
NV = len(FLOWER_MESHES)

def blossom(pos, normal, size, kind="flower"):
    q = Vector((0, 0, 1)).rotation_difference(normal.normalized())
    spin = Quaternion(normal.normalized(), rng.uniform(0, TAU))
    deep = rng.random()
    tint = [rng.uniform(0.9, 1.0) for _ in range(3)]
    if deep < 0.25: tint = [0.78, 0.86, 1.0]
    elif deep > 0.85: tint = [1.0, 1.0, 1.0]
    PTS.append((Vector(pos), spin @ q, size, rng.randrange(NV) if kind == "flower" else NV, tint))

def build_blossoms():
    me = bpy.data.meshes.new("blossom_pts")
    me.from_pydata([tuple(p[0]) for p in PTS], [], [])
    rot = me.attributes.new("rot", "QUATERNION", "POINT")
    rot.data.foreach_set("value", [c for p in PTS for c in (p[1].w, p[1].x, p[1].y, p[1].z)])
    sz = me.attributes.new("size", "FLOAT", "POINT"); sz.data.foreach_set("value", [p[2] for p in PTS])
    va = me.attributes.new("variant", "INT", "POINT"); va.data.foreach_set("value", [p[3] for p in PTS])
    ti = me.attributes.new("tint", "FLOAT_COLOR", "POINT"); ti.data.foreach_set("color", [c for p in PTS for c in (*p[4], 1.0)])
    ob = link(bpy.data.objects.new("blossoms", me))
    ng = bpy.data.node_groups.new("blossom_inst", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N = ng.nodes; Lk = ng.links
    gi = N.new("NodeGroupInput"); go = N.new("NodeGroupOutput")
    ci = N.new("GeometryNodeCollectionInfo"); ci.inputs["Collection"].default_value = protos
    ci.inputs["Separate Children"].default_value = True; ci.inputs["Reset Children"].default_value = True
    iop = N.new("GeometryNodeInstanceOnPoints"); iop.inputs["Pick Instance"].default_value = True
    def attr(name, dt):
        n = N.new("GeometryNodeInputNamedAttribute"); n.data_type = dt; n.inputs["Name"].default_value = name; return n
    Lk.new(gi.outputs[0], iop.inputs["Points"]); Lk.new(ci.outputs[0], iop.inputs["Instance"])
    Lk.new(attr("variant", "INT").outputs["Attribute"], iop.inputs["Instance Index"])
    Lk.new(attr("rot", "QUATERNION").outputs["Attribute"], iop.inputs["Rotation"])
    Lk.new(attr("size", "FLOAT").outputs["Attribute"], iop.inputs["Scale"])
    Lk.new(iop.outputs[0], go.inputs[0])
    md = ob.modifiers.new("inst", "NODES"); md.node_group = ng
    return ob

branch_parts = []
def branch_mesh():
    me = bpy.data.meshes.new("branches"); return me
BR_V, BR_F = [], []          # branch geometry, gathered as plain lists and turned into one mesh at the end
def tube(a, b, r1, r2, segs=8):
    d = b - a; Lg = d.length
    if Lg < 1e-5: return
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    base = len(BR_V)
    for (c, r) in ((a, r1), (b, r2)):
        for k in range(segs):
            t = k / segs * TAU
            BR_V.append(tuple(q @ Vector((math.cos(t) * r, math.sin(t) * r, 0)) + c))
    for k in range(segs):
        k2 = (k + 1) % segs
        BR_F.append((base + k, base + k2, base + segs + k2, base + segs + k))
    # a small cap ball at the joint (an octahedron is enough at this size)
    b0 = len(BR_V); rr = r1 * 1.02
    for v in ((rr, 0, 0), (-rr, 0, 0), (0, rr, 0), (0, -rr, 0), (0, 0, rr), (0, 0, -rr)):
        BR_V.append(tuple(Vector(v) + a))
    for f in ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)):
        BR_F.append(tuple(b0 + i for i in f))

def spray(start, direction, n, seg, r0, r1, depth, droop, fsize, dens, stalk=0.018, maxdepth=3, side_p=0.7, weep=False):
    """a blossoming branch, grown in segments; flowers in clusters along it"""
    pos = Vector(start); d = Vector(direction).normalized()
    for i in range(n):
        drop = droop * (1 + (i / n) * (2.2 if weep else 0.5))
        d = (d + Vector((rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), -drop + rng.uniform(-0.08, 0.08)))).normalized()
        nxt = pos + d * seg * rng.uniform(0.8, 1.15)
        t0, t1 = i / n, (i + 1) / n
        tube(pos, nxt, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, 8 if r0 > 0.02 else 5)
        pos = nxt
        if depth >= 1 and i >= (1 if depth == 1 else 0):
            k = max(1, int(rng.randint(4, 9) * dens))
            for _ in range(k):
                dd = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 0.6))).normalized()
                p = pos - d * seg * rng.uniform(0, 1) + dd * stalk * rng.uniform(0.6, 1.4)
                nrm = (dd + Vector((rng.uniform(-.4, .4), rng.uniform(-.4, .4), rng.uniform(-.3, .5)))).normalized()
                blossom(p, nrm, fsize * rng.uniform(0.75, 1.2), "bud" if rng.random() < 0.08 else "flower")
        if depth < maxdepth and rng.random() < side_p and i < n - 1:
            ang = rng.choice([-1, 1]) * rng.uniform(0.5, 1.1)
            axis = d.orthogonal().normalized()
            sd = (Quaternion(Vector((0, 0, 1)), ang) @ d + Vector((0, 0, -0.1))).normalized()
            spray(pos, sd, rng.randint(2, 5), seg * 0.72, (r0 + (r1 - r0) * t1) * 0.65, 0.003, depth + 1, droop * 1.2,
                  fsize, dens, stalk, maxdepth, side_p * 0.75, weep)

def pompom(c, r, n, fsize):
    """a ball of blossom at a branch tip: flowers over (mostly the outside of) an ellipsoid"""
    for _ in range(n):
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        k = rng.uniform(0.55, 1.0) ** 0.5
        p = c + Vector((d.x * r * 1.15, d.y * r * 1.15, d.z * r * 0.8)) * k
        nrm = (d + Vector((rng.uniform(-.5, .5), rng.uniform(-.5, .5), rng.uniform(-.3, .5)))).normalized()
        blossom(p, nrm, fsize * rng.uniform(0.75, 1.2), "bud" if rng.random() < 0.06 else "flower")

def limb(start, d, n, seg, r0, depth, fsize, dens, tips):
    pos = Vector(start); d = Vector(d).normalized()
    for i in range(n):
        d = (d + Vector((rng.uniform(-.25, .25), rng.uniform(-.25, .25), rng.uniform(-.12, .1)))).normalized()
        nxt = pos + d * seg * rng.uniform(0.8, 1.15)
        r1 = r0 * (1 - (i + 1) / (n + 1)) + 0.004
        tube(pos, nxt, r0 * (1 - i / (n + 1)) + 0.004, r1, 8 if r0 > 0.03 else 5)
        pos = nxt
        if depth < 2 and i >= 1 and rng.random() < 0.8:
            sd = (d + Vector((rng.uniform(-.9, .9), rng.uniform(-.9, .9), rng.uniform(-.1, .5)))).normalized()
            limb(pos, sd, max(1, n - 2), seg * 0.75, r1 * 0.7, depth + 1, fsize, dens, tips)
    tips.append(pos)

def cherry_tree(base, height, spread, dens=1.0, fsize=0.034):
    """a cherry in full bloom: a short trunk, limbs spreading up and out, and a cloud of blossom over them"""
    top = base + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), height))
    mid = base + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), height * 0.5))
    tube(base, mid, 0.14, 0.11, 12); tube(mid, top, 0.11, 0.08, 12)
    tips = []
    for k in range(6):
        a = k * TAU / 6 + rng.uniform(-0.3, 0.3)
        limb(top, Vector((math.cos(a), math.sin(a), rng.uniform(0.7, 1.3))), 3, spread / 3.4, 0.07, 0, fsize, dens, tips)
    for t in tips:
        pompom(t, rng.uniform(0.32, 0.5) * spread / 3.3, int(170 * dens * TREE_DENSITY), fsize)
    # and blossom along the way, so it isn't all at the ends
    for k in range(int(1200 * dens * TREE_DENSITY)):
        t = tips[rng.randrange(len(tips))]
        c = top + (t - top) * rng.uniform(0.35, 0.95)
        pompom(c, 0.28 * spread / 3.3, 1, fsize)

def planter(x, y, w=1.6, h=0.55):
    box("planter", (w, w, h), (x, y, h / 2), M_PLANTER, 0.02)
    box("soil", (w - 0.12, w - 0.12, 0.02), (x, y, h - 0.03), M_SOIL)

TREES = [(-4.9, 7.2, 2.2, 3.4), (5.3, 8.6, 2.3, 3.6)]
for (x, y, h, sp) in TREES:
    planter(x, y)
    cherry_tree(Vector((x, y, 0.53)), h, sp, 1.25)
# sprays hanging into the hero's top corners from just outside the frame (camera: 0.85 m up, level, 28 mm, 4:3)
CAM_Y, CAM_Z, TANH, TANV = -2.7, 0.9, 18 / 28, 13.5 / 28
if SHOT in ("hero", "cta", "hero_m"):
    for side in (-1, 1):
        for k in range(9):
            d = rng.uniform(2.4, 5.2)
            hw, top = d * TANH, CAM_Z + d * TANV
            x0 = side * hw * rng.uniform(0.7, 1.08); z0 = top + rng.uniform(0.05, 0.35)
            spray(Vector((x0, CAM_Y + d, z0)), Vector((-side * rng.uniform(0.3, 0.9), rng.uniform(-0.2, 0.3), -0.8)),
                  rng.randint(2, 3), 0.27, 0.02, 0.004, 1, 0.05, 0.03, 2.4 * TREE_DENSITY, 0.03, 3, 0.75)

me_br = bpy.data.meshes.new("branches"); me_br.from_pydata(BR_V, [], BR_F)
for p in me_br.polygons: p.use_smooth = True
me_br.materials.append(M_BARK)
link(bpy.data.objects.new("branches", me_br))

# petals fallen on the stone, under the trees and blown along the pool
def petal_mesh():
    me = bpy.data.meshes.new("fallen"); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    petal_geo(bm, 0, -0.05, 1, 0.86, 0.6, 0.13, uvl, r0=0)
    bm.to_mesh(me); bm.free(); me.materials.append(M_PETAL); return me
o = bpy.data.objects.new("proto_petal", petal_mesh()); protos.objects.link(o); o.location = (0, 0, -10000)
PETAL_V = NV + 1
def fallen(cx, cy, n, spread, sx=1.0):
    for _ in range(n):
        r = abs(rng.gauss(0, spread)); a = rng.uniform(0, TAU)
        x, y = cx + math.cos(a) * r * sx, cy + math.sin(a) * r
        if abs(x) < PX + 0.02 and PY0 < y < PY1 + 0.2: continue
        q = Quaternion((0, 0, 1), rng.uniform(0, TAU)) @ Quaternion((1, 0, 0), rng.uniform(-0.2, 0.2))
        PTS.append((Vector((x, y, 0.002)), q, 0.03 * rng.uniform(0.8, 1.2), PETAL_V, [rng.uniform(0.9, 1), rng.uniform(0.92, 1), 1]))
for (x, y, h, sp) in TREES: fallen(x, y, 800, 1.7)
fallen(-2.2, 0.9, 320, 1.2); fallen(2.3, 1.1, 320, 1.2)
print("T grown %.1fs" % (time.time() - T0))
build_blossoms()
print("T instanced %.1fs" % (time.time() - T0))

# ------------------------------------------------------------------ the robots
LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "robots.blend")
def import_glb(path, loc, rot_z, scale=1.0, name="robot"):
    with bpy.data.libraries.load(LIB, link=False) as (src, dst):
        dst.collections = [name]
    coll = dst.collections[0]
    new = list(coll.objects)
    for o in new: link(o)
    root = bpy.data.objects.new(name, None); link(root)
    for o in new:
        if o.parent is None: set_parent(o, root)
    root.location = loc; root.rotation_euler = (0, 0, rot_z); root.scale = (scale,) * 3
    return root
# (the quadruped's and the rover's fronts are -x in their models)
ROBOTS = {
    "cleaner": (None, (-1.15, 1.45, 0), math.radians(-38)),
    "quad":  (f"{OUTPUTS}/quadruped_robot.glb", (-1.15, 1.45, 0), math.radians(142)),
    "rover": (f"{OUTPUTS}/defence_rover.glb", (1.1, 1.85, 0), math.radians(24)),
    "arm":   (f"{OUTPUTS}/robot_arm.glb", (3.0, 6.6, 0.4), math.radians(228)),
}
box("plinth", (1.05, 1.05, 0.4), (3.0, 6.6, 0.2), M_COPING, 0.01)
for k, (f, loc, rz) in ROBOTS.items():
    if k == "cleaner" and SHOT != "quote": continue
    if k == "quad" and SHOT == "quote": continue
    import_glb(f, loc, rz, name=k)
print("ROBOTS %.1fs" % (time.time() - T0))

# ------------------------------------------------------------------ sky and light
world = bpy.data.worlds.new("sky"); scene.world = world; world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bg = wn["Background"]
tc = wn.new("ShaderNodeTexCoord")
nrm = wn.new("ShaderNodeVectorMath"); nrm.operation = "NORMALIZE"; wl.new(tc.outputs["Generated"], nrm.inputs[0])
sepw = wn.new("ShaderNodeSeparateXYZ"); wl.new(nrm.outputs[0], sepw.inputs[0])
ramp = wn.new("ShaderNodeValToRGB"); el = ramp.color_ramp.elements
wl.new(sepw.outputs["Z"], ramp.inputs["Fac"])
if NIGHT:
    stops = [(0.0, "#4a67a3"), (0.03, "#35528f"), (0.12, "#1d3877"), (0.35, "#0f2458"), (1.0, "#060f2b")]
    bg.inputs["Strength"].default_value = 1.0
else:
    stops = [(0.0, "#d9e8f7"), (0.025, "#b9d4f3"), (0.1, "#7eaaec"), (0.25, "#4a80e0"), (0.5, "#2b62d2"), (1.0, "#1a47b4")]
    bg.inputs["Strength"].default_value = 0.6
el[0].position, el[0].color = stops[0][0], hexc(stops[0][1])
el[1].position, el[1].color = stops[-1][0], hexc(stops[-1][1])
for pos, c in stops[1:-1]:
    e = el.new(pos); e.color = hexc(c)
if NIGHT:                                           # stars: the brightest cells of a fine voronoi, above the horizon
    vo = wn.new("ShaderNodeTexVoronoi"); vo.feature = "F1"; vo.inputs["Scale"].default_value = 420
    wl.new(tc.outputs["Generated"], vo.inputs["Vector"])
    st = wn.new("ShaderNodeMapRange"); st.inputs["From Min"].default_value = 0.035; st.inputs["From Max"].default_value = 0.0
    wl.new(vo.outputs["Distance"], st.inputs["Value"])
    wh = wn.new("ShaderNodeTexWhiteNoise"); wl.new(vo.outputs["Position"], wh.inputs["Vector"])
    gate = wn.new("ShaderNodeMath"); gate.operation = "GREATER_THAN"; gate.inputs[1].default_value = 0.93
    wl.new(wh.outputs["Value"], gate.inputs[0])
    up = wn.new("ShaderNodeMath"); up.operation = "GREATER_THAN"; up.inputs[1].default_value = 0.06
    wl.new(sepw.outputs["Z"], up.inputs[0])
    m1 = wn.new("ShaderNodeMath"); m1.operation = "MULTIPLY"; wl.new(st.outputs["Result"], m1.inputs[0]); wl.new(gate.outputs[0], m1.inputs[1])
    m2 = wn.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; wl.new(m1.outputs[0], m2.inputs[0]); wl.new(up.outputs[0], m2.inputs[1])
    m3 = wn.new("ShaderNodeMath"); m3.operation = "MULTIPLY"; m3.inputs[1].default_value = 2.5; wl.new(m2.outputs[0], m3.inputs[0])
    add = wn.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; add.inputs["Factor"].default_value = 1.0
    wl.new(ramp.outputs["Color"], add.inputs[6]); wl.new(m3.outputs[0], add.inputs[7])
    wl.new(add.outputs[2], bg.inputs["Color"])
else:
    wl.new(ramp.outputs["Color"], bg.inputs["Color"])

def sun(energy, elev, rot, color=(1, 1, 1), angle=0.6):
    ld = bpy.data.lights.new("sun", "SUN"); ld.energy = energy; ld.color = color; ld.angle = math.radians(angle)
    ob = link(bpy.data.objects.new("sun", ld))
    d = Vector((math.cos(elev) * math.sin(rot), -math.cos(elev) * math.cos(rot), math.sin(elev)))  # towards the sun
    ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return ob

def area(loc, aim, energy, size, color):
    ld = bpy.data.lights.new("a", "AREA"); ld.energy = energy; ld.size = size; ld.color = color
    ob = link(bpy.data.objects.new("a", ld)); ob.location = loc
    ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob

def spot(loc, aim, energy, angle, color, blend=0.6, radius=0.05):
    ld = bpy.data.lights.new("s", "SPOT"); ld.energy = energy; ld.spot_size = math.radians(angle); ld.spot_blend = blend
    ld.color = color; ld.shadow_soft_size = radius
    ob = link(bpy.data.objects.new("s", ld)); ob.location = loc
    ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob

def pointl(loc, energy, color, radius=0.05):
    ld = bpy.data.lights.new("p", "POINT"); ld.energy = energy; ld.color = color; ld.shadow_soft_size = radius
    ob = link(bpy.data.objects.new("p", ld)); ob.location = loc
    return ob

if NIGHT:
    sun(0.06, math.radians(40), math.radians(160), (0.7, 0.8, 1.0), 1.0)                 # moonlight
    M_SEA.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexc("#061a3d")
    # the pool glows from below
    for k in range(5):
        for sx in (-1, 1):
            pointl((sx * (PX - 0.25), PY0 + 1.0 + k * 2.4, -0.9), 70, (0.5, 0.76, 1.0), 0.35)
    area((-1.5, -1.2, 2.4), (0, 1.8, 0.5), 95, 2.5, (0.78, 0.86, 1.0))                    # a soft key on the robots
    area((2.5, 4.5, 1.6), (0, 1.6, 0.6), 160, 1.5, (0.6, 0.75, 1.0))                     # and a cool rim from behind
    for (x, y, h, sp) in TREES:                                                          # trees lit from below
        spot((x - 0.9 * (1 if x > 0 else -1), y - 1.0, 0.62), (x, y, 2.8), 1100, 70, (0.75, 0.85, 1.0), 0.9, 0.2)
    for (x, y) in ((3.0, 5.7),):
        spot((x, y, 0.06), (x, y + 1.0, 1.4), 160, 50, (0.85, 0.9, 1.0), 0.8, 0.05)
    lamps = glow("coast", "#ffd9a0", 30.0)
    for i in range(520):
        x = rng.uniform(-5000, -1400); yy = 3380 + rng.uniform(-80, 80)
        z = -58 + abs(rng.gauss(0, 1)) * 10
        box("cl", (3.0, 3.0, 3.0), (x, yy, z), lamps)
    scene.view_settings.exposure = 0.05
else:
    SUN = sun(5.2, math.radians(40), math.radians(-58), (1.0, 0.965, 0.92), 0.5)
    scene.view_settings.exposure = -0.15

# ------------------------------------------------------------------ cameras
def camera(name, loc, target, lens, shift=(0, 0), fstop=0, focus=None):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36
    cd.shift_x, cd.shift_y = shift
    cd.clip_start = 0.05; cd.clip_end = 40000
    ob = link(bpy.data.objects.new(name, cd)); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus or (Vector(target) - Vector(loc)).length
    return ob

SHOTS = {
    "hero":        dict(loc=(0, -2.7, 0.9), target=(0, 12, 0.9), lens=28),
    "quote":       dict(loc=(0.55, -1.45, 0.52), target=(-0.95, 2.3, 0.55), lens=32, fstop=8),
    "aerial":      dict(loc=(0.6, -7.5, 11.0), target=(0.3, 7.0, -0.5), lens=30),
    "engineering": dict(loc=(4.9, 4.4, 1.35), target=(3.0, 6.6, 1.75), lens=32, fstop=6),
    "split-a":     dict(loc=(-0.35, 0.35, 0.3), target=(-1.15, 1.45, 0.34), lens=70, fstop=4),
    "split-b":     dict(loc=(2.15, 0.95, 0.42), target=(1.1, 1.85, 0.36), lens=70, fstop=4),
    "cta":         dict(loc=(-3.9, -1.9, 1.55), target=(1.2, 8.5, 0.7), lens=26),
    "hero_m":      dict(loc=(-0.05, -2.4, 0.78), target=(-0.05, 12, 1.12), lens=21),
    "amen":        dict(loc=(3.9, -0.9, 1.25), target=(-2.2, 7.2, 1.3), lens=30),
    "panel":       dict(loc=(2.55, 0.35, 0.95), target=(1.1, 1.85, 0.42), lens=50, fstop=5),
    "horizontal":  dict(loc=(0.4, -0.9, 1.05), target=(-2.2, 3.9, 1.35), lens=34, fstop=8),
}
cam = camera(SHOT, **SHOTS[SHOT])
# some views are of one robot alone
HIDE = {"quote": ["rover", "arm", "plinth"]}
for name in HIDE.get(SHOT, []):
    ob = bpy.data.objects.get(name)
    if not ob: continue
    for o in [ob] + list(ob.children_recursive): o.hide_render = True
scene.camera = cam

# --depth: instead of the picture, how far each pixel is (white near, black at 40 m and beyond), for the page's parallax
if "--depth" in argv:
    dm = bpy.data.materials.new("depth"); dm.use_nodes = True
    nt = dm.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission")
    cd = nt.nodes.new("ShaderNodeCameraData")
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 1.0; mr.inputs["From Max"].default_value = 40.0
    mr.inputs["To Min"].default_value = 1.0; mr.inputs["To Max"].default_value = 0.0; mr.clamp = True
    pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 1.6
    nt.links.new(cd.outputs["View Distance"], mr.inputs["Value"]); nt.links.new(mr.outputs["Result"], pw.inputs[0])
    nt.links.new(pw.outputs[0], em.inputs["Color"]); nt.links.new(em.outputs[0], o.inputs["Surface"])
    bpy.context.view_layer.material_override = dm
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    for ob in scene.objects:
        if ob.type == "LIGHT": ob.hide_render = True
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"; scene.view_settings.exposure = 0
    scene.cycles.samples = 16; scene.cycles.use_denoising = False
    cam.data.dof.use_dof = False
# --lines: the same view as a blueprint drawing: flat blue, the geometry's edges in white (Freestyle), and no
# blossom (the bare branches read better as a drawing)
if "--lines" in argv:
    for nm in ("blossoms",):
        ob = bpy.data.objects.get(nm)
        if ob: ob.hide_render = True
    lm = bpy.data.materials.new("lines"); lm.use_nodes = True
    nt = lm.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission")
    lw = nt.nodes.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.35
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.012, 0.055, 0.25, 1); mix.inputs["B"].default_value = (0.02, 0.09, 0.36, 1)
    nt.links.new(lw.outputs["Facing"], mix.inputs["Factor"]); nt.links.new(mix.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], o.inputs["Surface"])
    bpy.context.view_layer.material_override = lm
    bg = world.node_tree.nodes["Background"]
    for l in list(bg.inputs["Color"].links): world.node_tree.links.remove(l)
    bg.inputs["Color"].default_value = (0.008, 0.04, 0.2, 1); bg.inputs["Strength"].default_value = 1.0
    for ob in scene.objects:
        if ob.type == "LIGHT": ob.hide_render = True
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"; scene.view_settings.exposure = 0
    scene.cycles.samples = 8; scene.cycles.use_denoising = False
    cam.data.dof.use_dof = False
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"; scene.render.line_thickness = 1.25
    fs = bpy.context.view_layer.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("lines")
    ls.select_by_visibility = True; ls.visibility = "VISIBLE"
    ls.select_by_edge_types = True
    ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True; ls.select_contour = True; ls.select_external_contour = True
    st = ls.linestyle or bpy.data.linestyles.new("bp"); ls.linestyle = st
    st.color = (0.92, 0.96, 1.0); st.alpha = 0.95; st.thickness = 1.25
print("BUILD %.1fs" % (time.time() - T0), "points", len(PTS))
# where each robot lands in the frame (for the page's hotspots), as % from the left and from the top
from bpy_extras.object_utils import world_to_camera_view
bpy.context.view_layer.update()
for k in ROBOTS:
    root = bpy.data.objects.get(k)
    if root is None: continue
    pts = [o.matrix_world @ Vector(c) for o in root.children_recursive if o.type == "MESH" for c in o.bound_box]
    if not pts: continue
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    v = world_to_camera_view(scene, cam, c)
    print("PIN", k, round(v.x * 100, 1), round((1 - v.y) * 100, 1))
scene.render.filepath = OUT
T1 = time.time()
bpy.ops.render.render(write_still=True)
print("RENDER %.1fs" % (time.time() - T1))
