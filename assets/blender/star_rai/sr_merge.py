"""Merge Body/Head/Hair/Clothes into one skinned mesh 'StarRai' (one material, one draw call).
Requires identical vertex-group lists (checked) so bmesh's deform layer maps groups by index."""
import bpy, bmesh, json
names = ["Body", "Head", "Hair", "Clothes"]; obs = [bpy.data.objects[n] for n in names]
groups = [g.name for g in obs[0].vertex_groups]
assert all([g.name for g in o.vertex_groups] == groups for o in obs), "vertex group lists differ"
rig = obs[0].parent; mat = obs[0].data.materials[0]
bm = bmesh.new()
for o in obs:
    if "role" not in o.data.attributes:
        o.data.attributes.new("role", "INT", "FACE")
    o.data.attributes["role"].data.foreach_set("value", [names.index(o.name)] * len(o.data.polygons))
    bm.from_mesh(o.data)
me = bpy.data.meshes.new("StarRai"); bm.to_mesh(me); bm.free(); me.materials.append(mat)
for p in me.polygons: p.use_smooth = True
ob = bpy.data.objects.new("StarRai", me); bpy.context.collection.objects.link(ob)
for g in groups: ob.vertex_groups.new(name=g)
ob.parent = rig; ob.matrix_parent_inverse = rig.matrix_world.inverted()
ob.modifiers.new("Armature", "ARMATURE").object = rig
counts = {o.name: (len(o.data.vertices), sum(len(p.vertices) - 2 for p in o.data.polygons)) for o in obs}
for o in obs: bpy.data.objects.remove(o)
wv = sum(1 for v in me.vertices if any(g.weight > 0 for g in v.groups))
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(dict(parts=counts, verts=len(me.vertices), weighted_verts=wv,
      tris=sum(len(p.vertices) - 2 for p in me.polygons), groups=len(ob.vertex_groups), uv=[u.name for u in me.uv_layers])))
