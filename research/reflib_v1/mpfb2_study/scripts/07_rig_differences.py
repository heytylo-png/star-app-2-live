"""Task 5/6 support: structural differences between default, game_engine and Rigify rig/weight data."""
import sys, os, re, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *
R = {k: bones_of(load_json(p)) for k, p in RIGS.items()}
raw = {k: load_json(p) for k, p in RIGS.items()}
CATS = [("face", r"oculi|orbicularis|oris|risorius|levator|temporalis|eye|jaw|tongue|special|brow|lid|lip|nose|cheek|chin|(?:^|[._-])ear|forehead|teeth|face|jaw|temple|DEF-(?:eye)"),
        ("fingers/hand", r"finger|f_|thumb|index|middle|ring|pinky|metacarpal|palm|wrist|hand"),
        ("toes/foot", r"toe|foot|ball|heel"),
        ("arm", r"upperarm|lowerarm|upper_arm|forearm|clavicle|shoulder|elbow"),
        ("leg", r"upperleg|lowerleg|thigh|shin|calf|knee|pelvis"),
        ("spine/neck/head/root", r"spine|neck|head|root|Root|breast")]
def cat(n):
    for c, rx in CATS:
        if re.search(rx, n, re.I): return c
    return "other"
cc = {k: collections.Counter(cat(n) for n in bs) for k, bs in R.items()}
write_csv("rig_category_counts.csv", ["category"] + list(R), [[c] + [cc[k].get(c, 0) for k in R] for c in [x[0] for x in CATS] + ["other"]])
out = {"bone_counts": {k: len(v) for k, v in R.items()}, "category_counts": {k: dict(v) for k, v in cc.items()}}
# naming
out["naming"] = dict(default="lower-case MakeHuman-style, .L/.R suffix, chains numbered 01/02, spine05(pelvis end)->spine01(neck end)",
                     game_engine="Unreal-style snake_case, _l/_r suffix (pelvis, spine_01..03, upperarm_l, calf_l, ball_l, index_01_l ...)",
                     rigify="Rigify metarig names (spine.001, thigh.L, f_index.01.L) + DEF-/MCH- helper names; generated deform bones DEF-*.001 only appear in weights")
# shared joint cubes between rigs
def cubes_used(bs):
    s = set()
    for b in bs.values():
        for e in ("head", "tail"):
            if "cube_name" in b[e]: s.add(b[e]["cube_name"])
    return s
cu = {k: cubes_used(v) for k, v in R.items()}
out["joint_cubes_used"] = {k: len(v) for k, v in cu.items()}
out["joint_cube_overlap"] = dict(game_engine_subset_of_default=bool(cu["game_engine"] <= cu["default"]), game_engine_only=sorted(cu["game_engine"] - cu["default"]),
                                 default_not_in_game_engine=len(cu["default"] - cu["game_engine"]),
                                 rigify_human_toes_not_in_default=sorted(cu["rigify_human_toes"] - cu["default"]), obj_has_cubes=125)
# game_engine -> default correspondence by head cube
head_cube = lambda b: b["head"].get("cube_name")
dflt_by_head = collections.defaultdict(list)
for n, b in R["default"].items(): dflt_by_head[head_cube(b)].append(n)
corr = {}
for n, b in R["game_engine"].items():
    corr[n] = dict(head_cube=head_cube(b), tail_cube=b["tail"].get("cube_name"), default_bones_sharing_head_cube=dflt_by_head.get(head_cube(b), []))
out["game_engine_to_default_by_head_cube"] = corr
out["game_engine_bones_with_no_default_bone_sharing_head_cube"] = [n for n, c in corr.items() if not c["default_bones_sharing_head_cube"]]
# hierarchy facts
def depth_stats(bs):
    d = {}
    def f(n):
        if n in d: return d[n]
        p = bs[n]["parent"]; d[n] = 0 if (p == "" or p not in bs) else f(p) + 1; return d[n]
    for n in bs: f(n)
    return dict(max_depth=max(d.values()), mean_depth=float(np.mean(list(d.values()))))
out["depth"] = {k: depth_stats(v) for k, v in R.items()}
out["limb_chain"] = dict(
    default=dict(spine=["root", "pelvis.L/R(leg roots)", "spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "neck02", "neck03", "head"],
                 arm=["clavicle.L", "shoulder01.L", "upperarm01.L", "upperarm02.L", "lowerarm01.L", "lowerarm02.L", "wrist.L"],
                 leg=["pelvis.L", "upperleg01.L", "upperleg02.L", "lowerleg01.L", "lowerleg02.L", "foot.L", "toe*"]),
    game_engine=dict(spine=["Root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"], arm=["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"], leg=["thigh_l", "calf_l", "foot_l", "ball_l"]),
    rigify_metarig=dict(spine=["spine", "spine.001..006"], arm=["shoulder.L", "upper_arm.L", "forearm.L", "hand.L"], leg=["pelvis.L", "thigh.L", "shin.L", "foot.L", "toe.L"]))
# verify the chain claims against data
chk = {}
def parent_chain(bs, n):
    c = []
    while n and n in bs: c.append(n); n = bs[n]["parent"]
    return c
chk["default_upperarm02_parent"] = R["default"]["upperarm02.L"]["parent"]; chk["default_lowerarm01_parent"] = R["default"]["lowerarm01.L"]["parent"]
chk["default_spine_parent_chain_from_head"] = parent_chain(R["default"], "head")
chk["game_engine_head_parent_chain"] = parent_chain(R["game_engine"], "head")
chk["default_upperleg01_chain"] = parent_chain(R["default"], "lowerleg02.L")
chk["game_engine_calf_chain"] = parent_chain(R["game_engine"], "calf_l")
out["chain_verification"] = chk
# ----- rigify specifics ------
h, ht = raw["rigify_human"], raw["rigify_human_toes"]
bh, bt = set(h["bones"]), set(ht["bones"])
out["rigify"] = dict(
    n_bones_human=len(bh), n_bones_human_toes=len(bt), only_in_toes=sorted(bt - bh), only_in_human=sorted(bh - bt),
    shared_bones_with_different_json=[n for n in bh & bt if h["bones"][n] != ht["bones"][n]][:30],
    n_shared_bones_with_different_json=len([n for n in bh & bt if h["bones"][n] != ht["bones"][n]]),
    collections=len(h["collections"]), collections_toes=len(ht["collections"]), extra_bones=h["extra_bones"], scale_factor=h["scale_factor"], version=h["version"],
    rigify_types=dict(collections.Counter((b.get("rigify") or {}).get("rigify_type") for b in h["bones"].values())),
    n_bones_with_constraints=sum(1 for b in h["bones"].values() if b.get("constraints")),
    constraint_types=dict(collections.Counter(c["type"] for b in h["bones"].values() for c in b.get("constraints", []))),
    n_roots_parent_empty=sum(1 for b in h["bones"].values() if b["parent"] == ""),
    strategies_extra=dict(collections.Counter(b[e]["strategy"] for b in h["bones"].values() for e in ("head", "tail"))),
    n_with_offset=sum(1 for b in h["bones"].values() for e in ("head", "tail") if "offset" in b[e]),
    roll_strategies=dict(collections.Counter(b.get("roll_strategy") for b in h["bones"].values())),
    rotation_modes=dict(collections.Counter(b.get("rotation_mode") for b in h["bones"].values())),
    default_standard_bones_have_constraints=any("constraints" in b for b in R["default"].values()),
    rigify_ground_frame_offset_z_m=0.818305)
ws = load_json(os.path.join(OUT, "weights_summary.json"))
out["weights_files"] = {k: dict(n_bones=v["n_bones_in_weight_file"], n_entries=v["n_entries"], mean_infl_body=v["influences_body_vertices"]["mean"], max_infl_body=v["influences_body_vertices"]["max"],
                                pct_single=v["pct_body_vertices_single_influence"], pct_le4=v["pct_body_vertices_le4_influences"], n_unweighted_vertices=v["n_vertices_without_any_weight"],
                                size_bytes=os.path.getsize(WEIGHTS[k])) for k, v in ws.items()}
out["weights_files_note"] = "no weights file for rigify human (without toes) in the approved set -> only human_toes weights can be analysed"
out["weights_file_meta"] = {k: v["meta"] for k, v in ws.items()}
out["category_counts_note"] = "category counts are a name-regex heuristic (see CATS in script), indicative only"
write_json("rig_differences.json", out)
print(json.dumps({k: out[k] for k in ("bone_counts", "category_counts", "joint_cubes_used", "joint_cube_overlap", "depth", "chain_verification", "weights_files", "game_engine_bones_with_no_default_bone_sharing_head_cube")}, indent=1))
print({k: out["rigify"][k] for k in ("n_bones_human", "n_bones_human_toes", "only_in_toes", "only_in_human", "n_shared_bones_with_different_json", "collections", "rigify_types", "constraint_types", "n_roots_parent_empty", "n_with_offset","n_bones_with_constraints")})
