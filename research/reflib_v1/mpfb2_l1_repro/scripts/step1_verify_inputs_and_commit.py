#!/usr/bin/env python3
"""L1 repro step 1: verify exact study commit, committed study files vs MANIFEST.sha256, and the 10 approved inputs
against BOTH the approved input manifest (MANIFEST_sha256_blobsha1.txt) and the INPUT lines of the study MANIFEST.sha256.
Read-only. usage: step1_verify_inputs_and_commit.py <repo_dir> <inputs_root> <out_json>"""
import sys, os, json, hashlib, subprocess
repo, root, outp = sys.argv[1:4]
EXPECT_COMMIT = "8513fffa818c17e98bb47edee76c11a4d678ff3b"
study = os.path.join(repo, "research/reflib_v1/mpfb2_study")
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
def blob(p):
    b = open(p, "rb").read(); return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()
res = {}
# commit identity: tree of the study dir in the checkout must equal the tree at the exact commit
def git(*a): return subprocess.check_output(["git", "-C", repo] + list(a), text=True).strip()
res["commit_exists"] = git("cat-file", "-t", EXPECT_COMMIT)
res["commit_full_sha"] = git("rev-parse", EXPECT_COMMIT)
res["study_dir_tree_at_commit"] = git("rev-parse", f"{EXPECT_COMMIT}:research/reflib_v1/mpfb2_study")
# working-copy vs commit: git diff of the study dir against the commit must be empty
res["study_dir_diff_vs_commit_empty"] = (git("diff", "--stat", EXPECT_COMMIT, "--", "research/reflib_v1/mpfb2_study") == "")
res["study_dir_untracked"] = git("ls-files", "--others", "--exclude-standard", "--", "research/reflib_v1/mpfb2_study")
# study manifest
inc, inp = [], []
for ln in open(os.path.join(study, "MANIFEST.sha256")):
    p = ln.split()
    if len(p) >= 4 and not ln.startswith("#"):
        (inc if p[3] == "INCLUDED" else inp if p[3] == "INPUT_NOT_COMMITTED" else []).append(p)
rows = []
for h, sz, path, _ in inc:
    f = os.path.join(study, path); rows.append(dict(path=path, expect_sha256=h, expect_bytes=int(sz), sha256=sha(f), bytes=os.path.getsize(f),
                                                   ok=sha(f) == h and os.path.getsize(f) == int(sz)))
res["committed_files"] = dict(n=len(rows), n_ok=sum(r["ok"] for r in rows), bad=[r for r in rows if not r["ok"]])
res["study_manifest_sha256"] = sha(os.path.join(study, "MANIFEST.sha256"))
# approved input manifest
am = {}
for ln in open(os.path.join(root, "MANIFEST_sha256_blobsha1.txt")):
    p = ln.split()
    if len(p) >= 5 and p[3] == "OK": am[p[4]] = dict(sha256=p[0], bytes=int(p[1]), blob=p[2])
sm = {p[2]: dict(sha256=p[0], bytes=int(p[1]), blob=p[4].split("=")[1]) for p in inp}
res["approved_manifest_file_sha256"] = sha(os.path.join(root, "MANIFEST_sha256_blobsha1.txt"))
irows = []
for path, e in sorted(am.items()):
    f = os.path.join(root, path)
    if not os.path.isfile(f):
        irows.append(dict(path=path, missing=True)); continue
    s, b, n = sha(f), blob(f), os.path.getsize(f)
    irows.append(dict(path=path, bytes=n, sha256=s, blob_sha1=b, approved_sha256=e["sha256"], approved_bytes=e["bytes"], approved_blob=e["blob"],
                      ok_vs_approved=(s == e["sha256"] and n == e["bytes"] and b == e["blob"]),
                      ok_vs_study_manifest=(path in sm and s == sm[path]["sha256"] and n == sm[path]["bytes"] and b == sm[path]["blob"])))
res["inputs"] = irows
res["inputs_n"] = len(irows)
res["inputs_all_ok"] = len(irows) == 10 and all(r.get("ok_vs_approved") and r.get("ok_vs_study_manifest") for r in irows)
res["inputs_total_bytes"] = sum(r.get("bytes", 0) for r in irows)
res["input_key_sets_equal"] = set(am) == set(sm)
json.dump(res, open(outp, "w"), indent=1)
print("commit", res["commit_full_sha"], "diff_empty", res["study_dir_diff_vs_commit_empty"], "committed", res["committed_files"]["n_ok"], "/", res["committed_files"]["n"],
      "inputs_all_ok", res["inputs_all_ok"], "total", res["inputs_total_bytes"])
sys.exit(0 if res["inputs_all_ok"] and res["committed_files"]["n"] == res["committed_files"]["n_ok"] else 2)
