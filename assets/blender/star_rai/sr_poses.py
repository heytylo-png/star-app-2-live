"""Author Star Rai's pose set on the Rigify control rig as one-frame actions: Idle, Wave, Peace, Point.
Arms are posed in FK by aiming each bone at a target world direction (plus a palm-facing twist for the
hand); fingers curl per joint about their local X (negative = toward the palm). She faces -Y."""
import bpy, json, math
from mathutils import Matrix, Vector

rig = bpy.data.objects["RIG_StarRai"]; P = rig.pose.bones; vl = bpy.context.view_layer
for s in "LR": P[f"upper_arm_parent.{s}"]["IK_FK"] = 1.0
ARM = ["upper_arm_fk", "forearm_fk", "hand_fk"]
FINGERS = ["thumb", "f_index", "f_middle", "f_ring", "f_pinky"]
rig.animation_data_create()

def reset_all():
    for pb in P:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    vl.update()

def aim(name, direction, palm=None):
    """Rotate pose bone so its Y axis points along `direction` (world); optionally twist so the palm
    (rest palm normal is world -Z) faces `palm`."""
    pb = P[name]; pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); vl.update()
    m0 = pb.matrix.copy(); h = m0.translation.copy(); d0 = Vector(m0.col[1][:3]).normalized()
    t = Vector(direction).normalized(); R = d0.rotation_difference(t).to_matrix()
    if palm is not None:
        cur = R @ (m0.to_3x3() @ (m0.to_3x3().inverted() @ Vector((0, 0, -1))))
        cur = (cur - cur.project(t)).normalized(); want = Vector(palm); want = (want - want.project(t)).normalized()
        ang = cur.angle(want, 0.0); sgn = 1 if cur.cross(want).dot(t) > 0 else -1
        R = Matrix.Rotation(sgn * ang, 3, t) @ R
    pb.matrix = Matrix.Translation(h) @ R.to_4x4() @ Matrix.Translation(-h) @ m0; vl.update()

def curl(side, finger, angles, spread=0.0):
    for i, a in enumerate(angles):
        pb = P[f"{finger}.0{i + 1}.{side}"]; pb.rotation_mode = "XYZ"
        pb.rotation_euler = (math.radians(a), 0, math.radians(spread) if i == 0 else 0)
    vl.update()

RELAX = {"thumb": (-5, -10, -10), "f_index": (-10, -20, -15), "f_middle": (-14, -24, -18),
         "f_ring": (-18, -28, -20), "f_pinky": (-22, -30, -22)}
FIST = {"thumb": (-25, -35, -30), "f_index": (-80, -95, -60), "f_middle": (-85, -95, -60),
        "f_ring": (-85, -95, -60), "f_pinky": (-85, -95, -60)}
OPEN = {"thumb": (0, 0, 0), "f_index": (0, 0, 0), "f_middle": (0, 0, 0), "f_ring": (0, 0, 0), "f_pinky": (0, 0, 0)}

def arm_idle(side):
    sx = 1 if side == "L" else -1
    aim(f"upper_arm_fk.{side}", (sx * 0.22, 0.04, -1))
    aim(f"forearm_fk.{side}", (sx * 0.12, -0.12, -1))
    aim(f"hand_fk.{side}", (sx * 0.08, -0.06, -1), palm=(-sx, 0.1, 0))      # palm toward the thigh
    for f, a in RELAX.items(): curl(side, f, a)

def key_all(frame=1):
    for pb in P:
        if pb.name.startswith(("DEF-", "ORG-", "MCH-")): continue
        if pb.rotation_mode == "QUATERNION": pb.keyframe_insert("rotation_quaternion", frame=frame)
        else: pb.keyframe_insert("rotation_euler", frame=frame)
        pb.keyframe_insert("location", frame=frame)

def new_pose(name):
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name); act.use_fake_user = True; rig.animation_data.action = act
    reset_all(); return act

POSES = {}
def pose_idle():
    arm_idle("L"); arm_idle("R")
def pose_wave():
    arm_idle("L")
    aim("upper_arm_fk.R", (-1, 0.05, 0.30))
    aim("forearm_fk.R", (-0.18, -0.10, 1))
    aim("hand_fk.R", (-0.10, -0.05, 1), palm=(0, -1, 0))                     # palm to camera
    for f, a in OPEN.items(): curl("R", f, a, spread={"f_index": 6, "f_ring": -5, "f_pinky": -10}.get(f, 0))
def pose_peace():
    arm_idle("L")
    aim("upper_arm_fk.R", (-0.42, -0.30, -0.86))
    aim("forearm_fk.R", (0.30, -0.45, 0.84))
    aim("hand_fk.R", (0.05, -0.15, 1), palm=(0, -1, 0))
    for f, a in FIST.items(): curl("R", f, a)
    curl("R", "f_index", (0, 0, 0), spread=8); curl("R", "f_middle", (0, 0, 0), spread=-8)   # the V
def pose_point():
    arm_idle("L")
    aim("upper_arm_fk.R", (-0.35, -0.92, -0.18))
    aim("forearm_fk.R", (-0.12, -1, 0.0))
    aim("hand_fk.R", (-0.05, -1, 0.0), palm=(1, 0, 0))                       # thumb up, palm inward
    for f, a in FIST.items(): curl("R", f, a)
    curl("R", "f_index", (0, 0, 0))

for name, fn in (("Idle", pose_idle), ("Wave", pose_wave), ("Peace", pose_peace), ("Point", pose_point)):
    new_pose(name); fn(); key_all(1)
    tip = rig.matrix_world @ P["DEF-f_index.03.R"].tail; wrist = rig.matrix_world @ P["DEF-hand.R"].head
    POSES[name] = {"right_wrist": [round(v, 3) for v in wrist], "right_index_tip": [round(v, 3) for v in tip]}
rig.animation_data.action = bpy.data.actions["Idle"]
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(POSES))
