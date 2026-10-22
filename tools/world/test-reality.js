// js/world/reality.js 시험 — 알려진 날짜(공휴일·음력 명절·부활절·절기·일출)와 맞는지
//   node tools/world/test-reality.js
const W = require('../../js/world/reality.js');
let fail = 0, pass = 0;
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
  else { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
}
function near(name, got, want, tol) {
  if (Math.abs(got - want) <= tol) pass++;
  else { fail++; console.log('FAIL', name, 'got', got, 'want', want, '±', tol); }
}

// 음력 명절 (한국 표준시) — 2027 설날은 중국(2/6)과 달리 2/7
const LUNAR = {
  2024: ['2024-02-10', '2024-05-15', '2024-09-17'], 2025: ['2025-01-29', '2025-05-05', '2025-10-06'],
  2026: ['2026-02-17', '2026-05-24', '2026-09-25'], 2027: ['2027-02-07', '2027-05-13', '2027-09-15'],
  2028: ['2028-01-27', '2028-05-02', '2028-10-03'], 2029: ['2029-02-13', '2029-05-20', '2029-09-22'],
  2030: ['2030-02-03', '2030-05-09', '2030-09-12'],
};
for (const y in LUNAR) {
  const L = W.lunarDates(+y);
  eq('lunar ' + y, [L.seollal, L.buddha, L.chuseok], LUNAR[y]);
}

// 2026 공휴일 전체 (대체공휴일 포함)
const H2026 = W.holidays(2026).map(h => h.date + ' ' + h.name);
eq('holidays 2026', H2026, [
  '2026-01-01 신정', '2026-02-16 설날 연휴', '2026-02-17 설날', '2026-02-18 설날 연휴',
  '2026-03-01 삼일절', '2026-03-02 대체공휴일(삼일절)', '2026-05-05 어린이날',
  '2026-05-24 부처님오신날', '2026-05-25 대체공휴일(부처님오신날)', '2026-06-03 전국동시지방선거일', '2026-06-06 현충일',
  '2026-08-15 광복절', '2026-08-17 대체공휴일(광복절)', '2026-09-24 추석 연휴', '2026-09-25 추석', '2026-09-26 추석 연휴',
  '2026-10-03 개천절', '2026-10-05 대체공휴일(개천절)', '2026-10-09 한글날', '2026-12-25 기독탄신일(성탄절)',
]);
// 2025: 부처님오신날 = 어린이날 → 5/6 대체, 추석 연휴 10/5(일) 겹침 → 10/8 대체
const H2025 = W.holidays(2025).map(h => h.date);
['2025-05-06', '2025-10-08', '2025-01-27', '2025-03-03'].forEach(d => eq('2025 has ' + d, H2025.includes(d), true));
// 2027: 설날 2/7(일) → 2/9 대체
eq('2027 설 대체', W.holidays(2027).some(h => h.date === '2027-02-09'), true);
// 2028: 추석 10/3 = 개천절 → 10/5 대체
eq('2028 추석·개천절 대체', W.holidays(2028).filter(h => h.name.startsWith('대체')).map(h => h.date).includes('2028-10-05'), true);

// 부활절
eq('easter', [2024, 2025, 2026, 2027, 2028].map(W.easter), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16']);
// 교회력
const cd = W.churchDays(2026).map(d => d.date + ' ' + d.name);
['2026-10-25 종교개혁주일', '2026-11-15 추수감사주일', '2026-11-29 대림절 첫째 주일', '2026-07-05 맥추감사주일', '2026-05-24 성령강림주일', '2026-02-18 재의 수요일(사순절 시작)']
  .forEach(x => eq('church ' + x, cd.includes(x), true));
eq('liturgy 2026-10-23', W.liturgicalSeason('2026-10-23').name, '성령강림 후 절기');
eq('liturgy 2026-12-01', W.liturgicalSeason('2026-12-01').name, '대림절');
eq('liturgy 2026-03-10', W.liturgicalSeason('2026-03-10').name, '사순절');

// 24절기 (한국천문연구원 2026: 입춘 2/4, 춘분 3/20, 하지 6/21, 추분 9/23, 상강 10/23, 동지 12/22)
const T = Object.fromEntries(W.solarTerms(2026).map(t => [t.name, t.date]));
eq('terms 2026', [T['입춘'], T['춘분'], T['하지'], T['추분'], T['상강'], T['동지']], ['2026-02-04', '2026-03-20', '2026-06-21', '2026-09-23', '2026-10-23', '2026-12-22']);

// 해: 서울 2026-06-21 일출 약 05:11, 일몰 약 19:57 (KST)
const st = W.sunTimes('2026-06-21', 37.5665, 126.978, 'Asia/Seoul');
const hm = d => { const p = W.localParts(d, 'Asia/Seoul'); return p.h * 60 + p.mi; };
near('seoul sunrise 6/21', hm(st.sunrise), 5 * 60 + 11, 3);
near('seoul sunset 6/21', hm(st.sunset), 19 * 60 + 57, 3);
near('seoul noon alt 6/21', st.noonAlt, 90 - 37.5665 + 23.44, 0.3);
// 달: 2026-10-26 쯤 보름(실제 보름 10/26 13:12 KST)
const m = W.moonInfo(new Date('2026-10-26T04:12:00Z'));
eq('moon full', m.name, '보름달');
// 중력: 적도 9.780, 극 9.832, 화성(37.09°) 약 9.799
near('g lat37', W.gravity(37.09, 20), 9.7994, 0.001);
// 공기 밀도 15℃ 1013.25hPa 건조 = 1.225
near('rho', W.airDensity(15, 1013.25, 0), 1.225, 0.002);

// 오늘 스냅숏(날씨 없이)
const S = W.snapshot(W.REGIONS[0], new Date('2026-10-23T08:00:00Z'));
eq('snapshot term', S.term.name, '상강');
eq('snapshot season', S.season, 'autumn');
eq('snapshot local', S.local.ymd + ' ' + S.local.h, '2026-10-23 17');
console.log(W.effects(S).map(e => '  [' + e.area + '] ' + e.text).join('\n'));
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
