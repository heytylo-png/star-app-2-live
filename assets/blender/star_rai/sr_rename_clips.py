"""Baked clips get engine-friendly names (GAME_RIG_StarRai|Wave -> Wave); control-rig sources -> CTRL_*."""
import bpy, json, sys
clips = sys.argv[sys.argv.index("--")+1].split(",")
for c in clips: bpy.data.actions[c].name = f"CTRL_{c}"
for c in clips: bpy.data.actions[f"GAME_RIG_StarRai|{c}"].name = c
g = bpy.data.objects["GAME_RIG_StarRai"]
for tr in g.animation_data.nla_tracks:
    for s in tr.strips:
        if s.action: s.name = s.action.name
    if tr.strips: tr.name = tr.strips[0].action.name
g.animation_data.action = None
for pb in g.pose.bones:            # baking leaves the last baked pose in the bones; return to rest
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps({"nla": [t.name for t in g.animation_data.nla_tracks]}))
