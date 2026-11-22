"""Scale Star Rai to a target height (feet on Z=0, centred, facing -Y), weld seam splits per part, then
decimate each part to a share of a total triangle budget weighted by area x importance (face/hands densest).
UVs and the shared material/textures are kept (collapse decimation interpolates UVs)."""
import bpy, bmesh, json, sys
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--")+1:]
height, budget, out = float(a[0]), int(a[1]), a[2]
ROLE = {"P0": "hair", "P14": "face", "P22": "eye", "P23": "eye", "P20": "ear", "P21": "ear", "P24": "earring",
        "P17": "neck", "P6": "chest", "P15": "chest", "P16": "chest", "P5": "waist", "P7": "skirt",
        "P8": "upper_arm", "P12": "upper_arm", "P11": "forearm", "P13": "forearm", "P9": "hand", "P10": "hand",
        "P1": "thigh", "P4": "thigh", "P2": "shin", "P3": "shin", "P18": "hip_detail", "P19": "hip_detail"}
IMPORTANCE = {"face": 6.0, "hand": 6.0, "eye": 4.0, "ear": 2.0, "earring": 2.0, "hair": 1.3}
parts = sorted([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: int(o.name[1:]))
allv = [v.co for o in parts for v in o.data.vertices]
lo = Vector([min(v[i] for v in allv) for i in range(3)]); hi = Vector([max(v[i] for v in allv) for i in range(3)])
s = height / (hi.z - lo.z)
M = Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
for o in parts: o.data.transform(M)
before, welded = {}, {}
for o in parts:
    o["role"] = ROLE[o.name]
    bm = bmesh.new(); bm.from_mesh(o.data); n = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6 * height)
    welded[o.name] = n - len(bm.verts); bm.to_mesh(o.data); bm.free()
    before[o.name] = sum(len(p.vertices) - 2 for p in o.data.polygons)
w = {o.name: sum(p.area for p in o.data.polygons) * IMPORTANCE.get(ROLE[o.name], 1.0) for o in parts}
W = sum(w.values())
rep = []
for o in parts:
    tgt = max(150, min(before[o.name], round(budget * w[o.name] / W)))
    m = o.modifiers.new("Decimate", "DECIMATE"); m.decimate_type = "COLLAPSE"; m.ratio = tgt / before[o.name]
    m.use_collapse_triangulate = True
    centred = abs(sum(v.co.x for v in o.data.vertices) / len(o.data.vertices)) < 0.01 * height
    if centred: m.use_symmetry = True; m.symmetry_axis = "X"
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        assert bpy.ops.object.modifier_apply(modifier=m.name) == {"FINISHED"}
    for p in o.data.polygons: p.use_smooth = True
    after = sum(len(p.vertices) - 2 for p in o.data.polygons)
    rep.append(dict(part=o.name, role=ROLE[o.name], before=before[o.name], target=tgt, after=after,
                    welded=welded[o.name], symmetric=centred, uv_layers=len(o.data.uv_layers)))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("@@JSON@@" + json.dumps(dict(scale=round(s, 4), height=round((hi.z - lo.z) * s, 4),
      total_before=sum(before.values()), total_after=sum(r["after"] for r in rep), parts=rep)))
