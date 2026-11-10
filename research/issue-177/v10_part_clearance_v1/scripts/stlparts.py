"""Binary STL loader and shell splitter (numpy/scipy only)."""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
def load_stl(path):
    d = open(path, "rb").read(); n = int(np.frombuffer(d, "<u4", 1, 80)[0])
    rec = np.frombuffer(d, np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), n, 84)
    T = rec["v"].astype(np.float64)                      # (n,3,3)
    P = T.reshape(-1, 3); key = np.round(P, 5)
    U, inv = np.unique(key, axis=0, return_inverse=True)
    return U, inv.reshape(-1, 3)
def shells(V, F):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(V), len(V)))
    nc, lab = connected_components(A, directed=False)
    fl = lab[F[:, 0]]
    return [np.where(fl == c)[0] for c in range(nc)]
def volume(V, F):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)
