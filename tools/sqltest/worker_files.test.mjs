// 파일 워커(cloudflare/worker.js) 시험 — 가짜 저장소(R2) · 가짜 Supabase 로 Node 에서 돌린다. 실제 서버에는 아무것도 보내지 않는다.
//   node worker_files.test.mjs <저장소 경로>        (따로 설치할 것 없음, Node 20 이상)
import { pathToFileURL } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
const repo = process.argv[2];
// 워커 파일을 .mjs 로 복사해 모듈로 읽는다
const tmp = path.join(os.tmpdir(), 'wp-worker-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(repo + '/cloudflare/worker.js', 'utf8'));
const worker = (await import(pathToFileURL(tmp).href)).default;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };

// ── 가짜 R2 ──
const store = new Map();   // key → { bytes, ct }
const BUCKET = {
  async get(key) {
    const o = store.get(key); if (!o) return null;
    return { body: new Blob([o.bytes]).stream(), size: o.bytes.length, httpEtag: '"e"', range: { offset: 0, length: o.bytes.length },
      writeHttpMetadata(h) { if (o.ct) h.set('Content-Type', o.ct); } };
  },
  async put(key, body, opts) { const buf = new Uint8Array(await new Response(body).arrayBuffer()); store.set(key, { bytes: buf, ct: opts && opts.httpMetadata && opts.httpMetadata.contentType }); return {}; },
  async delete(key) { store.delete(key); },
  async list({ prefix, startAfter, limit }) {
    const keys = [...store.keys()].filter(k => k.startsWith(prefix) && (!startAfter || k > startAfter)).sort().slice(0, limit || 1000);
    return { objects: keys.map(k => ({ key: k, size: store.get(k).bytes.length })), truncated: false };
  },
};
// ── 가짜 Supabase ── 토큰 = 'tok-<uid>'
const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000009', FIN = 'aaaaaaaa-0000-0000-0000-000000000008', MEM = 'aaaaaaaa-0000-0000-0000-000000000001';
const admins = new Set([ADMIN]), fins = new Set([ADMIN, FIN]);
let fileAccessCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  const tok = String((opt.headers && (opt.headers.Authorization || opt.headers.authorization)) || '').replace(/^Bearer /, '');
  const uid = tok.startsWith('tok-') ? tok.slice(4) : null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (!url.startsWith('https://sb.example.test')) throw new Error('unexpected fetch ' + url);
  if (url.endsWith('/auth/v1/user')) return uid ? J({ id: uid }) : J({ msg: 'bad' }, 401);
  if (url.includes('/rest/v1/admins')) return J(uid && admins.has(uid) ? [{ uid }] : []);
  if (url.endsWith('/rpc/can_access_finance')) return J(!!(uid && fins.has(uid)));
  if (url.endsWith('/rpc/file_access')) {
    fileAccessCalls++;
    const keys = JSON.parse(opt.body).p_keys;
    // 가짜 규칙: 관리자는 다, 재정은 gyojeok · financereceipt, 정회원은 resources + 자기가 올린 것
    return J(keys.filter(k => admins.has(uid) || (fins.has(uid) && /^(gyojeok|financereceipt)\//.test(k)) || (uid && (/^resources\//.test(k) || k.split('/')[1] === uid))));
  }
  throw new Error('unexpected supabase call ' + url);
};
const env = { BUCKET, SUPABASE_URL: 'https://sb.example.test', SUPABASE_ANON_KEY: 'anon', BOOK_AUDIO_SECRET: 'x'.repeat(40), WORKER_UPLOAD_KEY: 'w'.repeat(32) };
const W = 'https://church-files.example.test';
const call = (method, p, { tok, headers = {}, body } = {}) => worker.fetch(new Request(W + p, {
  method, body, duplex: body ? 'half' : undefined,
  headers: { Origin: 'https://k-logos.com', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers },
}), env);
const jsonOf = async r => { try { return await r.json(); } catch (e) { return {}; } };

store.set(`gyojeok/${ADMIN}/1764000000000-p.jpg`, { bytes: new TextEncoder().encode('JPG'), ct: 'image/jpeg' });
store.set(`resources/${ADMIN}/1764000000000-r.pdf`, { bytes: new TextEncoder().encode('PDF'), ct: 'application/pdf' });
store.set(`album/${MEM}/1764000000000-a.jpg`, { bytes: new TextEncoder().encode('ALB'), ct: 'image/jpeg' });
store.set(`album/${MEM}/1764000000001-x.html`, { bytes: new TextEncoder().encode('<script>'), ct: 'text/html' });

// 1) 공개 경로: 지키는 폴더는 막고, 다른 폴더는 그대로
let r = await call('GET', `/f/gyojeok/${ADMIN}/1764000000000-p.jpg`);
ok(r.status === 403, '/f/ 교적 사진 → 403');
r = await call('GET', `/f/resources/${ADMIN}/1764000000000-r.pdf`);
ok(r.status === 403, '/f/ 자료실 → 403');
r = await call('GET', `/f/album/${MEM}/1764000000000-a.jpg`);
ok(r.status === 200 && (await r.text()) === 'ALB' && r.headers.get('X-Content-Type-Options') === 'nosniff', '/f/ 앨범 → 200 그대로');
r = await call('GET', `/f/album/${MEM}/1764000000001-x.html`);
ok(r.status === 200 && r.headers.get('Content-Type') === 'application/octet-stream' && r.headers.get('Content-Disposition') === 'attachment', '/f/ 예전에 올라간 html 은 내려받기로만');
r = await call('GET', `/f/hymnmr/1_orch.m4a`);
ok(r.status === 403, '/f/ 찬송가 반주는 예전처럼 막힘');
// 2) 서명 주소 발급
const keys = [`gyojeok/${ADMIN}/1764000000000-p.jpg`, `resources/${ADMIN}/1764000000000-r.pdf`, `album/${MEM}/1764000000000-a.jpg`, `gyojeok/../x/y`];
r = await call('POST', '/sign-urls', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
ok(r.status === 401, '/sign-urls 로그인 없이 → 401');
r = await call('POST', '/sign-urls', { tok: 'tok-' + MEM, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
let d = await jsonOf(r);
ok(r.status === 200 && Object.keys(d.urls).length === 1 && d.urls[keys[1]] && !d.urls[keys[0]], '정회원: 자료실만 서명, 교적 사진은 없음');
const before = fileAccessCalls;
r = await call('POST', '/sign-urls', { tok: 'tok-' + MEM, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [keys[2]] }) });
d = await jsonOf(r);
ok(Object.keys(d.urls).length === 0 && fileAccessCalls === before, '지키지 않는 폴더 키는 묻지도 않고 빈 결과');
r = await call('POST', '/sign-urls', { tok: 'tok-' + FIN, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
d = await jsonOf(r);
const signed = d.urls[keys[0]];
ok(signed && /\/p\/gyojeok\//.test(signed) && /[?&]e=\d+&s=[0-9a-f]{40}$/.test(signed), '재정 권한자: 교적 사진 서명 주소');
// 3) 서명 주소로 보기
const sp = signed.slice(W.length);
r = await call('GET', sp);
ok(r.status === 200 && (await r.text()) === 'JPG' && /private/.test(r.headers.get('Cache-Control')), '/p/ 서명 주소 → 200, 중간 서버에 남기지 않음');
r = await call('GET', sp.replace(/s=[0-9a-f]{4}/, 's=0000'));
ok(r.status === 403, '/p/ 서명이 틀리면 403');
r = await call('GET', sp.replace('/p/gyojeok/', '/p/resources/'));
ok(r.status === 403, '/p/ 다른 파일에 같은 서명 → 403');
r = await call('GET', sp.replace(/e=\d+/, 'e=1000'));
ok(r.status === 401, '/p/ 시간이 지나면 401');
r = await call('GET', `/p/album/${MEM}/1764000000000-a.jpg?e=9999999999&s=${'0'.repeat(40)}`);
ok(r.status === 400, '/p/ 는 지키는 폴더만');
// 4) 올리기: 형식 막기
const up = (tok, folder, name, ct, bytes = 'DATA') => call('POST', '/upload', { tok, body: bytes, headers: { 'Content-Type': ct, 'x-filename': encodeURIComponent(name), 'x-folder': folder, 'Content-Length': String(new TextEncoder().encode(bytes).length) } });
r = await up('tok-' + MEM, 'community', 'page.html', 'text/html');
ok(r.status === 415, 'html 올리기 → 415');
r = await up('tok-' + MEM, 'community', 'pic.svg', 'image/svg+xml');
ok(r.status === 415, 'svg 올리기 → 415');
r = await up('tok-' + MEM, 'community', 'setup.exe', 'application/octet-stream');
ok(r.status === 415, 'exe 올리기 → 415');
r = await up('tok-' + MEM, 'community', 'innocent.jpg', 'text/html');
ok(r.status === 415, '이름은 jpg 인데 형식이 html → 415');
r = await up('tok-' + MEM, 'community', '사진.jpg', 'image/jpeg');
d = await jsonOf(r);
ok(r.status === 200 && /^community\//.test(d.key), '보통 회원 그림 올리기 → 200');
// 5) 관리자 폴더
r = await up('tok-' + MEM, 'gyojeok', 'p.jpg', 'image/jpeg');
ok(r.status === 403, '보통 회원이 교적 사진 자리에 올리기 → 403');
r = await up('tok-' + MEM, 'affairs/documents', 'd.pdf', 'application/pdf');
ok(r.status === 403, '보통 회원이 문서 첨부 자리에 올리기 → 403');
r = await up('tok-' + FIN, 'finance/receipt', 's.png', 'image/png');
d = await jsonOf(r);
ok(r.status === 200 && d.key.startsWith('financereceipt/' + FIN + '/'), '재정 권한자: 재정 그림 올리기 → 200 (폴더 이름 financereceipt)');
r = await up('tok-' + ADMIN, 'archive', 'a.pdf', 'application/pdf');
ok(r.status === 200, '관리자: 성도별 자료 올리기 → 200');
r = await call('POST', '/upload', { body: 'DATA', headers: { 'Content-Type': 'image/png', 'x-filename': 'o.png', 'x-folder': 'worship', 'x-worker-key': 'w'.repeat(32), 'Content-Length': '4' } });
d = await jsonOf(r);
ok(r.status === 200 && d.key.startsWith('worship/system/'), '무인 워커 키: 예전처럼 올리기');
// 6) 하루 한도
for (let i = 0; i < 58; i++) store.set(`community/${MEM}/${Date.now() + i}-${i}.jpg`, { bytes: new Uint8Array(1), ct: 'image/jpeg' });
r = await up('tok-' + MEM, 'community', 'last.jpg', 'image/jpeg');
ok(r.status === 200, '하루 60번째까지는 됨');
r = await up('tok-' + MEM, 'community', 'over.jpg', 'image/jpeg');
ok(r.status === 429, '61번째는 429');
r = await up('tok-' + MEM, 'album', 'other-folder.jpg', 'image/jpeg');
ok(r.status === 200, '다른 폴더는 따로 셈');
store.set(`community/${MEM}/${Date.now() - 2 * 86400000}-old.jpg`, { bytes: new Uint8Array(1), ct: 'image/jpeg' });
for (let i = 0; i < 70; i++) store.set(`community/${ADMIN}/${Date.now() + i}-${i}.jpg`, { bytes: new Uint8Array(1), ct: 'image/jpeg' });
r = await up('tok-' + ADMIN, 'community', 'admin.jpg', 'image/jpeg');
ok(r.status === 200, '관리자는 한도 없음');
// 7) 예전 길은 그대로
r = await call('GET', `/fin-rcpt/fin-receipts/${MEM}/x.jpg?e=9999999999&s=${'0'.repeat(40)}`);
ok(r.status === 403, '재정 청원 영수증 길은 그대로(서명 틀리면 403)');
r = await call('DELETE', `/f/community/${MEM}/1764000000000-a.jpg`, { tok: 'tok-' + ADMIN });
ok(r.status === 403, '남이 올린 파일 지우기 → 403 그대로');

globalThis.fetch = realFetch;
fs.unlinkSync(tmp);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
