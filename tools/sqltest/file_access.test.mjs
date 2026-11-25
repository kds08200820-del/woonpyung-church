// 지키는 폴더의 파일을 볼 수 있는 사람(20261125_0100_file_access) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node file_access.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const U = n => '00000000-0000-0000-0000-00000000000' + n;
const ADMIN = U(9), FIN = U(8), MEM = U(1), SPOUSE = U(2), OTHER = U(3);
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.admins(uid uuid primary key);
alter table public.admins enable row level security;
create policy admins_select_self on public.admins for select using (auth.uid() = uid);
grant select on public.admins to authenticated;
insert into auth.users select ('00000000-0000-0000-0000-00000000000' || g)::uuid from generate_series(1, 9) g;
insert into public.admins values ('${ADMIN}');
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column if not exists spouse_key text;`);
const fm = fs.readFileSync(repo + '/supabase/finance_migration.sql', 'utf8');
await db.exec(fm.slice(0, fm.indexOf('-- ── 마스터/거래 테이블')));   // is_finance() · my_member_keys()
await db.exec(fs.readFileSync(repo + '/supabase/member_files.sql', 'utf8'));
await db.exec(`grant select, insert, update, delete on public.member_files to authenticated;`);
await db.exec(`
insert into public.member_links(user_id, member_status, member_key, member_name, spouse_key, can_finance) values
  ('${MEM}', '정회원', '홍길동|19700101', '홍길동', '성춘향|19720202', false),
  ('${SPOUSE}', '정회원', '성춘향|19720202', '성춘향', '홍길동|19700101', false),
  ('${OTHER}', '정회원', '이몽룡|19800303', '이몽룡', null, false),
  ('${FIN}', '정회원', '김재정|19600101', '김재정', null, true);
insert into public.member_files(member_key, member_name, title, file_url, file_key) values
  ('홍길동|19700101', '홍길동', '세례증명서', 'https://files.example.test/f/archive/${ADMIN}/1764000000000-aa.pdf', 'archive/${ADMIN}/1764000000000-aa.pdf'),
  ('이몽룡|19800303', '이몽룡', '수료증', 'https://files.example.test/f/archive/${ADMIN}/1764000000001-bb.pdf', null);
`);
const mig = fs.readFileSync(repo + '/supabase/20261125_0100_file_access.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
const access = async (uid, keys, role = 'authenticated') => {
  await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role ' + role);
  try { return (await q('select public.file_access($1::text[]) r', [keys])).rows[0].r; } finally { await db.exec('reset role'); }
};
const K = {
  gj: `gyojeok/${ADMIN}/1764000000000-p1.jpg`,
  fr: `financereceipt/${FIN}/1764000000000-seal.png`,
  cs: `churchseal/${ADMIN}/1764000000000-c.png`,
  doc: `affairsdocuments/${ADMIN}/1764000000000-d.pdf`,
  arMine: `archive/${ADMIN}/1764000000000-aa.pdf`,
  arOther: `archive/${ADMIN}/1764000000001-bb.pdf`,
  arNone: `archive/${ADMIN}/1764000000002-cc.pdf`,
  res: `resources/${ADMIN}/1764000000000-r.pdf`,
  ownGj: `gyojeok/${MEM}/1764000000000-mine.jpg`,
  album: `album/${MEM}/1764000000000-a.jpg`,
};
const all = Object.values(K);
// 1) 로그인 없이
try { await access('', all, 'anon'); ok(false, 'anon 은 실행 권한 없음'); } catch (e) { ok(/permission denied/.test(e.message), 'anon 은 실행 권한 없음'); }
ok((await access('', all)).length === 0, '토큰 없는 호출은 빈 목록');
// 2) 관리자: 다 (자료실 · 성도별 자료 · 문서 · 재정 그림 · 교적 사진)
let r = await access(ADMIN, all);
ok([K.gj, K.fr, K.cs, K.doc, K.arMine, K.arOther, K.arNone, K.res].every(k => r.includes(k)) && !r.includes(K.album), '관리자: 지키는 폴더는 모두, 다른 폴더 키는 돌려주지 않음');
// 3) 재정 권한자: 교적 사진 · 재정 그림 · 도장 · 자료실, 문서 첨부와 남의 성도별 자료는 아님
r = await access(FIN, all);
ok(r.includes(K.gj) && r.includes(K.fr) && r.includes(K.cs) && r.includes(K.res) && !r.includes(K.doc) && !r.includes(K.arMine) && !r.includes(K.arOther), '재정 권한자');
// 4) 보통 정회원: 자료실 · 내 성도별 자료 · 내가 올린 파일만
r = await access(MEM, all);
ok(r.includes(K.res) && r.includes(K.arMine) && r.includes(K.ownGj) && !r.includes(K.arOther) && !r.includes(K.arNone) && !r.includes(K.gj) && !r.includes(K.fr) && !r.includes(K.doc) && !r.includes(K.cs), '정회원: 자료실 · 내 자료 · 내가 올린 것만');
// 5) 배우자: 배우자 자료도(my_member_keys 는 본인 + 배우자)
r = await access(SPOUSE, all);
ok(r.includes(K.arMine) && !r.includes(K.arOther), '배우자: 배우자 이름으로 된 자료도 보임');
// 6) 다른 정회원: 자기 자료만(주소로만 맞춘 줄 — file_key 가 비어 있어도)
r = await access(OTHER, all);
ok(r.includes(K.arOther) && !r.includes(K.arMine) && r.includes(K.res), '다른 정회원: 자기 자료(주소로 맞춤)만');
// 7) 이상한 키
r = await access(ADMIN, ['', 'gyojeok/../x', 'x'.repeat(301), 'gyojeok']);
ok(r.length === 0, '빈 키 · .. · 너무 긴 키 · 폴더만 있는 키는 거절');
// 8) 많이 보내도 300개까지만 본다
r = await access(ADMIN, Array.from({ length: 400 }, (_, i) => `resources/${ADMIN}/${1764000000000 + i}-x.pdf`));
ok(r.length === 300, '한 번에 300개까지');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
