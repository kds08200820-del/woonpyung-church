# -*- coding: utf-8 -*-
"""워커 '살아 있음' 기록(tools/worker_heartbeat.py) 시험 — 실제 서버에는 보내지 않는다(urlopen 을 가짜로).
   python tools/sqltest/worker_heartbeat.test.py <저장소 경로>
"""
import json
import os
import sys
import urllib.error

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


import worker_heartbeat as H

calls = []


class FakeResp:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b""


def fake_urlopen(req, timeout=0):
    calls.append(req)
    return FakeResp()


H.urllib.request.urlopen = fake_urlopen
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"
os.environ["SUPABASE_URL"] = "https://sb.example.test"
os.environ["AI_WORKER_NAME"] = "church-pc"

ok(H.beat("ai", now=1000.0) is True and len(calls) == 1, "처음에는 바로 기록")
r = calls[0]
body = json.loads(r.data.decode("utf-8"))
ok(r.full_url == "https://sb.example.test/rest/v1/church_settings?on_conflict=key" and r.get_method() == "POST", "church_settings 에 넣거나 고치기")
ok(body["key"] == "worker_ai" and body["data"]["host"] == "church-pc" and body["data"]["state"] == "running" and body["data"]["last_seen"], "워커 이름 · PC 이름 · 시각 · 상태")
ok(r.headers.get("Authorization") == "Bearer test-key" and "merge-duplicates" in r.headers.get("Prefer", ""), "서버 키 · 덮어쓰기")
ok(H.beat("ai", now=1100.0) is False and len(calls) == 1, "5분이 안 됐으면 기록하지 않음")
ok(H.beat("ai", now=1301.0) is True and len(calls) == 2, "5분이 지나면 다시 기록")
ok(H.beat("worship", now=1302.0) is True and len(calls) == 3, "워커마다 따로 셈")
ok(H.beat("ai", now=1303.0, force=True, state="stopped") is True and json.loads(calls[-1].data)["data"]["state"] == "stopped", "끝날 때는 바로 · stopped")


def broken(req, timeout=0):
    raise OSError("network down")


H.urllib.request.urlopen = broken
ok(H.beat("kakao", now=5000.0) is False, "인터넷이 끊겨도 오류 없이 넘어감")


def missing_table(req, timeout=0):
    import io
    raise urllib.error.HTTPError(req.full_url, 404, "x", {}, io.BytesIO(b'{"code":"PGRST205"}'))


H.urllib.request.urlopen = missing_table
H.beat("x1", now=6000.0)
H.urllib.request.urlopen = fake_urlopen
n = len(calls)
ok(H.beat("x2", now=7000.0) is False and len(calls) == n, "표가 없는 DB 면 그 뒤로는 묻지 않음")
H._off = False
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY")
ok(H.beat("y", now=9000.0) is False, "서버 키가 없으면 기록하지 않음")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
