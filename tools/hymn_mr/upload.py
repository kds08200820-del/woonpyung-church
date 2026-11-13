# -*- coding: utf-8 -*-
"""완성된 새찬송가 반주를 교회 파일 저장소의 보호 폴더(hymnmr/)에 올린다 — 로그인한 성도만 들을 수 있다.

  python upload.py            # status.json 에서 '완료'이고 아직 안 올린 것
  python upload.py 305 1      # 이 장들만(다시 올림)
저장소 워커(cloudflare/worker.js)에 /hymn-mr-audio 가 있어야 한다. 없으면 아무것도 하지 않고 알린다.
관리자 로그인은 말씀 영상 제작기와 같은 설정(C:\\qt-video\\worker_config.json)을 쓴다.
"""
import json, os, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hymn_mr                                                     # noqa: E402
sys.path.insert(0, os.environ.get("QT_MOTION_APP", r"C:\qt-video\motion\app\qt_motion"))
from qt_motion import Supa                                         # noqa: E402

STORE = os.environ.get("CHURCH_FILES", "https://church-files.kds08200820.workers.dev")
STATUS = os.path.join(hymn_mr.HOME, "status.json")


def post(path, token, data=b"", headers=None):
    h = {"Authorization": "Bearer " + token, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) woonpyung-hymn-mr/1.0"}   # 기본 파이썬 UA 는 Cloudflare 가 막는다(1010)
    h.update(headers or {})
    req = urllib.request.Request(STORE + path, data=data, method="POST", headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode("utf-8", "replace")[:200]}


def ready(token):
    """워커에 반주 경로가 생겼는지(관리자 목록 요청이 200 이면 있다)."""
    code, _ = post("/hymn-mr-list", token)
    return code == 200


def run(nos=None, log=print):
    st = json.load(open(STATUS, encoding="utf-8"))
    supa = Supa(); supa.login()
    if not ready(supa.token):
        log("저장소 워커에 반주 경로(/hymn-mr-audio)가 아직 없습니다 — cloudflare/worker.js 를 배포한 뒤 올립니다.")
        return 0
    n = 0
    for k, rec in sorted(st.items(), key=lambda x: int(x[0])):
        no = int(k)
        if nos and no not in nos:
            continue
        if rec.get("state") != "완료" or (not nos and rec.get("uploaded")):
            continue
        sizes = {}
        for kind in ("orch", "piano"):
            f = os.path.join(hymn_mr.HOME, "out", f"{no:03d}_{kind}.m4a")
            if not os.path.exists(f):
                continue
            data = open(f, "rb").read()
            code, j = post("/hymn-mr-audio", supa.token, data, {"x-hymn-name": f"{no:03d}_{kind}.m4a", "Content-Type": "audio/mp4"})
            if code == 401:
                supa.login()
                code, j = post("/hymn-mr-audio", supa.token, data, {"x-hymn-name": f"{no:03d}_{kind}.m4a", "Content-Type": "audio/mp4"})
            if code != 200:
                raise RuntimeError(f"{no}장 {kind} 올리기 실패({code}): {j}")
            sizes[kind] = len(data)
        lf = os.path.join(hymn_mr.HOME, "out", f"{no:03d}_lyrics.json")     # 노래방 가사(있을 때만)
        if os.path.exists(lf):
            code, j = post("/hymn-mr-audio", supa.token, open(lf, "rb").read(), {"x-hymn-name": f"{no:03d}_lyrics.json", "Content-Type": "application/json"})
            if code == 200:
                sizes["lyrics"] = os.path.getsize(lf)
            else:
                print(f"{no}장 가사 올리기 실패({code}): {j}")
        rec["uploaded"] = sizes
        json.dump(st, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
        log(f"{no}장 올림 {sizes}")
    return n


def _put(supa, name, data, ct):
    code, j = post("/hymn-mr-audio", supa.token, data, {"x-hymn-name": name, "Content-Type": ct})
    if code == 401:
        supa.login(); code, j = post("/hymn-mr-audio", supa.token, data, {"x-hymn-name": name, "Content-Type": ct})
    if code != 200:
        raise RuntimeError(f"{name} 올리기 실패({code}): {j}")


def review(nos, log=print):
    """'확인 필요' 장을 검토용 이름(review_NNN_*)으로 올린다 — 공개 목록(/hymn-mr-have)에는 나오지 않고,
    관리자 대시보드에서만 들어 보고 승인·수정 요청한다(2026-11-13 담임목사)."""
    st = json.load(open(STATUS, encoding="utf-8"))
    supa = Supa(); supa.login()
    n = 0
    for no in nos:
        rec = st.get(str(no)) or {}
        if rec.get("state") != "확인 필요":
            continue
        pad = f"{no:03d}"
        got = {}
        for kind in ("orch", "piano"):
            f = os.path.join(hymn_mr.HOME, "out", f"{pad}_{kind}.m4a")
            if os.path.exists(f):
                _put(supa, f"review_{pad}_{kind}.m4a", open(f, "rb").read(), "audio/mp4"); got[kind] = os.path.getsize(f)
        if not got:
            continue                                   # 소리를 못 만든 장(악보 자료부터 걸린 장)은 들을 것이 없다
        lf = os.path.join(hymn_mr.HOME, "out", f"{pad}_lyrics.json")
        if os.path.exists(lf):
            _put(supa, f"review_{pad}_lyrics.json", open(lf, "rb").read(), "application/json")
        import datetime as _dt
        info = {"no": no, "title": rec.get("title"), "problems": rec.get("problems") or [], "match": rec.get("match"),
                "off_beats": rec.get("off_beats"), "agree": rec.get("agree"), "seconds": rec.get("seconds"),
                "fixed_note": rec.get("fixed_note"), "at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")}   # 저장소 판단 시각(UTC)과 견준다
        _put(supa, f"review_{pad}_info.json", json.dumps(info, ensure_ascii=False).encode("utf-8"), "application/json")
        st = json.load(open(STATUS, encoding="utf-8"))
        st[str(no)]["review_uploaded"] = info["at"]
        json.dump(st, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
        log(f"{no}장 검토용으로 올림 {got}")
    return n


def review_list():
    """저장소에서 검토 목록과 목사님 판단(verdict)을 받는다."""
    supa = Supa(); supa.login()
    code, j = post("/hymn-mr-review", supa.token, b"{}", {"Content-Type": "application/json"})
    if code != 200:
        raise RuntimeError(f"검토 목록 받기 실패({code}): {j}")
    return j.get("items") or []


if __name__ == "__main__":
    run([int(a) for a in sys.argv[1:]] or None)
