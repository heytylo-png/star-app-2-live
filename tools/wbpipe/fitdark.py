# learn the wb "dark" skin/blush match from wb1 f0 (shipped, = dark(post(cut(raw)))) vs our raw cut of the same idle-glare start frame.
import sys,json;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
from skin import skin_w, CHEEK
B=np.load('ref/wb1_1329.npy')[0].astype(float)
A=np.asarray(Image.open('cut/welcome1334_000/welcome1334_000_cut.png')).astype(float)
w=(skin_w(A)>0.9)&(skin_w(B)>0.9); ch=np.zeros_like(w); ch[CHEEK]=True
G={}
for nm,m in (('skin',w&~ch),('cheek',w&ch)):
    G[nm]=list((B[...,:3][m].mean(0)/A[...,:3][m].mean(0)).round(4)); print(nm,m.sum(),G[nm])
json.dump(G,open('dark_gains.json','w'))
