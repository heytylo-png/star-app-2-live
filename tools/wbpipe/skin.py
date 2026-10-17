import numpy as np
CHEEK=(slice(208,252),slice(292,428))   # blush band B (idle space, face at idle position)
def skin_w(X):
    X=X.astype(np.float32); r,g,b=X[...,0],X[...,1],X[...,2]
    c=np.clip((r-b-20)/15,0,1)*np.clip((r-g-10)/10,0,1)*np.clip((r-80)/20,0,1)*np.clip((245-r)/10,0,1)*np.clip((g-b+10)/10,0,1)
    return c*(X[...,3]/255. if X.shape[-1]==4 else 1)
