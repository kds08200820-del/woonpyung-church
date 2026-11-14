/* rep-prayer.js — 주일 낮 예배 대표기도문 (2026-11-14 담임목사 지시)
 *  · 봉사위원(설정 → 연간 봉사위원 '이주의 기도')에서 그 주일 기도자를 찾고, 권사님 차례면 기도문을 만든다(장로님은 기도문 없음)
 *  · 운평장로교회 대표기도 모범안의 흐름과 문장 결을 따른다:
 *      하나님께 드리는 찬양 → 회개·감사 → 성도·교회(다음 세대)·나라 중보 → 말씀과 설교자 → 결단  (3분 안팎)
 *  · 그 주일의 날짜로 교회력(대림·성탄·송구영신·신년·사순·종려·부활·성령강림)과 계절·명절·나라 기념일을 골라 넣는다.
 *    입력(날짜·기도자·설교 제목·본문·변형 번호·그분의 지난 기도문)이 같으면 언제 어디서 만들어도 같은 글이 나온다.
 *  · 예배 매니저(affairs.js)와 대시보드(dashboard.js)가 같이 쓴다.
 *  · 기존 기도문 문서(.docx)의 문단을 기도자·날짜별로 나누는 parseDoc 도 여기 있다.
 */
(function (root) {
  'use strict';
  var VERSION = 1;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parse(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function diffDays(a, b) { return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5); }
  var ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
  function nth(d) { return Math.floor((d.getDate() - 1) / 7) + 1; }   // 주보·봉사위원과 같은 셈(1~7일 = 첫째 주)
  function nthSunday(y, m, n) {   // m: 1~12
    var d = new Date(y, m - 1, 1); while (d.getDay() !== 0) d = addDays(d, 1);
    d = addDays(d, (n - 1) * 7); return d.getMonth() === m - 1 ? d : null;
  }
  function lastSunday(y, m) { var d = new Date(y, m, 0); while (d.getDay() !== 0) d = addDays(d, -1); return d; }

  // 부활절(그레고리력)
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  // 음력 명절(양력 날짜)
  var SEOLLAL = { 2026: '2026-02-17', 2027: '2027-02-07', 2028: '2028-01-27', 2029: '2029-02-13', 2030: '2030-02-03' };
  var CHUSEOK = { 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03', 2029: '2029-09-22', 2030: '2030-09-12' };

  // ── 사람 ── '차영선 권사' → '차영선'
  var TITLE_RE = /\s*(안수집사|권사|장로|집사|목사|전도사|성도|권찰)\s*님?\s*$/;
  function nameOf(p) { return String(p || '').trim().replace(TITLE_RE, '').replace(/\s+/g, ''); }
  function needsPrayer(p) { return /권사\s*님?\s*$/.test(String(p || '').trim()); }
  function samePerson(a, b) { return !!nameOf(a) && nameOf(a) === nameOf(b); }

  // 봉사위원(church_settings.committees.months)에서 그 주일의 기도자 — 주보 제작(fillCommittee)과 같은 셈
  function scheduled(months, date) {
    var d = parse(date); if (!d || !months) return '';
    var ym = String(date).slice(0, 7), n = nth(d);
    for (var i = 0; i < months.length; i++) {
      var m = months[i]; if (!m || m.month !== ym) continue;
      var arr = m.prayer || [];
      for (var j = 0; j < arr.length; j++) {
        var w = String((arr[j] && arr[j].week) || '').match(/(\d+)\s*주/);
        if (w && +w[1] === n && arr[j].person && String(arr[j].person).trim()) return String(arr[j].person).trim();
      }
    }
    return '';
  }
  // 그 사람이 봉사위원 명단에서 기도한 날짜들(오래된 것부터) — 날짜 없는 옛 기도문을 넣을 때 쓴다
  function scheduledDates(months, person) {
    var out = [], nm = nameOf(person); if (!nm) return out;
    (months || []).forEach(function (m) {
      var mm = String((m && m.month) || '').match(/^(\d{4})-(\d{2})$/); if (!mm) return;
      (m.prayer || []).forEach(function (p) {
        var w = String((p && p.week) || '').match(/(\d+)\s*주/); if (!w || nameOf(p.person) !== nm) return;
        var d = nthSunday(+mm[1], +mm[2], +w[1]); if (d) out.push(ymd(d));
      });
    });
    return out.sort();
  }
  function sundayLabel(date) { var d = parse(date); return d ? (d.getMonth() + 1) + '월 ' + ORD[nth(d) - 1] + ' 주일' : ''; }

  // ── 그 주일의 때(교회력·계절·명절·기념일) ──
  var TAG_NAME = {
    advent: '대림절', christmas: '성탄', yearend: '송구영신', newyear: '신년', lent: '사순절', palm: '종려주일·고난주간', easter: '부활주일',
    eastertide: '부활절기', pentecost: '성령강림주일', seollal: '설 명절', chuseok: '추석 명절', samil: '삼일절', children: '어린이날', parents: '어버이날',
    memorial: '호국보훈의 달', korwar: '6·25', midyear: '맥추감사', summer: '여름 사역', liberation: '광복절', exam: '수험생', reformation: '종교개혁 기념',
    thanks: '추수감사의 계절', newterm: '새 학기', changing: '환절기', heat: '무더위', rain: '장마', cold: '추위',
    spring: '봄', summerS: '여름', autumn: '가을', winter: '겨울'
  };
  function occasion(date) {
    var d = parse(date); if (!d) return null;
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    var o = { date: ymd(d), y: y, m: m, day: day, nth: nth(d), key: '', n: 0, tags: {}, holiday: null };
    function tag(k) { o.tags[k] = true; }
    var de = diffDays(d, easter(y));
    if (de === 0) o.key = 'easter';
    else if (de === -7) o.key = 'palm';
    else if (de >= -42 && de <= -14) { o.key = 'lent'; o.n = (de + 42) / 7 + 1; }
    else if (de === 49) o.key = 'pentecost';
    else if (de > 0 && de < 49) o.key = 'eastertide';
    var xmas = new Date(y, 11, 25), adv4 = addDays(xmas, -(xmas.getDay() || 7)), adv1 = addDays(adv4, -21), da = diffDays(d, adv1);
    if (da >= 0 && diffDays(d, xmas) < 0) { o.key = 'advent'; o.n = da / 7 + 1; }
    if (m === 12 && day === 25) o.key = 'christmas';
    if (m === 12 && day > 25) o.key = 'yearend';
    if (m === 1 && day <= 7) o.key = 'newyear';
    if (o.key) tag(o.key);
    [['seollal', SEOLLAL], ['chuseok', CHUSEOK]].forEach(function (h) {
      var hd = parse(h[1][y]); if (!hd) return;
      var dd = diffDays(d, hd); if (Math.abs(dd) <= 6) { tag(h[0]); o.holiday = { key: h[0], name: h[0] === 'seollal' ? '설' : '추석', when: dd < 0 ? 'before' : dd > 0 ? 'after' : 'on' }; }
    });
    if ((m === 2 && day >= 23) || (m === 3 && day <= 7)) tag('samil');
    if (m === 5 && day <= 7) tag('children');
    if (m === 5 && day >= 6 && day <= 12) tag('parents');
    if (m === 6) tag('memorial');
    if (m === 6 && day >= 19) tag('korwar');
    if (m === 7 && day <= 7) tag('midyear');
    if ((m === 6 && day >= 15) || m === 7 || (m === 8 && day <= 21)) tag('summer');
    if (m === 8 && day >= 9 && day <= 21) tag('liberation');
    if ((m === 10 && day >= 15) || (m === 11 && day <= 21)) tag('exam');
    if (m === 10 && day >= 25) tag('reformation');
    if (m === 11) tag('thanks');
    if ((m === 2 && day >= 20) || (m === 3 && day <= 14)) tag('newterm');
    if (m === 3 || (m === 4 && day <= 10) || (m === 9 && day >= 10) || m === 10 || m === 11) tag('changing');
    if (m === 7 || m === 8) tag('heat');
    if ((m === 6 && day >= 20) || (m === 7 && day <= 25)) tag('rain');
    if (m === 12 || m === 1 || m === 2) tag('cold');
    o.season = m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summerS' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
    return o;
  }
  // 화면에 보일 이름표 — 이 주일에 반영한 것들
  function occasionTags(date) {
    var o = occasion(date); if (!o) return [];
    var keys = Object.keys(o.tags).filter(function (k) { return k !== 'eastertide'; });
    var out = keys.map(function (k) { return TAG_NAME[k]; });
    if (!o.key || o.key === 'eastertide') out.unshift(TAG_NAME[o.season]);
    return out;
  }

  // ── 결정적 무작위(같은 입력 → 같은 글) ──
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── 문장 ──
  var OPEN = ['은혜로우신 하나님 아버지,', '거룩하신 하나님 아버지,', '살아 계신 하나님 아버지,', '사랑과 은혜가 충만하신 하나님 아버지,',
    '온 우주를 통치하시는 하나님 아버지,', '복의 근원 되시는 하나님 아버지,', '전능하시고 거룩하신 하나님 아버지,', '은혜와 긍휼이 충만하신 하나님 아버지,'];
  var SCENE = {
    1: ['새해의 소망을 품은', '매서운 추위가 이어지는'], 2: ['겨울의 끝자락에서 새봄을 기다리는', '찬 바람 속에서도 봄을 기다리는'],
    3: ['얼어붙었던 땅이 녹고 새싹이 돋는', '봄기운이 움트는'], 4: ['온 산과 들에 꽃이 피어나는', '생명의 봄빛이 가득한'],
    5: ['신록이 푸르게 짙어 가는', '가정의 달을 맞은'], 6: ['녹음이 짙어 가는', '초여름의 푸르름이 가득한'],
    7: ['무더위가 시작되는', '한여름으로 들어서는'], 8: ['한여름 무더위가 한창인', '뜨거운 햇볕이 내리쬐는'],
    9: ['선선한 가을바람이 불어오는', '들녘의 곡식이 여물어 가는'], 10: ['들녘이 황금빛으로 물들어 가는', '산마다 단풍이 짙어 가는'],
    11: ['한 해의 결실을 거두는 감사의 계절', '가을이 깊이 저물어 가는'], 12: ['한 해를 마무리하는', '찬 바람 속에 성탄을 기다리는']
  };
  var PRAISE = {
    spring: ['얼어붙었던 땅에 새싹을 돋게 하시고 메마른 가지에 꽃을 피우시는 생명의 주님을 찬양합니다.', '봄볕처럼 따스한 은혜로 우리를 날마다 새롭게 하시는 주님을 찬양합니다.'],
    summerS: ['뜨거운 햇볕과 비를 때에 맞게 내리시어 온 땅의 생명을 기르시는 주님을 찬양합니다.', '짙어 가는 녹음 가운데서도 변함없이 우리를 붙드시는 주님의 신실하심을 찬양합니다.'],
    autumn: ['들녘의 결실과 산천의 아름다움 가운데 변함없이 역사하시는 주님의 신실하심을 찬양합니다.', '봄에 씨를 뿌리게 하시고 여름의 햇볕과 비를 견디게 하시며 가을에 거두게 하시는 주님을 찬양합니다.'],
    winter: ['찬 바람 속에서도 변함없는 사랑으로 우리를 따뜻하게 품어 주시는 주님을 찬양합니다.', '눈보다 더 희게 우리를 씻으시는 주님의 크신 은혜를 찬양합니다.'],
    any: ['한 주간도 우리가 미처 깨닫지 못한 순간까지 지키시고 인도하신 주님의 손길을 기억하며, 이 시간 모든 성도가 한마음으로 주님께 영광을 돌립니다.',
      '계절이 바뀌고 시간이 흘러도 변함없이 우리를 지키시고 사랑하시는 주님의 신실하심을 찬양합니다.',
      '광대하심과 권능과 영광과 이김과 위엄이 다 주님께 속하였고, 천지에 있는 모든 것이 주님의 것임을 고백합니다.'],
    easter: ['죽음을 이기시고 다시 사신 주님께서 오늘도 살아 계셔서 우리와 함께하심을 찬양합니다.'],
    palm: ['우리를 위해 십자가의 길을 걸어가신 주님의 사랑을 묵상하며 찬양합니다.'],
    lent: ['죄인 된 우리를 구원하시려고 독생자를 아끼지 않고 내어 주신 측량할 수 없는 사랑에 감사와 영광을 올려 드립니다.'],
    pentecost: ['연약한 우리 안에 성령으로 함께하시며 우리를 모든 진리 가운데로 인도하시는 주님을 찬양합니다.'],
    advent: ['말씀이 육신이 되어 우리 가운데 오신 주님을 기억하며, 다시 오실 주님을 기다리는 마음으로 예배를 드립니다.'],
    christmas: ['하늘 영광을 버리시고 낮고 천한 말구유에 오신 주님의 사랑을 찬양합니다.'],
    yearend: ['한 해 동안 우리의 걸음걸음을 붙드시고 여기까지 인도하신 에벤에셀의 하나님을 찬양합니다.'],
    newyear: ['새해를 허락하시고 새로운 날들을 선물로 주신 주님을 찬양합니다.']
  };
  var ACCEPT = ['우리의 예배와 찬송을 기쁘게 받아 주시옵소서.', '이 시간 드리는 예배를 기쁘게 받아 주시옵소서.', '우리의 예배를 받아 주시옵소서.'];
  var THANK = {
    thanks: '한 해의 결실을 거두는 이 계절에 지난날을 돌아보니, 주님께서 베푸신 은혜가 셀 수 없이 많습니다.',
    midyear: '한 해의 절반을 지나기까지 지켜 주신 은혜를 헤아려 보니 감사뿐입니다.',
    yearend: '돌아보면 한 해 동안 받은 은혜는 너무도 크고 많은데, 우리가 드린 감사는 너무도 작았습니다.',
    newyear: '지난해의 허물과 아쉬움을 주님 앞에 내려놓고, 새해를 주님과 함께 새롭게 시작하기 원합니다.',
    lent: '주님의 고난을 가까이하기보다 그 열매만을 누리려 했던 우리를 용서하여 주옵소서.',
    palm: '주님의 고난을 가까이하기보다 그 열매만을 누리려 했던 우리를 용서하여 주옵소서.'
  };
  var REPENT = [
    '지난 한 주간을 돌아보면 우리는 주님의 자녀답게 살지 못했습니다. 분주한 일상에 쫓겨 주님과의 시간을 소홀히 했고, 작은 일에 마음을 빼앗겨 감사를 잊었으며, 사람을 향한 미움과 원망으로 마음을 어둡게 했습니다. 우리의 부족함을 주님 앞에 내려놓사오니, 십자가의 보혈로 우리의 모든 죄를 씻어 주시고 우리의 마음을 정결하게 하옵소서.',
    '입술로는 주님을 찬양하면서도 삶으로는 세상을 좇았고, 섬기기보다 움켜쥐며 살아온 우리를 불쌍히 여겨 주옵소서. 이 모든 연약함과 허물을 주님 앞에 내려놓사오니, 십자가의 보혈로 우리를 씻어 주시고 주님의 형상을 닮아 가게 하옵소서.',
    '우리는 낮아지기보다 높아지기를 원했고, 섬기기보다 인정받기를 구했습니다. 경쟁과 시기와 비교로 흔들렸던 우리의 교만을 이 시간 고백하오니, 주님의 마음을 품지 못한 죄를 용서하시고 겸손한 심령을 부어 주옵소서.',
    '우리의 생명도, 건강도, 가정도, 섬길 수 있는 자리까지도 모두 주님께서 거저 주신 것인데, 우리는 많은 날을 내 것이라 여기며 살아왔습니다. 받은 복을 당연하게 여기며 감사보다 불평이 앞섰던 어리석음을 용서하여 주시고, 주신 것들을 세어 보며 감사할 줄 아는 자녀들이 되게 하옵소서.',
    '당장 눈앞의 편안함을 좇았고 헌신 앞에 주저했으며, 주어진 시간을 선용하지 못하고 게으르게 살아왔음을 고백합니다. 우리의 게으름과 무관심을 내려놓고 회개하오니, 우리를 불쌍히 여기시어 용서하시고 새롭게 빚어 주시옵소서.'
  ];
  var CARE = [
    '오늘 이 자리에 모인 성도들을 돌아보아 주옵소서. 몸이 아픈 성도들에게 치유의 손길을 펴 주시고, 가정의 어려움으로 힘들어하는 가정들을 회복시켜 주시며, 자녀 문제로 눈물 흘리는 부모님들의 기도에 응답하여 주시옵소서. 직장과 사업의 무거운 짐을 진 형제자매들에게 지혜와 길을 열어 주시고, 외로움 가운데 있는 영혼들에게 주님의 따뜻한 위로를 부어 주시옵소서.',
    '저마다 마음에 짐을 안고 이 자리에 나왔습니다. 병상에서 신음하는 성도들에게 치유의 은혜를 베풀어 주시고, 슬픔과 상실 가운데 있는 가정에 위로의 손길을 펴 주시옵소서. 경제적 어려움으로 무거운 짐을 진 가정들에게 하늘의 도우심을 부어 주시고, 믿음이 식어 교회의 자리가 비어 있는 이들을 주님께서 친히 찾아가 주시옵소서.',
    '긍휼의 하나님, 말 못 할 아픔과 눈물로 주님 앞에 엎드린 영혼들의 마음을 어루만져 주시옵소서. 질병으로 고통받는 이들을 치유하시고, 관계의 상처와 외로움 속에 있는 이들에게 주님의 위로를 부어 주시며, 인생의 갈림길에서 길을 찾는 이들에게 주님의 인도하심을 보여 주시옵소서.'
  ];
  var CARE_X = {
    children: '가정의 달을 맞아 우리 가정마다 사랑과 화목이 넘치게 하시고, 부모를 공경하며 자녀를 주님의 말씀으로 양육하는 믿음의 가정 되게 하옵소서.',
    parents: '어버이날을 맞아 우리를 길러 주신 부모님의 은혜를 기억하오니, 연로하신 부모님들께 강건함과 평안을 더하여 주시옵소서.',
    exam: '입시를 앞두고 마음 졸이는 수험생들과 그 가정에 평안과 지혜를 더하여 주시옵소서.',
    newterm: '새 학기를 맞는 자녀들이 새로운 자리에서 잘 적응하며, 무엇보다 주님을 의지하는 지혜를 배우게 하옵소서.',
    changing: '환절기에 건강이 약해진 어르신들과 연약한 지체들을 특별히 지켜 주시옵소서.',
    heat: '무더위 가운데 어르신들과 연약한 지체들의 건강을 지켜 주시고, 지친 몸과 마음에 새 힘을 더하여 주시옵소서.',
    rain: '장마철 큰비에 우리의 가정과 일터가 상하지 않도록 지켜 주시옵소서.',
    cold: '추위 가운데 홀로 지내시는 어르신들과 몸이 연약한 지체들을 따뜻하게 지켜 주시옵소서.'
  };
  function holidayCare(h) {
    if (h.when === 'before') return '다가오는 ' + h.name + ' 명절에 오가는 길을 지켜 주시고, 흩어졌던 가족들이 서로 사랑으로 하나 되게 하옵소서.';
    if (h.when === 'on') return h.name + ' 명절을 맞아 가족들이 함께 모이는 자리마다 주님의 평강이 머물게 하시고, 믿지 않는 가족들이 주님을 만나는 기회가 되게 하옵소서.';
    return h.name + ' 명절을 보내고 돌아온 성도들에게 새 힘을 주시고, 명절 동안 나눈 사랑이 가정마다 이어지게 하옵소서.';
  }
  var CHURCH = [
    '주님께서 세우신 우리 운평장로교회를 위해 기도드립니다. 목사님과 사모님께 건강과 지혜를 주시어 양 무리를 잘 인도하게 하시고, 장로님과 권사님, 집사님들이 한마음으로 교회를 섬기게 하옵소서.',
    '우리 운평장로교회를 돌아보아 주시옵소서. 이 공동체 위에 부으시는 은혜의 단비를 거두지 마시고, 각 부서와 기관마다 성령의 생기를 불어넣어 주시옵소서. 목사님과 사모님을 강건케 하시고, 모든 직분자들이 한 뜻으로 교회를 섬기게 하옵소서.',
    '주님께서 세우신 우리 운평장로교회가 말씀 위에 굳건히 서게 하시고, 성령의 열매가 가득 맺히는 공동체 되게 하옵소서. 목사님께 건강과 지혜를 더하시고, 묵묵히 주님의 전을 섬기는 손길들을 하늘에서 기억하여 주시옵소서.'
  ];
  var NEXTGEN = [
    '다음 세대 우리 자녀들이 세상의 풍조에 흔들리지 않고 오직 주님의 말씀 위에 굳건히 서게 하옵소서.',
    '우리 교회가 이 지역의 영혼들을 품는 따뜻한 교회로 든든히 서 가게 하시고, 잃어버린 영혼들을 향한 전도의 열정을 우리 안에 다시 일으켜 주시옵소서.',
    '자라나는 다음 세대가 어려서부터 주님을 알게 하시고, 가정마다 신앙의 뿌리가 깊이 내리게 하옵소서.'
  ];
  function churchX(o) {
    if (o.key === 'advent') return '성탄의 기쁜 소식이 우리 교회를 통해 이웃에게 흘러가게 하옵소서.';
    if (o.key === 'christmas') return '이 땅에 오신 주님의 사랑을 우리 교회가 이웃에게 전하는 통로가 되게 하옵소서.';
    if (o.key === 'yearend') return '한 해 동안 우리 교회를 지켜 주신 은혜에 감사드리며, 다가오는 새해의 사역도 주님께 맡겨 드립니다.';
    if (o.key === 'newyear') return '새해 우리 교회가 계획하는 모든 사역 위에 주님께서 앞서 행하여 주시옵소서.';
    if (o.key === 'easter' || o.key === 'eastertide') return '부활의 소망을 품은 교회로서 세상 가운데 생명의 소식을 전하게 하옵소서.';
    if (o.key === 'pentecost') return '성령의 충만함을 입어 담장을 넘어 이웃에게 복음을 전하는 교회 되게 하옵소서.';
    if (o.key === 'lent' || o.key === 'palm') return '주님의 십자가를 묵상하는 이 절기에 우리 모두가 주님의 고난에 참여하는 삶을 살게 하옵소서.';
    if (o.tags.reformation) return '종교개혁을 기념하는 이때에, 오직 말씀과 오직 은혜와 오직 믿음의 신앙을 굳게 붙드는 교회 되게 하옵소서.';
    if (o.tags.thanks) return '한 해 동안 베풀어 주신 은혜를 헤아리며 감사의 예물을 드리는 우리 교회 되게 하옵소서.';
    if (o.tags.midyear) return '올해 남은 절반의 날들도 주님의 뜻을 따라 충성되이 섬기는 교회 되게 하옵소서.';
    if (o.tags.summer && o.m === 8) return '여름 사역을 통해 자녀들 마음에 심긴 말씀의 씨앗이 자라 열매 맺게 하옵소서.';
    if (o.tags.summer) return '다가오는 여름 수련회와 성경학교 위에 주님께서 함께하시어, 다음 세대가 주님을 깊이 만나는 시간이 되게 하옵소서.';
    return '';
  }
  var NATION_TAIL = '나라를 이끄는 지도자들에게 분별의 지혜를 주시옵소서. 분단된 이 민족 위에 통일의 새벽을 열어 주시고, 한국 교회 가운데 다시 한번 부흥의 불길을 일으켜 주시옵소서.';
  var NATION = [
    '이 나라와 민족도 주님의 손 안에 있음을 믿습니다. 지도자들에게 분별의 지혜를 주시고, 이 땅에 정의와 공의가 강물처럼 흐르게 하옵소서. 분단된 이 민족 위에 통일의 새벽을 열어 주시고, 한국 교회 가운데 다시 한번 부흥의 불길을 일으켜 주시옵소서.',
    '이 땅에 주님의 평강을 부어 주시고, 나라를 이끄는 지도자들에게 하나님의 뜻을 분별하는 지혜를 허락하여 주시옵소서. 분단의 아픔을 안고 있는 이 민족에게 평화의 길을 열어 주시고, 식어 가는 한국 교회를 다시 깨워 주시옵소서.',
    '우리 대한민국도 주님의 손에 맡겨 드립니다. 정의와 진리가 살아 숨 쉬는 나라, 사랑과 긍휼이 강물처럼 흐르는 나라 되게 하시고, 분단된 이 민족 위에 통일의 문을 열어 주시옵소서. 전쟁과 분쟁으로 고통받는 세계 곳곳에도 주님의 평화를 허락하여 주옵소서.'
  ];
  function nationX(o) {
    if (o.tags.samil) return '삼일절을 맞아 나라를 위해 목숨을 바친 믿음의 선진들을 기억합니다. 그들이 지킨 신앙의 정신이 오늘 우리 가운데 이어지게 하시고, ' + NATION_TAIL;
    if (o.tags.korwar) return '6·25 전쟁의 아픔을 기억하며 이 민족 위에 다시는 전쟁이 없게 하시고, ' + NATION_TAIL;
    if (o.tags.memorial) return '호국보훈의 달을 맞아 이 땅의 자유를 위해 생명을 바친 이들을 기억합니다. 그 희생 위에 누리는 평안을 당연히 여기지 않게 하시고, ' + NATION_TAIL;
    if (o.tags.liberation) return '광복의 기쁨을 허락하신 하나님께 감사드리며, 참된 자유와 평화가 이 땅에 온전히 이루어지게 하시고, ' + NATION_TAIL;
    return '';
  }
  var WORD_TAIL = ['말씀을 듣는 우리의 마음 밭을 옥토로 만들어 주옵소서.', '선포되는 말씀이 우리의 굳은 심령을 깨뜨려 날마다 주님을 닮아 가게 하옵소서.',
    '선포되는 말씀을 통해 우리의 심령이 새로워지고 삶 속에서 순종의 열매를 맺게 하옵소서.'];
  var WORD = ['이제 곧 말씀이 선포됩니다. 목사님께 성령의 기름 부으심을 더하시고, 말씀을 듣는 우리의 마음 밭을 옥토로 만들어 주옵소서.',
    '강단에 서시는 목사님께 성령의 능력을 더하여 주시고, 선포되는 말씀이 우리의 굳은 심령을 깨뜨려 날마다 주님을 닮아 가게 하옵소서.',
    '말씀을 전하시는 목사님께 하늘의 지혜를 더하시고, 선포되는 말씀이 우리 삶 속에서 순종의 열매로 맺히게 하옵소서.'];
  var RESOLVE = ['오늘 받은 말씀이 한 주간 우리의 발의 등이 되고 길의 빛이 되게 하시며, 삶의 자리에서 그리스도의 향기를 발하는 성도들이 되게 하옵소서.',
    '예배를 마치고 세상으로 나아갈 때, 받은 은혜를 잊지 않고 맡겨진 자리에서 묵묵히 충성하는 자 되게 하옵소서.',
    '이 한 주간도 우리의 삶 전체가 주님을 향한 산 제사가 되게 하시고, 말씀과 기도로 승리하게 하옵소서.'];
  function resolveX(o) {
    if (o.key === 'newyear') return '새해에도 말씀을 따라 한 걸음씩 주님과 동행하는 우리가 되게 하옵소서.';
    if (o.key === 'yearend') return '남은 날들을 감사로 채우고, 다가오는 새해를 믿음으로 맞이하게 하옵소서.';
    if (o.key === 'easter') return '부활하신 주님과 함께 새 생명 가운데서 행하는 한 주간이 되게 하옵소서.';
    if (o.season === 'autumn' && !o.key) return '이 가을, 우리 영혼에 심긴 말씀의 씨앗이 때가 되면 아름다운 열매로 맺히게 하옵소서.';
    return '';
  }
  var CLOSE = ['이 모든 말씀을 우리 주 예수 그리스도의 이름으로 기도드립니다.\n아멘.',
    '모든 영광을 삼위일체 하나님께 올려 드리며, 우리 주 예수 그리스도의 이름으로 기도드립니다.\n아멘.',
    '광대하심과 권능과 영광이 영원토록 주님께 있음을 고백하며, 우리 주 예수 그리스도의 이름으로 기도드립니다.\n아멘.'];

  function whenPhrase(o, pick) {
    var ord = ORD[o.nth - 1];
    if (o.key === 'advent') return '성탄을 기다리며 촛불을 밝히는 대림절 ' + ORD[o.n - 1] + ' 주일';
    if (o.key === 'christmas') return '구주 예수 그리스도의 나심을 기뻐하는 성탄 주일';
    if (o.key === 'yearend') return '한 해를 마무리하는 마지막 주일';
    if (o.key === 'newyear') return '새해를 시작하는 첫 주일';
    if (o.key === 'lent') return '주님의 고난을 묵상하는 사순절 ' + ORD[o.n - 1] + ' 주일';
    if (o.key === 'palm') return '주님께서 예루살렘에 들어가신 종려주일';
    if (o.key === 'easter') return '사망 권세를 이기고 다시 사신 주님의 부활을 기뻐하는 부활주일';
    if (o.key === 'pentecost') return '약속하신 성령을 보내 주신 성령강림주일';
    if (o.holiday && o.holiday.when === 'on') return o.holiday.name + ' 명절을 맞은 ' + o.m + '월 ' + ord + ' 주일';
    return pick(SCENE[o.m]) + ' ' + o.m + '월 ' + ord + ' 주일';
  }
  // 그분이 예전에 드린 기도의 첫 부름(하나님 아버지, …) — 가져온 기도문·고친 기도문에서
  function ownOpenings(history, date) {
    var out = [];
    (history || []).forEach(function (h) {
      if (!h || !h.body || (h.source === 'auto') || (date && String(h.sdate || '') >= date)) return;
      var first = String(h.body).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
      var cut = first.indexOf(','); var head = (cut > 0 ? first.slice(0, cut) : first).trim().replace(/[,，]$/, '');
      if (head.length < 3 || head.length > 40 || !/(아버지|하나님|주님)$/.test(head)) return;
      head += ','; if (out.indexOf(head) < 0) out.push(head);
    });
    return out;
  }

  // 기도문 만들기 — o: { date:'YYYY-MM-DD', person, title, scripture, variant, history:[{sdate, body, source}] }
  function generate(o) {
    o = o || {};
    var oc = occasion(o.date); if (!oc) return '';
    var rnd = rng(hash(VERSION + '|' + oc.date + '|' + nameOf(o.person) + '|' + (o.variant || 0)));
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var key = oc.key && oc.key !== 'eastertide' ? oc.key : '';
    // 1. 부름 · 찬양
    var own = ownOpenings(o.history, oc.date);
    var opening = own.length ? own[Math.floor(rnd() * own.length)] : pick(OPEN);
    var when = whenPhrase(oc, pick);
    var p1 = opening + '\n' + pick([when + ', 다시 주님 앞에 서게 하시니 감사드립니다.', when + ' 아침, 거룩한 예배의 자리로 우리를 불러 주시니 감사드립니다.', when + '에 주님 앞에 나아오게 하시니 감사를 드립니다.']) +
      ' ' + pick(key && PRAISE[key] ? PRAISE[key] : PRAISE[oc.season].concat(PRAISE.any)) + ' ' + pick(ACCEPT);
    // 2. 감사 · 회개
    var th = THANK[key] || (oc.tags.midyear ? THANK.midyear : oc.tags.thanks ? THANK.thanks : '');
    var rp = (key === 'lent' || key === 'palm') ? REPENT[2] : (oc.tags.thanks || key === 'yearend') ? REPENT[3] : pick(REPENT);
    var p2 = (th ? th + ' ' : '') + (th && rp === REPENT[0] ? REPENT[4] : rp);   // 감사 문장이 앞에 있으면 긴 회개 대신 짧은 것
    // 3. 성도 — 기본 문단 + 그 주일의 때(명절·가정의 달·수험생·새 학기·날씨). 긴 기본 문단이면 한 문장, 짧은 것이면 두 문장까지
    var xs = [];
    if (oc.holiday) xs.push(holidayCare(oc.holiday));
    ['children', 'parents', 'exam', 'newterm'].forEach(function (k) { if (oc.tags[k]) xs.push(CARE_X[k]); });
    var wx = ['changing', 'heat', 'rain', 'cold'].filter(function (k) { return oc.tags[k]; });
    if (wx.length) xs.push(CARE_X[pick(wx)]);
    var ci = Math.floor(rnd() * CARE.length);
    xs = xs.slice(0, ci === 2 ? 2 : 1);
    var p3 = CARE[ci] + (xs.length ? ' ' + xs.join(' ') : '');
    // 4. 교회
    var cx = churchX(oc);
    var p4 = pick(CHURCH) + ' ' + (cx || pick(NEXTGEN));
    // 5. 나라
    var p5 = nationX(oc) || pick(NATION);
    // 6. 말씀 · 결단 · 맺음
    var title = String(o.title || '').trim(), scr = String(o.scripture || '').trim(), p6;
    if (title) p6 = '이제 「' + title + '」' + (scr ? '(' + scr + ')' : '') + ' 말씀을 전하시는 목사님께 성령의 기름 부으심을 더하여 주시고, ' + pick(WORD_TAIL);
    else if (scr) p6 = '이제 ' + scr + ' 말씀을 전하시는 목사님께 성령의 기름 부으심을 더하여 주시고, ' + pick(WORD_TAIL);
    else p6 = pick(WORD);
    p6 += ' ' + (resolveX(oc) || pick(RESOLVE));
    return [p1, p2, p3, p4, p5, p6, pick(CLOSE)].join('\n\n');
  }

  // ── 기존 기도문 문서(.docx) 나누기 ── paras: 문단 글 배열(문서 순서). today: 'YYYY-MM-DD'(연도 없는 날짜를 지난 날짜로 맞춘다)
  //    → [{ person:'차영선 권사', date:'2026-04-26'|'', body }]
  var HEAD_RE = /(?:기도\s*인도|기도자|기\s*도)\s*[:：]\s*([가-힣A-Za-z_]{2,8}?)\s*(권사|장로|집사)?(?:님)?\s*$/;
  var TITLE_LINE = /(대표\s*기도\s*문|기도\s*문\s*$|안내문)/;
  function dateFrom(s, today) {
    s = String(s || ''); var t = parse(today) || new Date(), m;
    if ((m = s.match(/(20\d\d)\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/))) return ymd(new Date(+m[1], +m[2] - 1, +m[3]));
    if ((m = s.match(/(20\d\d)\s*년\s*(\d{1,2})\s*월\s*(\d)\s*주/))) { var a = nthSunday(+m[1], +m[2], +m[3]); return a ? ymd(a) : ''; }
    function back(y, mo, fn) { var d = fn(y, mo); if (d && diffDays(d, t) > 0) d = fn(y - 1, mo); return d ? ymd(d) : ''; }
    if ((m = s.match(/(\d{1,2})\s*월\s*의?\s*(첫째|둘째|셋째|넷째|다섯째)\s*주/))) { var n = ORD.indexOf(m[2]) + 1; return back(t.getFullYear(), +m[1], function (y, mo) { return nthSunday(y, mo, n); }); }
    if ((m = s.match(/(\d{1,2})\s*월\s*의?\s*(끝자락|마지막\s*주)/))) return back(t.getFullYear(), +m[1], lastSunday);
    return '';
  }
  function parseDoc(paras, today) {
    var items = [], cur = null, hint = [];
    function finish() {
      if (!cur) return;
      var lines = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!cur.date) cur.date = dateFrom(lines.split('\n').slice(0, 3).join(' '), today);
      if (lines.length > 80) items.push({ person: cur.person, date: cur.date, body: lines });
      cur = null;
    }
    (paras || []).forEach(function (raw) {
      var line = String(raw == null ? '' : raw).replace(/ /g, ' ').replace(/[ \t]+$/, '');
      var trim = line.trim(), hm = trim.match(HEAD_RE);
      if (hm && trim.length < 80) {
        finish();
        cur = { person: hm[1] + ' ' + (hm[2] || '권사'), date: dateFrom(trim, today) || dateFrom(hint.join(' '), today), lines: [] };
        hint = [];
        return;
      }
      if (trim && trim.length < 50 && (TITLE_LINE.test(trim) || (/^20\d\d/.test(trim) && dateFrom(trim, today)))) { hint.push(trim); return; }   // 다음 기도의 제목·날짜 줄
      if (!cur) return;
      if (!trim) { if (cur.lines.length && cur.lines[cur.lines.length - 1] !== '') cur.lines.push(''); return; }
      cur.lines.push(trim);
    });
    finish();
    return items;
  }

  root.RepPrayer = {
    VERSION: VERSION, generate: generate, occasion: occasion, occasionTags: occasionTags, scheduled: scheduled, scheduledDates: scheduledDates,
    nameOf: nameOf, needsPrayer: needsPrayer, samePerson: samePerson, sundayLabel: sundayLabel, parseDoc: parseDoc, dateFrom: dateFrom
  };
})(typeof window !== 'undefined' ? window : globalThis);
