# -*- coding: utf-8 -*-
"""「신앙 정원」 그림 자산 제작기 — 로컬 ComfyUI(Flux.1-schnell GGUF) → 배경 제거 → 정렬·WebP → manifest → 검토 시트

사용법 (아무 파이썬으로 실행해도 .venv 로 스스로 옮겨 간다):
  python tools/garden-art/gen_garden_assets.py check                 사전 점검만(도서관 프로그램·Ollama·ComfyUI·GPU)
  python tools/garden-art/gen_garden_assets.py gen [--only a,b,…] [--group bg|plant|char|ui] [--skip-existing] [--optional] [--dry]
  python tools/garden-art/gen_garden_assets.py regen <id> [--seed N] [--add "문구"] [--bg rembg|chroma|none]
  python tools/garden-art/gen_garden_assets.py pick <id> <k>          후보 k 를 골라 images/garden/default 로 내보내기
  python tools/garden-art/gen_garden_assets.py export                 pick 된 것 전부 다시 내보내기 + manifest.json
  python tools/garden-art/gen_garden_assets.py sheet                  out/review/index.html 다시 만들기
  python tools/garden-art/gen_garden_assets.py reproc [--only …] [--group …]   GPU 없이 out/raw 원본으로 후처리만 다시

자산 표는 assets.json (id·out·gen·final·prompt·seed·bg·candidates·anchor·pick). regen/pick 은 그 파일을 고쳐 쓴다.
후보 그림은 out/raw(원본 PNG)·out/proc(후처리 PNG)·out/state.json 에 남고 저장소에는 올리지 않는다(.gitignore).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VENV = HERE / ".venv"
VPY = VENV / "Scripts" / "python.exe"
ASSETS = Path(os.environ.get("GARDEN_ASSETS") or (HERE / "assets.json"))  # 실험용 표는 환경변수로 바꿔 끼움
OUT = HERE / "out"
RAW, PROC, REVIEW = OUT / "raw", OUT / "proc", OUT / "review"
STATE = OUT / "state.json"
LOG = OUT / "log.jsonl"

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)  # 로그 파일로 돌려도 줄마다 바로 보이게
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------- 가상환경
def ensure_venv():
    """.venv 안에서 돌고 있지 않으면 (없으면 만들고) .venv 파이썬으로 다시 실행한다."""
    if os.path.normcase(str(Path(sys.executable).resolve())) == os.path.normcase(str(VPY.resolve())):
        return
    if not VPY.exists():
        print("[venv] tools/garden-art/.venv 만드는 중 (rembg[cpu]·pillow 설치, 몇 분 걸림)")
        base = [sys.executable]
        if shutil.which("py"):
            try:
                subprocess.check_call(["py", "-3.12", "-c", "import sys"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                base = ["py", "-3.12"]
            except Exception:
                pass
        subprocess.check_call(base + ["-m", "venv", str(VENV)])
        subprocess.check_call([str(VPY), "-m", "pip", "install", "-q", "--upgrade", "pip"])
        subprocess.check_call([str(VPY), "-m", "pip", "install", "-q", "rembg[cpu]", "pillow"])
    rc = subprocess.call([str(VPY), str(Path(__file__).resolve())] + sys.argv[1:])
    sys.exit(rc)


ensure_venv()

from PIL import Image, ImageFilter  # noqa: E402  (.venv 안에서만 도달)
import numpy as np  # noqa: E402


# ---------------------------------------------------------------- 공통
def load_doc():
    with open(ASSETS, encoding="utf-8-sig") as f:
        return json.load(f)


def save_doc(doc):
    with open(ASSETS, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_state():
    if STATE.exists():
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    return {"cands": {}}


def save_state(st):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def log_line(rec):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def find_asset(doc, aid):
    for a in doc["assets"]:
        if a["id"] == aid:
            return a
    sys.exit(f"assets.json 에 id '{aid}' 가 없습니다.")


def cand_key(aid, k):
    return f"{aid}_c{k}"


def build_prompt(doc, asset, bg_mode):
    """접두어(자산별 prefix > 표 공통) + 프롬프트 + add + 접미어 + 배경 문구. 빈 조각은 건너뛴다."""
    parts = [asset.get("prefix") if "prefix" in asset else doc.get("style_prefix", ""), asset["prompt"]]
    if asset.get("add"):
        parts.append(asset["add"])
    parts.append(asset.get("suffix") if "suffix" in asset else doc.get("style_suffix", ""))
    if bg_mode == "rembg":
        parts.append(doc["sprite_suffix"])
    elif bg_mode == "chroma":
        key = asset.get("key", "magenta")
        if key == "magenta" and "magenta" not in asset["prompt"]:
            parts.append(doc["chroma_suffix"])
        elif key == "black" and "black" not in asset["prompt"]:
            parts.append(doc.get("chroma_suffix_black", "the entire background is solid pure pitch black (#000000), "
                                 "perfectly even, no gradient, no vignette, no floor reflection, nothing else in the frame"))
        elif key == "green" and "green screen" not in asset["prompt"]:
            parts.append(doc.get("chroma_suffix_green", "the entire background is a solid flat vivid chroma-key green screen "
                                 "(#00FF00), perfectly even, no gradient, nothing else in the frame"))
        elif key == "blue" and "blue" not in asset["prompt"]:
            parts.append(doc.get("chroma_suffix_blue", "the entire background is a flat solid saturated pure blue "
                                 "(#0000FF) backdrop, no clouds, no sun, no gradient, nothing else in the frame"))
    return ", ".join(p.strip() for p in parts if p and p.strip())


# ---------------------------------------------------------------- 사전 점검 (script-to-images 스킬 규칙)
def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)


def http_json(url, payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def preflight(cfg, need_gpu=True):
    # 1) 도서관 프로그램(Ollama 로 GPU 를 차지) 종료
    r = run(["tasklist", "/FI", "IMAGENAME eq Doseogwan.exe"])
    if "Doseogwan.exe" in (r.stdout or ""):
        print("[점검] Doseogwan.exe 떠 있음 → 종료")
        run(["taskkill", "/F", "/IM", "Doseogwan.exe"])
    # 2) Ollama 에 올라간 모델 내리기
    if shutil.which("ollama"):
        r = run(["ollama", "ps"])
        lines = [ln for ln in (r.stdout or "").splitlines()[1:] if ln.strip()]
        for ln in lines:
            name = ln.split()[0]
            print(f"[점검] ollama 모델 내림: {name}")
            run(["ollama", "stop", name])
    # 3) ComfyUI
    url = cfg["url"]
    try:
        http_json(f"{url}/system_stats", timeout=10)
        print(f"[점검] ComfyUI 응답 OK ({url})")
    except Exception:
        bat = cfg.get("run_bat", r"C:\ComfyUI\run_comfyui.bat")
        print(f"[점검] ComfyUI 응답 없음 → {bat} 실행, 최대 5분 대기")
        subprocess.Popen(["cmd", "/c", "start", "", bat], creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
        t0 = time.time()
        while True:
            time.sleep(5)
            try:
                http_json(f"{url}/system_stats", timeout=10)
                print("[점검] ComfyUI 올라옴")
                break
            except Exception:
                if time.time() - t0 > 300:
                    sys.exit("ComfyUI 가 5분 안에 올라오지 않았습니다.")
    # 4) GPU 사용 중인지
    if need_gpu and shutil.which("nvidia-smi"):
        r = run(["nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"])
        try:
            used, total, util = [int(x.strip()) for x in r.stdout.strip().split(",")]
            print(f"[점검] GPU VRAM {used}/{total} MiB, 사용률 {util}%")
            if util >= 70:
                print("[점검] 경고: GPU 사용률이 높습니다(다른 작업 중?). 15초 뒤 다시 확인")
                time.sleep(15)
                r = run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"])
                if int(r.stdout.strip()) >= 70:
                    sys.exit("GPU 가 다른 작업으로 바쁩니다. 끝난 뒤 다시 실행하세요(--force 로 무시 가능).")
        except Exception:
            print("[점검] nvidia-smi 출력 해석 실패:", (r.stdout or r.stderr).strip()[:200])


# ---------------------------------------------------------------- ComfyUI 생성 (스킬 gen_images.py 의 노드 그래프 그대로)
def build_workflow(cfg, prompt, width, height, seed, prefix):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": cfg["unet"]}},
        "2": {"class_type": "DualCLIPLoader",
              "inputs": {"clip_name1": cfg["clip1"], "clip_name2": cfg["clip2"], "type": "flux", "device": "default"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["3", 0]}},
        "5": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
                         "seed": seed, "steps": cfg.get("steps", 4), "cfg": cfg.get("cfg", 1.0),
                         "sampler_name": cfg.get("sampler", "euler"), "scheduler": cfg.get("scheduler", "simple"),
                         "denoise": 1.0}},
        "7": {"class_type": "VAELoader", "inputs": {"vae_name": cfg["vae"]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["7", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }


def comfy_generate(cfg, prompt, width, height, seed, prefix, dst):
    """한 장 생성해 dst(PNG) 로 복사. 걸린 초를 돌려준다."""
    wf = build_workflow(cfg, prompt, width, height, seed, prefix)
    pid = http_json(f"{cfg['url']}/prompt", {"prompt": wf, "client_id": "garden-art"})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        hist = http_json(f"{cfg['url']}/history/{pid}")
        if pid not in hist:
            if time.time() - t0 > 900:
                raise RuntimeError("시간 초과(15분)")
            continue
        entry = hist[pid]
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            raise RuntimeError(json.dumps(status, ensure_ascii=False)[:600])
        if status.get("completed") or entry.get("outputs"):
            for node_out in entry["outputs"].values():
                for img in node_out.get("images", []):
                    src = os.path.join(cfg["output_dir"], img.get("subfolder", ""), img["filename"])
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(src, dst)
                    return time.time() - t0
            raise RuntimeError("출력 이미지를 찾지 못함")


# ---------------------------------------------------------------- 배경 제거
_REMBG_SESSION = None


def rembg_remove(img):
    """rembg(isnet-general-use, alpha matting). 매팅이 실패하면 매팅 없이."""
    global _REMBG_SESSION
    from rembg import new_session, remove
    if _REMBG_SESSION is None:
        _REMBG_SESSION = new_session("isnet-general-use")
    try:
        return remove(img, session=_REMBG_SESSION, alpha_matting=True,
                      alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=10,
                      alpha_matting_erode_size=10).convert("RGBA")
    except Exception as e:
        print(f"    rembg 매팅 실패({e.__class__.__name__}) → 매팅 없이")
        return remove(img, session=_REMBG_SESSION).convert("RGBA")


def alpha_check(rgba):
    """rembg 결과가 쓸 만한지: 피사체 비율·가장자리 투명·반투명 범벅 검사."""
    a = np.asarray(rgba)[:, :, 3].astype(np.float32) / 255.0
    h, w = a.shape
    fg = float((a > 0.5).mean())
    bw = max(2, int(min(h, w) * 0.02))
    border = np.concatenate([a[:bw].ravel(), a[:, :bw].ravel(), a[:, -bw:].ravel()])  # 아래쪽은 그림자가 닿을 수 있어 뺌
    semi = float(((a > 0.06) & (a < 0.94)).sum()) / max(1.0, float((a > 0.06).sum()))
    ok = 0.01 <= fg <= 0.85 and float(border.mean()) < 0.2 and semi < 0.35
    return ok, {"fg": round(fg, 3), "border": round(float(border.mean()), 3), "semi": round(semi, 3)}


def decontaminate(rgb, alpha, bg):
    """반투명 가장자리에서 배경색(흰색/마젠타) 스밈 제거: C = a·F + (1-a)·B → F."""
    a = alpha[:, :, None]
    b = np.array(bg, dtype=np.float32)[None, None, :]
    F = np.where(a > 0.02, (rgb - (1 - a) * b) / np.maximum(a, 0.02), rgb)
    return np.clip(F, 0, 255)


def _border_connected(mask, sides="all"):
    """mask(bool) 중 가장자리(sides="top" 이면 위쪽 변만)와 이어진 영역만 남긴다 — 안쪽 비슷한 색(그늘 등)은 보존."""
    reach = np.zeros_like(mask)
    reach[0, :] = mask[0, :]
    if sides == "all":
        reach[-1, :] = mask[-1, :]
        reach[:, 0] = mask[:, 0]
        reach[:, -1] = mask[:, -1]
    else:  # top: 좌우 변은 위쪽 절반만
        h = mask.shape[0] // 2
        reach[:h, 0] = mask[:h, 0]
        reach[:h, -1] = mask[:h, -1]
    for _ in range(4000):
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= mask
        if np.array_equal(grown, reach):
            break
        reach = grown
    return reach


KEYS = {  # 키 색 이름 → (지정 색, t0, t1, 표본색 허용 거리). Flux 가 옅게 그려도 표본색으로 맞춘다.
    "magenta": ([255, 0, 255], 70, 150, 200),
    "black": ([0, 0, 0], 80, 170, 200),  # 검정 위에 그려진 회색 그림자까지 지우도록 넓게
    "green": ([0, 255, 0], 70, 150, 200),
    "blue": ([0, 0, 255], 70, 150, 270),  # 도서관 방식: 순파랑이 하늘색(137,227,233)쯤으로 그려짐
}


def sample_key_color(rgb, nominal, accept=200):
    """Flux 가 그린 실제 배경색을 위쪽 가장자리에서 표본(중앙값). 지정 색과 너무 멀면 지정 색 그대로."""
    h = rgb.shape[0]
    band = rgb[: max(4, h // 60)].reshape(-1, 3)
    med = np.median(band, axis=0)
    dist = float(np.sqrt(((med - nominal) ** 2).sum()))
    return (med if dist < accept else nominal), med, dist


def chroma_key(img, key_cfg, border_only=True, info=None, key_name="magenta", sides="all"):
    """단색 배경 → 알파. 실제 배경색 표본 → 거리 임계(t0~t1) 램프 + 가장자리 연결 영역만 + 페더 + 스밈 제거."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    nom, kt0, kt1, accept = KEYS.get(key_name, KEYS["magenta"])
    nominal = np.array(key_cfg.get("color", nom) if key_name == "magenta" else nom, dtype=np.float32)
    key, med, dist = sample_key_color(rgb, nominal, accept)
    sat = float(max(med) - min(med))  # 채도(대략): 마젠타는 255, 분홍은 60 안팎
    t0 = float(key_cfg.get("t0", kt0)) if key_name == "magenta" else float(kt0)
    t1 = float(key_cfg.get("t1", kt1)) if key_name == "magenta" else float(kt1)
    if info is not None:
        info["key_rgb"] = [int(x) for x in med]
        info["key_name"] = key_name
    if key_name != "black" and sat < 120:  # 옅게 그려진 색 키 → 임계를 좁혀 파스텔 물체를 덜 깎음
        t0, t1 = min(t0, 30.0), min(t1, 75.0)
        if info is not None:
            info["key_warn"] = "배경이 옅게 그려짐 — 파스텔 물체와 겹칠 수 있음"
    d = np.sqrt(((rgb - key[None, None, :]) ** 2).sum(axis=2))
    soft = np.clip((d - t0) / max(1.0, t1 - t0), 0.0, 1.0)
    if border_only:
        reach = _border_connected(d < t1, sides)
        alpha = np.where(reach, soft, 1.0)
    else:
        alpha = soft
    # 페더
    feather = float(key_cfg.get("feather", 0.8))
    if feather > 0:
        a_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
        alpha = np.asarray(a_img).astype(np.float32) / 255.0
    rgb = decontaminate(rgb, alpha, key)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def white_cleanup(rgba):
    """rembg 결과의 흰 배경 스밈 제거."""
    arr = np.asarray(rgba).astype(np.float32)
    alpha = arr[:, :, 3] / 255.0
    rgb = decontaminate(arr[:, :, :3], alpha, (255, 255, 255))
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- 스프라이트 정렬
def alpha_bbox(rgba, thr=8):
    a = np.asarray(rgba)[:, :, 3]
    ys, xs = np.where(a > thr)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def find_soil_line(rgba):
    """흙 둔덕의 가장 넓은 줄(아래에서 올라가며 첫 국소 최대)을 흙 선으로 본다. (crop 기준 y, 그 줄의 폭)"""
    a = np.asarray(rgba)[:, :, 3] > 128
    h = a.shape[0]
    widths = a.sum(axis=1).astype(np.float32)
    band = int(h * 0.30)
    w = widths[h - band:][::-1]  # 아래→위
    if len(w) < 6:
        return int(h * 0.95), float(widths.max())
    sm = np.convolve(w, np.ones(5) / 5, mode="same")
    peak = float(sm.max())
    for i in range(2, len(sm) - 3):
        if sm[i] >= sm[i + 1] and sm[i] >= sm[i + 2] and sm[i] >= sm[i - 1] and sm[i] > 0.5 * peak and sm[i] > 4:
            return h - 1 - i, float(sm[i])
    return int(h * 0.95), float(widths[int(h * 0.95)])


def compose_sprite(rgba, asset, doc):
    """알파 bbox 자르기 + 여백, anchor 에 따라 최종 캔버스에 배치(LANCZOS)."""
    W, H = asset["final"]
    margin = float(doc.get("margin", 0.04))
    m = int(round(max(W, H) * margin))
    bb = alpha_bbox(rgba)
    if bb is None:
        return Image.new("RGBA", (W, H), (0, 0, 0, 0)), {"empty": True}
    crop = rgba.crop(bb)
    cw, ch = crop.size
    anchor = asset.get("anchor") or {}
    info = {"bbox": bb}
    if "soil_y" in anchor and anchor.get("base") == "bottom":
        # 흙 둔덕 없는 식물: 스프라이트 바닥(접지 그림자 포함)을 흙 선에 놓고, 단계별 fit 으로 크기(성장)를 준다
        soil_y = float(anchor["soil_y"])
        s = min(float(anchor.get("fit", 0.94)) * H / ch, (W - 2 * m) / cw)
        nw, nh = max(1, int(round(cw * s))), max(1, int(round(ch * s)))
        rs = crop.resize((nw, nh), Image.LANCZOS)
        x, y = (W - nw) // 2, int(round(soil_y * H - nh))
        info.update({"scale": round(s, 3), "y": y})
    elif "soil_y" in anchor:
        soil_y = float(anchor["soil_y"])
        soil_row, soil_w = find_soil_line(crop)
        target_mound = float(anchor.get("mound_w", 0.34)) * W
        s = target_mound / max(soil_w, 1.0)
        s = min(s,
                (soil_y * H - m) / max(soil_row, 1),           # 흙 선 위쪽이 캔버스 안에
                (W - 2 * m) / cw,                              # 폭
                (H - soil_y * H) / max(ch - soil_row, 1),      # 흙 선 아래쪽(둔덕 앞·그림자)이 캔버스 안에
                float(anchor.get("fit", 0.94)) * H / ch)       # 단계별 상한
        s = max(s, 0.10 * H / ch)                              # 너무 작아지지 않게(최소 높이 10%)
        nw, nh = max(1, int(round(cw * s))), max(1, int(round(ch * s)))
        rs = crop.resize((nw, nh), Image.LANCZOS)
        x = (W - nw) // 2
        y = int(round(soil_y * H - soil_row * s))
        info.update({"soil_row": int(soil_row), "soil_w": int(soil_w), "scale": round(s, 3), "y": y})
    elif "foot_y" in anchor:
        foot_y = float(anchor["foot_y"])
        s = min((foot_y * H - m) / ch, (W - 2 * m) / cw)
        nw, nh = max(1, int(round(cw * s))), max(1, int(round(ch * s)))
        rs = crop.resize((nw, nh), Image.LANCZOS)
        x, y = (W - nw) // 2, int(round(foot_y * H - nh))
        info.update({"scale": round(s, 3)})
    else:
        s = min((W - 2 * m) / cw, (H - 2 * m) / ch)
        nw, nh = max(1, int(round(cw * s))), max(1, int(round(ch * s)))
        rs = crop.resize((nw, nh), Image.LANCZOS)
        x, y = (W - nw) // 2, (H - nh) // 2
        info.update({"scale": round(s, 3)})
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(rs, (x, y))
    return canvas, info


def cover_resize(img, size):
    W, H = size
    w, h = img.size
    s = max(W / w, H / h)
    nw, nh = max(W, int(round(w * s))), max(H, int(round(h * s)))
    img = img.resize((nw, nh), Image.LANCZOS)
    x, y = (nw - W) // 2, (nh - H) // 2
    return img.crop((x, y, x + W, y + H))


def crop_bottom_band(rgba, final):
    """바닥 띠: 불투명이 시작되는 줄이 띠 위쪽 근처에 오도록 아래쪽 final 높이만큼 자른다."""
    W, H = final
    a = np.asarray(rgba)[:, :, 3]
    rows = np.where((a > 128).mean(axis=1) > 0.5)[0]
    top = int(rows.min()) if len(rows) else 0
    h = rgba.size[1]
    y0 = max(0, min(top - int(H * 0.06), h - H))
    return rgba.crop((0, y0, rgba.size[0], y0 + H))


def process_candidate(doc, asset, raw_path, bg_mode):
    """raw PNG → 후처리 RGBA/RGB (최종 크기). 돌려줌: (이미지, 정보 dict, ok)"""
    img = Image.open(raw_path)
    info = {"bg_used": bg_mode}
    if bg_mode == "none":
        img = img.convert("RGB")
        if asset.get("crop_top") and img.size[1] > asset["final"][1]:  # 위쪽만 쓰기(하늘: 아래 생긴 바닥 버림)
            img = img.crop((0, 0, img.size[0], asset["final"][1]))
        out = cover_resize(img, tuple(asset["final"]))
        return out, info, True
    if bg_mode == "rembg":
        rgba = white_cleanup(rembg_remove(img.convert("RGB")))
        ok, stats = alpha_check(rgba)
        info["alpha"] = stats
        if not ok:
            return None, info, False
    else:
        rgba = chroma_key(img, doc.get("chroma_key", {}), border_only=asset.get("chroma_border_only", True),
                          info=info, key_name=asset.get("key", "magenta"), sides=asset.get("key_sides", "all"))
    if asset.get("group") in ("plant", "char", "ui"):
        out, cinfo = compose_sprite(rgba, asset, doc)
        info.update(cinfo)
    else:
        if asset.get("crop_bottom"):
            rgba = crop_bottom_band(rgba, tuple(asset["final"]))
        out = rgba if list(rgba.size) == list(asset["final"]) else cover_resize(rgba, tuple(asset["final"]))
    return out, info, True


# ---------------------------------------------------------------- 내보내기
def export_asset(doc, asset, k):
    """out/proc 의 후보 k → images/garden/default/<out>.webp (+ 변형). (경로: 바이트) 목록 돌려줌.
    src 가 있는 자산은 그 PNG 를 알파 bbox 로 잘라 그대로 변환, alias 자산은 다른 자산의 내보낸 파일을 복사."""
    out_root = ROOT / doc["out_root"]
    if asset.get("alias"):
        target = find_asset(doc, asset["alias"])
        tsrc = out_root / target["out"].replace("\\", "/")
        if not tsrc.exists():
            print(f"  {asset['id']}: 원본 {target['id']} 가 아직 안 내보내짐, 건너뜀")
            return []
        dst = out_root / asset["out"].replace("\\", "/")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(tsrc, dst)
        return [(asset["out"].replace("\\", "/"), dst.stat().st_size)]
    if asset.get("src"):
        img = Image.open(asset["src"]).convert("RGBA")
        bb = alpha_bbox(img)
        if bb:
            img = img.crop(bb)
    else:
        src = PROC / f"{cand_key(asset['id'], k)}.png"
        if not src.exists():
            sys.exit(f"후처리 파일이 없습니다: {src} (먼저 gen/regen)")
        img = Image.open(src)
        img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    rel = asset["out"].replace("\\", "/")
    dst = out_root / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    wq = doc.get("webp", {})
    files = []
    img.save(dst, "WEBP", quality=wq.get("quality", 82), method=wq.get("method", 6))
    files.append((rel, dst.stat().st_size))
    stem, ext = os.path.splitext(rel)
    for v in asset.get("variants", []):
        if v == "768":
            w = 768
            h = max(1, int(round(img.size[1] * w / img.size[0])))
            vimg, vrel = img.resize((w, h), Image.LANCZOS), f"{stem}-768{ext}"
        elif v == "s":
            vimg, vrel = img.resize((192, 192), Image.LANCZOS), f"{stem}-s{ext}"
        else:
            continue
        vdst = out_root / vrel
        vimg.save(vdst, "WEBP", quality=wq.get("quality", 82), method=wq.get("method", 6))
        files.append((vrel, vdst.stat().st_size))
    return files


def write_manifest(doc):
    out_root = ROOT / doc["out_root"]
    files = {}
    for p in sorted(out_root.rglob("*.webp")):
        files[p.relative_to(out_root).as_posix()] = p.stat().st_size
    anchors = {}
    for a in doc["assets"]:
        if a.get("anchor") and (a.get("pick") or a.get("alias") or a.get("src")):
            anchors[a["id"]] = a["anchor"]
    man = {"version": doc["version"], "theme": doc["theme"], "files": files,
           "variants": {"season": []}, "anchors": anchors}
    out_root.mkdir(parents=True, exist_ok=True)
    with open(out_root / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
        f.write("\n")
    total = sum(files.values())
    print(f"[manifest] {len(files)}개 파일, 총 {total:,} 바이트 ({total / 1048576:.2f} MB) → {out_root / 'manifest.json'}")
    return total


# ---------------------------------------------------------------- 검토 시트
def rel_review(p):
    return os.path.relpath(p, REVIEW).replace("\\", "/")


def write_sheet(doc, st):
    REVIEW.mkdir(parents=True, exist_ok=True)
    cands = st.get("cands", {})
    css = """
    body{font-family:system-ui,'Malgun Gothic',sans-serif;background:#f3efe8;color:#222;margin:0;padding:18px}
    h1{font-size:20px;margin:0 0 6px} h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #d9d2c5;padding-bottom:4px}
    h3{font-size:14px;margin:14px 0 6px;color:#555}
    .hint{font-size:12px;color:#666;margin-bottom:10px}
    .row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
    .cand{background:#fff;border:3px solid #ddd;border-radius:10px;padding:8px;position:relative}
    .cand.picked{border-color:#2f9e44;box-shadow:0 0 0 3px #b2f2bb}
    .cand .tag{position:absolute;top:6px;right:8px;font-size:11px;background:#2f9e44;color:#fff;border-radius:999px;padding:2px 8px}
    .pair{display:flex;gap:6px}
    .checker{background-color:#fff;background-image:linear-gradient(45deg,#cfcfcf 25%,transparent 25%),linear-gradient(-45deg,#cfcfcf 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cfcfcf 75%),linear-gradient(-45deg,transparent 75%,#cfcfcf 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
    .navy{background:#032257}
    .box{position:relative;display:inline-block;line-height:0}
    .box img{display:block}
    .soil{position:absolute;left:0;right:0;top:94%;border-top:1px dashed rgba(255,80,80,.8);pointer-events:none}
    .foot{position:absolute;left:0;right:0;top:96%;border-top:1px dashed rgba(255,80,80,.8);pointer-events:none}
    code{display:block;margin-top:6px;font-size:12px;background:#f0f0f0;padding:3px 6px;border-radius:5px;user-select:all}
    .meta{font-size:11px;color:#777;margin-top:3px}
    .stages{display:flex;gap:4px;padding:6px;border-radius:8px}
    .stages .box{height:150px} .stages img{height:150px;width:auto}
    .bgimg img{max-width:560px;height:auto;border-radius:6px}
    .sprite img{height:170px;width:auto} .ui img{height:110px;width:auto}
    .scene{position:relative;width:800px;height:450px;overflow:hidden;border-radius:12px;background:#9ec5e8;margin:8px 0}
    .scene img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
    .scene .floor{top:auto;bottom:0;height:auto}
    .scene .plant{position:absolute;left:52%;top:auto;bottom:6%;width:auto;height:46%;transform:translateX(-50%)}
    .scene .char{position:absolute;left:30%;top:auto;bottom:8%;width:auto;height:40%;transform:translateX(-50%)}
    .scene .shelf{position:absolute;left:0;top:0;width:22%;height:100%;object-fit:cover}
    .scene .cloud{position:absolute;left:0;top:4%;width:100%;height:auto;opacity:.9}
    .bar{position:sticky;top:0;background:#f3efe8;padding:6px 0;z-index:5;font-size:13px}
    .bar button{font-size:13px;padding:4px 10px;border-radius:999px;border:1px solid #bbb;background:#fff;cursor:pointer}
    """
    js = """
    function setBg(cls){document.querySelectorAll('.pairbg').forEach(e=>{e.classList.remove('checker','navy');e.classList.add(cls)})}
    """
    H = [f"<!doctype html><meta charset='utf-8'><title>신앙 정원 그림 후보 검토</title><style>{css}</style>",
         "<h1>신앙 정원 그림 후보 검토 시트</h1>",
         f"<div class='hint'>만든 때: {time.strftime('%Y-%m-%d %H:%M')} · 각 후보 아래 명령을 복사해 실행하면 그 후보가 "
         f"images/garden/default 로 내보내진다. 초록 테두리 = 지금 고른 것. 붉은 점선 = 흙 선(94%)·발 선(96%).</div>",
         "<div class='bar'>배경: <button onclick=\"setBg('checker')\">체커보드</button> <button onclick=\"setBg('navy')\">남색 #032257</button></div>"]

    def cand_block(asset, k, extra_cls="", line=None):
        key = cand_key(asset["id"], k)
        rec = cands.get(key)
        picked = asset.get("pick") == k
        if not rec or not (PROC / f"{key}.png").exists():
            return (f"<div class='cand'><div class='meta'>{key}: 아직 없음</div>"
                    f"<code>python tools/garden-art/gen_garden_assets.py gen --only {asset['id']}</code></div>")
        src = rel_review(PROC / f"{key}.png")
        tag = "<span class='tag'>✔ 선택됨</span>" if picked else ""
        ln = f"<div class='{line}'></div>" if line else ""
        if asset["bg"] == "none":
            body = f"<div class='bgimg'><img src='{src}'></div>"
        else:
            body = (f"<div class='pair'><div class='box checker pairbg {extra_cls}'><img src='{src}'>{ln}</div>"
                    f"<div class='box navy pairbg {extra_cls}'><img src='{src}'>{ln}</div></div>")
        meta = (f"seed {rec.get('seed')} · {rec.get('bg_used')} · {rec.get('secs', 0):.0f}초"
                + (f" · alpha {rec.get('alpha')}" if rec.get('alpha') else ""))
        return (f"<div class='cand{' picked' if picked else ''}'>{tag}{body}"
                f"<code>python tools/garden-art/gen_garden_assets.py pick {asset['id']} {k}</code>"
                f"<div class='meta'>{meta}</div></div>")

    # 장면 미리 보기(고른 것만)
    picked_path = {}
    for a in doc["assets"]:
        if a.get("pick"):
            picked_path[a["id"]] = rel_review(PROC / f"{cand_key(a['id'], a['pick'])}.png")
    if "sky-day" in picked_path or "sky-night" in picked_path:
        H.append("<h2>장면 미리 보기(고른 것만, 대략 배치)</h2><div class='row'>")
        for sky in ("sky-day", "sky-night"):
            if sky not in picked_path:
                continue
            H.append(f"<div class='scene'><img src='{picked_path[sky]}'>")
            if "clouds-overlay" in picked_path:
                H.append(f"<img class='cloud' src='{picked_path['clouds-overlay']}'>")
            if "hills" in picked_path:
                H.append(f"<img src='{picked_path['hills']}'>")
            if "floor-tiles" in picked_path:
                H.append(f"<img class='floor' src='{picked_path['floor-tiles']}'>")
            if "shelf-wall" in picked_path:
                H.append(f"<img class='shelf' src='{picked_path['shelf-wall']}'>")
            if "char-a" in picked_path:
                H.append(f"<img class='char' src='{picked_path['char-a']}'>")
            for pid in ("sunflower-4", "sunflower-5", "sunflower-3", "olive-5", "fig-5"):
                if pid in picked_path:
                    H.append(f"<img class='plant' src='{picked_path[pid]}'>")
                    break
            H.append("</div>")
        H.append("</div>")

    # 화풍 바꾸기 전(v1 스냅숏)·후 비교 — out/v1-export 가 있을 때만
    v1 = OUT / "v1-export"
    if v1.exists():
        H.append("<h2>도서관 화풍 적용 전(v1) / 후(v2) 비교</h2><div class='row'>")
        for a in doc["assets"]:
            if a.get("src") or a.get("alias") or not a.get("pick"):
                continue
            old = v1 / a["out"].replace("\\", "/")
            new = ROOT / doc["out_root"] / a["out"].replace("\\", "/")
            if not (old.exists() and new.exists()):
                continue
            H.append(f"<div class='cand'><div class='meta'><b>{a['id']}</b> 전 → 후</div><div class='pair'>"
                     f"<div class='box navy'><img src='{rel_review(old)}' style='height:150px;width:auto'></div>"
                     f"<div class='box navy'><img src='{rel_review(new)}' style='height:150px;width:auto'></div></div></div>")
        H.append("</div>")

    # 배경류
    H.append("<h2>배경 (하늘 4 · 구름 · 언덕 · 바닥 · 책장)</h2>")
    for a in doc["assets"]:
        if a.get("group") != "bg" or a.get("src") or a.get("alias"):
            continue
        H.append(f"<h3>{a['id']} <span class='meta'>{a['out']} · {a['final'][0]}×{a['final'][1]} · bg={a['bg']}</span></h3><div class='row'>")
        for k in range(1, a["candidates"] + 1):
            H.append(cand_block(a, k))
        H.append("</div>")

    # 식물: 종별, 후보 k 줄마다 단계 6개를 흙 선 맞춰 한 줄에
    H.append("<h2>식물 (종별 · 후보 줄마다 단계 0~5, 흙 선 94% 정렬)</h2>")
    species = []
    for a in doc["assets"]:
        if a.get("group") == "plant" and a["species"] not in species:
            species.append(a["species"])
    for sp in species:
        stages = sorted([a for a in doc["assets"] if a.get("group") == "plant" and a["species"] == sp], key=lambda a: a["stage"])
        H.append(f"<h3>{sp} — {stages[0].get('label_ko', '').split(' ')[0]}</h3>")
        maxk = max(a["candidates"] for a in stages)
        for k in range(1, maxk + 1):
            H.append(f"<div class='meta'>후보 {k}</div><div class='stages checker pairbg'>")
            for a in stages:
                key = cand_key(a["id"], k)
                if (PROC / f"{key}.png").exists():
                    H.append(f"<div class='box'><img src='{rel_review(PROC / (key + '.png'))}' title='{key}'><div class='soil'></div></div>")
                else:
                    H.append("<div class='box' style='width:150px;height:150px;background:#eee'></div>")
            H.append("</div>")
        H.append("<div class='row'>")
        for a in stages:
            H.append(f"<div><div class='meta'><b>{a['id']}</b> {a.get('label_ko', '')}</div><div class='row'>")
            for k in range(1, a["candidates"] + 1):
                H.append(cand_block(a, k, "sprite", "soil"))
            H.append("</div></div>")
        H.append("</div>")

    # 캐릭터·UI
    for grp, title, line in (("char", "캐릭터 (발 선 96%)", "foot"), ("ui", "UI (달란트·창고·씨앗 봉투·날씨)", None)):
        H.append(f"<h2>{title}</h2>")
        for a in doc["assets"]:
            if a.get("group") != grp or a.get("src") or a.get("alias"):
                continue
            H.append(f"<h3>{a['id']} <span class='meta'>{a['out']} · {a['final'][0]}×{a['final'][1]}{' · 선택 항목' if a.get('optional') else ''}</span></h3><div class='row'>")
            for k in range(1, a["candidates"] + 1):
                H.append(cand_block(a, k, "sprite" if grp == "char" else "ui", line))
            H.append("</div>")
    H.append(f"<script>{js}</script>")
    with open(REVIEW / "index.html", "w", encoding="utf-8") as f:
        f.write("\n".join(H))
    print(f"[sheet] {REVIEW / 'index.html'}")


# ---------------------------------------------------------------- 명령
def do_gen(doc, st, ids, skip_existing=False, dry=False, force=False):
    cfg = doc["comfy"]
    if not dry:
        preflight(cfg, need_gpu=not force)
    RAW.mkdir(parents=True, exist_ok=True)
    PROC.mkdir(parents=True, exist_ok=True)
    t_all = time.time()
    n_gen = 0
    fails = []
    for aid in ids:
        asset = find_asset(doc, aid)
        W, Hh = asset["gen"]
        for k in range(1, asset["candidates"] + 1):
            key = cand_key(aid, k)
            if skip_existing and (PROC / f"{key}.png").exists():
                print(f"  {key}: 이미 있음, 건너뜀")
                continue
            seed = int(asset["seed"]) + (k - 1)
            bg_mode = asset["bg"]
            prompt = build_prompt(doc, asset, bg_mode)
            if dry:
                print(f"  {key} seed={seed} bg={bg_mode} {W}x{Hh}\n    {prompt}")
                continue
            try:
                raw = RAW / f"{key}.png"
                secs = comfy_generate(cfg, prompt, W, Hh, seed, f"garden/{key}", raw)
                n_gen += 1
                out, info, ok = process_candidate(doc, asset, raw, bg_mode)
                if not ok and bg_mode == "rembg":
                    fkey = doc.get("fallback_key", "black")  # 마젠타는 가장자리에 분홍·청록 번짐이 남아 검정을 기본으로
                    print(f"  {key}: rembg 불통 {info.get('alpha')} → {fkey} 배경으로 다시 생성(크로마키)")
                    fasset = dict(asset)
                    fasset["key"] = fkey
                    fasset.setdefault("key_sides", "all")
                    raw2 = RAW / f"{key}_m.png"
                    secs += comfy_generate(cfg, build_prompt(doc, fasset, "chroma"), W, Hh, seed, f"garden/{key}m", raw2)
                    n_gen += 1
                    info_r = info
                    out, info, ok = process_candidate(doc, fasset, raw2, "chroma")
                    info["rembg_alpha"] = info_r.get("alpha")
                    info["fallback_key"] = fkey
                    info["bg_used"] = f"chroma:{fkey}(rembg 실패)"
                out.save(PROC / f"{key}.png")
                rec = {"id": aid, "k": k, "seed": seed, "secs": round(secs, 1), "raw": str(raw.relative_to(OUT)),
                       "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
                rec.update(info)
                st = load_state()  # 다른 명령(reproc 등)이 그 사이 적은 것을 덮어쓰지 않게 다시 읽고 합침
                st["cands"][key] = rec
                save_state(st)
                log_line(rec)
                print(f"  OK {key} seed={seed} {secs:.0f}초 {info.get('bg_used')} {info.get('alpha', '')} "
                      f"scale={info.get('scale', '')} {info.get('key_rgb', '')} {info.get('key_warn', '')}")
            except Exception as e:
                fails.append((key, str(e)[:300]))
                print(f"  FAIL {key}: {e}", file=sys.stderr)
    if not dry:
        write_sheet(doc, st)
        print(f"[gen] 생성 {n_gen}장, 총 {(time.time() - t_all) / 60:.1f}분, 실패 {len(fails)}")
        for key, msg in fails:
            print(f"   - {key}: {msg}")


def do_reproc(doc, st, ids):
    """GPU 없이 out/raw 의 원본으로 후처리(배경 제거·정렬)만 다시 한다 — 임계값·anchor 를 손본 뒤 쓴다."""
    for aid in ids:
        asset = find_asset(doc, aid)
        for k in range(1, asset["candidates"] + 1):
            key = cand_key(aid, k)
            rec = dict(st.get("cands", {}).get(key) or {})
            raw = RAW / f"{key}.png"
            raw_m = RAW / f"{key}_m.png"
            if not raw.exists():
                print(f"  {key}: 원본 없음, 건너뜀")
                continue
            bg_mode = asset["bg"]
            src = raw
            passet = asset
            if "rembg 실패" in str(rec.get("bg_used", "")) and raw_m.exists():
                bg_mode, src = "chroma", raw_m
                passet = dict(asset)
                passet["key"] = rec.get("fallback_key", "magenta")
                passet.setdefault("key_sides", "all")
            out, info, ok = process_candidate(doc, passet, src, bg_mode)
            if not ok:
                print(f"  {key}: rembg 불통 {info.get('alpha')} (원본 그대로 둠)")
                continue
            out.save(PROC / f"{key}.png")
            rec.update(info)
            rec.setdefault("id", aid)
            rec.setdefault("k", k)
            st = load_state()
            st["cands"][key] = rec
            save_state(st)
            print(f"  OK {key} {info.get('bg_used')} {info.get('alpha', '')} scale={info.get('scale', '')} {info.get('key_rgb', '')}")
    write_sheet(doc, st)


def select_ids(doc, args):
    ids = []
    if getattr(args, "only", None):
        want = [s.strip() for s in args.only.split(",") if s.strip()]
        for w in want:
            find_asset(doc, w)
        return want
    for a in doc["assets"]:
        if a.get("src") or a.get("alias"):  # 생성하지 않는 자산(복사·별칭)
            continue
        if a.get("optional") and not getattr(args, "optional", False):
            continue
        if getattr(args, "group", None) and a.get("group") != args.group:
            continue
        ids.append(a["id"])
    return ids


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    g = sub.add_parser("gen")
    g.add_argument("--only")
    g.add_argument("--group", choices=["bg", "plant", "char", "ui"])
    g.add_argument("--skip-existing", action="store_true")
    g.add_argument("--optional", action="store_true", help="선택 항목(날씨 아이콘)도 포함")
    g.add_argument("--dry", action="store_true", help="프롬프트만 출력")
    g.add_argument("--force", action="store_true", help="GPU 사용률 검사 건너뜀")
    r = sub.add_parser("regen")
    r.add_argument("id")
    r.add_argument("--seed", type=int)
    r.add_argument("--add")
    r.add_argument("--bg", choices=["rembg", "chroma", "none"])
    r.add_argument("--force", action="store_true")
    p = sub.add_parser("pick")
    p.add_argument("id")
    p.add_argument("k", type=int)
    sub.add_parser("export")
    sub.add_parser("sheet")
    rp = sub.add_parser("reproc", help="GPU 없이 원본(out/raw)으로 후처리만 다시")
    rp.add_argument("--only")
    rp.add_argument("--group", choices=["bg", "plant", "char", "ui"])
    rp.add_argument("--optional", action="store_true")
    args = ap.parse_args()

    doc = load_doc()
    st = load_state()
    if args.cmd == "check":
        preflight(doc["comfy"])
    elif args.cmd == "gen":
        do_gen(doc, st, select_ids(doc, args), skip_existing=args.skip_existing, dry=args.dry, force=args.force)
    elif args.cmd == "regen":
        a = find_asset(doc, args.id)
        if args.seed is not None:
            a["seed"] = args.seed
        else:
            a["seed"] = int(a["seed"]) + 100
        if args.add is not None:
            a["add"] = args.add
        if args.bg:
            a["bg"] = args.bg
        a["pick"] = None
        save_doc(doc)
        print(f"[regen] {args.id}: seed={a['seed']} bg={a['bg']} add={a.get('add')!r}")
        do_gen(doc, st, [args.id], force=args.force)
    elif args.cmd == "pick":
        a = find_asset(doc, args.id)
        if not 1 <= args.k <= a["candidates"]:
            sys.exit(f"k 는 1~{a['candidates']} 사이여야 합니다.")
        a["pick"] = args.k
        files = export_asset(doc, a, args.k)
        save_doc(doc)
        for rel, nbytes in files:
            print(f"  → {doc['out_root']}/{rel} ({nbytes:,} B)")
        write_manifest(doc)
        write_sheet(doc, st)
    elif args.cmd == "export":
        total_files = 0
        for a in doc["assets"]:  # 생성 자산은 pick 된 것만, 복사(src)·별칭(alias) 자산은 늘
            if a.get("pick") or a.get("src") or a.get("alias"):
                total_files += len(export_asset(doc, a, a.get("pick")))
        print(f"[export] {total_files}개 파일 내보냄")
        write_manifest(doc)
        write_sheet(doc, st)
    elif args.cmd == "sheet":
        write_sheet(doc, st)
    elif args.cmd == "reproc":
        do_reproc(doc, st, select_ids(doc, args))


if __name__ == "__main__":
    main()
