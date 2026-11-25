// DB 주간 내려받기(scripts/db-export.mjs) 시험 — 가짜 REST 서버 · 가짜 자료만. 실제 DB 에는 아무것도 보내지 않는다.
//   node tools/sqltest/db_export.test.mjs <저장소 경로>        (따로 설치할 것 없음)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const repo = process.argv[2] || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };

// 가짜 PostgREST: 표 두 개(people 2500줄 · settings 3줄), 열쇠가 틀리면 401
const people = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, name: '가짜' + (i + 1) }));
const settings = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }, { key: 'c', value: '3' }];
let seenOrder = null;
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer test-key' || req.headers.apikey !== 'test-key') { res.writeHead(401); return res.end('{"message":"bad key"}'); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/rest/v1/') {
    res.writeHead(200, { 'Content-Type': 'application/openapi+json' });
    return res.end(JSON.stringify({ definitions: { people: { properties: { id: {}, name: {} } }, settings: { properties: { key: {}, value: {} } } } }));
  }
  const m = (req.headers.range || '0-999').match(/(\d+)-(\d+)/);
  const from = +m[1], to = +m[2];
  if (u.pathname === '/rest/v1/people') { seenOrder = u.searchParams.get('order'); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(people.slice(from, to + 1))); }
  if (u.pathname === '/rest/v1/settings') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(settings.slice(from, to + 1))); }
  res.writeHead(404); res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-dbexp-'));
const run = (env) => new Promise((resolve) => {
  const child = require_spawn(env);
  let out = ''; child.stdout.on('data', (d) => out += d); child.stderr.on('data', (d) => out += d);
  child.on('close', (code) => resolve({ code, out }));
});
import { spawn } from 'child_process';
function require_spawn(env) {
  return spawn(process.execPath, [path.join(repo, 'scripts', 'db-export.mjs')], { env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT || '', ...env } });
}
try {
  // 1) 정상: 표마다 파일, 줄 수 맞음, 쪽 나누기(2500줄 = 3번), id 순서
  let r = await run({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'test-key', WP_BACKUP_DIR: tmp, WP_BACKUP_KEEP: '2' });
  const runs1 = fs.readdirSync(tmp).filter((d) => /^\d{8}_\d{4}$/.test(d));
  ok(r.code === 0 && runs1.length === 1, '내려받기 성공 · 회차 폴더 하나');
  const d1 = path.join(tmp, runs1[0]);
  const P = JSON.parse(fs.readFileSync(path.join(d1, 'people.json'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(d1, 'settings.json'), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(d1, '_manifest.json'), 'utf8'));
  ok(P.length === 2500 && P[0].id === 1 && P[2499].id === 2500 && S.length === 3, '줄 수와 내용이 그대로(1000줄씩 나눠 받음)');
  ok(man.tables.people === 2500 && man.tables.settings === 3 && man.total === 2503 && man.failed.length === 0, '목록 파일(_manifest)');
  ok(seenOrder === 'id.asc', 'id 가 있는 표는 id 순서로 받음');
  ok(!/가짜\d/.test(r.out), '화면에는 표 이름과 줄 수만(자료 내용은 찍지 않음)');
  // 2) 회차 정리: 옛 회차를 만들어 두고 KEEP=2
  fs.mkdirSync(path.join(tmp, '20200101_0000')); fs.mkdirSync(path.join(tmp, '20200102_0000')); fs.writeFileSync(path.join(tmp, 'note.txt'), 'x');
  await new Promise((res) => setTimeout(res, 61000 - (Date.now() % 60000)));   // 다음 분으로 넘어가 폴더 이름이 달라지게
  r = await run({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'test-key', WP_BACKUP_DIR: tmp, WP_BACKUP_KEEP: '2' });
  const runs2 = fs.readdirSync(tmp).filter((d) => /^\d{8}_\d{4}$/.test(d)).sort();
  ok(r.code === 0 && runs2.length === 2 && !runs2.includes('20200101_0000') && !runs2.includes('20200102_0000') && fs.existsSync(path.join(tmp, 'note.txt')), '옛 회차만 정리(다른 파일은 그대로)');
  // 3) 열쇠가 틀리면 실패하고 회차 폴더를 만들지 않음
  r = await run({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'wrong', WP_BACKUP_DIR: tmp });
  ok(r.code !== 0 && fs.readdirSync(tmp).filter((d) => /^\d{8}_\d{4}$/.test(d)).length === 2, '열쇠가 틀리면 실패, 새 회차 없음');
  // 4) 열쇠가 없으면 실패
  r = await run({ SUPABASE_URL: base, WP_BACKUP_DIR: tmp });
  ok(r.code !== 0 && /SUPABASE_SERVICE_ROLE_KEY/.test(r.out), '열쇠가 없으면 실패');
  // 5) 보관 자리: 저장소 안 · OneDrive 는 거절
  r = await run({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'test-key', WP_BACKUP_DIR: path.join(repo, 'backups') });
  ok(r.code !== 0 && /저장소 안/.test(r.out), '저장소 안은 거절');
  r = await run({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'test-key', WP_BACKUP_DIR: path.join(tmp, 'OneDrive', 'x') });
  ok(r.code !== 0 && /클라우드/.test(r.out) && !fs.existsSync(path.join(tmp, 'OneDrive')), 'OneDrive 는 거절(폴더도 만들지 않음)');
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
