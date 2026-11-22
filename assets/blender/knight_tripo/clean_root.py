"""Keep only forward (-Y) travel on the root for locomotion clips and zero it for in-place clips;
the hips ('spine') are re-keyed so the character's pose in the world is unchanged."""
import bpy, json
from mathutils import Matrix, Vector
g = bpy.data.objects["GAME_RIG_Knight"]; sc = bpy.context.scene; vl = bpy.context.view_layer
root, hips = g.pose.bones["root"], g.pose.bones["spine"]
MOTION = {"Walk": True, "Run": True, "Idle": False, "Attack": False}
rep = {}
for clip, moves in MOTION.items():
    act = bpy.data.actions[f"GAME_RIG_Knight|{clip}"]; g.animation_data.action = act
    f0, f1 = (int(v) for v in act.frame_range)
    samples = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f); samples.append((f, root.matrix.copy(), hips.matrix.copy()))
    y0 = samples[0][1].translation.y
    for f, mr, mh in samples:
        sc.frame_set(f)
        y = mr.translation.y if moves else y0
        root.matrix = Matrix.Translation(Vector((0.0, y, 0.0))) @ root.bone.matrix_local
        vl.update(); hips.matrix = mh; vl.update()
        root.keyframe_insert("location", frame=f); hips.keyframe_insert("location", frame=f)
    sc.frame_set(f0); a = root.matrix.translation.y; sc.frame_set(f1); b = root.matrix.translation.y
    rep[clip] = {"root_travel_y": round(b - a, 3)}
g.animation_data.action = None
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(rep))
