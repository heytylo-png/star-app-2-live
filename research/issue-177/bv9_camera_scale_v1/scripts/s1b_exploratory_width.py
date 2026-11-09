#!/usr/bin/env python3
"""POST-HOC EXPLORATORY (designed after seeing step-1 run1; NOT part of the frozen verdict). Localises why the frozen D3
front/back width mirror match fails (cost > 2 px): residual |w_front(r*h) - r*w_back(h)| by height band, and r fitted on sub-ranges.
usage: s1b_exploratory_width.py <tag> -> data/exploratory_width_<tag>.json"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compat as X, numpy as np
RS = X.RS; tag = sys.argv[1]; D = json.load(open(X.ROOT + '/data/step12_run1.json')); P = {r['view']: r for r in D['per_image']}
m = {v: RS.segment(v, tex_thr=4.0)[0] for v in ('front', 'back')}
def prof(mk, sole):
    ys = np.nonzero(mk.any(1))[0]; a = []
    for y in ys:
        xs = np.nonzero(mk[y])[0]; a.append((sole - (y + 0.5), xs[-1] + 1 - xs[0]))
    a = np.array(a, float); return a[np.argsort(a[:, 0])]
wf = prof(m['front'], P['front']['sole_row_D1']); wb = prof(m['back'], P['back']['sole_row_D1']); Hb = P['back']['H_px_D1']; s_b = P['back']['implied_px_per_mm']
def res(r, lo, hi):
    sel = (wb[:, 0] >= lo * Hb) & (wb[:, 0] <= hi * Hb); hb, W = wb[sel, 0], wb[sel, 1]
    d = np.interp(r * hb, wf[:, 0], wf[:, 1]) - r * W; return d
grid = np.round(np.arange(0.90, 1.10 + 1e-9, 0.0005), 4); out = {'note': 'post-hoc exploratory; px; positive = front wider', 'bands': [], 'subrange_fits': []}
for lo, hi in [(0.03, 0.15), (0.15, 0.30), (0.30, 0.45), (0.45, 0.60), (0.60, 0.75)]:
    z0 = -88 + lo * Hb / s_b; z1 = -88 + hi * Hb / s_b
    for r in (1.0, 0.9945):
        d = res(r, lo, hi); out['bands'].append(dict(h_frac=[lo, hi], approx_model_z_mm=[round(z0, 1), round(z1, 1)], r=r, mean_signed_px=float(d.mean()), mean_abs_px=float(np.abs(d).mean()), max_abs_px=float(np.abs(d).max())))
for lo, hi in [(0.03, 0.40), (0.03, 0.30), (0.40, 0.75)]:
    c = np.array([np.abs(res(r, lo, hi)).mean() for r in grid]); out['subrange_fits'].append(dict(h_frac=[lo, hi], r_best=float(grid[c.argmin()]), cost_best_px=float(c.min()), cost_r1_px=float(np.abs(res(1.0, lo, hi)).mean())))
json.dump(out, open(X.ROOT + f'/data/exploratory_width_{tag}.json', 'w'), indent=1)
print(json.dumps(out, indent=0))
