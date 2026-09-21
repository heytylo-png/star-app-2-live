# Star Rai — Spine cutout layers

Required cut PNGs live here (from `public/rai/idle.png`, 1008×1792). `?spine=rai` loads them through `skeleton.json`; any missing file still falls back to the official PNG puppet. Re-cut with `scripts/cut-rai-spine-layers.py` (Pillow / NumPy / SciPy). Do not commit traced AI fills. See [SPINE.md](../../../SPINE.md) and [cut-guide.svg](../cut-guide.svg).

This pack is **frozen** for pose motion: empty `bones: {}` clips were fixed by authoring timelines in `skeleton.json`, not by recutting layers. Recut only if a pose literally tears a hole.

Required filenames (character-left = her left = screen right):

| File | Bone / slot | Notes |
| --- | --- | --- |
| `hair_back.png` | hairBack | Behind head + shoulders; include nape |
| `upper_arm_r.png` | upperArmR | Her right = wave / scold arm |
| `upper_arm_l.png` | upperArmL | Her left = hip hand on wave |
| `thigh_r.png` / `thigh_l.png` | thigh* | Soft overlap under skirt |
| `calf_r.png` / `calf_l.png` | calf* | Include navy socks |
| `foot_r.png` / `foot_l.png` | foot* | Brown loafers |
| `skirt.png` | skirt | Prefer mesh later in Spine |
| `torso.png` | torso | White shirt + buttons; crop sleeves off |
| `bow.png` | bow | Red ribbon, own bone |
| `forearm_r.png` / `forearm_l.png` | forearm* | |
| `hand_r.png` / `hand_l.png` | hand* | Extra hand drawings for wave / scold / shy |
| `neck.png` | neck | |
| `head.png` | head | Face without jaw/mouth; amber eyes |
| `brow.png` | brow | Scowl vs rest as two skins later |
| `mouth_closed.png` | jaw | From idle frown |
| `mouth_open.png` | jaw | From `talk_official.png` — same head frame |
| `hair_front.png` | hairFront | Bangs / cheek strands |
| `ahoge.png` | ahoge | Antenna curl, pivot at scalp |

Optional later: `eye_open.png` / `eye_closed.png`, skirt mesh, hair mesh, scold-point hand, wave-open hand.

**Do not** drop Expo `mouth_*.png` / `face_eyes_*.png` here — those are bust crops and will mis-register on the long-shot body.
