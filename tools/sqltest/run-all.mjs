// tools/sqltest 의 시험을 모두 돌린다 (2026-11-25) — GitHub Actions(.github/workflows/check.yml)와 손으로 함께 쓴다.
//   필요한 것: 저장소 맨 위(또는 위쪽 폴더)의 node_modules 에 @electric-sql/pglite@0.2 · jsdom
//   node tools/sqltest/run-all.mjs [이름 일부 …]       예) node tools/sqltest/run-all.mjs member file_access
//   python 시험(*.test.py)도 함께 돌린다(python 이 있을 때).
//   실패 판정: 끝난 코드가 0 이 아니거나, 출력에 FAIL · SHOULD FAIL 이 있으면.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
// 따로 준비가 필요해 자동으로 돌리지 않는 시험(이유)
const SKIP = {
  "budget_sync_ohjic.test.mjs": "실행 전 예산 자료 JSON 두 개를 인자로 받아야 함",
  "meeting_docs_ui.test.mjs": "로컬 시험 화면(.claude/harness, 저장소에 없음)이 필요함",
};
const only = process.argv.slice(2);
const files = fs.readdirSync(HERE).filter((f) => /\.test\.(mjs|py)$/.test(f)).sort()
  .filter((f) => !only.length || only.some((o) => f.includes(o)));
let bad = 0, skipped = 0;
const t0 = Date.now();
for (const f of files) {
  if (SKIP[f]) { skipped++; console.log(`- 건너뜀  ${f}  (${SKIP[f]})`); continue; }
  const py = f.endsWith(".py");
  const cmd = py ? (process.platform === "win32" ? "python" : "python3") : process.execPath;
  const t = Date.now();
  const r = spawnSync(cmd, py ? ["-I", path.join(HERE, f), REPO] : [path.join(HERE, f), REPO], {
    cwd: REPO, encoding: "utf8", timeout: 10 * 60 * 1000, env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (py && r.error && r.error.code === "ENOENT") { skipped++; console.log(`- 건너뜀  ${f}  (python 없음)`); continue; }
  const out = (r.stdout || "") + (r.stderr || "");
  const failed = r.status !== 0 || /\bFAIL\b|SHOULD FAIL/.test(out);
  const last = out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "";
  console.log(`${failed ? "✖ 실패  " : "✔ 통과  "}${f}  ${((Date.now() - t) / 1000).toFixed(1)}초  ${last.slice(0, 80)}`);
  if (failed) {
    bad++;
    console.log(out.split(/\r?\n/).filter((l) => /FAIL|Error|error|실패/.test(l)).slice(0, 15).map((l) => "    " + l).join("\n"));
  }
}
console.log(`\n시험 ${files.length}개 · 실패 ${bad} · 건너뜀 ${skipped} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
process.exit(bad ? 1 : 0);
