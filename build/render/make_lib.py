# import the robot models once and keep them in a .blend beside this script, so terrace.py can link them in quickly:
#   blender -b --factory-startup -P make_lib.py
# The quadruped, rover and arm come from the robot models folder (OUT); the orange tracked cleaner is the model that
# used to be assets/models/janyu-tech-bot.glb (get it back with: git show e8e01cf:assets/models/janyu-tech-bot.glb > janyu-tech-bot.glb)
import bpy, os, time
T0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("ROBOT_MODELS", "/Users/subhodeepsarkar/Documents/Codex/2026-09-26/make/outputs")
for name, f in (("quad", f"{OUT}/quadruped_robot.glb"), ("rover", f"{OUT}/defence_rover.glb"), ("arm", f"{OUT}/robot_arm.glb"), ("cleaner", f"{HERE}/janyu-tech-bot.glb")):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    for o in new:
        for c in o.users_collection: c.objects.unlink(o)
        coll.objects.link(o)
    print("IMPORTED", name, round(time.time() - T0, 1))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "robots.blend"), compress=True)
print("SAVED", round(time.time() - T0, 1))
