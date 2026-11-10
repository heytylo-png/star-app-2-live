"""Read-only: compare the bones in a COPY of the v10 .blend with the bones JSON (Issue #177). Nothing is saved.
Usage: blender -b COPY.blend --python blend_vs_json.py -- V10_BONES.json OUT.json"""
import bpy, json, sys
a = sys.argv[sys.argv.index("--") + 1:]; vb = {b["name"]: b for b in json.load(open(a[0]))["bones"]}
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]; bl = {b.name: b for b in arm.data.bones}
mh = mt = 0.0; stubs = []; par_ok = True
for n, j in vb.items():
    b = bl[n]; h = [x * 1000 for x in b.head_local]; t = [x * 1000 for x in b.tail_local]
    mh = max(mh, max(abs(x - y) for x, y in zip(h, j["head"])))
    if j["type"] == "bone": mt = max(mt, max(abs(x - y) for x, y in zip(t, j["tail"])))
    else: stubs.append(round(sum((x - y) ** 2 for x, y in zip(t, j["tail"])) ** 0.5, 4))
    par_ok &= (b.parent.name if b.parent else None) == j["parent"]
res = dict(blender_used=bpy.app.version_string, file_saved_with=list(bpy.data.version), bones_json=len(vb), bones_blend=len(bl), same_names=sorted(vb) == sorted(bl),
           parents_match=bool(par_ok), max_head_diff_mm=float(f"{mh:.3e}"), max_tail_diff_mm_19_bones=float(f"{mt:.3e}"),
           attachment_tail_offset_mm_in_blend=sorted(set(stubs)), actions_in_blend=len(bpy.data.actions), armature_object_scale=list(arm.scale))
json.dump(res, open(a[1], "w"), indent=1, sort_keys=True); print("BVJ " + json.dumps(res))
