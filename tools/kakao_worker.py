# -*- coding: utf-8 -*-
r"""
카카오톡 QT 예약 발송 워커

홈페이지 설교 매니저의 "⏰ 예약 발송" 버튼이 Supabase `kakao_send_jobs` 에 넣은
작업을, 예약 시각이 되면 가져와 카카오톡 PC 단톡방으로 보낸다.

  python kakao_worker.py --watch        # 계속 돌면서 예약 시각마다 발송 (평소 사용)
  python kakao_worker.py --once         # 지금 보낼 것이 있으면 1건만 처리하고 종료
  python kakao_worker.py --dry-run      # 가져오기·입력까지만 하고 실제 전송은 안 함

필요한 환경변수 (다른 워커와 동일):
  SUPABASE_URL                (기본값 있음)
  SUPABASE_SERVICE_ROLE_KEY   필수
  KAKAO_WORKER_NAME           home-pc / church-pc (기본 home-pc)

전송 자체는 kakao_qt_send.py 를 그대로 쓴다(같은 안전장치 적용):
잠금모드 확인, 방 제목 정확히 일치할 때만 발송, 쓰다 만 글·클립보드 원상복구.

5분마다 카카오톡 로그인 상태를 살핀다(2026-09-30). 로그아웃·꺼짐·30분 넘는 보류면
이 PC 화면에 안내 창을 띄우고, church_settings.kakao_worker 에 상태를 남겨
홈페이지 설교 매니저가 '발송 점검 필요' 카드를 보이게 한다.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import kakao_qt_send as K
import kakao_heart as H                     # 💗 댓글 하트 (필요 패키지는 시작할 때 설치)

for _s in (sys.stdout, sys.stderr):
    if _s and hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")


def _env(name, default=""):
    """환경변수를 읽되, 없으면 윈도우 사용자 환경변수(레지스트리)까지 확인한다.

    setx 로 넣은 값이 이미 열려 있던 창에는 반영되지 않아 생기는 혼선을 없앤다.
    (worship_worker.py 와 같은 방식)
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
WORKER = _env("KAKAO_WORKER_NAME", "home-pc")

# 2026-10-18: 30초 → 60초 (Supabase 요청 줄이기 — 한 번에 발송·하트 두 번씩 묻는다). 예약 발송이 1분 안에 나가면 충분하다.
POLL_SEC = 60
# 예약 시각이 이만큼 넘게 지났으면 보내지 않는다.
# (PC가 꺼져 있다가 한참 뒤에 켜졌을 때 새벽 QT가 한밤중에 날아가는 것을 막는다)
MAX_LATE_HOURS = float(_env("KAKAO_MAX_LATE_HOURS", "6") or 6)
# 화면 입력이 막혀 보내지 못했을 때(원격 접속 입력 차단 등) 다시 시도할 간격
RETRY_SEC = 180
_retry_after = 0.0

# ── 카카오톡 상태 점검·안내 (2026-09-30) ────────────────────────────────
# 9/28·9/29 새벽 QT가 카카오톡 로그아웃으로 이틀 연속 안 나갔는데 아무도 몰랐다.
# 워커가 5분마다 카카오톡 로그인 상태를 보고, 문제가 있으면
#   (1) 이 PC 화면 맨 앞에 안내 창을 띄우고 (원격 접속으로도 보인다)
#   (2) 홈페이지 설교 매니저가 읽는 church_settings.kakao_worker 에 상태를 남긴다.
# 비밀번호는 여전히 대신 넣지 않는다 — 사람이 로그인하면 안내 창은 저절로 닫힌다.
HEALTH_SEC = 300                    # 상태 확인 간격(초)
HOLD_ALERT_MIN = 30                 # 발송 보류가 이만큼(분) 이어지면 화면에 안내
STATUS_KEY = "kakao_worker"         # church_settings 의 key
ALERT_TITLE = "운평 QT 카카오톡 발송"
ALERT_TEXT = {
    "logged_out": ("카카오톡이 로그아웃되어 있습니다.\n\n"
                   "이 PC에서 카카오톡에 로그인하고 '자동 로그인'을 켜 주세요.\n"
                   "로그인 전까지 예약 발송(새벽 6시 QT 등)이 모두 실패합니다.\n\n"
                   "로그인하면 이 창은 저절로 닫힙니다."),
    "not_running": ("카카오톡이 꺼져 있습니다.\n\n"
                    "이 PC에서 카카오톡을 실행해 로그인해 주세요.\n"
                    "켜질 때까지 예약 발송이 실패할 수 있습니다.\n\n"
                    "켜지면 이 창은 저절로 닫힙니다."),
}
_health_next = 0.0
_kakao_state = None                 # ok | logged_out | not_running
_state_since = None                 # 그 상태가 된 시각(UTC ISO)
_hold_since = None                  # 첫 보류 시각 (time.time()) — 보내거나 끝나면 None
_hold_reason = None
_alert_proc = None
_alert_kind = None
_status_off = False                 # church_settings 가 없으면 상태 기록을 끈다


def log(msg):
    K.log(f"[워커] {msg}")


# ── Supabase ───────────────────────────────────────────────────────────
def _headers():
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}


def rest(method, path, body=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    h = _headers()
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} 실패({e.code}): "
                           f"{e.read()[:300].decode('utf-8', 'replace')}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


# ── 카카오톡 상태 점검·안내 ─────────────────────────────────────────────
def kakao_state():
    """카카오톡 PC 상태 — ok / logged_out / not_running. 창만 살펴본다(입력 없음)."""
    if K.login_window():
        return "logged_out"
    if not K.find_main():
        return "not_running"
    return "ok"


def show_alert(kind, text):
    """맨 앞에 남는 안내 창을 별도 프로세스로 띄운다 — 워커는 멈추지 않는다."""
    global _alert_proc, _alert_kind
    if _alert_proc is not None and _alert_proc.poll() is None and _alert_kind == kind:
        return                                  # 같은 안내가 이미 떠 있음
    close_alert()
    code = ("import ctypes,sys;"
            "ctypes.windll.user32.MessageBoxW(0, sys.argv[1], sys.argv[2], 0x40000|0x30|0x10000)")
    try:                                        # MB_TOPMOST | MB_ICONWARNING | MB_SETFOREGROUND
        _alert_proc = subprocess.Popen([sys.executable, "-c", code, text, ALERT_TITLE])
        _alert_kind = kind
    except Exception as e:
        log(f"안내 창을 띄우지 못했습니다: {e}")


def close_alert():
    global _alert_proc, _alert_kind
    if _alert_proc is not None and _alert_proc.poll() is None:
        try:
            _alert_proc.terminate()
        except Exception:
            pass
    _alert_proc = None
    _alert_kind = None


def report_status(state):
    """홈페이지 설교 매니저가 보는 워커 상태. church_settings 가 없으면 조용히 건너뛴다."""
    global _status_off
    if _status_off:
        return
    now = datetime.now(timezone.utc).isoformat()
    data = {"worker": WORKER, "last_seen": now, "kakao": state, "since": _state_since,
            "hold_since": (datetime.fromtimestamp(_hold_since, timezone.utc).isoformat()
                           if _hold_since else None),
            "hold_reason": _hold_reason}
    try:
        rest("POST", "church_settings?on_conflict=key",
             {"key": STATUS_KEY, "data": data, "updated_at": now},
             prefer="resolution=merge-duplicates,return=minimal")
    except Exception as e:
        msg = str(e)
        if "PGRST205" in msg or "42P01" in msg or "does not exist" in msg:
            _status_off = True
            log("워커 상태 기록은 건너뜁니다 — church_settings 테이블이 없습니다")
        else:
            log(f"워커 상태 기록 실패: {msg[:160]}")


def health_check(force=False):
    """HEALTH_SEC 마다: 카카오톡 상태를 보고 안내 창을 띄우거나 닫고, 상태를 기록한다."""
    global _health_next, _kakao_state, _state_since
    now = time.time()
    if not force and now < _health_next:
        return
    _health_next = now + HEALTH_SEC
    try:
        st = kakao_state()
    except Exception as e:
        log(f"카카오톡 상태 확인 실패: {e}")
        return
    if st != _kakao_state:
        _state_since = datetime.now(timezone.utc).isoformat()
        log({"ok": "카카오톡 로그인 확인 — 발송 가능",
             "logged_out": "카카오톡이 로그아웃되어 있습니다 — 로그인 전까지 예약 발송이 실패합니다",
             "not_running": "카카오톡이 꺼져 있습니다 — 예약 발송 때 실행을 시도합니다"}[st])
        _kakao_state = st
    if st in ALERT_TEXT:
        show_alert(st, ALERT_TEXT[st])
    elif _hold_since and now - _hold_since >= HOLD_ALERT_MIN * 60:
        since = datetime.fromtimestamp(_hold_since).strftime("%H:%M")
        show_alert("hold", f"{since}부터 발송이 보류되고 있습니다.\n\n사유: {_hold_reason}\n\n"
                           "화면 잠금이나 원격 접속의 입력 차단을 풀어 주세요.\n"
                           "풀리면 3분 안에 자동으로 보냅니다.")
    else:
        close_alert()
    report_status(st)


def _hold_clear():
    global _hold_since, _hold_reason
    _hold_since = None
    _hold_reason = None


def claim_job():
    rows = rest("POST", "rpc/claim_kakao_job", {"p_worker": WORKER})
    return rows[0] if rows else None


def finish(job_id, status, error=None):
    body = {"status": status, "error": error}
    if status == "sent":
        body["sent_at"] = datetime.now(timezone.utc).isoformat()
    rest("PATCH", f"kakao_send_jobs?id=eq.{job_id}", body, prefer="return=minimal")


# ── 처리 ───────────────────────────────────────────────────────────────
def too_late(job):
    """예약 시각이 너무 많이 지났는지. (지났는가, 몇 시간 지났는가)"""
    raw = (job.get("scheduled_at") or "").replace("Z", "+00:00")
    try:
        when = datetime.fromisoformat(raw)
    except Exception:
        return False, 0.0                       # 시각을 못 읽으면 막지 않는다
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    late_h = (datetime.now(timezone.utc) - when).total_seconds() / 3600.0
    return late_h > MAX_LATE_HOURS, late_h


def handle(job, dry_run=False):
    jid = job.get("id")
    room = job.get("room_name") or ""
    msg = job.get("message") or ""
    log(f"작업 #{jid} — '{room}' / {len(msg)}자 / 예약 {job.get('scheduled_at')}")

    stale, late_h = too_late(job)
    if stale:
        reason = (f"예약 시각이 {late_h:.1f}시간 지나 보내지 않았습니다 "
                  f"(허용 {MAX_LATE_HOURS:g}시간). PC가 꺼져 있었을 수 있습니다.")
        log(f"작업 #{jid} 건너뜀 — {reason}")
        finish(jid, "error", reason)
        _hold_clear()
        return

    if not msg.strip():
        finish(jid, "error", "보낼 본문이 비어 있습니다.")
        return

    global _retry_after, _hold_since, _hold_reason
    close_alert()                               # 안내 창이 채팅창 앞을 가리지 않게 잠시 닫는다
    try:
        n = K.send_to_room(room, msg, dry_run=dry_run)
    except K.NotReadyError as e:                # 보낸 것 없음 — 대기로 되돌리고 잠시 뒤 다시
        log(f"작업 #{jid} 보류 — {e} {RETRY_SEC // 60}분 뒤 다시 시도합니다")
        rest("PATCH", f"kakao_send_jobs?id=eq.{jid}",
             {"status": "pending", "claimed_by": None, "claimed_at": None,
              "error": f"재시도 대기: {e}"}, prefer="return=minimal")
        _retry_after = time.time() + RETRY_SEC
        _hold_since = _hold_since or time.time()
        _hold_reason = str(e)
        health_check(force=True)                # 보류가 오래 이어지면 화면에 안내
        return
    except K.SendError as e:
        log(f"작업 #{jid} 실패 — {e}")
        finish(jid, "error", str(e))
        _hold_clear()
        health_check(force=True)                # 로그아웃이면 바로 안내 창
        return
    except Exception as e:                      # 예기치 못한 오류도 작업에 남긴다
        log(f"작업 #{jid} 오류 — {e}")
        finish(jid, "error", f"{type(e).__name__}: {e}")
        _hold_clear()
        return

    _hold_clear()
    if dry_run:
        log(f"작업 #{jid} dry-run — 실제로는 보내지 않았습니다 (pending 으로 되돌림)")
        rest("PATCH", f"kakao_send_jobs?id=eq.{jid}",
             {"status": "pending", "claimed_by": None, "claimed_at": None},
             prefer="return=minimal")
        return

    finish(jid, "sent")
    log(f"작업 #{jid} 발송 완료 ({n}건)")
    health_check(force=True)                    # 보류 안내 창이 남아 있으면 닫고 상태 기록


# ── 💗 댓글 하트 ───────────────────────────────────────────────────────
# 보낸 뒤 N분이 지났는데 이만큼 더 늦었으면 하트를 달지 않는다.
# (댓글이 많이 쌓여 엉뚱한 날 글까지 훑는 일을 막는다)
HEART_MAX_LATE_HOURS = 3
_heart_rpc_missing = False


def claim_heart_job():
    """하트 차례가 된 작업 1건. 20260923 SQL 실행 전이면 조용히 None."""
    global _heart_rpc_missing
    if _heart_rpc_missing:
        return None
    try:
        rows = rest("POST", "rpc/claim_kakao_heart_job", {"p_worker": WORKER})
    except RuntimeError as e:
        if "claim_kakao_heart_job" in str(e) or "PGRST202" in str(e):
            _heart_rpc_missing = True
            log("댓글 하트 기능은 꺼져 있습니다 — supabase/20260923_0800_kakao_heart.sql 실행 전")
            return None
        raise
    return rows[0] if rows else None


def finish_heart(job_id, status, count=None, error=None, passes=None):
    body = {"heart_status": status, "heart_error": error}
    if count is not None:
        body["heart_count"] = count
    if passes is not None:
        body["heart_passes"] = passes
    if status == "done":
        body["heart_done_at"] = datetime.now(timezone.utc).isoformat()
    rest("PATCH", f"kakao_send_jobs?id=eq.{job_id}", body, prefer="return=minimal")


def handle_heart(job, dry_run=False):
    """하트 확인 한 차례. '30분 동안, 10분마다'면 10·20·30분에 한 번씩 이 함수가 불린다.

    매번 보낸 시각 ~ +30분 댓글 중 하트 없는 것에만 누르므로(이미 누른 건 건너뜀)
    앞 차례에 누른 댓글을 다시 건드리지 않는다.
    """
    jid = job.get("id")
    room = job.get("room_name") or ""
    minutes = int(job.get("heart_minutes") or 0)
    every = int(job.get("heart_every") or 0) or minutes           # 없으면 끝날 때 한 번
    every = max(1, min(every, max(minutes, 1)))
    repeat = -(-minutes // every)                                   # 확인 횟수 (올림)
    done = int(job.get("heart_passes") or 0)
    total = int(job.get("heart_count") or 0)
    try:
        sent = datetime.fromisoformat((job.get("sent_at") or "").replace("Z", "+00:00"))
    except Exception:
        finish_heart(jid, "error", error="보낸 시각을 읽을 수 없습니다.")
        return
    if sent.tzinfo is None:
        sent = sent.replace(tzinfo=timezone.utc)
    sent_local = sent.astimezone().replace(tzinfo=None)           # 카카오톡 화면은 이 PC 시각
    elapsed = (datetime.now() - sent_local).total_seconds() / 60.0

    # PC가 꺼져 있다 늦게 켜졌으면 지나간 차례는 한 번으로 합친다
    this_pass = min(repeat, max(done + 1, int(elapsed // every)))
    last = this_pass >= repeat
    log(f"하트 작업 #{jid} — '{room}' {sent_local:%m-%d %H:%M} 보낸 글, "
        f"{minutes}분 안 댓글 ({this_pass}/{repeat}번째)")

    late_h = (elapsed - minutes) / 60.0
    if late_h > HEART_MAX_LATE_HOURS or sent_local.date() != datetime.now().date():
        reason = (f"하트 시각이 {late_h:.1f}시간 지나 건너뛰었습니다. PC가 꺼져 있었을 수 있습니다.")
        log(f"하트 작업 #{jid} — {reason}")
        finish_heart(jid, "error", error=reason)
        return

    err = None
    n = 0
    try:
        n = H.heart_room(room, sent_local, minutes, dry_run=dry_run)
    except (H.HeartError, K.SendError) as e:
        err = str(e)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"

    if dry_run:
        log(f"하트 작업 #{jid} dry-run — 대상 {n}개 (누르지 않음, pending 으로 되돌림)")
        finish_heart(jid, "pending", error=err)
        return

    if err:
        log(f"하트 작업 #{jid} {this_pass}/{repeat}번째 실패 — {err}")
        # 중간 차례 실패는 다음 차례에 다시 해 본다. 마지막 차례 실패만 '실패'로 남긴다.
        finish_heart(jid, "error" if last else "pending", error=err, passes=this_pass)
        return

    total += n
    finish_heart(jid, "done" if last else "pending", count=total, passes=this_pass)
    log(f"하트 작업 #{jid} {this_pass}/{repeat}번째 완료 — 이번 {n}개, 누적 {total}개")


_MUTEX = None


def _single_instance():
    """--watch 워커가 이미 돌고 있으면 False. (윈도우 이름 있는 뮤텍스)"""
    global _MUTEX
    if sys.platform != "win32":
        return True
    import ctypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _MUTEX = k32.CreateMutexW(None, False, "Local\\WoonpyungKakaoWorker")
    return ctypes.get_last_error() != 183       # ERROR_ALREADY_EXISTS


def main():
    ap = argparse.ArgumentParser(description="카카오톡 QT 예약 발송 워커")
    ap.add_argument("--watch", action="store_true", help="계속 돌면서 예약을 처리")
    ap.add_argument("--once", action="store_true", help="지금 보낼 것 1건만 처리")
    ap.add_argument("--dry-run", action="store_true", help="실제 전송은 하지 않음")
    args = ap.parse_args()

    if not SERVICE_KEY:
        log("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. 설정 후 다시 실행하세요.")
        sys.exit(1)

    if not args.watch and not args.once:
        args.watch = True

    # 감시 작업(kakao-worker-watchdog.ps1)과 시작프로그램이 겹쳐 켜도 한 개만 돈다.
    if args.watch and not _single_instance():
        print("이미 다른 워커가 돌고 있어 이 창은 닫습니다.")
        sys.exit(0)

    log(f"시작 — 워커 이름 '{WORKER}', {POLL_SEC}초마다 확인 "
        f"(지각 허용 {MAX_LATE_HOURS:g}시간)")

    while True:
        try:
            health_check()                      # 5분마다 카카오톡 로그인 상태 확인·안내
            if time.time() < _retry_after:      # 보류된 발송이 있으면 잠시 쉰다
                time.sleep(POLL_SEC)
                continue
            job = claim_job()
            if job:
                handle(job, dry_run=args.dry_run)
                if args.once:
                    return
                continue                        # 밀린 작업이 더 있을 수 있으니 바로 다시
            hjob = claim_heart_job()            # 발송이 먼저, 하트는 그다음
            if hjob:
                handle_heart(hjob, dry_run=args.dry_run)
                if args.once:
                    return
                continue
            if args.once:
                log("지금 보낼 예약이 없습니다.")
                return
        except KeyboardInterrupt:
            log("중지")
            return
        except Exception as e:
            log(f"확인 실패: {e}")
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
