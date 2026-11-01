#!/usr/bin/env python3
"""L1 repro step 6: check the pre-declared claims (claims_frozen.json) against the REGENERATED outputs.
usage: step6_check_claims.py <claims_frozen.json> <run_outputs_dir> <out_json>"""
import sys, os, json, csv
claims = json.load(open(sys.argv[1]))["claims"]; run = sys.argv[2]; outp = sys.argv[3]
cache = {}
def load(p):
    if p not in cache: cache[p] = ("csv", list(csv.reader(open(p)))) if p.endswith(".csv") else ("json", json.load(open(p)))
    return cache[p]
def get(c, path):
    kind, d = load(os.path.join(run, os.path.basename(c["file"])))
    if path and path[0] == "@csv":
        hdr = d[0]; col = hdr.index(path[2])
        for r in d[1:]:
            if r[0] == path[1]: return float(r[col])
        raise KeyError(path)
    for k in path: d = d[k]
    return d
res = []
for c in claims:
    try:
        if c["kind"] == "sum_exact": v = sum(get(c, p) for p in c["path"])
        else: v = get(c, c["path"])
    except Exception as e:
        res.append(dict(id=c["id"], desc=c["desc"], status="NOT VERIFIABLE", reason=f"{type(e).__name__}: {e}")); continue
    q = c["quoted"]; sc = c.get("scale", 1.0)
    if c["kind"] in ("exact", "sum_exact"): ok = (v == q); shown = v
    elif c["kind"] == "round":
        shown = round(v * sc, c["decimals"]); ok = abs(shown - q) < 10 ** (-c["decimals"]) / 1000.0
    elif c["kind"] == "range": shown = v; ok = (q[0] <= v <= q[1])
    elif c["kind"] == "max_le": shown = v; ok = (v <= q)
    res.append(dict(id=c["id"], desc=c["desc"], quoted=q, regenerated_raw=v, regenerated_at_report_precision=shown, status="PASS" if ok else "FAIL"))
out = dict(n=len(res), n_pass=sum(r["status"] == "PASS" for r in res), n_fail=sum(r["status"] == "FAIL" for r in res), n_nv=sum(r["status"] == "NOT VERIFIABLE" for r in res), claims=res)
json.dump(out, open(outp, "w"), indent=1)
print(out["n"], "claims: PASS", out["n_pass"], "FAIL", out["n_fail"], "NV", out["n_nv"])
for r in res:
    if r["status"] != "PASS": print(" ", r)
