"""Pure-numpy mesh edits for candidates A and B (pre-registered in CORRECTION_STUDY_PREREGISTRATION_FROZEN.md). Units mm, world == mesh space (identity object transform)."""
import numpy as np
def _smooth(t):
    t=np.clip(t,0,1); return t*t*(3-2*t)
def wsum(W,names,keys):
    return np.clip(sum(W[:,names.index(k)].astype(np.float64) for k in keys),0,1)
def edit_A(co,W,names,delta=3.5,z_full=70.0,z_zero=90.0):
    out=co.copy().astype(np.float64)
    taper=1-_smooth((co[:,2]-z_full)/(z_zero-z_full))
    for s,sign in [('right',-1.0),('left',+1.0)]:     # right arm is at +X -> move toward midline = -X
        w=wsum(W,names,[f'upper_arm_{s}',f'lower_arm_{s}',f'hand_{s}'])*taper
        out[:,0]+=sign*delta*w
    return out
PIV={'right':(10.0,0.0,-62.0),'left':(-10.0,0.0,-62.0)}
def edit_B(co,W,names,phi_deg=28.1,floor=-88.0):
    out=co.copy().astype(np.float64); a=np.radians(phi_deg)
    # toe-up rotation about +X: toe (Y>0, z<pivot z) must go UP. Rotation about X by +a maps (y,z)->(y cos a - z sin a, y sin a + z cos a); a toe at dy>0,dz<0 -> z' = dy sin a + dz cos a (higher). good.
    ws={}
    for s in ['right','left']:
        w=wsum(W,names,[f'foot_{s}']); ws[s]=w; P=np.array(PIV[s])
        d=co-P; y=d[:,1]*np.cos(a)-d[:,2]*np.sin(a); z=d[:,1]*np.sin(a)+d[:,2]*np.cos(a)
        rot=np.c_[d[:,0],y,z]+P
        out+= w[:,None]*(rot-co)
    dz=floor-out[:,2].min()
    wtot=np.clip(ws['right']+ws['left'],0,1)
    out[:,2]+=dz*wtot
    return out,dict(dz_mm=float(dz),phi_deg=phi_deg,min_z_after=float(out[:,2].min()))

REF_TOE_Y_MM=23.09   # official side reference toe-tip Y: mean of Mode F (23.267) and Mode L (22.908) ref extents, data/measure_run1.json sole_envelope.ref_Y_range / data/baseline_mapping.json
def edit_B1(co,W,names):
    """Amendment B1 (post-hoc, disclosed; see AMENDMENT_B1_FROZEN.md): candidate B (pitch + floor) followed by a Y translation (weighted by foot weights) that puts the foot toe-tip (max Y of verts with foot weight>0.5) at the reference toe-tip Y."""
    out,info=edit_B(co,W,names)
    wf=np.clip(wsum(W,names,['foot_right'])+wsum(W,names,['foot_left']),0,1)
    toe=float(out[wf>0.5,1].max()); dy=REF_TOE_Y_MM-toe
    out[:,1]+=dy*wf; info.update(dy_mm=float(dy),toe_tip_Y_before_shift=toe,toe_tip_Y_after=float(out[wf>0.5,1].max()),min_z_after=float(out[:,2].min()))
    return out,info
