# Spine / cutout assets

Artist and runtime drop folder for animation **track #2**. Official PNG puppet under `../rai/` is still the shipping face.

| Path | What |
| --- | --- |
| [../../SPINE.md](../../SPINE.md) | Spine vs DragonBones decision, license, pipeline |
| [rai/cut-guide.svg](./rai/cut-guide.svg) | Idle layer boxes (schematic) |
| [rai/skeleton.json](./rai/skeleton.json) | Bone + slot stub for Star Rai |
| [rai/layers/](./rai/layers/) | Official idle cut PNGs (filenames in that README) |
| Sample girl | Code: `src/lib/cutout-sample.ts` — geometric stand-in, **not Rai** |

## Preview in the app

- Default: PNG puppet (`idle.png` + talk flap).  
- `?spine=1` or `?engine=spine`: sample cutout (idle / talk / wave / scold / pout / shy). Badge: “not Rai”.  
- `?spine=rai`: load `rai/skeleton.json` + `rai/layers/*.png`. If any required layer 404s, **fall back to PNG**.  
- `?lab=1` / `?3d=1`: ignored. 3D identity stays paused.

## After Spine Editor export

Create `rai/export/` and drop Spine 4.2 JSON + atlas + PNG. Do not replace `public/rai/*.png`. A later PR loads `@esotericsoftware/spine-webgl` only when that export exists **and** a Spine license is on the project.
