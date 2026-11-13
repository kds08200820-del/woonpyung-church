# -*- coding: utf-8 -*-
"""이미 만든 노래방 가사 시간표(out/NNN_lyrics.json)에 절 구간(sections)을 더하고 다시 올린다 — 2026-11-13
재생기의 「절 고르기(1절만 등)」가 이 구간으로 건너뛴다. 새로 만드는 장은 batch.write_lyrics 가 처음부터 넣는다.

  python add_sections.py          # 구간이 없는 것 모두
  python add_sections.py 9 12     # 이 장들만
"""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import batch, upload                                               # noqa: E402

HOME = batch.HOME


def main(nos=None):
    st = batch.load_status()
    supa = upload.Supa(); supa.login()
    for f in sorted(glob.glob(os.path.join(HOME, "out", "[0-9][0-9][0-9]_lyrics.json"))):
        no = int(os.path.basename(f)[:3])
        if nos and no not in nos:
            continue
        d = json.load(open(f, encoding="utf-8"))
        if d.get("sections") and not nos:
            continue
        sec = batch.sections_of(no)
        if not sec:
            print(f"{no}장: 구간 파일 없음"); continue
        d["sections"] = sec
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        state = (st.get(str(no)) or {}).get("state")
        name = f"{no:03d}_lyrics.json" if state == "완료" else (f"review_{no:03d}_lyrics.json" if state == "확인 필요" else None)
        if not name:
            print(f"{no}장: 구간 더함(올리지 않음 — {state})"); continue
        try:
            upload._put(supa, name, open(f, "rb").read(), "application/json")
            print(f"{no}장: 구간 더해 올림 ({name})")
        except Exception as e:
            print(f"{no}장: 올리기 실패 {e}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or None)
