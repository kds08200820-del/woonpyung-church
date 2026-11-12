# -*- coding: utf-8 -*-
r"""
유튜브 올리기 (YouTube Data API v3, 표준 라이브러리만).

  python youtube.py auth      한 번만: 브라우저에서 교회 채널 계정으로 허용 → 갱신 열쇠 저장
  python youtube.py whoami    연결된 채널 이름 확인
  python youtube.py upload <파일.mp4> --title "제목" [--private]   손으로 한 편 올려 보기

열쇠 파일은 교회 PC 에만 둔다 (저장소·Supabase 에 넣지 않는다):
  C:\qt-video\motion\client_secret.json   구글 클라우드에서 받은 '데스크톱 앱' OAuth 열쇠
  C:\qt-video\motion\youtube_token.json   auth 가 만든 갱신 열쇠
"""
import datetime as dt, http.server, json, os, secrets, sys, threading, urllib.error, urllib.parse, urllib.request, webbrowser

for _s in (sys.stdout, sys.stderr):
    if _s and hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HOME = os.environ.get("QT_MOTION_HOME") or r"C:\qt-video\motion"
CLIENT = os.path.join(HOME, "client_secret.json")
TOKEN = os.path.join(HOME, "youtube_token.json")
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/youtube/v3"


def _client():
    if not os.path.exists(CLIENT):
        raise SystemExit(f"{CLIENT} 가 없습니다. README 의 '유튜브 연결' 을 먼저 해 주세요.")
    d = json.load(open(CLIENT, encoding="utf-8-sig"))
    d = d.get("installed") or d.get("web") or d
    return d["client_id"], d["client_secret"]


def _post_form(url, fields):
    req = urllib.request.Request(url, urllib.parse.urlencode(fields).encode(), {"Content-Type": "application/x-www-form-urlencoded"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"구글 인증 오류 {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


def auth():
    cid, sec = _client()
    state = secrets.token_urlsafe(16)
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if q.get("state", [""])[0] == state:
                got.update({k: v[0] for k, v in q.items()})
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write("<h2>연결되었습니다. 이 창을 닫으셔도 됩니다.</h2>".encode("utf-8"))
        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    redirect = f"http://127.0.0.1:{srv.server_port}"
    url = AUTH_URL + "?" + urllib.parse.urlencode({"client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": SCOPES,
                                                    "access_type": "offline", "prompt": "consent", "state": state})
    print("브라우저가 열립니다. 교회 유튜브 채널의 구글 계정으로 로그인하고 '허용' 을 눌러 주세요.\n열리지 않으면 이 주소를 직접 여세요:\n" + url)
    webbrowser.open(url)
    t = threading.Thread(target=srv.handle_request); t.start(); t.join(600)
    if "code" not in got:
        raise SystemExit("허용이 확인되지 않았습니다(10분 초과 또는 취소). 다시 실행해 주세요.")
    tok = _post_form(TOKEN_URL, {"code": got["code"], "client_id": cid, "client_secret": sec, "redirect_uri": redirect, "grant_type": "authorization_code"})
    if "refresh_token" not in tok:
        raise SystemExit("갱신 열쇠를 받지 못했습니다. 구글 계정 > 보안 > 서드파티 액세스에서 이 앱을 지우고 다시 실행해 주세요.")
    json.dump({"refresh_token": tok["refresh_token"], "saved": dt.datetime.now().isoformat()}, open(TOKEN, "w", encoding="utf-8"))
    print("저장했습니다:", TOKEN)
    whoami()


def access_token():
    if not os.path.exists(TOKEN):
        raise RuntimeError("유튜브 로그인이 되어 있지 않습니다. 유튜브_연결.bat 을 한 번 실행해 주세요.")
    cid, sec = _client()
    rt = json.load(open(TOKEN, encoding="utf-8"))["refresh_token"]
    try:
        return _post_form(TOKEN_URL, {"client_id": cid, "client_secret": sec, "refresh_token": rt, "grant_type": "refresh_token"})["access_token"]
    except RuntimeError as e:
        raise RuntimeError(f"유튜브 로그인이 풀렸습니다. 유튜브_연결.bat 을 다시 실행해 주세요. ({e})")


def _api(method, url, tok, body=None):
    req = urllib.request.Request(url, None if body is None else json.dumps(body).encode("utf-8"),
                                 {"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=utf-8"}, method=method)
    try:
        raw = urllib.request.urlopen(req, timeout=120).read()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"유튜브 API 오류 {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")


def whoami():
    r = _api("GET", API + "/channels?part=snippet&mine=true", access_token())
    for c in r.get("items", []):
        print("연결된 채널:", c["snippet"]["title"], "(" + c["id"] + ")")
    if not r.get("items"):
        print("이 계정에 유튜브 채널이 없습니다.")


def upload(path, title, description, publish_at=None, privacy="public", category="29", playlist=None, tags=None):
    """영상을 올린다. publish_at(시각대가 있는 datetime)이 앞으로의 때면 비공개로 올리고 그때 공개되도록 예약한다.
    돌려주는 값: {id, url, state, privacy, publish_at}"""
    tok = access_token()
    status = {"selfDeclaredMadeForKids": False, "containsSyntheticMedia": True, "embeddable": True}
    now = dt.datetime.now(dt.timezone.utc)
    if publish_at and publish_at.astimezone(dt.timezone.utc) > now + dt.timedelta(minutes=10):
        status["privacyStatus"] = "private"
        status["publishAt"] = publish_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    else:
        status["privacyStatus"] = privacy
    meta = {"snippet": {"title": title[:100], "description": description[:4900], "categoryId": str(category),
                        "defaultLanguage": "ko", "defaultAudioLanguage": "ko", "tags": tags or ["매일QT", "큐티", "말씀묵상"]},
            "status": status}
    size = os.path.getsize(path)
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=true",
        json.dumps(meta).encode("utf-8"),
        {"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=utf-8",
         "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)}, method="POST")
    try:
        loc = urllib.request.urlopen(req, timeout=120).headers["Location"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"유튜브 올리기 시작 실패 {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")
    with open(path, "rb") as f:
        put = urllib.request.Request(loc, f.read(), {"Content-Type": "video/mp4", "Content-Length": str(size)}, method="PUT")
    try:
        v = json.load(urllib.request.urlopen(put, timeout=3600))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"유튜브 올리기 실패 {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")
    vid = v["id"]
    out = {"id": vid, "url": "https://youtu.be/" + vid, "privacy": v.get("status", {}).get("privacyStatus"),
           "publish_at": status.get("publishAt"), "upload_status": v.get("status", {}).get("uploadStatus")}
    out["state"] = ("예약 " + publish_at.strftime("%m/%d %H:%M")) if status.get("publishAt") else ("공개" if out["privacy"] == "public" else "비공개")
    if status["privacyStatus"] == "public" and out["privacy"] != "public":
        out["state"] = "비공개로 잠김(유튜브 API 심사 전)"
    if playlist:
        try:
            _api("POST", API + "/playlistItems?part=snippet", tok, {"snippet": {"playlistId": playlist, "resourceId": {"kind": "youtube#video", "videoId": vid}}})
        except RuntimeError as e:
            out["playlist_error"] = str(e)[:200]
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["auth"]:
        auth()
    elif a[:1] == ["whoami"]:
        whoami()
    elif a[:1] == ["upload"] and len(a) >= 2:
        title = a[a.index("--title") + 1] if "--title" in a else os.path.basename(a[1])
        print(json.dumps(upload(a[1], title, "시험 업로드", privacy="private" if "--private" in a else "public"), ensure_ascii=False, indent=2))
    else:
        print(__doc__)
