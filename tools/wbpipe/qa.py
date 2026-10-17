# hair-flip QA per clip: matte holes (transparent px enclosed inside the figure that are not studio-white pockets in the source),
# white fringe (a>0, rgb min>=200, touching transparency), top-row alpha (parts leaving the stage top), band edges.
import sys,json;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
from scipy import ndimage as ndi
R={}
for n in sys.argv[1:]:
    holes=[];fr=[];top=[];edges=[0,0,0]
    for k in range(nframes(n)):
        A=np.asarray(Image.open(WORK+f'ship/welcome{n}_{k:03d}.png')).astype(int); a=A[...,3]
        src=np.asarray(Image.open(VID+f'reghf{n}/f{k:03d}.png').convert('RGB')).astype(int)
        enc=ndi.binary_fill_holes(a>0)&(a==0); white=(src.min(2)>=238)&(src.max(2)-src.min(2)<=18)
        h=enc&~white; lab,nn=ndi.label(h); sz=np.bincount(lab.ravel())[1:]; holes.append(int((sz>=4).sum()))
        f=(a>0)&(A[...,:3].min(2)>=200)&ndi.binary_dilation(a==0,np.ones((3,3))); fr.append(int(f.sum()))
        top.append(int((a[0]>32).sum()))
        edges=[max(edges[0],int(a[:,:2].max())),max(edges[1],int(a[:,670:672].max())),max(edges[2],int(a[-2:].max()))]
    tf=[k for k,v in enumerate(top) if v]
    R[n]=dict(hole_frames=sum(1 for v in holes if v),max_holes=max(holes),fringe_max=max(fr),fringe_total=sum(fr),
              top_frames=len(tf),top_range=[tf[0],tf[-1]] if tf else None,top_max_width=max(top),edges=edges)
    print(n,R[n],flush=True)
json.dump(R,open(WORK+'qa.json','w'))
