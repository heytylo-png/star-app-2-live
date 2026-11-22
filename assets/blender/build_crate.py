import bpy, bmesh, json, os, sys
out = sys.argv[sys.argv.index("--")+1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)

def mat(name, rgb, rough):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    return m
frame = mat("M_CrateFrame", (0.22, 0.12, 0.05), 0.7)
panel = mat("M_CratePanel", (0.55, 0.36, 0.16), 0.8)

me = bpy.data.meshes.new("SM_Crate"); bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
r = bmesh.ops.inset_individual(bm, faces=list(bm.faces), thickness=0.1, depth=-0.04)
inner = [f for f in bm.faces if f not in r["faces"] and len(f.verts)==4 and f.calc_area() > 0.5]
for f in bm.faces: f.material_index = 1 if f in inner else 0
bmesh.ops.translate(bm, verts=bm.verts, vec=(0,0,0.5))  # origin at bottom
uvl = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    ax = max(range(3), key=lambda i: abs(f.normal[i])); a, b = [i for i in range(3) if i != ax]
    for l in f.loops: l[uvl].uv = (l.vert.co[a] + 0.5, l.vert.co[b])
bm.to_mesh(me); bm.free()
me.materials.append(frame); me.materials.append(panel)
ob = bpy.data.objects.new("SM_Crate", me); bpy.context.collection.objects.link(ob)
for p in me.polygons: p.use_smooth = False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "crate.blend"))
glb = os.path.join(out, "crate.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=False, export_apply=True)
tris = sum(len(p.vertices)-2 for p in me.polygons)
print("@@JSON@@" + json.dumps(dict(tris=tris, verts=len(me.vertices), faces=len(me.polygons),
      dims=list(ob.dimensions), glb_bytes=os.path.getsize(glb))))
