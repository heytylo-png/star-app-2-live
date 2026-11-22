"""Give the baked clips engine-friendly names (Idle/Walk/Run/Attack); control-rig sources become CTRL_*."""
import bpy, json
clips = ["Idle", "Walk", "Run", "Attack"]
for c in clips:
    bpy.data.actions[c].name = f"CTRL_{c}"
for c in clips:
    bpy.data.actions[f"GAME_RIG_Knight|{c}"].name = c
g = bpy.data.objects["GAME_RIG_Knight"]
for tr in g.animation_data.nla_tracks:
    for s in tr.strips:
        if s.action: s.name = s.action.name
    if tr.strips: tr.name = tr.strips[0].action.name
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps({"actions": sorted(a.name for a in bpy.data.actions),
      "nla": [(t.name, [s.action.name for s in t.strips]) for t in g.animation_data.nla_tracks]}))
