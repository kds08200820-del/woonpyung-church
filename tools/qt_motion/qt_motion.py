# -*- coding: utf-8 -*-
r"""
매일 QT 모션 영상 — 하루 한 편을 처음부터 끝까지 만든다 (교회 PC 전용).

  QT 원고 읽기 → Claude 가 영상 계획(plan.json) 작성 → QT 목소리로 내레이션 → 로컬 AI 그림
  → 틀에 넣어 MP4 로 굽기 → 교회 파일 저장소에 올리기 → 홈페이지 QT 글에 영상 주소 넣기
  (홈페이지 '오늘의 말씀 영상' 단추가 그 영상을 바로 튼다. 유튜브에는 올리지 않는다 — 올리려면 --youtube)

사용:
  python qt_motion.py                    내일 날짜 QT (예: 13일 새벽 1시에 돌리면 14일자)
  python qt_motion.py --date 2026-11-14  날짜 지정
  python qt_motion.py --date 2026-11-11 --plan examples\2026-11-11.plan.json   계획을 직접 줌(시험)
  python qt_motion.py --date ... --until render      굽기까지만 (올리기·링크 안 함)
  python qt_motion.py --date ... --youtube           유튜브에도 올림(유튜브 연결이 되어 있을 때)
  python qt_motion.py --doctor                       준비 상태 점검
  python qt_motion.py --auto                         예약용: 대시보드의 제작 요청을 차례로 만들고, 새벽 1시가 지났으면 내일 것을 만든다

단계마다 결과를 C:\qt-video\motion\work\<날짜>\ 에 남기므로, 멈춘 뒤 같은 명령을 다시 돌리면 이어서 한다.
설정: C:\qt-video\motion\config.json (없으면 기본값). 자세한 것은 README.md.
"""
import argparse, array, datetime as dt, hashlib, json, math, os, re, shutil, subprocess, sys, time
import urllib.error, urllib.parse, urllib.request

for _s in (sys.stdout, sys.stderr):
    if _s and hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
QT_HOME = r"C:\qt-video"
HOME = os.environ.get("QT_MOTION_HOME") or os.path.join(QT_HOME, "motion")   # 시험할 때는 QT_MOTION_HOME 으로 다른 폴더를 쓴다
SKILL = os.path.join(HOME, "script-to-motion")
SCRIPTS = os.path.join(SKILL, "scripts")
KST = dt.timezone(dt.timedelta(hours=9))

DEFAULTS = {
    "comfy": "http://127.0.0.1:8188",
    "comfy_workflow": os.path.join(QT_HOME, "workflows", "flux_image_api.json"),
    "image_model": "flux1-dev-Q4_K_S.gguf",   # 없으면 flux1-schnell-Q4_K_S.gguf 로 바꾸고 image_steps 4
    "image_steps": 20,
    "image_size": [576, 1024],
    "max_images": 8,
    "render_res": "1080p",
    "render_fps": 30,
    "bridge_port": 9881,
    "claude_model": "sonnet",
    "file_store": "https://church-files.kds08200820.workers.dev",   # 교회 파일 저장소(음성 QT 와 같은 곳)
    "web_bitrate": "950k",          # 홈페이지용 사본의 화질(1분 44초에 12MB 쯤)
    "youtube": False,               # True 면 유튜브에도 올린다
    "publish_time": "00:00",        # (유튜브 전용) 그날 한국 시각 몇 시에 공개할지
    "youtube_privacy": "public",    # 예약 시각이 지나 있으면 이 값으로 바로 올린다
    "youtube_category": "29",
    "youtube_playlist": "",
    "service": "매일 QT",
    "church": "운평장로교회",
    "site": "https://k-logos.com",
}
STYLE = (", detailed anime comic book illustration, bold clean black ink outlines, cel shading with crisp shadows, rich saturated colours, "
         "expressive characters, dynamic composition, vertical 9:16 framing, no text, no letters, no speech bubbles, no captions, no watermark, no signature")
ERA = {
    "bible": "Old Testament era ancient Israel, simple woven robes, head cloths and leather sandals, pale limestone block architecture without columns, ",
    "nt": "first century Judea and Galilee, simple woven tunics and cloaks, leather sandals, pale limestone houses and dusty roads, ",
    "today": "present-day South Korea, ",
}


def log(msg):
    print(f"[{dt.datetime.now(KST):%H:%M:%S}] {msg}", flush=True)


def load_cfg():
    cfg = dict(DEFAULTS)
    p = os.path.join(HOME, "config.json")
    if os.path.exists(p):
        cfg.update(json.load(open(p, encoding="utf-8-sig")))
    return cfg


def http_json(method, url, body=None, headers=None, timeout=60):
    data = None if body is None else json.dumps(body).encode("utf-8")
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} → {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


# ─────────────────────────────── Supabase (관리자 로그인: 기존 워커와 같은 계정)

class Supa:
    def __init__(self):
        src = open(os.path.join(QT_HOME, "qt_video.py"), encoding="utf-8").read()
        self.url = re.search(r'CHURCH_SUPABASE_URL\s*=\s*["\']([^"\']+)', src).group(1).rstrip("/")
        key = re.search(r'CHURCH_ANON_KEY\s*=\s*\(?\s*((?:["\'][^"\']+["\']\s*)+)', src).group(1)
        self.anon = "".join(re.findall(r'["\']([^"\']+)["\']', key))
        self.cfg = json.load(open(os.path.join(QT_HOME, "worker_config.json"), encoding="utf-8-sig"))
        self.token = None

    def login(self):
        r = http_json("POST", f"{self.url}/auth/v1/token?grant_type=password",
                      {"email": self.cfg["email"], "password": self.cfg["password"]}, {"apikey": self.anon})
        self.token = r["access_token"]

    def req(self, method, path, body=None, prefer=None):
        if not self.token:
            self.login()
        h = {"apikey": self.anon, "Authorization": f"Bearer {self.token}"}
        if prefer:
            h["Prefer"] = prefer
        return http_json(method, self.url + path, body, h)


def strip_html(s):
    s = re.sub(r"</p>|<br\s*/?>", "\n", s or "")
    s = re.sub(r"<[^>]+>", "", s)
    import html
    return re.sub(r"\n{3,}", "\n\n", html.unescape(s)).strip()


# ─────────────────────────────── 1. QT 원고

def fetch_qt(supa, cfg, date):
    q = urllib.parse.urlencode({"select": "id,sermon_date,title,scripture,qt_bible_text,bible_text,content,prayer,media_url",
                                "service": "eq." + cfg["service"], "sermon_date": "eq." + date, "limit": "1"})
    rows = supa.req("GET", "/rest/v1/sermons?" + q)
    if not rows:
        raise SystemExit(f"{date} 날짜의 '{cfg['service']}' 원고가 아직 없습니다. 원고를 넣은 뒤 다시 돌려 주세요.")
    r = rows[0]
    body = strip_html(r.get("content"))
    if len(body) < 200:
        raise SystemExit(f"{date} QT 묵상 글이 너무 짧습니다({len(body)}자). 원고가 다 들어갔는지 확인해 주세요.")
    r["text"] = (f"제목: {r['title']}\n본문: {r['scripture']} ({date})\n\n[성경 본문]\n{r.get('qt_bible_text') or r.get('bible_text') or ''}\n\n"
                 f"[묵상]\n{body}\n\n[기도]\n{strip_html(r.get('prayer'))}")
    return r


# ─────────────────────────────── 2. 계획 (Claude CLI)

def make_plan(cfg, qt, date):
    sys.path.insert(0, os.path.dirname(HERE))   # tools/
    import ai_worker
    system = open(os.path.join(HERE, "plan_prompt.md"), encoding="utf-8").read()
    d = dt.date.fromisoformat(date)
    prompt = f"날짜: {date} (화면 표시: 매일 QT · {d.month}월 {d.day}일)\n\n아래 QT 원고로 영상 계획 JSON 을 만들어 주세요.\n\n{qt['text']}"
    last = None
    for attempt in range(3):
        out = ai_worker.run_claude(system, prompt if not last else prompt + f"\n\n(앞서 낸 계획의 문제: {last} — 고쳐서 JSON 만 다시 주세요.)",
                                   cfg["claude_model"], 600)
        m = re.search(r"\{.*\}", out, re.S)
        try:
            plan = json.loads(m.group(0))
            plan["date"] = date
            plan.setdefault("kicker", f"매일 QT · {d.month}월 {d.day}일")
            plan.setdefault("title", qt["title"]); plan.setdefault("scripture", qt["scripture"])
            errs = validate_plan(plan, cfg)
            if not errs:
                return plan
            last = "; ".join(errs[:6])
        except Exception as e:   # JSON 이 아님
            last = f"JSON 으로 읽을 수 없음({e})"
        log(f"  계획 다시 요청({attempt + 1}/3): {last}")
    raise SystemExit("Claude 가 쓸 수 있는 계획을 세 번 안에 내지 못했습니다: " + str(last))


def validate_plan(plan, cfg):
    errs = []
    cues = plan.get("cues") or []
    ids = [c.get("id") for c in cues]
    if not (8 <= len(cues) <= 26):
        errs.append(f"문장(cues) 수가 {len(cues)}개 — 8~26개여야 함")
    if len(set(ids)) != len(ids) or not all(re.fullmatch(r"c\d\d", i or "") for i in ids):
        errs.append("cue id 는 c01, c02… 로 겹치지 않게")
    total = sum(len(c.get("say") or "") for c in cues)
    if total > 760:
        errs.append(f"내레이션이 {total}자 — 760자(약 2분 20초) 이하여야 함")
    for c in cues:
        if not c.get("say") or not c.get("text"):
            errs.append(f"{c.get('id')}: say 와 text 가 모두 있어야 함")
        if re.search(r"[0-9A-Za-z\[\]<>]", c.get("say") or ""):
            errs.append(f"{c.get('id')}: say 에는 숫자·영문·꼬리표 없이 한글로 읽는 대로")
    images = plan.get("images") or {}
    if len(images) > cfg["max_images"]:
        errs.append(f"그림이 {len(images)}장 — {cfg['max_images']}장 이하여야 함")
    for n, im in images.items():
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,20}", n):
            errs.append(f"그림 이름 '{n}' 은 영문 소문자로")
        if im.get("era") not in ERA or len(im.get("prompt") or "") < 30:
            errs.append(f"그림 '{n}': era(bible/nt/today) 와 영어 prompt 필요")
    scenes = plan.get("scenes") or []
    if not scenes or scenes[0].get("type") != "title" or scenes[-1].get("type") != "end":
        errs.append("scenes 는 title 로 시작해 end 로 끝나야 함")
    prev = -1
    text_of = {c["id"]: c.get("text") or "" for c in cues if c.get("id")}
    for i, s in enumerate(scenes):
        t = s.get("type")
        if t not in ("title", "shot", "verse", "say", "triple", "end"):
            errs.append(f"장면 {i + 1}: 모르는 type '{t}'")
        if 0 < i < len(scenes) - 1 or (t != "title" and t != "end"):
            if s.get("from") not in ids:
                errs.append(f"장면 {i + 1}: from 이 cue id 가 아님")
            else:
                k = ids.index(s["from"])
                if k <= prev:
                    errs.append(f"장면 {i + 1}: from 이 앞 장면보다 뒤여야 함")
                prev = k
        used = [s.get("image")] if t == "shot" else [p.get("image") for p in s.get("panels", [])] if t == "triple" else []
        for u in used:
            if u not in images:
                errs.append(f"장면 {i + 1}: 그림 '{u}' 이 images 에 없음")
        for l in (s.get("labels") or []) + (s.get("panels") or []):
            if l.get("cue") and l["cue"] not in ids:
                errs.append(f"장면 {i + 1}: 이름표의 cue '{l['cue']}' 없음")
            elif l.get("cue") and l.get("phrase") and l["phrase"] not in text_of[l["cue"]]:
                l.pop("phrase")   # 구절이 그 문장에 없으면 문장 시작에 맞춘다
            if len(l.get("text") or l.get("label") or "") > 16:
                errs.append(f"장면 {i + 1}: 이름표는 16자 이하")
    return errs


# ─────────────────────────────── 3. 프로젝트 틀

def run(cmd, cwd=None, env=None, check=True, timeout=None):
    e = dict(os.environ); e.update(env or {}); e["PYTHONIOENCODING"] = "utf-8"
    p = subprocess.run(cmd, cwd=cwd, env=e, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    out = p.stdout.decode("utf-8", "replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"{' '.join(map(str, cmd[:3]))} … 실패({p.returncode}):\n{out[-1500:]}")
    return out


def caption_lines(text, limit=13):
    """자막 한 줄이 화면 폭을 넘지 않게 띄어쓰기 자리에서 나눈다(한 줄 13자 안팎)."""
    out, cur = [], ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > limit:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        out.append(cur)
    return out


def make_project(cfg, plan, proj):
    if not os.path.exists(os.path.join(proj, "js", "player.js")):
        if os.path.exists(proj):
            shutil.rmtree(proj)
        run(["node", os.path.join(SCRIPTS, "new_project.mjs"), proj, "--title", plan["title"], "--lang", "ko", "--aspect", "9:16", "--no-guard"])
        run(["node", os.path.join(SCRIPTS, "add_font.mjs"), proj, "gowun-batang"])
    t = os.path.join(HERE, "template")
    shutil.copy(os.path.join(t, "index.html"), os.path.join(proj, "index.html"))
    shutil.copy(os.path.join(t, "style.css"), os.path.join(proj, "css", "style.css"))
    shutil.copy(os.path.join(t, "scenes.js"), os.path.join(proj, "js", "scenes.js"))
    with open(os.path.join(proj, "js", "plan.js"), "w", encoding="utf-8") as f:
        view = {k: plan[k] for k in ("date", "title", "scripture", "kicker", "scenes") if k in plan}
        f.write("// 그날의 영상 계획 — qt_motion.py 가 쓴다. 손으로 고치지 말 것.\nwindow.PLAN = " + json.dumps(view, ensure_ascii=False, indent=1) + ";\n")
    sp = os.path.join(proj, "script.json")
    old = json.load(open(sp, encoding="utf-8")) if os.path.exists(sp) else {}
    cuts = {c["id"]: c["cut"] for c in old.get("cues", []) if c.get("cut")}
    cues = []
    for c in plan["cues"]:
        q = {"id": c["id"], "say": c["say"], "text": c["text"], "captions": caption_lines(c["text"])}
        if c.get("gapAfter"):
            q["gapAfter"] = min(0.38, float(c["gapAfter"]))
        if c["id"] in cuts:
            q["cut"] = cuts[c["id"]]
        cues.append(q)
    script = {"title": plan["title"], "lang": "ko", "voice": "qt-voice", "model": "drama-3", "temperature": 0.7,
              "leadIn": 0.3, "gap": 0.25, "tail": 4.2, "cues": cues}
    json.dump(script, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ─────────────────────────────── 4. 목소리 (교회 QT 목소리: GPT-SoVITS)

def sovits_up(api):
    try:
        urllib.request.urlopen(api + "/control", timeout=4)
        return True
    except urllib.error.HTTPError:
        return True      # 응답은 온다(400 등) = 켜져 있음
    except Exception:
        return False


def ensure_sovits():
    v = json.load(open(os.path.join(QT_HOME, "tts_config.json"), encoding="utf-8-sig"))
    api = v["api"].rstrip("/")
    if sovits_up(api):
        return
    log("  QT 음성 서버를 켭니다…")
    subprocess.Popen(["cmd", "/c", v["start_bat"]], creationflags=0x00000008 | 0x00000200, close_fds=True)   # DETACHED | NEW_GROUP
    for _ in range(60):
        time.sleep(5)
        if sovits_up(api):
            return
    raise RuntimeError("QT 음성 서버(GPT-SoVITS)가 5분 안에 켜지지 않았습니다.")


def autocut(proj):
    """녹음 앞뒤 무음과 0.35초 넘는 중간 무음을 찾아 script.json 의 cut 으로 적는다."""
    SR, W, TH = 44100, 441, -42.0
    cues_js = open(os.path.join(proj, "js", "cues.js"), encoding="utf-8").read()
    takes = dict(re.findall(r'"id":\s*"(\w+)"[^}]*?"take":\s*"(\w+)"', cues_js, re.S))
    sp = os.path.join(proj, "script.json")
    sj = json.load(open(sp, encoding="utf-8"))
    for c in sj["cues"]:
        tk = takes.get(c["id"])
        if not tk or (c.get("cut") or {}).get("take") == tk:
            continue
        a = array.array("h"); a.frombytes(open(os.path.join(proj, ".tts-cache", tk + ".pcm"), "rb").read())
        n = len(a) // W
        lv = []
        for i in range(n):
            s = a[i * W:(i + 1) * W]
            r = math.sqrt(sum(x * x for x in s) / W) / 32768
            lv.append(20 * math.log10(r) if r > 0 else -120)
        loud = [i for i, v in enumerate(lv) if v > TH]
        if not loud:
            continue
        first, last = loud[0] * 0.01, (loud[-1] + 1) * 0.01
        rg = []
        if first > 0.06:
            rg.append([0, round(first - 0.04, 2)])
        i = loud[0]
        while i <= loud[-1]:
            if lv[i] <= TH:
                j = i
                while j <= loud[-1] and lv[j] <= TH:
                    j += 1
                if (j - i) * 0.01 > 0.35:
                    rg.append([round(i * 0.01 + 0.14, 2), round(j * 0.01 - 0.14, 2)])
                i = j
            else:
                i += 1
        if n * 0.01 - last > 0.14:
            rg.append([round(last + 0.12, 2), round(len(a) / SR, 3)])
        c["cut"] = {"take": tk, "ranges": rg}
    json.dump(sj, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def make_voice(cfg, proj):
    ensure_sovits()
    port = str(cfg["bridge_port"])
    bridge = subprocess.Popen(["node", os.path.join(HERE, "sovits_bridge.mjs"), port], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    env = {"FISH_API_URL": f"http://127.0.0.1:{port}/v1/tts", "FISH_API_KEY": "local"}
    try:
        time.sleep(2)
        run(["node", os.path.join(SCRIPTS, "tts.mjs"), proj, "--approved"], env=env, timeout=1800)
        autocut(proj)
        out = run(["node", os.path.join(SCRIPTS, "tts.mjs"), proj], env=env, timeout=600)
    finally:
        bridge.terminate()
    m = re.search(r"video ([\d.]+)s", out)
    dur = float(m.group(1)) if m else 0
    if dur > 178:
        raise RuntimeError(f"영상 길이가 {dur:.0f}초 — 쇼츠 한도(3분)를 넘습니다. 계획의 내레이션을 줄여야 합니다.")
    return dur


# ─────────────────────────────── 5. 그림 (로컬 AI: ComfyUI · Flux)

def comfy_up(comfy):
    try:
        urllib.request.urlopen(comfy + "/queue", timeout=10)
        return True
    except Exception:
        return False


def ensure_comfy(cfg):
    """그림 서버가 꺼져 있으면 스스로 켠다(밤에 사람 없이 돌 때). 5분 안에 안 뜨면 멈춘다."""
    comfy = cfg["comfy"]
    if comfy_up(comfy):
        return
    bat = cfg.get("comfy_start_bat") or r"C:\ComfyUI\run_comfyui.bat"
    if not os.path.exists(bat):
        raise RuntimeError("그림 서버(ComfyUI)가 꺼져 있고 켜는 파일도 없습니다: " + bat)
    log("  그림 서버(ComfyUI)를 켭니다…")
    subprocess.Popen(["cmd", "/c", "start", "", "/min", bat], cwd=os.path.dirname(bat), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    for _ in range(60):
        time.sleep(5)
        if comfy_up(comfy):
            return
    raise RuntimeError("그림 서버(ComfyUI)를 켰지만 5분 안에 응답하지 않습니다. " + bat + " 를 직접 켜 보세요.")


def make_images(cfg, plan, proj, work):
    from PIL import Image, ImageFilter
    raw = os.path.join(work, "images"); os.makedirs(raw, exist_ok=True)
    dst = os.path.join(proj, "assets", "user"); os.makedirs(dst, exist_ok=True)
    comfy = cfg["comfy"]
    ensure_comfy(cfg)
    base = json.load(open(cfg["comfy_workflow"], encoding="utf-8"))
    assets = []
    for n, (name, im) in enumerate(plan["images"].items(), 1):
        png = os.path.join(raw, name + ".png")
        sig = hashlib.sha256((im["era"] + im["prompt"] + cfg["image_model"]).encode()).hexdigest()[:12]
        sigf = png + ".sig"
        if not (os.path.exists(png) and os.path.exists(sigf) and open(sigf).read() == sig):
            wf = json.loads(json.dumps(base))
            wf["3"]["inputs"]["text"] = ERA[im["era"]] + im["prompt"] + STYLE
            wf["5"]["inputs"]["width"], wf["5"]["inputs"]["height"] = cfg["image_size"]
            wf["6"]["inputs"]["seed"] = int(hashlib.sha256((plan["date"] + name).encode()).hexdigest()[:10], 16)
            wf["6"]["inputs"]["steps"] = cfg["image_steps"]
            wf["1"]["inputs"]["unet_name"] = cfg["image_model"]
            wf["9"]["inputs"]["filename_prefix"] = "qtmotion/" + plan["date"] + "_" + name
            if "dev" in cfg["image_model"]:
                wf["10"] = {"class_type": "FluxGuidance", "inputs": {"conditioning": ["3", 0], "guidance": 3.5}}
                wf["6"]["inputs"]["positive"] = ["10", 0]
            t0 = time.time()
            pid = http_json("POST", comfy + "/prompt", {"prompt": wf})["prompt_id"]
            while True:
                time.sleep(3)
                h = http_json("GET", f"{comfy}/history/{pid}")
                if pid in h:
                    if (h[pid].get("status") or {}).get("status_str") == "error":
                        raise RuntimeError(f"그림 '{name}' 생성 오류: " + json.dumps(h[pid]["status"], ensure_ascii=False)[:400])
                    if h[pid].get("outputs"):
                        break
                if time.time() - t0 > 3600:
                    raise RuntimeError(f"그림 '{name}' 이 1시간 안에 끝나지 않았습니다. 그림 서버를 확인해 주세요.")
            it = [i for o in h[pid]["outputs"].values() for i in o.get("images", [])][0]
            q = urllib.parse.urlencode({"filename": it["filename"], "subfolder": it.get("subfolder", ""), "type": it.get("type", "output")})
            open(png, "wb").write(urllib.request.urlopen(f"{comfy}/view?{q}", timeout=120).read())
            open(sigf, "w").write(sig)
            log(f"  그림 {n}/{len(plan['images'])} '{name}' {time.time() - t0:.0f}초")
        img = Image.open(png).convert("RGB")
        w, h = img.size
        img = img.crop((int(w * 0.03), 0, w, int(h * 0.97)))   # 구석에 생기는 글자 흉내 자국을 잘라 낸다
        img = img.resize((1080, 1920), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
        img.save(os.path.join(dst, name + ".jpg"), quality=93)
        assets.append({"file": f"assets/user/{name}.jpg", "source": "user", "note": f"교회 PC 로컬 AI(ComfyUI · Flux)로 이 영상을 위해 만든 그림, {plan['date']}"})
    json.dump({"assets": assets}, open(os.path.join(proj, "provenance.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ─────────────────────────────── 6. 굽기

def render(cfg, proj, out_mp4):
    chk = run(["node", os.path.join(SCRIPTS, "check.mjs"), proj], check=False)
    if "✖" in chk:
        log("  점검 경고:\n" + "\n".join(l for l in chk.splitlines() if "✖" in l)[:800])
    run([sys.executable, os.path.join(proj, "render.py"), proj, "--res", cfg["render_res"], "--fps", str(cfg["render_fps"]), "--out", out_mp4], timeout=6 * 3600)
    if not os.path.exists(out_mp4) or os.path.getsize(out_mp4) < 500_000:
        raise RuntimeError("굽기가 끝났는데 영상 파일이 없거나 너무 작습니다.")
    run([sys.executable, os.path.join(proj, "render.py"), proj, "--screenshot", "--gapframe", str(cfg["render_fps"] * 6), "--fps", str(cfg["render_fps"])], check=False, timeout=1800)


# ─────────────────────────────── 7. 홈페이지(교회 파일 저장소) · 유튜브

def web_copy(cfg, out_mp4):
    """홈페이지에서 바로 틀 수 있게 줄인 사본. 앞부분만 받아도 재생이 시작되게(faststart) 한다."""
    web = out_mp4[:-4] + "_web.mp4"
    if os.path.exists(web) and os.path.getmtime(web) >= os.path.getmtime(out_mp4) and os.path.getsize(web) > 200_000:
        return web
    br = cfg["web_bitrate"]
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", out_mp4, "-c:v", "libx264", "-preset", "medium", "-b:v", br, "-maxrate", br, "-bufsize", "2M",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", web], timeout=3600)
    return web


def upload_site(supa, cfg, path, date):
    """교회 파일 저장소에 올린다(관리자 로그인 토큰). 주소에 난수가 들어가 그날 전에는 밖에서 알 수 없다."""
    if not supa.token:
        supa.login()
    size = os.path.getsize(path)
    if size > 95 * 1024 * 1024:
        raise RuntimeError(f"홈페이지용 영상이 너무 큽니다({size // 1048576}MB, 한도 100MB). config.json 의 web_bitrate 를 낮추세요.")
    with open(path, "rb") as f:
        req = urllib.request.Request(cfg["file_store"].rstrip("/") + "/upload", data=f, method="POST", headers={
            "Authorization": f"Bearer {supa.token}", "x-folder": "qtmotion", "x-filename": f"qt_{date}.mp4",
            "Content-Type": "video/mp4", "Content-Length": str(size), "User-Agent": "qt-motion"})
        try:
            with urllib.request.urlopen(req, timeout=1800) as r:
                j = json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"저장소 올리기 실패({e.code}): {e.read().decode('utf-8', 'replace')[:300]}")
    if not j.get("url"):
        raise RuntimeError("저장소가 주소를 돌려주지 않았습니다: " + json.dumps(j, ensure_ascii=False)[:200])
    return j["url"]


def youtube_meta(cfg, plan, qt):
    d = dt.date.fromisoformat(plan["date"])
    title = f"[매일 QT] {d.month}월 {d.day}일 · {plan['scripture']} · {plan['title']}"[:95]
    script = " ".join(c["text"] for c in plan["cues"])
    desc = (f"{plan['title']}\n본문: {plan['scripture']}\n\n{script[:600]}\n\n"
            f"{cfg['church']} 매일 QT — 묵상 전문과 음성: {cfg['site']}\n\n"
            "이 영상의 그림과 목소리는 AI 로 만들었습니다.\n#매일QT #큐티 #말씀묵상 #" + cfg["church"])
    hh, mm = map(int, cfg["publish_time"].split(":"))
    when = dt.datetime(d.year, d.month, d.day, hh, mm, tzinfo=KST)
    return title, desc, when


# ─────────────────────────────── 한 번에 하나만 (그래픽카드를 나눠 쓸 수 없다)

LOCK = os.path.join(HOME, "auto.lock")


def pid_alive(pid):
    try:
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259
    except Exception:
        return False


def take_lock():
    """다른 제작이 돌고 있으면 False. 죽은 프로세스가 남긴 잠금은 치운다."""
    os.makedirs(HOME, exist_ok=True)
    try:
        pid = open(LOCK).read().strip()
        if pid and pid_alive(pid):
            return False
    except OSError:
        pass
    open(LOCK, "w").write(str(os.getpid()))
    return True


def drop_lock():
    try:
        if open(LOCK).read().strip() == str(os.getpid()):
            os.remove(LOCK)
    except OSError:
        pass


def auto(cfg, o):
    """예약(15분마다)이 부르는 모드.
    ① 대시보드 '영상 만들기' 요청(video_jobs: job_type=motion, status=queued)을 오래된 것부터 만든다.
    ② daily_time(기본 01:00)이 지났고 내일 것이 아직 없으면 만든다 — 원고가 아직 없으면 조용히 다음 번을 기다린다."""
    supa = Supa()
    while True:
        rows = supa.req("GET", "/rest/v1/video_jobs?select=id,sermon_date,settings&job_type=eq.motion&status=eq.queued&order=created_at.asc&limit=1")
        if not rows:
            break
        j = rows[0]
        got = supa.req("PATCH", f"/rest/v1/video_jobs?id=eq.{j['id']}&status=eq.queued",
                       {"status": "processing", "claimed_by": "church-pc-motion", "progress": "1% · 시작"}, "return=representation")
        if not got:
            continue      # 그사이 취소됨
        date = str(j["sermon_date"])[:10]
        log(f"요청 받음: {date}")
        if (j.get("settings") or {}).get("fresh"):
            work = os.path.join(HOME, "work", date)
            if os.path.isdir(work):   # 지우지 않고 이름만 바꿔 둔다
                os.rename(work, work + ".old-" + dt.datetime.now(KST).strftime("%m%d%H%M%S"))
        try:
            produce(cfg, o, date, supa, job_id=j["id"])
        except BaseException as e:
            if isinstance(e, KeyboardInterrupt):
                raise
            log(f"  {date} 요청 실패: {str(e)[:300]}")
    now = dt.datetime.now(KST)
    hh, mm = map(int, str(cfg.get("daily_time", "01:00")).split(":"))
    if (now.hour, now.minute) < (hh, mm):
        return
    date = (now.date() + dt.timedelta(days=int(cfg.get("days_ahead", 1)))).isoformat()
    work = os.path.join(HOME, "work", date)
    tried = os.path.join(work, f"auto_tried_{now.date().isoformat()}")
    if os.path.exists(os.path.join(work, "site.json")) or os.path.exists(tried):
        return
    try:
        fetch_qt(supa, cfg, date)
    except SystemExit:
        return            # 원고가 아직 없다 — 들어오면 다음 번에 만든다
    os.makedirs(work, exist_ok=True)
    open(tried, "w").write("1")       # 실패해도 같은 날 되풀이하지 않는다(다시 하려면 대시보드에서 요청)
    log(f"정기 제작: {date}")
    produce(cfg, o, date, supa)


def main():
    ap = argparse.ArgumentParser(description="매일 QT 모션 영상 자동 제작")
    ap.add_argument("--date"); ap.add_argument("--plan"); ap.add_argument("--until", choices=["plan", "voice", "images", "render", "site"])
    ap.add_argument("--youtube", action="store_true"); ap.add_argument("--no-youtube", action="store_true"); ap.add_argument("--no-link", action="store_true")
    ap.add_argument("--doctor", action="store_true"); ap.add_argument("--no-log", action="store_true"); ap.add_argument("--auto", action="store_true")
    o = ap.parse_args()
    cfg = load_cfg()
    if o.doctor:
        return doctor(cfg)
    if not take_lock():
        if not o.auto:
            log("다른 영상 제작이 돌고 있습니다. 끝난 뒤 다시 해 주세요.")
        return 0 if o.auto else 1
    try:
        if o.auto:
            return auto(cfg, o)
        return produce(cfg, o, None, Supa())
    finally:
        drop_lock()


def produce(cfg, o, date, supa, job_id=None):
    # 날짜를 주지 않으면 '내일' 것을 만든다: 13일 새벽 1시에 돌면 14일자 (config.json 의 days_ahead 로 바꿀 수 있다)
    date = date or o.date or (dt.datetime.now(KST).date() + dt.timedelta(days=int(cfg.get("days_ahead", 1)))).isoformat()
    work = os.path.join(HOME, "work", date); os.makedirs(work, exist_ok=True)
    proj = os.path.join(work, "project")
    out_mp4 = os.path.join(HOME, "out", f"qt_{date}.mp4"); os.makedirs(os.path.dirname(out_mp4), exist_ok=True)
    job = {"id": job_id}

    def progress(pct, msg, **extra):
        log(f"{pct}% · {msg}")
        if o.no_log:
            return
        try:
            body = {"progress": f"{pct}% · {msg}"}; body.update(extra)
            if job["id"] is None:
                body.update({"sermon_date": date, "job_type": "motion", "status": "processing", "claimed_by": "church-pc-motion",
                             "settings": {"orientation": "portrait", "engine": "motion"}})
                job["id"] = supa.req("POST", "/rest/v1/video_jobs", body, "return=representation")[0]["id"]
            else:
                supa.req("PATCH", f"/rest/v1/video_jobs?id=eq.{job['id']}", body, "return=minimal")
        except Exception as e:
            log(f"  (진행 기록 실패: {e})")

    try:
        progress(2, "QT 원고 읽는 중")
        qt = fetch_qt(supa, cfg, date)
        pp = os.path.join(work, "plan.json")
        if o.plan:
            plan = json.load(open(o.plan, encoding="utf-8")); plan["date"] = date
            errs = validate_plan(plan, cfg)
            if errs:
                raise SystemExit("계획 파일에 문제가 있습니다:\n  " + "\n  ".join(errs))
        elif os.path.exists(pp):
            plan = json.load(open(pp, encoding="utf-8"))
        else:
            progress(5, "Claude 가 영상 계획을 쓰는 중")
            plan = make_plan(cfg, qt, date)
        json.dump(plan, open(pp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        if o.until == "plan":
            return progress(100, "계획까지 완료", status="done")

        progress(12, "영상 틀 준비")
        make_project(cfg, plan, proj)
        progress(15, "QT 목소리로 녹음 중")
        dur = make_voice(cfg, proj)
        if o.until == "voice":
            return progress(100, f"녹음까지 완료({dur:.0f}초)", status="done")

        progress(25, f"로컬 AI 그림 {len(plan['images'])}장 그리는 중")
        make_images(cfg, plan, proj, work)
        if o.until == "images":
            return progress(100, "그림까지 완료", status="done")

        rsig = hashlib.sha1(open(pp, "rb").read()).hexdigest(); rs = os.path.join(work, "render.sig")
        if os.path.exists(out_mp4) and os.path.exists(rs) and open(rs).read().strip() == rsig:
            log("  이미 구운 영상이 있어 굽기를 건너뜁니다.")
        else:
            progress(75, f"영상 굽는 중({dur:.0f}초 분량)")
            render(cfg, proj, out_mp4)
            open(rs, "w").write(rsig)
        if o.until == "render":
            return progress(100, "영상 완성(올리지 않음)", status="done")

        sj = os.path.join(work, "site.json")
        if os.path.exists(sj):
            site = json.load(open(sj, encoding="utf-8"))
        else:
            progress(90, "홈페이지용으로 줄여 교회 파일 저장소에 올리는 중")
            web = web_copy(cfg, out_mp4)
            site = {"url": upload_site(supa, cfg, web, date), "bytes": os.path.getsize(web)}
            json.dump(site, open(sj, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        store = cfg["file_store"].rstrip("/") + "/f/"
        if not o.no_link:
            progress(95, "홈페이지 QT 글에 영상 주소 넣는 중")
            cur = (qt.get("media_url") or "").strip()
            if not cur or cur.startswith(store) or "youtu" in cur:   # 사람이 넣어 둔 다른 주소는 건드리지 않는다
                supa.req("PATCH", f"/rest/v1/sermons?id=eq.{qt['id']}", {"media_url": site["url"]}, "return=minimal")
            else:
                log("  QT 글에 다른 영상 주소가 이미 있어 바꾸지 않았습니다.")
        note = ""
        if (o.youtube or cfg.get("youtube")) and not o.no_youtube and o.until != "site":
            import youtube
            yj = os.path.join(work, "youtube.json")
            if os.path.exists(yj):
                yt = json.load(open(yj, encoding="utf-8"))
            else:
                progress(97, "유튜브에 올리는 중")
                title, desc, when = youtube_meta(cfg, plan, qt)
                yt = youtube.upload(out_mp4, title, desc, publish_at=when, privacy=cfg["youtube_privacy"],
                                    category=cfg["youtube_category"], playlist=cfg.get("youtube_playlist") or None)
                json.dump(yt, open(yj, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            note = " · 유튜브 " + yt.get("state", "")
        progress(100, "완료 · 홈페이지에 올림" + note, status="done", video_url=site["url"])
    except SystemExit as e:
        if e.code not in (None, 0):
            progress(0, "멈춤", status="error", error=str(e.code)[:900])
        raise
    except Exception as e:
        progress(0, "실패", status="error", error=str(e)[:900])
        raise


def doctor(cfg):
    ok = True
    def line(good, what, how=""):
        nonlocal ok
        ok = ok and good
        print(("  ✓ " if good else "  ✗ ") + what + ("" if good else f"  →  {how}"))
    print("매일 QT 모션 영상 — 준비 상태")
    line(os.path.exists(os.path.join(SCRIPTS, "node_modules")), "영상 도구(script-to-motion)", "tools\\qt_motion\\설치.bat 실행")
    line(shutil.which("node") is not None, "Node.js"); line(shutil.which("ffmpeg") is not None, "ffmpeg")
    line(os.path.exists(os.path.join(QT_HOME, "worker_config.json")), "관리자 로그인 설정(worker_config.json)")
    line(os.path.exists(os.path.join(QT_HOME, "tts_config.json")), "QT 목소리 설정(tts_config.json)")
    try:
        urllib.request.urlopen(cfg["comfy"] + "/queue", timeout=5); good = True
    except Exception:
        good = False
    line(good or os.path.exists(cfg.get("comfy_start_bat") or r"C:\ComfyUI\run_comfyui.bat"), "그림 서버(ComfyUI)" + ("" if good else " — 지금은 꺼져 있음(만들 때 스스로 켠다)"), r"C:\ComfyUI\run_comfyui.bat 이 있어야 함")
    line(os.path.exists(os.path.join(r"C:\ComfyUI\models\diffusion_models", cfg["image_model"])), "그림 모델 " + cfg["image_model"])
    try:
        sys.path.insert(0, os.path.dirname(HERE)); import ai_worker; ai_worker.find_claude(); good = True
    except BaseException:
        good = False
    line(good, "Claude CLI", "목회AI_로그인.bat 로 로그인")
    try:
        urllib.request.urlopen(urllib.request.Request(cfg["file_store"].rstrip("/") + "/f/_", headers={"User-Agent": "qt-motion"}), timeout=10); good = True
    except urllib.error.HTTPError:
        good = True      # 404 라도 저장소가 대답한 것
    except Exception:
        good = False
    line(good, "교회 파일 저장소(영상 올리는 곳)", "인터넷 연결 확인")
    if cfg.get("youtube"):
        import youtube
        line(os.path.exists(youtube.CLIENT), "유튜브 앱 열쇠(client_secret.json)", "README 의 '유튜브 연결' 1~3번")
        line(os.path.exists(youtube.TOKEN), "유튜브 로그인(youtube_token.json)", "유튜브_연결.bat 실행")
    print("모두 준비됨" if ok else "위 ✗ 항목을 먼저 해결해 주세요.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
