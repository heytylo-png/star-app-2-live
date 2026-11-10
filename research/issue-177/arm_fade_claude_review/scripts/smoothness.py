import sys, math, json
import numpy as np
orig, fade, cdir, gdir = sys.argv[1:5]
sys.path.insert(0, gdir)
src = open(f"{cdir}/collide_v2.py").read()
head = src.partition("\nres = dict(input=")[0]; anim_src = src[src.index("# animation\n"): src.index("frames = []")]
def lib(path, ai):
    sys.argv = ["x", path, gdir, "/dev/null"]; ns = {"__name__": "lib"}
    exec(compile(head, "h", "exec"), ns)
    exec(compile(anim_src.replace('anim = js["animations"][0]', f'anim = js["animations"][{ai}]'), "a", "exec"), ns); return ns
O, F = lib(orig, 1), lib(fade, 1); idx = O["idx"]; H = O["H"]
dt = 1/60; T = np.arange(2.4, 4.4, dt)
def series(L):
    hand = []; elb = []; R = []
    for t in T:
        G = L["world_at"](t); hand.append(G[idx["R_Hand"], :3, 3]); elb.append(G[idx["R_Forearm"], :3, 3])
        M = G[idx["R_Upperarm"], :3, :3]; U, _, Vt = np.linalg.svd(M); R.append(U @ Vt)
    return np.array(hand), np.array(elb), R
out = {}
for nm, L in (("source", O), ("fade", F)):
    h, e, R = series(L)
    vh = np.linalg.norm(np.diff(h, axis=0), axis=1) / dt / H          # hand speed, H/s
    ve = np.linalg.norm(np.diff(e, axis=0), axis=1) / dt / H          # elbow speed
    w = np.array([math.degrees(math.acos(max(-1, min(1, (np.trace(R[i].T @ R[i+1]) - 1) / 2)))) / dt for i in range(len(R) - 1)])  # upper-arm angular speed deg/s
    ah = np.abs(np.diff(vh)) / dt; aw = np.abs(np.diff(w)) / dt
    out[nm] = dict(hand_speed_max=vh.max(), elbow_speed_max=ve.max(), arm_ang_speed_max=w.max(), arm_ang_speed_t=T[w.argmax()],
                   hand_accel_max=ah.max(), arm_ang_accel_max=aw.max(), arm_ang_accel_t=T[aw.argmax()+1])
    out[nm + "_w"] = w
for k in ("source", "fade"): print(k, {a: round(float(b), 3) for a, b in out[k].items()})
ws, wf = out["source_w"], out["fade_w"]
for a, b in ((2.6, 3.1), (3.85, 4.3)):
    m = (T[:-1] >= a) & (T[:-1] <= b)
    print(f"{a}-{b}s arm deg/s  source max {ws[m].max():.0f}  fade max {wf[m].max():.0f}  ratio {wf[m].max()/ws[m].max():.2f}")
