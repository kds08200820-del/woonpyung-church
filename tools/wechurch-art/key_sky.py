# -*- coding: utf-8 -*-
"""풍경 그림의 하늘만 지운다 (We Church 마을 그림용).

Flux 가 하늘을 '검정'으로 그리라 해도 회녹색·크림색 그라데이션으로 그리는 일이 있어 색 거리 키는 언덕까지 먹는다.
여기서는 '이웃 픽셀과 색 차이가 작은(매끄러운) 곳'만 위쪽 가장자리에서부터 이어 채워 지운다 — 언덕 윤곽처럼 색이 확 바뀌는 곳에서 멈춘다.

  python tools/wechurch-art/key_sky.py <원본.png> <출력.webp> [--step 9] [--stop 0.62] [--preview 미리보기.jpg]
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def key_sky(img, step=9.0, stop=0.62, feather=1.2):
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    # 매끄러움: 오른쪽·아래 이웃과의 최대 채널 차이
    dx = np.zeros((h, w), np.float32)
    dy = np.zeros((h, w), np.float32)
    dx[:, :-1] = np.abs(rgb[:, 1:] - rgb[:, :-1]).max(axis=2)
    dy[:-1, :] = np.abs(rgb[1:] - rgb[:-1]).max(axis=2)
    grad = np.maximum(np.maximum(dx, dy), np.maximum(np.roll(dx, 1, axis=1), np.roll(dy, 1, axis=0)))
    smooth = grad < step
    smooth[int(h * stop):, :] = False          # 그림 아래쪽(땅)은 절대 지우지 않음
    m = Image.fromarray(np.where(smooth, 255, 0).astype(np.uint8), "L").copy()   # fromarray 그림은 읽기 전용이라 채우기가 안 먹는다
    seed_y = 4                                  # 맨 윗줄 몇 줄은 생성 그림 가장자리 자국이 있어 조금 아래에서 시작
    for x in range(0, w, 3):                    # 위쪽의 매끄러운 점마다 이어 채우기
        if m.getpixel((x, seed_y)) == 255:
            ImageDraw.floodfill(m, (x, seed_y), 128, thresh=0)
    sky = np.asarray(m) == 128
    sky[:seed_y, :] |= sky[seed_y:seed_y + 1, :]
    # 채운 곳 둘레 1px 까지(그라데이션 경계) 지우고 부드럽게
    sky_img = Image.fromarray(np.where(sky, 255, 0).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3))
    alpha = 255 - np.asarray(sky_img.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32)
    alpha[np.asarray(sky_img) == 255] = np.minimum(alpha[np.asarray(sky_img) == 255], 0)
    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA"), float(sky.mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--step", type=float, default=9.0)
    ap.add_argument("--stop", type=float, default=0.62)
    ap.add_argument("--preview")
    ap.add_argument("--w768", action="store_true", help="dst 옆에 -768 판도 만든다")
    a = ap.parse_args()
    im, frac = key_sky(Image.open(a.src), a.step, a.stop)
    print(f"하늘 {frac * 100:.1f}% 지움")
    if a.dst.lower().endswith(".webp"):
        im.save(a.dst, "WEBP", quality=82, method=6)
        if a.w768:
            s = 768 / im.size[0]
            im.resize((768, round(im.size[1] * s)), Image.LANCZOS).save(a.dst[:-5] + "-768.webp", "WEBP", quality=82, method=6)
    else:
        im.save(a.dst)
    if a.preview:
        bg = Image.new("RGBA", im.size, (90, 150, 230, 255))
        bg.alpha_composite(im)
        bg.convert("RGB").resize((im.size[0] // 2, im.size[1] // 2)).save(a.preview, quality=85)


if __name__ == "__main__":
    main()
