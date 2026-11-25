// 교회 PC 워커 멈춤 알기(20261125_1400_worker_health + apps-script/worker-health-push.gs) 시험 — 가짜 자료 · 가짜 Apps Script 환경.
//   node tools/sqltest/worker_health.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import vm from 'vm';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const ADMIN = '00000000-0000-0000-0000-000000000009', MEM = '00000000-0000-0000-0000-000000000001';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.admins(uid uuid primary key); insert into public.admins values ('${ADMIN}');
create table public.app_settings(key text primary key, value text, updated_at timestamptz default now());
create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);
`);
await db.exec(fs.readFileSync(repo + '/supabase/church_settings.sql', 'utf8'));
const mig = fs.readFileSync(repo + '/supabase/20261125_1400_worker_health.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
const as = async (role, uid, sql) => { await db.exec(`select set_config('t.uid','${uid || ''}',false)`); await db.exec('set role ' + role); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
await db.exec(`insert into public.app_settings values ('member_match_push_key', 'K32', now());
insert into public.church_settings(key, data) values
  ('worker_ai', '{"worker":"ai","host":"church-pc","last_seen":"${ago(5)}","state":"running"}'),
  ('worker_worship', '{"worker":"worship","host":"church-pc","last_seen":"${ago(90)}","state":"running"}'),
  ('kakao_worker', '{"worker":"church-pc","last_seen":"${ago(1600)}","kakao":"ok"}'),
  ('worker_x', '{}');`);
let h = (await as('authenticated', ADMIN, 'select public.worker_health() r'))[0].r;
ok(h.length === 3 && h[0].name === 'ai' && h[0].stale === false && h[1].stale === true && h[2].stale === true && h[1].minutes >= 89, '관리자: 워커 셋 · 몇 분 · 멈춤 여부');
await db.exec(`update public.church_settings set data = jsonb_set(data, '{last_seen}', to_jsonb('${ago(480)}'::text)) where key = 'kakao_worker';`);
h = (await as('authenticated', ADMIN, 'select public.worker_health() r'))[0].r;
ok(h[2].stale === false, '카카오톡 워커는 아침에만 돌므로 8시간 끊김은 멈춤이 아님(26시간 기준)');
await db.exec(`update public.church_settings set data = jsonb_set(data, '{last_seen}', to_jsonb('${ago(1600)}'::text)) where key = 'kakao_worker';`);
ok((await as('authenticated', MEM, 'select public.worker_health() r'))[0].r.length === 0, '보통 회원은 빈 목록');
let f = (await as('anon', null, 'select public.worker_health_push_feed() r'))[0].r;
ok(f.key === 'K32' && f.stale.map((x) => x.name).join() === 'worship,kakao' && !JSON.stringify(f).includes('church-pc'), '공개 피드: 멈춘 워커 이름 · 몇 분 · 열쇠만(PC 이름 없음)');
await db.exec(`update public.church_settings set data = data || '{"state":"stopped"}'::jsonb where key = 'worker_worship';`);
f = (await as('anon', null, 'select public.worker_health_push_feed() r'))[0].r;
ok(f.stale.map((x) => x.name).join() === 'kakao', '스스로 끈 워커(stopped)는 알리지 않음');
await db.exec(`delete from public.church_settings where key = 'kakao_worker';`);
f = (await as('anon', null, 'select public.worker_health_push_feed() r'))[0].r;
ok(f.stale.length === 0, '기록이 없는 워커는 알리지 않음');
ok((await q(`select count(*)::int n from public.schema_log where file = '20261125_1400_worker_health.sql'`)).rows[0].n === 1, '실행 기록 남김');

// ── Apps Script ──
function gas(feeds, hour, code = 200) {
  const props = { ONESIGNAL_REST_KEY: 'rest-key-0123456789' }, sent = [];
  let i = 0;
  const ctx = {
    Logger: { log: () => { } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => { }, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { } }) }) }) },
    Utilities: { formatDate: () => String(hour) },
    UrlFetchApp: { fetch: (url, opt) => {
      if (/worker_health_push_feed/.test(url)) { const b = feeds[Math.min(i++, feeds.length - 1)]; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(b) }; }
      sent.push(JSON.parse(opt.payload)); return { getResponseCode: () => code, getContentText: () => '{}' };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(repo + '/apps-script/worker-health-push.gs', 'utf8'), ctx);
  return { props, sent, run: () => vm.runInContext('pollWorkerHealth()', ctx) };
}
const S = (n, m) => ({ name: n, label: n === 'ai' ? 'AI 답변 · 설교 PDF' : '카카오톡 QT 발송', minutes: m });
{
  const g = gas([{ key: 'K32', stale: [S('ai', 45)] }, { key: 'K32', stale: [S('ai', 75)] }, { key: 'K32', stale: [] }, { key: 'K32', stale: [S('ai', 50)] }], 10);
  g.run();
  ok(g.sent.length === 1 && g.sent[0].filters[0].key === 'mm' && g.sent[0].filters[0].value === 'K32' && /AI 답변/.test(g.sent[0].contents.ko) && /45분째/.test(g.sent[0].contents.ko), '멈춘 워커 → 관리자 기기에 알림');
  g.run();
  ok(g.sent.length === 1, '같은 멈춤은 한 번만');
  g.run();
  ok(JSON.parse(g.props.workerHealthTold).ai === undefined, '다시 살아나면 잊음');
  g.run();
  ok(g.sent.length === 2, '다시 멈추면 다시 알림');
}
{
  const g = gas([{ key: 'K32', stale: [S('kakao', 600)] }], 23);
  g.run();
  ok(g.sent.length === 0 && !JSON.parse(g.props.workerHealthTold).kakao, '밤 10시 ~ 아침 7시에는 알리지 않음(아침에 다시)');
}
{
  const g = gas([{ key: 'K32', stale: [S('ai', 45)] }, { key: 'K32', stale: [S('ai', 75)] }], 10, 500);
  g.run(); g.run();
  ok(g.sent.length === 2 && !JSON.parse(g.props.workerHealthTold).ai, '보내지 못하면 「알림」으로 적지 않고 다음에 다시');
}
{
  const g = gas([{ key: null, stale: [S('ai', 45)] }], 10);
  g.run();
  ok(g.sent.length === 0, '관리자 기기 열쇠가 없으면 보내지 않음');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
