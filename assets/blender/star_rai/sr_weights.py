"""Custom skinning on top of Body's automatic weights.
- Body: verts the heat solve missed (enclosed islands) copy the nearest weighted vertex.
- Head (face/eyes/ears/earring): 100% head bone, so the face stays rigid.
- Hair: head above ear level; below it blends toward neck and chest so the tips don't sweep through the
  shoulders when the head turns. args: hair_top hair_bottom (Z in metres) and the tip mix.
- Clothes (bikini): weights projected from the nearest point on Body's surface (barycentric), so the
  fabric moves with the skin under it.
All groups end with <= 4 influences, normalized, armature modifier + parent RIG."""
import bpy, json, sys
from mathutils import kdtree
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
a = sys.argv[sys.argv.index("--")+1:]
HAIR_TOP, HAIR_BOT = float(a[0]), float(a[1]); TIP_NECK, TIP_CHEST = float(a[2]), float(a[3])
THIGH_SCALE = float(a[4]) if len(a) > 4 else 1.0   # share of thigh influence kept on the bikini bottom
rig = bpy.data.objects["RIG_StarRai"]; DEF = [b.name for b in rig.data.bones if b.use_deform]
HEAD, NECK, CHEST = "DEF-spine.006", "DEF-spine.004", "DEF-spine.003"
body = bpy.data.objects["Body"]; bme = body.data
gname = {g.index: g.name for g in body.vertex_groups}
def wdict(v): return {gname[g.group]: g.weight for g in v.groups if g.weight > 0}

def set_weights(ob, weights):
    """weights: list (per vertex) of {group: w}; keeps top 4, normalizes, replaces all groups."""
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    groups = {n: ob.vertex_groups.new(name=n) for n in DEF}
    for i, w in enumerate(weights):
        top = sorted(w.items(), key=lambda t: -t[1])[:4]
        top = [t for t in top if t[1] > 0] or [(HEAD if ob.name == "Hair" else "DEF-spine", 1.0)]
        kept = [t for t in top if t[1] / sum(x for _, x in top) >= 0.005] or top[:1]   # always keep the strongest
        s = sum(x for _, x in kept)
        for n, x in kept: groups[n].add([i], x / s, "REPLACE")

def skin(ob):
    ob.parent = rig; ob.matrix_parent_inverse = rig.matrix_world.inverted()
    m = next((m for m in ob.modifiers if m.type == "ARMATURE"), None) or ob.modifiers.new("Armature", "ARMATURE")
    m.object = rig

rep = {}
# Body: fill unweighted from nearest weighted vertex
weighted = [v for v in bme.vertices if wdict(v)]
kd = kdtree.KDTree(len(weighted))
for i, v in enumerate(weighted): kd.insert(v.co, i)
kd.balance()
W = [wdict(v) for v in bme.vertices]
filled = 0
for v in bme.vertices:
    if not W[v.index]:
        _, j, _ = kd.find(v.co); W[v.index] = dict(wdict(weighted[j])); filled += 1
# The voxel proxy can fuse inner thighs/armpits: off-centre verts must not follow the other side's bones.
def mirror(n): return n[:-2] + (".L" if n.endswith(".R") else ".R")
SIDE_X = 0.03; moved_lr = 0
for v in bme.vertices:
    if abs(v.co.x) < SIDE_X: continue
    other = ".R" if v.co.x > 0 else ".L"; w = W[v.index]
    if any(n.endswith(other) for n in w):
        moved_lr += 1; nw = {}
        for n, x in w.items():
            k = mirror(n) if n.endswith(other) else n; nw[k] = nw.get(k, 0) + x
        W[v.index] = nw
set_weights(body, W); rep["Body"] = {"filled_unweighted": filled, "opposite_side_weight_mirrored": moved_lr}
# Head: rigid
head = bpy.data.objects["Head"]; set_weights(head, [{HEAD: 1.0}] * len(head.data.vertices)); skin(head)
rep["Head"] = {"bone": HEAD}
# Hair: head above HAIR_TOP, blend to neck/chest by HAIR_BOT
hair = bpy.data.objects["Hair"]; HW = []
for v in hair.data.vertices:
    t = min(1.0, max(0.0, (HAIR_TOP - v.co.z) / (HAIR_TOP - HAIR_BOT))); t = t * t * (3 - 2 * t)
    HW.append({HEAD: 1 - (TIP_NECK + TIP_CHEST) * t, NECK: TIP_NECK * t, CHEST: TIP_CHEST * t})
set_weights(hair, HW); skin(hair)
rep["Hair"] = {"blended_verts": sum(1 for v in hair.data.vertices if v.co.z < HAIR_TOP)}
# Clothes: project body weights
dg = bpy.context.evaluated_depsgraph_get()
tree = BVHTree.FromPolygons([v.co for v in bme.vertices], [p.vertices[:] for p in bme.polygons])
# Waist/chest skin overlaps the hidden tops of the thigh shells under the bikini bottom: when a waist/chest
# face is within PREFER_M of the overall nearest, project from it (the visible skin), not the buried thigh.
PREFER_M = 0.005
bpart = [d.value for d in bme.attributes["part"].data]
surf_ids = [i for i, p in enumerate(bme.polygons) if bpart[i] in (5, 6)]
surf_tree = BVHTree.FromPolygons([v.co for v in bme.vertices], [bme.polygons[i].vertices[:] for i in surf_ids])
clo = bpy.data.objects["Clothes"]; CW = []; far = 0; preferred = 0
for v in clo.data.vertices:
    loc, nrm, fi, dist = tree.find_nearest(v.co)
    l2, n2, j, d2 = surf_tree.find_nearest(v.co)
    if l2 is not None and bpart[fi] not in (5, 6) and d2 - dist < PREFER_M:
        loc, fi, dist = l2, surf_ids[j], d2; preferred += 1
    poly = bme.polygons[fi]; ids = poly.vertices[:]
    bary = poly_3d_calc([bme.vertices[i].co for i in ids], loc)
    acc = {}
    for i, b in zip(ids, bary):
        for n, w in W[i].items(): acc[n] = acc.get(n, 0) + w * b
    CW.append(acc); far += dist > 0.02
# Garment-specific bone sets: the top never follows the arms (no straps dragged to the armpit); the
# bottom/ties follow only spine, pelvis and thighs.
TOP_PARTS, BOTTOM_PARTS = {15, 16}, {7, 18, 19}
cpart = [d.value for d in clo.data.attributes["part"].data]; vpart = {}
for poly in clo.data.polygons:
    for i in poly.vertices: vpart[i] = cpart[poly.index]
allowed = {"top": lambda n: n.startswith("DEF-spine") or n.startswith("DEF-breast"),
           "bottom": lambda n: n.startswith(("DEF-spine", "DEF-pelvis", "DEF-thigh"))}
fallback = {"top": "DEF-spine.003", "bottom": "DEF-spine"}
stripped = 0
for i, acc in enumerate(CW):
    kind = "top" if vpart.get(i) in TOP_PARTS else "bottom" if vpart.get(i) in BOTTOM_PARTS else None
    if not kind: continue
    keep = {n: w for n, w in acc.items() if allowed[kind](n)}
    if kind == "bottom" and THIGH_SCALE != 1.0:   # lean the fabric on the pelvis so it doesn't ride up with a lifted thigh
        moved = sum(w for n, w in keep.items() if n.startswith("DEF-thigh")) * (1 - THIGH_SCALE)
        keep = {n: (w * THIGH_SCALE if n.startswith("DEF-thigh") else w) for n, w in keep.items()}
        if moved: keep["DEF-spine"] = keep.get("DEF-spine", 0) + moved
    stripped += len(keep) != len(acc)
    CW[i] = keep or {fallback[kind]: 1.0}
for i, v in enumerate(clo.data.vertices):            # same off-centre rule as Body
    if abs(v.co.x) < SIDE_X: continue
    other = ".R" if v.co.x > 0 else ".L"
    if any(n.endswith(other) for n in CW[i]):
        nw = {}
        for n, x in CW[i].items():
            k = mirror(n) if n.endswith(other) else n; nw[k] = nw.get(k, 0) + x
        CW[i] = nw
set_weights(clo, CW); skin(clo)
rep["Clothes"] = {"verts_farther_than_2cm_from_skin": far, "projected_from_waist_chest_instead": preferred, "verts_with_foreign_bones_removed": stripped}
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(rep))
