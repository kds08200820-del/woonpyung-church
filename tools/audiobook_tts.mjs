// 운평장로교회 — «레위기에서 만난 예수 그리스도» 오디오북 만들기 (GPT-SoVITS → Cloudflare R2)
//
// tools/_audiobook_scripts/book-NN.txt (audiobook_split.py 가 만든 낭독 대본)를
// 장별 MP3로 합성해 R2의 audiobook/ 폴더에 올린다.
// 저장 규칙: R2 key = audiobook/book-NN.mp3
//   재생은 공개 주소(/f/)가 아니라 정회원 확인을 거친 /book-audio/ 경로로만 된다.
//
// 준비:
//   · GPT-SoVITS API 실행 (C:\GPT-SoVITS-v2pro-20250604\run_api.bat → 127.0.0.1:9880)
//   · C:\qt-video\worker_config.json 의 관리자 계정으로 R2에 업로드
//
// 사용:
//   node tools/audiobook_tts.mjs --all              # 아직 없는 장 전부(이어하기)
//   node tools/audiobook_tts.mjs --ch 1             # 1장만
//   node tools/audiobook_tts.mjs --ch 0-5           # 여는 글 ~ 5장
//   node tools/audiobook_tts.mjs --all --out _out   # 업로드 없이 로컬 저장(시험용)
//   node tools/audiobook_tts.mjs --ch 3 --force     # 이미 있어도 다시 만들기
//   node tools/audiobook_tts.mjs --all --upload-from _audiobook_out
//        ↑ 이미 만들어 둔 MP3를 합성 없이 올리기만 (GPT-SoVITS 꺼져 있어도 됨)

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SCRIPT_DIR = path.join(HERE, "_audiobook_scripts");
const DATA_JS = path.join(ROOT, "js", "audiobook-data.js");

const SOVITS_API = (process.env.SOVITS_API || "http://127.0.0.1:9880").replace(/\/$/, "");
const REF_AUDIO = process.env.SOVITS_REF || "C:/qt-video/assets/ref_voice.wav";
const REF_TEXT_FILE = process.env.SOVITS_REF_TEXT || "C:/qt-video/assets/ref_text.txt";
const SPEED = Number(process.env.SOVITS_SPEED || 1.0);
const SUPABASE_URL = "https://cetacttsdwzxjzkyozgd.supabase.co";
const ANON = "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G";
const R2_UPLOAD_URL = process.env.R2_UPLOAD_URL || "https://church-files.kds08200820.workers.dev";
const WORKER_CONFIG = process.env.WORKER_CONFIG || "C:/qt-video/worker_config.json";

// 한 번에 통째로 합성하면 20분 넘게 걸리고 실패 시 전부 날아간다.
// 그래서 문단 단위로 이만큼씩 묶어 나눠 합성한 뒤 이어 붙인다.
const CHUNK_CHARS = Number(process.env.AUDIOBOOK_CHUNK || 900);

let PROMPT_TEXT = "";
try { PROMPT_TEXT = fs.readFileSync(REF_TEXT_FILE, "utf8").trim(); } catch {}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const OPT = {
  all: has("--all"), ch: val("--ch"), out: val("--out"), force: has("--force"),
  uploadFrom: val("--upload-from"),
};

function findFfmpeg() {
  const cands = [process.env.FFMPEG_PATH].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  const w = spawnSync("where", ["ffmpeg"], { encoding: "utf8" });
  if (w.status === 0 && w.stdout && w.stdout.trim()) return w.stdout.trim().split(/\r?\n/)[0];
  return "ffmpeg";
}
const FF = findFfmpeg();

// ── 목차 읽기 (audiobook_split.py 가 만든 js/audiobook-data.js) ──
function loadChapters() {
  const src = fs.readFileSync(DATA_JS, "utf8")
    .replace(/^[\s\S]*?window\.AUDIOBOOK\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(src).chapters;
}

// ── 대본을 합성하기 좋은 덩어리로 나눔 ──
// 문단 경계에서만 자른다 — 문장 중간에서 끊기면 이어 붙일 때 어색해진다.
function chunkScript(text) {
  const paras = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const out = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur.length + p.length + 1) > CHUNK_CHARS) { out.push(cur); cur = p; }
    else cur = cur ? cur + "\n" + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

// ── GPT-SoVITS ──
async function sovitsUp() {
  try { await fetch(`${SOVITS_API}/control`); return true; } catch { return false; }
}
// node:http 사용 — 긴 덩어리가 global fetch 기본 타임아웃(300초)에 끊기는 것을 피한다.
function synth(text) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${SOVITS_API}/tts`);
    const payload = JSON.stringify({
      text, text_lang: "ko", ref_audio_path: REF_AUDIO, prompt_text: PROMPT_TEXT,
      prompt_lang: "ko", text_split_method: "cut5", speed_factor: SPEED,
      media_type: "wav", streaming_mode: false,
    });
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200 || buf.length < 1000) {
          return reject(new Error(`합성 실패(${res.statusCode}) ${buf.slice(0, 200)}`));
        }
        resolve(buf);
      });
    });
    req.on("error", reject);
    req.setTimeout(20 * 60 * 1000, () => req.destroy(new Error("합성 타임아웃(20분)")));
    req.write(payload);
    req.end();
  });
}
async function synthRetry(text, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await synth(text); }
    catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw last;
}

// ── 덩어리 WAV들을 하나의 MP3로 ──
function joinToMp3(wavs, tag) {
  const tmp = path.join(HERE, "_audiobook_tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const parts = [];
  try {
    wavs.forEach((w, i) => {
      const p = path.join(tmp, `${tag}_${String(i).padStart(3, "0")}.wav`);
      fs.writeFileSync(p, w);
      parts.push(p);
    });
    const listFile = path.join(tmp, `${tag}.txt`);
    // concat 목록의 경로는 작은따옴표로 감싼다(경로에 공백이 있어도 안전).
    fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"), "utf8");
    const mp3 = path.join(tmp, `${tag}.mp3`);
    const r = spawnSync(FF, [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-ac", "1", "-ar", "44100", "-b:a", "64k", mp3,
    ], { encoding: "utf8" });
    if (!fs.existsSync(mp3)) throw new Error("MP3 변환 실패(ffmpeg): " + (r.stderr || "").slice(-400));
    const buf = fs.readFileSync(mp3);
    fs.unlinkSync(mp3);
    fs.unlinkSync(listFile);
    return buf;
  } finally {
    for (const p of parts) { try { fs.unlinkSync(p); } catch {} }
  }
}

// ── 관리자 로그인(R2 업로드용) ──
function loadAdmin() {
  try {
    const c = JSON.parse(fs.readFileSync(WORKER_CONFIG, "utf8").replace(/^\uFEFF/, ""));
    if (c.email && c.password) return c;
  } catch {}
  if (process.env.CHURCH_ADMIN_EMAIL && process.env.CHURCH_ADMIN_PASSWORD) {
    return { email: process.env.CHURCH_ADMIN_EMAIL, password: process.env.CHURCH_ADMIN_PASSWORD };
  }
  return null;
}
async function adminToken() {
  const a = loadAdmin();
  if (!a) throw new Error(`관리자 계정을 읽지 못했습니다(${WORKER_CONFIG}).`);
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, password: a.password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`관리자 로그인 실패(${r.status})`);
  return j.access_token;
}
// 장시간 실행 중 토큰이 만료되지 않도록 45분마다 새로 받는다.
let _tok = null, _tokTime = 0;
async function getToken(force) {
  if (force || !_tok || (Date.now() - _tokTime) > 45 * 60 * 1000) {
    _tok = await adminToken(); _tokTime = Date.now();
  }
  return _tok;
}

// 오디오북은 공개 주소로 확인할 수 없으므로(그게 목적이다) 관리자 목록으로 확인한다.
async function listUploaded() {
  const token = await getToken();
  const r = await fetch(`${R2_UPLOAD_URL}/book-audio-list`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`목록 조회 실패(${r.status}): ${JSON.stringify(j).slice(0, 150)}`);
  return new Set((j.files || []).map((f) => f.name));
}

async function r2Upload(name, mp3) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const r = await fetch(`${R2_UPLOAD_URL}/book-audio`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/mpeg", "x-book-name": name },
      body: mp3,
    });
    if (r.status === 401 && attempt === 0) continue; // 토큰 만료 → 갱신 후 1회 재시도
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(`업로드 실패(${r.status}): ${JSON.stringify(j).slice(0, 150)}`);
    return j.key;
  }
}

// ── 대상 고르기 ──
function resolveTargets(chapters) {
  if (OPT.ch) {
    const m = String(OPT.ch).match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/);
    if (!m) throw new Error("--ch 는 3 또는 0-5 형태로 지정하세요.");
    const from = Number(m[1]), to = m[2] ? Number(m[2]) : Number(m[1]);
    return chapters.filter((c) => c.no >= from && c.no <= to);
  }
  if (OPT.all) return chapters;
  return [];
}

function mm(sec) { return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`; }

async function main() {
  const chapters = loadChapters();
  const targets = resolveTargets(chapters);
  if (!targets.length) {
    console.log("대상이 없습니다. --all 또는 --ch 3 / --ch 0-5 를 지정하세요.");
    return;
  }
  // 이미 만들어 둔 MP3를 올리기만 하는 길 — 합성을 다시 하지 않는다.
  if (OPT.uploadFrom) {
    const dir = path.resolve(HERE, OPT.uploadFrom);
    if (!fs.existsSync(dir)) { console.log(`폴더가 없습니다: ${dir}`); process.exit(1); }
    const done = OPT.force ? new Set() : await listUploaded();
    let ok = 0, skip = 0, fail = 0;
    for (const c of targets) {
      const name = `${c.id}.mp3`;
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) { console.log(`  건너뜀(파일 없음): ${name}`); skip++; continue; }
      if (done.has(name)) { console.log(`  건너뜀(이미 올라감): ${name}`); skip++; continue; }
      const buf = fs.readFileSync(p);
      try {
        await r2Upload(name, buf);
        ok++;
        console.log(`  ✓ ${name} ${(buf.length / 1024 / 1024).toFixed(1)}MB 업로드`);
      } catch (e) {
        fail++;
        console.error(`  ✗ ${name}: ${e.message}`);
      }
    }
    console.log(`\n업로드 완료: ${ok}개 성공, ${skip}개 건너뜀, ${fail}개 실패`);
    return;
  }

  console.log(`ffmpeg: ${FF}`);
  if (!(await sovitsUp())) {
    console.log("GPT-SoVITS(9880)가 꺼져 있습니다. C:\\GPT-SoVITS-v2pro-20250604\\run_api.bat 을 먼저 실행하세요.");
    process.exit(1);
  }

  const outDir = OPT.out ? path.resolve(HERE, OPT.out) : null;
  let done = new Set();
  if (!OPT.force) {
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      done = new Set(fs.readdirSync(outDir));
    } else {
      done = await listUploaded();
    }
  }

  const todo = targets.filter((c) => OPT.force || !done.has(`${c.id}.mp3`));
  console.log(`대상 ${targets.length}개 중 ${todo.length}개 생성 (${outDir ? "로컬 저장" : "R2 업로드"})`);
  if (!todo.length) return;

  let ok = 0, fail = 0;
  const t00 = Date.now();
  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    const scriptPath = path.join(SCRIPT_DIR, `${c.id}.txt`);
    if (!fs.existsSync(scriptPath)) {
      console.error(`  [${i + 1}/${todo.length}] 대본 없음: ${scriptPath} — python tools/audiobook_split.py 를 먼저 실행하세요.`);
      fail++;
      continue;
    }
    const text = fs.readFileSync(scriptPath, "utf8");
    const chunks = chunkScript(text);
    const label = `${c.label} ${c.title}`.trim();
    console.log(`[${i + 1}/${todo.length}] ${label} — ${c.chars.toLocaleString()}자 / ${chunks.length}덩어리`);
    const t0 = Date.now();
    try {
      const wavs = [];
      for (let k = 0; k < chunks.length; k++) {
        const tk = Date.now();
        wavs.push(await synthRetry(chunks[k]));
        process.stdout.write(`   · ${k + 1}/${chunks.length} (${((Date.now() - tk) / 1000).toFixed(0)}초)\r`);
      }
      const mp3 = joinToMp3(wavs, c.id);
      if (outDir) fs.writeFileSync(path.join(outDir, `${c.id}.mp3`), mp3);
      else await r2Upload(`${c.id}.mp3`, mp3);
      ok++;
      console.log(`   ✓ ${c.id}.mp3 ${(mp3.length / 1024 / 1024).toFixed(1)}MB · ${mm((Date.now() - t0) / 1000)}          `);
    } catch (e) {
      fail++;
      console.error(`   ✗ ${label}: ${e.message}`);
    }
  }
  console.log(`\n완료: ${ok}개 성공, ${fail}개 실패 · 총 ${mm((Date.now() - t00) / 1000)}`);
}

main().catch((e) => { console.error("오류:", e); process.exit(1); });
