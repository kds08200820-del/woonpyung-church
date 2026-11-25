// 올리기 도우미(js/upload.js)의 지키는 폴더 주소 바꾸기 시험 — jsdom · 가짜 워커. 실제 서버에는 아무것도 보내지 않는다.
//   빈 폴더에서 npm i jsdom 후 이 파일을 그 폴더로 복사해
//   node upload_protect_ui.test.mjs <저장소 경로>
import { JSDOM } from 'jsdom'; import fs from 'fs';
const ROOT = process.argv[2];
const src = fs.readFileSync(ROOT + '/js/upload.js', 'utf8');
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const wait = async n => { for (let i = 0; i < n; i++) await tick(); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const W = 'https://church-files.example.test';
function win({ login = true, workerOk = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://k-logos.com/x.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window; w.console.log = () => { };
  w.R2_UPLOAD_URL = W; w.SUPABASE_URL = 'https://abc.supabase.test';
  if (login) w.localStorage.setItem('sb-abc-auth-token', JSON.stringify({ access_token: 'tok' }));
  w.__calls = []; w.__opened = [];
  w.fetch = async (url, opt) => {
    w.__calls.push({ url: String(url), body: opt && opt.body });
    if (!workerOk) return { ok: false, status: 404, json: async () => ({}) };
    const keys = JSON.parse(opt.body).keys;
    const urls = {}; keys.forEach(k => { if (!/denied/.test(k)) urls[k] = W + '/p/' + k + '?e=1&s=abc'; });
    return { ok: true, status: 200, json: async () => ({ ok: true, urls }) };
  };
  w.open = (u, n, f) => { const fake = { closed: false, location: { href: u } }; w.__opened.push(fake); return fake; };
  w.eval(src);
  return w;
}
const F = (k) => W + '/f/' + k;
{ // 1) 화면에 그려지는 img · a 를 바꾼다(한 번에 묻는다), 다른 폴더 · 다른 칸은 그대로
  const w = win(), d = w.document;
  d.body.innerHTML = '<img id="a" src="' + F('gyojeok/u1/1-p.jpg') + '"><a id="b" href="' + F('archive/u1/2-x.pdf') + '">자료</a>' +
    '<img id="c" src="' + F('album/u1/3-a.jpg') + '"><input id="d" value="' + F('gyojeok/u1/1-p.jpg') + '"><img id="e" src="' + F('gyojeok/u1/denied.jpg') + '">';
  await wait(5);
  ok(d.getElementById('a').getAttribute('src') === W + '/p/gyojeok/u1/1-p.jpg?e=1&s=abc', '교적 사진 img → 서명 주소');
  ok(d.getElementById('b').getAttribute('href') === W + '/p/archive/u1/2-x.pdf?e=1&s=abc', '성도별 자료 a → 서명 주소');
  ok(d.getElementById('c').getAttribute('src') === F('album/u1/3-a.jpg'), '앨범 사진은 그대로');
  ok(d.getElementById('d').value === F('gyojeok/u1/1-p.jpg'), '입력칸 값(저장될 주소)은 그대로');
  ok(d.getElementById('e').getAttribute('src') === F('gyojeok/u1/denied.jpg'), '권한 없는 것은 원래 주소 그대로');
  ok(w.__calls.length === 1 && JSON.parse(w.__calls[0].body).keys.length === 3 && w.__calls[0].url === W + '/sign-urls', '한 번에 물음(지키는 것 3개만)');
  // 나중에 바뀐 src 도
  d.getElementById('c').setAttribute('src', F('resources/u1/9-r.pdf'));
  await wait(5);
  ok(d.getElementById('c').getAttribute('src') === W + '/p/resources/u1/9-r.pdf?e=1&s=abc', '나중에 바뀐 src 도 바꿈');
  // 같은 주소를 다시 그리면 묻지 않는다(기억)
  const n = w.__calls.length;
  const im = d.createElement('img'); im.src = F('gyojeok/u1/1-p.jpg'); d.body.appendChild(im);
  await wait(5);
  ok(im.getAttribute('src') === W + '/p/gyojeok/u1/1-p.jpg?e=1&s=abc' && w.__calls.length === n, '다시 그려도 묻지 않고 바꿈');
}
{ // 2) signHtml(새 창 인쇄용) · signUrls
  const w = win();
  const html = '<img src="' + F('financereceipt/u1/1-seal.png') + '"><img src=\'' + F('churchseal/u1/2-c.png') + '\'><img src="' + F('album/u/1.jpg') + '">';
  const out = await w.ChurchUpload.signHtml(html);
  ok(out.includes(W + '/p/financereceipt/u1/1-seal.png?e=1&s=abc') && out.includes(W + '/p/churchseal/u1/2-c.png?e=1&s=abc') && out.includes(F('album/u/1.jpg')), 'signHtml: 재정 그림 · 도장만 바꿈');
  const m = await w.ChurchUpload.signUrls([F('affairsdocuments/u1/3-d.pdf'), 'https://other.example/x.jpg']);
  ok(m[F('affairsdocuments/u1/3-d.pdf')] === W + '/p/affairsdocuments/u1/3-d.pdf?e=1&s=abc' && m['https://other.example/x.jpg'] === 'https://other.example/x.jpg', 'signUrls: 문서 첨부만 바꿈');
}
{ // 3) window.open(지키는 주소) → 빈 창을 먼저 열고 서명 주소로
  const w = win();
  const ret = w.open(F('archive/u1/5-z.pdf'), '_blank');
  ok(ret && ret.location.href === '', 'window.open: 빈 창을 먼저 엶');
  await wait(5);
  ok(ret.location.href === W + '/p/archive/u1/5-z.pdf?e=1&s=abc', 'window.open: 서명 주소로 옮김');
  const plain = w.open('https://k-logos.com/a.html', '_blank');
  ok(plain.location.href === 'https://k-logos.com/a.html', '다른 주소는 그대로 엶');
}
{ // 4) 워커가 이 기능을 모를 때(배포 전) · 로그인 안 했을 때 → 원래 주소 그대로, 화면은 그대로 동작
  for (const opt of [{ workerOk: false }, { login: false }]) {
    const w = win(opt), d = w.document;
    d.body.innerHTML = '<img id="a" src="' + F('gyojeok/u1/1-p.jpg') + '">';
    await wait(5);
    const h = await w.ChurchUpload.signHtml('<img src="' + F('gyojeok/u1/1-p.jpg') + '">');
    ok(d.getElementById('a').getAttribute('src') === F('gyojeok/u1/1-p.jpg') && h.includes(F('gyojeok/u1/1-p.jpg')), (opt.login === false ? '로그인 전' : '워커 배포 전') + ': 원래 주소 그대로');
    ok(opt.login === false ? w.__calls.length === 0 : true, (opt.login === false ? '로그인 전에는 묻지도 않음' : '워커 배포 전에도 오류 없음'));
  }
}
{ // 5) 예전 기능(영수증 서명)은 그대로 있다
  const w = win();
  ok(typeof w.ChurchUpload.receiptUrls === 'function' && typeof w.ChurchUpload.upload === 'function', '예전 기능 그대로');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
