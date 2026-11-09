#!/usr/bin/env python3
"""Step 4: the pre-registered recalibrated-Mode-F sign check (correction-study preregistration, PASS clause:
"... and recalibrated (R) Mode F agrees in sign"), left as `recal_modeF_agrees_sign = None` in c14_evaluate.py.

recal_modeF_agrees_sign(meas_base, meas_cand, kind) takes two c09-format measurement dicts (keys 'P' = baseline cameras fixed,
'R' = validation calibration procedure re-run on that geometry; each [view][mode]) and the candidate kind ('A' or 'B'/'B1').
Intended-metric components (same definitions as c14_evaluate.py):
  A    : for v in (front, back): delta_v = gap_z25_80 mean (baseline) - gap_z25_80 mean (candidate)      [+ = improvement]
  B/B1 : side foot_zlt-60 mean decrease ; side sole_envelope mean_abs_dz decrease                       [+ = improvement]
Returns dict(value=True/False, components=[...], reasons=[...]). value is True iff every component is non-zero (|delta| > EPS)
under both P-Mode-F and R-Mode-F and sign(R) == sign(P). It never returns None, so a PASS can be evaluated.
`require_ready(d)` raises if a verdict dict still carries recal_modeF_agrees_sign = None (to be called before any future verdict)."""
import json, sys, os
EPS = 1e-9
def _zone(m, cond, v, zn): return m[cond][v]['modeF']['zones'][zn]['all']['mean']
def components(mb, mc, kind):
    out = []
    for cond in ('P', 'R'):
        if kind == 'A':
            for v in ('front', 'back'):
                out.append(dict(cond=cond, name=f'{v} gap_z25_80 mean decrease (mm)', delta=_zone(mb, cond, v, 'gap_z25_80') - _zone(mc, cond, v, 'gap_z25_80')))
        elif kind in ('B', 'B1'):
            out.append(dict(cond=cond, name='side foot_zlt-60 mean decrease (mm)', delta=_zone(mb, cond, 'side', 'foot_zlt-60') - _zone(mc, cond, 'side', 'foot_zlt-60')))
            out.append(dict(cond=cond, name='side sole_envelope mean_abs_dz decrease (mm)',
                            delta=mb[cond]['side']['modeF']['sole_envelope']['mean_abs_dz'] - mc[cond]['side']['modeF']['sole_envelope']['mean_abs_dz']))
        else: raise ValueError(kind)
    return out
def recal_modeF_agrees_sign(mb, mc, kind):
    comp = components(mb, mc, kind); reasons = []; ok = True
    P = [c for c in comp if c['cond'] == 'P']; R = [c for c in comp if c['cond'] == 'R']
    for p, r in zip(P, R):
        sp = 0 if abs(p['delta']) <= EPS else (1 if p['delta'] > 0 else -1); sr = 0 if abs(r['delta']) <= EPS else (1 if r['delta'] > 0 else -1)
        if sp == 0 or sr == 0: ok = False; reasons.append(f"{p['name']}: zero change (P {p['delta']:+.4f}, R {r['delta']:+.4f}) -> cannot agree")
        elif sp != sr: ok = False; reasons.append(f"{p['name']}: sign differs (P {p['delta']:+.4f}, R {r['delta']:+.4f})")
        else: reasons.append(f"{p['name']}: same sign (P {p['delta']:+.4f}, R {r['delta']:+.4f})")
    return dict(value=bool(ok), kind=kind, components=comp, reasons=reasons)
def require_ready(verdict_dict):
    for k, d in verdict_dict.items():
        if d.get('recal_modeF_agrees_sign', 'missing') is None: raise RuntimeError(f'{k}: recal_modeF_agrees_sign is None; compute it before the verdict')
    return True
if __name__ == '__main__':
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); tag = sys.argv[1]
    COR = ROOT + '/prior/research/issue-177/bv9_correction_study_v1/'
    new = json.load(open(ROOT + f'/data/c09_measure_baseline_{tag}.json'))['baseline']
    old = json.load(open(COR + 'data/measure_run1.json'))
    res = {'baseline_vs_itself': {k: recal_modeF_agrees_sign(new, new, k) for k in ('A', 'B')},
           'note_retrospective': 'Retrospective demonstration on the committed correction-study measurements (measure_run1.json, measure_b1_run1.json). '
                                 'It does not change any earlier verdict: A, B, B1 already FAIL on other clauses; no new candidate was built or measured.'}
    b1 = json.load(open(COR + 'data/measure_b1_run1.json'))
    res['retrospective_committed'] = {'A': recal_modeF_agrees_sign(old['baseline'], old['A'], 'A'), 'B': recal_modeF_agrees_sign(old['baseline'], old['B'], 'B'),
                                      'B1': recal_modeF_agrees_sign(old['baseline'], b1['B1'], 'B1')}
    demo = {k: {'recal_modeF_agrees_sign': v['value']} for k, v in res['retrospective_committed'].items()}
    res['require_ready_on_retrospective'] = require_ready(demo)
    try: require_ready({'X': {'recal_modeF_agrees_sign': None}}); res['require_ready_rejects_null'] = False
    except RuntimeError: res['require_ready_rejects_null'] = True
    json.dump(res, open(ROOT + f'/data/step4_recal_sign_{tag}.json', 'w'), indent=1)
    for k, v in res['baseline_vs_itself'].items(): print('baseline vs itself', k, v['value'], v['reasons'])
    for k, v in res['retrospective_committed'].items(): print('retrospective', k, v['value'], v['reasons'])
    print('require_ready rejects null:', res['require_ready_rejects_null'])
