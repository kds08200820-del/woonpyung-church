#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
운평장로교회 — 주일 자료 일괄 생성 워커

설교 매니저의 "📦 주일 자료 일괄 생성" 버튼이 worship_jobs 에 작업을 넣으면,
이 워커가 가져가 **Claude Code CLI** 로 예배 자료를 만들고 홈페이지에 올립니다.

  방송실 PPT·큐시트 / 중등부 교재·교사용  →  자료실(resources)
  주보·예배 순서                          →  bulletins  (published=false, 검토 후 게시)
  설교 요약                               →  sermons.summary

Claude Code 구독을 그대로 쓰므로 API 키가 필요 없습니다.
(이미 로그인된 claude CLI 를 호출합니다 — `claude setup-token` 같은 것도 불필요)

환경변수:
  SUPABASE_URL               (기본값 내장)
  SUPABASE_SERVICE_ROLE_KEY  Supabase → Project Settings → API → service_role (필수)
  WORSHIP_WORKER_NAME        워커 이름 (기본 home-pc). 집/교회 PC를 구분.
  CLAUDE_BIN                 claude 실행 파일 경로 (기본: 자동 탐지)
  WORSHIP_MODEL              모델 (기본 sonnet)

사용법:
  python worship_worker.py --once     # 대기 작업 1건만 처리하고 종료
  python worship_worker.py --watch    # 계속 대기하며 처리 (기본 20초 간격)
  python worship_worker.py --dry-run --date 2026-08-02   # 업로드 없이 생성만 시험

── 안전 설계 ────────────────────────────────────────────────
Claude Code 는 저장소가 아니라 **임시 작업 폴더**에서 실행됩니다.
작업 폴더에 스킬을 복사해 넣고 cwd 를 거기로 두므로, 생성 도중
저장소 파일이 수정될 수 없습니다. (pptx/docx 스킬이 python 스크립트를
돌려야 해서 도구 권한을 열어두기 때문에 이 격리가 필요합니다)
"""
import os
import sys
import re
import json
import time
import shutil
import argparse
import subprocess
import tempfile
import threading
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, date

# 윈도우 콘솔 기본 인코딩(cp949)은 ✓ 같은 기호를 못 써서 print 에서 죽는다.
# 화면 출력 때문에 작업이 실패하는 일이 없도록, 못 쓰는 문자는 대체하고 넘어간다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except Exception:
        pass


def _env(name, default=""):
    """환경변수를 읽되, 없으면 윈도우 사용자 환경변수(레지스트리)까지 확인한다.

    setx 로 키를 넣어도 그 전에 열려 있던 창·프로그램에는 반영되지 않아
    "환경변수를 설정하세요"가 뜨는 일이 잦다. 이 우회로 그 혼선을 없앤다.
    """
    v = os.environ.get(name)
    if v:
        return v
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                return winreg.QueryValueEx(k, name)[0] or default
        except Exception:
            pass
    return default


SUPABASE_URL = _env("SUPABASE_URL", "https://cetacttsdwzxjzkyozgd.supabase.co").rstrip("/")
SERVICE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")
WORKER = os.environ.get("WORSHIP_WORKER_NAME", "home-pc")
MODEL = os.environ.get("WORSHIP_MODEL", "sonnet")

# 파일은 홈페이지의 다른 자료와 같은 곳(Cloudflare R2)에 둔다.
# Worker 가 사람 로그인을 요구하므로, 무인 업로드 전용 키를 함께 보낸다.
R2_URL = _env("R2_UPLOAD_URL", "https://church-files.kds08200820.workers.dev").rstrip("/")
R2_KEY = _env("WORKER_UPLOAD_KEY")

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS_SRC = os.path.join(REPO_DIR, ".claude", "skills")

POLL_SEC = 20
# 산출물 6종 생성 실측: 룻기 4장 설교(짧은 원고) 기준 32분.
# 원고가 길면 더 걸리므로 여유를 두어 75분.
CLAUDE_TIMEOUT = 75 * 60

# 산출물 정의: (키, 사람이 읽는 이름, 자료실 분류, 기대 확장자)
# 분류는 js/resources.js 의 슬러그와 반드시 같아야 한다 — 다르면 자료실 화면에 안 보인다.
OUTPUT_SPEC = {
    "ppt":      ("방송실용 PPT",     "worship-sunday", ".pptx"),
    "cuesheet": ("방송 큐시트",      "worship-sunday", ".docx"),
    "youth":    ("중등부 교재",      "middle",         ".docx"),
    "teacher":  ("중등부 교사용",    "middle",         ".docx"),
}


# ── Claude 실행 파일 찾기 ────────────────────────────────────

def find_claude():
    env = os.environ.get("CLAUDE_BIN")
    if env and os.path.exists(env):
        return env
    home = os.path.expanduser("~")
    for c in (os.path.join(home, ".local", "bin", "claude.exe"),
              os.path.join(home, ".local", "bin", "claude"),
              os.path.join(home, ".claude", "local", "claude")):
        if os.path.exists(c):
            return c
    found = shutil.which("claude")
    if found:
        return found
    raise SystemExit("claude CLI 를 찾을 수 없습니다. CLAUDE_BIN 환경변수로 경로를 지정하세요.")


# ── Supabase REST ────────────────────────────────────────────

def _req(method, url, data=None, headers=None, timeout=60):
    h = dict(headers or {})
    # urllib 기본 신원(Python-urllib/…)은 Cloudflare 봇 검사에 걸려 403(오류 1010)이 난다.
    # 우리 Worker 에 우리가 접속하는 것이므로 평범한 신원을 붙여 보낸다.
    h.setdefault("User-Agent", "WoonpyungWorshipWorker/1.0 (+https://k-logos.com)")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:                       # 네트워크 단절 등
        return 0, str(e).encode()


def _headers(extra=None):
    h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def rest(method, path, body=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    st, raw = _req(method, url, data, _headers({"Prefer": prefer} if prefer else None))
    if st not in (200, 201, 204):
        raise RuntimeError(f"{method} {path} 실패({st}): {raw[:300].decode('utf-8', 'replace')}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def rpc(fn, payload):
    return rest("POST", f"rpc/{fn}", payload)


def r2_upload(filename, data, content_type, folder="worship"):
    """Cloudflare R2 로 올리고 공개 URL 을 돌려준다.

    홈페이지의 다른 자료들과 같은 저장소를 쓴다. Worker 가 최종 파일명을
    영문 안전키로 다시 지으므로, 한글 원본 이름은 resources.title 에 남긴다.
    """
    if not R2_KEY:
        raise RuntimeError(
            "WORKER_UPLOAD_KEY 환경변수가 없습니다. "
            "Cloudflare Worker 에 넣은 것과 같은 값을 PC 에도 설정하세요."
        )
    st, raw = _req("POST", f"{R2_URL}/upload", data=data,
                   headers={"Content-Type": content_type,
                            "x-filename": urllib.parse.quote(filename),
                            "x-folder": folder,
                            "x-worker-key": R2_KEY}, timeout=180)
    body = raw.decode("utf-8", "replace")
    if st != 200:
        if st == 401:
            raise RuntimeError("R2 업로드 거부(401) — WORKER_UPLOAD_KEY 가 Cloudflare 쪽과 다릅니다.")
        raise RuntimeError(f"R2 업로드 실패({st}) {filename}: {body[:200]}")
    try:
        out = json.loads(body)
    except Exception:
        raise RuntimeError(f"R2 응답을 읽지 못했습니다: {body[:200]}")
    if not out.get("url"):
        raise RuntimeError(f"R2 응답에 url 이 없습니다: {body[:200]}")
    return out["url"], out.get("key")


# ── 작업 큐 ──────────────────────────────────────────────────

def claim_job():
    rows = rpc("claim_worship_job", {"p_worker": WORKER})
    return rows[0] if rows else None


def set_progress(job_id, text, steps=None):
    print(f"   · {text}", flush=True)
    if not job_id:          # --date 단독 시험은 큐를 거치지 않는다
        return
    body = {"progress": text}
    if steps is not None:
        body["steps"] = steps
    try:
        rest("PATCH", f"worship_jobs?id=eq.{job_id}", body)
    except Exception as e:
        print(f"     (진행상황 갱신 실패: {e})", file=sys.stderr)


def set_steps(job_id, steps):
    """항목별 상태만 갱신 — 화면의 체크 표시에 쓰인다."""
    if not job_id:
        return
    try:
        rest("PATCH", f"worship_jobs?id=eq.{job_id}", {"steps": steps})
    except Exception:
        pass            # 진행 표시가 실패해도 작업 자체는 계속되어야 한다


class OutputWatcher(threading.Thread):
    """생성 중에 outputs/ 폴더를 지켜보며 완성된 산출물을 표시한다.

    Claude 는 6가지를 한 번에 만드는 게 아니라 하나씩 써 나간다.
    파일이 나타나는 순서를 그대로 읽으면 목사님 화면에 체크가 하나씩 켜진다.
    """

    def __init__(self, job_id, outdir, wanted, interval=15):
        super().__init__(daemon=True)
        self.job_id, self.outdir, self.wanted = job_id, outdir, wanted
        self.interval = interval
        self._stop = threading.Event()
        self.steps = {k: "wait" for k in wanted}

    def snapshot(self):
        s = {}
        for k in self.wanted:
            fname = FILE_MAP.get(k) or EXTRA_FILE.get(k)
            done = bool(fname) and os.path.exists(os.path.join(self.outdir, fname))
            s[k] = "done" if done else "wait"
        # 아직 안 끝난 것 중 첫 번째를 '만드는 중'으로 보여 준다.
        for k in self.wanted:
            if s[k] == "wait":
                s[k] = "working"
                break
        return s

    def run(self):
        while not self._stop.wait(self.interval):
            try:
                s = self.snapshot()
                if s != self.steps:
                    self.steps = s
                    set_steps(self.job_id, s)
            except Exception:
                pass

    def stop(self):
        self._stop.set()


def finish_job(job_id, status, result=None, error=None):
    body = {"status": status, "progress": None}
    if result is not None:
        body["result"] = result
    if error:
        body["error"] = error[:2000]
    rest("PATCH", f"worship_jobs?id=eq.{job_id}", body)


# ── 설교 데이터 ──────────────────────────────────────────────

def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", "\n", str(s), flags=re.I)
    s = re.sub(r"</(p|div|li|h[1-6])>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def fetch_sermon(sermon_date):
    """해당 날짜의 주일 설교를 가져온다. 주일 예배를 우선하되 없으면 그 날짜의 첫 건."""
    cols = "id,sermon_date,service,title,scripture,preacher,content,bible_text,series,summary,hymns,gyodok"
    rows = rest("GET", f"sermons?select={cols}&sermon_date=eq.{sermon_date}&order=created_at.asc")
    if not rows:
        raise RuntimeError(f"{sermon_date} 설교를 찾을 수 없습니다. 설교 매니저에 먼저 등록해 주세요.")
    for r in rows:
        if r.get("service") and "주일" in r["service"]:
            return r
    return rows[0]


# ── Claude Code 호출 ─────────────────────────────────────────

def prepare_workdir(sermon):
    """작업 폴더를 만들고 스킬과 설교 원고를 넣는다."""
    d = os.path.join(tempfile.gettempdir(), f"worship_{sermon['sermon_date']}_{int(time.time())}")
    os.makedirs(os.path.join(d, "outputs"), exist_ok=True)

    # 스킬을 작업 폴더로 복사 → cwd 를 여기로 두어 저장소를 건드리지 못하게 한다
    if not os.path.isdir(SKILLS_SRC):
        raise RuntimeError(f"스킬 폴더가 없습니다: {SKILLS_SRC}")
    shutil.copytree(SKILLS_SRC, os.path.join(d, ".claude", "skills"))

    manuscript = strip_html(sermon.get("content"))
    if not manuscript:
        raise RuntimeError("설교 원고(content)가 비어 있습니다. 원고를 먼저 입력해 주세요.")

    lines = [
        f"# {sermon.get('title') or '(제목 없음)'}",
        "",
        f"- 예배: {sermon.get('service') or '주일 낮 예배'}",
        f"- 일자: {sermon.get('sermon_date')}",
        f"- 본문: {sermon.get('scripture') or '(미기재)'}",
        f"- 설교자: {sermon.get('preacher') or '김동석 목사'}",
    ]
    if sermon.get("series"):
        lines.append(f"- 시리즈: {sermon['series']}")
    if sermon.get("hymns"):
        lines.append(f"- 기존 찬송 지정: {sermon['hymns']}")
    if sermon.get("gyodok"):
        lines.append(f"- 교독문: {sermon['gyodok']}")
    lines += ["", "## 설교 원고", "", manuscript]
    if sermon.get("bible_text"):
        lines += ["", "## 성경 본문 전문 (개역개정)", "", strip_html(sermon["bible_text"])]

    with open(os.path.join(d, "설교원고.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return d


def build_prompt(sermon, outputs):
    want = [OUTPUT_SPEC[k][0] for k in outputs if k in OUTPUT_SPEC]
    extra = []
    if "bulletin" in outputs:
        extra.append("- 예배 순서와 주보 초안 (기도문·찬송 선곡 포함)")
    if "summary" in outputs:
        extra.append("- 설교 요약 (주보·홈페이지 게시용, 공백 포함 400자 내외)")

    return f"""[무인실행]

/worship-prep-master

## 상황

운평장로교회 주일 예배 자료를 무인으로 일괄 생성한다.
사용자에게 확인을 구하지 말고 끝까지 진행하라. 승인 게이트는 모두 생략한다.

설교 원고는 이 폴더의 `설교원고.md` 에 있다. 먼저 읽어라.

- 일자: {sermon.get('sermon_date')}
- 제목: {sermon.get('title')}
- 본문: {sermon.get('scripture')}

## 만들 것

{chr(10).join('- ' + w for w in want)}
{chr(10).join(extra)}

## 저장 규칙 (반드시 지킬 것)

파일은 **반드시 `outputs/` 폴더 안에** 아래 이름 그대로 저장하라.
이름이 다르면 홈페이지 업로드가 실패한다.

{chr(10).join('- `outputs/' + (FILE_MAP.get(k) or EXTRA_FILE.get(k)) + '`'
              for k in outputs if FILE_MAP.get(k) or EXTRA_FILE.get(k))}

**위 목록은 하나도 빠뜨리면 안 된다.** PPT 를 만들었으면 큐시트도 반드시
함께 만들어라 — 둘은 같은 슬라이드 구성의 두 표현이라 짝이 맞아야 한다.
마지막에 `outputs/` 폴더를 실제로 확인해 목록의 파일이 모두 있는지 점검하고,
빠진 것이 있으면 그 자리에서 마저 만들어라.

`주보.json` 형식 (예배 순서·찬송·기도문을 담는다):

```json
{{
  "worship_order": [{{"label": "예배로의 부름", "detail": "시편 100:1-2"}}],
  "hymns": "1,305,391",
  "prayers": {{"대표기도": "...", "중보기도": "...", "축도": "..."}},
  "notes": "확인이 필요한 사항"
}}
```

`설교요약.txt` 는 다른 설명 없이 요약문 본문만 담는다.

## 원칙

- 찬송가 장번호가 확실하지 않으면 **지어내지 마라.** `notes` 에 "장번호 재확인 요망"으로 남겨라.
- 성경 구절은 제공된 원고·본문에 있는 것만 인용하라.
- 판단이 필요한 곳은 합리적 기본값을 택하고, 무엇을 가정했는지 산출물에 명시하라.
- 이 폴더 밖의 파일을 수정하지 마라.

마지막에 만든 파일 목록만 간단히 보고하라."""


def run_claude(prompt, workdir):
    args = [
        find_claude(), "-p",
        "--output-format", "json",
        "--model", MODEL,
        "--add-dir", workdir,
        # --safe-mode 는 쓰지 않는다: 스킬이 함께 꺼져 worship-prep-master 를 못 쓴다.
        # pptx/docx 스킬이 python 스크립트를 실행해야 하므로 승인 대기가 없어야 한다.
        # cwd 가 임시 작업 폴더라 저장소에는 영향이 없다.
        "--permission-mode", "bypassPermissions",
        "--no-session-persistence",
    ]
    p = subprocess.run(args, input=prompt.encode("utf-8"),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       cwd=workdir, timeout=CLAUDE_TIMEOUT)
    out = p.stdout.decode("utf-8", "replace").strip()
    err = p.stderr.decode("utf-8", "replace").strip()
    if not out:
        raise RuntimeError(f"claude 응답 없음 (exit={p.returncode}) {err[:400]}")
    try:
        obj = json.loads(out)
    except Exception:
        return out[:4000]
    if obj.get("is_error"):
        raise RuntimeError(f"claude 오류: {str(obj.get('result'))[:400]}")
    return str(obj.get("result", ""))


# ── 산출물 수집·업로드 ───────────────────────────────────────

FILE_MAP = {
    "ppt":      "방송실용_PPT.pptx",
    "cuesheet": "방송실용_큐시트.docx",
    "youth":    "중등부_교재.docx",
    "teacher":  "중등부_교사용.docx",
}

# 자료실에 올리지 않고 주보·설교 요약으로 들어가는 것들.
# 진행 상황 표시에는 이것도 함께 세어야 6가지가 다 보인다.
EXTRA_FILE = {
    "bulletin": "주보.json",
    "summary":  "설교요약.txt",
}

CONTENT_TYPE = {
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def upload_outputs(job, sermon, outdir, wanted, on_done=None):
    made = []
    for key in wanted:
        if key not in FILE_MAP:
            continue
        fname = FILE_MAP[key]
        path = os.path.join(outdir, fname)
        if not os.path.exists(path):
            print(f"     · 없음(건너뜀): {fname}", file=sys.stderr)
            continue

        label, category, _ = OUTPUT_SPEC[key]
        with open(path, "rb") as f:
            data = f.read()
        ext = os.path.splitext(fname)[1].lower()
        url, r2key = r2_upload(fname, data, CONTENT_TYPE.get(ext, "application/octet-stream"))

        # 자료실은 path 에 든 값을 그대로 링크로 쓴다(기존 R2 자료들과 같은 형식).
        title = f"{sermon['sermon_date']} {label} — {sermon.get('title') or ''}".strip()
        row = rest("POST", "resources",
                   {"category": category, "title": title, "path": url, "size": len(data)},
                   prefer="return=representation")
        made.append({"kind": key, "title": title, "path": url, "r2_key": r2key,
                     "size": len(data),
                     "resource_id": (row[0]["id"] if row else None)})
        print(f"     · 올림 [OK] {label} ({len(data)//1024} KB)")
        if on_done:
            try:
                on_done(key)
            except Exception:
                pass        # 화면 표시 실패가 업로드를 막아서는 안 된다
    return made


def save_bulletin(sermon, outdir):
    path = os.path.join(outdir, "주보.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    # 이미 있으면 갱신, 없으면 생성. published 는 건드리지 않는다(검토 후 사람이 게시).
    exist = rest("GET", f"bulletins?select=id&bdate=eq.{sermon['sermon_date']}")
    body = {"bdate": sermon["sermon_date"], "title": sermon.get("title"),
            "scripture": sermon.get("scripture"), "preacher": sermon.get("preacher"),
            "data": data}
    if exist:
        rest("PATCH", f"bulletins?id=eq.{exist[0]['id']}", body)
        print("     · 주보 갱신 ✓ (게시 전 상태 유지)")
    else:
        body["published"] = False
        rest("POST", "bulletins", body)
        print("     · 주보 생성 ✓ (published=false — 검토 후 게시하세요)")
    return {"kind": "bulletin", "title": f"{sermon['sermon_date']} 주보"}


def save_summary(sermon, outdir):
    path = os.path.join(outdir, "설교요약.txt")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        return None
    rest("PATCH", f"sermons?id=eq.{sermon['id']}", {"summary": text})
    print(f"     · 설교 요약 저장 ✓ ({len(text)}자)")
    return {"kind": "summary", "title": "설교 요약", "chars": len(text)}


# ── 작업 처리 ────────────────────────────────────────────────

def process(job, dry_run=False):
    jid = job["id"]
    sdate = job["sermon_date"]
    wanted = job.get("outputs") or list(OUTPUT_SPEC.keys())
    print(f"\n▶ 작업 #{jid}  {sdate}  ({', '.join(wanted)})")

    set_progress(jid, "설교 원고 불러오는 중")
    sermon = fetch_sermon(sdate)
    print(f"   설교: {sermon.get('title')} / {sermon.get('scripture')}")

    set_progress(jid, "작업 폴더 준비 중")
    workdir = prepare_workdir(sermon)
    outdir = os.path.join(workdir, "outputs")

    set_progress(jid, "예배 자료 생성 중 (수 분 소요)",
                 steps={k: "wait" for k in wanted})
    started = time.time()
    # 생성이 오래 걸리므로 그동안 완성된 산출물을 화면에 하나씩 알려 준다.
    watcher = OutputWatcher(jid, outdir, wanted)
    watcher.start()
    try:
        report = run_claude(build_prompt(sermon, wanted), workdir)
    finally:
        watcher.stop()
    mins = (time.time() - started) / 60
    print(f"   생성 완료 ({mins:.1f}분)")
    steps = {k: ("done" if os.path.exists(os.path.join(
        outdir, FILE_MAP.get(k) or EXTRA_FILE.get(k) or "")) else "fail")
        for k in wanted}
    set_steps(jid, steps)

    if dry_run:
        print(f"   [모의실행] 업로드 생략. 결과 폴더: {outdir}")
        for f in sorted(os.listdir(outdir)):
            print(f"     - {f}")
        return {"dry_run": True, "outdir": outdir, "report": report[:1000]}

    set_progress(jid, "자료실 업로드 중")
    made = upload_outputs(job, sermon, outdir, wanted, on_done=lambda k: (
        steps.update({k: "up"}), set_steps(jid, steps)))

    if "bulletin" in wanted:
        set_progress(jid, "주보 저장 중")
        r = save_bulletin(sermon, outdir)
        if r:
            made.append(r)
        steps["bulletin"] = "up" if r else "fail"
        set_steps(jid, steps)

    if "summary" in wanted:
        set_progress(jid, "설교 요약 저장 중")
        r = save_summary(sermon, outdir)
        if r:
            made.append(r)
        steps["summary"] = "up" if r else "fail"
        set_steps(jid, steps)

    # 못 만든 것이 있으면 조용히 넘기지 않는다. 예전에는 파일이 없어도
    # 그냥 건너뛰고 '완료'로 끝나서, 큐시트가 빠진 것을 아무도 몰랐다.
    missing = [k for k in wanted if steps.get(k) not in ("up", "done")]
    if missing:
        names = [OUTPUT_SPEC[k][0] if k in OUTPUT_SPEC else k for k in missing]
        print(f"   ⚠ 만들어지지 않은 항목: {', '.join(names)}", file=sys.stderr)

    shutil.rmtree(workdir, ignore_errors=True)
    return {"items": made, "minutes": round(mins, 1),
            "missing": missing,
            "finished_at": datetime.now().isoformat(timespec="seconds")}


def run_once(dry_run=False):
    job = claim_job()
    if not job:
        return False
    try:
        result = process(job, dry_run)
        finish_job(job["id"], "done", result=result)
        print(f"✅ 작업 #{job['id']} 완료")
    except subprocess.TimeoutExpired:
        finish_job(job["id"], "error", error=f"생성 시간 초과 ({CLAUDE_TIMEOUT//60}분)")
        print(f"❌ 작업 #{job['id']} 시간 초과", file=sys.stderr)
    except Exception as e:
        finish_job(job["id"], "error", error=str(e))
        print(f"❌ 작업 #{job['id']} 실패: {e}", file=sys.stderr)
    return True


def main():
    ap = argparse.ArgumentParser(description="운평장로교회 주일 자료 일괄 생성 워커")
    ap.add_argument("--once", action="store_true", help="대기 작업 1건만 처리하고 종료")
    ap.add_argument("--watch", action="store_true", help="계속 대기하며 처리")
    ap.add_argument("--dry-run", action="store_true", help="업로드하지 않고 생성만 확인")
    ap.add_argument("--date", help="--dry-run 과 함께: 이 날짜 설교로 직접 시험")
    a = ap.parse_args()

    if not SERVICE_KEY:
        raise SystemExit("환경변수 SUPABASE_SERVICE_ROLE_KEY 를 설정하세요.")

    # 업로드 키는 여기서 확인한다. 없는 채로 돌리면 30~50분 생성한 뒤에야
    # 업로드 단계에서 실패해 그 시간을 통째로 버리게 된다.
    if not R2_KEY and not a.dry_run:
        raise SystemExit(
            "환경변수 WORKER_UPLOAD_KEY 를 설정하세요.\n"
            "  Cloudflare Worker 의 Secret 과 같은 값이어야 합니다.\n"
            "  (생성만 시험하려면 --dry-run 을 쓰세요)"
        )

    print(f"워커 '{WORKER}' / 모델 {MODEL} / claude {find_claude()}")
    print(f"업로드 → {R2_URL}  (Cloudflare R2)")

    if a.date:                      # 큐를 거치지 않는 단독 시험
        fake = {"id": 0, "sermon_date": a.date,
                "outputs": list(OUTPUT_SPEC.keys()) + ["bulletin", "summary"]}
        try:
            r = process(fake, dry_run=True)
            print(json.dumps(r, ensure_ascii=False, indent=2)[:2000])
        except Exception as e:
            raise SystemExit(f"실패: {e}")
        return

    if a.watch:
        print(f"대기 중… ({POLL_SEC}초 간격, Ctrl+C 로 종료)")
        while True:
            try:
                if not run_once(a.dry_run):
                    time.sleep(POLL_SEC)
            except KeyboardInterrupt:
                print("\n종료합니다.")
                return
            except Exception as e:
                print(f"루프 오류: {e}", file=sys.stderr)
                time.sleep(POLL_SEC)
    else:
        if not run_once(a.dry_run):
            print("대기 중인 작업이 없습니다.")


if __name__ == "__main__":
    main()
