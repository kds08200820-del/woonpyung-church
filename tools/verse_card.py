#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
운평장로교회 — 주보 헤드라인 "말씀 카드" 생성기.

기존 종이 주보(image1.BMP)의 방식을 그대로 따른다: 사실적인 AI 그림이 아니라
그 주 설교 본문의 핵심 구절을, 분위기에 맞는 배경 위에 얹은 카드 한 장이다.
목사님이 주신 규격(가운데 정렬 · 금색 이중 테두리 · 화살표 장식 출처줄 ·
좌우 여백에만 얇게 들어가는 장식, 중앙은 비움)을 그대로 따른다.

외부 이미지나 API를 쓰지 않는다 — 배경은 전부 이 코드가 그리고(그라디언트 +
간단한 도형), 글자는 윈도우에 이미 있는 한글 폰트(맑은 고딕·한양 바탕)로 앉힌다.
그래서 매주 비용이 들지 않고, 한글이 깨질 걱정도 없다(AI 이미지 생성 모델은
한글을 자주 이상하게 그린다).

호출하는 쪽(worship_worker.py)이 정하는 것: 구절 본문·출처·분위기(MOODS 중
하나). 이 파일은 그 셋을 받아 PNG 한 장을 돌려줄 뿐이다.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_DIR = r"C:\Windows\Fonts"
FONT_SERIF = os.path.join(FONT_DIR, "HANBatangB.ttf")   # 구절 본문 — 한양 바탕 굵게
FONT_SANS_B = os.path.join(FONT_DIR, "malgunbd.ttf")     # 출처 라벨

NAVY = (10, 44, 92)
GOLD = (168, 133, 76)

# 참고 규격(목사님이 주신 예시 카드): 가로 2000 x 세로 340 안팎의 가로로 아주 긴 배너.
CARD_W = 2000
CARD_H = 340

# 분위기별 그라디언트(위→아래) + 좌우 여백 장식 + 글자색.
# 색은 교회 브랜드(네이비 #0a2c5c · 골드 #a8915c) 계열에서 벗어나지 않게 골랐다.
MOODS = {
    "dawn":     {"grad": [(255, 246, 232), (255, 221, 186)], "ink": NAVY,          "motif": "rays"},
    "forest":   {"grad": [(240, 244, 232), (210, 224, 194)], "ink": (43, 61, 41),  "motif": "branch"},
    "water":    {"grad": [(248, 240, 226), (232, 214, 188)], "ink": (44, 55, 58),  "motif": "ships"},
    "mountain": {"grad": [(242, 235, 220), (206, 190, 162)], "ink": (61, 47, 31),  "motif": "peaks"},
    "light":    {"grad": [(255, 250, 238), (250, 232, 190)], "ink": NAVY,          "motif": "rays"},
    "storm":    {"grad": [(64, 74, 94), (34, 40, 56)],        "ink": (238, 240, 245), "motif": "streak"},
    "harvest":  {"grad": [(252, 240, 214), (222, 184, 122)], "ink": (74, 48, 20),  "motif": "wheat"},
    "garden":   {"grad": [(244, 244, 230), (214, 226, 198)], "ink": (48, 61, 43),  "motif": "branch"},
    "night":    {"grad": [(26, 34, 58), (11, 16, 34)],        "ink": (232, 232, 240), "motif": "stars"},
    "city":     {"grad": [(242, 232, 216), (210, 194, 168)], "ink": (58, 46, 30),  "motif": "arches"},
}
DEFAULT_MOOD = "light"

# 장식은 카드 폭의 이 비율 바깥쪽(좌/우 여백)에만 그린다 — 가운데는 항상 비워 글자를 담는다.
SIDE_BAND = 0.20


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _gradient(w, h, top, bottom, horizontal=False):
    if horizontal:
        im = Image.new("RGB", (w, 1))
        for x in range(w):
            im.putpixel((x, 0), _lerp(top, bottom, x / max(1, w - 1)))
        return im.resize((w, h))
    im = Image.new("RGB", (1, h))
    for y in range(h):
        im.putpixel((0, y), _lerp(top, bottom, y / max(1, h - 1)))
    return im.resize((w, h))


# ── 장식 모티프 — 전부 왼쪽 여백(0~SIDE_BAND) 또는 오른쪽 여백(1-SIDE_BAND~1)에만 그린다 ──

def _draw_branch(d, w, h, color, alpha=110):
    """왼쪽 아래에서 뻗어 나온 올리브 가지 — 참고 이미지의 좌하단 나뭇가지 장식."""
    x0, y0 = w * 0.005, h * 0.98
    x1, y1 = w * 0.16, h * 0.18
    steps = 26
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t + math.sin(t * math.pi * 1.3) * w * 0.012
        y = y0 + (y1 - y0) * t
        pts.append((x, y))
    d.line(pts, fill=color + (alpha,), width=3, joint="curve")
    for i in range(2, len(pts) - 1, 3):
        px, py = pts[i]
        ang = math.atan2(pts[i + 1][1] - pts[i - 1][1], pts[i + 1][0] - pts[i - 1][0])
        for side in (-1, 1):
            leaf_ang = ang + side * math.radians(55)
            lx = px + math.cos(leaf_ang) * w * 0.02
            ly = py + math.sin(leaf_ang) * w * 0.02
            d.ellipse([min(px, lx) - 3, min(py, ly) - 8, max(px, lx) + 3, max(py, ly) + 8],
                      fill=color + (int(alpha * 0.8),))


def _draw_ships(d, w, h, color, alpha=70):
    """오른쪽 수평선 위 배 실루엣 — 두로(에스겔 27장) 같은 상인·바다 본문에 어울림."""
    horizon = h * 0.62
    d.line([(w * (1 - SIDE_BAND - 0.02), horizon), (w, horizon)], fill=color + (int(alpha * 0.5),), width=1)
    xs = [w * (1 - SIDE_BAND + 0.02 * i) for i in range(1, 5)]
    for i, x in enumerate(xs):
        hh = h * (0.10 + (i % 2) * 0.03)
        d.line([(x, horizon), (x, horizon - hh)], fill=color + (alpha,), width=2)          # 돛대
        d.polygon([(x, horizon - hh), (x + w * 0.018, horizon - hh * 0.35), (x, horizon - hh * 0.25)],
                  fill=color + (int(alpha * 0.7),))                                        # 돛
        d.ellipse([x - w * 0.014, horizon - 3, x + w * 0.014, horizon + 3], fill=color + (alpha,))  # 선체


def _draw_rays(d, w, h, color, alpha=30):
    cx, cy = w * (1 - SIDE_BAND * 0.4), h * 0.15
    for i in range(-3, 8):
        ang = math.radians(i * 12)
        x2 = cx + math.cos(ang) * w * 0.5
        y2 = cy + math.sin(ang) * w * 0.5
        d.polygon([(cx, cy), (x2, y2 - 8), (x2, y2 + 8)], fill=color + (alpha,))


def _draw_peaks(d, w, h, color, alpha=50):
    x0 = w * (1 - SIDE_BAND)
    for row, scale in enumerate([0.5, 0.36, 0.24]):
        y0 = h * (1 - scale)
        step = (w - x0) / 3
        pts = [(x0, h)]
        for i in range(4):
            x = x0 + i * step
            y = y0 + (0 if i % 2 == 0 else h * 0.05)
            pts.append((x, y))
        pts.append((w, h))
        d.polygon(pts, fill=color + (alpha,))


def _draw_streak(d, w, h, color, alpha=60):
    x = w * (1 - SIDE_BAND * 0.5)
    pts = [(x, 0), (x - w * 0.02, h * 0.4), (x + w * 0.006, h * 0.42), (x - w * 0.026, h)]
    d.line(pts, fill=color + (alpha,), width=5, joint="curve")


def _draw_wheat(d, w, h, color, alpha=55):
    x0 = w * (1 - SIDE_BAND)
    for i in range(6):
        x = x0 + (w - x0) * (0.15 + i * 0.14)
        d.line([(x, h), (x, h * 0.12)], fill=color + (alpha,), width=3)
        for k in range(4):
            yy = h * 0.12 + k * h * 0.07
            d.line([(x, yy), (x - w * 0.008, yy - h * 0.02)], fill=color + (alpha,), width=2)
            d.line([(x, yy), (x + w * 0.008, yy - h * 0.02)], fill=color + (alpha,), width=2)


def _draw_stars(d, w, h, color, alpha=160):
    rnd = random.Random(7)
    for _ in range(16):
        x = rnd.uniform(w * (1 - SIDE_BAND), w * 0.99)
        y = rnd.uniform(h * 0.05, h * 0.55)
        r = rnd.choice([1, 1, 2])
        d.ellipse([x - r, y - r, x + r, y + r], fill=color + (alpha,))


def _draw_arches(d, w, h, color, alpha=48):
    base = h * 0.99
    x0 = w * (1 - SIDE_BAND)
    for i in range(3):
        cx = x0 + (w - x0) * (0.2 + i * 0.32)
        r = h * 0.28
        d.arc([cx - r, base - 2 * r, cx + r, base], 180, 360, fill=color + (alpha,), width=6)


_MOTIFS = {
    "rays": _draw_rays, "branch": _draw_branch, "ships": _draw_ships,
    "peaks": _draw_peaks, "streak": _draw_streak, "wheat": _draw_wheat,
    "stars": _draw_stars, "arches": _draw_arches,
}


def _font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _fit_lines(draw, text, font, max_width, max_lines=2):
    """긴 구절이면 줄바꿈, 그래도 안 들어가면 살짝 줄여 잘라낸다(말줄임표)."""
    lines, cur = [], ""
    for ch in text:
        trial = cur + ch
        if draw.textlength(trial, font=font) > max_width and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while draw.textlength(last + "…", font=font) > max_width and len(last) > 1:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def _center_text(d, cx, y, text, font, fill):
    w = d.textlength(text, font=font)
    d.text((cx - w / 2, y), text, font=font, fill=fill)


def _draw_frame(d, w, h, color):
    """참고 이미지의 금색 이중 테두리 — 바깥 굵은 선 + 안쪽 얇은 선."""
    m1 = int(min(w, h) * 0.028)
    m2 = m1 + max(4, int(min(w, h) * 0.018))
    d.rectangle([m1, m1, w - 1 - m1, h - 1 - m1], outline=color, width=2)
    d.rectangle([m2, m2, w - 1 - m2, h - 1 - m2], outline=color, width=1)
    return m2


def _ref_flourish(d, cx, y, ref, font, color, arm=80, gap=14):
    """"——→  겔 27:36  ←——" 형태의 화살표 장식 출처줄."""
    tw = d.textlength(ref, font=font)
    lx1, lx2 = cx - tw / 2 - gap, cx - tw / 2 - gap - arm
    rx1, rx2 = cx + tw / 2 + gap, cx + tw / 2 + gap + arm
    ymid = y + font.size * 0.42
    d.line([(lx2, ymid), (lx1, ymid)], fill=color, width=1)
    d.polygon([(lx1, ymid), (lx1 - 10, ymid - 5), (lx1 - 10, ymid + 5)], fill=color)
    d.line([(rx1, ymid), (rx2, ymid)], fill=color, width=1)
    d.polygon([(rx2, ymid), (rx2 + 10, ymid - 5), (rx2 + 10, ymid + 5)], fill=color)
    d.text((cx - tw / 2, y), ref, font=font, fill=color)


def render(verse, ref, mood=None, width=CARD_W, height=CARD_H):
    """말씀 카드 PNG(PIL Image, RGB)를 만들어 돌려준다.

    verse : 인용할 성경 구절 원문(필수, 지어내면 안 됨 — 호출자 책임)
    ref   : 출처 표기, 예) "에스겔 27:36" (또는 짧게 "겔 27:36")
    mood  : MOODS 키 중 하나. 모르면 DEFAULT_MOOD.
    """
    mood = mood if mood in MOODS else DEFAULT_MOOD
    spec = MOODS[mood]

    img = _gradient(width, height, spec["grad"][0], spec["grad"][1], horizontal=True).convert("RGB")
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    motif = _MOTIFS.get(spec["motif"])
    if motif:
        motif(d, width, height, spec["ink"])
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # 은은한 비네트 — 인쇄물 느낌
    vig = Image.new("L", (width, height), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-width * 0.15, -height * 0.9, width * 1.15, height * 1.9], fill=30)
    vig = vig.filter(ImageFilter.GaussianBlur(width * 0.06))
    dark = Image.new("RGB", (width, height), (0, 0, 0))
    img = Image.composite(img, Image.blend(img, dark, 0.12), vig)

    d = ImageDraw.Draw(img)
    inset = _draw_frame(d, width, height, GOLD)
    ink = spec["ink"]
    cx = width / 2
    max_w = width * (1 - SIDE_BAND * 2)  # 가운데만 사용 — 좌우 장식 영역 침범 금지

    verse_size = max(26, int(height * 0.135))
    f_verse = _font(FONT_SERIF, verse_size)
    lines = _fit_lines(d, verse, f_verse, max_w, max_lines=2)
    while (len(lines) > 2 or any(d.textlength(ln, font=f_verse) > max_w for ln in lines)) and verse_size > 20:
        verse_size -= 2
        f_verse = _font(FONT_SERIF, verse_size)
        lines = _fit_lines(d, verse, f_verse, max_w, max_lines=2)

    f_ref = _font(FONT_SANS_B, max(14, int(height * 0.062)))
    line_h = int(verse_size * 1.5)
    block_h = line_h * len(lines) + int(height * 0.22)
    y = (height - block_h) / 2 + inset * 0.15

    for ln in lines:
        _center_text(d, cx, y, ln, f_verse, ink)
        y += line_h

    y += int(height * 0.05)
    _ref_flourish(d, cx, y, ref, f_ref, GOLD, arm=int(width * 0.045))

    return img


def save(path, verse, ref, mood=None, **kw):
    im = render(verse, ref, mood=mood, **kw)
    im.save(path, "PNG", optimize=True)
    return path


if __name__ == "__main__":
    # 자체 시험 — 분위기별로 한 장씩 만들어 눈으로 확인할 수 있게 한다.
    out = os.path.join(os.path.dirname(__file__), "_verse_card_preview")
    os.makedirs(out, exist_ok=True)
    samples = {
        "water": ("많은 민족의 상인들이 다 너를 비웃음이여 네가 공포의 대상이 되고 네가 영원히 다시 있지 못하리라 하셨느니라", "겔 27:36"),
        "forest": ("에덴의 모든 나무 곧 레바논의 뛰어나고 아름다운 나무들이 지하에서 위로를 받게 하였느니라", "에스겔 31:16"),
    }
    for mood, (verse, ref) in samples.items():
        save(os.path.join(out, mood + ".png"), verse, ref, mood=mood)
    for mood in MOODS:
        if mood not in samples:
            save(os.path.join(out, mood + ".png"),
                 "여호와는 나의 목자시니 내게 부족함이 없으리로다", "시편 23:1", mood=mood)
    print("done")
