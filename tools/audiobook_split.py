#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
운평장로교회 — «레위기에서 만난 예수 그리스도» 오디오북 대본 분할기

부크크 원고(.docx)를 읽어 '여는 글 · 제1~27장 · 닫는 글' 29개 트랙으로 나누고,
  ① js/audiobook-data.js          — 홈페이지가 읽는 목차(제목·본문·길이)
  ② tools/_audiobook_scripts/*.txt — GPT-SoVITS에 그대로 먹일 낭독 대본
를 만듭니다. 낭독 대본은 눈으로 보는 글과 달리 아래를 정리합니다.

  · 히브리어·헬라어·한자 병기, 영어 원어 주석 → 소리로는 방해만 되므로 제거
  · 성경 약어와 장절(출 40:34-35) → "출애굽기 사십 장 삼십사 절에서 삼십오 절"
  · 남은 숫자 → 한국어 수사(930 → 구백삼십)
  · 따옴표·말줄임표·구분선 등 → 낭독에 맞게 정리

사용:
  python tools/audiobook_split.py                      # 기본 경로의 원고 사용
  python tools/audiobook_split.py --docx "경로.docx"
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_DOCX = os.path.join(
    os.path.expanduser("~"), "OneDrive", "바탕 화면", "레위기",
    "부크크 서식용 레위기에서 만난 예수그리스도.docx",
)
OUT_JSON = os.path.join(ROOT, "js", "audiobook-data.js")
OUT_SCRIPTS = os.path.join(HERE, "_audiobook_scripts")

BOOK_NAMES = {
    "창": "창세기", "출": "출애굽기", "레": "레위기", "민": "민수기", "신": "신명기",
    "수": "여호수아", "삿": "사사기", "룻": "룻기", "삼상": "사무엘상", "삼하": "사무엘하",
    "왕상": "열왕기상", "왕하": "열왕기하", "대상": "역대상", "대하": "역대하", "스": "에스라",
    "느": "느헤미야", "에": "에스더", "욥": "욥기", "시": "시편", "잠": "잠언",
    "전": "전도서", "아": "아가", "사": "이사야", "렘": "예레미야", "애": "예레미야애가",
    "겔": "에스겔", "단": "다니엘", "호": "호세아", "욜": "요엘", "암": "아모스",
    "옵": "오바댜", "욘": "요나", "미": "미가", "나": "나훔", "합": "하박국",
    "습": "스바냐", "학": "학개", "슥": "스가랴", "말": "말라기", "마": "마태복음",
    "막": "마가복음", "눅": "누가복음", "요": "요한복음", "행": "사도행전", "롬": "로마서",
    "고전": "고린도전서", "고후": "고린도후서", "갈": "갈라디아서", "엡": "에베소서",
    "빌": "빌립보서", "골": "골로새서", "살전": "데살로니가전서", "살후": "데살로니가후서",
    "딤전": "디모데전서", "딤후": "디모데후서", "딛": "디도서", "몬": "빌레몬서",
    "히": "히브리서", "약": "야고보서", "벧전": "베드로전서", "벧후": "베드로후서",
    "요일": "요한일서", "요이": "요한이서", "요삼": "요한삼서", "유": "유다서", "계": "요한계시록",
}
# 긴 약어(삼상·고전…)를 짧은 약어(삼·고…)보다 먼저 맞춰야 한다.
ABBR_RE = "|".join(sorted(BOOK_NAMES, key=len, reverse=True))

# 본문 안에서 소리로 옮기지 않는 문자들
HEBREW = r"֐-׿יִ-ﭏ"
GREEK = r"Ͱ-Ͽἀ-῿"
HANJA = r"㐀-䶿一-鿿豈-﫿"

SECTION_HEADS = ("들어가며", "본문 들여다보기", "이 장의 중심 말씀", "핵심 요약",
                 "그리스도를 향하여", "오늘 우리에게", "묵상 질문", "기도")


# ── 한국어 수사 ────────────────────────────────────────────────
def sino(n_str):
    """930 → 구백삼십. 만·억·조까지."""
    try:
        n = int(str(n_str).replace(",", ""))
    except ValueError:
        return str(n_str)
    if n == 0:
        return "영"
    if n < 0:
        return "마이너스 " + sino(-n)
    digit = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"]
    place = ["", "십", "백", "천"]
    big = ["", "만", "억", "조"]

    def under_10k(x):
        out, s = "", str(x)
        for i, ch in enumerate(s):
            g, p = int(ch), len(s) - 1 - i
            if g == 0:
                continue
            out += place[p] if (g == 1 and p > 0) else digit[g] + place[p]
        return out

    groups, x = [], n
    while x > 0:
        groups.append(x % 10000)
        x //= 10000
    out = ""
    for gi in range(len(groups) - 1, -1, -1):
        if groups[gi]:
            out += under_10k(groups[gi]) + big[gi]
    return out or "영"


# ── docx → 문단 목록 ───────────────────────────────────────────
def _copy_locked(src, dst):
    """워드로 원고를 열어 둔 채여도 읽을 수 있게 복사한다.

    파이썬 open()은 워드가 잡고 있는 잠금과 충돌해 PermissionError가 난다.
    이때는 잠금을 함께 쓸 수 있는 PowerShell Copy-Item으로 우회한다.
    """
    try:
        shutil.copyfile(src, dst)
        return
    except PermissionError:
        pass
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Copy-Item -LiteralPath $env:AB_SRC -Destination $env:AB_DST -Force"],
        env={**os.environ, "AB_SRC": src, "AB_DST": dst},
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(dst):
        raise SystemExit(
            "원고를 열 수 없습니다(다른 프로그램이 사용 중일 수 있습니다).\n"
            "워드에서 원고를 닫고 다시 실행해 주세요.\n" + (r.stderr or "")
        )


def read_docx_paragraphs(path):
    """OneDrive 한글 경로에서도 열리도록 임시 파일로 복사해 읽는다."""
    tmp = os.path.join(tempfile.gettempdir(), "_audiobook_src.docx")
    _copy_locked(path, tmp)
    try:
        with zipfile.ZipFile(tmp) as z:
            xml = z.read("word/document.xml").decode("utf-8")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)
    out = []
    for p in paras:
        # <w:br/> 는 줄바꿈, <w:tab/> 는 공백으로 살려 둔다.
        p = re.sub(r"<w:br\s*/>", "\n", p)
        p = re.sub(r"<w:tab\s*/>", " ", p)
        text = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))
        out.append(html.unescape(text).replace(" ", " ").strip())
    return out


# ── 낭독용 정규화 ──────────────────────────────────────────────
def strip_foreign(s):
    """히브리어·헬라어·한자, 그리고 한글이 하나도 없는 괄호 주석을 걷어낸다."""
    def paren(m):
        inner = m.group(1)
        if re.search(r"[가-힣]", inner):
            # 한글이 섞인 괄호(예: "(סָמַךְ, 사마크)")는 외국 문자만 지우고 남긴다.
            cleaned = re.sub(f"[{HEBREW}{GREEK}{HANJA}]", "", inner)
            cleaned = re.sub(r"^[\s,;·]+|[\s,;·]+$", "", cleaned)
            cleaned = re.sub(r"\s{2,}", " ", cleaned)
            return f"({cleaned})" if cleaned else ""
        return ""  # 한글이 없는 괄호(원어·영어 주석)는 통째로 버린다.

    s = re.sub(r"\(([^()]*)\)", paren, s)
    s = re.sub(f"[{HEBREW}{GREEK}{HANJA}]", "", s)
    return s


def expand_refs(s):
    """성경 약어와 장·절을 소리 나는 대로 편다."""
    # 겹장절: 출 40:34-35 / 레위기 1:3–9
    s = re.sub(
        rf"(?<![가-힣])({ABBR_RE})\s*(\d+)\s*:\s*(\d+)\s*[-~–—∼]\s*(\d+)",
        lambda m: f"{BOOK_NAMES[m.group(1)]} {sino(m.group(2))} 장 {sino(m.group(3))} 절에서 {sino(m.group(4))} 절",
        s,
    )
    # 단일 장절: 히 10:1
    s = re.sub(
        rf"(?<![가-힣])({ABBR_RE})\s*(\d+)\s*:\s*(\d+)",
        lambda m: f"{BOOK_NAMES[m.group(1)]} {sino(m.group(2))} 장 {sino(m.group(3))} 절",
        s,
    )
    # 약어 + 장만: 레 16장
    s = re.sub(
        rf"(?<![가-힣])({ABBR_RE})\s*(\d+)\s*장",
        lambda m: f"{BOOK_NAMES[m.group(1)]} {sino(m.group(2))} 장",
        s,
    )
    # 책 이름 없는 장절: (1:3–9) → 일 장 삼 절에서 구 절
    s = re.sub(
        r"(\d+)\s*:\s*(\d+)\s*[-~–—∼]\s*(\d+)",
        lambda m: f"{sino(m.group(1))} 장 {sino(m.group(2))} 절에서 {sino(m.group(3))} 절",
        s,
    )
    s = re.sub(r"(\d+)\s*:\s*(\d+)",
               lambda m: f"{sino(m.group(1))} 장 {sino(m.group(2))} 절", s)
    # 단위를 함께 쓴 범위: '1절~17절', '18-26장'
    s = re.sub(r"(\d+)\s*(장|절|편)\s*[-~–—∼]\s*(\d+)\s*\2",
               lambda m: f"{sino(m.group(1))} {m.group(2)}에서 {sino(m.group(3))} {m.group(2)}", s)
    return s


def normalize_for_tts(s):
    s = unicodedata.normalize("NFC", s)
    s = strip_foreign(s)
    s = expand_refs(s)
    # 숫자 범위(1~7장, 18–26장)
    s = re.sub(r"(\d+)\s*[-~–—∼]\s*(\d+)\s*(장|절|편|절기)",
               lambda m: f"{sino(m.group(1))} {m.group(3)}에서 {sino(m.group(2))} {m.group(3)}", s)
    # 남은 숫자 전부 한국어 수사로
    s = re.sub(r"\d[\d,]*", lambda m: sino(m.group(0)), s)
    # 낭독을 방해하는 기호 정리
    s = s.replace("“", "").replace("”", "").replace("‘", "").replace("’", "")
    s = s.replace("…", ". ").replace("·", " ")
    s = re.sub(r"^\s*[—–-]\s*", "인용, ", s)     # '— C. H. 매킨토시' → '인용, 매킨토시'
    s = re.sub(r"[A-Za-z]", "", s)               # 남은 로마자(약어 이니셜 등)는 버린다
    s = re.sub(r"\(\s*\)", "", s)
    # 로마자를 지우고 남은 이니셜 마침표('인용, . . 매킨토시')를 정리한다.
    s = re.sub(r"(?:\s*\.){2,}\s*", ". ", s)
    s = re.sub(r"(?<=[,、])\s*\.\s*", " ", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\s+([.,!?])", r"\1", s)
    return s.strip(" .,")


# ── 원고 → 트랙 ────────────────────────────────────────────────
def build_tracks(lines):
    """'제 N 장'/'여는 글'/'닫는 글' 을 경계로 트랙을 만든다(목차는 건너뜀)."""
    # 목차 블록(두 번째 '여는 글'이 목차 안에 있다)의 끝을 먼저 찾는다.
    toc_start = next(i for i, l in enumerate(lines) if l == "목차")
    body_start = next(i for i, l in enumerate(lines) if l == "제 1 부")

    marks = []  # (index, kind, number)
    intro_idx = next(i for i, l in enumerate(lines) if l == "여는 글" and i < toc_start)
    marks.append((intro_idx, "intro", 0))
    for i in range(body_start, len(lines)):
        m = re.fullmatch(r"제\s*(\d+)\s*장", lines[i])
        if m:
            marks.append((i, "chapter", int(m.group(1))))
        elif re.fullmatch(r"제\s*\d+\s*부", lines[i]):
            marks.append((i, "part", -1))
        elif lines[i] == "닫는 글":
            marks.append((i, "outro", 28))
            break
    marks.sort()

    # '참고 문헌'은 낭독 대상에서 뺀다(목차에도 같은 말이 있으니 본문 이후에서 찾는다).
    end_idx = next((i for i, l in enumerate(lines) if l == "참고 문헌" and i > body_start),
                   len(lines))

    tracks, pending_part = [], []
    for n, (idx, kind, num) in enumerate(marks):
        stop = marks[n + 1][0] if n + 1 < len(marks) else end_idx
        block = lines[idx:stop]
        if kind == "part":
            # 부(部) 표지와 그 여는 말은 뒤따르는 첫 장 앞머리에 붙여 읽는다.
            pending_part = block
            continue
        if kind == "intro":
            # 목차 블록은 여는 글 트랙에 딸려 오므로 잘라낸다.
            cut = next((j for j, l in enumerate(block) if l == "목차"), len(block))
            block = block[:cut]
        tracks.append({"kind": kind, "num": num, "lines": block, "part": pending_part})
        pending_part = []
    return tracks


def track_meta(t):
    """트랙의 표시용 제목·부제·본문 범위를 뽑는다."""
    lines = [l for l in t["lines"] if l]
    if t["kind"] == "intro":
        return {"label": "여는 글", "title": "여는 글", "subtitle": "", "scripture": ""}
    if t["kind"] == "outro":
        return {"label": "닫는 글", "title": "닫는 글", "subtitle": "", "scripture": ""}
    # ['제 N 장', '번제(燔祭)', '자기 자신을 온전히 드린 그리스도', '본문 레위기 1장 1절~17절', ...]
    title = re.sub(r"\([^)]*\)", "", lines[1]).strip() if len(lines) > 1 else ""
    subtitle = lines[2] if len(lines) > 2 and not lines[2].startswith("본문") else ""
    scripture = ""
    for l in lines[:5]:
        if l.startswith("본문"):
            scripture = l.replace("본문", "", 1).strip()
            break
    return {"label": f"제 {t['num']} 장", "title": title,
            "subtitle": subtitle, "scripture": scripture}


def part_meta(t):
    """트랙 앞에 붙은 부(部) 표지에서 '제 1 부 하나님께 나아가는 다섯 갈래 길'을 뽑는다."""
    ls = [l for l in t.get("part", []) if l]
    if not ls:
        return {"label": "", "title": ""}
    return {"label": ls[0], "title": ls[1] if len(ls) > 1 else ""}


def narration(t, meta):
    """낭독 대본. 부·장 제목을 또박또박 먼저 읽고 본문으로 들어간다."""
    body = []
    skip = 0
    if t["kind"] == "chapter":
        # 표제부(제 N 장 / 제목 / 부제 / 본문 …)는 아래에서 다시 만들어 붙인다.
        for i, l in enumerate(t["lines"][:6]):
            if l.startswith("본문"):
                skip = i + 1
                break
        else:
            skip = 1
        head = [f"{normalize_for_tts(meta['label'])}. {normalize_for_tts(meta['title'])}."]
        if meta["subtitle"]:
            head.append(normalize_for_tts(meta["subtitle"]) + ".")
        if meta["scripture"]:
            head.append(f"본문은 {normalize_for_tts(meta['scripture'])} 입니다.")
    else:
        skip = 1
        head = [normalize_for_tts(meta["title"]) + "."]

    # 부(部) 표지와 여는 말이 있으면 장보다 먼저 읽는다.
    lead = []
    for raw in t.get("part", []):
        if raw:
            line = normalize_for_tts(raw)
            if line:
                lead.append(line if line[-1] in ".!?" else line + ".")
    head = lead + head

    for raw in t["lines"][skip:]:
        if not raw:
            continue
        line = normalize_for_tts(raw)
        if not line:
            continue
        # 소제목은 뒤에 마침표를 붙여 확실히 끊어 읽게 한다.
        if raw in SECTION_HEADS:
            body.append(line + ".")
        else:
            body.append(line if line[-1] in ".!?" else line + ".")

    text = "\n".join(head + body)
    text = re.sub(r"\n{2,}", "\n", text)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--docx", default=DEFAULT_DOCX)
    args = ap.parse_args()

    if not os.path.exists(args.docx):
        raise SystemExit(f"원고를 찾을 수 없습니다: {args.docx}")

    lines = read_docx_paragraphs(args.docx)
    tracks = build_tracks(lines)

    os.makedirs(OUT_SCRIPTS, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

    chapters, total = [], 0
    for t in tracks:
        meta = track_meta(t)
        pmeta = part_meta(t)
        text = narration(t, meta)
        total += len(text)
        name = f"book-{t['num']:02d}"
        with open(os.path.join(OUT_SCRIPTS, name + ".txt"), "w", encoding="utf-8") as f:
            f.write(text)
        chapters.append({
            "id": name,
            "no": t["num"],
            "label": meta["label"],
            "title": meta["title"],
            "subtitle": meta["subtitle"],
            "scripture": meta["scripture"],
            # 이 장부터 새 부(部)가 시작되면 목록에 부 제목을 띄운다.
            "part": (pmeta["label"] + " " + pmeta["title"]).strip(),
            "chars": len(text),
            # 실제 합성본 기준 초당 6.8자 — 목록에 보여 줄 예상 길이(초)
            "estSec": round(len(text) / 6.8),
        })

    payload = {
        "book": "레위기에서 만난 예수 그리스도",
        "author": "김동석",
        "chapters": chapters,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        f.write("window.AUDIOBOOK = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n")

    print(f"트랙 {len(chapters)}개, 낭독 글자수 {total:,}자 "
          f"(예상 {total / 6.8 / 3600:.1f}시간)")
    for c in chapters:
        print(f"  {c['id']}  {c['label']:8s} {c['title'][:22]:24s} {c['chars']:6,}자 "
              f"≈{c['estSec'] // 60}분")
    print(f"\n대본: {OUT_SCRIPTS}")
    print(f"목차: {OUT_JSON}")


if __name__ == "__main__":
    main()
