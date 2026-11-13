# 사용: python check_audio.py 305 orch|piano
# 소리 점검: 박마다 들리는 음(크로마)이 악보의 화음과 맞는지
import sys, json, subprocess, numpy as np
sys.path.insert(0, sys.argv[3] if len(sys.argv) > 3 else __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import hymn_mr as h
no, kind = sys.argv[1], sys.argv[2]
s = json.load(open(rf"C:\hymn-mr\scores\{int(no):03d}.json", encoding="utf-8"))
notes, ranges, bpb = h.build(s); tm = h.time_map(s, ranges, bpb)
SR = 22050
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", rf"C:\hymn-mr\out\{int(no):03d}_{kind}.m4a", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
# 처음 빈 곳을 잘랐으므로 첫 소리 시각으로 맞춘다
amp = np.abs(x); first = np.argmax(amp > amp.max() * 0.02) / SR
off = first - 0.0
N = 8192; f = np.fft.rfftfreq(N, 1 / SR)
mid = 69 + 12 * np.log2(np.maximum(f, 1) / 440)
ok = tot = 0; bad = []
end = max(r[1] for r in ranges.values())
for b in np.arange(0, end, 1.0):
    want = {p % 12 for _, st, d, v, p in notes if st <= b + 0.05 < st + d}
    if not want: continue
    t = tm(b + (0.5 if kind == "piano" else 0.3)) + off   # 피아노는 페달 바꿈 뒤(앞 화음 울림이 걷힌 뒤)에 듣는다
    i = int(t * SR)
    seg = x[i:i + N]
    if len(seg) < N: break
    S = np.abs(np.fft.rfft(seg * np.hanning(N)))
    band = (f > 70) & (f < 1300)
    chroma = np.zeros(12)
    np.add.at(chroma, np.round(mid[band]).astype(int) % 12, S[band] ** 2)
    top = set(np.argsort(chroma)[-len(want):])
    hit = len(top & want) / len(want)
    tot += 1; ok += hit
    if hit < 0.5: bad.append((round(b, 1), sorted(want), sorted(top)))
print(f"{kind}: 박 {tot}개, 화음 일치 {ok / tot * 100:.0f}%, 크게 어긋난 박 {len(bad)}개")
print(bad[:12])
