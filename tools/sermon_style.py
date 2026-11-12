# -*- coding: utf-8 -*-
r"""
주중 설교문 일괄 변환 — 받아 둔 설교문(매일 QT 칸)을 목사님 새벽설교 방식으로 다시 쓰고,
같은 글로 '새벽기도' 설교와 '매일 QT' 를 둔다. (교회 PC 전용, Claude CLI 사용)

  python sermon_style.py --from 2026-11-16 --to 2026-11-30          범위 변환
  python sermon_style.py --from 2026-11-16 --to 2026-11-30 --dry    무엇을 바꿀지만 보기
  python sermon_style.py --date 2026-11-17 --force                   이미 바꾼 글도 다시

· 기준: tools/sermon_style_prompt.md
· 주일은 건드리지 않는다. 이미 목사님 방식인 글(절 순서 풀이 + "우리는 어떨까요" + "기도합니다" 맺음)은 건너뛴다.
· 바꾸기 전에 원래 글을 C:\qt-video\sermon-backup\<시각>.json 에 남긴다. 되돌리기: python sermon_style.py --restore <그 파일>
· 관리자 로그인은 QT 영상 도구와 같은 설정(C:\qt-video\worker_config.json)을 쓴다.
"""
import argparse, datetime as dt, html, json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "qt_motion"))
import qt_motion as q          # Supa(관리자 로그인) · strip_html · log
import ai_worker               # run_claude

BACKUP_DIR = r"C:\qt-video\sermon-backup"
QT, DAWN = "매일 QT", "새벽기도"
BAN = ai_worker.STYLE_BAN


def is_mine(text):
    """이미 목사님 방식으로 쓴 글인가(다시 바꾸지 않으려고)."""
    t = text.strip()
    verses = len(re.findall(r"\d+절(을|에서|은|부터|과|에는|의|도)", t))
    return verses >= 3 and t.endswith("기도합니다.") and not any(b in t for b in BAN)


def to_html(text):
    """편집기와 같은 모양: 한 줄 = <p>, 빈 줄 = <p><br></p>"""
    out = []
    for line in text.strip().split("\n"):
        line = line.strip()
        out.append("<p>" + html.escape(line, quote=False) + "</p>" if line else "<p><br></p>")
    return re.sub(r"(<p><br></p>){2,}", "<p><br></p>", "".join(out))


def convert(row, model):
    src = q.strip_html(row.get("content"))
    material = (f"제목: {row['title']}\n본문: {row['scripture']}\n\n[성경 본문 — 개역개정]\n{q.strip_html(row.get('bible_text'))}\n\n"
                f"[받아 둔 설교문(원문)]\n{src}\n")
    return ai_worker.style_convert(material, model, 900)      # 기준 검사·다시 쓰기는 ai_worker 와 같은 것을 쓴다


def main():
    ap = argparse.ArgumentParser(description="주중 설교문 일괄 변환(목사님 새벽설교 방식)")
    ap.add_argument("--from", dest="d1"); ap.add_argument("--to", dest="d2"); ap.add_argument("--date")
    ap.add_argument("--dry", action="store_true"); ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-dawn", action="store_true", help="새벽기도 글은 만들지 않는다")
    ap.add_argument("--model", default="opus"); ap.add_argument("--restore")
    o = ap.parse_args()
    s = q.Supa()
    if o.restore:
        for r in json.load(open(o.restore, encoding="utf-8"))["rows"]:
            s.req("PATCH", f"/rest/v1/sermons?id=eq.{r['id']}", {"content": r["content"]}, "return=minimal")
            q.log(f"되돌림: {r['sermon_date']} {r['service']}")
        return 0
    d1 = o.date or o.d1; d2 = o.date or o.d2 or d1
    if not d1:
        ap.error("--from/--to 또는 --date 가 필요합니다")
    sel = "id,sermon_date,service,title,scripture,preacher,content,bible_text,qt_bible_text,status"
    rows = s.req("GET", f"/rest/v1/sermons?select={sel}&sermon_date=gte.{d1}&sermon_date=lte.{d2}"
                        f"&service=in.({urllib.parse.quote(QT)},{urllib.parse.quote(DAWN)})&order=sermon_date.asc") or []
    by = {}
    for r in rows:
        by.setdefault(r["sermon_date"], {})[r["service"]] = r
    todo = []
    for d, pair in sorted(by.items()):
        if dt.date.fromisoformat(d).weekday() == 6:      # 주일
            continue
        src = pair.get(QT) or pair.get(DAWN)
        text = q.strip_html(src.get("content"))
        if len(text) < 300:
            q.log(f"{d} 건너뜀 — 글이 너무 짧음({len(text)}자)"); continue
        if is_mine(text) and not o.force:
            q.log(f"{d} 건너뜀 — 이미 목사님 방식"); continue
        todo.append((d, pair, src))
    q.log(f"바꿀 글 {len(todo)}편: " + ", ".join(d[5:] for d, _, _ in todo))
    if o.dry or not todo:
        return 0
    os.makedirs(BACKUP_DIR, exist_ok=True)
    bk = os.path.join(BACKUP_DIR, dt.datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    json.dump({"made": dt.datetime.now().isoformat(), "rows": [r for _, pair, _ in todo for r in pair.values()]},
              open(bk, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    q.log("원래 글 보관: " + bk)
    ok = fail = 0
    for d, pair, src in todo:
        try:
            q.log(f"{d} 변환 중 — {src['title']}")
            body = to_html(convert(src, o.model))
            for svc in (QT, DAWN):
                if svc == DAWN and o.no_dawn:
                    continue
                if svc in pair:
                    s.req("PATCH", f"/rest/v1/sermons?id=eq.{pair[svc]['id']}", {"content": body}, "return=minimal")
                else:
                    s.req("POST", "/rest/v1/sermons", {"sermon_date": d, "service": svc, "title": src["title"], "scripture": src["scripture"],
                          "preacher": src.get("preacher"), "content": body, "bible_text": src.get("bible_text"),
                          "qt_bible_text": src.get("qt_bible_text"), "status": src.get("status") or "작성중"}, "return=minimal")
            ok += 1
        except Exception as e:
            fail += 1
            q.log(f"  {d} 실패: {str(e)[:200]}")
    q.log(f"끝 — 변환 {ok}편, 실패 {fail}편. 원래 글: {bk}")
    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
