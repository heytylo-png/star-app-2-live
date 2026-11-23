"""Sprite linework via Freestyle (render-only). Default: the outer silhouette only (external_contour).
Tripo's model is many overlapping shells: an inverted hull pokes through the face, and inner contours
outline every part seam (knees, elbows, wrists), so interior lines are off unless asked for. Thickness is given at 1152 px width and scaled by the render width in sr_sprite_render.py."""
import bpy, sys, json
a = sys.argv[sys.argv.index("--")+1:]
thick, crease = float(a[0]), float(a[1])
KINDS = a[2].split(",") if len(a) > 2 else ["external_contour"]   # outer silhouette only by default
sc = bpy.context.scene; sc.render.use_freestyle = True; sc.render.line_thickness_mode = "ABSOLUTE"
sc["sprite_line_px_at_1152"] = thick
vl = bpy.context.view_layer; fs = vl.freestyle_settings
fs.crease_angle = __import__("math").radians(crease); fs.use_culling = True
ls = fs.linesets[0] if fs.linesets else fs.linesets.new("Lines")
ls.select_by_visibility = True; ls.visibility = "VISIBLE"; ls.select_by_edge_types = True
for k in ("silhouette", "border", "crease", "contour", "external_contour", "material_boundary", "suggestive_contour", "ridge_valley"):
    setattr(ls, "select_" + k, k in KINDS)
st = ls.linestyle or bpy.data.linestyles.new("SpriteLine"); ls.linestyle = st; st.color = (0.06, 0.04, 0.05); st.thickness = thick; st.thickness_position = "CENTER"
st.chaining = "PLAIN"; st.use_chain_count = False
for m in list(st.thickness_modifiers): st.thickness_modifiers.remove(m)
tm = st.thickness_modifiers.new("Taper", "ALONG_STROKE"); tm.mapping = "CURVE"            # thin stroke ends
tm.value_min, tm.value_max = 0.4 * thick, thick
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps({"freestyle": True, "kinds": KINDS, "thickness_px_at_1152": thick, "crease_deg": crease}))
