# Pout bridge (2026-10-10): 1158 intro frames 0..48 (0.000-2.000 s; holds f48, crossed-arms frown) +
# 1162 rest frames 0..144, pre-registered to idle 720x1280 (reg1158/reg1162, one transform for both).
# Same seed rule as sheets_1126_1140.py (enclosed studio white = background pockets), with the
# minimum pocket size lowered to 300 px so the small gaps between the crossed arms and the body
# are cut too. Hair zones / un-mix zone per frame from auto_zones (no raised hand here).
import sys, numpy as np
sys.path.insert(0, '/workspace/f807/sweep'); sys.path.insert(0, '/workspace/f807/bridge/engine')
import sheets as S, sweeplib as _sw
from PIL import Image
from scipy import ndimage as ndi
V = '/workspace/bridge/vid/'
MIN_POCKET = 300
def seeds(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int); mn = a.min(2); mx = a.max(2)
    w = (mn >= 238) & (mx - mn <= 18)
    lab, n = ndi.label(w); edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    out = {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if i in edge or sl is None: continue
        m = lab[sl] == i; s = int(m.sum())
        if s < MIN_POCKET: continue
        box = [sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1]
        f248 = (mn[sl][m] >= 248).mean(); f245 = (mn[sl][m] >= 245).mean()
        # Below the skirt hem and above the head there is no white clothing, so the studio white
        # there is matched on >=245 (the leg gap of 1162 f0 is only 78% >=248, which is why 1126
        # flickered). Next to the white shirt the strict rule stays.
        if box[3] < 160:
            if f245 < 0.9: continue
            nm = 'ahoge loop'
        elif box[1] > 690 and box[3] - box[1] > 100:
            if f245 < 0.9: continue
            nm = 'leg gap (skirt hem to floor shadow)'
        else:
            if f248 < 0.9: continue
            # The white shirt has bright enclosed patches too (between buttons, under a sleeve).
            # A real arm/body gap is walled by the dark ink outline of arm and body; a shirt patch
            # is not (ring dark share 0.00-0.09 on shirt patches vs 0.29 on the 1162 f25 gap).
            y0, y1 = max(0, sl[0].start - 4), sl[0].stop + 4; x0, x1 = max(0, sl[1].start - 4), sl[1].stop + 4
            mm = lab[y0:y1, x0:x1] == i; ring = ndi.binary_dilation(mm, iterations=3) & ~mm
            Lr = a[y0:y1, x0:x1].mean(2)[ring]
            if (Lr < 120).mean() < 0.2: continue
            nm = 'arm/body gap (crossed arms, arm to waist)'
        out.setdefault(nm, []).append(box)
    return out
FR = {}
for i in range(49): FR['i%03d' % i] = ('pout1158_in_%03d' % i, V + 'reg1158/f%03d.png' % i)
for i in range(145): FR['o%03d' % i] = ('pout1162_out_%03d' % i, V + 'reg1162/f%03d.png' % i)
def cfg(k):
    key, path = FR[k]
    p = seeds(path)
    c = S.fam(key, None, None, None, extra=p)
    c['abs_file'] = path; c['file'] = 'bridge/vid/' + path.split('/')[-2] + '/' + path.split('/')[-1]
    rgb = np.asarray(Image.open(path).convert('RGB'))
    hz, uz, tops = _sw.auto_zones(rgb)
    c['zones'] = 'manual'; c['hair_zones'] = hz; c['unmix_zone'] = uz; c['shoulder_tops_LR'] = tops
    return c
