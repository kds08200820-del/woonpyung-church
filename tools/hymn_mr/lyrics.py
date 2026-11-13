# -*- coding: utf-8 -*-
"""이미 만든 반주에 노래방 가사만 더한다 — 악보 자료(scores/NNN.json)는 있는데 lyrics 가 없는 장.

  python lyrics.py            # 가사 없는 '완료' 장을 차례로
  python lyrics.py 1 2 3      # 이 장들만
Claude 가 악보 그림을 보고 절마다 가사를 적고(멜로디 음 하나에 음절 하나), 개수를 검사한 뒤
batch.do_one 으로 다시 소리를 만들어(1분) 가사 시간표를 반주와 맞춘다.
"""
import json, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import batch, hymn_mr                                               # noqa: E402

PROMPT = """새찬송가 {no}장 악보 그림입니다. 지금 폴더의 그림 파일을 Read 도구로 모두 보세요(whole.png 전체, 줄N_왼쪽/오른쪽.png 크게).
이 찬송의 노래방 가사를 만들려고 합니다. 절마다 가사를 **소프라노(멜로디) 음 하나에 음절 하나**로 나눠 적은 JSON 만 출력하세요. 다른 말은 쓰지 마세요.

형식: {{"1": "1절", "2": "2절", …}}   (절 수: {verses})
- 낱말 사이는 띄어쓰기, 한 낱말 안의 음절 사이는 "-" 로 나눕니다(예: "나 같-은-_ 죄-인 살-리-신").
- 한 음절을 두 음 이상 끌면 뒤의 음마다 "_" 를 그 낱말 안에 "-" 로 붙여 적습니다(예: "같-은-_"). 붙임줄로 이어진 같은 음은 한 음이라 "_" 를 쓰지 않습니다. 쉼표는 세지 않습니다. 아멘은 적지 않습니다.
- 절마다 조각(음절과 "_") 개수는 반드시 {need}개입니다(이 찬송의 한 절 멜로디 음 수).
- 마디별 멜로디 음 수(참고): {per_measure}
- 악보의 가사 줄이 바뀌는 곳이나 뜻이 끊기는 곳에 " / " 를 넣어 화면 한 줄을 나눕니다(한 줄에 6~12음절).
- 후렴이 한 번만 인쇄돼 있으면 절마다 후렴 가사를 이어 붙입니다.
- 가사는 인쇄된 그대로 적습니다.
"""


def per_measure(score):
    out, prev_tie = [], False
    for m in score["measures"]:
        n = 0
        for tok in m["S"].split():
            t = tok.replace("^", "")
            if not t.startswith("r/") and not prev_tie:
                n += 1
            prev_tie = t.endswith("~")
        out.append(f"{m.get('n')}마디 {n}")
    return ", ".join(out)


def ask(no, score, prev=None, probs=None):
    import ai_worker, claude_auth, subprocess
    on, _, _ = hymn_mr.melody_onsets(score)
    need = len(on.get("v1", []))
    prompt = PROMPT.format(no=no, verses=score.get("verses", 1), need=need, per_measure=per_measure(score))
    if prev:
        prompt += f"\n\n[앞서 낸 가사의 문제 — 그림을 다시 보고 고쳐서 JSON 만 다시]\n{chr(10).join(probs)}\n[앞서 낸 가사]\n{json.dumps(prev, ensure_ascii=False)}"
    cdir = tempfile.mkdtemp(prefix=f"lyr{no}_")
    try:
        batch.crops(batch.src_image(no), cdir)
        args = [ai_worker.find_claude(), "-p", "--output-format", "json", "--model", batch.MODEL,
                "--allowed-tools", "Read", "--disallowed-tools", "Bash Edit Write WebFetch WebSearch NotebookEdit Task",
                "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]
        for mode in claude_auth.modes():
            p = subprocess.run(args, input=prompt.encode("utf-8"), env=claude_auth.env_for(mode),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cdir, timeout=1200)
            out = p.stdout.decode("utf-8", "replace").strip()
            if not out:
                continue
            obj = json.loads(out)
            if obj.get("is_error"):
                if re.search(r"limit|usage|rate", str(obj.get("result")), re.I):
                    raise RuntimeError("Claude 사용 한도: " + str(obj.get("result"))[:200])
                continue
            m = re.search(r"\{.*\}", obj.get("result", ""), re.S)
            if m:
                return json.loads(m.group(0))
        raise RuntimeError("Claude 호출 실패")
    finally:
        shutil.rmtree(cdir, ignore_errors=True)


def add(no, log=batch.log):
    sp = os.path.join(hymn_mr.HOME, "scores", f"{no:03d}.json")
    score = json.load(open(sp, encoding="utf-8"))
    ly = ask(no, score)
    score["lyrics"] = ly
    probs = hymn_mr.check_lyrics(score)
    if probs:
        ly2 = ask(no, score, ly, probs)
        s2 = dict(score, lyrics=ly2); p2 = hymn_mr.check_lyrics(s2)
        if len(p2) <= len(probs):
            score, probs = s2, p2
    json.dump(score, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    st = batch.load_status()
    batch.do_one(no, st)                        # 다시 굽고 가사 시간표를 쓴다
    st = batch.load_status()
    log(f"{no}장 가사: {'완료' if st.get(str(no), {}).get('lyrics') else '확인 필요 ' + str(probs[:2])}")
    return not probs


if __name__ == "__main__":
    nos = [int(a) for a in sys.argv[1:]]
    if not nos:
        st = batch.load_status()
        nos = [int(k) for k, v in st.items() if v.get("state") == "완료" and not v.get("lyrics")]
    for no in sorted(nos):
        add(no)
