#!/usr/bin/env python3
"""L1 repro step 5: compare generated outputs vs committed study outputs per COMPARISON_CRITERIA_FROZEN.md (tolerances frozen before use).
usage: step5_compare.py <committed_study_dir> <run_outputs_dir> <out_json> [<label>]
Also usable for run1-vs-run2 determinism (pass run1 outputs as 'committed' and label 'determinism').  Read-only on inputs."""
import sys, os, json, csv, hashlib, math
ATOL = 1e-9; RTOL = 1e-9          # FROZEN
ENV_KEYS = {"time_local", "mtime_ns"}   # FROZEN environment-dependent fields
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
study, runout, outp = sys.argv[1:4]; label = sys.argv[4] if len(sys.argv) > 4 else "vs_committed"
ref_out = study if label == "determinism" else os.path.join(study, "outputs")
def isnum(x):
    try: float(x); return True
    except Exception: return False
class Acc:
    def __init__(s): s.diffs = []; s.maxabs = 0.0; s.maxrel = 0.0; s.ncmp = 0; s.nfloat_diff_tol = 0
    def flt(s, loc, a, b):
        s.ncmp += 1
        if a == b: return
        if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b): return
        d = abs(a - b); rel = d / max(abs(a), abs(b), 1e-300)
        s.maxabs = max(s.maxabs, d); s.maxrel = max(s.maxrel, rel)
        if d > ATOL + RTOL * max(abs(a), abs(b)): s.diffs.append((loc, a, b, d))
        else: s.nfloat_diff_tol += 1
    def exact(s, loc, a, b):
        s.ncmp += 1
        if a != b: s.diffs.append((loc, a, b, None))
def cmp_json(a, b, acc, loc="", skip_env=False):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            if skip_env and k in ENV_KEYS: continue
            if k not in a or k not in b: acc.exact(f"{loc}/{k}", a.get(k, "<missing>"), b.get(k, "<missing>")); continue
            cmp_json(a[k], b[k], acc, f"{loc}/{k}", skip_env)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): acc.exact(f"{loc}#len", len(a), len(b)); return
        for i, (x, y) in enumerate(zip(a, b)): cmp_json(x, y, acc, f"{loc}[{i}]", skip_env)
    elif isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str) or isinstance(b, str):
        acc.exact(loc, a, b)
    elif isinstance(a, int) and isinstance(b, int): acc.exact(loc, a, b)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)): acc.flt(loc, float(a), float(b))
    else: acc.exact(loc, repr(a), repr(b))
def cmp_csv(pa, pb, acc):
    A = list(csv.reader(open(pa, newline=""))); B = list(csv.reader(open(pb, newline="")))
    acc.exact("#rows", len(A), len(B))
    if A and B: acc.exact("#header", A[0], B[0])
    for i, (ra, rb) in enumerate(zip(A, B)):
        if len(ra) != len(rb): acc.exact(f"row{i}#cols", len(ra), len(rb)); continue
        for j, (x, y) in enumerate(zip(ra, rb)):
            if isnum(x) and isnum(y) and x.strip() not in ("True", "False") and not (x in ("nan", "inf") or y in ("nan", "inf")):
                if x == y: acc.ncmp += 1
                else:
                    fx, fy = float(x), float(y)
                    # integer-looking on both sides must be exactly equal
                    if x.lstrip("-").isdigit() and y.lstrip("-").isdigit(): acc.exact(f"row{i}.col{j}({A[0][j] if A else ''})", x, y)
                    else: acc.flt(f"row{i}.col{j}({A[0][j] if A else ''})", fx, fy)
            else: acc.exact(f"row{i}.col{j}({A[0][j] if A else ''})", x, y)
rows = []
mf = {}
if label != "determinism":
    for ln in open(os.path.join(study, "MANIFEST.sha256")):
        p = ln.split()
        if len(p) >= 4 and p[3] == "INCLUDED" and p[2].startswith("outputs/"): mf[p[2][len("outputs/"):]] = (p[0], int(p[1]))
else:
    for f in sorted(os.listdir(ref_out)): mf[f] = (sha(os.path.join(ref_out, f)), os.path.getsize(os.path.join(ref_out, f)))
NOT_PIPELINE = {"hash_prior_snapshot_comparison.json"}
for name in sorted(mf):
    exp_sha, exp_sz = mf[name]; ref = os.path.join(ref_out, name); gen = os.path.join(runout, name)
    r = dict(file=name, committed_sha256=exp_sha, committed_bytes=exp_sz)
    if name in NOT_PIPELINE and label != "determinism":
        r.update(status="NOT VERIFIABLE", reason="not produced by any study script (manual snapshot at original task start); frozen criteria: not compared"); rows.append(r); continue
    if not os.path.exists(gen): r.update(status="FAIL", reason="MISSING in rerun output"); rows.append(r); continue
    g = sha(gen); r.update(generated_sha256=g, generated_bytes=os.path.getsize(gen), byte_identical=(g == exp_sha and os.path.getsize(gen) == exp_sz))
    # integrity of the reference in the checkout
    if label != "determinism": r["committed_file_matches_manifest"] = (sha(ref) == exp_sha)
    if r["byte_identical"]: r.update(status="PASS", tier="byte-identical", maxabs=0.0)
    else:
        acc = Acc(); env = name.startswith("hash_verification_")
        if name.endswith(".json"): cmp_json(json.load(open(ref)), json.load(open(gen)), acc, "", skip_env=env)
        elif name.endswith(".csv"): cmp_csv(ref, gen, acc)
        else: acc.exact("bytes", sha(ref), sha(gen))
        r.update(n_compared=acc.ncmp, n_float_diffs_within_tol=acc.nfloat_diff_tol, max_abs_diff_float=acc.maxabs, max_rel_diff_float=acc.maxrel,
                 n_diffs_above_tol=len(acc.diffs), diffs=[dict(loc=d[0], committed=d[1], generated=d[2], absdiff=d[3]) for d in acc.diffs][:200])
        big = max([d[3] for d in acc.diffs if d[3] is not None] + [0.0])
        r["max_abs_diff_above_tol"] = big
        r["bucket"] = "none" if not acc.diffs else ("<=1e-6" if big <= 1e-6 and all(d[3] is not None for d in acc.diffs) else "<=1e-4" if big <= 1e-4 and all(d[3] is not None for d in acc.diffs) else ">1e-4 or non-numeric")
        if env: r["note"] = "environment-dependent keys time_local/mtime_ns excluded per frozen criteria"
        if not acc.diffs: r.update(status="PASS", tier="numeric within frozen tolerance (or env-excluded fields only)")
        else: r.update(status="FAIL", tier="above frozen tolerance")
    rows.append(r)
extra = sorted(set(os.listdir(runout)) - set(mf))
res = dict(label=label, tolerance=dict(ATOL=ATOL, RTOL=RTOL, env_keys=sorted(ENV_KEYS)), n_files=len(rows),
           n_pass=sum(r["status"] == "PASS" for r in rows), n_pass_byte=sum(r.get("tier") == "byte-identical" for r in rows),
           n_fail=sum(r["status"] == "FAIL" for r in rows), n_not_verifiable=sum(r["status"] == "NOT VERIFIABLE" for r in rows),
           extra_outputs_not_in_manifest=extra, files=rows)
json.dump(res, open(outp, "w"), indent=1)
print(label, "files", res["n_files"], "PASS", res["n_pass"], "(byte", res["n_pass_byte"], ") FAIL", res["n_fail"], "NV", res["n_not_verifiable"], "extra", extra)
for r in rows:
    if r["status"] != "PASS" or r.get("tier") != "byte-identical":
        print(" ", r["status"], r["file"], r.get("tier", r.get("reason")), r.get("n_diffs_above_tol"), r.get("max_abs_diff_above_tol"), r.get("bucket"))
