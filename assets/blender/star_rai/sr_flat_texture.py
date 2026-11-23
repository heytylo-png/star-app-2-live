"""Flat base colour for Star Rai's toon sprites. Regions come from the mesh, not from colour (dark-brown
hair and shadowed skin overlap in colour): faces are rasterized into UV masks by their 'role'/'part'
attributes (set by sr_group_parts.py / sr_merge.py), and each region is treated differently:
- body skin: one flat colour = the reference sprite's lit tan, with a faint trace of painted detail;
- face + ears: skin-coloured texels get the body's flat tan + detail, with 25% of a hue-preserving
  delit version mixed back (lips, blush); brows, lashes and lines (not skin-coloured) are left as painted;
- hair, bikini: shading divided out with a dark target, strand/fabric detail kept;
- eyes, earring: untouched.
Statistics use covered texels only; corrections also apply ~4 px into the padding (read by bilinear/mip
sampling at island edges). Writes a PNG; swap it in with --apply (toon_sprites.sh does).
args: -- reference_sprite.png out_png [radius_px]   (scene must hold the 'StarRai' mesh with attributes)"""
import bpy, bmesh, json, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
REF, OUT = a[0], a[1]; RAD = int(a[2]) if len(a) > 2 else 10
ob = bpy.data.objects["StarRai"]; me = ob.data
img = next(n.image for m in me.materials for n in m.node_tree.nodes
           if n.type == "TEX_IMAGE" and n.image and "basecolor" in n.image.name)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4); rgb = px[..., :3].copy()
role = [d.value for d in me.attributes["role"].data]; part = [d.value for d in me.attributes["part"].data]
REGION = {"body": lambda r, p: r == 0, "face": lambda r, p: r == 1 and p in (14, 20, 21),
          "hair": lambda r, p: r == 2, "clothes": lambda r, p: r == 3}
bm = bmesh.new(); bm.from_mesh(me); uvl = bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
masks = {k: np.zeros((H, W), bool) for k in REGION}
for f in bm.faces:
    reg = next((k for k, fn in REGION.items() if fn(role[f.index], part[f.index])), None)
    if reg is None: continue
    pts = [(l[uvl].uv.x * W - 0.5, l[uvl].uv.y * H - 0.5) for l in f.loops]
    for i in range(1, len(pts) - 1):                       # fan-triangulate
        t = np.array([pts[0], pts[i], pts[i + 1]])
        x0, y0 = np.maximum(np.floor(t.min(0)).astype(int), 0); x1, y1 = np.minimum(np.ceil(t.max(0)).astype(int), [W - 1, H - 1])
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = t; d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d; l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        masks[reg][y0:y1 + 1, x0:x1 + 1] |= (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
bm.free()

def box(v, r):
    for ax in (0, 1):
        pad = [(r + 1, r), (0, 0)] if ax == 0 else [(0, 0), (r + 1, r)]
        c = np.cumsum(np.pad(v, pad, mode="edge"), axis=ax); n = c.shape[ax]
        v = (np.take(c, range(2 * r + 1, n), axis=ax) - np.take(c, range(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return v
def mblur(v, m, r):
    num, den = v * m, m.astype(np.float32)
    for _ in range(3): num, den = box(num, r // 2 + 1), box(den, r // 2 + 1)
    return num / np.maximum(den, 1e-6)
def near(m): return box(box(m.astype(np.float32), 2), 2) > 0

L = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
mx, mn = rgb.max(2), rgb.min(2); sat = (mx - mn) / np.maximum(mx, 1e-6)
skin_col = (rgb[..., 0] > rgb[..., 1]) & (rgb[..., 1] >= rgb[..., 2] * 0.9) & (sat > 0.15) & (L > 0.12)
ri = bpy.data.images.load(REF); ri.colorspace_settings.name = "sRGB"
ref = np.array(ri.pixels[:], dtype=np.float32).reshape(ri.size[1], ri.size[0], 4); rr = ref[..., :3]
rL = rr @ np.array([0.299, 0.587, 0.114]); rs = (rr.max(2) - rr.min(2)) / np.maximum(rr.max(2), 1e-6)
rskin = (ref[..., 3] > 0.9) & (rr[..., 0] > rr[..., 1]) & (rr[..., 1] > rr[..., 2]) & (rs > 0.25) & (rs < 0.6) & (rL > 0.35) & (rL < 0.8)
ref_skin = np.median(rr[rskin], axis=0)
out = rgb.copy(); claimed = np.zeros((H, W), bool); rep = {}
# body: flat tan + faint detail
mb = masks["body"]; Lb = mblur(L, mb, RAD)
detail = np.clip(L / np.maximum(Lb, 1e-4), 0.6, 1.4) ** 0.35
app = near(mb); out[app] = np.clip(ref_skin[None, :] * detail[app][:, None], 0, 1); claimed |= app
# face/ears: divide shading out on skin-coloured texels, match the body tan; features untouched
mf = masks["face"] & skin_col; Lf = mblur(L, mf, RAD)
tL = float(np.percentile(L[mf], 70)); flat = rgb * np.clip(tL / np.maximum(Lf, 1e-4), 0.5, 2.5)[..., None]
tone = ref_skin / np.maximum(np.median(flat[mf], axis=0), 1e-4)
app = near(masks["face"]) & skin_col & ~claimed
# per-island normalisation alone left the small face islands mottled: use the body's flat tan + faint
# detail, and mix back a quarter of the hue-preserving version so lips and blush keep their tint
fdet = np.clip(L / np.maximum(Lf, 1e-4), 0.6, 1.4) ** 0.5
HUE_MIX = 0.25
face_flat = ref_skin[None, :] * fdet[app][:, None]
out[app] = np.clip((1 - HUE_MIX) * face_flat + HUE_MIX * flat[app] * tone, 0, 1); claimed |= app
# hair / clothes: dark target, detail kept
for k in ("hair", "clothes"):
    m = masks[k]; Lm = mblur(L, m, RAD); tgt = float(np.median(L[m]))
    app = near(m) & ~claimed
    out[app] = np.clip((rgb * np.clip(tgt / np.maximum(Lm, 1e-4), 0.5, 2.0)[..., None])[app], 0, 1); claimed |= app
    rep[k] = round(tgt, 3)
px[..., :3] = out
flat_img = bpy.data.images.new("star_t-pose_basecolor_flat", W, H, alpha=True)
flat_img.pixels.foreach_set(px.ravel()); flat_img.filepath_raw = OUT; flat_img.file_format = "PNG"; flat_img.save()
print("@@JSON@@" + json.dumps(dict(regions={k: round(float(v.mean()), 3) for k, v in masks.items()},
      ref_skin=[round(float(x), 3) for x in ref_skin], dark_targets=rep, out=OUT)))
