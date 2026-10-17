#!/usr/bin/env python3
"""[f807/sweep] Shared runner: cut one sheet with cut_alpha_sweep.py (shy engine, per-sheet geometry only),
then write source / cut / mask / pockets map / report.json / verify.json / proofs. Offline only."""
import importlib.util, json, hashlib, os, shutil, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

D0 = '/workspace/f807/bridge/engine/'
OUTROOT = '/workspace/f807/bridge/cut/'
REPO = '/workspace/r66/'
spec = importlib.util.spec_from_file_location('ca', D0 + 'cut_alpha_sweep.py')
ca = importlib.util.module_from_spec(spec); spec.loader.exec_module(ca)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
DARK = (0x1c, 0x19, 0x16); BEIGE = (0xef, 0xec, 0xe6)
font = ImageFont.load_default()


def png_chunks(path):
    d = open(path, 'rb').read(); i = 8; out = []
    while i < len(d):
        n = struct.unpack('>I', d[i:i + 4])[0]; out.append(d[i + 4:i + 8].decode()); i += 12 + n
    return [c for i, c in enumerate(out) if c not in ('IDAT',) or out[:i].count('IDAT') == 0]


def gamma_tag(path):
    d = open(path, 'rb').read(); i = 8; info = {}
    while i < len(d):
        n = struct.unpack('>I', d[i:i + 4])[0]; t = d[i + 4:i + 8].decode(); body = d[i + 8:i + 8 + n]
        if t == 'gAMA': info['gAMA'] = struct.unpack('>I', body)[0] / 100000.0
        if t == 'cHRM': info['cHRM'] = [v / 100000.0 for v in struct.unpack('>8I', body)]
        if t == 'sRGB': info['sRGB'] = body[0]
        if t == 'iCCP': info['iCCP'] = body.split(b'\0')[0].decode('latin1')
        i += 12 + n
    return info


def lab_text(img, t):
    d = ImageDraw.Draw(img); d.rectangle([0, 0, len(t) * 6 + 8, 14], fill=(0, 0, 0)); d.text((4, 2), t, fill=(255, 255, 255), font=font); return img


def over(im, col):
    bg = Image.new('RGBA', im.size, col + (255,)); bg.alpha_composite(im); return bg.convert('RGB')


def runtime_punch(rgb):
    """numpy copy of src/lib/punch-white.ts punchStudioWhite on an opaque RGB sheet (what live shows)."""
    src = rgb.astype(int); H, W, _ = src.shape
    mx, mn = src.max(2), src.min(2); w = (mn >= 238) & (mx - mn <= 18)
    lab, n = ndi.label(w); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    pa = np.where(np.isin(lab, list(edge)), 0, 255).astype(np.int32)
    cand = (mn >= 224) & (mx - mn <= 24) & (pa > 0)
    ys, xs = np.nonzero(cand)
    for i in np.argsort(ys * W + xs):
        y, x = ys[i], xs[i]
        if not ((x > 0 and pa[y, x - 1] == 0) or (x < W - 1 and pa[y, x + 1] == 0) or (y > 0 and pa[y - 1, x] == 0) or (y < H - 1 and pa[y + 1, x] == 0)): continue
        t = min(1, max(0, (mn[y, x] - 224) / (255 - 224))); pa[y, x] = round(pa[y, x] * (1 - t))
    return np.dstack([rgb, pa.astype(np.uint8)]), lab, w, edge


def runtime_punch_rgba(rgba):
    """numpy copy of punchStudioWhite on an RGBA sheet (isStudioWhite ignores a<8; flood seeds from the edge; fringe pass)."""
    H, W, _ = rgba.shape; rgb = rgba[..., :3].astype(int); a0 = rgba[..., 3].astype(int)
    mx, mn = rgb.max(2), rgb.min(2); w = (mn >= 238) & (mx - mn <= 18) & (a0 >= 8)
    lab, n = ndi.label(w); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    pa = np.where(np.isin(lab, list(edge)), 0, a0).astype(np.int64)
    cand = (mn >= 224) & (mx - mn <= 24) & (pa > 0)
    ys, xs = np.nonzero(cand)
    for i in np.argsort(ys * W + xs):
        y, x = ys[i], xs[i]
        if not ((x > 0 and pa[y, x - 1] == 0) or (x < W - 1 and pa[y, x + 1] == 0) or (y > 0 and pa[y - 1, x] == 0) or (y < H - 1 and pa[y + 1, x] == 0)): continue
        t = min(1, max(0, (mn[y, x] - 224) / (255 - 224))); pa[y, x] = int(np.floor(pa[y, x] * (1 - t) + 0.5))
    out = rgba.copy(); out[..., 3] = pa.astype(np.uint8); out[pa == 0, :3] = 0
    return out


def halo_px(rgba):
    a = rgba[..., 3]; rgb = rgba[..., :3].astype(int)
    return (a > 0) & (rgb.min(2) >= 200) & ndi.binary_dilation(a == 0, structure=np.ones((3, 3)))


def resolve_seed(rgb, hint):
    """hint = approx bbox [x0,y0,x1,y1] of an enclosed white comp -> seed (x,y) at max distance-transform inside it."""
    mx, mn = rgb.max(2).astype(int), rgb.min(2).astype(int)
    white = (mn >= ca.STUDIO_LUMA_MIN) & (mx - mn <= ca.STUDIO_CHROMA_MAX)
    lab, n = ndi.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    objs = ndi.find_objects(lab); best = None
    for l in range(1, n + 1):
        if l in edge: continue
        sl = objs[l - 1]; bb = [sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1]
        d = sum(abs(a - b) for a, b in zip(bb, hint))
        if best is None or d < best[0]: best = (d, l, sl)
    d, l, sl = best
    assert d <= 12, f'no enclosed comp near {hint} (closest off by {d})'
    m = lab[sl] == l; dt = ndi.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]
    yy, xx = np.unravel_index(np.argmax(dt), dt.shape)
    return (int(xx + sl[1].start), int(yy + sl[0].start)), int(m.sum())


def shoe_slivers(rgb, shoe_top):
    """enclosed 2..8px white specks at/below the shoe tops that sit within 4px of edge-connected background."""
    mx, mn = rgb.max(2).astype(int), rgb.min(2).astype(int)
    white = (mn >= 238) & (mx - mn <= 18); lab, n = ndi.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    E = np.isin(lab, list(edge)); dist = ndi.distance_transform_edt(~E)
    sz = np.bincount(lab.ravel()); objs = ndi.find_objects(lab); pts = []
    for l in range(1, n + 1):
        if l in edge or not (2 <= sz[l] <= 8): continue
        sl = objs[l - 1]
        if sl[0].start < shoe_top: continue
        m = lab[sl] == l
        if dist[sl][m].min() <= 4:
            ys, xs = np.nonzero(m); pts.append((int(xs[0] + sl[1].start), int(ys[0] + sl[0].start)))
    return sorted(pts, key=lambda p: (p[1], p[0]))


def shoe_top(rgb):
    """first row (below y=0.82H) with brown leather pixels (r-b>35, 60<r<200, >=4 px per row): the shoe tops. Shy: 1141 -> floor zone starts 1150."""
    a = rgb.astype(int); H = a.shape[0]
    br = (a[..., 0] - a[..., 2] > 35) & (a[..., 0] < 200) & (a[..., 0] > 60)
    y0 = int(H * 0.82); ys = np.nonzero(br[y0:].sum(1) >= 4)[0] + y0
    return int(ys.min())


def auto_zones(rgb, ahoge_ymax=150, band=(150, 600), xsplit=360):
    """Family zones derived the way the shy ones were: unmix zone and hair zones stop just above the shoulder lines.
    shy: left shoulder-white top 262 -> left zone y1 261; right top 251 -> right zone y1 246 (=top-5); unmix y1 246 = min(top)-5."""
    mx, mn = rgb.max(2).astype(int), rgb.min(2).astype(int)
    white = (mn >= 238) & (mx - mn <= 18); lab, n = ndi.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sz = np.bincount(lab.ravel()); objs = ndi.find_objects(lab); L = []; R = []
    for l in range(1, n + 1):
        if l in edge or sz[l] < 1000: continue
        sl = objs[l - 1]; y0 = sl[0].start
        if not (band[0] <= y0 < band[1]): continue
        cx = (sl[1].start + sl[1].stop) / 2
        (L if cx < xsplit else R).append(y0)
    lt = min(L) if L else 262; rt = min(R) if R else 251
    return [(0, 0, 300, min(261, lt - 1)), (440, 0, 720, min(246, rt - 5))], (0, 0, 720, min(246, min(lt, rt) - 5)), (lt, rt)


def bust_seeds(rgb, minpx=8):
    """Bust/Expo sheets (card ~247 grey, not 255): an enclosed studio-white comp is background when its core matches the card colour
    (|median-card|<=5 per channel, channel spread<=1.5) and it is walled by figure pixels (ring light<=55%). Clothing white / skirt stripes
    are warmer or brighter than the card and are never matched. Returns (seeds_by_group, shoulder_top_y, card, rejected_near_misses)."""
    a = rgb.astype(int); mx, mn = a.max(2), a.min(2); w = (mn >= 238) & (mx - mn <= 18)
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    lab, n = ndi.label(w); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    E = np.isin(lab, list(edge)); card = np.median(a[E], 0)
    sz = np.bincount(lab.ravel()); objs = ndi.find_objects(lab); pts = []; near = []; big_top = []
    for l in range(1, n + 1):
        if l in edge or sz[l] < minpx: continue
        sl = objs[l - 1]; pad = 5
        y0, y1 = max(0, sl[0].start - pad), sl[0].stop + pad; x0, x1 = max(0, sl[1].start - pad), sl[1].stop + pad
        m = lab[y0:y1, x0:x1] == l; ring = ndi.binary_dilation(m, iterations=3) & ~m & ~w[y0:y1, x0:x1]
        r = L[y0:y1, x0:x1][ring]
        if sz[l] >= 3000: big_top.append(sl[0].start)
        if ring.sum() == 0: continue
        core = ndi.binary_erosion(m, iterations=1); v = a[y0:y1, x0:x1][core if core.sum() >= 8 else m]
        med = np.median(v, 0); d = float(np.abs(med - card).max()); spread = float(med.max() - med.min()); light = float(np.mean(r >= 170))
        dt = ndi.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]; yy, xx = np.unravel_index(np.argmax(dt), dt.shape)
        rec = ((int(xx + x0), int(yy + y0)), int(sz[l]), d, spread, light)
        if d <= 5 and spread <= 1.5 and light <= 0.55: pts.append(rec)
        elif sz[l] >= 100 and light <= 0.55 and float(np.mean(r < 90)) >= 0.28: near.append(rec + ([sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1],))
    return pts, (min(big_top) if big_top else None), [float(c) for c in card], near


def ring_seeds(rgb, ymax, minpx, dark, light, xmin=0, xmax=10**9):
    a = rgb.astype(int); mx, mn = a.max(2), a.min(2); w = (mn >= 238) & (mx - mn <= 18)
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    lab, n = ndi.label(w); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sz = np.bincount(lab.ravel()); objs = ndi.find_objects(lab); pts = []
    for l in range(1, n + 1):
        if l in edge or sz[l] < minpx: continue
        sl = objs[l - 1]
        if sl[0].stop > ymax: continue
        pad = 5; y0, y1 = max(0, sl[0].start - pad), sl[0].stop + pad; x0, x1 = max(0, sl[1].start - pad), sl[1].stop + pad
        m = lab[y0:y1, x0:x1] == l; ring = ndi.binary_dilation(m, iterations=3) & ~m & ~w[y0:y1, x0:x1]
        if ring.sum() == 0: continue
        r = L[y0:y1, x0:x1][ring]
        if np.mean(r < 90) >= dark and np.mean(r >= 170) <= light:
            dt = ndi.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]; yy, xx = np.unravel_index(np.argmax(dt), dt.shape)
            pts.append(((int(xx + x0), int(yy + y0)), int(sz[l]), [sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1]))
    return pts


def hole_seeds(rgb, oa):
    """RGBA sources only: enclosed white comps (after flattening) that were already transparent in the source
    (>50% of the comp has alpha<8) must stay transparent, so they are seeded explicitly."""
    a = rgb.astype(int); mx, mn = a.max(2), a.min(2); w = (mn >= 238) & (mx - mn <= 18)
    lab, n = ndi.label(w); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sz = np.bincount(lab.ravel()); objs = ndi.find_objects(lab); pts = []
    tr = np.bincount(lab.ravel(), weights=(oa < 8).ravel().astype(float), minlength=n + 1)
    for l in range(1, n + 1):
        if l in edge or tr[l] / sz[l] <= 0.5: continue
        sl = objs[l - 1]; m = lab[sl] == l
        dt = ndi.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]; yy, xx = np.unravel_index(np.argmax(dt), dt.shape)
        pts.append(((int(xx + sl[1].start), int(yy + sl[0].start)), int(sz[l])))
    return pts


def run(cfg):
    key = cfg['key']; out = OUTROOT + key + '/'; os.makedirs(out + 'work', exist_ok=True)
    src_repo = cfg['abs_file'] if cfg.get('abs_file') else REPO + 'public/' + cfg['file']
    src_png = out + key + '_source.png'; shutil.copyfile(src_repo, src_png)
    im0 = Image.open(src_png); mode = im0.mode
    if cfg.get('rgba_source'):
        assert mode == 'RGBA', f'{key}: source is {mode}'
        src_rgba = np.asarray(im0).copy(); aa = src_rgba[..., 3:4].astype(np.float64) / 255.0
        rgb = np.round(src_rgba[..., :3] * aa + 255.0 * (1 - aa)).astype(np.uint8)   # flatten on studio white: the matte model the method assumes
    else:
        assert mode == 'RGB', f'{key}: source is {mode}'
        rgb = ca.load_rgb(src_png)
    H, W, _ = rgb.shape
    # geometry
    if cfg.get('bust'):
        pts, top, card, near = bust_seeds(rgb)
        cfg['pockets'] = {}
        cfg['bust_seed_list'] = [[list(p[0]), p[1]] for p in pts]; cfg['bust_card'] = card
        cfg['bust_near_misses_not_seeded'] = [{'bbox': n[5], 'px': n[1], 'dcard': n[2], 'spread': n[3], 'ring_light': round(n[4], 2)} for n in near]
        cfg['hair_zones'] = []; cfg['unmix_zone'] = (0, 0, W, max(0, top - 5)); cfg['floor_zone'] = (0, H, W, H); cfg['shoulder_top'] = top
        cfg['pre_seeds'] = [p[0] for p in pts]
    if cfg.get('zones') == 'auto':
        hz, uz, tops = auto_zones(rgb); cfg['hair_zones'] = hz; cfg['unmix_zone'] = uz; cfg['shoulder_tops_LR'] = tops
    if cfg.get('shoe') == 'auto':
        st = shoe_top(rgb); cfg['shoe_top'] = st; cfg['floor_zone'] = (0, st + 9, W, H); cfg['slivers_from'] = st
    seeds = {}; pocket_hint_px = {}
    if cfg.get('rgba_source'):
        hs = hole_seeds(rgb, src_rgba[..., 3])
        cfg['hole_list'] = [{'seed': list(p[0]), 'px': p[1]} for p in hs]
        if hs: seeds['holes already transparent in the RGBA source'] = [p[0] for p in hs]
    if cfg.get('auto_ring'):
        ar = ring_seeds(rgb, **cfg['auto_ring'])
        cfg['auto_ring_list'] = [{'seed': list(p[0]), 'px': p[1], 'bbox': p[2]} for p in ar]
        seeds['enclosed hair/neck gaps (ring: dark>=%.2f, light<=%.2f, y<%d)' % (cfg['auto_ring']['dark'], cfg['auto_ring']['light'], cfg['auto_ring']['ymax'])] = [p[0] for p in ar]
    for name, hints in cfg['pockets'].items():
        pts = []
        for h in hints:
            p, px = resolve_seed(rgb, h); pts.append(p); pocket_hint_px[str(p)] = px
        seeds[name] = pts
    if cfg.get('pre_seeds'): seeds['enclosed background gaps (card-colour match)'] = cfg['pre_seeds']
    if cfg.get('slivers_from') is not None:
        sl = shoe_slivers(rgb, cfg['slivers_from'])
        if sl: seeds['shoe-edge slivers'] = sl
    ca.configure(dict(SEEDS=seeds, HAIR_ZONES=cfg['hair_zones'], HAIR_UNMIX_ZONE=cfg['unmix_zone'], FLOOR_ZONE=cfg['floor_zone']))
    alpha, lab, picked, bg, matte = ca.build_mask(rgb)
    rgba = ca.apply_mask(rgb, alpha, matte)
    cut_p = out + key + '_cut.png'; mask_p = out + key + '_alpha_mask.png'; map_p = out + key + '_pockets_map.png'
    Image.fromarray(rgba, 'RGBA').save(cut_p, optimize=True)       # PIL writes no gAMA/cHRM/iCCP/sRGB
    Image.fromarray(alpha, 'L').save(mask_p, optimize=True)
    rev = rgb.copy(); pk = np.isin(lab, list(picked)); eb = bg & ~pk
    rev[eb] = (rev[eb] * 0.35 + np.array([60, 90, 255]) * 0.65).astype(np.uint8); rev[pk] = [255, 40, 40]
    Image.fromarray(rev).save(map_p, optimize=True)
    if cfg.get('rgba_source'):
        before = runtime_punch_rgba(src_rgba)
    else:
        before, lab2, w, edge = runtime_punch(rgb)
    Image.fromarray(before, 'RGBA').save(out + 'work/before_runtime_punch.png')
    al = rgba[..., 3]
    # ---- pocket accounting
    pockets = {}; comps = {}; hair_list = []
    for l, nm in picked.items():
        n = int((lab == l).sum()); pockets[nm] = pockets.get(nm, 0) + n; comps[nm] = comps.get(nm, 0) + 1
        if nm == 'hair halo gap' and n >= 40:
            ys, xs = np.nonzero(lab == l); hair_list.append([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), n])
    per_seed = {}
    for nm, pts in seeds.items():
        per_seed[nm] = [{'seed': list(p), 'px': int((lab == lab[p[1], p[0]]).sum())} for p in pts]
    hb, ha = halo_px(before), halo_px(rgba)
    changed_opaque = int(((al == 255) & (rgba[..., :3] != rgb).any(2)).sum())
    rgba_diff = None
    if cfg.get('rgba_source'):
        oa = src_rgba[..., 3]
        lost = (oa == 255) & (al < 255)
        rgba_diff = {'orig_alpha255_px': int((oa == 255).sum()), 'orig_alpha255_now_soft_or_clear': int(lost.sum()),
                     'of_which_inside_seeded_pockets_or_edge_bg': int((lost & (bg | np.isin(lab, list(picked)))).sum()),
                     'orig_alpha255_rgb_changed_where_still_255': int(((oa == 255) & (al == 255) & (rgba[..., :3] != src_rgba[..., :3]).any(2)).sum()),
                     'orig_alpha0_now_visible': int(((oa == 0) & (al > 0)).sum()),
                     'orig_soft_px': int(((oa > 0) & (oa < 255)).sum()), 'new_soft_px': int(((al > 0) & (al < 255)).sum())}
    near_bg = ndi.distance_transform_edt(~bg)
    floor = np.zeros(bg.shape, bool); x0, y0, x1, y1 = cfg['floor_zone']; floor[y0:y1, x0:x1] = True
    soft = al < 255
    rep = {
        'sheet': key, 'repo_path': 'public/' + cfg['file'], 'repo_commit': cfg['commit'],
        'source': {'sha256': sha(src_png), 'sha256_equals_repo_file': sha(src_png) == sha(src_repo), 'mode': mode, 'size': [W, H],
                   'bytes': os.path.getsize(src_png), 'png_color_tags': gamma_tag(src_png), 'chunks': png_chunks(src_png)},
        'cut': {'path': cut_p, 'sha256': sha(cut_p), 'mode': 'RGBA', 'size': [W, H], 'bytes': os.path.getsize(cut_p),
                'png_color_tags': gamma_tag(cut_p), 'chunks': png_chunks(cut_p)},
        'mask_sha256': sha(mask_p),
        'params': {'studio_white': 'min>=238, chroma<=18 (not loosened)', 'SEEDS': seeds, 'HAIR_ZONES': cfg['hair_zones'],
                   'HAIR_UNMIX_ZONE': cfg['unmix_zone'], 'FLOOR_ZONE': cfg['floor_zone'], 'shoe_top_row': cfg.get('shoe_top'), 'shoulder_white_tops_LR': cfg.get('shoulder_tops_LR'), 'engine': 'cut_alpha_sweep.py (== shy engine; only geometry configured)'},
        'pockets_px': {'edge-connected studio white': int(eb.sum()), **pockets},
        'pocket_components': comps, 'per_seed_px': per_seed,
        'hair_halo_gaps_ge40px [x0,y0,x1,y1,px]': hair_list,
        'alpha': {'zero': int((al == 0).sum()), 'soft': int(((al > 0) & (al < 255)).sum()), 'opaque': int((al == 255).sum())},
        'halo_near_white_touching_transparent': {'before_runtime_punch': int(hb.sum()), 'after_cut': int(ha.sum())},
        'character_pixels_repainted (alpha==255 and rgb != source)': changed_opaque,
        'max_dist_of_soft_px_from_background_outside_floor_zone': float(near_bg[soft & ~floor].max()) if (soft & ~floor).any() else 0,
        'rgba_source_diff': rgba_diff, 'rgba_source_transparent_holes_kept': cfg.get('hole_list'),
        'notes': cfg.get('notes', ''),
        'auto_ring_seeds': cfg.get('auto_ring_list'), 'bust_card_colour': cfg.get('bust_card'), 'bust_near_misses_not_seeded': cfg.get('bust_near_misses_not_seeded'),
    }
    json.dump(rep, open(out + 'report.json', 'w'), indent=1, default=int)
    verify(cfg, out, key, rgb, before, rgba, lab, picked, seeds)
    proofs(cfg, out, key, before, rgba)
    open(out + 'README.md', 'w').write(
        f"# Star Rai {key}: offline RGBA cut (art-only, not shipped)\nSource: r66 main {cfg['commit']} public/{cfg['file']} (RGB {W}x{H}, sha {rep['source']['sha256'][:8]}...) -> {key}_source.png (byte copy)\n"
        f"Cut:    {key}_cut.png (RGBA, sha {rep['cut']['sha256'][:8]}..., no gAMA/cHRM/iCCP), mask {key}_alpha_mask.png, review map {key}_pockets_map.png\n"
        f"Engine: ../cut_alpha_sweep.py (= shy engine; only SEEDS/zones configured per sheet, see report.json params)\nRun: python3 ../run_sweep.py {key}\n"
        f"BEFORE in proofs = numpy re-implementation of src/lib/punch-white.ts punchStudioWhite on the source (what live shows).\n{cfg.get('notes','')}\n")
    return rep


def verify(cfg, out, key, rgb, before, cut, lab, picked, seeds):
    src = rgb.astype(int); al = cut[..., 3]
    mx, mn = src.max(2), src.min(2); w = (mn >= 238) & (mx - mn <= 18)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    def stats(rgba):
        a = rgba[..., 3]; r = rgba[..., :3].astype(int); vis = a > 0
        t0 = ndi.binary_dilation(a == 0, structure=np.ones((3, 3))); nw = r.min(2) >= 200
        return {'visible near-white touching transparency (rgb min>=200, 8-conn)': int((vis & nw & t0).sum()),
                '  of which alpha>=64': int((vis & nw & t0 & (a >= 64)).sum()),
                'visible studio-white px total': int((vis & w).sum()),
                'corner alpha': [int(a[0, 0]), int(a[0, -1]), int(a[-1, 0]), int(a[-1, -1])]}
    res = {'before (runtime punch-white.ts sim)': stats(before), 'after (cut)': stats(cut)}
    sizes = np.bincount(lab.ravel()); n = lab.max()
    kept = [l for l in range(1, n + 1) if l not in edge and l not in picked]
    K = np.isin(lab, kept)
    res['kept enclosed white comps (not seeded / not hair-gap)'] = len(kept); res['kept white px'] = int(K.sum())
    res['kept white px not alpha255'] = int((al[K] < 255).sum())
    bad = K & (al < 255); bl, bn = ndi.label(bad, structure=np.ones((3, 3)))
    res['kept-white soft clusters (x,y,px,min_a)'] = [((o[1].start + o[1].stop) // 2, (o[0].start + o[0].stop) // 2, int((bl[o] == i + 1).sum()), int(al[o][bl[o] == i + 1].min())) for i, o in enumerate(ndi.find_objects(bl))]
    big = [l for l in kept if sizes[l] >= 15]
    res['big kept white comps (>=15px) all alpha255'] = bool(all((al[lab == l] == 255).all() for l in big))
    res['big kept comps not fully 255'] = [(int(l), int(sizes[l]), int((al[lab == l] < 255).sum())) for l in big if not (al[lab == l] == 255).all()]
    res['character pixels repainted (alpha==255 and rgb != source)'] = int(((al == 255) & (cut[..., :3] != rgb).any(2)).sum())
    for nm, pts in seeds.items():
        P = np.isin(lab, [lab[y, x] for x, y in pts]); core = ndi.binary_erosion(P, iterations=3)
        res['pocket ' + nm] = {'px': int(P.sum()), 'a0': int((al[P] == 0).sum()), 'soft_rim': int(((al[P] > 0) & (al[P] < 255)).sum()),
                               'opaque': int((al[P] == 255).sum()), 'max_a': int(al[P].max()), 'core_all_a0': bool((al[core] == 0).all()) if core.any() else None}
    json.dump(res, open(out + 'verify.json', 'w'), indent=1, default=int)
    return res


def proofs(cfg, out, key, before, cut):
    b = Image.fromarray(before, 'RGBA'); a = Image.fromarray(cut, 'RGBA'); W, H = a.size
    g = Image.new('RGB', (W * 4, H))
    for i, (im, col, t) in enumerate([(b, DARK, 'BEFORE live runtime punch / dark'), (a, DARK, 'AFTER cut / dark'), (b, BEIGE, 'BEFORE / beige #efece6'), (a, BEIGE, 'AFTER / beige #efece6')]):
        g.paste(lab_text(over(im, col), t), (i * W, 0))
    g.save(out + 'proof_before_after.png', optimize=True)
    def zoom(box, fn, sc=3):
        x0, y0, x1, y1 = box; x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1); box = (x0, y0, x1, y1)
        w, h = x1 - x0, y1 - y0
        o = Image.new('RGB', (w * sc * 2 + 6, h * sc), (255, 0, 255))
        o.paste(lab_text(over(b, DARK).crop(box).resize((w * sc, h * sc), Image.NEAREST), 'BEFORE'), (0, 0))
        o.paste(lab_text(over(a, DARK).crop(box).resize((w * sc, h * sc), Image.NEAREST), 'AFTER'), (w * sc + 6, 0))
        o.save(fn, optimize=True)
    for nm, box in cfg['zooms'].items(): zoom(tuple(box), out + f'proof_zoom3x_{nm}_dark.png')
    def halo(im):
        arr = np.array(im); m = halo_px(arr)
        base = np.array(over(im, DARK)); base[ndi.binary_dilation(m, iterations=2)] = (255, 0, 0)
        return Image.fromarray(base), int(m.sum())
    hb, nb = halo(b); ha, na = halo(a)
    hc = Image.new('RGB', (W * 2, H)); hc.paste(lab_text(hb, f'BEFORE halo px={nb} (red)'), (0, 0)); hc.paste(lab_text(ha, f'AFTER halo px={na} (red)'), (W, 0))
    hc.save(out + 'proof_halo_check.png', optimize=True)
