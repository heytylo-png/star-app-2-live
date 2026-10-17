# Per-sheet geometry. Pocket hints are approx bboxes [x0,y0,x1,y1] of ENCLOSED studio-white comps (resolved to a seed point at run time).
COMMIT = None  # filled by run_sweep from git
FAM_HAIR = [(0, 0, 300, 261), (440, 0, 720, 246)]
FAM_UNMIX = (0, 0, 720, 246)
def fam(key, file, ahoge, legs, extra=None, shoe=None, **kw):
    kw.pop('_', None)
    p = {}
    if ahoge: p['ahoge loop'] = [ahoge]
    if legs: p['leg gap (skirt hem to floor shadow)'] = [legs]
    for k, v in (extra or {}).items(): p[k] = v
    ZO = {'hair_left_ahoge': (215, 0, 365, 275), 'hair_right': (420, 95, 520, 275), 'leg_gap_top': (330, 690, 450, 830), 'leg_gap_shoes': (300, 1110, 500, 1265)}
    ZO.update(kw.pop('zooms', {}))
    c = dict(key=key, file=file, pockets=p, zones=kw.pop('zones', 'auto'), hair_zones=kw.pop('hair_zones', FAM_HAIR), unmix_zone=kw.pop('unmix_zone', FAM_UNMIX),
             floor_zone=None, slivers_from=None, shoe='auto', zooms=ZO)
    c.update(kw); return c
SHEETS = {
 'wink': fam('wink', 'rai/wink_official.png', [273, 12, 354, 98], [337, 701, 391, 1206], shoe=1164,
             notes='Evidence sheet (PR95). Seeds: ahoge loop, leg gap, shoe slivers. Thin torso/arm wedge (437-456,406-508) is NOT seeded: lit shirt (exact-255 7%, chroma 1.3, like clothing).'),
}

def add(*a, **k):
    c = fam(*a, **k); SHEETS[c['key']] = c
add('laugh', 'rai/laugh_official.png', [273, 9, 355, 96], [337, 703, 391, 1206])
add('surprise', 'rai/surprise_official.png', [273, 12, 354, 97], [337, 701, 391, 1205])
add('smug', 'rai/smug_official.png', [273, 11, 354, 97], [337, 702, 391, 1204])
add('content', 'rai/content_official.png', [262, 22, 336, 113], [338, 700, 391, 1204])
add('sad', 'rai/sad_official.png', [270, 18, 348, 104], [337, 700, 391, 1206])
add('hearts', 'rai/heart_official.png', [273, 12, 356, 98], [337, 702, 391, 1206])
add('hold', 'rai/hold_official.png', [256, 32, 324, 123], [338, 698, 391, 1205])
add('talk', 'rai/talk_official.png', None, [337, 700, 390, 1203], notes='talk_official: no enclosed ahoge loop (nothing to seed there).')
add('think', 'rai/think_official.png', [255, 11, 325, 102], [342, 694, 396, 1201], zooms={'hair_left_ahoge': (200, 0, 350, 275), 'leg_gap_top': (330, 680, 450, 820)})
add('embarrassed', 'rai/embarrassed_official.png', [255, 21, 329, 114], [327, 695, 458, 1202])
add('pout', 'rai/pout_official.png', [255, 21, 329, 114], [327, 696, 458, 1206])
add('middle_finger', 'rai/middle_finger.png', [265, 17, 342, 108], [308, 697, 490, 1208], extra={'hand/hip gap, viewer left': [[220, 363, 287, 465]]}, zooms={'hand_hip_gap': (190, 340, 320, 490)})
add('scold', 'rai/scold_official.png', [261, 18, 348, 109], None, extra={'arm/body gap, viewer right': [[454, 381, 530, 495]]}, zones='manual', hair_zones=[(0, 0, 300, 240), (440, 0, 720, 246)], unmix_zone=(0, 0, 720, 246), zooms={'arm_body_gap': (430, 360, 560, 520)}, notes='scold: left hair zone y1 tightened 259->240 after ring QA (the 275px/50px gaps at y242-268 are shoulder-level, ring light 0.71 = shirt-side); legs gap is edge-connected in the source (nothing enclosed to seed).')
add('tired', 'rai/tired_official.png', None, [312, 915, 412, 1207], zones='manual',
    hair_zones=[(0, 0, 255, 305), (395, 0, 720, 305)], unmix_zone=(0, 0, 720, 303),
    zooms={'hair_left': (160, 120, 300, 320), 'hair_right': (370, 150, 480, 330), 'leg_gap_top': (290, 880, 440, 1000), 'leg_gap_shoes': (270, 1100, 470, 1265)},
    notes='tired: the two big central/left white regions (342-439,310-462) and (261,370,327,466) were checked and are SHIRT (ring 79%/94% light, same as shirt); not seeded. No ahoge loop. Head sits left/high, so hair zones are hand-set.')

SHEETS['peace'] = dict(key='peace', file='rai/peace.png',
    pockets={'ahoge loop': [[313, 19, 405, 124]], 'leg gap (skirt hem to floor shadow)': [[398, 822, 462, 1406]]},
    zones='manual', hair_zones=[(0, 0, 351, 255), (516, 0, 843, 290)], unmix_zone=(0, 0, 843, 255),
    floor_zone=None, slivers_from=None, shoe='auto',
    zooms={'hair_left_ahoge': (230, 0, 430, 330), 'hair_right_hand': (480, 100, 680, 330), 'leg_gap_top': (370, 800, 530, 960), 'leg_gap_shoes': (340, 1300, 600, 1490)},
    notes='peace.png is 843x1500 (1.1708x the 720x1280 family) with an iCCP profile + cHRM. Peace-sign hands beside the face leave thin white slivers between hair/hand/torso; only hair-zone ones above the sleeves are taken, see report risk list.')

for _k, _f, _z in [('profile', 'rai/side_profile.png', None), ('three_quarter', 'rai/three_quarter.png', None),
                   ('three_quarter_left', 'rai/three_quarter_left.png', None), ('three_quarter_right', 'rai/three_quarter_right.png', None)]:
    SHEETS[_k] = dict(key=_k, file=_f, bust=True, pockets={}, zones='bust', hair_zones=[], unmix_zone=None, floor_zone=None, slivers_from=None,
        zooms={'top_left': (140, 120, 400, 420), 'top_right': (460, 120, 700, 420), 'mid': (180, 440, 560, 700)},
        notes='768x1168 Expo bust sheet on a ~247 grey card (not 255). Seeds = enclosed white comps whose core matches the card colour (see report bust_*), no zones; skirt stripes / collar / shirt are warmer or brighter than the card and are never matched.')

SHEETS['wave'] = dict(key='wave', file='rai/wave_official.png', rgba_source=True,
    pockets={'arm/body gap under the raised arm': [[612, 493, 749, 691]]},
    zones='manual', hair_zones=[], unmix_zone=(0, 0, 1008, 355), floor_zone=None, slivers_from=None, shoe='auto',
    zooms={'arm_gap': (580, 460, 790, 720), 'head': (300, 0, 760, 420), 'shoes': (300, 1560, 700, 1760)},
    notes='SOURCE IS RGBA (1008x1792, already a real cutout with 2% soft alpha). Flattened on #fff then cut with the shy engine, so the original soft edge is re-derived.')
SHEETS['turn'] = dict(key='turn', file='star-rai/poses/turn-away.png', rgba_source=True,
    pockets={'arm/torso strip (viewer right)': [[708, 995, 753, 1184]]},
    auto_ring=dict(ymax=700, minpx=40, dark=0.45, light=0.30),
    zones='manual', hair_zones=[], unmix_zone=(0, 0, 1152, 588), floor_zone=(0, 1728, 1152, 1728), slivers_from=None, shoe=None,
    zooms={'head': (300, 0, 960, 420), 'hair_left': (330, 300, 520, 700), 'hair_right': (800, 250, 960, 700), 'arm_strip': (680, 960, 790, 1210)},
    notes='SOURCE IS RGBA (1152x1728, real cutout). Flattened on #fff then cut with the shy engine. Cuff / skirt-hem white stripes are NOT seeded.')
