"""Separate Tripo's fused fingers so they can be posed individually (CAP=False: cut only).
Faces past the knuckles are labelled by finger (centre-line boundaries between the measured finger axes);
edges between different fingers are split along the grooves, and each finger's opened side is capped
(the cap closes back to the knuckle; UVs are copied from the adjacent skin). The thumb is already separate.
Labels are stored in a face int attribute 'finger' (0 palm, 1 thumb, 2 index, 3 middle, 4 ring, 5 pinky)."""
import bpy, bmesh, json
XK = 0.656                      # |x| where the fingers leave the palm (knuckles)
CUTS = (0.0085, 0.030, 0.0495)  # y between index|middle|ring|pinky centre lines (-0.002, 0.019, 0.041, 0.058)
THUMB_Y, THUMB_XMAX = -0.013, 0.672
CAP = False   # capping the long slits produced overlapping caps; the material is double-sided, so cut sides read as a thin shadow

def label(c):
    ax = abs(c.x)
    if c.y < THUMB_Y and ax < THUMB_XMAX and ax > 0.595: return 1
    if ax < XK: return 0
    return 2 + sum(c.y > b for b in CUTS)

rep = {}
for name in ("P9", "P10"):
    o = bpy.data.objects[name]; bm = bmesh.new(); bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv.active
    lab = {f: label(f.calc_center_median()) for f in bm.faces}
    cut = [e for e in bm.edges if len(e.link_faces) == 2 and lab[e.link_faces[0]] != lab[e.link_faces[1]]
           and min(lab[e.link_faces[0]], lab[e.link_faces[1]]) >= 2]
    bmesh.ops.split_edges(bm, edges=cut)
    lab = {f: label(f.calc_center_median()) for f in bm.faces}
    # boundary chains per finger (the opened sides)
    groups = {}
    for e in bm.edges:
        if len(e.link_faces) == 1 and lab[e.link_faces[0]] >= 2:
            groups.setdefault(lab[e.link_faces[0]], []).append(e)
    caps = 0
    for fid, edges in (groups.items() if CAP else []):
        # split each finger's boundary into connected chains (a middle finger has two opened sides)
        es = set(edges)
        while es:
            chain, stack = set(), [es.pop()]
            while stack:
                e = stack.pop(); chain.add(e)
                for v in e.verts:
                    for e2 in v.link_edges:
                        if e2 in es: es.discard(e2); stack.append(e2)
            deg = {}
            for e in chain:
                for v in e.verts: deg[v] = deg.get(v, 0) + 1
            ends = [v for v, d in deg.items() if d == 1]
            loop = list(chain)
            if len(ends) == 2:
                ne = bm.edges.get(ends) or bm.edges.new(ends); loop.append(ne)
            elif ends:
                continue
            res = bmesh.ops.edgeloop_fill(bm, edges=loop)
            newf = res["faces"]
            if not newf: continue
            tri = bmesh.ops.triangulate(bm, faces=newf, quad_method="BEAUTY", ngon_method="BEAUTY")["faces"]
            for f in tri:
                for l in f.loops:                      # copy UV from an existing skin loop of the same vertex
                    src = next((l2 for l2 in l.vert.link_loops if l2.face not in tri), None)
                    if src: l[uvl].uv = src[uvl].uv
                lab[f] = fid
            caps += 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fl = bm.faces.layers.int.get("finger") or bm.faces.layers.int.new("finger")
    for f in bm.faces: f[fl] = lab.get(f, label(f.calc_center_median()))
    bm.to_mesh(o.data); bm.free(); o.data.update()
    import collections
    rep[name] = dict(cut_edges=len(cut), caps=caps, tris=sum(len(p.vertices) - 2 for p in o.data.polygons),
                     faces_per_label=dict(collections.Counter(d.value for d in o.data.attributes["finger"].data)))
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(rep))
