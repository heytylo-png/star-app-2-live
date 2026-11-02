# diagnostic: list slice loops (centroid, area, perimeter) of skin-material tris at selected z levels (model mm). Read-only.
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np
import s05_measure as S
V,T,MAT=S.V,S.T,S.MAT
Tk=T[MAT==2]; zc=V[Tk][:,:,2].mean(1); Tk=Tk[zc<100]
def loops(z):
    zz=V[Tk][:,:,2]-z; cross=(zz.min(1)<0)&(zz.max(1)>=0); tri=Tk[cross]; zq=zz[cross]
    adj={}; P={}
    for t,zr in zip(tri,zq):
        pts=[]
        for i,j in((0,1),(1,2),(2,0)):
            if (zr[i]<0)!=(zr[j]<0):
                a,b=t[i],t[j]; w=zr[i]/(zr[i]-zr[j]); p=V[a]+(V[b]-V[a])*w; k=(min(a,b),max(a,b)); P[k]=p; pts.append(k)
        if len(pts)==2: adj.setdefault(pts[0],[]).append(pts[1]); adj.setdefault(pts[1],[]).append(pts[0])
    seen=set(); out=[]
    for k in P:
        if k in seen: continue
        st=[k]; seen.add(k); comp=[]
        while st:
            c=st.pop(); comp.append(c)
            for nb in adj.get(c,[]):
                if nb not in seen: seen.add(nb); st.append(nb)
        pts=np.array([P[c] for c in comp]); out.append(dict(n_pts=len(comp),cx=float(pts[:,0].mean()),cy=float(pts[:,1].mean()),xr=[float(pts[:,0].min()),float(pts[:,0].max())],yr=[float(pts[:,1].min()),float(pts[:,1].max())]))
    return out
R={}
for z in [21,25,29,33,37,41]:
    R[str(z)]=loops(float(z)); print(z,len(R[str(z)]),[(round(l['cx']),round(l['cy']),l['n_pts']) for l in R[str(z)]])
json.dump(R,open(S.OUT+'data/slice_loops_diag_z21_41.json','w'),indent=1)
