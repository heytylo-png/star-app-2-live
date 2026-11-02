#!/usr/bin/env python3
"""Verify immutable bv9 baseline, reference manifest, the validation scripts/method hashes. Read-only."""
import hashlib, json, os, sys
R='/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/'
VAL='/workspace/blendbro/out/bv9_reference_validation_v1/'
BV9='/workspace/blender/star_rai/star_rai_base_body_bv9.blend'
EXP_BV9='d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689'
def sha(p):
    h=hashlib.sha256(); h.update(open(p,'rb').read()); return h.hexdigest()
out={'bv9':{'path':BV9,'sha256':sha(BV9),'bytes':os.path.getsize(BV9),'expected':EXP_BV9}}
out['bv9']['match']=out['bv9']['sha256']==EXP_BV9
man=json.load(open(R+'REFERENCE_MANIFEST.json')); out['manifest_sha256']=sha(R+'REFERENCE_MANIFEST.json')
out['manifest_keys']=list(man.keys()) if isinstance(man,dict) else 'list'
items=man['images']
res=[]
for it in items:
    name=it['filename']; exp=it.get('sha256'); p=R+name
    ok=os.path.exists(p) and sha(p)==exp and (it.get('bytes',it.get('size_bytes',os.path.getsize(p)))==os.path.getsize(p))
    res.append(dict(file=name,expected=exp,actual=sha(p) if os.path.exists(p) else None,match=ok))
out['reference_files']=res; out['all_refs_match']=all(r['match'] for r in res) and len(res)==9
# validation method + scripts (hash, to be imported unchanged)
vs={}
for f in ['METHOD_AND_CRITERIA_FROZEN.md','METHOD_AMENDMENT_A1.md','scripts/refseg.py','scripts/s05_measure.py','scripts/s07_overlays.py','scripts/s10_fractions.py','scripts/s03_export_geometry.py','scripts/s02_inspect_bv9.py','data/silhouette_measurements.json','work/bv9_geom.npz']:
    vs[f]=sha(VAL+f)
out['validation_files']=vs
json.dump(out,open('/workspace/blendbro/out/bv9_correction_study_v1/data/baseline_verification.json','w'),indent=1)
print(json.dumps({k:out[k] for k in ['bv9','all_refs_match','manifest_sha256']},indent=1)); print(vs)
