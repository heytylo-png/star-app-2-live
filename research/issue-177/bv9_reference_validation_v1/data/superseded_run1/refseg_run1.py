import numpy as np, cv2
D='/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/'
FILES={'front':'02_full_body_front_wireframe.jpg','side':'03_full_body_side_wireframe.jpg','back':'04_full_body_back_wireframe.jpg'}
def segment(view, tex_thr=4.0, win=3, diff_thr=10.0, close=5):
    im=cv2.imread(D+FILES[view]); g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype(np.float32)
    H,W=g.shape; yy,xx=np.mgrid[0:H,0:W]; x=xx/W-.5; y=yy/H-.5
    k=(win,win); m=cv2.blur(g,k); s=np.sqrt(np.maximum(cv2.blur(g*g,k)-m*m,0))
    m7=cv2.blur(g,(7,7)); s7=np.sqrt(np.maximum(cv2.blur(g*g,(7,7))-m7*m7,0))
    bgm=(np.abs(x)>0.36)|(y<-0.47)
    for it in range(4):
        A=np.c_[np.ones(bgm.sum()),x[bgm],y[bgm],x[bgm]**2,x[bgm]*y[bgm],y[bgm]**2]
        c,*_=np.linalg.lstsq(A,m7[bgm],rcond=None)
        bg=(c[0]+c[1]*x+c[2]*y+c[3]*x*x+c[4]*x*y+c[5]*y*y)
        bgm=(np.abs(m7-bg)<6)&(s7<3.0)&((np.abs(x)>0.2)|(y<-0.4)|(y>0.45))
    fg=((s>tex_thr)|(np.abs(m-bg)>diff_thr)).astype(np.uint8)
    fg=cv2.morphologyEx(fg,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(close,close)))
    # fill holes: flood fill from border on inverse
    inv=(1-fg).astype(np.uint8); ff=inv.copy(); h,w=ff.shape
    mask=np.zeros((h+2,w+2),np.uint8); cv2.floodFill(ff,mask,(0,0),2)
    filled=(ff!=2).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(filled,connectivity=8)
    big=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); out=(lab==big).astype(np.uint8)
    # drop small speckle components but keep any >2000 px
    for i in range(1,n):
        if i!=big and st[i,cv2.CC_STAT_AREA]>2000: out|=(lab==i).astype(np.uint8)
    return out, im, {'bg_coef':c.tolist(),'n_components_kept':int(out.max()), 'tex_thr':tex_thr,'win':win,'diff_thr':diff_thr,'close':close}
