#!/usr/bin/env python3
"""Compare the two fresh unchanged-c09 baseline runs with each other and with the committed correction-study baseline (measure_run1.json)."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def flat(d, p=''):
    o = {}
    if isinstance(d, dict):
        for k, v in d.items():
            if k == 'seconds': continue
            o.update(flat(v, p + '/' + k))
    elif isinstance(d, list):
        for i, v in enumerate(d): o.update(flat(v, p + f'[{i}]'))
    elif isinstance(d, bool) or d is None: o[p] = d
    elif isinstance(d, (int, float)): o[p] = float(d)
    return o
a = flat(json.load(open(ROOT + '/data/c09_measure_baseline_run1.json'))['baseline'])
b = flat(json.load(open(ROOT + '/data/c09_measure_baseline_run2.json'))['baseline'])
c = flat(json.load(open(ROOT + '/prior/research/issue-177/bv9_correction_study_v1/data/measure_run1.json'))['baseline'])
def cmp(x, y):
    ks = set(x) | set(y); miss = [k for k in ks if k not in x or k not in y]
    num = [abs(x[k] - y[k]) for k in ks if k in x and k in y and isinstance(x[k], float) and isinstance(y[k], float)]
    neq = [k for k in ks if k in x and k in y and x[k] != y[k]]
    return dict(n_keys=len(ks), missing=len(miss), n_unequal=len(neq), max_abs_diff=max(num) if num else 0.0, examples=sorted(neq)[:5])
R = dict(run1_vs_run2=cmp(a, b), run1_vs_committed_measure_run1=cmp(a, c))
json.dump(R, open(ROOT + '/data/c09_baseline_comparison.json', 'w'), indent=1); print(json.dumps(R, indent=1))
