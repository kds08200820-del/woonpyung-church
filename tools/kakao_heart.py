# -*- coding: utf-8 -*-
r"""
카카오톡 단톡방 — 댓글에 하트(공감) 달기

예약 발송 창에서 "💗 댓글에 하트 달기"를 체크하면, 글을 보낸 뒤 N분이 지났을 때
예약 워커(kakao_worker.py)가 이 모듈을 불러 "보낸 시각 ~ +N분" 사이 댓글에 하트를 누른다.

  python kakao_heart.py --room "연습방" --probe
        맨 아래 댓글에 마우스를 올리기 전·후 화면을 logs 에 저장한다 (화면 보정용).
  python kakao_heart.py --room "연습방" --since 06:00 --minutes 30 --dry-run
        하트 줄 댓글을 찾기만 하고, 찾은 자리를 표시한 그림을 logs 에 저장한다.
  python kakao_heart.py --room "연습방" --since 06:00 --minutes 30
        실제로 하트를 누른다.

동작 원리:
  카카오톡 PC의 대화 목록(EVA_VH_ListControl)은 직접 그린 화면이라 글자를 읽어 올 수 없다.
  그래서 목록을 화면 캡처 → 윈도우 내장 한국어 OCR 로 "오전 6:07" 같은 시각 표시를 찾고,
  시각 표시 바로 왼쪽을 그 댓글의 말풍선으로 본다. 노란 말풍선은 내 글이다.
  하트는 말풍선에 마우스를 올리면 나타나는 공감 버튼 → 빨간 하트 순서로 누른다.
  공감 버튼 위치는 카카오톡 버전·화면 배율마다 달라서 설정 파일(kakao_qt_config.json 의
  "heart")에 보정값을 넣어야 실제로 누른다. 보정값이 없으면 찾기(dry-run)만 한다.

안전장치:
  - 말풍선 아래에 이미 빨간 하트가 있으면 누르지 않는다.
    (내가 누른 하트를 다시 누르면 꺼지기 때문 — 다른 사람이 누른 하트여도 건너뛴다)
  - 하트를 누른 뒤 다시 캡처해 하트가 생겼는지 확인하고, 안 생겼으면 그 자리에서 멈춘다.
    (엉뚱한 곳을 연달아 누르는 일을 막는다)
  - 내 글(노란 말풍선)과 날짜 구분선 위쪽은 보지 않는다.
  - 캡처 그림은 교인 대화가 담기므로 logs/ (저장소 제외) 에만 남긴다. 로그에는 시각·개수만.

알려진 한계:
  - 카카오톡은 같은 사람이 같은 분에 여러 줄을 보내면 마지막 줄에만 시각을 표시한다.
    그래서 그런 경우 마지막 말풍선 하나에만 하트가 달린다(사람마다 하나씩은 달린다).
"""
import argparse
import asyncio
import ctypes
import os
import re
import sys
import tempfile
import time
from datetime import datetime

import kakao_qt_send as K

try:
    from PIL import Image, ImageDraw, ImageGrab
except ImportError:
    K._install("pillow", "카카오톡 화면 캡처")
    from PIL import Image, ImageDraw, ImageGrab

try:
    from winsdk.windows.globalization import Language
    from winsdk.windows.graphics.imaging import BitmapDecoder
    from winsdk.windows.media.ocr import OcrEngine
    from winsdk.windows.storage import FileAccessMode, StorageFile
except ImportError:
    K._install("winsdk", "시각 글자 읽기(윈도우 OCR)")
    from winsdk.windows.globalization import Language
    from winsdk.windows.graphics.imaging import BitmapDecoder
    from winsdk.windows.media.ocr import OcrEngine
    from winsdk.windows.storage import FileAccessMode, StorageFile

win32api, win32con, win32gui = K.win32api, K.win32con, K.win32gui

# 화면 좌표·캡처 좌표를 실제 픽셀로 맞춘다 (배율 125%·150% 모니터 대비)
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

LOG_DIR = os.path.join(K.BASE_DIR, "logs")

# ── 보정값 (kakao_qt_config.json 의 "heart" 로 덮어쓴다) ─────────────
#  button_dx/dy : 말풍선 (오른쪽 끝, 아래쪽 끝) 기준, 마우스를 올리면 나타나는 공감 버튼까지의 거리.
#                 둘 다 채워져야 실제로 누른다. (--probe 로 찍은 그림을 보고 정한다)
#  hover_dx/dy  : 말풍선 (오른쪽 끝, 아래쪽 끝) 기준, 마우스를 올려 둘 자리 (말풍선 안쪽)
#  picker_box   : 공감 버튼을 누른 뒤 하트 고르는 창을 찾을 범위(버튼 중심에서 ± 픽셀)
#  scroll_notches : 한 화면 위로 올릴 때 휠을 몇 칸 굴릴지
_HEART_DEFAULTS = {
    "button_dx": None,
    "button_dy": None,
    "hover_dx": -24,
    "hover_dy": -10,
    "picker_box": 220,
    "scroll_notches": 5,
    "max_pages": 15,
    "max_hearts": 120,
}
HEART = dict(_HEART_DEFAULTS)
HEART.update({k: v for k, v in (K.CONFIG.get("heart") or {}).items() if v is not None})

# OCR 이 '오전'을 '결전'처럼 앞 글자를 틀리게 읽는 일이 있어 '전/후'만 본다.
# 콜론은 자주 빠진다("오전 601") — 뒤 두 자리를 분으로 읽는다.
TIME_RE = re.compile(r"[가-힣]?(전|후)\s*(\d{1,2})\s*[:;.]?\s*(\d{2})")
DATE_RE = re.compile(r"\d{4}\s*년\s*\d{1,2}\s*월")
OCR_SCALE = 2


class HeartError(Exception):
    """하트 작업을 멈춰야 하는 상황."""


def log(msg):
    K.log(f"[하트] {msg}")


# ── 화면 ───────────────────────────────────────────────────────────────
def grab(rect):
    """화면의 rect(왼,위,오른,아래) 부분을 캡처. 여러 모니터 좌표도 그대로 쓴다."""
    vx = win32api.GetSystemMetrics(76)       # SM_XVIRTUALSCREEN
    vy = win32api.GetSystemMetrics(77)       # SM_YVIRTUALSCREEN
    full = ImageGrab.grab(all_screens=True)
    l, t, r, b = rect
    return full.crop((l - vx, t - vy, r - vx, b - vy)).convert("RGB")


def ocr_lines(img):
    """윈도우 내장 OCR(한국어)로 줄 단위 글자와 위치를 읽는다. [(글자, x, y, w, h)] (img 좌표)"""
    big = img.resize((img.width * OCR_SCALE, img.height * OCR_SCALE), Image.LANCZOS)
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    big.save(path)

    async def run():
        f = await StorageFile.get_file_from_path_async(path)
        s = await f.open_async(FileAccessMode.READ)
        dec = await BitmapDecoder.create_async(s)
        bmp = await dec.get_software_bitmap_async()
        eng = OcrEngine.try_create_from_language(Language("ko"))
        if eng is None:
            raise HeartError("윈도우 한국어 OCR을 쓸 수 없습니다 (설정 → 언어에 한국어 필요).")
        res = await eng.recognize_async(bmp)
        out = []
        for ln in res.lines:
            ws = list(ln.words)
            if not ws:
                continue
            x0 = min(w.bounding_rect.x for w in ws)
            y0 = min(w.bounding_rect.y for w in ws)
            x1 = max(w.bounding_rect.x + w.bounding_rect.width for w in ws)
            y1 = max(w.bounding_rect.y + w.bounding_rect.height for w in ws)
            out.append((ln.text, x0 / OCR_SCALE, y0 / OCR_SCALE,
                        (x1 - x0) / OCR_SCALE, (y1 - y0) / OCR_SCALE))
        return out

    try:
        return asyncio.run(run())
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _is_red(p):
    r, g, b = p[:3]
    return r > 200 and g < 110 and b < 125 and r - g > 110


def _is_yellow(p):
    r, g, b = p[:3]
    return r > 235 and g > 200 and b < 100


def count_px(img, box, pred):
    l, t, r, b = [int(v) for v in box]
    l, t = max(l, 0), max(t, 0)
    r, b = min(r, img.width), min(img.height, b)
    if r <= l or b <= t:
        return 0
    px = img.load()
    n = 0
    for y in range(t, b):
        for x in range(l, r):
            if pred(px[x, y]):
                n += 1
    return n


def red_center(img, box, min_px=12):
    """box 안 빨간 점들의 중심 (img 좌표). 없으면 None."""
    l, t, r, b = [int(v) for v in box]
    l, t = max(l, 0), max(t, 0)
    r, b = min(r, img.width), min(img.height, b)
    px = img.load()
    xs, ys = [], []
    for y in range(t, b):
        for x in range(l, r):
            if _is_red(px[x, y]):
                xs.append(x)
                ys.append(y)
    if len(xs) < min_px:
        return None
    return sum(xs) / len(xs), sum(ys) / len(ys)


# ── 대화 목록 읽기 ─────────────────────────────────────────────────────
class Item:
    """시각 표시 하나 = 말풍선 하나."""

    def __init__(self, minute, tx, ty, tw, th):
        self.minute = minute              # 자정부터 몇 분째
        self.tx, self.ty, self.tw, self.th = tx, ty, tw, th
        self.mine = False
        self.hearted = False

    @property
    def bubble_right(self):
        return self.tx - 4

    @property
    def bubble_bottom(self):
        return self.ty + self.th + 2

    def label(self):
        return f"{self.minute // 60:02d}:{self.minute % 60:02d}"


def to_minute(ampm, h, m):
    h, m = int(h), int(m)
    if not (1 <= h <= 12 and 0 <= m <= 59):
        return None
    if ampm == "전":
        h = 0 if h == 12 else h
    else:
        h = 12 if h == 12 else h + 12
    return h * 60 + m


def scan(img):
    """캡처 한 장에서 말풍선(시각 표시)과 날짜 구분선을 찾는다. (items 위→아래, 날짜선 y 목록)"""
    items, dates = [], []
    for text, x, y, w, h in ocr_lines(img):
        if DATE_RE.search(text):
            dates.append(y)
            continue
        mt = TIME_RE.search(text)
        if not mt:
            continue
        # 시각 표시 줄은 짧다("26 오전 6:01"). 댓글 본문 속 "오전 6:00 예배" 같은 글은 거른다
        if len(text.replace(" ", "")) - len(mt.group(0).replace(" ", "")) > 4:
            continue
        minute = to_minute(*mt.groups())
        if minute is None:
            continue
        # 읽음 숫자("26 오전 6:01")가 앞에 붙어 읽히면 시각 부분만 위치를 잡는다
        if mt.start() > 0 and len(text) > 0:
            cut = w * mt.start() / len(text)
            x, w = x + cut, w - cut
        it = Item(minute, x, y, w, h)
        # 시각 표시 오른쪽에 노란 말풍선이 붙어 있으면 내 글
        it.mine = count_px(img, (x + w, y - 6, x + w + 40, y + h + 2), _is_yellow) > 30
        # 말풍선 아래 줄(공감 표시 자리)에 빨간 하트가 있으면 이미 하트가 있는 댓글
        if not it.mine:
            it.hearted = count_px(
                img, (50, it.bubble_bottom + 2, it.tx + 90, it.bubble_bottom + 34), _is_red) >= 12
        items.append(it)
    items.sort(key=lambda i: i.ty)
    return items, dates


def annotate(img, items, targets, name):
    """찾은 자리를 표시한 그림을 logs 에 저장한다 (보정·점검용, 저장소 제외 폴더)."""
    im = img.copy()
    d = ImageDraw.Draw(im)
    tset = set(id(t) for t in targets)
    for it in items:
        color = (0, 160, 0) if id(it) in tset else ((230, 180, 0) if it.mine else (120, 120, 120))
        d.rectangle((it.tx, it.ty, it.tx + it.tw, it.ty + it.th), outline=color, width=2)
        d.text((it.tx, it.ty - 12), it.label() + (" 하트있음" if it.hearted else ""), fill=color)
        if not it.mine and HEART["button_dx"] is not None:
            bx = it.bubble_right + HEART["button_dx"]
            by = it.bubble_bottom + HEART["button_dy"]
            d.ellipse((bx - 5, by - 5, bx + 5, by + 5), outline=(255, 0, 255), width=2)
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, f"kakao_heart_{name}_{datetime.now():%Y%m%d_%H%M%S}.png")
    im.save(path)
    return path


# ── 마우스 ─────────────────────────────────────────────────────────────
def move(x, y):
    win32api.SetCursorPos((int(x), int(y)))


def click(x, y):
    move(x, y)
    time.sleep(0.08)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def wheel(x, y, notches):
    """notches > 0 이면 위로(예전 글 쪽), < 0 이면 아래로."""
    move(x, y)
    step = 1 if notches > 0 else -1
    for _ in range(abs(int(notches))):
        win32api.mouse_event(win32con.MOUSEEVENTF_WHEEL, 0, 0, 120 * step, 0)
        time.sleep(0.05)
    time.sleep(0.6)


# ── 방 준비 ────────────────────────────────────────────────────────────
def prepare_room(room_name):
    """방을 열어 앞으로 내보내고 (방 창, 대화 목록 창, 원래 숨어 있었는지)를 돌려준다."""
    main_hwnd = K.ensure_kakao()
    if K.lock_mode_on(main_hwnd):
        raise HeartError("카카오톡 잠금모드가 켜져 있어 하트를 달 수 없습니다.")
    was_hidden = not win32gui.IsWindowVisible(main_hwnd)
    room = K.open_room(main_hwnd, room_name)
    title = win32gui.GetWindowText(room)
    if title != room_name:
        raise HeartError(f"열린 창 제목이 다릅니다(열림='{title}', 목표='{room_name}') — 중단합니다.")
    lists = K.children(room, "EVA_VH_ListControl_Dblclk")
    if not lists:
        raise HeartError("대화 목록(EVA_VH_ListControl)을 찾지 못했습니다.")
    K.activate(room, K.input_box(room))
    # 화면 밖으로 나가 있으면 캡처가 안 되니 확인
    l, t, r, b = win32gui.GetWindowRect(lists[0])
    vx, vy = win32api.GetSystemMetrics(76), win32api.GetSystemMetrics(77)
    vw, vh = win32api.GetSystemMetrics(78), win32api.GetSystemMetrics(79)
    if l < vx or t < vy or r > vx + vw or b > vy + vh:
        raise HeartError("채팅방 창이 화면 밖으로 나가 있어 캡처할 수 없습니다. 창을 화면 안으로 옮겨 주세요.")
    return main_hwnd, room, lists[0], was_hidden


def list_rect(lst):
    l, t, r, b = win32gui.GetWindowRect(lst)
    return l, t, r - 16, b                  # 오른쪽 스크롤바는 뺀다


# ── 하트 한 개 ─────────────────────────────────────────────────────────
def press_heart(lst, it):
    """it 말풍선에 하트를 누르고, 생겼는지 확인한다. 실패하면 HeartError."""
    L, T, R, B = list_rect(lst)
    bx, by = L + it.bubble_right, T + it.bubble_bottom
    move(bx + HEART["hover_dx"], by + HEART["hover_dy"])            # 말풍선 위에 올려 공감 버튼을 띄운다
    time.sleep(0.7)
    btn = (bx + HEART["button_dx"], by + HEART["button_dy"])
    click(*btn)
    time.sleep(0.8)

    # 하트 고르는 창에서 빨간 하트를 찾아 누른다
    pb = int(HEART["picker_box"])
    area = (btn[0] - pb, btn[1] - pb, btn[0] + pb, btn[1] + pb)
    shot = grab(area)
    c = red_center(shot, (0, 0, shot.width, shot.height))
    if not c:
        win32api.keybd_event(win32con.VK_ESCAPE, 0, 0, 0)
        win32api.keybd_event(win32con.VK_ESCAPE, 0, win32con.KEYEVENTF_KEYUP, 0)
        raise HeartError(f"{it.label()} 댓글: 공감 버튼을 눌렀는데 하트 고르는 창이 보이지 않습니다 "
                         f"(보정값 button_dx/dy 확인 필요).")
    click(area[0] + c[0], area[1] + c[1])
    time.sleep(1.0)
    move(R + 30, T + 10)                                           # 마우스를 목록 밖으로 치운다
    time.sleep(0.3)


# ── 전체 ───────────────────────────────────────────────────────────────
def heart_room(room_name, since, minutes, dry_run=False):
    """since(보낸 시각, datetime) ~ since+minutes 사이 댓글에 하트. 누른 개수를 돌려준다."""
    start_m = since.hour * 60 + since.minute
    end_m = start_m + int(minutes)                   # 이 분(分) 전까지 (끝 분 제외)
    calibrated = HEART["button_dx"] is not None and HEART["button_dy"] is not None
    if not calibrated and not dry_run:
        raise HeartError("하트 버튼 위치 보정 전입니다. kakao_qt_config.json 의 heart.button_dx/dy 를 "
                         "먼저 채워 주세요 (docs/카카오QT-자동발송-안내.md 참고).")
    log(f"'{room_name}' {since:%H:%M} ~ +{minutes}분 댓글 대상"
        + (" (dry-run: 누르지 않음)" if dry_run else ""))

    main_hwnd, room, lst, was_hidden = prepare_room(room_name)
    old_cursor = win32api.GetCursorPos()
    hearted, pages = 0, 0
    L, T, R, B = list_rect(lst)
    cx, cy = (L + R) // 2, (T + B) // 2
    try:
        wheel(cx, cy, -60)                                   # 맨 아래(최신)부터

        while pages < int(HEART["max_pages"]):
            pages += 1
            stop_here = False
            for _ in range(60):                              # 한 화면 안에서 반복 (누를 때마다 다시 캡처)
                img = grab(list_rect(lst))
                items, dates = scan(img)

                # 이 화면에서 볼 범위의 위쪽 경계: 내 원글(보낸 시각의 노란 말풍선), 날짜 구분선
                top = -1
                for it in items:
                    if it.mine and start_m - 1 <= it.minute <= start_m + 1:
                        top = max(top, it.ty)
                        stop_here = True
                for dy in dates:
                    top = max(top, dy)
                    stop_here = True
                if any(it.minute < start_m for it in items):
                    stop_here = True

                targets = [it for it in items
                           if not it.mine and not it.hearted and it.ty > top
                           and start_m <= it.minute < end_m]

                if dry_run:
                    path = annotate(img, items, targets, f"p{pages}")
                    log(f"화면 {pages}: 시각 {len(items)}개, 하트 줄 댓글 {len(targets)}개 → {path}")
                    hearted += len(targets)
                    break
                if not targets:
                    break
                if hearted >= int(HEART["max_hearts"]):
                    raise HeartError(f"한 번에 {hearted}개를 넘게 누르려 해 멈췄습니다 (max_hearts).")

                it = targets[-1]                             # 아래쪽부터
                press_heart(lst, it)

                # 확인: 같은 시각·비슷한 높이의 말풍선에 하트가 생겼는지
                img2 = grab(list_rect(lst))
                after, _ = scan(img2)
                ok = any(a.minute == it.minute and not a.mine and a.hearted
                         and abs(a.ty - it.ty) < 60 for a in after)
                if not ok:
                    path = annotate(img2, after, [], "fail")
                    raise HeartError(f"{it.label()} 댓글에 하트를 눌렀는데 확인되지 않아 멈췄습니다 "
                                     f"(화면: {os.path.basename(path)}).")
                hearted += 1
                log(f"하트 {hearted} — {it.label()} 댓글")

            if stop_here:
                break
            wheel(cx, cy, int(HEART["scroll_notches"]))      # 위로 한 화면

        log(f"끝 — {'찾은' if dry_run else '누른'} 댓글 {hearted}개, 화면 {pages}장")
        return hearted
    finally:
        try:
            wheel(cx, cy, -60)                               # 다시 맨 아래로
        except Exception:
            pass
        move(*old_cursor)
        if was_hidden:
            K.hide_main(main_hwnd)


def probe(room_name):
    """맨 아래 댓글에 마우스를 올리기 전·후를 저장한다 (보정용)."""
    main_hwnd, room, lst, was_hidden = prepare_room(room_name)
    old_cursor = win32api.GetCursorPos()
    try:
        L, T, R, B = list_rect(lst)
        wheel((L + R) // 2, (T + B) // 2, -60)
        img = grab(list_rect(lst))
        items, _ = scan(img)
        others = [i for i in items if not i.mine]
        p0 = annotate(img, items, others[-1:], "probe_before")
        log(f"시각 {len(items)}개 (다른 사람 {len(others)}개) → {p0}")
        if not others:
            log("다른 사람 댓글이 화면에 없습니다. 연습방에 댓글을 하나 달아 주세요.")
            return
        it = others[-1]
        move(L + it.bubble_right + HEART["hover_dx"], T + it.bubble_bottom + HEART["hover_dy"])
        time.sleep(1.0)
        img2 = grab(list_rect(lst))
        os.makedirs(LOG_DIR, exist_ok=True)
        p1 = os.path.join(LOG_DIR, f"kakao_heart_probe_hover_{datetime.now():%Y%m%d_%H%M%S}.png")
        img2.save(p1)
        log(f"말풍선 기준점(오른쪽 끝,아래 끝) = 목록 안 ({it.bubble_right:.0f}, {it.bubble_bottom:.0f}) "
            f"→ 마우스 올린 화면: {p1}")
        log("두 그림을 비교해 새로 나타난 공감 버튼 위치에서 기준점을 빼면 button_dx/dy 입니다.")
    finally:
        move(*old_cursor)
        if was_hidden:
            K.hide_main(main_hwnd)


def main():
    ap = argparse.ArgumentParser(description="카카오톡 단톡방 댓글에 하트 달기")
    ap.add_argument("--room", required=True, help="채팅방 이름 (정확히)")
    ap.add_argument("--since", help="글 보낸 시각 HH:MM (오늘)")
    ap.add_argument("--minutes", type=int, default=30, help="보낸 뒤 몇 분까지의 댓글 (기본 30)")
    ap.add_argument("--dry-run", action="store_true", help="찾기만 하고 누르지 않음")
    ap.add_argument("--probe", action="store_true", help="보정용 화면 저장")
    args = ap.parse_args()
    try:
        if args.probe:
            probe(args.room)
            return
        if not args.since:
            ap.error("--since 가 필요합니다 (예: --since 06:00)")
        hh, mm = args.since.split(":")
        since = datetime.now().replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        heart_room(args.room, since, args.minutes, dry_run=args.dry_run)
    except (HeartError, K.SendError) as e:
        log(f"중단: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
