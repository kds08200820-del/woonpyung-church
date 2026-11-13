# -*- coding: utf-8 -*-
"""오르간이 이끄는 찬송 반주 편곡 (2026-11-13 담임목사: "인위적이다 — 악기마다 제 소리, 오르간이 이끌고, 꾸밈음도")

참고: 목사님이 주신 「Beneath The Vaulted Nave」 분석 — 떨림 없는 곧은 오르간 소리가 중심, 페달 저음, 조용한 절(어두움)과
큰 절(밝음·팀파니·심벌)이 번갈아, 72 BPM, 큰 성당 울림, 목소리 없음. 찬송 반주 관례(Virgil Fox 의 절마다 스톱 바꾸기,
절마다 악기 바꾸기, 마지막 절 트럼펫 데스캔트)를 따른다.

음원
  오르간  : Lars Palo · Piteå MHS (CC BY-SA 2.5) → organ2sfz.py 로 만든 C:\\hymn-mr\\organ\\sfz\\StopNNN_*.sfz
  오케스트라: Virtual Playing Orchestra 3 (Paul Battersby, 제한 없음) C:\\hymn-mr\\vpo\\Virtual-Playing-Orchestra3
  울림    : OpenAIR York Minster (University of York, Audiolab · Damian T. Murphy)

꾸밈음(회중의 선율은 건드리지 않는다 — 소프라노는 악보 그대로, 전주만 예외)
  · 지나가는 음: 알토·테너가 3도로 뛸 때 사이 음을 지나간다(2절부터)
  · 걸림음(4-3): 절 끝 으뜸화음에서 알토가 한 음 위에서 붙잡았다가 내려온다
  · 메움: 선율이 줄 끝에서 길게 머물 때 플루트(가운데 절)가 짧게 이어 준다
  · 데스캔트: 마지막 절 트럼펫이 선율 위 화음음으로 노래하고, 줄 첫 음에 앞꾸밈음
  · 전주: 오르간 소프라노 마지막 앞 음에 잔꾸밈(모르덴트)
오르가니스트처럼: 같은 음이 되풀이되면 살짝 떼고, 줄이 끝나면 한숨 쉴 만큼 손을 뗀다(회중이 숨 쉬는 자리).
"""
import os, random

ORG = os.environ.get("HYMN_ORGAN", r"C:\hymn-mr\organ\sfz")
VPO = os.environ.get("HYMN_VPO", r"C:\hymn-mr\vpo\Virtual-Playing-Orchestra3")
IR = os.environ.get("HYMN_IR", r"C:\hymn-mr\ir\york_minster_ortf.wav")

O = lambda n: os.path.join(ORG, n)
V = lambda n: os.path.join(VPO, n)

# 오르간 스톱(손건반은 S·A·T, 페달은 B)
REG = {
    "intro": (["Stop009_PRINCIPAL_8.sfz", "Stop011_OKTAVA_4.sfz", "Stop012_OKTAVA_2.sfz"], ["Stop001_SUBBAS_16.sfz", "Stop002_OKTAVA_8.sfz"]),
    "soft": (["Stop027_FL_HARM_8.sfz", "Stop028_GAMBA_8.sfz", "Stop029_V_CELESTE_8.sfz", "Stop030_FL_OCT_4.sfz"], ["Stop001_SUBBAS_16.sfz", "Stop003_GEDAKT_8.sfz"]),
    "mid": (["Stop009_PRINCIPAL_8.sfz", "Stop011_OKTAVA_4.sfz", "Stop019_PRINCIPAL_4.sfz", "Stop021_WALDFLJT_2.sfz"], ["Stop001_SUBBAS_16.sfz", "Stop002_OKTAVA_8.sfz"]),
    "build": (["Stop009_PRINCIPAL_8.sfz", "Stop011_OKTAVA_4.sfz", "Stop012_OKTAVA_2.sfz", "Stop013_MIXTUR_IV.sfz", "Stop033_OBOE_8.sfz"],
              ["Stop001_SUBBAS_16.sfz", "Stop002_OKTAVA_8.sfz", "Stop004_OKTAVA_4.sfz"]),
    "full": (["Stop009_PRINCIPAL_8.sfz", "Stop011_OKTAVA_4.sfz", "Stop012_OKTAVA_2.sfz", "Stop013_MIXTUR_IV.sfz", "Stop015_TRUMPET_8.sfz",
              "Stop034_TR_HARM_8.sfz", "Stop035_CLAIRON_4.sfz"], ["Stop001_SUBBAS_16.sfz", "Stop002_OKTAVA_8.sfz", "Stop004_OKTAVA_4.sfz", "Stop005_BASUN_16.sfz"]),
}
# 스톱마다 소리 크기(실제 오르간처럼 혀관·혼합관은 크고, 플루트·현 스톱은 작다)
STOP_GAIN = {"Stop001_SUBBAS_16.sfz": 0.40, "Stop002_OKTAVA_8.sfz": 0.75, "Stop009_PRINCIPAL_8.sfz": 0.85, "Stop019_PRINCIPAL_4.sfz": 0.6,
             "Stop021_WALDFLJT_2.sfz": 0.45, "Stop030_FL_OCT_4.sfz": 0.6, "Stop027_FL_HARM_8.sfz": 0.75, "Stop028_GAMBA_8.sfz": 0.85,
             "Stop013_MIXTUR_IV.sfz": 0.55, "Stop015_TRUMPET_8.sfz": 0.55, "Stop034_TR_HARM_8.sfz": 0.45, "Stop035_CLAIRON_4.sfz": 0.35,
             "Stop012_OKTAVA_2.sfz": 0.55, "Stop011_OKTAVA_4.sfz": 0.8, "Stop033_OBOE_8.sfz": 0.55, "Stop005_BASUN_16.sfz": 0.35,
             "Stop029_V_CELESTE_8.sfz": 0.7, "Stop004_OKTAVA_4.sfz": 0.5, "Stop003_GEDAKT_8.sfz": 0.8}

# 오케스트라 — 절마다 맡는 악기를 바꾼다(찬송 반주 관례). (이름, sfz, 성부, 옮김, 단계, 세기, 크기, 좌우)
ORCH = [
    ("violins", "Strings/1st-violin-SEC-sustain.sfz", "S", 0, "soft build full", 0.62, 0.55, -0.35),
    ("violins_hi", "Strings/1st-violin-SEC-sustain.sfz", "S", 12, "full", 0.66, 0.40, -0.30),
    ("violins2", "Strings/2nd-violin-SEC-sustain.sfz", "A", 0, "soft build full", 0.58, 0.45, -0.15),
    ("violas", "Strings/viola-SEC-sustain.sfz", "T", 0, "soft build full", 0.58, 0.45, 0.15),
    ("celli", "Strings/cello-SEC-sustain.sfz", "B", 0, "soft mid build full", 0.60, 0.50, 0.30),
    ("basses", "Strings/bass-SEC-sustain.sfz", "B", -12, "build full", 0.60, 0.40, 0.40),
    ("oboe", "Woodwinds/oboe-SOLO-sustain.sfz", "S", 0, "mid", 0.62, 0.45, -0.10),
    ("clarinet", "Woodwinds/clarinet-SOLO-sustain.sfz", "A", 0, "mid", 0.58, 0.40, 0.05),
    ("bassoon", "Woodwinds/bassoon-SOLO-sustain.sfz", "T", 0, "mid", 0.58, 0.40, 0.20),
    ("horns", "Brass/french-horn-SEC-sustain.sfz", "T", 0, "build full", 0.62, 0.45, 0.25),
    ("horns_a", "Brass/french-horn-SEC-sustain.sfz", "A", -12, "full", 0.60, 0.35, 0.20),
    ("trombones", "Brass/trombone-SEC-sustain.sfz", "B", 12, "full", 0.62, 0.35, 0.30),
]
STAGE_VEL = {"intro": 0.72, "soft": 0.55, "mid": 0.66, "build": 0.78, "full": 0.92}
ORGAN_GAIN = {"intro": 0.95, "soft": 0.85, "mid": 1.0, "build": 1.05, "full": 1.1}


def stages(score):
    n = int(score.get("verses", 1))
    st = {"intro": "intro", "amen": "full"}
    for i in range(1, n + 1):
        if i == n: st[f"v{i}"] = "full"
        elif i == 1: st[f"v{i}"] = "soft" if n >= 3 else "mid"
        elif i == n - 1 and n >= 3: st[f"v{i}"] = "build"
        else: st[f"v{i}"] = "mid"
    return st


KEYS = {"C": 0, "G": 7, "D": 2, "A": 9, "E": 4, "B": 11, "F#": 6, "F": 5, "Bb": 10, "Eb": 3, "Ab": 8, "Db": 1, "Gb": 6, "Cb": 11, "C#": 1}


def scale_of(score):
    k = str(score.get("key", "C")).strip()
    minor = k.endswith("m") and not k.endswith("Ebm") or k.lower().endswith("minor")
    root = KEYS.get(k.rstrip("m").replace("minor", "").strip(), 0)
    steps = (0, 2, 3, 5, 7, 8, 10) if minor else (0, 2, 4, 5, 7, 9, 11)
    return root, {(root + s) % 12 for s in steps}, minor


def voice_seq(notes, sec, v):
    return sorted([(s, d, p) for se, s, d, vv, p in notes if se == sec and vv == v])


def ornament(score, notes, ranges, bpb, lines):
    """꾸밈음을 넣은 성부별 음 목록과, 메움(플루트)·데스캔트(트럼펫) 음을 돌려준다."""
    root, scale, minor = scale_of(score)
    stg = stages(score)
    rnd = random.Random(score.get("no", 0) + 7)
    out, fills, desc = [], [], []
    by_sec = {}
    for n in notes:
        by_sec.setdefault(n[0], []).append(n)
    for sec, ns in by_sec.items():
        st = stg.get(sec, "mid")
        for v in "SATB":
            seq = voice_seq(ns, sec, v)
            for i, (s, d, p) in enumerate(seq):
                nxt = seq[i + 1] if i + 1 < len(seq) else None
                # 지나가는 음: 알토·테너, 2절부터, 3도 뛰기, 1박 이상
                if v in "AT" and st in ("mid", "build", "full") and nxt and d >= 1 and abs(nxt[2] - p) in (3, 4) and abs(nxt[0] - (s + d)) < 1e-6:
                    step = 1 if nxt[2] > p else -1
                    mid = next((q for q in range(p + step, nxt[2], step) if q % 12 in scale), None)
                    if mid is not None and rnd.random() < 0.7:
                        out += [(sec, s, d / 2, v, p), (sec, s + d / 2, d / 2, v, mid)]
                        continue
                out.append((sec, s, d, v, p))
        # 걸림음 4-3: 절 끝 으뜸화음(알토가 으뜸화음 3음)에서
        if sec.startswith("v") and st in ("mid", "build", "full"):
            a = voice_seq(ns, sec, "A")
            if a:
                s, d, p = a[-1]
                if (p - root) % 12 == (3 if minor else 4) and d >= 1.5:
                    up = p + (2 if minor else 1)
                    out = [x for x in out if not (x[0] == sec and x[3] == "A" and abs(x[1] - s) < 1e-6)]
                    out += [(sec, s, d * 0.45, "A", up), (sec, s + d * 0.45, d * 0.55, "A", p)]
        # 메움: 가운데 절, 줄 끝 긴 선율음 뒤 절반에 플루트가 화음음으로 짧게(내려오며)
        S = voice_seq(ns, sec, "S")
        if st in ("mid", "build"):
            for s, d, p in S:
                if d >= 2 and any(abs((s + d) - e) < 0.6 for e in lines.get(sec, [])):
                    chord = sorted({x[4] % 12 for x in ns if x[1] <= s + 1e-6 < x[1] + x[2]})
                    tones = [q for q in range(p + 3, p + 15) if q % 12 in chord][:3][::-1]
                    t, dd = s + d / 2, (d / 2) / max(1, len(tones) + 1)
                    for q in tones:
                        fills.append((sec, t, dd * 1.1, q)); t += dd
        # 데스캔트: 마지막 절·아멘 — 선율 위 화음음(3도·6도), 줄 첫 음에 앞꾸밈음
        if st == "full":
            starts = {round(e, 2) for e in lines.get(sec + "_start", [])}
            for s, d, p in S:
                chord = {x[4] % 12 for x in ns if x[1] <= s + 1e-6 < x[1] + x[2]}
                q = next((c for c in range(p + 3, p + 10) if c % 12 in chord), p + 12)
                if round(s, 2) in starts and d >= 1:
                    g = q + (2 if (q + 2) % 12 in scale else 1)
                    desc.append((sec, s, 0.18, g, True))
                    desc.append((sec, s + 0.18, d - 0.18, q, False))
                else:
                    desc.append((sec, s, d, q, False))
    return out, fills, desc


def phrase_marks(score, notes, ranges, bpb):
    """줄 끝(숨 쉬는 곳)과 줄 첫 박. 노래방 가사의 줄 나눔이 있으면 그것을, 없으면 네 마디마다."""
    import hymn_mr
    lines = {}
    on, _, _ = hymn_mr.melody_onsets(score)
    ly = score.get("lyrics") or {}
    for sec, (a, b) in ranges.items():
        ends, starts = [], []
        if sec.startswith("v") and ly.get(sec[1:]):
            k = 0; ons = on.get(sec, [])
            for ln in hymn_mr.split_lyrics(ly[sec[1:]]):
                if k >= len(ons): break
                starts.append(ons[k][0]); k += len(ln)
                last = ons[min(k, len(ons)) - 1]; ends.append(last[0] + last[1])
        else:
            pick = float(score.get("pickup", 0) or 0) if sec.startswith("v") else 0
            t = a + pick
            while t < b - 0.01:
                starts.append(t); t += 4 * bpb; ends.append(min(t, b))
        lines[sec] = ends; lines[sec + "_start"] = starts
    return lines


def build_parts(score, notes, ranges, tm, bpb):
    """[(이름, sfz절대경로, 사건, 크기, 좌우)]"""
    rnd = random.Random(score.get("no", 0))
    stg = stages(score)
    lines = phrase_marks(score, notes, ranges, bpb)
    orn, fills, desc = ornament(score, notes, ranges, bpb, lines)
    final_end = max(s + d for _, s, d, _, _ in notes)
    breath_at = {(sec, round(e, 3)) for sec in ranges for e in lines.get(sec, [])}

    def timing(sec, s, d, kind):
        t0, t1 = tm(s), tm(s + d)
        if abs(s + d - final_end) < 1e-6:
            t1 = t0 + (t1 - t0) * 2.0                     # 마지막 화음은 길게
        elif (sec, round(s + d, 3)) in breath_at:
            t1 -= 0.16 if kind == "organ" else 0.10        # 줄 끝: 숨 쉬는 자리
        return t0, t1

    parts = []
    # 1) 오르간 — 단계마다 스톱을 바꾼다
    organ = {}
    for sec, s, d, v, p in orn:
        st = stg.get(sec, "mid")
        man, ped = REG[st]
        stops = ped if v == "B" else man
        t0, t1 = timing(sec, s, d, "organ")
        for stop in stops:
            organ.setdefault(stop, []).append((t0, t1, p, st))
    # 전주 잔꾸밈(모르덴트): 전주 소프라노 마지막 앞 음
    intro_s = sorted([(s, d, p) for sec, s, d, v, p in orn if sec == "intro" and v == "S"])
    if len(intro_s) >= 2:
        s, d, p = intro_s[-2]
        if d >= 1:
            t0, t1 = tm(s), tm(s + d)
            for stop in REG["intro"][0][:1]:
                ev = organ[stop]
                organ[stop] = [e for e in ev if not (abs(e[0] - t0) < 1e-3 and e[2] == p)]
                organ[stop] += [(t0, t0 + 0.09, p, "intro"), (t0 + 0.09, t0 + 0.18, p + 2, "intro"), (t0 + 0.18, t1, p, "intro")]
    for stop, evs in organ.items():
        lst = []
        evs.sort()
        last_end = {}
        for t0, t1, p, st in evs:
            # 같은 음이 바로 되풀이되면 앞 음을 조금 일찍 떼어 다시 친다(오르가니스트의 되풀이 떼기)
            if p in last_end and abs(last_end[p][0] - t0) < 0.02:
                idx = last_end[p][1]
                lst[idx] = (max(lst[idx][0], t0 - 0.07), "off", p, 0)
            lst.append((t0, "on", p, 100))
            lst.append((t1, "off", p, 0)); last_end[p] = (t1, len(lst) - 1)
        g = STOP_GAIN.get(stop, 1.0) * 0.55
        parts.append(("org_" + stop.split("_")[0], O(stop), lst, g, 0.0))
    # 2) 오케스트라
    for name, sfz, voices, shift, use, vmul, gain, pan in ORCH:
        lst = []
        for sec, s, d, v, p in notes:                          # 오케스트라는 악보 그대로(꾸밈은 오르간·목관이)
            st = stg.get(sec, "mid")
            if v not in voices or st not in use.split():
                continue
            t0, t1 = timing(sec, s, d, "orch")
            vel = 127 * STAGE_VEL[st] * vmul * (1.0 if v == "S" else 0.92) + rnd.uniform(-5, 5)
            j = rnd.uniform(-0.015, 0.015)
            lst += [(max(0, t0 + j), "on", p + shift, int(max(20, min(120, vel)))), (t1 + 0.06, "off", p + shift, 0)]
        if lst:
            parts.append((name, V(sfz), lst, gain, pan))
    # 3) 메움 — 플루트
    lst = []
    for sec, s, d, p in fills:
        t0 = tm(s); lst += [(t0, "on", p, 70), (tm(s + d), "off", p, 0)]
    if lst:
        parts.append(("flute_fill", V("Woodwinds/flute-SOLO-sustain.sfz"), lst, 0.55, -0.25))
    # 4) 데스캔트 — 트럼펫(앞꾸밈음 포함)
    lst = []
    for sec, s, d, p, grace in desc:
        t0, t1 = tm(s), tm(s + d)
        if abs(s + d - final_end) < 1e-6: t1 = t0 + (t1 - t0) * 2.0
        lst += [(t0, "on", p, 78 if grace else 92), (t1 - (0.02 if grace else 0.08), "off", p, 0)]
    if lst:
        parts.append(("trumpet_descant", V("Brass/trumpet-SEC-sustain.sfz"), lst, 0.45, 0.05))
    # 5) 팀파니 — 마지막 절·아멘의 줄 첫 박(그때 베이스 음), 쌓는 절 끝 굴림
    lst = []; roll = []
    bass = {(sec, round(s, 3)): p for sec, s, d, v, p in notes if v == "B"}
    for sec in ranges:
        st = stg.get(sec)
        if st == "full":
            for s in lines.get(sec + "_start", []):
                p = bass.get((sec, round(s, 3)))
                if p is None: continue
                while p > 50: p -= 12
                while p < 38: p += 12
                lst += [(tm(s), "on", p, 96), (tm(s) + 1.5, "off", p, 0)]
        if st == "build":
            b = ranges[sec][1]
            roll += [(tm(b - bpb), "on", 43, 64), (tm(b) + 0.2, "off", 43, 0)]
    if lst: parts.append(("timpani", V("Percussion/timpani-hit.sfz"), lst, 0.55, 0.0))
    if roll: parts.append(("timp_roll", V("Percussion/timpani-roll.sfz"), roll, 0.45, 0.0))
    return parts
