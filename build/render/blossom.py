"""
Blue cherry-blossom clusters for the site: a spray of blossoming twigs that bursts into the frame from
the top-left corner and sways in a breeze, rendered with a transparent background (Cycles).

  blender -b --factory-startup -P blossom.py -- --seed 3 --out DIR [--frames 150] [--res 1080] [--still F]
             [--samples 48] [--shape corner|hang|side]

Everything loops: every sway is a sum of sines with whole numbers of cycles over the loop.
"""
import bpy, bmesh, math, random, sys, os, addon_utils, time
T0 = time.time()
from mathutils import Vector, Matrix, Euler, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default, cast=str):
    return cast(argv[argv.index(name) + 1]) if name in argv else default
SEED = arg("--seed", 3, int)
OUT = arg("--out", "/tmp/blossom")
FRAMES = arg("--frames", 150, int)
RES = arg("--res", 1080, int)
STILL = arg("--still", -1, int)
SAMPLES = arg("--samples", 48, int)
SHAPE = arg("--shape", "corner")
DENSITY = arg("--density", 1.35, float)
LOOK = arg("--look", "AgX - Medium High Contrast")
rng = random.Random(SEED)
TAU = math.tau

# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("cycles", default_set=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices: d.use = d.type == "METAL"
scene.cycles.device = "GPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 6
scene.cycles.transmission_bounces = 4
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = LOOK
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = 25

world = bpy.data.worlds.new("w"); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.62, 0.72, 0.9, 1)
bg.inputs["Strength"].default_value = 0.32

# camera: a long lens looking along +y at a frame 2 units across
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 85; cam_data.sensor_width = 36
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
D = 2 * 85 / 36
cam.location = (0, -D, 0); cam.rotation_euler = (math.pi / 2, 0, 0)
cam_data.dof.use_dof = True; cam_data.dof.focus_distance = D; cam_data.dof.aperture_fstop = 7
cam_data.clip_start = 0.1; cam_data.clip_end = 100

def light(kind, loc, energy, size, color=(1, 1, 1), aim=(0, 0, 0)):
    ld = bpy.data.lights.new(kind + str(len(bpy.data.lights)), kind)
    ld.energy = energy; ld.color = color
    if kind == "AREA": ld.size = size
    if kind == "SUN": ld.angle = size
    o = bpy.data.objects.new(ld.name, ld); scene.collection.objects.link(o)
    o.location = loc
    d = Vector(aim) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o
light("SUN", (-3, -4, 5), 4.2, math.radians(3), (1.0, 0.97, 0.93))        # soft daylight from top left, in front
light("AREA", (3, -4, 0.5), 110, 4, (0.8, 0.88, 1.0))                        # a cool fill from the right
light("SUN", (2, 5, 4), 3.4, math.radians(8), (0.85, 0.92, 1.0))           # behind: petals glow at their edges

# ------------------------------------------------------------------ materials
def mat(name, build):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    sh = build(nt)
    nt.links.new(sh.outputs[0], out.inputs["Surface"])
    return m

def hexc(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]   # to linear
    return (*c, a)

def petal_build(nt):
    # colour runs from the petal's claw (deep blue) to its tip (nearly white); each flower is tinted a little
    # differently (its object colour), and the edges are a touch darker
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(uv.outputs[0], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp.elements
    el[0].position = 0.0; el[0].color = hexc("#1b46c4")
    el[1].position = 1.0; el[1].color = hexc("#f2f6ff")
    e = el.new(0.22); e.color = hexc("#3d6fe6")
    e = el.new(0.55); e.color = hexc("#a9c4f7")
    e = el.new(0.82); e.color = hexc("#dde8ff")
    nt.links.new(sep.outputs[0], ramp.inputs[0])
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(ramp.outputs[0], mix.inputs[6]); nt.links.new(info.outputs["Color"], mix.inputs[7])
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.5
    p.inputs["Sheen Weight"].default_value = 0.35
    p.inputs["Sheen Tint"].default_value = hexc("#dfe9ff")
    p.inputs["Thin Wall"].default_value = True
    p.inputs["Transmission Weight"].default_value = 0.28
    p.inputs["Specular IOR Level"].default_value = 0.35
    tex = nt.nodes.new("ShaderNodeTexWave"); tex.wave_type = "BANDS"; tex.bands_direction = "Y"
    tex.inputs["Scale"].default_value = 9; tex.inputs["Distortion"].default_value = 3
    nt.links.new(uv.outputs[0], tex.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.12
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs[0], p.inputs["Normal"])
    return p

def simple(color, rough=0.6, metal=0.0, sheen=0.0, trans=0.0, thin=False):
    def b(nt):
        p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        p.inputs["Base Color"].default_value = hexc(color)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        p.inputs["Sheen Weight"].default_value = sheen
        if thin: p.inputs["Thin Wall"].default_value = True
        p.inputs["Transmission Weight"].default_value = trans
        return p
    return b

M_PETAL = mat("petal", petal_build)
M_CENTER = mat("center", simple("#122f86", 0.55, sheen=0.3))
M_FILAMENT = mat("filament", simple("#d5e3ff", 0.5))
M_ANTHER = mat("anther", simple("#2350c9", 0.45))
M_BUD = mat("bud", simple("#6f97ee", 0.45, sheen=0.4, trans=0.15, thin=False))
M_BARK = mat("bark", simple("#3a3441", 0.72))
M_STEM = mat("stem", simple("#34465e", 0.6))
M_LEAF = mat("leaf", simple("#2c5876", 0.45, sheen=0.1, trans=0.25, thin=True))

# ------------------------------------------------------------------ flower meshes
def petal_geo(bm, rot, tilt, length, width, cup, notch, uv_layer, r0=0.1):
    """one notched cherry petal, as a grid, placed around the flower's z axis"""
    nu, nv = 12, 9
    verts = []
    for i in range(nu + 1):
        u = i / nu
        row = []
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
            # tilt the petal up out of the flower's plane, then turn it into place
            p = Matrix.Rotation(-tilt, 3, "Y") @ p
            p = Matrix.Rotation(rot, 3, "Z") @ p
            row.append(bm.verts.new(p))
        verts.append(row)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
            f.smooth = True
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv_layer].uv = (a / nu, b / nv)

def make_flower(name, openness, petals=5):
    """a blossom: five petals (their colour ramps along uv.x), a centre and a ring of stamens"""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    tilt = 0.18 + (1 - openness) * 0.95
    cup = 0.8 + (1 - openness) * 1.2
    for k in range(petals):
        rot = k * TAU / petals + rng.uniform(-0.12, 0.12)
        petal_geo(bm, rot, tilt + rng.uniform(-0.08, 0.1), 1.0 + rng.uniform(-0.06, 0.06), 0.86, cup, 0.13, uvl)
    bm.to_mesh(me); bm.free()
    me.materials.append(M_PETAL)
    ob = bpy.data.objects.new(name, me)
    # centre and stamens, a second material slot on their own mesh
    me2 = bpy.data.meshes.new(name + "_c"); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.13)
    for v in bm.verts: v.co.z *= 0.45; v.co.z += 0.02
    n = 18
    for k in range(n):
        a = k * TAU / n + rng.uniform(-0.1, 0.1)
        el = math.radians(rng.uniform(28, 48)) * (0.7 + 0.3 * openness)
        L = rng.uniform(0.36, 0.5)
        d = Vector((math.cos(a) * math.sin(el), math.sin(a) * math.sin(el), math.cos(el)))
        base = Vector((0, 0, 0.04))
        tip = base + d * L
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.012, radius2=0.008, depth=L)
        q = Vector((0, 0, 1)).rotation_difference(d)
        for v in res["verts"]:
            v.co = q @ v.co + base + d * L / 2
        sph = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.03)
        for v in sph["verts"]: v.co += tip
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me2); bm.free()
    me2.materials.append(M_CENTER); me2.materials.append(M_FILAMENT); me2.materials.append(M_ANTHER)
    # the sphere at the middle is slot 0; cones are filaments (slot 1); small spheres anthers (slot 2)
    for poly in me2.polygons:
        c = poly.center
        poly.material_index = 0 if c.length < 0.16 and c.z < 0.1 else (2 if poly.area < 0.004 and c.length > 0.3 else 1)
    ob2 = bpy.data.objects.new(name + "_c", me2)
    return ob, ob2

def make_bud(name):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.3)
    for v in bm.verts:
        v.co.z *= 1.45; v.co.z += 0.25
        tw = v.co.z * 0.6
        x, y = v.co.x, v.co.y
        v.co.x, v.co.y = x * math.cos(tw) - y * math.sin(tw), x * math.sin(tw) + y * math.cos(tw)
        v.co.x *= 1 + 0.08 * math.sin(5 * math.atan2(v.co.y, v.co.x))
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free(); me.materials.append(M_BUD)
    return bpy.data.objects.new(name, me)

def make_leaf(name):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    nu, nv = 16, 4
    vs = []
    for i in range(nu + 1):
        u = i / nu; row = []
        for j in range(nv + 1):
            v = j / nv * 2 - 1
            hw = math.sin(math.pi * u ** 0.75) ** 0.9 * 0.3 * (1 - 0.35 * u ** 3)
            if abs(v) == 1: hw *= 1 + 0.05 * math.sin(u * 60)        # toothed edge
            z = 0.22 * abs(v) * hw - 0.1 * u * u                     # folded, and arching away
            row.append(bm.verts.new((u, v * hw, z)))
        vs.append(row)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1])); f.smooth = True
    bm.to_mesh(me); bm.free(); me.materials.append(M_LEAF)
    return bpy.data.objects.new(name, me)

# a few of each, instanced many times (linked duplicates share their mesh)
FLOWERS = [make_flower(f"fl{i}", o) for i, o in enumerate([1.0, 0.95, 0.85, 0.7, 1.0, 0.9])]
BUDS = [make_bud(f"bud{i}") for i in range(2)]
LEAVES = [make_leaf(f"leaf{i}") for i in range(2)]
proto = bpy.data.collections.new("proto")          # the originals stay out of the render
for ob in [o for pair in FLOWERS for o in pair] + BUDS + LEAVES:
    proto.objects.link(ob)

# ------------------------------------------------------------------ branches
root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
joints = []           # (empty, depth)

def cyl_between(a, b, r1, r2, parent, material, segs=8, knot=True):
    d = b - a; L = d.length
    me = bpy.data.meshes.new("seg"); bm = bmesh.new()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=L)
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free(); me.materials.append(material)
    ob = bpy.data.objects.new("seg", me); scene.collection.objects.link(ob)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.matrix_world = Matrix.Translation(a + d / 2) @ q.to_matrix().to_4x4()
    set_parent(ob, parent)
    if not knot: return
    # a ball at the joint hides the seam
    me2 = bpy.data.meshes.new("knot"); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r1 * 1.02)
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me2); bm.free(); me2.materials.append(material)
    k = bpy.data.objects.new("knot", me2); scene.collection.objects.link(k)
    k.matrix_world = Matrix.Translation(a); set_parent(k, parent)

def set_parent(ob, parent):
    mw = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    ob.matrix_world = mw

def new_joint(pos, parent, depth):
    e = bpy.data.objects.new("j", None); scene.collection.objects.link(e)
    e.empty_display_size = 0.02
    e.matrix_world = Matrix.Translation(pos)
    if parent is not None: set_parent(e, parent)
    else: set_parent(e, root)
    joints.append((e, depth))
    return e

def inside(p, m=0.0):
    return -1 - m < p.x < 1 + m and -1 - m < p.z < 1 + m

CORNER = {"corner": Vector((-1.2, 0, 1.2)), "hang": Vector((0, 0, 1.3)), "rise": Vector((-1.2, 0, -1.2))}.get(SHAPE, Vector((-1.3, 0, 0.2)))
placed = []       # every blossom's position, so they don't pile up on each other
def room(p, r):
    for q, s in placed:
        if (p - q).length < (r + s) * 0.55: return False
    return True

def blossom_at(pos, normal, size, parent, kind="flower"):
    if kind == "flower":
        pet, cen = FLOWERS[rng.randrange(len(FLOWERS))]
        obs = [pet.copy(), cen.copy()]
    elif kind == "bud":
        obs = [BUDS[rng.randrange(len(BUDS))].copy()]
    else:
        obs = [LEAVES[rng.randrange(len(LEAVES))].copy()]
    holder = bpy.data.objects.new("fl", None); scene.collection.objects.link(holder)
    q = Vector((0, 0, 1)).rotation_difference(normal.normalized())
    spin = Quaternion(normal.normalized(), rng.uniform(0, TAU))
    holder.matrix_world = Matrix.Translation(pos) @ (spin @ q).to_matrix().to_4x4() @ Matrix.Scale(size, 4)
    set_parent(holder, parent)
    tint = [rng.uniform(0.9, 1.0) for _ in range(3)]
    deep = rng.random()
    if deep < 0.25: tint = [0.78, 0.86, 1.0]          # a few deeper blue
    elif deep > 0.85: tint = [1.0, 1.0, 1.0]
    for ob in obs:
        scene.collection.objects.link(ob)
        ob.parent = holder; ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.color = (*tint, 1)
    holder["flutter"] = kind != "leaf"
    return holder

def flower_group(j, jpos, parent, spread, n, size):
    """a cluster of blossoms on short stalks around a spur"""
    for _ in range(n):
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1.3, 0.2), rng.uniform(-1, 0.7))).normalized()
        L = rng.uniform(0.35, 1.0) * spread
        p = jpos + d * L
        near = max(0.0, 1 - (p - CORNER).length / 2.2)
        s = size * rng.uniform(0.72, 1.2) * (0.9 + 0.45 * near)
        if not inside(p, 0.15) or not room(p, s): continue
        toward = rng.uniform(0.35, 1.5)                       # how squarely it faces us
        facing = (d * rng.uniform(0.6, 1.4) + Vector((0, -toward, 0)) + Vector((rng.uniform(-.7, .7), rng.uniform(-.2, .3), rng.uniform(-.6, .5)))).normalized()
        roll = rng.random()
        kind = "bud" if roll < 0.09 else "flower"
        if kind == "bud": s *= 0.32
        if kind == "leaf": s *= 1.25
        if kind != "leaf": placed.append((p, s))
        cyl_between(jpos, p - d * s * 0.1, 0.0045, 0.0035, parent, M_STEM, 5, knot=False)
        blossom_at(p, facing if kind != "leaf" else d, s, parent, kind)

def grow(start, direction, n, seg, r0, r1, depth, parent, side_p, droop, flowers_from=0, size=0.075):
    pos = Vector(start); d = Vector(direction).normalized()
    j = new_joint(pos, parent, depth)
    for i in range(n):
        d = (d + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.12, 0.12), -droop + rng.uniform(-0.1, 0.1)))).normalized()
        nxt = pos + d * seg * rng.uniform(0.8, 1.15)
        t0, t1 = i / n, (i + 1) / n
        cyl_between(pos, nxt, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, j, M_BARK, knot=i > 0)
        pos = nxt
        j = new_joint(pos, j, depth + 1 + i * 0.35)
        if inside(pos, 0.2) and i >= flowers_from:
            k = max(1, int((rng.randint(3, 7)) * DENSITY))
            flower_group(j, pos, j, seg * 0.55, k, size)
            # blossoms along the segment too
            mid = pos - d * seg * 0.5
            flower_group(j, mid, j, seg * 0.45, max(1, int(rng.randint(1, 4) * DENSITY)), size * 0.95)
        if depth < 3 and rng.random() < side_p and i < n - 1:
            ang = rng.choice([-1, 1]) * rng.uniform(0.5, 1.1)
            sd = (Matrix.Rotation(ang, 3, "Y") @ d + Vector((0, rng.uniform(-0.4, 0.3), -0.25))).normalized()
            grow(pos, sd, rng.randint(2, 4) if depth < 2 else rng.randint(1, 2), seg * 0.7, (r0 + (r1 - r0) * t1) * 0.7, 0.004,
                 depth + 1, j, side_p * 0.55, droop * 1.25, 0, size * 0.95)
    return pos

if SHAPE == "corner":        # bursts in from the top-left corner and spills down and across
    grow((-1.45, 0.05, 1.3), (1, 0, -0.45), 8, 0.24, 0.035, 0.008, 0, None, 0.75, 0.08)
    grow((-1.35, -0.1, 0.55), (1, 0, -0.2), 5, 0.2, 0.022, 0.006, 1, None, 0.6, 0.1)
    grow((-0.55, 0.15, 1.35), (0.25, 0, -1), 5, 0.2, 0.02, 0.006, 1, None, 0.55, 0.05)
    grow((0.2, 0.2, 1.35), (0.5, 0, -1), 3, 0.2, 0.016, 0.005, 1, None, 0.5, 0.05)
elif SHAPE == "hang":        # hangs from the top edge in long sprays
    for x in (-0.9, -0.35, 0.25, 0.8):
        grow((x + rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.2), 1.3), (rng.uniform(-0.3, 0.3), 0, -1), 6, 0.2, 0.024, 0.006, 1, None, 0.6, 0.02)
elif SHAPE == "rise":        # climbs in from the bottom-left corner and arcs up and over
    grow((-1.45, 0.05, -1.35), (1, 0, 0.9), 8, 0.24, 0.034, 0.008, 0, None, 0.75, -0.06)
    grow((-1.4, -0.1, -0.7), (1, 0, 0.5), 5, 0.2, 0.022, 0.006, 1, None, 0.6, -0.04)
    grow((-0.6, 0.15, -1.4), (0.3, 0, 1), 5, 0.2, 0.02, 0.006, 1, None, 0.55, -0.02)
else:                        # reaches in from the left edge
    grow((-1.4, 0.05, 0.3), (1, 0, 0.15), 7, 0.24, 0.032, 0.007, 0, None, 0.8, 0.05)
    grow((-1.4, -0.1, -0.5), (1, 0, 0.35), 5, 0.22, 0.024, 0.006, 1, None, 0.6, 0.06)
    grow((-1.4, 0.15, 0.95), (1, 0, -0.2), 5, 0.2, 0.02, 0.006, 1, None, 0.6, 0.08)

# ------------------------------------------------------------------ the breeze
def add_driver(ob, idx, expr):
    fc = ob.driver_add("rotation_euler", idx)
    fc.driver.type = "SCRIPTED"
    fc.driver.expression = expr

F = FRAMES
for e, depth in joints:
    a = 0.0078 * (1 + depth) ** 0.9
    for axis in (0, 1, 2):
        terms = []
        for k in (1, 2, 3):
            amp = a * rng.uniform(0.3, 1.0) / k ** 0.7 * (0.55 if axis == 2 else (1.0 if axis == 1 else 0.7))
            ph = rng.uniform(0, TAU)
            terms.append(f"{amp:.5f}*sin(2*pi*{k}*frame/{F}+{ph:.3f})")
        add_driver(e, axis, "+".join(terms))
for ob in list(scene.collection.objects):
    if ob.get("flutter"):
        base = ob.rotation_euler.copy()
        for axis in (0, 1):
            k = rng.choice((2, 3, 4)); amp = rng.uniform(0.02, 0.06); ph = rng.uniform(0, TAU)
            add_driver(ob, axis, f"{base[axis]:.5f}+{amp:.4f}*sin(2*pi*{k}*frame/{F}+{ph:.3f})")

print("BUILD %.1fs" % (time.time() - T0)); T1 = time.time()
print("BLOSSOMS", len([o for o in scene.collection.objects if o.name.startswith("fl")]), "JOINTS", len(joints))

# ------------------------------------------------------------------ render
os.makedirs(OUT, exist_ok=True)
if STILL >= 0:
    scene.frame_set(STILL)
    scene.render.filepath = os.path.join(OUT, f"still_{SEED}_{STILL:04d}.png")
    bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath = os.path.join(OUT, "f_")
    bpy.ops.render.render(animation=True)
print("RENDER %.1fs" % (time.time() - T1))
print("DONE")
