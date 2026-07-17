// 프로덕션 Supabase DB를 스키마+데이터 통합 SQL 파일로 백업합니다.
// 실행: npm run db:backup
// 사전 준비(최초 1회):
//   1) Docker Desktop 실행 (supabase db dump가 내부적으로 pg_dump 컨테이너를 사용)
//   2) npx supabase login
//   3) npx supabase link --project-ref cetacttsdwzxjzkyozgd
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const ts =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const backupDir = path.join(__dirname, "..", "backups");
fs.mkdirSync(backupDir, { recursive: true });

const schemaTmp = path.join(backupDir, `_tmp_${ts}_schema.sql`);
const dataTmp = path.join(backupDir, `_tmp_${ts}_data.sql`);
const outFile = path.join(backupDir, `backup_${ts}.sql`);

function run(args, label) {
  console.log(`▶ ${label} 중...`);
  const r = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`✖ ${label} 실패 — Docker 실행 여부와 supabase link 상태를 확인하세요.`);
    [schemaTmp, dataTmp].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    process.exit(r.status || 1);
  }
}

run(["db", "dump", "--linked", "-f", schemaTmp], "스키마 덤프");
run(["db", "dump", "--linked", "--data-only", "-f", dataTmp], "데이터 덤프");

const header =
  `-- 운평교회 프로덕션 백업 (${now.toLocaleString("ko-KR")})\n` +
  `-- 프로젝트: cetacttsdwzxjzkyozgd\n` +
  `-- 이 파일에는 교인 개인정보가 포함될 수 있습니다. 절대 GitHub에 올리지 마세요.\n\n`;

fs.writeFileSync(
  outFile,
  header +
    "-- ========== 1. 스키마 ==========\n" +
    fs.readFileSync(schemaTmp, "utf8") +
    "\n-- ========== 2. 데이터 ==========\n" +
    fs.readFileSync(dataTmp, "utf8")
);
fs.unlinkSync(schemaTmp);
fs.unlinkSync(dataTmp);

const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`✔ 백업 완료: ${outFile} (${sizeMB} MB)`);
