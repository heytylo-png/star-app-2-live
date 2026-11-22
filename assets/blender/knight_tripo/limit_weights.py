"""Keep the top-4 bone weights per vertex, drop < 0.01, renormalize."""
import bpy, json
ob = bpy.data.objects["Knight"]; vg = ob.vertex_groups
for v in ob.data.vertices:
    ws = sorted(((g.group, g.weight) for g in v.groups), key=lambda t: -t[1])
    keep = [(i, w) for i, w in ws[:4] if w >= 0.01] or ws[:1]
    tot = sum(w for _, w in keep)
    for i, _ in ws:
        if i not in dict(keep): vg[i].remove([v.index])
    for i, w in keep: vg[i].add([v.index], w / tot, "REPLACE")
c = [len([g for g in v.groups if g.weight > 0]) for v in ob.data.vertices]
print("@@JSON@@" + json.dumps(dict(max_influences=max(c),
      unnormalized=sum(abs(sum(g.weight for g in v.groups) - 1) > 0.01 for v in ob.data.vertices))))
bpy.ops.wm.save_mainfile()
