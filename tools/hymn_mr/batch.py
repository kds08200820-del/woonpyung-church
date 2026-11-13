# -*- coding: utf-8 -*-
"""새찬송가 MR 일괄 제작 — 교회 PC 전용 (2026-11-13, 담임목사 지시 "이대로 진행")

장마다:  악보 그림 → Audiveris(.mxl) → 초안·자동 검사 → Claude 가 악보 그림을 보고 고침(Read 도구만) → 다시 검사
        → 오케스트라·피아노 소리 → 박마다 화음 대조 → 상태 기록(C:\\hymn-mr\\status.json)
  python batch.py                 # 아직 안 된 장을 차례로 (언제 멈춰도 이어서 한다)
  python batch.py 1 8 94          # 이 장들만
  python batch.py --redo 8        # 다시
  python batch.py --upload        # 다 된 것을 교회 파일 저장소에 올린다(upload.py)
"""
import argparse, datetime as dt, glob, json, os, re, shutil, subprocess, sys, tempfile, time, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import hymn_mr, omr2json                                     # noqa: E402

HOME = hymn_mr.HOME
SRC = os.environ.get("HYMN_SRC", os.path.join(os.path.expanduser("~"), "OneDrive", "바탕 화면", "예배준비 폴더", "찬송가"))
AUDIVERIS = os.path.join(HOME, "audiveris", "Audiveris", "Audiveris.exe")
STATUS = os.path.join(HOME, "status.json")
MODEL = os.environ.get("HYMN_MODEL", "opus")
ENGINE = "organ4"          # 소리 판: 2026-11-13 오르간 주도 편곡(arrange.py). 바뀌면 이미 만든 장도 다시 굽는다


def log(msg):
    line = f"[{dt.datetime.now():%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    os.makedirs(os.path.join(HOME, "logs"), exist_ok=True)
    with open(os.path.join(HOME, "logs", f"{dt.date.today():%Y%m%d}.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_status():
    try:
        return json.load(open(STATUS, encoding="utf-8"))
    except Exception:
        return {}


def save_status(st):
    tmp = STATUS + ".tmp"
    json.dump(st, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, STATUS)


def src_image(no):
    p = os.path.join(SRC, f"새찬송가_{no:03d}장.jpg")
    return p if os.path.exists(p) else None


# ───────────────────────── 그림 조각 (Claude 가 크게 볼 수 있게)

def crops(img, outdir):
    from PIL import Image
    im = Image.open(img).convert("L")
    W, H = im.size
    files = []
    small = im.copy(); small.thumbnail((1200, 1600)); p = os.path.join(outdir, "whole.png"); small.save(p); files.append(p)
    # 오선 줄 찾기: 가로로 검은 점이 많은 줄
    import numpy as np
    a = np.asarray(im) < 128
    rows = a.mean(axis=1)
    lines = np.nonzero(rows > 0.45)[0]
    groups = []
    for y in lines:
        if groups and y - groups[-1][-1] <= 3: groups[-1].append(y)
        else: groups.append([y])
    ys = [int(sum(g) / len(g)) for g in groups]
    staves, cur = [], []
    for y in ys:                                   # 다섯 줄씩 한 보표
        if cur and y - cur[-1] > 40:
            staves.append(cur); cur = []
        cur.append(y)
    if cur: staves.append(cur)
    staves = [s for s in staves if len(s) >= 4]
    systems = [(staves[i][0], staves[i + 1][-1]) for i in range(0, len(staves) - 1, 2)]   # 높은음자리·낮은음자리 한 쌍
    if not systems:
        systems = [(int(H * k / 3), int(H * (k + 1) / 3)) for k in range(3)]
    for i, (y0, y1) in enumerate(systems):
        pad = int((y1 - y0) * 0.25)
        top, bot = max(0, y0 - pad - 40), min(H, y1 + pad)
        for j, (x0, x1) in enumerate([(0, int(W * 0.55)), (int(W * 0.45), W)]):
            c = im.crop((x0, top, x1, bot))
            c = c.resize((int(c.width * 1.6), int(c.height * 1.6)))
            p = os.path.join(outdir, f"줄{i + 1}_{'왼쪽' if j == 0 else '오른쪽'}.png"); c.save(p); files.append(p)
    return files, len(systems)


PROMPT = """당신은 4성부 찬송가 악보를 정확히 옮겨 적는 일을 합니다. 이 자료로 예배 반주(MR)를 만들므로 음 하나, 박 하나라도 틀리면 안 됩니다.

[할 일]
지금 폴더의 그림 파일을 Read 도구로 모두 보세요: whole.png(전체), 줄N_왼쪽.png / 줄N_오른쪽.png(N번째 줄을 크게, 가운데는 겹침).
아래 [초안]은 악보 인식 프로그램이 읽은 것이라 틀린 곳이 있습니다([자동 검사] 참고). 그림과 마디마다 대조해서 고친 **완성 자료 JSON 하나만** 출력하세요. 다른 말은 쓰지 마세요.

[자료 형식]
{{"no": {no}, "title": "제목(그림 위 큰 글씨)", "key": "G" 같은 조 이름, "time": [박자 위, 아래], "tempo_word": "보통으로" 같은 빠르기말(없으면 ""),
 "bpm": 4분음표 기준 빠르기, "pickup": 못갖춘마디 첫 마디의 박 수(4분음표=1, 없으면 0), "verses": 절 수(가사 줄 번호 1. 2. 3. … 의 개수),
 "intro_from": 전주로 쓸 마지막 4마디의 첫 마디 번호, "measures": [...], "amen": [...] 또는 [],
 "lyrics": {{"1": "1절 가사", "2": "2절 가사", …}} }}
- measures 의 마디: {{"n": 번호, "S": "...", "A": "...", "T": "...", "B": "..."}}. 못갖춘마디로 시작하면 그 첫 조각이 n=0, 아니면 첫 마디가 n=1.
- S=소프라노(높은음자리 위 성부), A=알토(높은음자리 아래), T=테너(낮은음자리 위), B=베이스(낮은음자리 아래). 두 성부가 같은 음을 함께 부르면(기둥이 위아래로 붙은 음표 하나) 두 성부에 모두 적습니다.
- 음 적는 법: "G4/2 B4/.5 G4/.5" = 음이름+옥타브(가온다=C4) / 박 수(4분음표=1, 점4분=1.5, 8분=.5, 점2분=3, 셋잇단 8분=.3333). 올림 #, 내림 b. 조표·임시표를 반영한 실제 음을 적습니다(조표에 F# 이면 F 는 F#). 쉼표는 r/박수.
- 붙임줄(같은 음을 잇는 곡선)은 앞 음 끝에 ~ 를 붙입니다. 이음줄(다른 음을 부드럽게)은 무시합니다.
- 줄이 바뀌면서 한 마디가 둘로 나뉘어 인쇄된 것은 **한 마디로 합칩니다**. 모든 마디의 네 성부 박 합은 같아야 하고, 첫 마디(못갖춘)와 끝 마디를 빼면 박자표 한 마디 길이와 같아야 합니다. 못갖춘마디로 시작하면 끝 마디는 (한 마디 − pickup) 길이입니다.
- 도돌이표·1·2괄호가 있으면 실제로 연주하는 순서대로 펼쳐 적습니다.
- 아멘: 마지막 절이 끝난 뒤 따로 붙은 "아멘" 마디들은 measures 에 넣지 말고 "amen" 에 같은 형식으로 넣습니다(n 은 빼도 됩니다). 없으면 [].
- 페르마타(늘임표 𝄐)가 있는 박은 네 성부 모두 그 음 끝에 ^ 를 붙입니다(예: "C5/1^"). 박 수는 바꾸지 않습니다.
- bpm 기준: 아주 느리게 56, 느리게 63, 조금 느리게 69, 보통으로 76, 조금 빠르게 88, 빠르게 100, 힘차게·씩씩하게 92, 경쾌하게 100. 6/8·9/8 같은 겹박자는 점4분음표 하나를 한 박으로 느끼는 빠르기에 맞춰 4분음표 기준으로 바꿔 적습니다(점4분 = 4분 × 1.5).
- lyrics(노래방 가사): 절마다 한 줄 문자열. **소프라노(멜로디) 음 하나에 음절 하나**. 낱말 사이는 띄어쓰기, 한 낱말 안의 음절 사이는 "-" 로 나눕니다(예: "나 같-은-_ 죄-인 살-리-신").
  · 한 음절을 두 음 이상 끌면(이음줄로 묶인 8분음표 등) 뒤의 음마다 "_" 를 그 낱말 안에 "-" 로 붙여 적습니다(예: "같-은-_"). 붙임줄(~)로 이어진 음은 한 음이라 "_" 를 쓰지 않습니다. 쉼표는 세지 않습니다.
  · 그래서 절마다 음절+"_" 의 개수(띄어쓰기와 "-" 로 나뉜 조각 수) = 그 절의 소프라노 음 개수(붙임줄로 이은 것은 하나, 쉼표 빼고)여야 합니다. 아멘은 적지 않습니다.
  · 악보의 가사 줄이 바뀌는 곳이나 뜻이 끊기는 곳에 " / " 를 넣어 화면의 한 줄을 나눕니다(한 줄에 6~12음절 정도).
  · 후렴이 한 번만 인쇄돼 있으면 절마다 후렴 가사를 이어 붙여 적습니다(반주는 절마다 후렴까지 연주합니다).
  · 가사는 그림에 인쇄된 그대로(맞춤법을 고치지 말고) 적습니다.
- intro_from: 마지막 4마디(끝 마디가 짧으면 그것까지 포함해 4마디가 되게)의 첫 번째 마디 번호.

[초안 — 인식 프로그램 결과]
{draft}

[자동 검사 — 초안에서 찾은 문제]
{problems}
"""

RETRY = "\n\n[앞서 낸 자료의 문제 — 그림을 다시 보고 고쳐서 JSON 만 다시 주세요]\n{problems}\n\n[앞서 낸 자료]\n{prev}"


def claude_fix(no, workdir, draft, problems, prev=None, prev_problems=None):
    import ai_worker, claude_auth
    prompt = PROMPT.format(no=no, draft=json.dumps(draft, ensure_ascii=False), problems="\n".join(problems) or "(없음)")
    if prev is not None:
        prompt += RETRY.format(problems="\n".join(prev_problems), prev=json.dumps(prev, ensure_ascii=False))
    args = [ai_worker.find_claude(), "-p", "--output-format", "json", "--model", MODEL,
            "--allowed-tools", "Read", "--disallowed-tools", "Bash Edit Write WebFetch WebSearch NotebookEdit Task",
            "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]
    last = None
    for mode in claude_auth.modes():
        p = subprocess.run(args, input=prompt.encode("utf-8"), env=claude_auth.env_for(mode),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=workdir, timeout=1800)
        out = p.stdout.decode("utf-8", "replace").strip()
        if not out:
            last = p.stderr.decode("utf-8", "replace")[:300]
            continue
        obj = json.loads(out)
        if obj.get("is_error"):
            last = str(obj.get("result"))[:300]
            if re.search(r"limit|usage|rate", last, re.I):
                raise RuntimeError("Claude 사용 한도: " + last)
            continue
        text = obj.get("result", "")
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise RuntimeError("Claude 답에 JSON 이 없습니다: " + text[:200])
        return json.loads(m.group(0))
    raise RuntimeError(f"Claude 호출 실패: {last}")


def lyric_probs(score):
    try:
        return hymn_mr.check_lyrics(score) if not omr2json.check(score) else []
    except Exception as e:
        return [f"가사 검사 실패: {e}"]


def write_lyrics(no, score, trims):
    """노래방 가사 시간표(out/NNN_lyrics.json). 가사가 맞지 않으면 만들지 않는다 → 반주만 나온다."""
    f = os.path.join(HOME, "out", f"{no:03d}_lyrics.json")
    lp = lyric_probs(score) if score.get("lyrics") else ["가사가 없습니다"]
    if lp:
        if os.path.exists(f): os.remove(f)
        return lp
    t = hymn_mr.lyrics_timing(score)
    t.update(no=no, title=score.get("title"), shift=trims)
    json.dump(t, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return []


def check_audio(no, kind):
    p = subprocess.run([sys.executable, os.path.join(HERE, "check_audio.py"), str(no), kind, HERE],
                       capture_output=True, text=True, encoding="utf-8",
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    m = re.search(r"화음 일치 (\d+)%, 크게 어긋난 박 (\d+)개", p.stdout)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 999)


def do_one(no, st):
    img = src_image(no)
    if not img:
        st[str(no)] = {"state": "악보 없음"}; return
    work = os.path.join(HOME, "work", f"{no:03d}"); os.makedirs(work, exist_ok=True)
    rec = {"state": "진행", "at": dt.datetime.now().isoformat(timespec="seconds")}
    st[str(no)] = rec; save_status(st)
    score_path = os.path.join(HOME, "scores", f"{no:03d}.json")
    if not os.path.exists(score_path):
        # 1. 악보 읽기
        omr = os.path.join(HOME, "omr")
        os.makedirs(omr, exist_ok=True)
        jpg = os.path.join(omr, f"{no:03d}.jpg"); shutil.copy(img, jpg)
        mxl = os.path.join(omr, f"{no:03d}.mxl")
        if not os.path.exists(mxl):
            subprocess.run([AUDIVERIS, "-batch", "-export", "-output", omr, jpg], capture_output=True, timeout=600)
        try:
            draft = omr2json.convert(mxl)
            probs = omr2json.check(dict(draft, verses=1, bpm=1, intro_from=draft["measures"][-1]["n"] if draft["measures"] else 0, title="-"))
        except Exception as e:
            draft, probs = {"measures": []}, [f"인식 실패: {e} — 그림만 보고 처음부터 적어 주세요"]
        # 2. Claude 가 그림을 보고 고침
        cdir = tempfile.mkdtemp(prefix=f"hymn{no}_")
        try:
            files, nsys = crops(img, cdir)
            fixed = claude_fix(no, cdir, draft, probs)
            p2, l2 = omr2json.check(fixed), lyric_probs(fixed)
            tries = 1
            if p2 or l2:
                fixed2 = claude_fix(no, cdir, draft, probs, fixed, p2 + l2); tries = 2
                p3, l3 = omr2json.check(fixed2), lyric_probs(fixed2)
                if (len(p3), len(l3)) <= (len(p2), len(l2)): fixed, p2, l2 = fixed2, p3, l3
        finally:
            shutil.rmtree(cdir, ignore_errors=True)
        fixed["no"] = no
        fixed["checked"] = f"{dt.date.today()} 자동: Audiveris + Claude({MODEL}) 그림 대조 {tries}회"
        fixed["agree"] = omr2json.agreement(draft, fixed) if draft.get("measures") else None   # 인식 초안과 음 순서 일치율
        if p2:
            rec.update(state="확인 필요", problems=p2[:12])
            json.dump(fixed, open(os.path.join(work, "draft_fixed.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            save_status(st); log(f"{no}장 확인 필요: {p2[:3]}"); return
        os.makedirs(os.path.dirname(score_path), exist_ok=True)
        json.dump(fixed, open(score_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    score = json.load(open(score_path, encoding="utf-8"))
    # 3. 소리
    res, trims = {}, {}
    for kind in ("orch", "piano"):
        out = os.path.join(HOME, "out", f"{no:03d}_{kind}.m4a")
        secs = hymn_mr.make(score, kind, work, out)
        trims[kind] = secs.get("_trim", 0)
        json.dump(secs, open(os.path.join(work, f"{kind}_sections.json"), "w"), ensure_ascii=False)
        res[kind] = check_audio(no, kind)
    for f in glob.glob(os.path.join(work, "*.wav")) + glob.glob(os.path.join(work, "*.f32")):
        os.remove(f)                                   # 큰 중간 파일 정리
    agr = score.get("agree")
    agr_ok = agr is None or (agr["S"] >= 0.8 and min(agr.values()) >= 0.6)
    beats = max(1, round((secs.get("amen", secs.get("v1"))[1]) / 60 * float(score.get("bpm", 76))))   # 대략의 박 수
    # 박마다 대조: 전체 일치가 높고 어긋난 박이 적으면 통과(어긋난 박은 화음이 바뀌는 곳의 측정 한계가 많다 — 같은 곳이 절마다 되풀이)
    thr = max(3, 0.06 * beats)
    # 두 판은 같은 악보 자료로 만든다 — 어느 한 판이라도 악보와 잘 맞으면 자료는 맞다(피아노는 페달 울림이 겹쳐 재기 어렵다)
    ok = any(res[k][0] >= 80 and res[k][1] <= thr for k in ("orch", "piano")) and agr_ok
    rec.update(state="완료" if ok else "확인 필요", title=score.get("title"), verses=score.get("verses"), bpm=score.get("bpm"),
               match={k: v[0] for k, v in res.items()}, off_beats={k: v[1] for k, v in res.items()},
               seconds=secs["amen"][1] if "amen" in secs else max(v[1] for k2, v in secs.items() if not k2.startswith("_")))
    rec["agree"] = agr
    rec["engine"] = ENGINE
    lp = write_lyrics(no, score, trims)
    rec["lyrics"] = not lp
    if lp: rec["lyrics_problems"] = lp[:4]
    if not ok:
        rec["problems"] = [f"소리 대조: 오케스트라 {res['orch'][0]}%·어긋난 박 {res['orch'][1]}, 피아노 {res['piano'][0]}%·{res['piano'][1]}"] +             ([] if agr_ok else [f"인식 초안과 음 순서 일치율이 낮음 {agr} — 사람이 악보와 대조 필요"])
    save_status(st)
    log(f"{no}장 {score.get('title')}: {rec['state']} (일치 {rec['match']})")


def upload_ready_cache():
    try:
        import upload
        from qt_motion import Supa
        s = Supa(); s.login()
        return upload.ready(s.token)
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("nos", nargs="*", type=int)
    ap.add_argument("--redo", action="store_true")
    o = ap.parse_args()
    lock = os.path.join(HOME, "batch.lock")
    if os.path.exists(lock):
        try:
            pid = int(open(lock).read())
            if subprocess.run(["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True).stdout.count(str(pid)):
                print("이미 돌고 있습니다"); return
        except Exception:
            pass
    open(lock, "w").write(str(os.getpid()))
    try:
        st = load_status()
        up_ok = [True]
        try:                                   # 전에 다 만들고 못 올린 것부터
            import upload
            if not o.nos and upload.run(log=log) == 0 and not upload_ready_cache():
                up_ok[0] = False
        except Exception as e:
            log(f"올리기 확인 실패: {e}")
        st = load_status()
        nos = o.nos or list(range(1, 646))
        if not o.nos:                          # 소리 판이 바뀐 장: 악보 자료는 그대로 두고 다시 굽고 올린다(장당 1분)
            for no in sorted(int(k) for k, v in st.items() if v.get("state") in ("완료", "확인 필요")
                             and (v.get("engine") != ENGINE or (not v.get("lyrics") and not v.get("lyrics_tried")))
                             and os.path.exists(os.path.join(HOME, "scores", f"{int(k):03d}.json"))):
                now = dt.datetime.now().time()
                if dt.time(0, 30) <= now < dt.time(7, 30):
                    log("새벽에는 쉽니다(다시 굽기)."); return
                try:
                    sc = json.load(open(os.path.join(HOME, "scores", f"{no:03d}.json"), encoding="utf-8"))
                    if not sc.get("lyrics"):          # 가사 없이 만든 장: 가사부터 붙인다(lyrics.add 가 다시 굽기까지 한다)
                        import lyrics
                        lyrics.add(no, log=log)
                        st2 = load_status(); st2.setdefault(str(no), {})["lyrics_tried"] = True; save_status(st2)
                    else:
                        do_one(no, st)
                    st = load_status()
                    if not st.get(str(no), {}).get("lyrics"):      # 가사가 끝내 안 맞으면 매번 되풀이하지 않게
                        st.setdefault(str(no), {})["lyrics_tried"] = True; save_status(st)
                    if st.get(str(no), {}).get("state") == "완료" and up_ok[0]:
                        import upload
                        upload.run([no], log=log)
                except Exception as e:
                    log(f"{no}장 다시 굽기 실패: {e}")
                st = load_status()
        for no in nos:
            if not o.redo and st.get(str(no), {}).get("state") in ("완료", "확인 필요", "악보 없음"):
                continue
            now = dt.datetime.now().time()
            if not o.nos and (now >= dt.time(0, 30) and now < dt.time(7, 30)):
                log("새벽(00:30~07:30)에는 쉽니다 — 말씀 영상 제작·QT 계획에 PC 와 Claude 를 비워 둔다. 다음 예약 때 이어서."); return
            if not o.nos:
                time.sleep(int(os.environ.get("HYMN_PAUSE", "45")))   # Claude 사용량을 천천히
            if o.redo:
                for f in (os.path.join(HOME, "scores", f"{no:03d}.json"),):
                    if os.path.exists(f) and no != 305: os.remove(f)
            try:
                do_one(no, st)
                if st.get(str(no), {}).get("state") == "완료" and up_ok[0]:
                    try:
                        import upload
                        if not upload.run([no], log=log):
                            up_ok[0] = False        # 워커에 반주 경로가 아직 없다 — 이번 실행에서는 더 묻지 않는다
                    except Exception as e:
                        log(f"{no}장 올리기 실패(다음에 다시): {e}")
                    st = load_status()
            except RuntimeError as e:
                if "사용 한도" in str(e):
                    st[str(no)] = {"state": "대기"}; save_status(st)
                    log(f"Claude 사용 한도 — 멈춥니다. 다음 예약 때 이어서 합니다. ({e})"); return
                st[str(no)] = {"state": "오류", "error": str(e)[:300]}; save_status(st); log(f"{no}장 오류: {e}")
            except Exception as e:
                st[str(no)] = {"state": "오류", "error": (str(e) or repr(e))[:300]}; save_status(st)
                log(f"{no}장 오류: {traceback.format_exc()[-600:]}")
        if not o.nos:                          # 다 돈 뒤: 가사 없이 끝난 장에 노래방 가사 더하기
            import lyrics
            st = load_status()
            for no in sorted(int(k) for k, v in st.items() if v.get("state") == "완료" and not v.get("lyrics") and not v.get("lyrics_tried")):
                now = dt.datetime.now().time()
                if dt.time(0, 30) <= now < dt.time(7, 30):
                    return
                try:
                    lyrics.add(no, log=log)
                except RuntimeError as e:
                    if "사용 한도" in str(e):
                        log(f"Claude 사용 한도 — 가사 더하기 멈춤 ({e})"); return
                    log(f"{no}장 가사 오류: {e}")
                st = load_status(); st.setdefault(str(no), {})["lyrics_tried"] = True; save_status(st)
    finally:
        try: os.remove(lock)
        except OSError: pass


if __name__ == "__main__":
    main()
