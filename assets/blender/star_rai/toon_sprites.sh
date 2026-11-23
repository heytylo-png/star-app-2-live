#!/usr/bin/env bash
# Toon/cel sprite renders of the exported Star Rai GLB (render-only look; the GLB keeps its PBR material).
# Two-band toon (blender-stylized-npr toon_setup.py, key light follows each camera) + Freestyle outer
# silhouette line. Usage: toon_sprites.sh <star_rai_rigged.glb> <out_dir> [star_rai_basecolor_flat.png]
# The optional flat texture (sr_flat_texture.py) removes Tripo's painted shading so the toon reads as anime.
set -euo pipefail
GLB=${1:?glb}; D=${2:?out dir}; FLAT=${3:-}; H=$(cd "$(dirname "$0")" && pwd); K=${SKILLS:-$HOME/.claude/skills}
mkdir -p "$D/toon"
blender -b --factory-startup --python-exit-code 1 -P "$H/sr_reimport.py" -- "$GLB" "$D/toon.blend" | grep -c @@JSON
python3 "$K/blender-core/scripts/run_in_blender.py" --blend "$D/toon.blend" "$K/blender-stylized-npr/scripts/toon_setup.py" -- \
   --objects StarRai --bands 2 --shadow-tint 0.84 0.70 0.76 --threshold -0.15 --softness 0.03 --rim 0.2 --outline 0 --save "$D/toon.blend"
blender -b "$D/toon.blend" --factory-startup --python-exit-code 1 -P "$H/sr_toon_lines.py" -- 4.0 120 | grep @@JSON
if [ -n "$FLAT" ]; then blender -b "$D/toon.blend" --factory-startup --python-exit-code 1 -P "$H/sr_apply_texture.py" -- "$FLAT" | grep @@JSON; fi
R(){ blender -b "$D/toon.blend" --factory-startup --python-exit-code 1 -P "$H/sr_sprite_render.py" -- "$D/toon" "$@" | grep -c Saved; }
R toon_star_rai front,three_quarter,side 1152 64
for p in Idle Wave Peace Point; do R "toon_pose_$p" front,three_quarter 1152 64 "$p" GAME_RIG_StarRai 1; done
