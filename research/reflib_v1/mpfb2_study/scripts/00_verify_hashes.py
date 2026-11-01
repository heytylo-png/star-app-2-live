"""Read-only hash verification.  usage: 00_verify_hashes.py before|after
 - the 10 approved MPFB2 files (sha256 + git blob sha1 vs MANIFEST_sha256_blobsha1.txt, size, permission bits, mtime)
 - the MANIFEST file itself (expected sha256 93d2801e...)
 - protected Star Rai assets listed in protected_paths.txt (sha256, size, mtime_ns) - compared between 'before' and 'after'."""
import sys, os, stat, json, datetime
sys.path.insert(0, os.path.dirname(__file__))
from common import *
mode = sys.argv[1]
man = os.path.join(ROOT, "MANIFEST_sha256_blobsha1.txt")
MAN_SHA = "93d2801e1191a3f8328c3ae5520acb1db35bbc315888825b7c4ba3973a6ac9c3"
res = dict(mode=mode, time_local=datetime.datetime.now().astimezone().isoformat(timespec="seconds"), inputs=[], protected=[])
res["manifest_file"] = dict(sha256=sha256(man), expected=MAN_SHA, ok=sha256(man) == MAN_SHA)
for ln in open(man):
    p = ln.split()
    if len(p) >= 5 and p[3] == "OK":
        sh, size, blob, _, rel = p[0], int(p[1]), p[2], p[3], p[4]
        fp = os.path.join(ROOT, rel); st = os.stat(fp)
        s, b = sha256(fp), git_blob_sha1(fp)
        res["inputs"].append(dict(path=rel, size=st.st_size, size_ok=st.st_size == size, sha256=s, sha256_ok=s == sh, blob_sha1=b, blob_sha1_ok=b == blob,
                                  mode=oct(stat.S_IMODE(st.st_mode)), read_only=not (st.st_mode & 0o222), mtime_ns=st.st_mtime_ns))
res["inputs_all_ok"] = len(res["inputs"]) == 10 and all(i["size_ok"] and i["sha256_ok"] and i["blob_sha1_ok"] for i in res["inputs"])
res["total_bytes"] = sum(i["size"] for i in res["inputs"])
for line in open(os.path.join(os.path.dirname(__file__), "protected_paths.txt")):
    fp = line.strip()
    if not fp: continue
    try:
        st = os.stat(fp); res["protected"].append(dict(path=fp, size=st.st_size, sha256=sha256(fp), mtime_ns=st.st_mtime_ns))
    except FileNotFoundError:
        res["protected"].append(dict(path=fp, missing=True))
write_json(f"hash_verification_{mode}.json", res)
print(mode, "inputs_all_ok", res["inputs_all_ok"], "manifest_ok", res["manifest_file"]["ok"], "n_protected", len(res["protected"]))
if mode == "after":
    b = load_json(os.path.join(OUT, "hash_verification_before.json"))
    bi = {i["path"]: i for i in b["inputs"]}
    inp_unchanged = all(bi[i["path"]]["sha256"] == i["sha256"] and bi[i["path"]]["mtime_ns"] == i["mtime_ns"] for i in res["inputs"])
    bp = {i["path"]: i for i in b["protected"]}
    diffs = [i["path"] for i in res["protected"] if bp.get(i["path"], {}).get("sha256") != i.get("sha256") or bp.get(i["path"], {}).get("mtime_ns") != i.get("mtime_ns")]
    cmp = dict(inputs_unchanged_hash_and_mtime=inp_unchanged, protected_files=len(res["protected"]), protected_changed=diffs,
               prefixes_found={p: any(i.get("sha256", "").startswith(p) for i in res["protected"]) for p in ("eab1839c", "5d373125", "235767bf", "40b6ae02", "6a6ac337")})
    write_json("hash_verification_compare.json", cmp); print(json.dumps(cmp, indent=1))
