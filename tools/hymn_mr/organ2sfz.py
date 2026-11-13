# -*- coding: utf-8 -*-
"""GrandOrgue 오르간 음원(Lars Palo, Piteå MHS, CC BY-SA 2.5) → sfizz 가 읽는 스톱별 .sfz

  python organ2sfz.py [오르간폴더] [출력폴더]
  기본: C:\\hymn-mr\\organ\\pitea → C:\\hymn-mr\\organ\\sfz

- 원본 파이프 소리는 WavPack 으로 묶인 .wav 이다. ffmpeg 로 풀어 16비트 wav 로 둔다.
- 파이프마다 들어 있는 고리(loop: 길게 끄는 부분)와 놓음 표시(cue: 건반을 놓을 때의 자연스러운 꼬리)를 읽어
  누르는 동안은 고리를 돌고, 놓으면 원래 녹음된 꼬리가 울리게 한다(trigger=release, offset=놓음 위치).
- ODF(PiteaMHS.organ)의 파이프별 음높이 보정(PitchTuning)을 tune= 으로 옮긴다.
"""
import json, os, re, struct, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\hymn-mr\organ\pitea"
OUT = sys.argv[2] if len(sys.argv) > 2 else r"C:\hymn-mr\organ\sfz"
ODF = os.path.join(SRC, "PiteaMHS.organ")


def read_odf(path):
    sec, cur = {}, None
    for raw in open(path, encoding="latin-1"):
        ln = raw.strip()
        if not ln or ln.startswith(";"):
            continue
        m = re.match(r"\[(.+)\]$", ln)
        if m:
            cur = sec.setdefault(m.group(1), {}); continue
        if cur is not None and "=" in ln:
            k, v = ln.split("=", 1); cur[k.strip()] = v.strip()
    return sec


def markers(path):
    """WavPack 파일 안에 남아 있는 원래 wav 머리글에서 고리와 놓음 위치(표본 번호)."""
    d = open(path, "rb").read(8192)
    loop = rel = None
    i = d.find(b"smpl")
    if i >= 0:
        b = d[i + 8:i + 8 + 60]
        if struct.unpack("<I", b[28:32])[0] >= 1:
            s, e = struct.unpack("<II", d[i + 8 + 44:i + 8 + 52])
            loop = (s, e)
    i = d.find(b"cue ")
    if i >= 0:
        n = struct.unpack("<I", d[i + 8:i + 12])[0]
        pts = [struct.unpack("<IIIIII", d[i + 12 + 24 * k:i + 36 + 24 * k])[5] for k in range(n)]
        if pts: rel = max(pts)
    return loop, rel


def decode(src, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:a", "pcm_s16le", dst], check=True)


def safe(name):
    s = re.sub(r"[^A-Za-z0-9]+", "_", name.encode("ascii", "ignore").decode()).strip("_")
    return s or "stop"


def main():
    odf = read_odf(ODF)
    stops = sorted(k for k in odf if re.fullmatch(r"Stop\d{3}", k))
    os.makedirs(OUT, exist_ok=True)
    manifest, jobs = [], []
    for sk in stops:
        st = odf[sk]
        name = st.get("Name", sk)
        n = int(st.get("NumberOfLogicalPipes", "0") or 0)
        if not n:
            continue
        first_key = int(st.get("FirstAccessiblePipeLogicalKeyNumber", "1"))
        first_pipe = int(st.get("FirstAccessiblePipeLogicalPipeNumber", "1"))
        regions = []
        for k in range(1, n + 1):
            ref = st.get(f"Pipe{k:03d}", "")
            if not ref or ref.upper().startswith(("REF:", "DUMMY")):
                continue
            src = os.path.join(SRC, ref.replace("\\", os.sep))
            if not os.path.exists(src):
                continue
            key = 36 + (k - first_pipe) + (first_key - 1)
            tune = float(st.get(f"Pipe{k:03d}PitchTuning", st.get("PitchTuning", "0")) or 0)
            rel_wav = ref.replace("\\", "/")
            dst = os.path.join(OUT, "samples", rel_wav)
            jobs.append((src, dst))
            loop, rel = markers(src)
            regions.append((key, rel_wav, tune, loop, rel))
        if not regions:
            continue
        fn = f"{sk}_{safe(name)}.sfz"
        lines = [f"// {name} — Piteå MHS (Lars Palo, CC BY-SA 2.5) / organ2sfz.py", "<control>", "default_path=samples/",
                 "<global>", "ampeg_attack=0.004", "ampeg_release=0.06", "amp_veltrack=100", "volume=0"]   # 세기로 절마다 스톱 합 크기를 고르게(arrange.py)
        for key, wav, tune, loop, rel in regions:
            t = f" tune={int(round(tune))}" if abs(tune) >= 0.5 else ""
            if loop and loop[1] > loop[0]:
                end = f" end={rel - 1}" if rel and rel > loop[1] else ""
                lines.append(f"<region> sample={wav} key={key} pitch_keycenter={key}{t} loop_mode=loop_sustain loop_start={loop[0]} loop_end={loop[1]}{end}")
            else:
                lines.append(f"<region> sample={wav} key={key} pitch_keycenter={key}{t} loop_mode=no_loop")
            if rel and loop and rel > loop[1]:
                lines.append(f"<region> sample={wav} key={key} pitch_keycenter={key}{t} trigger=release offset={rel} rt_decay=0 ampeg_attack=0.01 ampeg_release=0.3")
        open(os.path.join(OUT, fn), "w", encoding="utf-8").write("\n".join(lines) + "\n")
        manifest.append({"stop": sk, "name": name, "file": fn, "lo": min(r[0] for r in regions), "hi": max(r[0] for r in regions),
                         "harmonic": st.get("HarmonicNumber"), "pipes": len(regions)})
    seen = {}
    for s, d in jobs:
        seen[d] = s
    print(f"스톱 {len(manifest)}개, 파이프 소리 {len(seen)}개 푸는 중…", flush=True)
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda sd: decode(sd[1], sd[0]), seen.items()))
    json.dump(manifest, open(os.path.join(OUT, "stops.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for m in manifest:
        print(f"{m['file']:40s} {m['lo']}-{m['hi']} ({m['pipes']})")


if __name__ == "__main__":
    main()
