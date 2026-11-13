#!/usr/bin/env python3
"""v10 shoulder range v1 (Issue #177): first-contact swing angle of the printed arm about the shoulder, 24 directions.
Implements research/issue-177/v10_shoulder_range_v1/METHOD_AND_CRITERIA_FROZEN.md. Reuses the loader, part map and
sampling of part_clearance_a2.py @ 9247164 unchanged. Read-only on all inputs.
Usage: python3 -I shoulder_range.py PRINT.stl V10.json LIMITED_POSE.json PART_CLEARANCE_SCRIPTS_DIR OUT.json
"""
import hashlib, json, math, sys
import numpy as np
from scipy.spatial import cKDTree
stl, v10p, posep, sdir, outj = sys.argv[1:6]; sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
src = open(f"{sdir}/part_clearance_a2.py").read().split("TREES = [cKDTree")[0]
sys.argv = ["pc", stl, v10p, posep, sdir, "/dev/null"]; ns = {"__name__": "pc"}; exec(compile(src, "pc", "exec"), ns)
SAMP, PART, B, H0, T0, H = ns["SAMP"], ns["PART"], ns["B"], ns["H0"], ns["T0"], ns["H"]
names = [PART[i][0] for i in range(36)]; idx = {n: i for i, n in enumerate(names)}
STEP, TMAX, NDIR, UB = 2.5, 180.0, 24, 5.0
README = {"left": 1.750, "right": 2.199}
def unit(v): return v / np.linalg.norm(v)
def rod(ax, ang):
    a = unit(ax); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]]); return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
out = dict(method_sha256="d2e9a1d3de6ed723f76b93f2cff30d1588bb6350a07668e2630e357dfffcbed6", inputs=dict(stl_sha256=sha(stl), v10_json_sha256=sha(v10p), pose_sha256=sha(posep)),
           h=H, step_deg=STEP, directions=NDIR, samples_total=int(sum(len(s) for s in SAMP)), sides={})
frame = {}
for side, sx in (("left", -1.0), ("right", 1.0)):
    J = H0[f"upper_arm_{side}"]; u = unit(T0[f"upper_arm_{side}"] - J); f = np.array([0, 1.0, 0]); f = unit(f - (f @ u) * u); o = unit(np.cross(u, f))
    if o[0] * sx < 0: o = -o
    frame[side] = (J, u, f, o)
    groups = {"arm_only": [f"upper_arm_{side}", f"elbow_marker_{side}"],
              "straight_arm": [f"upper_arm_{side}", f"elbow_marker_{side}", f"forearm_{side}", f"wrist_marker_{side}", f"hand_{side}"]}
    res_side = {}
    for gname, moving in groups.items():
        fixed = [n for n in names if n not in moving and n != f"shoulder_marker_{side}"]
        FP = np.concatenate([SAMP[idx[n]] for n in fixed]); lab = np.concatenate([np.full(len(SAMP[idx[n]]), idx[n]) for n in fixed]); tree = cKDTree(FP)
        MP = np.concatenate([SAMP[idx[n]] for n in moving]) - J
        def clear(R):
            # Speed only, result identical: a 1-in-64 subsample gives an upper bound b on the minimum distance;
            # the full query then uses bound b (points farther than b cannot be the minimum).
            X = MP @ R.T + J; d0, _ = tree.query(X[::64], k=1, distance_upper_bound=UB, workers=-1)
            b = float(d0.min()); b = UB if not np.isfinite(b) else b * (1 + 1e-9) + 1e-9
            d, i = tree.query(X, k=1, distance_upper_bound=b, workers=-1)
            k = int(np.argmin(d)); return (float(d[k]) - H, names[lab[i[k]]]) if np.isfinite(d[k]) else (UB, None)
        rest = clear(np.eye(3)); rows = []
        for q in range(NDIR):
            phi = 360.0 * q / NDIR; m = math.cos(math.radians(phi)) * f + math.sin(math.radians(phi)) * o; ax = np.cross(u, m)
            last_ok = 0.0; mn = rest[0]; blocker = None; hit = None; th = STEP
            while th <= TMAX + 1e-9:
                c, who = clear(rod(ax, math.radians(th)))
                if c <= 0: blocker, hit = who, th; break
                last_ok = th; mn = min(mn, c); th += STEP
            rows.append(dict(phi=phi, first_contact_deg=last_ok, reaches_180=hit is None, limiting_part=blocker, min_clearance_in_clear_range_mm=round(mn, 3)))
            print(side, gname, phi, last_ok, blocker, flush=True)
        res_side[gname] = dict(rest_clearance_mm=round(rest[0], 3), rest_nearest_part=rest[1], rest_d_s_mm=round(rest[0] + H, 3), moving_samples=int(len(MP)), fixed_samples=int(len(FP)), directions=rows)
    out["sides"][side] = res_side
# validity
s0 = {s: dict(clear_at_rest=all(out["sides"][s][g]["rest_clearance_mm"] > 0 for g in ("arm_only", "straight_arm")), arm_only_d_s=out["sides"][s]["arm_only"]["rest_d_s_mm"], readme=README[s],
              nearest=out["sides"][s]["arm_only"]["rest_nearest_part"], ok=abs(out["sides"][s]["arm_only"]["rest_d_s_mm"] - README[s]) <= 0.30) for s in ("left", "right")}
out["S0"] = dict(rows=s0, result="PASS" if all(v["clear_at_rest"] and v["ok"] for v in s0.values()) else "FAIL")
add = {s: [r for r in out["sides"][s]["arm_only"]["directions"] if r["phi"] == 270.0][0]["first_contact_deg"] for s in ("left", "right")}
out["S1"] = dict(adduction_first_contact_deg=add, result="PASS" if all(v < 15 for v in add.values()) else "FAIL")
# wave comparison (information only)
P = json.load(open(posep))["main"]; wave = {}
for side in ("left", "right"):
    J, u, f, o = frame[side]; tab = [r["first_contact_deg"] for r in out["sides"][side]["arm_only"]["directions"]]; rows = []
    for fr in P:
        Rr = np.array(fr["Q"]["upper_chest"]).T @ np.array(fr["Q"][f"upper_arm_{side}"]); v = Rr @ u
        th = math.degrees(math.acos(max(-1.0, min(1.0, float(u @ v))))); phi = math.degrees(math.atan2(float(v @ o), float(v @ f))) % 360.0
        x = phi / (360.0 / NDIR); i0 = int(math.floor(x)) % NDIR; w = x - math.floor(x); lim = (1 - w) * tab[i0] + w * tab[(i0 + 1) % NDIR]
        rows.append(dict(t=fr["t"], swing_deg=round(th, 2), phi_deg=round(phi, 1), arm_only_limit_deg=round(lim, 2), margin_deg=round(lim - th, 2)))
    wave[side] = dict(max_swing_deg=max(r["swing_deg"] for r in rows), min_margin_deg=min(r["margin_deg"] for r in rows), keys_within_5deg_or_beyond=int(sum(r["margin_deg"] < 5 for r in rows)),
                      keys_beyond=int(sum(r["margin_deg"] < 0 for r in rows)), per_key=rows)
out["limited_wave_shoulders"] = wave
json.dump(out, open(outj, "w"), indent=1, sort_keys=True)
print(json.dumps(dict(S0=out["S0"], S1=out["S1"], wave={s: {k: v for k, v in wave[s].items() if k != "per_key"} for s in wave})))
