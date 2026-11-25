# -*- coding: utf-8 -*-
"""교회 PC 워커의 '살아 있음' 기록 (2026-11-25)

워커가 돌고 있는 동안 5분에 한 번 church_settings 의 'worker_<이름>' 줄에 마지막 확인 시각을 남긴다.
홈페이지 목회행정 대시보드(「해야 할 일」)와 관리자 푸시(apps-script/worker-health-push.gs)가 이 시각을 보고
오래 멈춘 워커를 알린다. (카카오톡 워커는 예전부터 'kakao_worker' 줄에 같은 일을 하고 있다)

    import worker_heartbeat
    worker_heartbeat.beat("ai")            # 반복문 안에서 부르면 된다 — 5분이 안 됐으면 아무것도 하지 않는다
    worker_heartbeat.beat("ai", force=True, state="stopped")   # 끝날 때

필요한 환경변수: SUPABASE_URL(없으면 교회 프로젝트) · SUPABASE_SERVICE_ROLE_KEY. 실패해도 워커는 멈추지 않는다.
남기는 것: 워커 이름 · PC 이름(AI_WORKER_NAME 등) · 시각 · 상태 글자. 교인 자료는 남기지 않는다.
"""
import json
import os
import socket
import time
import urllib.request
from datetime import datetime, timezone

EVERY_SEC = 300
_last = {}
_off = False


def _env(name, default=""):
    return (os.environ.get(name) or default).strip()


def beat(name, force=False, state="running", host=None, now=None):
    """마지막 확인 시각을 남긴다. 남겼으면 True."""
    global _off
    if _off:
        return False
    t = time.time() if now is None else now
    if not force and t - _last.get(name, 0) < EVERY_SEC:
        return False
    _last[name] = t
    url = _env("SUPABASE_URL", "https://cetacttsdwzxjzkyozgd.supabase.co").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        return False
    iso = datetime.fromtimestamp(t, timezone.utc).isoformat()
    who = host or _env("AI_WORKER_NAME") or _env("WORSHIP_WORKER_NAME") or _env("KAKAO_WORKER_NAME") or socket.gethostname()
    body = json.dumps({"key": "worker_" + name, "data": {"worker": name, "host": who, "last_seen": iso, "state": state},
                       "updated_at": iso}).encode("utf-8")
    req = urllib.request.Request(url + "/rest/v1/church_settings?on_conflict=key", data=body, method="POST", headers={
        "apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:200]
        if "PGRST205" in msg or "42P01" in msg or "does not exist" in msg:
            _off = True          # church_settings 표가 없는 DB — 다시 묻지 않는다
        return False
    except Exception:
        return False
