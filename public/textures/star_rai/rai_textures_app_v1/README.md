# Rai textures for the app, v1 (Texture Bro, 2026-10-30)
These go on BlendBro's v2/v2.1 head and hair UVs, with the main v2.2 hairstyle. All maps are 1024 PNGs.
The alt long hair is not included because it isn't signed off.

## Hair (cel)
- `rai_hair_ilm.png`: ILM map v3, RGBA. Set it to Non-Color with nearest filtering. R is spec strength, G is the shadow threshold, B is spec size and A is the inner lines.
- `rai_hair_base.png`: base colour v2, `rai_hair_shadow.png`: shadow colour.
- Shader values: spec #5A5B63, threshold > 0.12 on R×B, facing mask 0.5, ring G = 76.
- `rai_hair_albedo.png` and `rai_hair_orm.png` are the PBR fallback.

## Hair cap
- base, shadow, albedo and orm.

## Head
- `rai_head_albedo.png` and `rai_head_orm.png` (R = AO, G = roughness, B = metallic) for PBR.
- `rai_head_cel_base.png` and `rai_head_cel_shadow.png` for cel.
- Skin #D08764, roughness 0.62, shadow #9A5844.

Normal maps are left out because they're flat. Use the mesh normals instead.
