// 개역개정 성경 자료에서, 각 책의 마지막 절 뒤에 붙어 있던 "다음 책 1장 1절" 찌꺼기를 잘라 낸다.
//
// 왜 붙었나: 처음 자료를 만든 원본 글은 한 줄이 「레1:1 <번제> 여호와께서 …」 꼴(약어+장:절, 머리글, 본문)인데,
//   책이 바뀌는 자리에 줄바꿈이 없어 다음 책 첫 줄이 앞 책 마지막 절에 그대로 이어졌다. 그래서 앞 책 끝 절에는
//   「…보았더라레1:1 <번제> 여호와께서 …」가 남고, 다음 책 1:1 은 빈칸이 되었다(빈칸은 2026-07-08 에 따로 채움 — 386054a).
//
// 대상: data/bible-gyr.json  과  modu/data/d1/bible.js 의 text.gyr (두 곳의 개역개정은 글자까지 같다)
// 다른 역본(우리말성경·새번역·공동번역·NASB·KJV·WLC·헬라어)에는 이 문제가 없다 — 검사만 한다.
//
// 쓰기:  node tools/bible-data/fix-book-ends.mjs            검사만 (파일을 바꾸지 않는다, 고칠 곳이 남았으면 종료 코드 1)
//        node tools/bible-data/fix-book-ends.mjs --write    고쳐서 저장
//        node tools/bible-data/fix-book-ends.mjs --list     고칠(고친) 절을 한 줄씩 보여 준다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GYR_JSON = path.join(ROOT, 'data', 'bible-gyr.json');
const URM_JSON = path.join(ROOT, 'data', 'bible-urm.json');
const MODU_JS = path.join(ROOT, 'modu', 'data', 'd1', 'bible.js');
const WRITE = process.argv.includes('--write');
const LIST = process.argv.includes('--list');

// data/bible-gyr.json 의 책 약어(성경 순서). 원본 글의 「레1:1」 표시도 이 약어를 쓴다.
const ORDER = '창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');

// 붙은 본문이 자료의 다음 책 1:1 과 낱말이 많이 달라(닮음 0.8 미만) 사람이 눈으로 확인한 곳.
// 호 14:9 뒤에 붙은 것은 요엘 1:1 의 개역개정 낱말이고, 자료의 욜 1:1 은 2026-07-08 에 채운 다른 판 낱말이다.
const REVIEWED = { '호 14:9': '브두엘의 아들 요엘에게 임한 여호와의 말씀이라' };

function fail(msg) { console.error('멈춤: ' + msg); process.exit(2); }

// 두 글이 얼마나 같은가 (가장 긴 공통 부분열 길이 ÷ 짧은 쪽 길이)
function likeness(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const cur = [0];
    for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[m] / Math.min(n, m);
}

// 한 책(b)의 마지막 절을 살펴, 잘라 낼 것이 있으면 { keep, cut, how } 를 돌려준다. 없으면 null.
function inspect(books, b) {
  const chs = books[b];
  const c = chs.length - 1, v = chs[c].length - 1;
  const L = chs[c][v];
  const where = `${ORDER[b]} ${c + 1}:${v + 1}`;
  if (b === books.length - 1) {                                  // 요한계시록: 뒤에 붙을 책이 없다
    if (/[0-9<>:]/.test(L)) fail(`${where} 에 뜻밖의 표시가 있습니다: ${L}`);
    return null;
  }
  const na = ORDER[b + 1];
  const re = new RegExp(na + '1:(?:1|제일권)', 'g');             // 「레1:1」 — 시편만 「시1:제일권」
  const hits = [...L.matchAll(re)];
  if (!hits.length) {
    if (/[0-9<>:]/.test(L)) fail(`${where} 에 표시는 없는데 숫자·꺾쇠가 남아 있습니다: ${L}`);
    return null;                                                 // 이미 깨끗하다
  }
  if (hits.length > 1) fail(`${where} 에 「${na}1:1」 표시가 여러 번 나옵니다`);
  const at = hits[0].index;
  let keep = L.slice(0, at);
  const cut = L.slice(at);
  const next = books[b + 1][0][0];                               // 다음 책 1장 1절

  // 붙은 부분이 정말 다음 책 1:1 (또는 그 머리글) 인지 맞춰 본다
  let how;
  if (cut === na + '1:제일권') how = '머리글만(시편 제일권)';
  else {
    const m = cut.match(new RegExp('^' + na + '1:1(?: <([^<>]*)>)? (.+)$'));
    if (!m) fail(`${where} 의 붙은 부분이 예상한 꼴이 아닙니다: ${cut}`);
    const body = m[2];
    if (/[<>]/.test(body)) fail(`${where} 의 붙은 본문에 꺾쇠가 더 있습니다: ${cut}`);
    if (body === next) how = '1:1 과 글자까지 같음';
    else if (next.startsWith(body)) how = '1:1 의 앞부분';
    else {
      const k = likeness(body, next);
      if (k < 0.8 && REVIEWED[where] !== body) fail(`${where} 의 붙은 본문이 ${na} 1:1 과 다릅니다(닮음 ${k.toFixed(2)}): ${body} ↔ ${next}`);
      how = `1:1 과 같은 절(낱말이 조금 다른 판, 닮음 ${k.toFixed(2)})`;
    }
  }
  // 절 끝에 남은 각주 번호 「2)」 — 본문이 아니다 (히 13:25, 벧후 3:18)
  let note = '';
  const fn = keep.match(/\d\)$/);
  if (fn) { note = fn[0]; keep = keep.slice(0, -fn[0].length); }
  if (!keep || keep !== keep.trim() || /[0-9<>:]/.test(keep)) fail(`${where} 를 자르고 남은 글이 이상합니다: ${keep}`);
  return { b, c, v, where, keep, cut: note + cut, how, note };
}

function fixSet(books, label) {
  if (books.length !== 66) fail(`${label}: 책이 66권이 아닙니다`);
  const fixes = [];
  for (let b = 0; b < books.length; b++) { const f = inspect(books, b); if (f) fixes.push(f); }
  return fixes;
}

const count = books => books.reduce((n, chs) => n + chs.reduce((k, ch) => k + ch.length, 0), 0);

// 다른 역본: 책 끝 절이 다음 책 1:1 을 품고 있지 않은지만 본다 (고치지 않는다)
function probeOther(books, label) {
  const bad = [];
  for (let b = 0; b + 1 < books.length; b++) {
    const chs = books[b]; if (!chs.length || !books[b + 1].length) continue;
    const last = chs[chs.length - 1]; const L = last[last.length - 1]; const next = books[b + 1][0][0];
    if (next && next.length >= 20 && L.includes(next)) bad.push(b);
  }
  console.log(`  ${label}: 책 끝 절이 다음 책 1:1 을 품은 곳 ${bad.length}`);
  return bad.length;
}

// ── 읽기
const gyrRaw = fs.readFileSync(GYR_JSON, 'utf8');
const gyr = JSON.parse(gyrRaw);
if (JSON.stringify(gyr) !== gyrRaw) fail('bible-gyr.json 을 다시 적으면 글자가 달라집니다(꼴 확인 필요)');
if (Object.keys(gyr).join(' ') !== ORDER.join(' ')) fail('bible-gyr.json 의 책 순서가 예상과 다릅니다');
const gyrBooks = ORDER.map(a => gyr[a]);

const moduRaw = fs.readFileSync(MODU_JS, 'utf8');
const HEAD = 'window.BIBLE=';
const TAIL = (moduRaw.match(/;\s*$/) || [''])[0];
if (!moduRaw.startsWith(HEAD) || !TAIL) fail('modu bible.js 의 머리·꼬리가 예상과 다릅니다');
const moduBody = moduRaw.slice(HEAD.length, moduRaw.length - TAIL.length);
const B = JSON.parse(moduBody);
if (JSON.stringify(B) !== moduBody) fail('modu bible.js 를 다시 적으면 글자가 달라집니다(꼴 확인 필요)');
if (B.books.length !== 66 || !B.text || !B.text.gyr) fail('modu bible.js 에 개역개정(text.gyr)이 없습니다');

const before = { gyr: count(gyrBooks), modu: count(B.text.gyr) };

// ── 살피기
const fixA = fixSet(gyrBooks, 'bible-gyr.json');
const fixB = fixSet(B.text.gyr, 'modu text.gyr');
const same = JSON.stringify(fixA) === JSON.stringify(fixB);
if (!same) fail('두 자료에서 고칠 곳이 서로 다릅니다 — 따로 살펴야 합니다');

if (LIST) for (const f of fixA) console.log(`${f.where}\t${f.how}\n   남김: …${f.keep.slice(-40)}\n   뺌  : ${f.cut}`);
console.log(`개역개정 책 끝 절에서 잘라 낼 곳: ${fixA.length} (bible-gyr.json) / ${fixB.length} (모두의 성경)`);
const kinds = {}; for (const f of fixA) { const k = f.how.replace(/, 닮음 [\d.]+/, ''); kinds[k] = (kinds[k] || 0) + 1; }
for (const [k, n] of Object.entries(kinds)) console.log(`  · ${k}: ${n}`);
if (fixA.some(f => f.note)) console.log('  · 절 끝 각주 번호도 뺌: ' + fixA.filter(f => f.note).map(f => `${f.where} 「${f.note}」`).join(', '));

console.log('다른 역본 검사:');
let other = 0;
const urm = JSON.parse(fs.readFileSync(URM_JSON, 'utf8'));
other += probeOther(ORDER.map(a => urm[a]), 'data/bible-urm.json');
for (const id of Object.keys(B.text)) if (id !== 'gyr') other += probeOther(B.text[id], 'modu text.' + id);

// ── 고치기
if (WRITE && fixA.length) {
  for (const f of fixA) { gyrBooks[f.b][f.c][f.v] = f.keep; B.text.gyr[f.b][f.c][f.v] = f.keep; }
  if (count(gyrBooks) !== before.gyr || count(B.text.gyr) !== before.modu) fail('절 수가 달라졌습니다');
  if (fixSet(gyrBooks, 'bible-gyr.json').length || fixSet(B.text.gyr, 'modu text.gyr').length) fail('고친 뒤에도 남은 곳이 있습니다');
  fs.writeFileSync(GYR_JSON, JSON.stringify(gyr), 'utf8');
  fs.writeFileSync(MODU_JS, HEAD + JSON.stringify(B) + TAIL, 'utf8');
  console.log(`저장했습니다. 절 수: bible-gyr.json ${before.gyr} → ${count(gyrBooks)}, 모두의 성경 개역개정 ${before.modu} → ${count(B.text.gyr)}`);
} else if (fixA.length) {
  console.log('검사만 했습니다(--write 를 붙이면 고칩니다).');
  process.exit(1);
} else {
  console.log(`고칠 곳이 없습니다. 절 수: bible-gyr.json ${before.gyr}, 모두의 성경 개역개정 ${before.modu}`);
}
if (other) process.exit(1);
