# Blender (background) script: build ONE candidate .blend from a COPY of bv9. usage: blender -b --factory-startup work/bv9_copy.blend --python this.py -- A|B out.blend report.json
import bpy, sys, json, numpy as np, os
sys.path.insert(0,'/workspace/blendbro/out/bv9_correction_study_v1/scripts')
import cs_edits as E
which,outblend,rep=sys.argv[sys.argv.index('--')+1:][:3]
NEW='/workspace/blendbro/out/bv9_correction_study_v1/'
Wz=np.load(NEW+'work/bv9_base_weights.npz'); names=[str(x) for x in Wz['names']]; W=Wz['W']
ob=bpy.data.objects['StarRai_base_body']; me=ob.data; n=len(me.vertices)
co32=np.empty(n*3,np.float32); me.vertices.foreach_get('co',co32); co32=co32.reshape(-1,3)
co=co32.astype(np.float64)*1000.0
assert np.abs(co-Wz['co_mm']).max()<1e-3
info={}
if which=='A': new=E.edit_A(co,W,names)
elif which=='B': new,info=E.edit_B(co,W,names)
elif which=='B1': new,info=E.edit_B1(co,W,names)
else: raise SystemExit('bad')
dm=(new-co); moved=np.abs(dm).max(1)>1e-9
delta32=((new/1000.0).astype(np.float32)-co32); delta32[~moved]=0
newco=co32+delta32
me.vertices.foreach_set('co',newco.reshape(-1)); 
nk=0
if me.shape_keys:
    for k in me.shape_keys.key_blocks:
        a=np.empty(n*3,np.float32); k.data.foreach_get('co',a); a=a.reshape(-1,3)+delta32; k.data.foreach_set('co',a.reshape(-1)); nk+=1
me.update()
bpy.ops.wm.save_as_mainfile(filepath=outblend)
R=dict(candidate=which,n_verts=n,n_moved=int(moved.sum()),max_disp_mm=float(np.linalg.norm(dm,axis=1).max()),mean_disp_moved_mm=float(np.linalg.norm(dm[moved],axis=1).mean()),shape_keys_shifted=nk,**info,saved=outblend)
json.dump(R,open(rep,'w'),indent=1); print('CAND_OK',R)
