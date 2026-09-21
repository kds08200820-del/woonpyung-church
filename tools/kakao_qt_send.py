# -*- coding: utf-8 -*-
r"""
운평장로교회 — 오늘의 QT 카카오톡 단톡방 자동 발송

홈페이지 QT(Supabase `qt_published` 공개 뷰) → 카카오톡 PC 단톡방으로 전문 발송.

사용법:
  python kakao_qt_send.py --dry-run     # 전송 직전까지만 (입력창에 넣지도 않음)
  python kakao_qt_send.py --preview     # 보낼 메시지 본문만 출력하고 종료
  python kakao_qt_send.py               # 실제 발송
  python kakao_qt_send.py --room "나와의 채팅" --date 2026-09-21

동작 원리:
  카카오 공식 메시지 API는 단톡방 발송을 지원하지 않는다(나에게/친구 1:1만 가능).
  그래서 이미 로그인된 카카오톡 PC 창을 Win32로 조작한다.

  주의: WM_SETTEXT로 글자만 밀어 넣으면 컨트롤에 보이기는 해도 카카오톡 내부
  입력 버퍼는 '비어 있다'고 보기 때문에 Enter를 눌러도 아무것도 전송되지 않는다.
  그래서 실제 사용자 입력과 같은 경로인
  '창 활성화 → 클립보드 붙여넣기(Ctrl+V) → Enter'를 쓴다.
  발송하는 몇 초 동안만 채팅창이 앞으로 나온다(오전 6시 실행이라 문제 없음).

안전장치:
  - 로그인은 자동화하지 않는다. 카카오톡 PC의 '자동 로그인'을 사용한다.
    (비밀번호를 스크립트·스케줄러에 남기지 않기 위함)
  - 잠금모드가 켜져 있으면 발송하지 않고 중단한다.
  - 열린 창 제목이 목표 방 이름과 정확히 일치할 때만 발송한다(오발송 방지).
  - 오늘 날짜 QT가 없으면 어제 것을 대신 보내지 않고 건너뛴다.
  - 같은 날 이미 보냈으면 다시 보내지 않는다(중복 실행 방지).
"""
import argparse
import ctypes
import json
import os
import re
import subprocess
import sys
import time
from ctypes import wintypes
from datetime import datetime

def _install(pkg, why):
    """없는 패키지를 그 자리에서 설치한다.

    PC마다 파이썬 환경이 달라 "ModuleNotFoundError"로 멈추는 일이 잦다.
    새 PC에서도 배치 파일만 켜면 되도록 여기서 알아서 챙긴다.
    """
    print(f"[설치] {why}에 필요한 {pkg} 이(가) 없어 설치합니다. 잠시만 기다려 주세요…")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", pkg])
    except Exception as e:
        sys.exit(f"{pkg} 설치에 실패했습니다. 아래 명령을 직접 실행해 주세요:\n"
                 f'  "{sys.executable}" -m pip install {pkg}\n원인: {e}')


try:
    import requests
except ImportError:
    _install("requests", "홈페이지 QT 조회")
    import requests

try:
    import win32api
    import win32clipboard
    import win32con
    import win32gui
    import win32process
except ImportError:
    _install("pywin32", "카카오톡 창 조작")
    import win32api
    import win32clipboard
    import win32con
    import win32gui
    import win32process

for _s in (sys.stdout, sys.stderr):
    if _s and hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

# ── 설정 ───────────────────────────────────────────────────────────────
SITE_URL = "https://k-logos.com"

# 홈페이지가 쓰는 공개 QT 뷰 (config.js의 공개 anon 키 — 비밀 아님)
CHURCH_SUPABASE_URL = "https://cetacttsdwzxjzkyozgd.supabase.co"
CHURCH_ANON_KEY = "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(BASE_DIR, "logs", "kakao_qt.log")
STATE_PATH = os.path.join(BASE_DIR, "logs", "kakao_qt_state.json")

# 단톡방 이름은 운영 정보라 공개 저장소에 두지 않는다.
# kakao_qt_config.example.json 을 kakao_qt_config.json 으로 복사해 채운다.
CONFIG_PATH = os.path.join(BASE_DIR, "kakao_qt_config.json")
_DEFAULTS = {
    "room_name": "",
    "kakao_exe": r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe",
    "max_chars": 4000,                  # 카카오톡 한 메시지 분할 기준
}


def load_config():
    cfg = dict(_DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if v})
    return cfg


CONFIG = load_config()
ROOM_NAME = CONFIG["room_name"]
KAKAO_EXE = CONFIG["kakao_exe"]
MAX_CHARS = int(CONFIG["max_chars"])

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]

# 빈 입력창에 카카오톡이 표시하는 안내 문구 (실제 입력으로 오인 금지)
PLACEHOLDERS = {"메시지 입력", "메시지를 입력하세요", "대화를 입력하세요"}

# ── Win32 도우미 ───────────────────────────────────────────────────────
_u32 = ctypes.windll.user32
_u32.SendMessageW.restype = ctypes.c_longlong
_u32.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, ctypes.c_size_t, ctypes.c_void_p]


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


class SendError(Exception):
    """발송을 중단해야 하는 상황. 워커(kakao_worker.py)가 잡아서 작업을 실패 처리한다."""


def die(msg, code=1):
    raise SendError(msg)


def children(parent, cls=None, text_prefix=None):
    """자식 창을 클래스/텍스트 접두사로 찾는다."""
    out = []

    def cb(h, _):
        c = win32gui.GetClassName(h)
        t = win32gui.GetWindowText(h)
        if (cls is None or c == cls) and (text_prefix is None or t.startswith(text_prefix)):
            out.append(h)
    win32gui.EnumChildWindows(parent, cb, None)
    return out


def get_text(hwnd):
    """다른 프로세스의 자식 컨트롤 텍스트 읽기(WM_GETTEXT)."""
    n = _u32.SendMessageW(hwnd, win32con.WM_GETTEXTLENGTH, 0, None)
    buf = ctypes.create_unicode_buffer(int(n) + 4)
    _u32.SendMessageW(hwnd, win32con.WM_GETTEXT, len(buf), ctypes.cast(buf, ctypes.c_void_p))
    return buf.value


def box_content(hwnd):
    """입력창의 '실제' 내용.

    카카오톡은 입력창이 비어 있을 때 안내 문구('메시지 입력')를 컨트롤 텍스트로
    넣어 두는데, WM_GETTEXT로는 사용자가 친 글과 구분되지 않는다.
    이를 걸러내지 않으면 (1) 전송 직후 '아직 안 보내졌다'고 오판하고
    (2) 안내 문구를 진짜 입력으로 되돌려 써넣는다.
    """
    t = get_text(hwnd)
    return "" if t.strip() in PLACEHOLDERS else t


def set_text(hwnd, text):
    return _u32.SendMessageW(
        hwnd, win32con.WM_SETTEXT, 0,
        ctypes.cast(ctypes.create_unicode_buffer(text), ctypes.c_void_p))


def get_clipboard():
    """현재 클립보드의 텍스트(없으면 None). 발송 후 되돌려 놓기 위해 쓴다."""
    for _ in range(10):
        try:
            win32clipboard.OpenClipboard()
            try:
                if win32clipboard.IsClipboardFormatAvailable(win32con.CF_UNICODETEXT):
                    return win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
                return None
            finally:
                win32clipboard.CloseClipboard()
        except Exception:
            time.sleep(0.2)
    return None


def set_clipboard(text):
    for _ in range(10):
        try:
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                if text:
                    win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, text)
            finally:
                win32clipboard.CloseClipboard()
            return True
        except Exception:
            time.sleep(0.2)
    return False


def key(vk, ctrl=False):
    """실제 키 입력. 카카오톡이 사용자의 입력으로 받아들이게 하려면 이 경로여야 한다."""
    if ctrl:
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
    win32api.keybd_event(vk, 0, 0, 0)
    time.sleep(0.03)
    win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
    if ctrl:
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)


def activate(room_hwnd, box_hwnd):
    """채팅창을 앞으로 내보내고 입력창에 키보드 포커스를 준다."""
    cur = win32api.GetCurrentThreadId()
    tid = win32process.GetWindowThreadProcessId(room_hwnd)[0]
    try:
        win32process.AttachThreadInput(cur, tid, True)
        win32gui.ShowWindow(room_hwnd, win32con.SW_RESTORE)
        try:
            win32gui.SetForegroundWindow(room_hwnd)
        except Exception:
            pass
        win32gui.SetFocus(box_hwnd)
    finally:
        try:
            win32process.AttachThreadInput(cur, tid, False)
        except Exception:
            pass
    time.sleep(0.5)
    return win32gui.GetForegroundWindow() == room_hwnd


def clear_box(box_hwnd):
    key(ord("A"), ctrl=True)
    key(win32con.VK_DELETE)
    time.sleep(0.2)


def paste_text(box_hwnd, text, attempts=6, delay=0.7):
    """클립보드로 붙여넣고 실제로 들어갔는지 확인한다."""
    want = text.strip()
    for _ in range(attempts):
        clear_box(box_hwnd)
        if not set_clipboard(text):
            time.sleep(delay)
            continue
        key(ord("V"), ctrl=True)
        time.sleep(delay)
        if box_content(box_hwnd).replace("\r\n", "\n").strip() == want:
            return True
    return False


def wait_until_sent(hwnd, timeout=20.0):
    """입력창이 비워지면 전송된 것으로 본다."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not box_content(hwnd).strip():
            return True
        time.sleep(0.25)
    return False


# ── 1. QT 가져오기 ─────────────────────────────────────────────────────
def strip_html(text):
    if not text:
        return ""
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.I)
    text = re.sub(r"</\s*(p|div|li|h[1-6])\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fetch_qt(date_str):
    """해당 날짜의 QT를 가져온다. 없으면 None (과거 것으로 대체하지 않는다)."""
    headers = {"apikey": CHURCH_ANON_KEY, "Authorization": f"Bearer {CHURCH_ANON_KEY}"}
    url = (f"{CHURCH_SUPABASE_URL}/rest/v1/qt_published"
           f"?select=sermon_date,title,scripture,qt_bible_text,content,prayer"
           f"&sermon_date=eq.{date_str}&limit=1")
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def build_message(row):
    d = datetime.strptime(row["sermon_date"], "%Y-%m-%d")
    head = f"🌿 오늘의 QT — {d:%Y년 %m월 %d일} ({WEEKDAYS[d.weekday()]})"
    parts = [head, "", f"📖 {row.get('title') or ''}".rstrip()]
    if row.get("scripture"):
        parts.append(f"✝️ 본문 : {row['scripture']}")

    bible = strip_html(row.get("qt_bible_text"))
    body = strip_html(row.get("content"))
    prayer = strip_html(row.get("prayer"))

    if bible:
        parts += ["", "━━━ 말씀 ━━━", bible]
    if body:
        parts += ["", "━━━ 묵상 ━━━", body]
    if prayer:
        parts += ["", "━━━ 기도 ━━━", prayer]
    parts += ["", f"운평장로교회 {SITE_URL}"]
    return "\n".join(parts).strip()


def split_message(text, limit=MAX_CHARS):
    """카카오톡 길이 제한에 맞춰 문단 경계에서 나눈다."""
    if len(text) <= limit:
        return [text]
    chunks, cur = [], ""
    for para in text.split("\n\n"):
        candidate = para if not cur else cur + "\n\n" + para
        if len(candidate) <= limit:
            cur = candidate
            continue
        if cur:
            chunks.append(cur)
        while len(para) > limit:                      # 한 문단이 통째로 길 때
            cut = para.rfind("\n", 0, limit)
            if cut < limit // 2:
                cut = limit
            chunks.append(para[:cut].strip())
            para = para[cut:].strip()
        cur = para
    if cur:
        chunks.append(cur)
    total = len(chunks)
    return [f"{c}\n\n({i}/{total})" for i, c in enumerate(chunks, 1)]


# ── 2. 카카오톡 준비 ───────────────────────────────────────────────────
def find_main(timeout=0):
    deadline = time.time() + timeout
    while True:
        h = win32gui.FindWindow("EVA_Window_Dblclk", "카카오톡")
        if h:
            return h
        if time.time() >= deadline:
            return 0
        time.sleep(2)


def ensure_kakao():
    """카카오톡이 로그인된 상태인지 확인하고, 아니면 실행만 한다(비밀번호 입력 없음)."""
    h = find_main()
    if h and not login_window():
        return h

    if not h:
        if not os.path.exists(KAKAO_EXE):
            raise SendError(f"카카오톡 실행 파일을 찾지 못했습니다: {KAKAO_EXE}")
        log("카카오톡이 실행돼 있지 않아 시작합니다 (자동 로그인 설정 필요)")
        subprocess.Popen([KAKAO_EXE])
        h = find_main(timeout=90)

    # 로그인 창이 떠 있으면 목록이 비어 있어 방을 찾을 수 없다 — 바로 알린다
    if login_window():
        raise SendError(LOGIN_MSG)
    if not h:
        raise SendError("카카오톡 로그인 창을 넘어가지 못했습니다. "
                        "카카오톡 PC 설정에서 '자동 로그인'을 켜 주세요.")
    return h


def login_window():
    """로그인 창이 떠 있으면 그 핸들, 아니면 0. (로그아웃 상태 판별)

    로그아웃되면 메인 창(EVA_Window_Dblclk '카카오톡')은 그대로 남은 채 숨고,
    별도의 로그인 창(EVA_Window, 같은 제목)이 뜬다. 이때 채팅·친구 목록이
    비어 있어서, 확인하지 않으면 "방을 열지 못했습니다"라는 엉뚱한 사유로 실패한다.
    """
    found = []

    def cb(h, _):
        if (win32gui.IsWindowVisible(h)
                and win32gui.GetClassName(h) == "EVA_Window"
                and win32gui.GetWindowText(h) == "카카오톡"):
            found.append(h)
    win32gui.EnumWindows(cb, None)
    return found[0] if found else 0


LOGIN_MSG = ("카카오톡이 로그아웃되어 로그인 창이 떠 있습니다. "
             "카카오톡에 로그인한 뒤 '자동 로그인'을 켜 주세요. "
             "(보안을 위해 이 프로그램은 비밀번호를 대신 입력하지 않습니다)")


def show_main(main_hwnd):
    """트레이에 내려가 있던 카카오톡 메인 창을 다시 띄운다.

    ShowWindow(SW_SHOW)로 억지로 띄우면 창은 보이지만 목록이 채워지지 않는다.
    WM_SYSCOMMAND/SC_RESTORE 로 앱 자신의 복원 경로를 타야 제대로 살아난다.
    """
    if not win32gui.IsWindowVisible(main_hwnd) or win32gui.IsIconic(main_hwnd):
        win32api.PostMessage(main_hwnd, win32con.WM_SYSCOMMAND, win32con.SC_RESTORE, 0)
        for _ in range(20):
            time.sleep(0.25)
            if win32gui.IsWindowVisible(main_hwnd) and not win32gui.IsIconic(main_hwnd):
                break
    try:
        win32gui.SetForegroundWindow(main_hwnd)
    except Exception:
        pass
    time.sleep(0.6)


def ensure_chat_tab(main_hwnd):
    """'친구' 탭에 있으면 '채팅' 탭으로 옮긴다.

    채팅 탭이 아니면 채팅 목록·검색칸이 숨어 있어 방을 찾을 수 없다.
    왼쪽 탭 막대는 별도 컨트롤 없이 OnlineMainView 에 직접 그려져 있어서
    좌표로 눌러야 한다. 버전·배율에 따라 위치가 달라질 수 있으므로
    맨 위 영역(친구/채팅/더보기)만 훑고, 채팅 목록이 나타나면 즉시 멈춘다.
    """
    views = children(main_hwnd, "EVA_Window", "ChatRoomListView")
    if not views:
        return False
    view = views[0]
    if win32gui.IsWindowVisible(view):
        return True

    omv = children(main_hwnd, "EVA_ChildWindow", "OnlineMainView")
    if not omv:
        return False
    omv = omv[0]
    for y in range(24, 200, 8):
        lp = (y << 16) | 31
        win32api.PostMessage(omv, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lp)
        time.sleep(0.05)
        win32api.PostMessage(omv, win32con.WM_LBUTTONUP, 0, lp)
        time.sleep(0.45)
        if win32gui.IsWindowVisible(view):
            log("채팅 탭으로 전환했습니다")
            return True
    return False


def hide_main(main_hwnd):
    """발송 전에 숨어 있었다면 원래대로 트레이로 되돌린다."""
    try:
        win32gui.ShowWindow(main_hwnd, win32con.SW_HIDE)
    except Exception:
        pass


def lock_mode_on(main):
    for h in children(main, "EVA_ChildWindow_Dblclk", "LockModeView"):
        if win32gui.IsWindowVisible(h):
            return True
    return False


def open_room(main, room_name, timeout=20):
    """단톡방 창을 연다. 제목이 정확히 일치하는 창만 돌려준다."""
    h = win32gui.FindWindow("EVA_Window_Dblclk", room_name)
    if h:
        log(f"이미 열려 있는 창 사용: {room_name}")
        return h

    show_main(main)          # 트레이에 내려가 있으면 띄운다 — 숨은 채로는 검색이 안 된다
    ensure_chat_tab(main)    # '친구' 탭이면 채팅 목록이 숨어 있다
    view = children(main, "EVA_Window", "ChatRoomListView")
    if not view:
        die("채팅 목록(ChatRoomListView)을 찾지 못했습니다.")
    view = view[0]
    edit = children(view, "Edit")
    search = children(view, "EVA_VH_ListControl_Dblclk", "SearchListCtrl")
    if not edit or not search:
        die("채팅 검색창/검색결과 목록을 찾지 못했습니다.")

    set_text(edit[0], room_name)
    time.sleep(1.5)
    # 검색결과 첫 줄 더블클릭
    win32gui.SendMessage(search[0], win32con.WM_LBUTTONDBLCLK, 1, (15 << 16) | 30)

    deadline = time.time() + timeout
    while time.time() < deadline:
        h = win32gui.FindWindow("EVA_Window_Dblclk", room_name)
        if h:
            set_text(edit[0], "")           # 검색창 원상복구
            time.sleep(1.5)                 # 입력창이 준비될 때까지 잠시 대기
            log(f"단톡방 창 열림: {room_name}")
            return h
        time.sleep(0.5)
    set_text(edit[0], "")
    if login_window():
        raise SendError(LOGIN_MSG)
    raise SendError(f"'{room_name}' 방을 열지 못했습니다. "
                    f"카카오톡에 보이는 방 이름과 정확히 같은지, "
                    f"카카오톡 채팅 목록이 정상으로 보이는지 확인하세요.")


def input_box(room_hwnd):
    boxes = children(room_hwnd, "RICHEDIT50W")
    if not boxes:
        die("채팅 입력창(RICHEDIT50W)을 찾지 못했습니다.")
    return boxes[0]


# ── 3. 발송 ────────────────────────────────────────────────────────────
def send_chunks(room_hwnd, chunks, dry_run=False):
    box = input_box(room_hwnd)

    # 쓰다 만 글이 있으면 잠시 치워 뒀다가 발송 후 그대로 되돌려 놓는다.
    # (내용은 절대 로그에 남기지 않는다 — 길이만 기록)
    draft = box_content(box)
    if draft.strip():
        log(f"입력창에 작성 중이던 글 {len(draft)}자를 보관합니다 (발송 후 복원)")

    if dry_run:
        for i, chunk in enumerate(chunks, 1):
            log(f"[dry-run] {i}/{len(chunks)}번째 메시지 {len(chunk)}자 — 입력·전송하지 않음")
        return

    saved_clip = get_clipboard()

    def restore():
        # 쓰다 만 글은 클립보드 경로로 되돌려 놓는다.
        # (WM_SETTEXT로 넣으면 보이기만 하고 카카오톡은 빈 줄로 취급한다)
        try:
            if draft.strip():
                if paste_text(box, draft):
                    log("보관해 둔 글을 입력창에 되돌려 놓았습니다")
                else:
                    log("경고: 보관해 둔 글을 되돌리지 못했습니다")
            else:
                clear_box(box)
        finally:
            set_clipboard(saved_clip)   # 사용자의 클립보드 원상복구

    try:
        if not activate(room_hwnd, box):
            log("경고: 채팅창을 앞으로 내보내지 못했습니다 — 그대로 시도합니다")

        for i, chunk in enumerate(chunks, 1):
            if not paste_text(box, chunk):
                die(f"{i}번째 메시지가 입력창에 제대로 들어가지 않아 중단합니다.")

            key(win32con.VK_RETURN)
            if not wait_until_sent(box):
                die(f"{i}번째 메시지가 전송되지 않았습니다(입력창에 그대로 남음).")
            log(f"전송 완료 {i}/{len(chunks)} ({len(chunk)}자)")
            if i < len(chunks):
                time.sleep(1.0)
    finally:
        restore()


# ── 4. 중복 발송 방지 ──────────────────────────────────────────────────
def already_sent(date_str, room):
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            st = json.load(f)
    except Exception:
        return False
    return st.get("last_sent_date") == date_str and st.get("room") == room


def mark_sent(date_str, room):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump({"last_sent_date": date_str, "room": room,
                   "sent_at": datetime.now().isoformat(timespec="seconds")},
                  f, ensure_ascii=False, indent=2)


# ── main ───────────────────────────────────────────────────────────────
def send_to_room(room_name, message, dry_run=False):
    """임의의 본문을 지정한 단톡방으로 보낸다. 실패하면 SendError.

    CLI(오늘의 QT)와 예약 발송 워커(kakao_worker.py)가 함께 쓰는 진입점이다.
    보낸 메시지 건수를 돌려준다.
    """
    if not room_name:
        raise SendError("보낼 채팅방 이름이 비어 있습니다.")

    main_hwnd = ensure_kakao()
    if lock_mode_on(main_hwnd):
        raise SendError("카카오톡 잠금모드가 켜져 있어 발송할 수 없습니다. 잠금모드를 해제해 주세요.")

    # 발송 때문에 띄운 창은 발송이 끝나면 원래대로 트레이에 되돌려 놓는다
    was_hidden = not win32gui.IsWindowVisible(main_hwnd)
    try:
        room_hwnd = open_room(main_hwnd, room_name)
        title = win32gui.GetWindowText(room_hwnd)
        if title != room_name:
            raise SendError(f"열린 창 제목이 다릅니다(열림='{title}', 목표='{room_name}') "
                            f"— 오발송 방지로 중단합니다.")

        chunks = split_message(message)
        send_chunks(room_hwnd, chunks, dry_run=dry_run)
        return len(chunks)
    finally:
        if was_hidden:
            hide_main(main_hwnd)


def main():
    ap = argparse.ArgumentParser(description="오늘의 QT 카카오톡 단톡방 발송")
    ap.add_argument("--room", default=ROOM_NAME, help="보낼 채팅방 이름")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (기본: 오늘)")
    ap.add_argument("--dry-run", action="store_true", help="전송 직전까지만 실행")
    ap.add_argument("--preview", action="store_true", help="메시지 본문만 출력")
    ap.add_argument("--force", action="store_true", help="같은 날 재발송 허용")
    args = ap.parse_args()

    if not args.room:
        die("보낼 채팅방이 정해지지 않았습니다. "
            f"{os.path.basename(CONFIG_PATH)} 의 room_name 을 채우거나 --room 으로 지정하세요.")

    date_str = args.date or datetime.now().strftime("%Y-%m-%d")

    row = fetch_qt(date_str)
    if not row:
        log(f"{date_str} 날짜의 QT가 홈페이지에 없습니다 — 발송을 건너뜁니다.")
        sys.exit(2)

    message = build_message(row)
    chunks = split_message(message)
    log(f"QT 수신: {row['sermon_date']} — {row.get('title')} "
        f"({row.get('scripture')}) / {len(message)}자 / 메시지 {len(chunks)}건")

    if args.preview:
        print("\n" + "=" * 60)
        for i, c in enumerate(chunks, 1):
            print(f"--- 메시지 {i}/{len(chunks)} ({len(c)}자) ---\n{c}\n")
        print("=" * 60)
        return

    if not args.force and not args.dry_run and already_sent(date_str, args.room):
        log(f"{date_str} QT는 이미 '{args.room}'에 발송했습니다 — 중복 발송하지 않습니다.")
        return

    send_to_room(args.room, message, dry_run=args.dry_run)

    if args.dry_run:
        log("dry-run 완료 — 실제로는 아무것도 보내지 않았습니다.")
    else:
        mark_sent(date_str, args.room)
        log(f"'{args.room}' 발송 완료 ({len(chunks)}건)")


if __name__ == "__main__":
    try:
        main()
    except SendError as e:
        log(f"중단: {e}")
        sys.exit(1)
