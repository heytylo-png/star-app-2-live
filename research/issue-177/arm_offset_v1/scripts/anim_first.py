#!/usr/bin/env python3
"""Write a copy of a GLB with one animation moved to index 0 (collide_v2.py screens only animations[0]).
Only the order of the JSON "animations" array changes; the binary chunk is copied unchanged.
Usage: python3 -I anim_first.py IN.glb ANIM_NAME OUT.glb
"""
import json, struct, sys
inp, name, outp = sys.argv[1:4]
b = open(inp, "rb").read(); cl = struct.unpack("<I", b[12:16])[0]
js = json.loads(b[20:20 + cl]); rest = b[20 + cl:]
an = js["animations"]; i = [k for k, a in enumerate(an) if a.get("name") == name][0]
js["animations"] = [an[i]] + an[:i] + an[i + 1:]
j = json.dumps(js, separators=(",", ":"), ensure_ascii=False).encode(); j += b" " * (-len(j) % 4)
out = b[:8] + struct.pack("<I", 12 + 8 + len(j) + len(rest)) + struct.pack("<I", len(j)) + b"JSON" + j + rest
open(outp, "wb").write(out)
