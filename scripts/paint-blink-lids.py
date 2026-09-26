#!/usr/bin/env python3
"""Blink pass 4 for Star Rai: lids PAINTED on the live idle painting (public/rai/idle.png).

No pixels from the 807 reference video are read, copied, warped or composited here; 807 was
only looked at to judge lid position (7s = half, 8s = shut) and lash curve/tilt.

Method (all inside the eye box x=420,y=185,w=210,h=70; everything else is byte-identical):
  * each eye's old opening (upper lash + sclera + iris + lower-lid line) is traced as a smooth
    Catmull-Rom outline and rasterised at 16x supersampling, box-filtered down (antialiased).
  * skin under the new lid = screened-Poisson fill: continuous with idle's own surrounding skin at
    the outline, relaxing to a smooth skin-tone field sampled from idle's clean skin, plus a light
    grain matched to idle's cheek texture.
  * 02/03: skin is painted above a smooth new lid-edge curve and the idle-coloured upper lash is
    painted as one tapered stroke on that curve; iris/sclera below the curve are idle's own.
  * 04: the whole opening becomes skin and one tapered crescent lash is painted low in the opening.
  * hair strands that ran into the old lash are tapered to a point over the new skin.
Requires: numpy, pillow, scipy.   Run: python3 scripts/paint-blink-lids.py
"""
import numpy as np
def catmull(pts, closed=True, n=24):
    P=np.array(pts,float); out=[]
    m=len(P); rng=range(m) if closed else range(m-1)
    for i in rng:
        p0=P[(i-1)%m] if closed or i>0 else P[i]
        p1=P[i]; p2=P[(i+1)%m]
        p3=P[(i+2)%m] if closed or i+2<m else P[(i+1)%m]
        for t in np.linspace(0,1,n,endpoint=False):
            t2,t3=t*t,t*t*t
            out.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
    if not closed: out.append(P[-1])
    return np.array(out)

import numpy as np, hashlib
from PIL import ImageDraw
from PIL import Image
from scipy.sparse import lil_matrix, csr_matrix
from scipy.sparse.linalg import spsolve
from scipy.ndimage import gaussian_filter

import os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
IDLE=os.path.join(ROOT,'public/rai/idle.png')
idle=np.asarray(Image.open(IDLE).convert('RGB')).astype(np.float64)
H,W,_=idle.shape
# working region (inside eye box 420..630 x 185..255)
X0,Y0,X1,Y1=428,188,600,240
S=16
w,h=X1-X0,Y1-Y0

class _P:
    """minimal path recorder (moveTo/lineTo/close) -> polygons"""
    def __init__(s): s.polys=[]; s.cur=None
    def moveTo(s,x,y): s.cur=[(x,y)]; s.polys.append(s.cur)
    def lineTo(s,x,y): s.cur.append((x,y))
    def close(s): pass
def render(path_fn):
    """rasterise filled polygon(s) at SxS supersampling (even-odd free, simple polys); returns SUPERSAMPLED 0/1 mask"""
    p=_P(); path_fn(p)
    im=Image.new('L',(w*S,h*S),0); d=ImageDraw.Draw(im)
    for poly_ in p.polys:
        d.polygon([((x-X0)*S,(y-Y0)*S) for x,y in poly_],fill=255)
    return np.asarray(im).astype(np.float64)/255.0
def down(a):
    return a.reshape(h,S,w,S).mean(axis=(1,3))
def poly(pts):
    def f(path):
        path.moveTo(*pts[0])
        for q in pts[1:]: path.lineTo(*q)
        path.close()
    return f

# ---------------- geometry (traced on idle.png) ----------------
A_OPEN=[(440.9,206.0),(441.4,203.6),(442.5,202.6),(446,201.6),(450,199.8),(455,199.9),(460,200.1),(465,200.6),(470,201.2),(475,202.1),(480,203.6),(484,205.1),(488,206.9),(491,208.6),(493.5,210.6),(495.5,213),(497.2,215.6),(498.5,218.3),
        (499.0,221.5),(497.4,225.0),(494.0,228.4),(489,230.6),(482,231.0),(474,231.0),(467,230.9),(461.8,230.5),(459.0,227.6),(456.2,224.2),(454.2,222.1),(452.2,218.9),(450.2,216.5),(448.3,214.4),(446.4,212.0),(443.6,209.7),(441.6,208.8)]
B_OPEN=[(547.3,210.2),(547.8,207.4),(549,205.4),(552,203.6),(556,201.7),(560,199.8),(564,198.8),(568,197.8),(572,197.1),(576,196.8),(580,196.9),(584,196.7),(588,197.6),(590.2,199),(590.5,203),(590.3,207),(589.7,210.4),(588.6,212.3),
        (586.6,215.0),(584.8,218.6),(582.8,221.4),(580.4,224.2),(577.6,227.1),(573,228.5),(566,228.6),(558,228.5),(553.2,228.2),(549.8,227.3),(547.2,225.6),(545.6,223.4),(544.3,220.3),(544.0,217.2),(543.9,215.3),(545.3,213.6),(546.4,212.2)]

def spline(pts,closed,n=24): return [tuple(p) for p in catmull(pts,closed,n)]

# lid-edge curves E (outer->inner for A, inner->outer for B) per frame
E={
 'A02':[(446.0,209.4),(452,211.3),(460,212.8),(468,214.0),(477,214.8),(486,214.6),(492,215.5),(497.6,217.9)],
 'A03':[(446.0,209.6),(452,213.0),(460,216.2),(468,218.0),(477,218.6),(486,218.5),(492,218.2),(497.6,217.9)],
 'B02':[(546.8,212.2),(550,211.9),(556,211.9),(563,211.9),(570,211.4),(577,210.2),(583,209.4),(587.2,210.4)],
 'B03':[(546.8,212.2),(551,214.5),(557,215.8),(563,216.1),(570,215.8),(577,214.6),(583,212.6),(587.2,210.4)],
}

C04={'A':[(441.7,207.3),(446,210.2),(452,214.4),(460,218.3),(468,220.3),(477,221.0),(486,220.5),(493,219.3),(497.9,218.0)],
     'B':[(547.1,215.6),(552,218.3),(559,219.6),(566,219.6),(573,218.4),(579.5,216.0),(584.5,212.6),(588.4,209.2),(590.6,206.4)]}

# ---------------- skin fill (harmonic / membrane inpaint from idle's own surrounding skin) -----
def open_cov():
    def f(path):
        for pts in (A_OPEN,B_OPEN):
            sp=spline(pts,True)
            path.moveTo(*sp[0]); [path.lineTo(*q) for q in sp[1:]]; path.close()
    return render(f)
covO_s=open_cov(); covO=down(covO_s)

reg=idle[Y0:Y1,X0:X1].copy()
Lr=reg@np.array([0.299,0.587,0.114])
sclera=(reg.min(2)>185)&((reg[...,0]-reg[...,2])<70)
skinlike=(Lr>120)&(reg[...,0]>reg[...,1])&(reg[...,1]>reg[...,2])&(reg[...,0]>150)&~sclera&(((reg[...,0]-reg[...,2])/np.maximum(reg[...,0],1))>0.33)
unk=covO>0
# smooth skin-tone base from idle's own clean skin (normalized gaussian convolution, outside the opening)
satr=(reg[...,0]-reg[...,2])/np.maximum(reg[...,0],1)
# skin-tone base: per column, sample idle's own skin in the shadow band just ABOVE the old opening and
# the band just BELOW it, and carry the colour down across the opening with a smooth vertical gradient.
def _band_base():
    Om=covO>0.5
    base=np.zeros_like(reg)
    T=np.full((w,3),np.nan); Bt=np.full((w,3),np.nan); top=np.full(w,np.nan); bot=np.full(w,np.nan)
    for c in range(w):
        ys=np.nonzero(Om[:,c])[0]
        if len(ys)==0: continue
        t,b=ys[0],ys[-1]; top[c]=t; bot[c]=b
        up=[y for y in range(max(t-6,0),t) if skinlike[y,c] and covO[y,c]==0]
        dn=[y for y in range(b+1,min(b+6,h)) if skinlike[y,c] and covO[y,c]==0]
        if len(up)>=2: T[c]=np.median(reg[up,c],0)
        if len(dn)>=2: Bt[c]=np.median(reg[dn,c],0)
    xs=np.arange(w)
    def fillsmooth(A,sig=2.5):
        A=A.copy()
        for k in range(A.shape[1]):
            ok=~np.isnan(A[:,k]); A[:,k]=np.interp(xs,xs[ok],A[ok,k])
        return np.stack([gaussian_filter(A[:,k],sig,mode='nearest') for k in range(A.shape[1])],1)
    T=fillsmooth(T); Bt=fillsmooth(Bt)
    okc=~np.isnan(top); top=np.interp(xs,xs[okc],top[okc]); bot=np.interp(xs,xs[okc],bot[okc])
    # the lid keeps the shadow-band tone all the way down to the closed lash line; the change to the
    # cheek tone happens across the lash (where the painted lash hides it), eased with a smoothstep.
    yl=np.full(w,np.nan)
    for e in 'AB':
        cp=np.array(spline(C04[e],False)); o=np.argsort(cp[:,0])
        xs_e=np.arange(int(np.ceil(cp[:,0].min())),int(np.floor(cp[:,0].max()))+1)
        yl[xs_e-X0]=np.interp(xs_e,cp[o,0],cp[o,1])
    okl=~np.isnan(yl); yl=np.interp(xs,xs[okl],yl[okl])
    # outside the lash span (eye corners) fall back to the middle of the opening
    span=np.zeros(w,bool)
    for e in 'AB':
        cx=[q[0] for q in C04[e]]; span[int(min(cx))-X0:int(max(cx))-X0+1]=True
    yl=np.where(span,yl,(top+bot)/2+Y0)-Y0
    yy=np.arange(h)[:,None]
    sfrac=np.clip((yy-(yl[None,:]-3.0))/5.0,0,1)
    sfrac=sfrac*sfrac*(3-2*sfrac)
    return T[None,:,:]*(1-sfrac[...,None])+Bt[None,:,:]*sfrac[...,None]
base=_band_base()
LAM=1/6.0**2
res=reg-base
idx=-np.ones((h,w),int); ii=np.argwhere(unk); idx[unk]=np.arange(len(ii))
n=len(ii); A=lil_matrix((n,n)); b=np.zeros((n,3))
for k,(y,x) in enumerate(ii):
    d=0
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        yy,xx=y+dy,x+dx
        if not(0<=yy<h and 0<=xx<w): continue
        if unk[yy,xx]: A[k,idx[yy,xx]]=-1; d+=1
        elif skinlike[yy,xx]: b[k]+=res[yy,xx]; d+=1
    A[k,k]=d+LAM
A=csr_matrix(A)
F=reg.copy()
sol=np.stack([spsolve(A,b[:,c]) for c in range(3)],1)
F[unk]=base[unk]+sol
# idle-matched skin grain: high-pass std of idle's plain cheek skin
cheek=idle[230:240,455:490]; hp=cheek-np.stack([gaussian_filter(cheek[...,c],1.2) for c in range(3)],2)
gstd=hp.reshape(-1,3).std(0)
rng=np.random.default_rng(807)
g=gaussian_filter(rng.standard_normal((h,w)),0.5); g/=g.std()
F_n=F+g[...,None]*gstd[None,None,:]*0.8
F_n=np.clip(F_n,0,255)

LASH=np.array([24.,5.,2.])

def spl_open(pts,n=24): return spline(pts,False,n)
def lash_path(top,bot):
    t=spl_open(top); bt=spl_open(bot)
    def f(path):
        path.moveTo(*t[0]); [path.lineTo(*q) for q in t[1:]]
        [path.lineTo(*q) for q in bt[::-1]]; path.close()
    return f
def lid_lash(Epts, th, tip, tip_at_start):
    """upper lash painted as one stroke whose lower edge is the new lid edge."""
    top=[(x,y-t) for (x,y),t in zip(Epts,th)]
    bot=list(Epts)
    wt,wb=tip   # outer wing: extra top/bottom points ending in the shared flick tip, shaped like idle's wing
    if tip_at_start: top=wt+top; bot=wb+bot
    else: top=top+wt; bot=bot+wb
    return top,bot
def closed_lash(C, th, up=0.42):
    top=[(x,y-t*up) for (x,y),t in zip(C,th)]
    bot=[(x,y+t*(1-up)) for (x,y),t in zip(C,th)]
    return top,bot
def above_path(Epts, left_to_right=True):
    sp=spl_open(Epts)
    if sp[0][0]>sp[-1][0]: sp=sp[::-1]
    pts=[(X0-8,sp[0][1])]+sp+[(X1+8,sp[-1][1]),(X1+8,Y0-8),(X0-8,Y0-8)]
    return poly(pts)

# lash thickness at each lid-edge point, measured off idle's own upper lash: thickest in the outer
# third (~8.5px), tapering to a fine point at the inner corner.
TH={'A':[7.6,8.6,8.4,7.4,6.0,4.4,2.8,0.6],'B':[0.6,2.6,4.4,5.8,7.0,7.8,8.2,8.4]}
# outer flick, copied in shape from idle: her right eye (viewer-left) runs straight out to a point;
# her left eye (viewer-right) droops down the outer corner and tucks behind the hair strand.
TIP={'A':([(441.0,205.4),(443.6,203.2)],[(441.0,205.4),(443.6,208.4)]),
     'B':([(590.4,201.8),(591.4,206.4)],[(589.6,211.8),(591.4,206.4)])}
TH04={'A':[0,2.5,3.7,4.2,4.4,4.2,3.6,2.3,0],'B':[0,2.3,3.5,4.1,4.3,4.2,3.8,2.8,0]}

TIPS=[((460.3,199.9),(1.17,1.0),2.0,3.0),((465.9,200.4),(0.05,1.0),3.0,3.4),
      ((574.6,196.9),(-0.75,1.0),2.6,3.0),((586.6,196.2),(0.9,1.0),3.0,3.0)]
def tip_poly(base,d,wd,ln):
    d=np.array(d,float); d/=np.linalg.norm(d); nrm=np.array([-d[1],d[0]]); b=np.array(base)
    b0=b-d*1.2
    pts=[b0-nrm*wd/2, b-nrm*wd*0.45, b+d*ln*0.5-nrm*wd*0.25, b+d*ln, b+d*ln*0.5+nrm*wd*0.25, b+nrm*wd*0.45, b0+nrm*wd/2]
    return [tuple(p) for p in pts]
def tip_color(base):
    x,y=int(round(base[0])),int(round(base[1]))
    patch=idle[y-4:y,x-3:x+4].reshape(-1,3); l=patch@np.array([.299,.587,.114])
    return patch[l<=np.percentile(l,25)].mean(0)
TIPC=[tip_color(t[0]) for t in TIPS]
def soften(m_s,sig=0.45):
    return gaussian_filter(m_s,sig*S)

def frame(which):
    out=reg.copy()
    if which=='04':
        cs=covO; lash_s=np.zeros_like(covO_s)
        for e in 'AB':
            t,bb=closed_lash(C04[e],TH04[e]); lash_s=np.maximum(lash_s,render(lash_path(t,bb)))
    else:
        cs_s=np.zeros_like(covO_s); lash_s=np.zeros_like(covO_s)
        for e in 'AB':
            Ep=E[e+which]
            # restrict half-plane to this eye's side
            side=render(poly([(X0-8,Y0-8),(520,Y0-8),(520,Y1+8),(X0-8,Y1+8)])) if e=='A' else render(poly([(520,Y0-8),(X1+8,Y0-8),(X1+8,Y1+8),(520,Y1+8)]))
            cs_s=np.maximum(cs_s,covO_s*render(above_path(Ep))*side)
            t,bb=lid_lash(Ep,TH[e],TIP[e],tip_at_start=(e=='A'))
            lash_s=np.maximum(lash_s,render(lash_path(t,bb)))
        cs=down(cs_s)
    lash_s=soften(lash_s)
    cl=down(lash_s*covO_s)
    out=out*(1-cs[...,None])+F_n*cs[...,None]
    # hair-strand tips that used to run into the old lash: taper them to a point over the new skin
    for (base,d,wd,ln),col in zip(TIPS,TIPC):
        ct=down(soften(render(poly(spline(tip_poly(base,d,wd,ln),False,8))),0.3)*covO_s)*cs
        out=out*(1-ct[...,None])+col*ct[...,None]
    # soft contact shadow cast by the new lid onto the eye (only below the lash, inside the opening)
    if which!='04':
        sh_s=np.zeros_like(covO_s)
        for e in 'AB':
            Ep=E[e+which]; t,bb=lid_lash(Ep,TH[e],TIP[e],tip_at_start=(e=='A'))
            sh_s=np.maximum(sh_s,render(lash_path([(x,y+1.6) for x,y in t],[(x,y+1.6) for x,y in bb])))
        sh=down(gaussian_filter(sh_s,0.9*S)*covO_s)*(1-cs)*(1-cl)
        out=out*(1-0.22*sh[...,None])
    out=out*(1-cl[...,None])+LASH*cl[...,None]
    full=idle.copy(); full[Y0:Y1,X0:X1]=out
    return np.clip(np.rint(full),0,255).astype(np.uint8), cs, cl

if __name__=='__main__':
    import shutil, sys
    baked=os.path.join(ROOT,'artifacts/star-rai-blink-frames/baked')
    names={'02':'idle_blink_02_closing.png','03':'idle_blink_03_half.png','04':'idle_blink_04_closed.png'}
    shutil.copyfile(IDLE,os.path.join(baked,'idle_blink_01_open.png'))
    shutil.copyfile(IDLE,os.path.join(ROOT,'public/rai/idle_blink_01_open.png'))
    for fr,nm in names.items():
        img,cs,cl=frame(fr)
        Image.fromarray(img,'RGB').save(os.path.join(baked,nm),optimize=True)
        shutil.copyfile(os.path.join(baked,nm),os.path.join(ROOT,'public/rai',nm))
    print('painted 02/03/04 onto idle.png')
