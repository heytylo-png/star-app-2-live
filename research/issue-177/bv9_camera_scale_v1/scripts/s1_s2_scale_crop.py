#!/usr/bin/env python3
"""Steps 1-2 (frozen method METHOD_AND_CRITERIA_FROZEN.md). usage: s1_s2_scale_crop.py <run_tag>  -> data/step12_<tag>.json, contours/*.png
Read-only on references and geometry. Uses unchanged refseg/s05 via compat."""
import sys, os, json, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compat as X
import numpy as np, cv2
S, RS = X.S, X.RS
ROOT = X.ROOT; tag = sys.argv[1]
REFD = RS.D
MAN = REFD + 'REFERENCE_MANIFEST.json'
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
OUT = {'run': tag}
# ---- input verification ------------------------------------------------------
OUT['manifest_sha256'] = sha(MAN); assert OUT['manifest_sha256'].startswith('c972df6a') and OUT['manifest_sha256'].endswith('5fef'), 'manifest hash mismatch'
man = json.load(open(MAN)); imgs = man['images']; assert len(imgs) == 9
OUT['geom_sha256'] = sha(ROOT + '/work/bv9_geom.npz'); assert OUT['geom_sha256'].startswith('f7b8d84c')
ver = []
for e in imgs:
    a = sha(REFD + e['filename']); ver.append(dict(file=e['filename'], expected=e['sha256'], actual=a, match=a == e['sha256']))
assert all(v['match'] for v in ver), 'reference hash mismatch -> STOP'
OUT['reference_hashes'] = ver
ZC, ZS = S.ZCROWN, S.ZSOLE; DZ = ZC - ZS
OUT['model'] = dict(z_crown_mm=ZC, z_sole_mm=ZS, sole_to_crown_mm=DZ)
KEY = {'02_full_body_front_wireframe.jpg': 'front', '03_full_body_side_wireframe.jpg': 'side', '04_full_body_back_wireframe.jpg': 'back'}
def rows_D1(m):
    ys = np.nonzero(m.any(1))[0]; return int(ys.min()), int(ys.max()) + 1
def rows_count(m, k=5):
    c = m.sum(1); ys = np.nonzero(c >= k)[0]; return int(ys.min()), int(ys.max()) + 1
masks = {}; per = []
for e in imgs:
    fn = e['filename']; key = KEY.get(fn, 'img' + fn[:2])
    if key not in RS.FILES: RS.FILES[key] = fn          # run-time registration only; refseg.py unchanged
    im = cv2.imread(REFD + fn); H_img, W_img = im.shape[:2]
    m, _, info = RS.segment(key, tex_thr=4.0); masks[key] = m
    top, sole = rows_D1(m); Hpx = sole - top
    var = {}
    for thr in (3.0, 6.0):
        mv = RS.segment(key, tex_thr=thr)[0]; t, s_ = rows_D1(mv); var[f'tex{thr}'] = dict(top=t, sole=s_, H=s_ - t)
    t, s_ = rows_count(m); var['rowcount5'] = dict(top=t, sole=s_, H=s_ - t)
    u = max(abs(v['H'] - Hpx) for v in var.values())
    n0 = [int(m[r].sum()) for r in range(5)]
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    edge_len = int(sum(int((c[:, 0, 1] == 0).sum()) for c in cs))
    crop = 'CROPPED' if (top == 0 and n0[0] >= 10) else ('TOUCHING/inconclusive' if top <= 2 else 'NOT CROPPED')
    full = key in ('front', 'side', 'back')
    rec = dict(file=fn, view=key, width_px=W_img, height_px=H_img, manifest_w=e['width_px'], manifest_h=e['height_px'],
               top_row_D1=top, sole_row_D1=sole, H_px_D1=Hpx, variants=var, detection_uncertainty_px=u,
               implied_px_per_mm=Hpx / DZ,
               scale_status=('crown landmark (bald skull)' if key in ('side', 'back') else
                             ('NOT a scale landmark: top is hair / image edge (front)' if key == 'front' else 'NOT VERIFIABLE (close-up, not full-body)')),
               fg_px_rows0to4=n0, contour_px_on_top_edge=edge_len, crop_class=crop, segmentation_components_kept=info['n_components_kept'])
    if not full:
        rec['note'] = 'close-up: refseg background model was designed for the full-body sheets; rows are as detected, not validated'
    per.append(rec)
OUT['per_image'] = per
P = {r['view']: r for r in per}
# ---- D3 width-profile mirror match (front vs back) ----------------------------
def width_profile(m, sole):
    ys = np.nonzero(m.any(1))[0]; w = []
    for y in ys:
        xs = np.nonzero(m[y])[0]; w.append((sole - (y + 0.5), xs[-1] + 1 - xs[0]))
    a = np.array(w, float); return a[np.argsort(a[:, 0])]
Hb = P['back']['H_px_D1']
wf = width_profile(masks['front'], P['front']['sole_row_D1']); wb = width_profile(masks['back'], P['back']['sole_row_D1'])
selb = (wb[:, 0] >= 0.03 * Hb) & (wb[:, 0] <= 0.75 * Hb); hb, Wb = wb[selb, 0], wb[selb, 1]
def cost(r): return float(np.mean(np.abs(np.interp(r * hb, wf[:, 0], wf[:, 1]) - r * Wb)))
grid = np.round(np.arange(0.90, 1.10 + 1e-9, 0.0005), 4); cg = np.array([cost(r) for r in grid])
r_fb = float(grid[int(np.argmin(cg))])
OUT['D3_width_mirror'] = dict(r_fb=r_fb, cost_at_r_fb_px=float(cg.min()), cost_at_1_px=cost(1.0), n_rows=int(selb.sum()),
                              h_range_px=[0.03 * Hb, 0.75 * Hb], cost_curve=[[float(a), float(b)] for a, b in zip(grid[::10], cg[::10])])
# ---- D4 crotch apex ---------------------------------------------------------
def crotch(m, sole, Href):
    y0 = int(round(sole - 0.20 * Href)); y1 = int(round(sole - 0.08 * Href))
    xm = float(np.nonzero(m[y0:y1])[1].mean()); best = None
    for x in range(int(round(xm)) - 15, int(round(xm)) + 16):
        col = m[:sole, x]
        if col[sole - 1]: continue
        fg = np.nonzero(col)[0]; ytop = (fg.max() + 1) if len(fg) else 0
        h = sole - ytop
        if best is None or h > best[1]: best = (x, h)
    return dict(x_mid=xm, apex_col=int(best[0]), apex_h_px=float(best[1]))
cf = crotch(masks['front'], P['front']['sole_row_D1'], Hb); cb = crotch(masks['back'], P['back']['sole_row_D1'], Hb)
r_cr = cf['apex_h_px'] / cb['apex_h_px']
OUT['D4_crotch'] = dict(front=cf, back=cb, r_crotch=r_cr, rel_diff_vs_r_fb=abs(r_fb - r_cr) / r_fb)
# ---- scales, spread, verdict -------------------------------------------------
s_side = P['side']['implied_px_per_mm']; s_back = P['back']['implied_px_per_mm']; s_front = s_back * r_fb
sc = dict(front=s_front, side=s_side, back=s_back); vals = np.array(list(sc.values()))
spread = float((vals.max() - vals.min()) / vals.mean())
u_rel = max(P[v]['detection_uncertainty_px'] / P[v]['H_px_D1'] for v in ('side', 'back'))
u_rel_front = (P['back']['detection_uncertainty_px'] / Hb)  # front scale inherits back H uncertainty via r_fb
crit_shared = spread <= 0.010 and OUT['D4_crotch']['rel_diff_vs_r_fb'] <= 0.010 and OUT['D3_width_mirror']['cost_at_r_fb_px'] <= 2.0
crit_not = spread > 0.010 + 2 * u_rel
front_estimator_ok = OUT['D4_crotch']['rel_diff_vs_r_fb'] <= 0.010 and OUT['D3_width_mirror']['cost_at_r_fb_px'] <= 2.0
# frozen text: 'Otherwise (or if D3/D4 disagree or D3 cost > 2 px) NOT VERIFIABLE' -> a failed front estimator overrides NOT SHARED
# (fix 2026-11-09 after run1 printed 'NOT SHARED': the run1 code had not applied this override; disclosed in REPORT.md)
verdict = 'SHARED' if crit_shared else ('NOT SHARED' if (crit_not and front_estimator_ok) else 'NOT VERIFIABLE (inconclusive)')
sb = abs(s_side - s_back) / ((s_side + s_back) / 2)
verdict_side_back = 'SHARED' if sb <= 0.010 else ('NOT SHARED' if sb > 0.010 + 2 * u_rel else 'NOT VERIFIABLE (inconclusive)')
OUT['scale'] = dict(px_per_mm=sc, spread=spread, spread_pct=100 * spread, side_back_spread_pct=100 * abs(s_side - s_back) / ((s_side + s_back) / 2),
                    u_rel=u_rel, threshold_pct=1.0, front_estimator_ok=front_estimator_ok, verdict_side_back_only=verdict_side_back, not_shared_threshold_pct=100 * (0.010 + 2 * u_rel), verdict=verdict,
                    s_L_shared=(s_side + s_back) / 2,
                    criteria=dict(spread_le_1pct=spread <= 0.010, D3_D4_agree_1pct=OUT['D4_crotch']['rel_diff_vs_r_fb'] <= 0.010, D3_cost_le_2px=OUT['D3_width_mirror']['cost_at_r_fb_px'] <= 2.0))
# validation cameras for comparison (committed silhouette_measurements.json)
B = json.load(open(X.VAL + 'data/silhouette_measurements.json'))
OUT['validation_cameras'] = {v: dict(modeL_s=B[v]['modeL_cam']['s'], modeF_s=B[v]['modeF_cam']['s'], modeL_top_row=B[v]['modeL_cam']['top_row'], modeL_sole_row=B[v]['modeL_cam']['sole_row']) for v in ('front', 'side', 'back')}
OUT['validation_cameras']['ratio_to_shared'] = {v: dict(modeL=B[v]['modeL_cam']['s'] / s_back / (1 if v != 'front' else r_fb) if False else B[v]['modeL_cam']['s'] / sc[v], modeF=B[v]['modeF_cam']['s'] / sc[v]) for v in ('front', 'side', 'back')}
# ---- Step 2: crop evidence ----------------------------------------------------
sf = P['front']['sole_row_D1']; y_pred = sf - r_fb * Hb
def neck(m, sole, top, Href):
    best = None
    for y in range(int(round(sole - 0.94 * Href)), int(round(sole - 0.78 * Href)) + 1):
        if y < 0: continue
        xs = np.nonzero(m[y])[0]
        if len(xs) == 0: continue
        w = xs[-1] + 1 - xs[0]
        if best is None or w < best[1]: best = (y, int(w))
    return dict(neck_row=best[0], neck_width_px=best[1], head_h_px=best[0] - top, head_ratio=(best[0] - top) / Href)
nk = dict(side=neck(masks['side'], P['side']['sole_row_D1'], P['side']['top_row_D1'], P['side']['H_px_D1']),
          back=neck(masks['back'], P['back']['sole_row_D1'], P['back']['top_row_D1'], Hb),
          front=neck(masks['front'], sf, P['front']['top_row_D1'], r_fb * Hb))
# Mode L front scale as implemented: re-run unchanged S.modeL and check it equals mean(side,back)
sd = {}
for v in ('side', 'back'):
    ys, xs = np.nonzero(masks[v]); sd[v] = (ys.max() + 1.0 - ys.min()) / (S.ZCROWN - S.ZSOLE)
sd['front'] = (sd['side'] + sd['back']) / 2
Lf = S.modeL('front', masks['front'], sd)
Lf_t = S.modeL('front', np.vstack([np.zeros((7, masks['front'].shape[1]), np.uint8), masks['front'][7:]]), sd)  # top rows blanked: scale must not change
crown_based_front = sf / DZ
OUT['crop'] = dict(front_class=P['front']['crop_class'], front_top_row=P['front']['top_row_D1'], front_fg_px_rows0to4=P['front']['fg_px_rows0to4'],
                   front_contour_px_on_top_edge=P['front']['contour_px_on_top_edge'],
                   predicted_front_bald_skull_top_row=y_pred, neck_head=nk,
                   modeL_front_rerun=dict(s=Lf['s'], top_row=Lf['top_row'], s_equals_mean_side_back=abs(Lf['s'] - sd['front']) < 1e-12,
                                          s_with_top7rows_blanked=Lf_t['s'], scale_unaffected_by_top_rows=Lf_t['s'] == Lf['s'],
                                          matches_validation_cam=abs(Lf['s'] - B['front']['modeL_cam']['s']) < 1e-12),
                   implemented_modeL_front_scale_bias_pct=0.0,
                   hypothetical_crown_based_front_scale=crown_based_front,
                   hypothetical_bias_vs_skull_based_pct=100 * (sf / (sf - y_pred) - 1),
                   hypothetical_bias_vs_shared_front_scale_pct=100 * (crown_based_front / s_front - 1))
def _d(o):
    if isinstance(o,(np.bool_,)): return bool(o)
    if isinstance(o,np.integer): return int(o)
    if isinstance(o,np.floating): return float(o)
    raise TypeError(type(o))
json.dump(OUT, open(ROOT + f'/data/step12_{tag}.json', 'w'), indent=1, sort_keys=True, default=_d)
# ---- contour-only images (no reference pixels) -------------------------------
if tag == 'run1':
    def bnd(m): return S.boundary(m.astype(np.uint8))
    # front crop: rows 0..320, contour white, row 0 red, predicted skull top cyan, side/back mapped head-top for reference
    m = masks['front']; h = 330; b = bnd(m)[:h]; img = np.zeros((h + 20, m.shape[1], 3), np.uint8)
    img[20:][b] = (255, 255, 255); img[20, :] = (0, 0, 255)
    yp = int(round(y_pred)) + 20
    if 0 <= yp < img.shape[0]: img[yp, ::4] = (255, 255, 0)
    yn = nk['front']['neck_row'] + 20; img[yn, ::6] = (0, 200, 0)
    cv2.putText(img, 'front ref contour, rows 0-330 (red = image row 0; cyan dotted = predicted bald-skull top from back via r_fb; green = neck row)', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (200, 200, 200), 1)
    cv2.imwrite(ROOT + '/contours/front_top_crop_contour.png', img)
    # x4 zoom of the top 60 rows
    z = cv2.resize(img[20:80], None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST); cv2.imwrite(ROOT + '/contours/front_top_crop_contour_zoom4x.png', z)
    # three full-body contours side by side, aligned on sole row, scaled to shared scale (front by 1/r_fb), with top/sole lines
    tiles = []
    for v in ('front', 'side', 'back'):
        m = masks[v]; b = bnd(m); t = np.zeros(m.shape + (3,), np.uint8); t[b] = (255, 255, 255)
        t[min(P[v]['sole_row_D1'], m.shape[0] - 1), :] = (0, 0, 255); t[P[v]['top_row_D1'], :] = (0, 165, 255)
        cv2.putText(t, f"{v}: top {P[v]['top_row_D1']} sole {P[v]['sole_row_D1']}", (6, 1520), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
        tiles.append(t)
    cv2.imwrite(ROOT + '/contours/fullbody_contours_top_sole_rows.png', np.hstack(tiles))
    # width profiles front vs back (scaled) as a plot
    pw = np.full((420, 640, 3), 255, np.uint8)
    for (arr, sc_, col) in [(wb, 1.0, (200, 0, 0)), (wf, 1.0, (0, 0, 200))]:
        for hh, ww in arr:
            if hh < 0 or hh > 1500: continue
            x = int(hh / 1500 * 620) + 10; y = 410 - int(ww / 900 * 400); pw[max(y, 0):max(y, 0) + 2, x] = col
    for hh, ww in zip(hb, Wb):
        x = int(r_fb * hh / 1500 * 620) + 10; y = 410 - int(r_fb * ww / 900 * 400); pw[max(y, 0), x] = (0, 160, 0)
    cv2.putText(pw, f'outer width vs height above sole (px). blue=front, red=back, green=back scaled by r_fb={r_fb:.4f}', (8, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 1)
    cv2.imwrite(ROOT + '/contours/width_profile_front_vs_back.png', pw)
print('STEP12_DONE', tag, json.dumps(dict(scale=OUT['scale'], D3=OUT['D3_width_mirror']['r_fb'], D4=r_cr, crop=OUT['crop']['front_class']), default=str))
