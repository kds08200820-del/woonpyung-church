# -*- coding: utf-8 -*-
"""
교회 PC 워커들이 Claude CLI 를 부를 때 쓰는 '로그인' 도우미 (2026-09-27)

왜 로그인이 자꾸 풀렸나
  이 PC 에서는 여러 프로그램이 같은 로그인 파일(~/.claude/.credentials.json)을 함께 쓴다.
  (홈페이지 AI 워커 · 예배자료 워커 · 주식 봇 · claude-mem · 데스크톱 앱)
  구독 로그인은 몇 시간마다 토큰을 새로 받아야 하는데, 새로 받을 때마다 옛 토큰이 무효가 된다.
  두 프로그램이 동시에 새로 받으면 진 쪽이 거절당하고, CLI 는 로그인 파일의 토큰을 지워 버린다.
  → '로그인 풀림'이 며칠마다 되풀이됐다 (9/16, 9/23 …).

해결
  ① 워커 전용 '장기 토큰'(claude setup-token, 1년짜리, 새로 받기 없음)을 따로 둔다.
     tools\\목회AI_토큰설정.bat 이 한 번 만들어 %USERPROFILE%\\.woonpyung\\claude-token.txt 에 저장한다.
     워커는 CLAUDE_CODE_OAUTH_TOKEN 으로 그 토큰을 쓰므로, 다른 프로그램의 토큰 경쟁에 휘말리지 않는다.
  ② 자동 복구: 한쪽 로그인이 실패하면 다른 쪽(장기 토큰 ↔ 공용 로그인)으로 즉시 다시 시도한다.
     둘 중 하나만 살아 있어도 답이 나간다. 실패한 쪽은 기억해 두었다가 토큰 파일이 바뀌면 다시 쓴다.
"""
import os
import re

TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".woonpyung", "claude-token.txt")

LOGIN_RE = re.compile(
    r"not logged in|please run /login|run `?/login|invalid api key|authentication_error|"
    r"oauth token (has )?(expired|been revoked)|invalid bearer token|\b401\b", re.I)

_token_failed = False
_bad_token_mtime = None     # 실패한 장기 토큰 파일의 수정 시각 — 파일이 바뀌면(다시 설정하면) 다시 쓴다


def read_token():
    """장기 토큰 — 환경변수가 있으면 그것, 없으면 토큰 파일."""
    t = (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or "").strip()
    if t:
        return t
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""


def _token_mtime():
    try:
        return os.path.getmtime(TOKEN_FILE)
    except Exception:
        return None


def token_usable():
    return bool(read_token()) and (not _token_failed or _bad_token_mtime != _token_mtime())


def env_for(mode):
    """mode: 'token' = 장기 토큰으로, 'shared' = 이 PC 의 공용 로그인(~/.claude)으로."""
    env = dict(os.environ)
    if mode == "token":
        env["CLAUDE_CODE_OAUTH_TOKEN"] = read_token()
    else:
        env.pop("CLAUDE_CODE_OAUTH_TOKEN", None)
    return env


def modes():
    """시도 순서 — 쓸 수 있는 장기 토큰이 있으면 그것부터, 그다음 공용 로그인."""
    return (["token"] if token_usable() else []) + ["shared"]


def mark_failed(mode):
    global _bad_token_mtime, _token_failed
    if mode == "token":
        _token_failed = True
        _bad_token_mtime = _token_mtime()


def mark_ok(mode):
    global _token_failed
    if mode == "token":
        _token_failed = False


def describe():
    if not read_token():
        return "공용 로그인 (장기 토큰 없음 — tools\\목회AI_토큰설정.bat 으로 만들면 로그인 풀림이 사라집니다)"
    return "장기 토큰 우선 + 공용 로그인 예비" + ("" if token_usable() else " (장기 토큰 실패 — 다시 설정 필요)")
