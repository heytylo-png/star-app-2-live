"""Group parts for skinning (data API merge; keeps UVs and the shared material):
skin parts -> 'Body' (auto weights); face/eyes/ears/earring -> 'Head' (rigid);
hair -> 'Hair'; bikini top/bottom/ties -> 'Clothes' (weights transferred from Body).
A face int attribute 'part' keeps each face's source Tripo part number."""
import bpy, bmesh, json
GROUPS = {"Body": ["P1", "P2", "P3", "P4", "P5", "P6", "P8", "P9", "P10", "P11", "P12", "P13", "P17"],
          "Head": ["P14", "P20", "P21", "P22", "P23", "P24"], "Hair": ["P0"],
          "Clothes": ["P7", "P15", "P16", "P18", "P19"]}
mat = bpy.data.objects["P0"].data.materials[0]
out = {}
for name, members in GROUPS.items():
    bm = bmesh.new()
    for m in members:
        src = bpy.data.objects[m].data
        if "part" not in src.attributes: src.attributes.new("part", "INT", "FACE")
        src.attributes["part"].data.foreach_set("value", [int(m[1:])] * len(src.polygons))
        if "finger" not in src.attributes:
            src.attributes.new("finger", "INT", "FACE")       # 0 = not a finger (hands carry 1..5)
        n0 = len(bm.faces); bm.from_mesh(src)          # appends; UV layers match by name
        assert len(bm.faces) > n0, m
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob["role"] = name.lower()
    for m in members: bpy.data.objects.remove(bpy.data.objects[m])
    out[name] = dict(tris=sum(len(p.vertices) - 2 for p in me.polygons), uv=[u.name for u in me.uv_layers],
                     parts=sorted(set(me.attributes["part"].data[i].value for i in range(len(me.polygons)))))
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(out))
