"""Block out a stylized low-poly knight in T-pose (faces -Y, feet at Z=0, 1 unit = 1 m)."""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix
out = sys.argv[sys.argv.index("--")+1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)

def mat(name, rgb, metal=0.0, rough=0.6):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    return m
MATS = [mat("M_Steel", (0.62, 0.64, 0.68), 1.0, 0.35), mat("M_Tabard", (0.08, 0.16, 0.45), 0, 0.85),
        mat("M_Gold", (0.85, 0.62, 0.22), 1.0, 0.3), mat("M_Leather", (0.16, 0.09, 0.05), 0, 0.7),
        mat("M_Visor", (0.02, 0.02, 0.025), 0, 0.5), mat("M_Plume", (0.65, 0.06, 0.05), 0, 0.8)]
STEEL, TABARD, GOLD, LEATHER, VISOR, PLUME = range(6)
bm = bmesh.new()

def tag(geom_verts, m):
    faces = {f for v in geom_verts for f in v.link_faces}
    for f in faces: f.material_index = m

def frustum(a, b, r1, r2, sides=8, rings=1, m=STEEL, sy=1.0, sx=1.0, rot=math.pi/8):
    """Capped tube from point a to b, radius r1->r2, optional elliptical scale (local x/y)."""
    a, b = Vector(a), Vector(b); axis = (b - a).normalized()
    q = axis.to_track_quat("Z", "Y" if abs(axis.z) < 0.9 else "X")
    R = q.to_matrix()
    loops = []
    for i in range(rings + 1):
        t = i / rings; c = a.lerp(b, t); r = r1 + (r2 - r1) * t
        ring = []
        for s in range(sides):
            ang = rot + 2 * math.pi * s / sides
            p = Vector((math.cos(ang) * r * sx, math.sin(ang) * r * sy, 0))
            ring.append(bm.verts.new(c + R @ p))
        loops.append(ring)
    for i in range(rings):
        for s in range(sides):
            s2 = (s + 1) % sides
            bm.faces.new((loops[i][s], loops[i][s2], loops[i+1][s2], loops[i+1][s]))
    caps = [bm.faces.new(list(reversed(loops[0]))), bm.faces.new(loops[-1])]
    bmesh.ops.triangulate(bm, faces=caps, quad_method="BEAUTY", ngon_method="BEAUTY")
    tag([v for l in loops for v in l], m)

def box(center, size, m=STEEL, bevel=0.0):
    before = set(bm.verts)
    vs = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=size, verts=vs); bmesh.ops.translate(bm, vec=center, verts=vs)
    if bevel:
        es = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=es, offset=bevel, segments=1, affect="EDGES")
    tag([v for v in bm.verts if v not in before], m)

def dome(center, r, sz, m=STEEL, seg=8, rings=4):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    vs = res["verts"]
    bmesh.ops.scale(bm, vec=sz, verts=vs); bmesh.ops.translate(bm, vec=center, verts=vs)
    tag(vs, m)

for sx in (1, -1):
    x = 0.12 * sx
    box((x, -0.035, 0.065), (0.15, 0.27, 0.13), STEEL, bevel=0.02)            # sabaton
    frustum((x, 0, 0.12), (x, 0, 0.50), 0.065, 0.08, rings=3)                   # greave
    dome((x, -0.02, 0.50), 0.07, (1.0, 1.0, 0.85), GOLD)                        # knee cop
    frustum((x, 0, 0.50), (x, 0, 0.90), 0.085, 0.10, rings=3, m=LEATHER)        # thigh
    # arms (T-pose along +-X)
    frustum((0.22*sx, 0, 1.36), (0.56*sx, 0, 1.36), 0.07, 0.06, rings=3, m=LEATHER)   # upper arm
    dome((0.56*sx, 0, 1.36), 0.065, (1, 1, 1), GOLD)                                 # elbow cop
    frustum((0.54*sx, 0, 1.36), (0.81*sx, 0, 1.36), 0.055, 0.07, rings=3)              # vambrace
    box((0.86*sx, 0, 1.36), (0.14, 0.09, 0.11), STEEL, bevel=0.015)                  # gauntlet
    dome((0.30*sx, 0, 1.43), 0.14, (1.0, 0.95, 0.75), STEEL)                          # pauldron
frustum((0, 0, 0.84), (0, 0, 1.00), 0.21, 0.22, sides=8, sy=0.65, m=LEATHER)         # hips
frustum((0, 0, 0.97), (0, 0, 1.03), 0.235, 0.235, sides=8, sy=0.68, m=GOLD)          # belt
frustum((0, 0, 1.00), (0, 0, 1.45), 0.21, 0.27, sides=8, rings=3, sy=0.62, m=TABARD) # chest
frustum((0, 0, 1.42), (0, 0, 1.52), 0.07, 0.065, sides=8, m=LEATHER)                 # neck
frustum((0, 0, 1.48), (0, 0, 1.75), 0.15, 0.15, sides=8, rings=2, m=STEEL)           # helm
dome((0, 0, 1.75), 0.15, (1, 1, 0.55), STEEL)                                        # helm top
box((0, -0.145, 1.62), (0.18, 0.02, 0.035), VISOR)                                   # visor slit
box((0, -0.155, 1.58), (0.025, 0.02, 0.15), GOLD)                                    # nose guard
frustum((0, 0.02, 1.80), (0, 0.10, 2.0), 0.045, 0.01, sides=6, rings=2, m=PLUME)     # plume

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
uvl = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    ax = max(range(3), key=lambda i: abs(f.normal[i])); a, b = [i for i in range(3) if i != ax]
    for l in f.loops: l[uvl].uv = (l.vert.co[a] * 0.5 + 0.5, l.vert.co[b] * 0.5)
me = bpy.data.meshes.new("Knight"); bm.to_mesh(me); bm.free()
for m in MATS: me.materials.append(m)
for p in me.polygons: p.use_smooth = False
ob = bpy.data.objects.new("Knight", me); bpy.context.collection.objects.link(ob)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "knight_mesh.blend"))
print("@@JSON@@" + json.dumps(dict(tris=sum(len(p.vertices)-2 for p in me.polygons),
      verts=len(me.vertices), dims=[round(d, 3) for d in ob.dimensions])))
