# -*- coding: utf-8 -*-
"""Audiveris 가 읽은 악보(.mxl) → hymn_mr 악보 자료 초안(성부 S·A·T·B) + 자동 검사.

초안은 틀린 곳이 있다(마디 쪼개짐, 성부 섞임). 검사 결과와 함께 Claude 가 악보 그림을 보고 고친다(batch.py).
"""
import json, sys
from music21 import converter

FLAT = str.maketrans({"-": "b"})


def pname(p):
    return p.nameWithOctave.translate(FLAT)


def fmt(d):
    s = f"{d:.4f}".rstrip("0").rstrip(".")
    return s[1:] if s.startswith("0.") else s


def staff_roles(m):
    """한 마디(한 보표)의 음을 위 성부·아래 성부로 나눈다. → (upper, lower), 각 [(시작, 길이, 음 또는 None, 붙임줄)]"""
    vs = list(m.voices)
    groups = [(v.id, v) for v in vs] if vs else [("1", m)]
    up, lo = [], []
    for vid, g in groups:
        second = str(vid) not in ("1", "0") and len(groups) > 1
        for n in g.notesAndRests:
            off, d = float(n.offset), float(n.quarterLength)
            if d == 0:
                continue                    # 꾸밈음
            tie = bool(n.tie and n.tie.type in ("start", "continue"))
            if n.isRest:
                (lo if second else up).append((off, d, None, False))
                continue
            ps = sorted(n.pitches, key=lambda p: p.midi)
            if len(ps) >= 2:
                up.append((off, d, pname(ps[-1]), tie)); lo.append((off, d, pname(ps[0]), tie))
            elif second:
                lo.append((off, d, pname(ps[0]), tie))
            else:
                up.append((off, d, pname(ps[0]), tie))
    return up, lo


def clean(seq, other, length):
    """겹침을 없애고, 빈 곳은 다른 성부의 음으로 채운다(같은 음을 함께 부르는 곳)."""
    seq = sorted(seq, key=lambda x: (x[0], -(x[2] is not None)))
    out, t = [], 0.0
    for off, d, p, tie in seq:
        if off < t - 1e-6:
            continue
        if off > t + 1e-6:
            fill = [x for x in other if x[0] >= t - 1e-6 and x[0] < off - 1e-6]
            out += fill or [(t, off - t, None, False)]
            t = off
        out.append((off, d, p, tie)); t = off + d
    if t < length - 1e-6:
        fill = [x for x in other if x[0] >= t - 1e-6]
        out += fill or [(t, length - t, None, False)]
    return out


def tokens(seq):
    return " ".join(f"{p or 'r'}/{fmt(d)}{'~' if tie else ''}" for _, d, p, tie in seq)


def convert(mxl):
    s = converter.parse(mxl)
    parts = list(s.parts)
    if len(parts) < 2:
        raise ValueError(f"보표가 {len(parts)}개뿐입니다")
    ts = s.recurse().getElementsByClass("TimeSignature").first()
    ks = s.recurse().getElementsByClass("KeySignature").first()
    bar = ts.barDuration.quarterLength if ts else 4.0
    tm = [list(parts[0].getElementsByClass("Measure")), list(parts[-1].getElementsByClass("Measure"))]
    measures = []
    for i in range(min(len(tm[0]), len(tm[1]))):
        mt, mb = tm[0][i], tm[1][i]
        length = max(float(mt.duration.quarterLength), float(mb.duration.quarterLength))
        su, sl = staff_roles(mt); bu, bl = staff_roles(mb)
        measures.append({"n": i, "S": tokens(clean(su, sl, length)), "A": tokens(clean(sl, su, length)),
                         "T": tokens(clean(bu, bl, length)), "B": tokens(clean(bl, bu, length))})
    return {"time": [ts.numerator, ts.denominator] if ts else [4, 4],
            "key_sharps": ks.sharps if ks else 0, "bar": bar, "measures": measures}


def length_of(txt):
    tot = 0.0
    for tok in txt.split():
        tot += float(tok.replace("^", "").rstrip("~").split("/")[1])
    return tot


def check(score):
    """자동 검사 — 문제 목록(빈 목록이면 통과)."""
    probs = []
    ms = score.get("measures") or []
    bar = score["time"][0] * 4 / score["time"][1]
    if not ms:
        return ["마디가 없습니다"]
    RANGE = {"S": (57, 81), "A": (52, 74), "T": (45, 69), "B": (36, 62)}   # A3~A5, E3~D5, A2~A4, C2~D4
    pick = float(score.get("pickup", 0) or 0)
    for k, m in enumerate(ms):
        lens = {v: round(length_of(m[v]), 3) for v in "SATB"}
        if len(set(lens.values())) > 1:
            probs.append(f"{m.get('n', k)}마디: 성부 길이가 다릅니다 {lens}")
        L = lens["S"]
        first, last = k == 0, k == len(ms) - 1
        if first and pick:
            if abs(L - pick) > 1e-3: probs.append(f"첫 마디 길이 {L} ≠ 못갖춘마디 {pick}")
        elif last and pick:
            if abs(L - (bar - pick)) > 1e-3 and abs(L - bar) > 1e-3: probs.append(f"끝 마디 길이 {L} (기대 {bar - pick} 또는 {bar})")
        elif abs(L - bar) > 1e-3:
            probs.append(f"{m.get('n', k)}마디 길이 {L} ≠ {bar}")
        for v in "SATB":
            for tok in m[v].split():
                p = tok.replace("^", "").rstrip("~").split("/")[0]
                if p == "r":
                    continue
                try:
                    from hymn_mr import midi_no
                    x = midi_no(p)
                except Exception:
                    probs.append(f"{m.get('n', k)}마디 {v}: 음 이름 오류 {p}"); continue
                lo, hi = RANGE[v]
                if not lo <= x <= hi:
                    probs.append(f"{m.get('n', k)}마디 {v}: {p} 는 이 성부 음역 밖")
    for f in ("verses", "bpm", "intro_from", "title"):
        if not score.get(f):
            probs.append(f"{f} 가 비어 있습니다")
    if score.get("intro_from") is not None and ms:
        ns = [m.get("n") for m in ms]
        if score["intro_from"] not in ns:
            probs.append("intro_from 마디가 없습니다")
    return probs


if __name__ == "__main__":
    d = convert(sys.argv[1])
    print(json.dumps(d, ensure_ascii=False, indent=1))


def agreement(draft, fixed):
    """인식 초안과 고친 자료의 음 순서가 얼마나 같은지(성부별 0~1). 박 길이는 보지 않는다 — 음 이름 순서만."""
    import difflib
    def seq(d, v):
        out = []
        for m in d.get("measures", []):
            for tok in m.get(v, "").split():
                p = tok.replace("^", "").rstrip("~").split("/")[0]
                if p != "r":
                    out.append(p)
        return out
    return {v: round(difflib.SequenceMatcher(None, seq(draft, v), seq(fixed, v), autojunk=False).ratio(), 2) for v in "SATB"}
