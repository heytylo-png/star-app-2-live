import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import GLB
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
g=GLB(sys.argv[1]); p=g.js['meshes'][0]['primitives'][0]
V=g.acc(p['attributes']['POSITION']).astype(float); F=g.acc(p['indices']).astype(np.int64).reshape(-1,3)
q=np.round(V/1e-7).astype(np.int64); _,inv=np.unique(q,axis=0,return_inverse=True); inv=inv.ravel(); Fw=inv[F]; n=inv.max()+1
e=np.concatenate([Fw[:,[0,1]],Fw[:,[1,2]],Fw[:,[2,0]]]); e=e[e[:,0]!=e[:,1]]
nc,lab=connected_components(coo_matrix((np.ones(len(e),np.int8),(e[:,0],e[:,1])),shape=(n,n)),directed=False)
es=np.sort(e,1); _,cnt=np.unique(es[:,0]*n+es[:,1],return_counts=True)
sz=np.sort(np.bincount(lab))[::-1]
print(dict(welded_verts=int(n),triangles=int(len(F)),components=int(nc),largest=sz[:8].tolist(),boundary_edges=int((cnt==1).sum()),nonmanifold=int((cnt>2).sum())))
