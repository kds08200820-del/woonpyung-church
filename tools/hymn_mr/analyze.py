# 참고 음원 분석: 화성(지속음)·타악(때림) 나누기, 대역별 에너지, 박자, 구간별 모습
import numpy as np, scipy.io.wavfile as wf, scipy.signal as sg, scipy.ndimage as nd
sr, x = wf.read(r"C:\hymn-mr\ref\ref.wav"); x = x.astype(np.float32) / 32768
mono = x.mean(1); side = (x[:, 0] - x[:, 1]) / 2
N, H = 4096, 1024
f, t, Z = sg.stft(mono, sr, nperseg=N, noverlap=N - H)
S = np.abs(Z)
# HPSS(중앙값 거르기)
Hm = nd.median_filter(S, size=(1, 31)); Pm = nd.median_filter(S, size=(31, 1))
Mh = Hm ** 2 / (Hm ** 2 + Pm ** 2 + 1e-12); Mp = 1 - Mh
Sh, Sp = S * Mh, S * Mp
def band(SS, lo, hi):
    k = (f >= lo) & (f < hi); return (SS[k] ** 2).sum(0)
bands = [("서브(30-60)", 30, 60), ("저음(60-250)", 60, 250), ("중저(250-800)", 250, 800), ("중음(800-2.5k)", 800, 2500), ("고음(2.5-6k)", 2500, 6000), ("공기(6-16k)", 6000, 16000)]
tot = (S ** 2).sum()
print("전체 길이 %.1f초, 좌우 넓이(side/mid RMS) %.2f" % (len(mono) / sr, np.sqrt((side ** 2).mean()) / np.sqrt((mono ** 2).mean())))
print("화성 성분 비율 %.0f%%, 타악 성분 비율 %.0f%%" % ((Sh ** 2).sum() / tot * 100, (Sp ** 2).sum() / tot * 100))
print("\n대역별 비율(화성 / 타악):")
for name, lo, hi in bands:
    print("  %-14s %5.1f%% / %5.1f%%" % (name, band(Sh, lo, hi).sum() / tot * 100, band(Sp, lo, hi).sum() / tot * 100))
# 타악 때림(onset) — 낮은 대역(큰북·팀파니)과 높은 대역(심벌·스네어) 따로
def onsets(env):
    e = np.maximum(0, np.diff(np.log1p(env * 1000), prepend=0))
    e = e - nd.uniform_filter1d(e, 20); e[e < 0] = 0
    pk, _ = sg.find_peaks(e, height=np.percentile(e, 97), distance=int(0.12 * sr / H))
    return pk, e
low_p, low_e = onsets(band(Sp, 30, 150)); hi_p, hi_e = onsets(band(Sp, 5000, 16000))
fr = H / sr
print("\n낮은 때림(30-150Hz, 큰북·팀파니류) %d번, 높은 때림(5k+ 심벌·스네어류) %d번" % (len(low_p), len(hi_p)))
# 박자: 전체 onset 자기상관
env = nd.uniform_filter1d(np.maximum(0, np.diff((Sp ** 2).sum(0), prepend=0)), 2)
ac = np.correlate(env - env.mean(), env - env.mean(), "full")[len(env) - 1:]
lags = np.arange(len(ac)) * fr; k = (lags > 0.3) & (lags < 1.5)
best = lags[k][np.argmax(ac[k])]
print("가장 강한 박 간격 %.3f초 → 약 %.0f BPM" % (best, 60 / best))
# 구간별(6초) 모습
print("\n시간  크기dB  저음%%  고음%%  타악%%  낮은때림 높은때림  밝기(Hz)")
cent = (f[:, None] * S).sum(0) / (S.sum(0) + 1e-9)
step = int(6 / fr)
for i in range(0, S.shape[1], step):
    sl = slice(i, i + step); s2 = (S[:, sl] ** 2).sum() + 1e-12
    db = 10 * np.log10(s2 / step)
    lowr = band(S[:, sl], 30, 250).sum() / s2 * 100; hir = band(S[:, sl], 2500, 16000).sum() / s2 * 100
    pr = (Sp[:, sl] ** 2).sum() / s2 * 100
    nl = ((low_p >= i) & (low_p < i + step)).sum(); nh = ((hi_p >= i) & (hi_p < i + step)).sum()
    print("%5.0f  %6.1f  %5.1f  %5.1f  %5.1f   %3d      %3d     %6.0f" % (i * fr, db, lowr, hir, pr, nl, nh, cent[sl].mean()))
# 화성 성분의 음높이 분포(어떤 음역이 두꺼운가) — 옥타브별
mid = 69 + 12 * np.log2(np.maximum(f, 1) / 440)
print("\n화성 성분 옥타브별 에너지(%):")
for o in range(1, 8):
    k = (mid >= 12 * (o + 1)) & (mid < 12 * (o + 2))
    print("  C%d~B%d: %5.1f" % (o, o, (Sh[k] ** 2).sum() / (Sh ** 2).sum() * 100))
# 지속음 vs 빠른 움직임: 화성 성분의 프레임간 변화(높으면 아르페지오·빠른 음형)
flux = np.sqrt((np.diff(Sh, axis=1) ** 2).sum(0)) / (np.sqrt((Sh ** 2).sum(0))[1:] + 1e-9)
print("\n화성 성분 변화량(중앙값) %.3f (작으면 길게 끄는 소리, 크면 아르페지오·빠른 음형)" % np.median(flux))
# 사람 목소리 대역(포먼트 1-3kHz, 비브라토) 존재 여부: 300-3400Hz 화성 성분 시간 비율
v = band(Sh, 300, 3400) / ((Sh ** 2).sum(0) + 1e-9)
print("목소리 대역(300-3400Hz) 화성 비율 평균 %.0f%%" % (v.mean() * 100))
