# 강약 변동 재기: 3초 창의 소리 크기(LUFS 비슷하게 K-가중 없이 RMS dB) — 흔들림(표준편차), 1초 사이 큰 변화 수, 아멘 대 마지막 절 끝
import sys, json, subprocess, numpy as np
def load(p):
    raw = subprocess.run(["ffmpeg","-v","error","-i",p,"-f","f32le","-ac","1","-ar","22050","-"],capture_output=True).stdout
    return np.frombuffer(raw, np.float32)
for p, secs in zip(sys.argv[1::2], sys.argv[2::2]):
    x = load(p); sr = 22050; S = json.load(open(secs))
    win = 3 * sr; hop = sr // 2
    lv = np.array([20*np.log10(np.sqrt((x[i:i+win]**2).mean())+1e-9) for i in range(0, len(x)-win, hop)])
    body = lv[2:-6]                       # 처음·끝 빼고
    jumps = (np.abs(np.diff(body)) > 2.0).sum()
    a0, a1 = S["amen"] if "amen" in S else (None, None)
    w = lambda t0, t1: 20*np.log10(np.sqrt((x[int(t0*sr):int(t1*sr)]**2).mean())+1e-9)
    last = list(S.keys())[-2] if "amen" in S else None
    v_end = S[[k for k in S if k.startswith("v")][-1]][1]
    print("%s: 흔들림 %.2fdB, 0.5초마다 2dB 넘게 바뀐 곳 %d번, 가장 큰-작은 %.1fdB, 아멘 %s" % (p.split("\\")[-1], body.std(), jumps, body.max()-body.min(),
          ("%.1fdB (마지막 절 끝 8초 %.1fdB)" % (w(a0, a1), w(v_end - 8, v_end))) if a0 else "-"))
