"""Swap Star Rai's base colour image for another PNG (e.g. the flat toon texture). args: -- png"""
import bpy, sys
png = sys.argv[sys.argv.index("--")+1]
new = bpy.data.images.load(png); new.colorspace_settings.name = "sRGB"; n_swapped = 0
for m in bpy.data.materials:
    for n in (m.node_tree.nodes if m.node_tree else []):
        if n.type == "TEX_IMAGE" and n.image and "basecolor" in n.image.name and n.image != new:
            n.image = new; n_swapped += 1
bpy.ops.wm.save_mainfile(); print("@@JSON@@", {"swapped": n_swapped})
