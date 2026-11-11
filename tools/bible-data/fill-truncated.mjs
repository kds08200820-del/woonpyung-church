// 개역개정 자료에서 중간에 잘린 절(truncated-verses-20261111.txt)을, 목사님이 주신 온전한 절 글로 채운다.
//
// 왜 잘렸나: 처음 자료를 만든 원본에서 절 가운데 소제목이나 시의 행갈이가 있는 곳은 그 앞까지만 남았다.
//   (예: 사 15:1 이 「모압에 관한 경고라」 에서 끝남) 빠진 글은 저장소·PC 의 다른 자료에도 없다.
//
// 입력: UTF-8 글 파일, 한 줄에 한 절 —  「삼상 4:1 사무엘의 말이 …(절 전체)」
//   · 책 이름은 약어(삼상)나 전체 이름(사무엘상) 모두 된다. 장:절 뒤 본문 앞의 절 번호는 지운다.
//   · 본문 가운데 성경책의 소제목이 끼어 들어오면(괄호 안 평행 본문 표시 등) 받지 않고 알려 준다.
// 검사: 새 글은 지금 자료의 글로 시작해야 하고 더 길어야 한다(잘린 뒤를 잇는 것만 받는다).
// 대상: data/bible-gyr.json 과 modu/data/d1/bible.js 의 text.gyr (두 곳은 글자까지 같아야 한다)
//
// 쓰기: node tools/bible-data/fill-truncated.mjs 입력.txt            검사만
//       node tools/bible-data/fill-truncated.mjs 입력.txt --write    채워서 저장
//       node tools/bible-data/fill-truncated.mjs --status             목록 가운데 아직 잘린 절 보기
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GYR_JSON = path.join(ROOT, 'data', 'bible-gyr.json');
const MODU_JS = path.join(ROOT, 'modu', 'data', 'd1', 'bible.js');
const LIST = path.join(HERE, 'truncated-verses-20261111.txt');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const STATUS = args.includes('--status');
const input = args.find(a => !a.startsWith('--'));
const ORDER = '창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split(' ');
const fail = msg => { console.error('멈춤: ' + msg); process.exit(2); };
const norm = s => s.replace(/\s+/g, ' ').trim();

const gyrRaw = fs.readFileSync(GYR_JSON, 'utf8');
const gyr = JSON.parse(gyrRaw);
if (JSON.stringify(gyr) !== gyrRaw || Object.keys(gyr).join(' ') !== ORDER.join(' ')) fail('bible-gyr.json 꼴이 예상과 다릅니다');
const moduRaw = fs.readFileSync(MODU_JS, 'utf8');
const HEAD = 'window.BIBLE=', TAIL = (moduRaw.match(/;\s*$/) || [''])[0];
if (!moduRaw.startsWith(HEAD) || !TAIL) fail('modu bible.js 의 머리·꼬리가 예상과 다릅니다');
const body = moduRaw.slice(HEAD.length, moduRaw.length - TAIL.length);
const B = JSON.parse(body);
if (JSON.stringify(B) !== body) fail('modu bible.js 를 다시 적으면 글자가 달라집니다');
const sets = [ORDER.map(a => gyr[a]), B.text.gyr];
if (JSON.stringify(sets[0]) !== JSON.stringify(sets[1])) fail('두 자료의 개역개정이 서로 다릅니다');
// 책 이름 → 순번 (약어·전체 이름, 띄어쓰기 없이)
const NAME = new Map();
ORDER.forEach((a, i) => NAME.set(a, i));
B.books.forEach((b, i) => { NAME.set(b.n.replace(/\s+/g, ''), i); NAME.set(b.a, i); });
const parseRef = r => {
  const m = r.match(/^\s*([가-힣0-9]+?)\s*(\d+)\s*[:장]\s*(\d+)\s*절?/); if (!m) return null;
  const b = NAME.get(m[1]); if (b === undefined) return null;
  return { b, c: +m[2], v: +m[3], ref: `${ORDER[b]} ${m[2]}:${m[3]}`, rest: r.slice(m[0].length) };
};
const listed = fs.readFileSync(LIST, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => { const [ref, have, full] = l.split('\t'); return { ref, have: +have, full: +full }; });
const at = (set, p) => set[p.b] && set[p.b][p.c - 1] ? set[p.b][p.c - 1][p.v - 1] : undefined;

if (STATUS || !input) {
  const left = listed.filter(x => { const p = parseRef(x.ref); return at(sets[0], p).length <= x.have; });
  console.log(`목록 ${listed.length}절 가운데 아직 잘린 절 ${left.length}${left.length ? ': ' + left.map(x => x.ref).join(', ') : ''}`);
  process.exit(left.length ? 1 : 0);
}

const lines = fs.readFileSync(input, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const ok = [], bad = [];
for (const line of lines) {
  const p = parseRef(line); if (!p) { bad.push(`알아볼 수 없는 줄: ${line.slice(0, 40)}`); continue; }
  const cur = at(sets[0], p); if (cur === undefined) { bad.push(`${p.ref}: 그런 절이 없습니다`); continue; }
  let neu = norm(p.rest).replace(new RegExp('^' + p.v + '\\s+'), '');
  if (/[<>]|\(\s*[가-힣]{1,3}\s*\d+:\d+|[가-힣]\d\)|\?/.test(neu)) { bad.push(`${p.ref}: 소제목·각주 표시로 보이는 글이 섞여 있습니다 — ${neu.slice(0, 60)}`); continue; }
  if (neu === cur) { ok.push({ p, neu, same: true }); continue; }
  if (!neu.startsWith(norm(cur)) || neu.length <= cur.length) { bad.push(`${p.ref}: 지금 자료의 글로 시작하지 않습니다(다른 절이거나 다른 판일 수 있음)`); continue; }
  if (!listed.some(x => x.ref === p.ref)) bad.push(`${p.ref}: 잘린 절 목록에 없는 절입니다 — 받지 않았습니다`);
  else ok.push({ p, neu });
}
console.log(`받은 줄 ${lines.length}: 채울 절 ${ok.filter(x => !x.same).length}, 이미 같은 절 ${ok.filter(x => x.same).length}, 받지 않은 줄 ${bad.length}`);
for (const x of ok.filter(x => !x.same)) console.log(`  + ${x.p.ref}  ${at(sets[0], x.p).length}자 → ${x.neu.length}자`);
for (const b of bad) console.log('  ! ' + b);
if (WRITE && ok.some(x => !x.same)) {
  for (const x of ok) for (const set of sets) set[x.p.b][x.p.c - 1][x.p.v - 1] = x.neu;
  fs.writeFileSync(GYR_JSON, JSON.stringify(gyr), 'utf8');
  fs.writeFileSync(MODU_JS, HEAD + JSON.stringify(B) + TAIL, 'utf8');
  console.log('저장했습니다.');
}
if (bad.length) process.exit(1);
