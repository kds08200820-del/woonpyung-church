import sys, subprocess, numpy as np, scipy.signal as sg, scipy.ndimage as nd
def load(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",p,"-f","f32le","-ac","2","-ar","44100","-"],capture_output=True).stdout
    return np.frombuffer(raw,np.float32).reshape(-1,2)
def feats(p):
    x = load(p); sr=44100; m = x.mean(1); side=(x[:,0]-x[:,1])/2
    f,t,Z = sg.stft(m, sr, nperseg=4096, noverlap=3072); S=np.abs(Z)
    Hm = nd.median_filter(S,(1,31)); Pm = nd.median_filter(S,(31,1)); Mh=Hm**2/(Hm**2+Pm**2+1e-12)
    tot=(S**2).sum()
    def b(lo,hi): k=(f>=lo)&(f<hi); return (S[k]**2).sum()/tot*100
    fr = 1024/sr; step=int(6/fr); dbs=[10*np.log10((S[:,i:i+step]**2).sum()/step+1e-12) for i in range(0,S.shape[1]-step,step)]
    cent = (f[:,None]*S).sum(0)/(S.sum(0)+1e-9)
    # 화성 성분이 계속 차 있는 정도(음 사이 빈틈): 화성 에너지가 중앙값의 1/10 아래로 떨어진 프레임 비율
    he=(S*Mh)[(f>60)&(f<2000)].sum(0); gaps=(he< np.median(he)*0.1).mean()*100
    return dict(width=np.sqrt((side**2).mean())/np.sqrt((m**2).mean()), harm=((S*Mh)**2).sum()/tot*100,
                sub=b(20,60), low=b(60,250), lowmid=b(250,800), mid=b(800,2500), high=b(2500,6000), air=b(6000,16000),
                bright=np.median(cent), dyn=np.percentile(dbs,90)-np.percentile(dbs,10), gaps=gaps)
names=["참고 음원","옛 오케스트라","새 오케스트라"]
rows=[feats(p) for p in sys.argv[1:]]
keys=[("width","좌우 넓이"),("harm","화성 %"),("sub","20-60Hz %"),("low","60-250 %"),("lowmid","250-800 %"),("mid","800-2.5k %"),("high","2.5-6k %"),("air","6k+ %"),("bright","밝기 Hz"),("dyn","크기 폭 dB"),("gaps","빈틈 %")]
print("%-12s"%"" + "".join("%14s"%n for n in names))
for k,l in keys: print("%-12s"%l + "".join("%14.2f"%r[k] for r in rows))
