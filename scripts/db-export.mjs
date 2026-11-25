// 운평장로교회 — DB 표를 주 1회 JSON 으로 내려받아 이 PC 에 보관한다 (2026-11-25)
//
//   Supabase 의 자동 백업(매일 · 7일치, 대시보드 Database ▸ Backups)과 별개로, 그보다 오래된 시점으로
//   돌아가야 할 때를 위한 두 번째 사본이다. Docker 가 필요 없다(REST 로 표마다 읽는다).
//
//   실행:  node scripts/db-export.mjs
//   필요한 환경변수:
//     SUPABASE_SERVICE_ROLE_KEY   (워커들이 쓰는 그 값 — 교회 PC · 집 PC 사용자 환경변수에 이미 있음)
//     SUPABASE_URL                (없으면 교회 프로젝트 주소)
//     WP_BACKUP_DIR               (없으면 C:\woonpyung-backups) — OneDrive 안이나 이 저장소 안은 거절한다
//     WP_BACKUP_KEEP              (남길 회차, 없으면 8 = 약 두 달)
//
//   만드는 것: <WP_BACKUP_DIR>\<YYYYMMDD_HHMM>\<표>.json + _manifest.json(표마다 줄 수)
//   화면에는 표 이름과 줄 수만 찍는다(교인 자료를 출력하지 않는다).
//   주의: 이 파일들에는 교인 개인정보가 들어 있다. 공개 저장소 · OneDrive · 메신저로 옮기지 않는다.
//   올린 파일(사진 · 영수증 · 음원, Cloudflare R2)은 여기에 들어가지 않는다 — docs/백업과-복구.md 참고.
//
//   예약 등록(주 1회): scripts/register-db-export-task.ps1
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const URL_BASE = (process.env.SUPABASE_URL || "https://cetacttsdwzxjzkyozgd.supabase.co").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DIR = path.resolve(process.env.WP_BACKUP_DIR || (process.platform === "win32" ? "C:\\woonpyung-backups" : path.join(os.homedir(), "woonpyung-backups")));
const KEEP = Math.max(1, parseInt(process.env.WP_BACKUP_KEEP || "8", 10) || 8);
const PAGE = 1000;

function fail(msg) { console.error("✖ " + msg); process.exit(1); }

// 보관 자리 점검 — 공개 저장소나 클라우드 동기화 폴더에 개인정보가 들어가지 않게
function checkDir(dir) {
  const low = dir.toLowerCase();
  const repoLow = REPO.toLowerCase();
  if (low === repoLow || low.startsWith(repoLow + path.sep)) fail("보관 자리가 저장소 안입니다. WP_BACKUP_DIR 을 저장소 밖으로 정해 주세요: " + dir);
  if (/onedrive|dropbox|google drive|googledrive|icloud|내 드라이브|my drive/i.test(dir)) fail("보관 자리가 클라우드 동기화 폴더입니다. 이 PC 의 일반 폴더(예: C:\\woonpyung-backups)로 정해 주세요: " + dir);
}

async function api(p, headers = {}) {
  const r = await fetch(URL_BASE + p, { headers: { apikey: KEY, Authorization: "Bearer " + KEY, ...headers } });
  if (!r.ok) throw new Error(p.split("?")[0] + " → HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return r;
}

// 표 목록 — REST 의 설명서(OpenAPI)에 나오는 것 중 rpc 를 뺀 것
async function listTables() {
  const spec = await (await api("/rest/v1/", { Accept: "application/openapi+json" })).json();
  const defs = spec.definitions || {};
  return Object.keys(defs).sort().map((name) => ({ name, hasId: !!(defs[name].properties || {}).id }));
}

async function exportTable(t, outDir) {
  const file = path.join(outDir, t.name + ".json");
  const out = fs.createWriteStream(file, { encoding: "utf8" });
  out.write("[\n");
  let n = 0, from = 0;
  for (;;) {
    const order = t.hasId ? "&order=id.asc" : "";
    const r = await api(`/rest/v1/${encodeURIComponent(t.name)}?select=*${order}`, { "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` });
    const rows = await r.json();
    for (const row of rows) { out.write((n ? ",\n" : "") + JSON.stringify(row)); n++; }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  out.write("\n]\n");
  await new Promise((res) => out.end(res));
  return n;
}

function rotate(dir, keep) {
  const runs = fs.readdirSync(dir).filter((d) => /^\d{8}_\d{4}$/.test(d) && fs.statSync(path.join(dir, d)).isDirectory()).sort();
  const old = runs.slice(0, Math.max(0, runs.length - keep));
  for (const d of old) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
  return old.length;
}

async function main() {
  if (!KEY) fail("SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  checkDir(DIR);
  fs.mkdirSync(DIR, { recursive: true });
  const now = new Date();
  const p2 = (x) => String(x).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;
  const outDir = path.join(DIR, stamp);
  const tables = await listTables();
  if (!tables.length) fail("표 목록이 비어 있습니다.");
  const tmpDir = outDir + ".part";   // 다 받기 전에는 .part — 끊기면 다음 회차가 지운다
  for (const d of fs.readdirSync(DIR)) if (/^\d{8}_\d{4}\.part$/.test(d)) fs.rmSync(path.join(DIR, d), { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const manifest = { project: URL_BASE, at: now.toISOString(), tables: {} };
  let total = 0, failed = [];
  for (const t of tables) {
    try {
      const n = await exportTable(t, tmpDir);
      manifest.tables[t.name] = n; total += n;
      console.log(`  ${t.name}: ${n}`);
    } catch (e) {
      failed.push(t.name);
      manifest.tables[t.name] = { error: String(e.message || e).slice(0, 200) };
      console.log(`  ${t.name}: 실패 — ${String(e.message || e).slice(0, 120)}`);
    }
  }
  manifest.total = total; manifest.failed = failed;
  fs.writeFileSync(path.join(tmpDir, "_manifest.json"), JSON.stringify(manifest, null, 2));
  fs.renameSync(tmpDir, outDir);   // 다 받은 뒤에만 회차 폴더가 생긴다
  const removed = rotate(DIR, KEEP);
  console.log(`✔ ${outDir} — 표 ${tables.length}개 · ${total}줄${failed.length ? ` · 실패 ${failed.length}개(${failed.join(", ")})` : ""}${removed ? ` · 옛 회차 ${removed}개 정리` : ""}`);
  if (failed.length) process.exit(2);
}

main().catch((e) => fail(e.message || String(e)));
