# -*- coding: utf-8 -*-
"""운평장로교회 홈페이지 전체를 '도서관 테마'(설교자의 서재와 같은 색)로 바꾼다 — 2026-10-23 담임목사 지시.

색 바꾸기 규칙(한 번에, 같은 규칙으로):
  · 정해 둔 색(EXACT): 남색 #032257 → 먹갈색 #3A281C, 연남색 → #6E523C, 금색 → 테라코타 #B5562F, 선·바탕 → 도서관 선·크림 …
  · 파란 계열(색상 190~260°): 같은 밝기의 따뜻한 흙빛(색상 26°)으로, 채도는 낮춰서
  · 금·황토 계열(색상 30~55°): 짙은 것은 테라코타 쪽(18°), 옅은 것은 크림(33°)으로
  · 무채색 회색: 같은 밝기의 따뜻한 회색으로 (흰색·검정은 그대로)
  · 그대로: 흰색·검정, 빨강(삭제·경고), 초록(완료), 노랑(카카오 등), 상표 색(카카오·네이버·인스타그램·유튜브·페이스북)
#RGB·#RRGGBB·rgb()·rgba() 를 모두 본다. 대상: 저장소의 *.html, css/*.css, js/*.js (모두의 성경 modu/, 신앙 정원 garden,
We Church·허브(library.css·wechurch·world·hub), 남의 라이브러리(vendor·*.min.js), OneDrive 충돌 사본(-당회실PC)은 빼고).

  python tools/theme/apply_library_theme.py --dry     바뀔 색 표만 보기
  python tools/theme/apply_library_theme.py           파일에 적용
"""
import colorsys
import io
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

EXACT = {
    '032257': '3A281C', '4a6a9c': '6E523C', 'b89b5e': 'B5562F', '1a3560': '2A1D14', '0a2c5c': '2E2016',
    'e6e3dd': 'E6D8C6', 'f7f5f0': 'F6EFE5', '1a1a1a': '3A281C', '4a4a4a': '4A3628', '8a8a8a': '8B7B6C',
    '15171c': '2E2016', '16181c': '2E2016', 'c0392b': 'A33A2A', 'fdecea': 'FBEDEA', '1e874b': '2F6B4F', 'e8f6ee': 'E6F2EC',
    'f6f3ec': 'F3EADF', 'fbf8f1': 'FBF5EC', 'f5f1e6': 'F3EADF',
}
KEEP = {  # 상표·신호 색
    'fee500', '3a1d1d', 'ff2d55', 'ee2a7b', 'f9ce34', 'dd2483', 'c9186e', 'e62117', 'e0245e', '1877f2', '03c75a', '1da1f2',
    '000000', 'ffffff', '191919', 'ffe812', 'fae100', '5f0080', '6228d7', 'ff0000', '0068c3',
}
SKIP_PARTS = ('modu/', 'vendor/', '.min.js', 'jszip', 'sortable', 'garden', 'library.css', 'wechurch', 'js/world/', 'js/hub/',
              'sermon-editor.js', '.claude/', 'tools/', 'supabase/', 'apps-script/', 'cloudflare/', 'docs/', 'images/', 'data/')


def h2rgb(h):
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2h(r, g, b):
    return '%02X%02X%02X' % (round(r), round(g), round(b))


def hls_rgb(hue, l, s):
    r, g, b = colorsys.hls_to_rgb(hue / 360.0, l, s)
    return r * 255, g * 255, b * 255


def conv_rgb(r, g, b):
    """(r,g,b) → 새 (r,g,b) 또는 None(그대로)."""
    key = '%02x%02x%02x' % (r, g, b)
    if key in EXACT:
        return h2rgb(EXACT[key].lower())
    if key in KEEP:
        return None
    hh, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    hue = hh * 360
    if l >= 0.985 or l <= 0.03:
        return None
    if s < 0.08:                                     # 무채색 → 따뜻한 회색
        s2 = 0.10 if l < 0.5 else (0.16 if l < 0.85 else 0.30)
        return hls_rgb(28, l, s2)
    if 190 <= hue <= 262:                            # 파랑·남색 → 흙빛
        return hls_rgb(26, l, min(0.45, s * 0.6 + 0.03))
    if 28 <= hue <= 56 and not (s > 0.85 and l > 0.45):   # 금·황토 (밝은 노랑은 그대로)
        if l < 0.62:
            return hls_rgb(18, l, min(0.62, s * 1.05))
        return hls_rgb(33, l, s * 0.85)
    return None                                      # 빨강·초록·노랑·보라 등은 그대로


HEX = re.compile(r'(?<![\w&/\-])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_\-])')
RGBA = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+\s*)?\)')
NOT_COLOR_3 = re.compile(r'(querySelector|getElementById|href=|location|#[a-z]{3}\b[^;{]*\{)', re.I)


def files():
    out = subprocess.run(['git', '-c', 'core.quotepath=off', 'ls-files', '*.html', 'css/*.css', 'js/*.js'], cwd=ROOT,
                         capture_output=True, text=True, encoding='utf-8').stdout.split('\n')
    for f in out:
        f = f.strip()
        if not f or '당회실' in f or any(p in f for p in SKIP_PARTS) or f == 'index.html':
            continue
        yield f


def convert_text(s, stats, fname):
    def rep_hex(m):
        tok = m.group(1)
        if len(tok) == 3:
            # 3자리 토큰이 색이 아닌 곳(요소 id·주소)에 있는지: 바로 앞 문자가 따옴표·= 이고 그 뒤가 CSS 값 꼴이 아니면 그대로
            pre = s[max(0, m.start() - 20):m.start()]
            if re.search(r'(getElementById\(|querySelector(All)?\(|href=|location\.hash)\s*["\']?$', pre):
                return m.group(0)
        r, g, b = h2rgb(tok.lower())
        new = conv_rgb(r, g, b)
        if new is None:
            return m.group(0)
        nh = rgb2h(*new)
        stats[(('#' + tok).lower(), '#' + nh)] += 1
        return '#' + nh

    def rep_rgba(m):
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if max(r, g, b) > 255:
            return m.group(0)
        new = conv_rgb(r, g, b)
        if new is None:
            return m.group(0)
        a = m.group(4) or ''
        nr, ng, nb = (int(round(x)) for x in new)
        stats[('rgb(%d,%d,%d)' % (r, g, b), 'rgb(%d,%d,%d)' % (nr, ng, nb))] += 1
        return ('rgba(' if a else 'rgb(') + '%d,%d,%d' % (nr, ng, nb) + (',' + a.lstrip(',').strip() if a else '') + ')'

    s = HEX.sub(rep_hex, s)
    s = RGBA.sub(rep_rgba, s)
    return s


def main():
    dry = '--dry' in sys.argv
    stats = Counter()
    changed = []
    for f in files():
        p = os.path.join(ROOT, f)
        with io.open(p, encoding='utf-8', newline='') as fh:
            s = fh.read()
        before = Counter(stats)
        t = convert_text(s, stats, f)
        if t != s:
            changed.append((f, sum((stats - before).values())))
            if not dry:
                with io.open(p, 'w', encoding='utf-8', newline='') as fh:
                    fh.write(t)
    for (a, b), n in stats.most_common(80 if dry else 25):
        print(f'{n:5d}  {a:>18} → {b}')
    print(f'\n파일 {len(changed)}개, 바꾼 곳 {sum(stats.values())}곳' + (' (미리 보기, 저장 안 함)' if dry else ''))
    if dry:
        for f, n in sorted(changed, key=lambda x: -x[1])[:40]:
            print(f'  {n:4d}  {f}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
