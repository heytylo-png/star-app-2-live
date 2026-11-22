"""Author Idle / Walk / Run / Attack on the Rigify control rig RIG_Knight (30 fps, knight faces -Y).
Walk/Run travel forward (-Y) on the torso with IK feet planted in world space, so the bake can move
that travel onto the game skeleton's root bone (root motion). Idle/Attack stay in place.
Every frame is keyed from procedural pose parameters; loops repeat their first pose on the last frame."""
import bpy, json, math
from mathutils import Matrix, Vector, Quaternion

sc = bpy.context.scene; sc.render.fps = 30; vl = bpy.context.view_layer
rig = bpy.data.objects["RIG_Knight"]; P = rig.pose.bones
for side in "LR":
    P[f"upper_arm_parent.{side}"]["IK_FK"] = 1.0           # arms in FK; legs stay IK (planted feet)
BONES = ["torso", "hips", "chest", "neck", "head", "foot_ik.L", "foot_ik.R",
         "upper_arm_fk.L", "forearm_fk.L", "upper_arm_fk.R", "forearm_fk.R"]
for n in BONES: P[n].rotation_mode = "QUATERNION"
rig.animation_data_create()
REST_FOOT_Z = P["foot_ik.L"].bone.head_local.z
FX = 0.16                                                   # foot spacing from centre (narrower than the T-pose stance)

def R(axis, deg): return Matrix.Rotation(math.radians(deg), 3, axis)
def ease(s): return s * s * (3 - 2 * s)

def place(n, f, rot=None, d=None, pos=None):
    pb = P[n]; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); vl.update()
    m0 = pb.matrix.copy(); h = m0.translation.copy()
    tgt = pos if pos is not None else h + (d if d is not None else Vector())
    pb.matrix = Matrix.Translation(tgt) @ (rot or Matrix.Identity(3)).to_4x4() @ Matrix.Translation(-h) @ m0
    vl.update()
    pb.keyframe_insert("location", frame=f); pb.keyframe_insert("rotation_quaternion", frame=f)

def arm_rot(side, lower, swing=0.0, yaw=0.0):
    """lower: degrees from T-pose toward the hip; swing: + back / - forward; yaw: + toward front (about Z)."""
    s = 1 if side == "L" else -1
    return R("Z", -s * yaw) @ R("X", swing) @ R("Y", s * lower)

def bend_axis(side, rot): return rot @ Vector((0, 0, -1 if side == "L" else 1))

def pose(f, torso_d=Vector(), torso_rot=None, hips_rot=None, chest_rot=None, head_rot=None,
         feet=None, arms=None):
    place("torso", f, rot=torso_rot, d=torso_d)
    place("hips", f, rot=hips_rot); place("chest", f, rot=chest_rot)
    place("neck", f); place("head", f, rot=head_rot)
    for side, (p, pitch) in feet.items():
        place(f"foot_ik.{side}", f, rot=R("X", pitch), pos=p)
    for side, (rot, elbow) in arms.items():
        place(f"upper_arm_fk.{side}", f, rot=rot)
        place(f"forearm_fk.{side}", f, rot=Matrix.Rotation(math.radians(elbow), 3, bend_axis(side, rot)))

def stand_feet(): return {s: (Vector((FX * (1 if s == "L" else -1), 0.01, REST_FOOT_Z)), 0.0) for s in "LR"}

def new_clip(name):
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name); act.use_fake_user = True
    rig.animation_data.action = act
    return act

def foot_cycle(u, D, c, H, x, off=0.0):
    """World foot position for unwrapped gait phase u (contact at integer u). Stance fraction c."""
    k = math.floor(u); p = u - k
    plant = lambda kk: -D * (kk + off + c / 2)   # torso is at -D*(k+off) when this foot touches down
    if p < c:
        return Vector((x, plant(k), REST_FOOT_Z)), 0.0
    s = (p - c) / (1 - c); e = ease(s)
    y = plant(k) + (plant(k + 1) - plant(k)) * e
    lift = math.sin(math.pi * s) ** 2                          # zero vertical speed at lift-off and landing
    pitch = 14.0 * math.sin(2 * math.pi * s) * math.sin(math.pi * s)   # toe-down push, toe-up reach, soft land
    return Vector((x, y, REST_FOOT_Z + H * lift)), pitch

def gait(name, N, D, c, H, bob0, bob, lean, swing, elbow, elbow_gain, hip_yaw, hip_roll):
    act = new_clip(name)
    for i in range(N + 1):
        f = 1 + i; t = i / N; w = 2 * math.pi * t
        z = bob0 - bob * math.cos(2 * w - 2 * math.pi * c / 2)      # lowest at mid-stance of each foot
        feet = {"L": foot_cycle(t, D, c, H, FX), "R": foot_cycle(t - 0.5, D, c, H, -FX, off=0.5)}
        armL = arm_rot("L", 75, swing * math.cos(w)); armR = arm_rot("R", 75, -swing * math.cos(w))
        pose(f, torso_d=Vector((0, -D * t, z)), torso_rot=R("X", lean),
             hips_rot=R("Z", -hip_yaw * math.cos(w)) @ R("Y", -hip_roll * math.sin(w)),
             chest_rot=R("Z", 0.6 * hip_yaw * math.cos(w)), head_rot=R("Z", -0.3 * hip_yaw * math.cos(w)),
             feet=feet,
             arms={"L": (armL, elbow + elbow_gain * max(0, -math.cos(w))),
                   "R": (armR, elbow + elbow_gain * max(0, math.cos(w)))})
    act.use_cyclic = True
    return {"clip": name, "frames": [1, N + 1], "travel_m": D, "speed_mps": round(D * sc.render.fps / N, 2)}

def idle(N=60):
    act = new_clip("Idle")
    for i in range(N + 1):
        f = 1 + i; w = 2 * math.pi * i / N
        pose(f, torso_d=Vector((0, 0, -0.02 + 0.008 * math.sin(w))), chest_rot=R("X", -1.5 * math.sin(w)),
             head_rot=R("Z", 3 * math.sin(w + 0.8)) @ R("X", 1.5 * math.sin(w)), feet=stand_feet(),
             arms={s: (arm_rot(s, 72 + 2 * math.sin(w)), 14 + 3 * math.sin(w)) for s in "LR"})
    act.use_cyclic = True
    return {"clip": "Idle", "frames": [1, N + 1]}

def track(keys, f):
    """Eased interpolation through (frame, value) keys; values are floats or Quaternions."""
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            s = ease((f - f0) / (f1 - f0))
            return v0.slerp(v1, s) if isinstance(v0, Quaternion) else v0 + (v1 - v0) * s
    return keys[-1][1]

def attack(N=36):
    act = new_clip("Attack")
    Q = lambda m: m.to_quaternion()
    rest_R, rest_L = Q(arm_rot("R", 72)), Q(arm_rot("L", 72))
    wind_R = Q(arm_rot("R", 55, swing=45))                       # pulled back
    hit_R = Q(arm_rot("R", 0, yaw=90) @ Matrix.Identity(3))     # straight out in front at shoulder height
    guard_L = Q(arm_rot("L", 65, swing=-35))
    K = [1, 11, 16, 21, N + 1]                                   # idle, wind-up, strike, hold, recover
    yaw = list(zip(K, [0, -16, 18, 15, 0])); chest = list(zip(K, [0, -8, 10, 8, 0]))
    dz = list(zip(K, [-0.02, -0.04, -0.07, -0.065, -0.02])); lean = list(zip(K, [0, -3, 9, 7, 0]))
    armR = list(zip(K, [rest_R, wind_R, hit_R, hit_R, rest_R])); elR = list(zip(K, [14, 105, 4, 8, 14]))
    armL = list(zip(K, [rest_L, guard_L, guard_L, guard_L, rest_L])); elL = list(zip(K, [14, 95, 95, 90, 14]))
    for f in range(1, N + 2):
        pose(f, torso_d=Vector((0, 0, track(dz, f))), torso_rot=R("Z", track(yaw, f)) @ R("X", track(lean, f)),
             chest_rot=R("Z", track(chest, f)), head_rot=R("Z", -0.5 * track(yaw, f)), feet=stand_feet(),
             arms={"R": (track(armR, f).to_matrix(), track(elR, f)), "L": (track(armL, f).to_matrix(), track(elL, f))})
    return {"clip": "Attack", "frames": [1, N + 1]}

out = [idle(),
       gait("Walk", N=32, D=1.10, c=0.60, H=0.11, bob0=-0.085, bob=0.02, lean=3, swing=20, elbow=18,
            elbow_gain=10, hip_yaw=5, hip_roll=3),
       gait("Run", N=20, D=1.90, c=0.35, H=0.24, bob0=-0.13, bob=0.035, lean=11, swing=38, elbow=80,
            elbow_gain=15, hip_yaw=8, hip_roll=4),
       attack()]
rig.animation_data.action = bpy.data.actions["Idle"]; sc.frame_start, sc.frame_end = 1, 61
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(out))
