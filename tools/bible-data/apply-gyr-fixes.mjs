// 개역개정 자료의 남은 찌꺼기를 표(gyr-fixes-20261111.json)대로 고친다 — 2026-11-11 담임목사 지시.
//
// 표에 든 것 (모두 대한성서공회 개역개정 본문과 맞춰 본 뒤 정함):
//   · 1장 1절 13곳: 2026-07-08 에 빈칸을 다른 판 낱말로 채웠던 것을, 책 끝에 붙어 있던 원본 글로 되돌림
//   · 깨진 글자 16곳: 「?」 로 빠진 글자(웻·훕·쁄)를 넣음
//   · 본문 안 각주 번호 13곳: 「재판1)하리니」 → 「재판하리니」
//   · 합쳐진 절 11묶음: 성경책처럼 앞 절에 묶인 글 전체(「-19 」 표시·머리글은 지움), 뒤 절은 「(18절에 포함)」
//     — 뒤 절에 임의로 채웠던 글(개역개정 본문이 아님)은 걷어 냄
//   · 행 24:7: 개역개정에 없는 절 → 「(없음)」 (마 17:21 등 다른 '없는 절'과 같은 꼴)
//   · 겹공백 1곳
//
// 대상: data/bible-gyr.json 과 modu/data/d1/bible.js 의 text.gyr (두 곳은 글자까지 같아야 한다)
// 쓰기: node tools/bible-data/apply-gyr-fixes.mjs           검사만 (고칠 곳이 남았으면 종료 코드 1)
//       node tools/bible-data/apply-gyr-fixes.mjs --write   고쳐서 저장 (이미 고친 절은 건너뜀)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GYR_JSON = path.join(ROOT, 'data', 'bible-gyr.json');
const MODU_JS = path.join(ROOT, 'modu', 'data', 'd1', 'bible.js');
const TABLE = JSON.parse(fs.readFileSync(path.join(HERE, 'gyr-fixes-20261111.json'), 'utf8'));
const WRITE = process.argv.includes('--write');
const ORDER = '창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');
const fail = msg => { console.error('멈춤: ' + msg); process.exit(2); };

const gyrRaw = fs.readFileSync(GYR_JSON, 'utf8');
const gyr = JSON.parse(gyrRaw);
if (JSON.stringify(gyr) !== gyrRaw || Object.keys(gyr).join(' ') !== ORDER.join(' ')) fail('bible-gyr.json 꼴이 예상과 다릅니다');
const moduRaw = fs.readFileSync(MODU_JS, 'utf8');
const HEAD = 'window.BIBLE=', TAIL = (moduRaw.match(/;\s*$/) || [''])[0];
if (!moduRaw.startsWith(HEAD) || !TAIL) fail('modu bible.js 의 머리·꼬리가 예상과 다릅니다');
const body = moduRaw.slice(HEAD.length, moduRaw.length - TAIL.length);
const B = JSON.parse(body);
if (JSON.stringify(B) !== body) fail('modu bible.js 를 다시 적으면 글자가 달라집니다');
const sets = [['bible-gyr.json', ORDER.map(a => gyr[a])], ['모두의 성경 text.gyr', B.text.gyr]];
if (JSON.stringify(sets[0][1]) !== JSON.stringify(sets[1][1])) fail('두 자료의 개역개정이 서로 다릅니다 — 따로 살펴야 합니다');
const count = bk => bk.reduce((n, chs) => n + chs.reduce((k, ch) => k + ch.length, 0), 0);
const before = sets.map(([, bk]) => count(bk));

let todo = 0, done = 0;
const seen = new Set();
for (const f of TABLE) {
  if (seen.has(f.ref)) fail('표에 같은 절이 두 번: ' + f.ref); seen.add(f.ref);
  const m = f.ref.match(/^(\S+) (\d+):(\d+)$/); const b = ORDER.indexOf(m[1]);
  if (b < 0) fail('모르는 책: ' + f.ref);
  for (const [label, bk] of sets) {
    const ch = bk[b][+m[2] - 1]; if (!ch || ch[+m[3] - 1] == null) fail(`${label} 에 ${f.ref} 이 없습니다`);
    const cur = ch[+m[3] - 1];
    if (cur === f.new) { if (label === sets[0][0]) done++; continue; }
    if (cur !== f.old) fail(`${label} ${f.ref} 의 지금 글이 표의 '옛 글'과 다릅니다: ${cur}`);
    if (label === sets[0][0]) todo++;
    if (WRITE) ch[+m[3] - 1] = f.new;
  }
}
const kinds = {}; for (const f of TABLE) { const k = f.why.replace(/\(\d+-\d+절\)/, ''); kinds[k] = (kinds[k] || 0) + 1; }
console.log(`표 ${TABLE.length}절 — 고칠 것 ${todo}, 이미 고친 것 ${done}`);
for (const [k, n] of Object.entries(kinds)) console.log(`  · ${k}: ${n}`);

// 고친 뒤(또는 지금) 남은 찌꺼기가 없는지
const residue = [];
sets[0][1].forEach((chs, b) => chs.forEach((ch, c) => ch.forEach((s, v) => {
  const r = `${ORDER[b]} ${c + 1}:${v + 1}`;
  if (/^-\d+ /.test(s) || /[<>]/.test(s) || /\?/.test(s) || /[가-힣]\d\)/.test(s) || /\s\s/.test(s) || /[가-힣]{1,3}\d+:\d+/.test(s)) residue.push(r);
})));

if (WRITE && todo) {
  if (sets.some(([, bk], i) => count(bk) !== before[i])) fail('절 수가 달라졌습니다');
  fs.writeFileSync(GYR_JSON, JSON.stringify(gyr), 'utf8');
  fs.writeFileSync(MODU_JS, HEAD + JSON.stringify(B) + TAIL, 'utf8');
  console.log(`저장했습니다. 절 수 ${before[0]} → ${count(sets[0][1])} (그대로)`);
}
console.log(`남은 찌꺼기(표시·꺾쇠·?·각주 번호·겹공백·장절 표기): ${residue.length}${residue.length ? ' → ' + residue.join(', ') : ''}`);
if ((!WRITE && todo) || (WRITE && residue.length)) process.exit(1);
