# -*- coding: utf-8 -*-
"""새찬송가 MR 만들기 — 점검한 악보 자료(scores/NNN.json) → 전주 + 전곡 → 오케스트라·피아노 소리 (2026-11-13, 담임목사 지시)

교회 PC 전용. 설계: docs/찬송가-MR-제작-설계.md
  python hymn_mr.py 305                 # 오케스트라·피아노 둘 다
  python hymn_mr.py 305 --only piano

폴더(HYMN_MR_HOME, 기본 C:\\hymn-mr):
  scores\\NNN.json   점검한 악보(성부별 음/박). 새찬송가 악보는 저작물이라 공개 저장소에 두지 않는다.
  vsco2\\            VSCO 2 CE 오케스트라 음원(CC0) + .sfz
  dl\\sfizz\\...\\sfizz_render.exe
  out\\NNN_orch.m4a, out\\NNN_piano.m4a

악보 자료 적는 법: "D4/1 G4/.5 B4/.5"  (음이름+옥타브 / 박 수, 4분음표 = 1).  "~" 를 붙이면 다음 음과 이어진다(붙임줄).
편곡 규칙: 전주 = intro_from 마디부터 끝까지(마지막 4마디), 그다음 1절~끝 절을 간주 없이, 마지막 절 끝줄은 느려지고, 아멘은 끝에 한 번.
"""
import json, os, re, subprocess, sys, argparse
import numpy as np

HOME = os.environ.get("HYMN_MR_HOME", r"C:\hymn-mr")
SR = 48000
SFIZZ = os.path.join(HOME, "dl", "sfizz", "bin", "Release", "sfizz_render.exe")
VS = os.path.join(HOME, "vsco2")
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_no(p):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", p)
    n = NOTE[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return 12 * (int(m.group(3)) + 1) + n


def parse_voice(txt, keep_fermata=False):
    out = []
    for tok in txt.split():
        ferm = "^" in tok
        tok = tok.replace("^", "")
        tie = tok.endswith("~")
        p, d = tok.rstrip("~").split("/")
        out.append((None if p == "r" else midi_no(p), float(d), tie, ferm) if keep_fermata else (None if p == "r" else midi_no(p), float(d), tie))
    return out


# ───────────────────────── 1. 악보 → 시간표(박 단위)

def build(score):
    """[(section, start_beat, dur_beats, voice, midi)] 와 각 구역의 박 범위."""
    ms = score["measures"]
    beats_per_bar = score["time"][0] * 4 / score["time"][1]
    intro_ms = [m for m in ms if m["n"] >= score["intro_from"]]
    secs = [("intro", intro_ms)] + [(f"v{i + 1}", ms) for i in range(score["verses"])]
    if score.get("amen"):
        secs.append(("amen", score["amen"]))
    notes, ranges, t = [], {}, 0.0
    fermatas = []
    for name, mlist in secs:
        start = t
        for v in "SATB":
            tv = start
            hold = None          # 붙임줄로 이어지는 음 (pitch, start, dur)
            for m in mlist:
                for p, d, tie in parse_voice(m[v]):
                    if hold and hold[0] == p:
                        hold = (p, hold[1], hold[2] + d)
                    else:
                        if hold:
                            notes.append((name, hold[1], hold[2], v, hold[0]))
                        hold = (p, tv, d)
                    if not tie:
                        if hold and hold[0] is not None:
                            notes.append((name, hold[1], hold[2], v, hold[0]))
                        hold = None
                    tv += d
            if hold and hold[0] is not None:
                notes.append((name, hold[1], hold[2], v, hold[0]))
        tf = start
        for m in mlist:                       # 늘임표(페르마타): 소프라노 음에 ^
            for p, d, tie, ferm in parse_voice(m["S"], True):
                if ferm:
                    fermatas.append((tf, d))
                tf += d
        t = start + sum(sum(d for _, d, _ in parse_voice(m["S"])) for m in mlist)
        ranges[name] = (start, t)
    build.fermatas = fermatas
    return notes, ranges, beats_per_bar


def time_map(score, ranges, bpb):
    """박 → 초. 마지막 절 끝 4마디는 점점 느리게, 아멘은 더 느리게, 마지막 음은 늘인다."""
    spb = 60.0 / score["bpm"]
    last = f"v{score['verses']}"
    rit_from = ranges[last][1] - 4 * bpb
    end = max(r[1] for r in ranges.values())
    grid = np.arange(0, end + 8, 0.01)
    rate = np.ones_like(grid)
    k = (grid >= rit_from) & (grid < ranges[last][1])
    rate[k] = 1 + 0.22 * ((grid[k] - rit_from) / (4 * bpb)) ** 1.5      # 22% 까지 느려짐
    for f0, fd in getattr(build, "fermatas", []):     # 늘임표 음은 1.8배 길게
        k = (grid >= f0) & (grid < f0 + fd)
        rate[k] *= 1.8
    if "amen" in ranges:
        a0, a1 = ranges["amen"]
        k = grid >= a0
        rate[k] = 1.30
    sec = np.concatenate([[0], np.cumsum(rate[:-1] * 0.01 * spb)])
    return lambda b: float(np.interp(b, grid, sec))


# ───────────────────────── 2. 악기 배치

LV = {"intro": 0.55, "v1": 0.50, "v2": 0.62, "v3": 0.74, "v4": 0.92, "amen": 0.95}

ORCH = [
    # 이름, sfz, 성부, 옮김(반음), 구역, 세기 배율, 소리 크기, 좌우(-1~1)
    ("violin1", "ViolinEnsSusVib.sfz", "S", 0, "all", 1.0, 1.00, -0.35),
    ("violin2", "ViolinEnsSusVib.sfz", "A", 0, "all", 0.9, 0.70, -0.15),
    ("viola", "ViolaEnsSusVib.sfz", "T", 0, "all", 0.9, 0.75, 0.15),
    ("cello", "CelloEnsSusVib.sfz", "B", 0, "all", 1.0, 0.95, 0.35),
    ("bass", "ContrabassSusVB.sfz", "B", -12, "v2 v3 v4 amen", 0.9, 0.70, 0.45),
    ("flute", "FluteSusVib.sfz", "S", 12, "intro v2 v3", 0.85, 0.45, -0.25),
    ("clarinet", "ClarinetSus.sfz", "A", 0, "v3", 0.8, 0.40, -0.05),
    ("horn", "FHornSus.sfz", "T", 0, "v2 v3 v4 amen", 0.85, 0.55, 0.25),
    ("trumpet", "TrumpetSus.sfz", "S", 0, "v4 amen", 0.85, 0.55, 0.05),
    ("trombone", "TromboneSus.sfz", "B", 12, "v4 amen", 0.85, 0.45, 0.30),
    ("tuba", "TubaSus.sfz", "B", -12, "v4 amen", 0.85, 0.45, 0.40),
    ("organ_q", "OrganQuiet.sfz", "SATB", 0, "intro v1 v2 v3", 0.7, 0.35, 0.0),
    ("organ_l", "OrganLoud.sfz", "SATB", 0, "v4 amen", 0.8, 0.40, 0.0),
]
PIANO_SFZ = os.environ.get("HYMN_PIANO", r"C:\hymn-mr\piano\SalamanderGrandPianoV3_44.1khz16bit\SalamanderGrandPianoV3.sfz")
PIANO = [("piano", PIANO_SFZ if os.path.exists(PIANO_SFZ) else "UprightPiano.sfz", "SATB", 0, "all", 1.0, 1.0, 0.0)]
PIANO_LV = {"intro": 0.55, "v1": 0.55, "v2": 0.62, "v3": 0.66, "v4": 0.78, "amen": 0.80}


def in_sec(spec, name):
    return spec == "all" or name in spec.split()


# ───────────────────────── 2b. 오케스트라 편곡 (2026-11-13 목사님 참고 음원 「만복의 근원」 분석으로)
#  참고 음원: 화성 76%·타악 7%, 150~500Hz 두꺼운 지속 화음(현악 여러 겹+호른+오르간), 20~100Hz 깊은 저음이 끊이지 않음,
#  조용한 절과 큰 절이 번갈아 나오고 큰 절에만 큰북·팀파니·심벌, 2.5kHz 위가 적은 따뜻한 소리, 넓은 좌우, 긴 울림.
#  그래서: 음을 끊지 않고 겹쳐 잇고(레가토), 성부를 옥타브로 겹쳐 가운데를 두껍게, 오르간 페달로 바닥을 깔고, 절마다 쌓아 올린다.
import random as _rnd

_RANGE = {}


def sfz_range(sfz):
    if sfz not in _RANGE:
        txt = open(os.path.join(VS, sfz), encoding="utf-8", errors="ignore").read()
        lo = [int(x) for x in re.findall(r"lokey=(\d+)", txt)]; hi = [int(x) for x in re.findall(r"hikey=(\d+)", txt)]
        _RANGE[sfz] = (min(lo) if lo else 0, max(hi) if hi else 127)
    return _RANGE[sfz]


def fold(p, sfz):
    lo, hi = sfz_range(sfz)
    while p < lo: p += 12
    while p > hi: p -= 12
    return p


def stages(score):
    n = int(score.get("verses", 1))
    st = {"intro": "intro", "amen": "full"}
    for i in range(1, n + 1):
        if i == n: st[f"v{i}"] = "full"
        elif i == 1: st[f"v{i}"] = "soft" if n >= 3 else "mid"
        elif i == n - 1: st[f"v{i}"] = "build"
        else: st[f"v{i}"] = "mid"
    return st


STAGE_VEL = {"soft": 0.60, "intro": 0.68, "mid": 0.70, "build": 0.78, "full": 0.92}
#   이름, sfz, 성부, 옮김, 쓰는 단계, 세기 배율, 소리 크기, 좌우
LAYERS = [
    ("violin1", "ViolinEnsSusVib.sfz", "S", 0, "soft intro mid build full", 1.00, 1.00, -0.40),
    ("violin1_8va", "ViolinEnsSusVib.sfz", "S", 12, "intro mid build full", 0.82, 0.70, -0.30),
    ("violin2", "ViolinEnsSusVib.sfz", "A", 12, "intro mid build full", 0.85, 0.55, -0.20),
    ("violin2_lo", "ViolinEnsSusVib.sfz", "A", 0, "soft intro mid build full", 0.90, 0.70, -0.15),
    ("viola", "ViolaEnsSusVib.sfz", "T", 0, "soft intro mid build full", 0.90, 0.80, 0.15),
    ("viola_mel", "ViolaEnsSusVib.sfz", "S", -12, "intro mid build full", 0.80, 0.45, 0.05),
    ("cello", "CelloEnsSusVib.sfz", "B", 0, "soft intro mid build full", 0.95, 0.65, 0.35),
    ("cello_t", "CelloEnsSusVib.sfz", "T", 0, "build full", 0.80, 0.30, 0.30),
    ("bass", "ContrabassSusVB.sfz", "B", -12, "soft intro mid build full", 0.90, 0.55, 0.45),
    ("horn_a", "FHornSus.sfz", "A", 0, "intro mid build full", 0.80, 0.45, 0.20),
    ("horn_t", "FHornSus.sfz", "T", 0, "intro mid build full", 0.80, 0.40, 0.30),
    ("clarinet", "ClarinetSus.sfz", "A", 0, "mid build", 0.75, 0.35, -0.05),
    ("flute", "FluteSusVib.sfz", "S", 12, "intro mid build full", 0.78, 0.45, -0.25),
    ("oboe", "OboeSusVib.sfz", "S", 0, "mid build", 0.72, 0.35, -0.10),
    ("trumpet", "TrumpetSus.sfz", "S", 0, "full", 0.80, 0.50, 0.05),
    ("trombone", "TromboneSus.sfz", "T", 0, "full", 0.80, 0.40, 0.25),
    ("tuba", "TubaSus.sfz", "B", -12, "full", 0.85, 0.35, 0.40),
    ("organ_q", "OrganQuiet.sfz", "SAT", 0, "soft intro mid build", 0.70, 0.30, 0.0),
    ("organ_l", "OrganLoud.sfz", "SAT", 0, "full", 0.75, 0.30, 0.0),
    ("pedal", "OrganLoudPedal.sfz", "B", -12, "soft intro mid build full", 0.85, 0.55, 0.0),
]


def orch_parts(score, notes, ranges, tm, bpb):
    """[(이름, sfz, 사건들, 소리 크기, 좌우)]  사건 = (초, on/off, 음, 세기)"""
    rnd = _rnd.Random(score.get("no", 0))
    stg = stages(score)
    pick = float(score.get("pickup", 0) or 0)
    final_end = max(s + d for _, s, d, _, _ in notes)
    parts = []
    for name, sfz, voices, shift, use, vmul, gain, pan in LAYERS:
        if not os.path.exists(os.path.join(VS, sfz)):
            continue
        evs = []
        for sec, s, d, v, p in notes:
            st = stg.get(sec, "mid")
            if v not in voices or st not in use.split():
                continue
            q = fold(p + shift, sfz)
            t0, t1 = tm(s), tm(s + d)
            if abs(s + d - final_end) < 1e-6:
                t1 = t0 + (t1 - t0) * 1.8                     # 마지막 음은 길게
            start = ranges[sec][0] + (pick if sec.startswith("v") else 0)
            bar_pos = int(((s - start) // bpb) % 4) if s >= start else 0
            swell = (0.94, 1.0, 1.07, 0.98)[bar_pos]         # 네 마디 안에서 부풀었다 가라앉기
            vel = 127 * STAGE_VEL[st] * vmul * swell * (1.04 if v == "S" else 0.95) + rnd.uniform(-4, 4)
            jit = rnd.uniform(-0.012, 0.012)
            evs.append((max(0.0, t0 + jit), "on", q, int(max(18, min(127, vel)))))
            evs.append((t1 + 0.10, "off", q, 0))             # 다음 음과 겹쳐 끊김 없이(레가토)
        if evs:
            parts.append((name, sfz, evs, gain, pan))
    # 팀파니: 큰 단계(전주·마지막 절·아멘)의 네 마디마다 첫 박(그때의 베이스 음), 쌓는 절 끝에는 굴림
    timp, roll = [], []
    bass_at = {}
    for sec, s, d, v, p in notes:
        if v == "B":
            bass_at[(sec, round(s, 3))] = p
    for sec, (a, b) in ranges.items():
        st = stg.get(sec)
        if st in ("full", "intro"):
            k = a + (pick if sec.startswith("v") else 0)
            while k < b - 0.5:
                p = bass_at.get((sec, round(k, 3)))
                if p is not None:
                    q = fold(p, "Timpani.sfz")
                    timp += [(tm(k), "on", q, 105 if st == "full" else 85), (tm(k) + 2.0, "off", q, 0)]
                k += 4 * bpb
        if st == "build":
            roll += [(tm(b - bpb), "on", 43, 70), (tm(b) + 0.3, "off", 43, 0)]
    if timp: parts.append(("timpani", "Timpani.sfz", timp, 0.55, 0.0))
    if roll: parts.append(("timp_roll", "TimpaniRolls.sfz", roll, 0.45, 0.0))
    return parts


def wav_at(path, gain=1.0):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2) * gain


def add_at(mix, a, t):
    i = max(0, int(t * SR))
    if t < 0:
        a = a[int(-t * SR):]
    n = max(len(mix), i + len(a))
    if len(mix) < n: mix = np.pad(mix, ((0, n - len(mix)), (0, 0)))
    mix[i:i + len(a)] += a
    return mix


def orch_fx(mix, score, ranges, tm, bpb):
    """심벌·큰북: 큰 절로 들어갈 때 심벌이 부풀어 오르고, 큰 절 첫 박에 심벌과 큰북."""
    stg = stages(score)
    perc = os.path.join(VS, "VSCO 1 Percussion", "varMetal", "Cymbals")
    roll = os.path.join(perc, "susp", "susp_hit_softmall_roll2_cresc.wav")
    crash = os.path.join(perc, "clash", "crash_hit_ff_loose.wav")
    bd = os.path.join(VS, "Percussion", "BDrumNewhit_v6_rr1_Sum.wav")
    pick = float(score.get("pickup", 0) or 0)
    for sec, (a, b) in ranges.items():
        if stg.get(sec) != "full" or sec == "amen":
            continue
        t = tm(a + pick)
        if os.path.exists(roll):          # 마지막 절로 이끄는 부드러운 심벌 굴림만(갑작스러운 심벌 치기·큰북은 뺐다 — 2026-11-13)
            r = wav_at(roll, 0.16); mix = add_at(mix, r, t - len(r) / SR)
    if "amen" in ranges and os.path.exists(crash):              # 마지막 화음
        mix = add_at(mix, wav_at(crash, 0.25), tm(ranges["amen"][1] - 3))
    return mix


# ───────────────────────── 3. MIDI 쓰기 (박자 120 고정, 시간은 초로 넣는다)

def vlq(n):
    b = [n & 0x7F]
    while n > 0x7F:
        n >>= 7
        b.append((n & 0x7F) | 0x80)
    return bytes(reversed(b))


def write_midi(path, evs):
    """evs: [(초, 'on'|'off', note, vel)]"""
    tpq = 960                      # 120bpm → 1초 = 1920틱
    evs = sorted(evs, key=lambda e: (e[0], 0 if e[1] == "off" else 1))
    trk, last = bytearray(), 0
    trk += b"\x00\xFF\x51\x03" + (500000).to_bytes(3, "big")
    for s, kind, n, v in evs:
        tick = int(round(s * 1920))
        trk += vlq(max(0, tick - last)); last = tick
        trk += bytes([0x90 if kind == "on" else 0x80, n, v if kind == "on" else 0])
    trk += vlq(1920 * 6) + b"\xFF\x2F\x00"            # 끝난 뒤 6초 울림
    with open(path, "wb") as f:
        f.write(b"MThd" + (6).to_bytes(4, "big") + (0).to_bytes(2, "big") + (1).to_bytes(2, "big") + tpq.to_bytes(2, "big"))
        f.write(b"MTrk" + len(trk).to_bytes(4, "big") + trk)


def render(sfz, mid, wav):
    subprocess.run([SFIZZ, "--sfz", os.path.join(VS, sfz), "--midi", mid, "--wav", wav, "-s", str(SR), "-q", "3", "-p", "128"],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", wav, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


# ───────────────────────── 4. 울림(홀) — 만든 잔향으로 곱하기

def hall_ir(seconds=2.6, seed=7):
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    env = np.exp(-6.9 * t / seconds)                  # -60dB 까지
    ir = rng.standard_normal((n, 2)) * env[:, None]
    # 높은 소리가 먼저 사라지게: 시간에 따라 점점 어두워지는 간단한 거르기
    for c in range(2):
        y = np.empty(n); acc = 0.0
        x = ir[:, c]
        for i0 in range(0, n, 4800):
            a = 0.25 + 0.7 * min(1.0, i0 / n * 2.5)
            seg = x[i0:i0 + 4800]
            out = np.empty_like(seg)
            for i, v in enumerate(seg):
                acc = acc * a + v * (1 - a); out[i] = acc
            y[i0:i0 + 4800] = out
        ir[:, c] = y
    ir[: int(SR * 0.02)] = 0                          # 첫 반사 전 틈
    return ir / np.sqrt((ir ** 2).sum(axis=0, keepdims=True))


_IRC = {}


def real_ir(kind):
    """OpenAIR 실제 성당 울림(University of York). 오케스트라=York Minster, 피아노=St Andrew's. 없으면 None."""
    path = os.environ.get("HYMN_IR" if kind == "orch" else "HYMN_IR_PIANO",
                          r"C:\hymn-mr\ir\york_minster_ortf.wav" if kind == "orch" else r"C:\hymn-mr\ir\st_andrews_ortf.wav")
    if not os.path.exists(path):
        return None
    if path not in _IRC:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], check=True, capture_output=True).stdout
        a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
        k = int(np.argmax(np.abs(a).max(axis=1)))
        a = a[max(0, k - 48):]                            # 직접음 앞의 빈 곳을 잘라 소리가 늦지 않게
        a[: int(0.012 * SR)] = 0                          # 직접음은 원래 소리가 맡는다 — 울림만
        a /= np.sqrt((a ** 2).sum(axis=0, keepdims=True)) + 1e-12
        _IRC[path] = a
    return _IRC[path]


def convolve(x, ir):
    n = len(x) + len(ir)
    nf = 1 << (n - 1).bit_length()
    out = np.zeros((n, 2), dtype=np.float32)
    for c in range(2):
        X = np.fft.rfft(x[:, c].astype(np.float64), nf)
        H = np.fft.rfft(ir[:, c], nf)
        out[:, c] = np.fft.irfft(X * H, nf)[:n]
    return out


# ───────────────────────── 5. 만들기

def make(score, kind, work, out):
    notes, ranges, bpb = build(score)
    tm = time_map(score, ranges, bpb)
    plan, lv = (ORCH, LV) if kind == "orch" else (PIANO, PIANO_LV)
    final_end = max(s + d for _, s, d, _, _ in notes)
    mix = None
    if kind == "orch":                 # 새 편곡(참고 음원 분석) — 옛 ORCH 목록은 쓰지 않는다
        plan = []
        import arrange                    # 2026-11-13 오르간이 이끄는 편곡(실제 파이프오르간·VPO·성당 울림)
        for name, sfz, evs, gain, pan in arrange.build_parts(score, notes, ranges, tm, bpb):
            mid = os.path.join(work, f"orch_{name}.mid"); wav = os.path.join(work, f"orch_{name}.wav")
            write_midi(mid, evs)
            a = render(sfz, mid, wav)
            pan *= 0.8
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            a = a * gain; a[:, 0] *= l * 1.414; a[:, 1] *= r * 1.414
            mix = a if mix is None else add_at(mix, a, 0)
            print(f"  {name}: {len(a) / SR:.1f}초")
        mix = orch_fx(mix, score, ranges, tm, bpb)
    for name, sfz, voices, shift, spec, vmul, gain, pan in plan:
        evs = []
        for sec, s, d, v, p in notes:
            if v not in voices or not in_sec(spec, sec):
                continue
            t0, t1 = tm(s), tm(s + d)
            if abs(s + d - final_end) < 1e-6:
                t1 = t0 + (t1 - t0) * 1.6                   # 마지막 음은 길게
            legato = 0.03 if kind == "orch" else 0.08
            vel = int(max(20, min(127, 127 * lv[sec] * vmul * (1.04 if v == "S" else 0.94))))
            if kind == "piano" and v in "AT":
                vel = int(vel * 0.88)
            evs.append((t0, "on", p + shift, vel))
            evs.append((max(t0 + 0.05, t1 - legato), "off", p + shift, 0))
        if name == "organ_l":       # 오르간 페달: 마지막 절과 아멘에서 베이스 한 옥타브 아래
            for sec, s, d, v, p in notes:
                if v == "B" and in_sec(spec, sec):
                    evs.append((tm(s), "on", p - 12, 90)); evs.append((tm(s + d) - 0.03, "off", p - 12, 0))
        if not evs:
            continue
        mid = os.path.join(work, f"{kind}_{name}.mid"); wav = os.path.join(work, f"{kind}_{name}.wav")
        write_midi(mid, evs)
        a = render(sfz, mid, wav)
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        a = a * gain
        a[:, 0] *= l * 1.414; a[:, 1] *= r * 1.414
        if mix is None:
            mix = a
        else:
            n = max(len(mix), len(a))
            mix = np.pad(mix, ((0, n - len(mix)), (0, 0))) + np.pad(a, ((0, n - len(a)), (0, 0)))
        print(f"  {name}: {len(a) / SR:.1f}초")
    if False:                           # (옛 팀파니 — 새 편곡 orch_parts 가 맡는다)
        tev = []
        v4 = ranges[f"v{score['verses']}"]
        for b, n_, vel in [(v4[0] + score["pickup"], 43, 100), (v4[1] - 4 * bpb + score["pickup"], 43, 95)]:
            tev += [(tm(b), "on", n_, vel), (tm(b) + 1.5, "off", n_, 0)]
        if mix is not None and tev:
            write_midi(os.path.join(work, "timp.mid"), tev)
            a = render("Timpani.sfz", os.path.join(work, "timp.mid"), os.path.join(work, "timp.wav")) * 0.55
            n = max(len(mix), len(a)); mix = np.pad(mix, ((0, n - len(mix)), (0, 0))) + np.pad(a, ((0, n - len(a)), (0, 0)))
        if "amen" in ranges:
            a0, a1 = ranges["amen"]
            write_midi(os.path.join(work, "roll.mid"), [(tm(a1 - 3), "on", 43, 70), (tm(a1) + 2.5, "off", 43, 0)])
            a = render("TimpaniRolls.sfz", os.path.join(work, "roll.mid"), os.path.join(work, "roll.wav")) * 0.45
            n = max(len(mix), len(a)); mix = np.pad(mix, ((0, n - len(mix)), (0, 0))) + np.pad(a, ((0, n - len(a)), (0, 0)))
    wet = 0.30 if kind == "orch" else 0.20
    print("  울림 입히는 중")
    ir = real_ir(kind) if real_ir(kind) is not None else hall_ir(3.3 if kind == "orch" else 1.8)
    import scipy.signal as _sg            # 울림에는 낮은 소리를 덜 보낸다(큰 성당의 웅웅거림을 막는다)
    send = _sg.sosfilt(_sg.butter(2, 220 if kind == "orch" else 120, "highpass", fs=SR, output="sos"), mix, axis=0)
    rev = convolve(send, ir)
    dry = np.pad(mix, ((0, len(rev) - len(mix)), (0, 0)))
    y = dry * (1 - wet) + rev * wet * 0.9
    # 끝 소리가 사라질 때까지 자르고, 처음의 빈 곳은 0.3초만 남긴다
    amp = np.abs(y).max(axis=1)
    nz = np.nonzero(amp > amp.max() * 0.001)[0]
    cut = max(0, nz[0] - int(0.3 * SR))
    y = y[cut: nz[-1] + int(0.2 * SR)]
    y = y / (np.abs(y).max() + 1e-9) * 0.9
    raw = os.path.join(work, f"{kind}_mix.f32")
    y.astype(np.float32).tofile(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw,
                    "-af", ("highpass=f=20,equalizer=f=140:t=q:w=1:g=-4,equalizer=f=2100:t=q:w=1.2:g=5,equalizer=f=4500:t=q:w=1:g=2," if kind == "orch" else "") +   # 참고 음원처럼 바닥은 두껍게, 위는 부드럽게
                    "loudnorm=I=-16:TP=-1.5:LRA=14,afade=t=in:d=0.01,areverse,afade=t=in:d=1.5,areverse",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", out], check=True)
    secs = {k: (round(tm(v[0]), 2), round(tm(v[1]), 2)) for k, v in ranges.items()}
    secs["_trim"] = round(cut / SR, 3)          # 파일 앞에서 잘라 낸 빈 시간 — 가사 시간에서 뺀다
    return secs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("no", type=int)
    ap.add_argument("--only", choices=["orch", "piano"])
    o = ap.parse_args()
    score = json.load(open(os.path.join(HOME, "scores", f"{o.no:03d}.json"), encoding="utf-8"))
    work = os.path.join(HOME, "work", f"{o.no:03d}"); os.makedirs(work, exist_ok=True)
    os.makedirs(os.path.join(HOME, "out"), exist_ok=True)
    for kind in (["orch", "piano"] if not o.only else [o.only]):
        out = os.path.join(HOME, "out", f"{o.no:03d}_{kind}.m4a")
        print(f"{o.no}장 {score['title']} — {'오케스트라' if kind == 'orch' else '피아노'}")
        secs = make(score, kind, work, out)
        json.dump(secs, open(os.path.join(work, f"{kind}_sections.json"), "w"), ensure_ascii=False)
        print("  구역(초):", secs)
        print("  →", out)


if __name__ == "__main__":
    main()


# ───────────────────────── 6. 노래방 가사 — 반주와 같은 시간표로

def melody_onsets(score):
    """구역별 소프라노 음(붙임줄로 이어진 음은 하나) [(구역, 시작박, 길이박)]"""
    notes, ranges, bpb = build(score)
    out = {}
    for sec, s, d, v, p in notes:
        if v == "S":
            out.setdefault(sec, []).append((s, d))
    for k in out:
        out[k].sort()
    return out, ranges, bpb


def split_lyrics(txt):
    """"나 같-은-_ 죄-인 / 살-리-신" → 줄 목록, 각 줄은 [(음절, 뒤에 띄어쓰기?)].
    띄어쓰기 = 낱말 사이, "-" = 한 낱말 안의 음절 사이, "_" = 앞 음절을 끄는 음."""
    lines = []
    for ln in str(txt or "").split("/"):
        row = []
        for w in ln.split():
            parts = [p for p in w.split("-") if p]
            for i, p in enumerate(parts):
                row.append((p, i == len(parts) - 1))
        if row:
            lines.append(row)
    return lines


def check_lyrics(score):
    """절마다 음절 수(+ '_')가 멜로디 음 수와 같은지. 문제 목록을 돌려준다."""
    ly = score.get("lyrics") or {}
    if not ly:
        return ["가사가 없습니다"]
    on, _, _ = melody_onsets(score)
    need = len(on.get("v1", []))
    probs = []
    for i in range(1, int(score.get("verses", 1)) + 1):
        n = sum(len(l) for l in split_lyrics(ly.get(str(i))))
        if n != need:
            probs.append(f"{i}절 가사 음절 {n}개 ≠ 멜로디 음 {need}개")
    return probs


def lyrics_timing(score):
    """화면용 시간표: {"intro":[0,끝], "verses":[{"n":1,"lines":[[[시작초,끝초,"나"],…],…]}], "amen":[…] }"""
    on, ranges, bpb = melody_onsets(score)
    tm = time_map(score, ranges, bpb)
    ly = score.get("lyrics") or {}
    out = {"intro": [0.0, round(tm(ranges["intro"][1]), 2)], "verses": []}
    for i in range(1, int(score.get("verses", 1)) + 1):
        notes = on.get(f"v{i}", [])
        lines, k = [], 0
        for ln in split_lyrics(ly.get(str(i))):
            row = []
            for syl, sp in ln:
                if k >= len(notes):
                    break
                s, d = notes[k]; k += 1
                t0, t1 = round(tm(s), 2), round(tm(s + d), 2)
                if syl == "_" and row:
                    row[-1][1] = t1                      # 앞 음절을 길게
                    if sp: row[-1][3] = 1
                elif syl != "_":
                    row.append([t0, t1, syl, 1 if sp else 0])   # [시작초, 끝초, 음절, 뒤에 띄어쓰기]
            if row:
                lines.append(row)
        out["verses"].append({"n": i, "lines": lines})
    if "amen" in ranges:
        a = on.get("amen", [])
        if len(a) >= 2:
            out["amen"] = [[round(tm(a[0][0]), 2), round(tm(a[0][0] + a[0][1]), 2), "아", 0],
                           [round(tm(a[1][0]), 2), round(tm(a[-1][0] + a[-1][1]), 2), "멘", 0]]
    return out
