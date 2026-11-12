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
        rec["uploaded"] = sizes
        json.dump(st, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
        log(f"{no}장 올림 {sizes}")
    return n


if __name__ == "__main__":
    run([int(a) for a in sys.argv[1:]] or None)
