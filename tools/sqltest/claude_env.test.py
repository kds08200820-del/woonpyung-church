# -*- coding: utf-8 -*-
"""AI 워커가 Claude 에 넘기는 환경변수 · 도구 옵션 시험 (2026-11-25) — 가짜 값만, Claude 는 실제로 부르지 않는다.
   python tools/sqltest/claude_env.test.py <저장소 경로>
"""
import os
import sys
import types

repo = sys.argv[1]
sys.path.insert(0, os.path.join(repo, "tools"))
passed = failed = 0


def ok(c, m):
    global passed, failed
    if c:
        passed += 1
        print("  ok", m)
    else:
        failed += 1
        print("  FAIL", m)


fake = {
    "PATH": "C:\\Windows", "USERPROFILE": "C:\\Users\\x", "APPDATA": "C:\\Users\\x\\AppData\\Roaming",
    "SUPABASE_URL": "https://sb.example.test", "SUPABASE_SERVICE_ROLE_KEY": "svc-secret",
    "WP_WORKER_SECRET": "w-secret", "WORKER_UPLOAD_KEY": "u-secret", "GEMINI_API_KEY": "g-secret",
    "SOME_PASSWORD": "p", "MY_DB_CREDENTIALS": "c", "CLAUDE_CODE_OAUTH_TOKEN": "env-token",
    "ANTHROPIC_API_KEY": "anth", "AI_MODEL_COUNSEL": "sonnet", "KAKAO_WORKER_NAME": "church-pc",
}
saved = dict(os.environ)
os.environ.clear()
os.environ.update(fake)
try:
    import claude_auth as A
    e = A.env_for("shared")
    for k in ["SUPABASE_SERVICE_ROLE_KEY", "WP_WORKER_SECRET", "WORKER_UPLOAD_KEY", "GEMINI_API_KEY", "SOME_PASSWORD", "MY_DB_CREDENTIALS"]:
        ok(k not in e, "공용 로그인: " + k + " 는 넘기지 않음")
    ok(all(e.get(k) == fake[k] for k in ["PATH", "USERPROFILE", "APPDATA", "SUPABASE_URL", "AI_MODEL_COUNSEL", "KAKAO_WORKER_NAME"]), "공용 로그인: 보통 값은 그대로")
    ok("CLAUDE_CODE_OAUTH_TOKEN" not in e and e.get("ANTHROPIC_API_KEY") == "anth", "공용 로그인: 장기 토큰은 빼고 Claude 키는 그대로(예전과 같음)")
    t = A.env_for("token")
    ok(t.get("CLAUDE_CODE_OAUTH_TOKEN") == "env-token" and "SUPABASE_SERVICE_ROLE_KEY" not in t, "장기 토큰: 토큰은 넣고 DB 키는 뺌")
    ok(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") == "svc-secret", "워커 자신의 환경변수는 그대로(파이썬은 계속 씀)")

    # 도구 옵션: CLI 가 --tools 를 알면 ["--tools", ""], 모르면 []
    import subprocess
    real_run = subprocess.run
    src = open(os.path.join(repo, "tools", "ai_worker.py"), encoding="utf-8").read()
    start = src.index("_TOOLS_FLAG = None")
    end = src.index("def run_claude(")
    for helptext, want in [("  --tools <tools...>   Specify the list\n  --model", ["--tools", ""]), ("  --model <m>\n  --allowed-tools <x>\n", [])]:
        mod = types.ModuleType("aw_part")
        mod.subprocess = types.SimpleNamespace(run=lambda *a, **k: types.SimpleNamespace(stdout=helptext.encode(), stderr=b""), PIPE=-1)
        import re as _re
        mod.re = _re
        mod.find_claude = lambda: "claude"
        exec(src[start:end], mod.__dict__)
        ok(mod.tools_off_flag() == want, "도구 옵션: " + ("--tools 를 아는 CLI → 도구 하나도 안 줌" if want else "모르는 옛 CLI → 예전 방식"))
    ok('] + tools_off_flag()' in src and '"--disallowed-tools", DENY_TOOLS' in src, "run_claude 가 두 겹(허용 목록 비움 + 금지 목록)으로 막음")
finally:
    os.environ.clear()
    os.environ.update(saved)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
