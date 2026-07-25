# -*- coding: utf-8 -*-
r"""
QT 영상 자동 생성 파이프라인
사용법:
  python qt_video.py --today                    # 운평장로교회 홈페이지 오늘 QT로 생성
  python qt_video.py --date 2026-07-18          # 특정 날짜 QT로 생성
  python qt_video.py input\scenes.json          # 장면 JSON으로 바로 생성
  python qt_video.py input\qt.txt               # QT 원문 텍스트 → 장면 분할 후 생성

scenes.json 형식:
{
  "title": "영상 제목",
  "scenes": [
    {
      "image_prompt": "영어 이미지 프롬프트 (Flux)",
      "motion_prompt": "영어 모션 프롬프트 (Wan2.2)",
      "subtitle": "화면 하단 자막 (말씀/묵상)",
      "narration": "TTS로 읽을 한국어 내레이션"
    }
  ]
}
"""
import asyncio
import copy
import glob
import json
import os
import random
import shutil
import subprocess
import sys
import time
import uuid

import requests

# Windows 콘솔(cp949)에서 한글/특수문자 출력 오류 방지
for _s in (sys.stdout, sys.stderr):
    if _s and hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

COMFY_URL = "http://127.0.0.1:8188"
# 운평장로교회 홈페이지(k-logos.com)가 쓰는 공개 QT 뷰 — config.js의 공개 anon 키
CHURCH_SUPABASE_URL = "https://cetacttsdwzxjzkyozgd.supabase.co"
CHURCH_ANON_KEY = "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G"
COMFY_DIR = r"C:\ComfyUI"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(BASE_DIR, "work")
OUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
TTS_VOICE = "ko-KR-InJoonNeural"  # 남성. 여성: ko-KR-SunHiNeural
CLIP_FPS = 16
CLIP_SECONDS = 81 / 16  # length 81 @ 16fps

# ── 화풍(그림 스타일) — 장면 설명(내용)을 감싸 최종 Flux 프롬프트를 만든다 ──
# scenes의 image_prompt는 '내용만' 담고(사람·배경·행동·분위기·조명),
# 화풍 표현은 여기서 일관되게 입힌다. 사용자가 검토창에서 내용만 편집하면 화풍은 자동 유지.
STYLES = {
    # 손그림 동화책 수채화 (기본) — 따뜻하고 촘촘한 그림책 질감, AI 티 없음
    "storybook": {
        "label": "동화책 (수채화·색연필)",
        "prefix": ("a vintage hand-painted children's storybook illustration from the 1970s "
                   "and 1980s, painted by hand in soft matte watercolor and colored pencil, "
                   "with visible rough paper grain, uneven gentle pencil strokes and light "
                   "cross-hatching, simple honest hand-drawn linework with small natural "
                   "imperfections, "),
        "suffix": (", soft muted and slightly faded earthy pastel colors, flat gentle "
                   "shading, calm uncluttered composition, warm nostalgic storybook mood, "
                   "printed on rough cream paper with a faint analog offset-print texture and "
                   "subtle ink misregistration, in the style of beloved old Korean and "
                   "Japanese picture books, matte and grainy hand-made analog painting, "
                   "understated and imperfect, no glossy sheen, no smooth digital gradients, "
                   "no 3d render, no text, no signature, no watermark"),
        "texture": True,   # 생성 후 종이·연필 질감 후처리
    },
    # 실사 시네마틱 (기존)
    "cinematic": {
        "label": "실사 시네마틱",
        "prefix": "cinematic photorealistic scene, ",
        "suffix": ", 35mm film look, dramatic natural lighting, highly detailed, no text",
        "texture": False,
    },
}
DEFAULT_STYLE = "storybook"

# ── 구도 안전장치 — 머리·목 잘림(cropped head/neck) 방지 ──
# 이 파이프라인은 Flux.1-schnell(cfg 1.0 + ConditioningZeroOut)이라 네거티브 프롬프트가
# 무효다. 따라서 "자르지 마라"를 포지티브 프롬프트로만 강제해야 한다. 세로 9:16에서
# 인물이 크게 잡히면 상단이 잘리므로, 넉넉한 머리 위 여백과 넓은 프레이밍을 항상 지시한다.
FRAMING = (", well-composed medium-wide shot with every person framed from the waist up or "
           "wider, the entire head and full face kept completely inside the frame, generous "
           "empty headroom above the hair, subjects placed in the lower two-thirds of the "
           "canvas, full unobstructed view with nothing cut off or cropped at the top or edges")

# ── 해부학·물리 정합성 — 사람 손이 달린 고양이, 공중에 뜬 손 같은 오류 방지 ──
# 네거티브 프롬프트가 무효(cfg 1.0)이므로 "올바른 해부학"을 포지티브로 명시한다.
ANATOMY = (", anatomically correct and physically plausible, every person with natural human "
           "anatomy, exactly five fingers per hand, hands and limbs properly attached to their "
           "own body, correct number of arms and legs, no extra or missing limbs, no deformed "
           "or fused body parts, no floating or disembodied hands, arms or body parts; animals "
           "keep their true animal anatomy — the cat has four paws and never human hands; "
           "everything obeys natural gravity and solid ground, only the objects described and "
           "nothing extra, no duplicated or repeated objects, every object physically "
           "supported by resting on a surface or held in a hand or fixed in place, nothing "
           "floating unsupported in mid-air, flowers only inside their vase")


def styled_prompt(desc, style=None, characters=None):
    """장면 내용 설명(desc)에 화풍을 입혀 최종 이미지 프롬프트를 만든다.
    characters: 반복 등장인물 명세(영어) — 매 장면 앞에 붙여 캐릭터 일관성 유지.
    화풍(suffix) 뒤에 FRAMING(머리 잘림 방지 구도)을 항상 덧붙인다."""
    s = STYLES.get(style or DEFAULT_STYLE, STYLES[DEFAULT_STYLE])
    cast = f"Characters (keep consistent): {characters.strip()} " if characters else ""
    return s["prefix"] + cast + desc.strip() + s["suffix"] + FRAMING + ANATOMY


def style_uses_texture(style=None):
    return STYLES.get(style or DEFAULT_STYLE, STYLES[DEFAULT_STYLE]).get("texture", False)


# 이야기 형식의 고정 출연진 — 매일 영상에서 같은 인물 유지 (엄마가 아이에게 들려주기)
GRANDMA_CAST = ("a little girl with short black bob hair and pink-and-blue side hair-clips, "
                "mint long-sleeve top and yellow overall dress; her young mother in her "
                "thirties with a warm gentle face, long dark hair tied back softly, a soft "
                "beige knit cardigan; a chubby grey tabby cat with white paws and big amber eyes")


def find_ffmpeg():
    p = shutil.which("ffmpeg")
    if p:
        return p
    hits = glob.glob(os.path.join(
        os.environ.get("LOCALAPPDATA", ""),
        "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "**", "bin", "ffmpeg.exe"),
        recursive=True)
    if hits:
        return hits[0]
    sys.exit("ffmpeg를 찾을 수 없습니다. winget install Gyan.FFmpeg 후 다시 실행하세요.")


FFMPEG = find_ffmpeg()
FFPROBE = os.path.join(os.path.dirname(FFMPEG), "ffprobe.exe")


def load_workflow(name):
    with open(os.path.join(BASE_DIR, "workflows", name), encoding="utf-8") as f:
        return json.load(f)


def comfy_run(workflow):
    """워크플로우를 제출하고 완료까지 대기, history 항목을 반환."""
    r = requests.post(f"{COMFY_URL}/prompt", json={"prompt": workflow}, timeout=30)
    r.raise_for_status()
    pid = r.json()["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(3)
        h = requests.get(f"{COMFY_URL}/history/{pid}", timeout=30).json()
        if pid in h:
            status = h[pid].get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI 실행 오류: {json.dumps(status, ensure_ascii=False)[:2000]}")
            if status.get("completed") or h[pid].get("outputs"):
                return h[pid]
        el = int(time.time() - t0)
        if el and el % 60 == 0:
            print(f"    ... {el // 60}분 경과", flush=True)


def comfy_output_files(history, ext):
    files = []
    for node_out in history.get("outputs", {}).values():
        for key in ("images", "gifs", "video", "videos"):
            for item in node_out.get(key, []) or []:
                fn = item.get("filename", "")
                if fn.lower().endswith(ext):
                    sub = item.get("subfolder", "")
                    files.append(os.path.join(COMFY_DIR, "output", sub, fn))
    return files


def apply_paper_texture(path):
    """생성 이미지에 종이·연필 질감을 입혀 AI 특유의 매끈함을 없앤다(그림책 느낌)."""
    from PIL import Image, ImageChops, ImageEnhance, ImageFilter
    img = Image.open(path).convert("RGB")
    w, h = img.size
    # 종이 섬유(큰 얼룩) — 톤 불균일
    small = Image.effect_noise((max(1, w // 6), max(1, h // 6)), 40).convert("L")
    small = small.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2.5))
    fib = Image.merge("RGB", (small, small, small))
    img = Image.blend(img, ImageChops.soft_light(img, fib), 0.30)
    # 종이 결(오톨도톨한 이)
    tooth = Image.effect_noise((w, h), 40).convert("L").filter(ImageFilter.GaussianBlur(0.5))
    tooth_rgb = Image.merge("RGB", (tooth, tooth, tooth))
    img = Image.blend(img, ImageChops.soft_light(img, tooth_rgb), 0.55)
    # 연필 미세 그레인 — 매끈함 제거 (과하면 '필터 티'가 나므로 은은하게)
    g = Image.effect_noise((w, h), 30).convert("L")
    img = Image.blend(img, ImageChops.overlay(img, Image.merge("RGB", (g, g, g))), 0.32)
    # 아날로그 색감: 크림 종이 워시 + 채도·대비 완화 (AI 특유의 과채도·번들거림 억제)
    img = Image.blend(img, Image.new("RGB", (w, h), (249, 244, 233)), 0.10)
    img = ImageEnhance.Color(img).enhance(0.84)
    img = ImageEnhance.Contrast(img).enhance(0.93)
    img.save(path)


# ── 비전 자동 검수 — 물리/해부학 위반(뜬 물체·기형·잘림) 탐지 후 재생성 ──
QC_ENABLED = os.environ.get("QT_QC", "1") != "0"   # QT_QC=0 이면 검수 끔


def qc_image(image_path, expected=None):
    """생성 이미지를 claude CLI(Read 도구)로 열어 물리·해부학 위반을 점검한다.
    expected: 이 장면의 생성 프롬프트(등장인물 명세 포함) — 주면 '설명에 없는 추가
    인물/동물/주요 물체'까지 검사한다.
    반환: {"ok": bool, "problems": [한국어 오류 설명]}.
    검수 자체가 실패(타임아웃·파싱 실패)하면 ok=True로 통과시켜 생성을 막지 않는다."""
    extra = ""
    if expected:
        extra = (
            "\n- an EXTRA person, animal, or major prop appears that the scene does NOT call "
            "for. Below is this image's generation prompt (IGNORE all style/technical wording "
            "like watercolor, matte, 'no floating', etc.); from it identify only the intended "
            "characters and key props, then count the people and animals actually drawn. If "
            "the image has MORE people or animals than intended (e.g. a third person when only "
            "a mother and one girl are intended), flag it.\n"
            f"--- generation prompt ---\n{expected}\n--- end ---")
    # 주의: "설명 없이 JSON만" 지시하면 헤드리스 claude가 이미지를 안 열고 ok를 지어낸다.
    # 반드시 '먼저 물체를 하나씩 묘사 → 그다음 판정'하게 해야 실제로 Read 도구로 이미지를 연다.
    q = (f"Use the Read tool to actually open and look at the image at this path: {image_path}\n"
         "You are inspecting a children's storybook illustration for PHYSICAL-LAW and ANATOMY "
         "errors ONLY. Ignore art style, taste, and beauty entirely.\n\n"
         "STEP 1 — Briefly describe out loud, one by one: every notable object (each flower, "
         "vase, book, cup, etc.) and what physically supports it (resting on the table / held "
         "in a hand / stem inside a vase / on the floor). Also glance at each person's and "
         "animal's hands and limbs.\n\n"
         "STEP 2 — Then judge. Something is a VIOLATION if:\n"
         "- an object has NO clearly drawn support and appears to float (e.g. a flower with a "
         "stem but no visible vase, an object hovering in the air)\n"
         "- the same object is duplicated for no reason (e.g. two separate roses in different "
         "spots)\n"
         "- a hand/arm/leg is detached or floating, or a body has wrong/extra/missing/fused "
         "limbs or fingers\n"
         "- an animal has human hands or other cross-species anatomy\n"
         "- a person's head or face is cut off by the frame edge"
         + extra + "\n"
         "When in doubt about whether something is supported, treat it as floating (a violation).\n\n"
         "After your short description, output a JSON object (a ```json fenced block is fine). "
         "Write each problem in KOREAN, one short phrase. If nothing is wrong: "
         "{\"ok\": true, \"problems\": []}. If there are violations: "
         "{\"ok\": false, \"problems\": [\"창가에 꽃병 없이 떠 있는 장미\"]}")
    try:
        # 프롬프트는 stdin으로 전달한다. 명령줄에 박으면 Windows cmd.exe에서 여러 줄·한글·
        # 따옴표가 깨져 claude가 지시를 온전히 못 받고 이미지를 안 읽는다(→ 거짓 ok).
        out = subprocess.run("claude -p", input=q, capture_output=True, text=True,
                             encoding="utf-8", timeout=180, shell=True)
        raw = (out.stdout or "").strip()
        s, e = raw.find("{"), raw.rfind("}")
        if s < 0:
            return {"ok": True, "problems": []}
        v = json.loads(raw[s:e + 1])
        return {"ok": bool(v.get("ok", True)), "problems": v.get("problems") or []}
    except Exception as ex:
        print(f"  검수 건너뜀(오류): {ex}", flush=True)
        return {"ok": True, "problems": []}


def gen_image(image_prompt, idx, width=720, height=1280, texture=False, qc_retries=1):
    """이미지 생성 + 비전 자동 검수. 물리/해부학 위반이 감지되면 새 시드로 재생성한다.
    qc_retries: 최대 재생성 횟수(기본 1 → 장면당 최대 2회 생성). QC_ENABLED=False면 검수 생략."""
    attempts = (qc_retries + 1) if QC_ENABLED else 1
    src, problems = None, []
    for attempt in range(1, attempts + 1):
        wf = load_workflow("flux_image_api.json")
        wf["3"]["inputs"]["text"] = image_prompt
        wf["5"]["inputs"]["width"] = width
        wf["5"]["inputs"]["height"] = height
        wf["6"]["inputs"]["seed"] = random.randint(0, 2**48)
        wf["9"]["inputs"]["filename_prefix"] = f"qt/scene_{idx:02d}"
        hist = comfy_run(wf)
        files = comfy_output_files(hist, (".png", ".jpg", ".webp"))
        if not files:
            raise RuntimeError("이미지 출력 파일을 찾지 못했습니다.")
        src = files[0]
        if not QC_ENABLED:
            break
        verdict = qc_image(src, expected=image_prompt)
        problems = verdict.get("problems", [])
        if verdict.get("ok"):
            break
        if attempt < attempts:
            print(f"  ⚠ 장면 {idx}: 물리/해부학 오류 감지 → 재생성 {attempt}/{qc_retries}: {problems}", flush=True)
        else:
            print(f"  ⚠ 장면 {idx}: 재생성 후에도 잔여 오류(사람 검토 필요): {problems}", flush=True)
    if texture:
        try:
            apply_paper_texture(src)
        except Exception as e:
            print(f"질감 후처리 건너뜀: {e}", flush=True)
    # Wan LoadImage가 읽도록 ComfyUI input 폴더로 복사
    input_name = f"qt_scene_{idx:02d}_{uuid.uuid4().hex[:6]}.png"
    shutil.copy(src, os.path.join(COMFY_DIR, "input", input_name))
    shutil.copy(src, os.path.join(WORK_DIR, f"scene_{idx:02d}.png"))
    return input_name


def gen_video(input_image_name, motion_prompt, idx, width=480, height=832):
    wf = load_workflow("wan_i2v_api.json")
    seed = random.randint(0, 2**48)
    wf["8"]["inputs"]["text"] = motion_prompt
    wf["11"]["inputs"]["image"] = input_image_name
    wf["12"]["inputs"]["width"] = width
    wf["12"]["inputs"]["height"] = height
    wf["13"]["inputs"]["noise_seed"] = seed
    wf["14"]["inputs"]["noise_seed"] = seed
    wf["17"]["inputs"]["filename_prefix"] = f"qt/clip_{idx:02d}"
    hist = comfy_run(wf)
    files = comfy_output_files(hist, (".mp4", ".webm"))
    if not files:
        raise RuntimeError("영상 출력 파일을 찾지 못했습니다.")
    dst = os.path.join(WORK_DIR, f"clip_{idx:02d}.mp4")
    shutil.copy(files[0], dst)
    return dst


GPTSOVITS_CONFIG = r"C:\qt-video\tts_config.json"


def _load_gptsovits_cfg():
    """GPT-SoVITS 설정: {"api":"http://127.0.0.1:9880","ref_audio":"...wav","prompt_text":"...","start_bat":"..."}
    파일이 없거나 ref_audio가 준비 안 됐으면 None → edge-tts 사용."""
    try:
        with open(GPTSOVITS_CONFIG, encoding="utf-8-sig") as f:
            cfg = json.load(f)
        if cfg.get("ref_audio") and os.path.exists(cfg["ref_audio"]):
            return cfg
    except Exception:
        pass
    return None


def _ensure_gptsovits(cfg):
    """API 서버가 꺼져 있으면 start_bat으로 실행하고 준비될 때까지 대기."""
    import subprocess as sp
    api = cfg.get("api", "http://127.0.0.1:9880")
    try:
        requests.get(api + "/control", timeout=3)
        return api
    except Exception:
        pass
    bat = cfg.get("start_bat")
    if bat and os.path.exists(bat):
        sp.Popen(["cmd", "/c", bat], creationflags=sp.CREATE_NEW_CONSOLE)
        for _ in range(60):
            time.sleep(5)
            try:
                requests.get(api + "/control", timeout=3)
                return api
            except Exception:
                continue
    raise RuntimeError("GPT-SoVITS API 서버를 시작하지 못했습니다")


def _gen_narration_gptsovits(text, dst_wav, cfg):
    api = _ensure_gptsovits(cfg)
    r = requests.post(api + "/tts", json={
        "text": text, "text_lang": "ko",
        "ref_audio_path": cfg["ref_audio"],
        "prompt_text": cfg.get("prompt_text", ""),
        "prompt_lang": cfg.get("prompt_lang", "ko"),
        "text_split_method": "cut5",
        "speed_factor": float(cfg.get("speed", 1.0)),
        "media_type": "wav", "streaming_mode": False,
    }, timeout=300)
    if r.status_code != 200 or len(r.content) < 1000:
        raise RuntimeError(f"GPT-SoVITS 합성 실패({r.status_code}): {r.text[:200]}")
    with open(dst_wav, "wb") as f:
        f.write(r.content)
    return dst_wav


def gen_narration(text, idx):
    """내레이션 생성: GPT-SoVITS(설정돼 있으면) → 실패 시 edge-tts 폴백."""
    cfg = _load_gptsovits_cfg()
    if cfg:
        try:
            return _gen_narration_gptsovits(
                text, os.path.join(WORK_DIR, f"narr_{idx:02d}.wav"), cfg)
        except Exception as e:
            print(f"GPT-SoVITS 실패 → edge-tts 폴백: {e}", flush=True)
    import edge_tts
    dst = os.path.join(WORK_DIR, f"narr_{idx:02d}.mp3")

    async def _run():
        await edge_tts.Communicate(text, TTS_VOICE, rate="-5%").save(dst)

    asyncio.run(_run())
    return dst


def media_duration(path):
    out = subprocess.run(
        [FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True)
    return float(out.stdout.strip())


def build_segment(clip, narr, idx, width=480, height=832):
    """Wan 클립+내레이션 결합 — 내레이션 길이에 맞춰 영상 재생 속도를 조절해
    싱크를 맞춘다(마지막 프레임 정지 없음, 움직임이 끝까지 이어짐)."""
    dur = max(3.5, media_duration(narr) + 0.6) if narr else CLIP_SECONDS
    seg = os.path.join(WORK_DIR, f"seg_{idx:02d}.mp4")
    factor = dur / CLIP_SECONDS   # >1 = 슬로모션(내레이션이 길 때), <1 = 살짝 빠르게
    vf = f"setpts={factor:.4f}*PTS,scale={width}:{height},fps=24,format=yuv420p"
    cmd = [FFMPEG, "-y", "-i", clip]
    if narr:
        cmd += ["-i", narr]
    cmd += ["-vf", vf, "-t", f"{dur:.2f}"]
    if narr:
        cmd += ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-ar", "44100",
                "-af", "apad", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19", seg]
    subprocess.run(cmd, check=True, capture_output=True)
    return seg, dur


def build_kenburns_segment(image_path, narr, idx, width=480, height=832):
    """정지 이미지에 천천히 줌인(켄번즈) — 길이가 내레이션에 정확히 맞아 싱크 문제 없음."""
    dur = max(4.0, media_duration(narr) + 0.7) if narr else CLIP_SECONDS
    fps = 24
    frames = max(1, int(dur * fps))
    seg = os.path.join(WORK_DIR, f"seg_{idx:02d}.mp4")
    vf = (f"scale={width * 3}:{height * 3},"
          f"zoompan=z='min(1+0.11*on/{frames},1.11)':"
          f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={width}x{height}:fps={fps},"
          f"format=yuv420p")
    cmd = [FFMPEG, "-y", "-loop", "1", "-i", image_path]
    if narr:
        cmd += ["-i", narr]
    cmd += ["-vf", vf, "-t", f"{dur:.2f}"]
    if narr:
        cmd += ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-ar", "44100",
                "-af", "apad", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19", seg]
    subprocess.run(cmd, check=True, capture_output=True)
    return seg, dur


def make_srt(scenes, durations):
    def ts(sec):
        h, rem = divmod(sec, 3600)
        m, s = divmod(rem, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"

    srt = os.path.join(WORK_DIR, "subs.srt")
    t = 0.0
    with open(srt, "w", encoding="utf-8") as f:
        for i, (scene, dur) in enumerate(zip(scenes, durations), 1):
            sub = scene.get("subtitle", "").strip()
            if sub:
                f.write(f"{i}\n{ts(t + 0.2)} --> {ts(t + dur - 0.2)}\n{sub}\n\n")
            t += dur
    return srt


def subtitle_style(style="outline", size="medium", position="bottom"):
    """자막 스타일 설정 → libass force_style 문자열.
    style: outline(테두리) | box(반투명 박스) | none / size: small|medium|large / position: bottom|center"""
    fs = {"small": 9, "medium": 11, "large": 14}.get(size, 11)
    mv = {"bottom": 32, "center": 130}.get(position, 32)
    if style == "box":
        return (f"FontName=Malgun Gothic,FontSize={fs},Bold=1,PrimaryColour=&HFFFFFF,"
                f"BorderStyle=4,BackColour=&H66000000,Outline=0,Shadow=1,"
                f"Spacing=0.8,MarginV={mv},Alignment=2")
    return (f"FontName=Malgun Gothic,FontSize={fs},PrimaryColour=&HFFFFFF,"
            f"OutlineColour=&HA0000000,BorderStyle=1,Outline=1.5,Shadow=0,"
            f"MarginV={mv},Alignment=2")


def assemble(segments, srt, title, sub_style=None):
    concat_list = os.path.join(WORK_DIR, "concat.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for s in segments:
            f.write(f"file '{s}'\n")
    merged = os.path.join(WORK_DIR, "merged.mp4")
    subprocess.run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
                    "-c", "copy", merged], check=True, capture_output=True)

    safe_title = "".join(c for c in title if c not in '\\/:*?"<>|').strip() or "qt_video"
    final = os.path.join(OUT_DIR, f"{safe_title}.mp4")
    if srt is None:
        shutil.copy(merged, final)
        return final
    srt_ff = srt.replace("\\", "/").replace(":", "\\:")
    vf = f"subtitles='{srt_ff}':force_style='{sub_style or subtitle_style()}'"
    cmd = [FFMPEG, "-y", "-i", merged]

    bgm = None
    for ext in ("mp3", "m4a", "wav"):
        cand = os.path.join(ASSETS_DIR, f"bgm.{ext}")
        if os.path.exists(cand):
            bgm = cand
            break
    if bgm:
        cmd += ["-stream_loop", "-1", "-i", bgm,
                "-filter_complex",
                f"[0:v]{vf}[v];[1:a]volume=0.15[b];[0:a][b]amix=inputs=2:duration=first[a]",
                "-map", "[v]", "-map", "[a]"]
    else:
        cmd += ["-vf", vf, "-map", "0:v", "-map", "0:a?"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-c:a", "aac", "-shortest", final]
    subprocess.run(cmd, check=True, capture_output=True)
    return final


def strip_html(html):
    import re
    text = re.sub(r"<br\s*/?>", "\n", html or "")
    text = re.sub(r"</p>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fetch_qt_from_church(date=None):
    """운평장로교회 홈페이지 QT(qt_published 뷰)에서 본문을 가져온다."""
    headers = {"apikey": CHURCH_ANON_KEY, "Authorization": f"Bearer {CHURCH_ANON_KEY}"}
    url = (f"{CHURCH_SUPABASE_URL}/rest/v1/qt_published"
           f"?select=sermon_date,title,scripture,qt_bible_text,content,prayer")
    if date:
        url += f"&sermon_date=eq.{date}"
    else:
        url += f"&sermon_date=lte.{time.strftime('%Y-%m-%d')}&order=sermon_date.desc&limit=1"
    rows = requests.get(url, headers=headers, timeout=30).json()
    if not rows:
        sys.exit(f"해당 날짜의 QT를 찾지 못했습니다: {date or '최신'}")
    r = rows[0]
    qt_text = (f"제목: {r['title']}\n본문: {r['scripture']} ({r['sermon_date']})\n\n"
               f"[성경 본문]\n{r.get('qt_bible_text', '')}\n\n"
               f"[묵상]\n{strip_html(r.get('content'))}\n\n"
               f"[기도]\n{strip_html(r.get('prayer'))}")
    print(f"홈페이지 QT 수신: {r['sermon_date']} — {r['title']} ({r['scripture']})")
    path = os.path.join(WORK_DIR, "qt_fetched.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(qt_text)
    return qt_text, f"{r['sermon_date']}_{r['title']}"


def split_qt_with_claude(qt_text, title_hint=None, scene_count=None, narrative=None):
    """QT 원문 텍스트를 claude CLI로 장면 JSON으로 변환.
    narrative='grandma': 할머니가 아이에게 들려주는 액자식 스토리로 구성."""
    n_txt = f"{scene_count}개" if scene_count else "4~6개"
    if narrative == "grandma":
        task = (f"다음 새벽 QT 본문을, 엄마가 어린 딸과 고양이에게 들려주는 동화 {n_txt} 장면의 "
                f"그림책 스토리보드 JSON으로 변환하라.\n\n"
                f"[액자식 스토리 — 필수]\n"
                f"- 첫 장면: 현재(컬러) — 소녀·엄마(30대)·고양이가 함께 있고, 아이가 궁금해하거나 성경을 펴는 도입.\n"
                f"- 가운데 장면들: 엄마가 들려주는 성경 이야기 — warm sepia daydream bubble 속 성경 장면.\n"
                f"- 마지막 장면: 현재(컬러)로 돌아와 아이가 깨닫고 포근하게 마무리(기도/포옹 등).\n"
                f"- narration은 반드시 엄마가 아이에게 말하는 다정한 구어체(해요체 아님): "
                f"\"~했단다\", \"~인 거야\", \"~해 보렴\". 중간에 아이의 짧은 질문(\"엄마, 왜요?\")을 1번 섞어라.\n")
        chars_rule = (f"\"characters\"에는 반드시 다음 고정 출연진 명세를 그대로 넣고, 성경 속 인물이 있으면 뒤에 추가하라: "
                      f"\"{GRANDMA_CAST}\"")
        narr_rule = "엄마가 아이에게 들려주는 다정한 한국어 구어체 1~2문장 (\"~했단다\", \"~인 거야\")"
    else:
        task = f"다음 새벽 QT 본문을 {n_txt} 장면의 그림책풍 영상 스토리보드 JSON으로 변환하라.\n"
        chars_rule = "반복 등장인물이 있으면 고정 외형 명세(영어 1~3문장), 없으면 빈 문자열"
        narr_rule = "낭독할 한국어 문장 (1~2문장)"
    prompt = f"""{task}
출력은 순수 JSON만 (코드펜스, 설명 금지). 형식:
{{"title": "짧은 파일명용 제목", "characters": "{chars_rule}", "scenes": [{{"image_prompt": "장면 내용 묘사 (영어)", "motion_prompt": "slow gentle camera push-in, ... (영어, 미세한 자연스러운 움직임)", "subtitle": "화면 자막 (말씀 구절 또는 핵심 문장, 40자 이내)", "narration": "{narr_rule}"}}]}}

image_prompt 작성 규칙 (그림책 스토리보드의 품질을 좌우한다):
1. 내용만 묘사 — 화풍·기법·카메라 용어(watercolor, cinematic, photorealistic, illustration 등)는 절대 넣지 말 것. 화풍은 시스템이 따로 입힌다.
2. 캐릭터 일관성 — 여러 장면에 같은 인물이 나오면 "characters"에 외형(머리·옷·소품 색상까지)을 고정 명세하고, 각 장면에서는 "the girl", "the old prophet"처럼 짧게 지칭하라.
3. 구도 연출 — "On the left ..., on the right ..." 처럼 화면 배치를 직접 지시하라. 단, 인물은 항상 상반신(허리 위) 이상이 보이도록 넓게 잡고, 머리 위에 여백을 두어라. 얼굴만 꽉 채우는 극단적 클로즈업(extreme close-up, tight face crop)은 절대 쓰지 말 것 — 머리·목이 잘린다.
4. 이중 시공간 장치 — 성경 장면을 회상·상상으로 보여줄 때는 "a large soft cloud-shaped daydream bubble in warm sepia tones showing ..." 구도를 활용하라 (현재는 컬러, 버블 안은 세피아).
5. 감정을 조명으로 — 핵심 장면은 "warm golden light breaks in, a beam of sunlight shining on ..." 처럼 빛으로 감정(경이·소망·회개)을 표현하고, 장면의 정서(sense of wonder and revelation, quiet repentance 등)를 명시하라.
6. 잔혹하거나 무서운 장면은 은은하게(그림자·먼 실루엣) 표현하라.
7. 신체는 반드시 온전한 몸으로 — 손·팔 등 신체 일부만 공중에 떠 있거나 몸에서 분리된 묘사(floating hands, disembodied arms)는 절대 쓰지 말 것. 사람은 온전한 인체, 고양이·동물은 동물 그대로(사람 손 금지).
8. 하나님/신적 존재는 형상(손·얼굴·사람 모습)으로 그리지 말라 — 반드시 "warm radiant light from above, a glowing beam of golden light, soft heavenly glow" 같은 빛·광채로만 표현하라(개혁주의 전통). 하늘의 손·얼굴 묘사 금지.

QT 본문:
{qt_text}"""
    out = subprocess.run(["claude", "-p", prompt], capture_output=True,
                         text=True, encoding="utf-8", timeout=600, shell=True)
    raw = out.stdout.strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0:
        sys.exit(f"claude CLI 장면 분할 실패:\n{raw[:500]}\n{out.stderr[:500]}")
    data = json.loads(raw[start:end + 1])
    if title_hint:
        data["title"] = title_hint
    scenes_path = os.path.join(WORK_DIR, "scenes_generated.json")
    with open(scenes_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"장면 분할 완료 → {scenes_path}")
    return data


def run_pipeline(data, progress=None):
    """장면 데이터로 전체 영상을 생성하고 최종 mp4 경로를 반환.
    progress(msg) 콜백으로 진행 상황을 외부(워커 등)에 보고할 수 있다."""
    def report(msg):
        print(msg, flush=True)
        if progress:
            try:
                progress(msg)
            except Exception:
                pass

    os.makedirs(WORK_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    scenes = data["scenes"]
    title = data.get("title", "qt_video")
    style = data.get("style", DEFAULT_STYLE)
    characters = data.get("characters") or None
    segments, durations = [], []
    wan_n = int(data.get("wan_scenes", 2))
    for i, scene in enumerate(scenes, 1):
        report(f"장면 {i}/{len(scenes)} 이미지 생성 중")
        img = gen_image(styled_prompt(scene["image_prompt"], style, characters), i,
                        texture=style_uses_texture(style))
        narr = gen_narration(scene["narration"], i) if scene.get("narration") else None
        if i <= wan_n:
            report(f"장면 {i}/{len(scenes)} AI 모션 영상 변환 중")
            clip = gen_video(img, scene.get("motion_prompt", "subtle natural motion"), i)
            seg, dur = build_segment(clip, narr, i)
        else:
            report(f"장면 {i}/{len(scenes)} 줌 효과 생성 중")
            seg, dur = build_kenburns_segment(
                os.path.join(WORK_DIR, f"scene_{i:02d}.png"), narr, i)
        segments.append(seg)
        durations.append(dur)
    report("최종 조립 중 (자막·BGM)")
    srt = make_srt(scenes, durations)
    return assemble(segments, srt, title)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    os.makedirs(WORK_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    try:
        requests.get(f"{COMFY_URL}/system_stats", timeout=5)
    except requests.ConnectionError:
        sys.exit("ComfyUI 서버가 꺼져 있습니다. C:\\ComfyUI\\run_comfyui.bat 를 먼저 실행하세요.")

    if src == "--today":
        qt_text, title_hint = fetch_qt_from_church()
        data = split_qt_with_claude(qt_text, title_hint)
    elif src == "--date":
        if len(sys.argv) < 3:
            sys.exit("--date YYYY-MM-DD 형식으로 날짜를 지정하세요.")
        qt_text, title_hint = fetch_qt_from_church(sys.argv[2])
        data = split_qt_with_claude(qt_text, title_hint)
    elif src.lower().endswith(".json"):
        with open(src, encoding="utf-8") as f:
            data = json.load(f)
    else:
        with open(src, encoding="utf-8") as f:
            data = split_qt_with_claude(f.read())

    print(f"[{data.get('title', 'qt_video')}] 장면 {len(data['scenes'])}개 생성 시작")
    final = run_pipeline(data)
    print(f"완성: {final}")


if __name__ == "__main__":
    main()
