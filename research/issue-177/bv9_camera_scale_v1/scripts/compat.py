"""Import the frozen validation / correction-study scripts UNCHANGED.
Their hard-coded local folders (/workspace/blendbro/out/bv9_reference_validation_v1/, .../bv9_correction_study_v1/) no longer
exist on this box, so reads of those paths are redirected (read-only) to:
  - prior/ : byte-exact `git archive` exports of commits f81fa464 (validation) and 5a75023d (correction study)
  - work/bv9_geom.npz : geometry re-exported from a COPY of bv9 with the unchanged s03_export_geometry.py
    (sha256 f7b8d84c... == value recorded in the correction study's baseline_verification.json).
No script file is edited; only builtins.open / numpy.load path strings are remapped, and only for reads."""
import builtins, os, sys, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
VAL_OLD='/workspace/blendbro/out/bv9_reference_validation_v1/'
COR_OLD='/workspace/blendbro/out/bv9_correction_study_v1/'
VAL=ROOT+'/prior/research/issue-177/bv9_reference_validation_v1/'
COR=ROOT+'/prior/research/issue-177/bv9_correction_study_v1/'
MAP={VAL_OLD+'work/bv9_geom.npz':ROOT+'/work/bv9_geom.npz', COR_OLD+'work/bv9_geom_rerun.npz':ROOT+'/work/bv9_geom.npz'}
def remap(p):
    if not isinstance(p,str): return p
    if p in MAP: return MAP[p]
    if p.startswith(VAL_OLD): return VAL+p[len(VAL_OLD):]
    if p.startswith(COR_OLD): return COR+p[len(COR_OLD):]
    return p
_open=builtins.open; _load=np.load
def _ropen(f,mode='r',*a,**k):
    if any(c in mode for c in 'wax+') and isinstance(f,str) and f.startswith(COR_OLD+'data/measure_'):
        f=ROOT+'/data/c09_'+os.path.basename(f)          # unchanged c09_measure.py output -> this study's data/ folder
        return _open(f,mode,*a,**k)
    if any(c in mode for c in 'wax+') and isinstance(f,str) and (f.startswith(VAL_OLD) or f.startswith(COR_OLD) or f.startswith(VAL) or f.startswith(COR)):
        raise PermissionError('compat: write to prior study path blocked: '+f)
    return _open(remap(f) if 'r' in mode and not any(c in mode for c in 'wax+') else f,mode,*a,**k)
def _rload(f,*a,**k): return _load(remap(f),*a,**k)
builtins.open=_ropen; np.load=_rload
sys.path.insert(0,VAL+'scripts'); sys.path.insert(0,COR+'scripts')
import s05_measure as S          # unchanged (sha256 b1ed4880...)
import refseg as RS              # unchanged (sha256 05a34ac8...)
import cs_common as C            # unchanged (sha256 0b370c11...)
