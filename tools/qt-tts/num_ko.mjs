// 운평장로교회 — QT 음성 낭독용 '숫자 읽기 규칙'
//
// GPT-SoVITS 는 아라비아 숫자를 한 자리씩 읽는다. 50 → "오영", 100 → "일영영".
// 그래서 음성으로 넘기기 전에 숫자를 한글로 바꿔 준다. 50 → "오십", 100 → "백", 500 → "오백".
//
// ⚠ 이 파일의 원본은 리포의 tools/qt-tts/num_ko.mjs 이고,
//   교회 PC 의 C:\qt-video\qt-tts-daily\num_ko.mjs 는 그 복사본이다. 고치면 양쪽 다 맞춰야 한다.
//   (qt_tts_daily.mjs 가 이 파일을 import 해서 쓴다)
//
// 규칙 요약
//   1. 기본은 한자어 수사   : 50 오십 · 100 백 · 500 오백 · 1,000 천 · 12,000 만이천
//   2. 세는 단위는 고유어   : 3개 세 개 · 2명 두 명 · 20살 스무 살 · 5시 다섯 시  (1~99 까지, 100 이상은 한자어)
//   3. 날짜·시각·범위·소수·퍼센트는 따로 풀어 읽는다
//   4. 성경 장·절은 qt_tts_daily.mjs 의 expandRefs 가 먼저 처리한다 (43:1-12 → 사십삼장 일절에서 십이절)

const D   = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const U   = ['', '십', '백', '천'];
const BIG = ['', '만', '억', '조', '경'];

// 네 자리 묶음 하나를 읽는다. 1234 → 천이백삼십사 (일천·일백·일십의 '일'은 뺀다)
function group4(n) {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const digit = Number(s[i]);
    const pos = s.length - 1 - i;
    if (!digit) continue;
    out += (digit === 1 && pos > 0) ? U[pos] : D[digit] + U[pos];
  }
  return out;
}

// 한자어 수사. 50 → 오십, 100 → 백, 10000 → 만, 123456 → 십이만삼천사백오십육
export function sino(v) {
  let n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10);
  if (!Number.isFinite(n)) return String(v);
  if (n === 0) return '영';
  if (n < 0) return '마이너스 ' + sino(-n);
  let out = '', gi = 0;
  while (n > 0 && gi < BIG.length) {
    const g = n % 10000;
    if (g) out = group4(g) + BIG[gi] + out;
    n = Math.floor(n / 10000);
    gi++;
  }
  if (n > 0) return String(v);                 // 경 단위를 넘으면 손대지 않는다
  return out.replace(/^일만/, '만');            // 일만 → 만 (일억·일조는 그대로 둔다)
}

const NAT_ONES      = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NAT_ONES_ATTR = ['', '한',   '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NAT_TENS      = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const NAT_TENS_ATTR = ['', '열', '스무', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];

// 고유어 수사(1~99). attr=true 면 단위 앞에 붙는 꼴: 3 → '세', 20 → '스무'
export function native(v, attr) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;   // 100 이상은 한자어로
  const t = Math.floor(n / 10), o = n % 10;
  const tens = (attr && o === 0 ? NAT_TENS_ATTR : NAT_TENS)[t];
  const ones = (attr ? NAT_ONES_ATTR : NAT_ONES)[o];
  return tens + ones;
}

// 고유어로 세는 단위 — 긴 것부터 적어야 '시간'이 '시'로 잘리지 않는다.
// 뒤에 다른 글자가 붙어 뜻이 달라지는 것들은 (?!...) 로 걸러 낸다. 예: 5개월 → '다섯 개월' 아님
const NATIVE_UNITS = [
  '시간', '가지', '그루', '켤레', '군데', '조각', '송이', '마리', '사람',
  '개(?!월|국|년|나리)', '명', '살(?!펴|아|리)', '시(?!간|작|절|편|험)', '번', '권', '채(?!소)',
  '척', '벌', '자루', '곳', '잔', '쌍', '달(?!러|력|리)',
].join('|');

// 문장 속 숫자를 규칙대로 한글로 바꾼다. (음성용 — 파일명 지문 sig 에는 영향 없음)
export function readNumbers(text) {
  let s = String(text == null ? '' : text);

  // 1) 날짜: 2026-08-19 · 2026.08.19 → 이천이십육년 팔월 십구일
  s = s.replace(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?!\d)/g,
    (m, y, mo, d) => `${sino(y)}년 ${sino(mo)}월 ${sino(d)}일`);

  // 2) 시각: 3시 30분 → 세 시 삼십 분 (시는 고유어, 분은 한자어)
  s = s.replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/g,
    (m, h, mi) => `${native(h, true) || sino(h)} 시 ${sino(mi)} 분`);

  // 3) 범위: 10~20 · 10-20 → 십에서 이십  (성경 장·절은 앞서 expandRefs 가 처리)
  s = s.replace(/(\d+)\s*[-~∼–—]\s*(\d+)(?!\d)/g, (m, a, b) => `${sino(a)}에서 ${sino(b)}`);

  // 4) 소수: 3.5 → 삼 점 오 / 0.25 → 영 점 이오
  s = s.replace(/(\d+)\.(\d+)/g,
    (m, a, b) => `${sino(a)} 점 ${b.split('').map((c) => sino(c)).join('')}`);

  // 5) 퍼센트: 50% → 오십 퍼센트
  s = s.replace(/(\d[\d,]*)\s*%/g, (m, a) => `${sino(a)} 퍼센트`);

  // 6) 고유어로 세는 단위: 3개 → 세 개, 20살 → 스무 살 (100 이상은 아래 7)에서 한자어로)
  s = s.replace(new RegExp('([0-9]{1,2}) *(' + NATIVE_UNITS + ')', 'g'), (m, n, unit) => {
    const w = native(n, true);
    return w ? `${w} ${unit}` : m;
  });

  // 7) 나머지 숫자 전부 한자어로: 100규빗 → 백 규빗, 1,000 → 천
  s = s.replace(/[0-9][0-9,]*/g, (m, off, str) => {
    const w = sino(m);
    const next = str[off + m.length];
    return (next && /[가-힣]/.test(next)) ? w + ' ' : w;   // 백규빗 → 백 규빗
  });

  return s;
}


// ── 성경 구절 표기 풀어 읽기 ──
//   "에스겔 43:1-12" → "에스겔 사십삼장 일절에서 십이절"   (시편은 '장' 대신 '편')
//   "1-2절"          → "일절에서 이절"
//   낱개 "25절"      → "이십오절"
//   끝으로 남은 숫자는 위의 readNumbers 규칙으로 처리한다.
//   ※ qt_tts_daily.mjs 는 낭독 텍스트를 만들 때 이 함수만 부르면 된다.
export function expandRefs(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/시편[ \t]*([0-9]+)[ \t]*:[ \t]*([0-9]+)[ \t]*[-~∼][ \t]*([0-9]+)/g,
    (m, a, b, c) => `시편 ${sino(a)}편 ${sino(b)}절에서 ${sino(c)}절`);
  s = s.replace(/시편[ \t]*([0-9]+)[ \t]*:[ \t]*([0-9]+)/g,
    (m, a, b) => `시편 ${sino(a)}편 ${sino(b)}절`);
  s = s.replace(/([0-9]+)[ \t]*:[ \t]*([0-9]+)[ \t]*[-~∼][ \t]*([0-9]+)/g,
    (m, a, b, c) => `${sino(a)}장 ${sino(b)}절에서 ${sino(c)}절`);
  s = s.replace(/([0-9]+)[ \t]*:[ \t]*([0-9]+)/g,
    (m, a, b) => `${sino(a)}장 ${sino(b)}절`);
  s = s.replace(/([0-9]+)[ \t]*[-~∼][ \t]*([0-9]+)[ \t]*(장|절|편)/g,
    (m, a, b, u) => `${sino(a)}${u}에서 ${sino(b)}${u}`);
  s = s.replace(/([0-9]+)[ \t]*(장|절|편)/g, (m, a, u) => `${sino(a)}${u}`);
  return readNumbers(s);
}

export default { sino, native, readNumbers, expandRefs };
