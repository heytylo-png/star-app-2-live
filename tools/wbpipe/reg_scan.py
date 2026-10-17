# Step 1: one fixed scale per clip. feet centre -> x 363.5, sole -> y 1258 (stage), s chosen so the f0 face sits on idle.
# usage: [S0=.. S1=.. ST=..] python3 reg_scan.py <n...>   (frames in vid/hf<n>/) -> reg_scan.json {n:[s,tx,ty]}
# Reproduces wb/hf s 1.845 / tx -303.4675 / ty -540.41375 for 1329/1330/1366.
import os,sys,json,numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)));from lib import *
I=idle_rgba();LI=L(I);FB=(slice(120,285),slice(260,460))
def score(A,r=4):
    X=L(A);b=None
    for dy in range(-r,r+1):
        for dx in range(-r,r+1):
            v=np.abs(X[FB]-np.roll(np.roll(LI,dy,0),dx,1)[FB]).mean()
            if b is None or v<b[0]: b=(round(float(v),2),dx,dy)
    return b
def reg_params(fe,s): return s,363.5-s*fe['fcx'],1258-s*(fe['sole']+0.75)
def scan(n,S0=1.70,S1=1.98,ST=0.005,frame=0):
    im=Image.open(frames(n)[frame]).convert('RGB'); fe=dark_feats(np.asarray(im)); res=[]
    for s in np.arange(S0,S1,ST):
        # as in the original wb/hf1 scan: tx/ty from the raw arange value, warp with it, store s rounded to 3 dp
        # (gives tx -303.46749999999884 / ty -540.413749999997, the exact constants of the shipped builds)
        s,tx,ty=reg_params(fe,s); res.append((score(warp(im,s,tx,ty)),round(float(s),3),float(tx),float(ty)))
    res.sort(key=lambda r:(abs(r[0][2])>0,r[0][0])); return fe,res
if __name__=='__main__':
    P=ROOT+'reg_scan.json'; out=json.load(open(P)) if os.path.exists(P) else {}
    for n in sys.argv[1:]:
        fe,res=scan(n,float(os.environ.get('S0',1.70)),float(os.environ.get('S1',1.98)),float(os.environ.get('ST',0.005)))
        print(n,fe,[(r[0],r[1]) for r in res[:4]]); out[n]=[res[0][1],res[0][2],res[0][3]]
    json.dump(out,open(P,'w'),indent=1)
