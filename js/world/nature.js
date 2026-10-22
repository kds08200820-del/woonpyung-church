// 자연의 규칙 (사용자 지시 2026-10-15: "창 밖 배경을 일일이 정하는 게 아니라 자연의 규칙을 적용해 사물이 저마다 변하게 — 달력과 실시간 날씨 그대로, 동물의 숲처럼")
//   그림을 날짜로 바꿔 끼우지 않는다. 그 고장의 실제 일별 기온·비·눈(Open-Meteo, 지난 1년)과 낮 길이(천문 계산)로
//   식물마다 생물계절(phenology) 규칙을 돌려 '지금 이 나무가 어떤 모습인지'를 숫자로 낸다. 그리기는 scene.js 가 한다.
//   규칙:
//   · 600℃ 법칙 — 2월 1일부터 일 최고기온을 더해 600℃가 되면 벚꽃이 핀다 (일본·한국 개화 예보의 경험칙).
//     매화·개나리·진달래·목련·사과·튤립·장미는 같은 누적값의 다른 문턱 (서울 평년 개화일에 맞춤).
//   · 적산온도(GDD) — 일평균이 5℃(또는 10℃)를 넘는 만큼 더한 값 (pyPhenology ThermalTime 모형과 같은 꼴). 수국·라벤더·해바라기·열매.
//   · 단풍 — 일 최저기온이 그 나무의 문턱(단풍나무 5℃) 아래로 내려가면 물들기 시작, 추울수록 빨리, 약 20일 뒤 절정 80% (기상청 설명).
//   · 낮 길이(광주기) — 코스모스(13.2시간)·국화(12시간)는 낮이 짧아져야 꽃눈이 생기는 단일식물. 장미는 낮이 짧아지면 한 번 더.
//   · 서리 — 최저 0℃ 아래면 한해살이가 시들고 은행잎은 한꺼번에 진다. -4℃ 아래(된서리)면 남은 잎도 진다.
//   · 눈 — 내린 눈(cm)은 쌓이고, 영상인 날 1℃당 약 2.5cm 녹는다(적설 도일 계수). 가지의 눈은 하루 이틀, 땅의 눈은 오래 간다.
//   · 한국 잔디 — 7일 평균 10℃ 근처에서 누렇게 쉬고 다시 푸르다. 연못은 사흘 평균 -2℃ 아래면 언다. 먼 산(해발 1,200m)은 기온감률로 7.8℃ 낮다.
//   · 생물 — 나비(낮 15℃↑·비 없음), 잠자리(낮이 짧아지는 늦여름~가을), 반딧불이(초여름 밤 18℃↑), 기러기(늦가을 아침·저녁), 제비(봄~여름).
//   · 무지개 — 최근 세 시간 안에 비가 왔고 지금은 그쳤으며, 해가 0~42°이고 구름이 걷혔을 때 해 반대편 42° 원 위에.
//   남반구는 기준 날짜를 여섯 달 옮긴다. 자료를 못 받으면 위도로 만든 평년 기후(코사인 근사)로 대신한다 — 오프라인 PC 도 같은 원리로 움직인다.
//   이 파일은 그리기와 떨어져 있어 다른 홈페이지(교회 홈페이지 개편 등)에도 그대로 쓸 수 있다.
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayOfYear(d) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000); }
  function parse(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }

  // ------------------------------------------------------------ 낮 길이 (시간)
  function declination(doy) { return -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)); }
  function dayLength(lat, doy) {
    var x = -Math.tan(lat * RAD) * Math.tan(declination(doy) * RAD);
    if (x >= 1) return 0; if (x <= -1) return 24;
    return 2 * Math.acos(x) / RAD / 15;
  }

  // ------------------------------------------------------------ 평년 기후 (자료가 없을 때)
  //   위도로 연평균·연교차를 어림한다. 서울(37.6°) ≈ 연평균 13℃ · 1월 -2℃ · 7월 말 28℃, 봄 일교차가 크다.
  function climate(lat, date) {
    var a = Math.abs(lat), doy = dayOfYear(date);
    var mean = 27 - Math.max(0, a - 15) * 0.62;
    var amp = clamp(2 + (a - 10) * 0.48, 1, 22);
    var peak = lat >= 0 ? 205 : 23;
    var ph = 2 * Math.PI * (doy - peak) / 365;
    var jit = Math.sin(doy * 12.9898 + date.getFullYear() * 78.233) * 43758.5453; jit = (jit - Math.floor(jit) - 0.5) * 6;   // 날마다 ±3℃ (같은 날은 늘 같게)
    var t = mean + amp * Math.cos(ph) + 1.2 * Math.sin(2 * ph) + jit;   // 봄이 가을보다 조금 늦게 데워진다
    var range = 8.5 + 2.5 * Math.sin(2 * Math.PI * (doy - (lat >= 0 ? 15 : 198)) / 365);   // 봄 일교차 크게
    var wet = Math.max(0, Math.cos(ph));
    var pr = (doy * 7919 % 100) < 22 + wet * 25 ? 2 + wet * 12 : 0;
    return { date: ymd(date), tmax: t + range / 2, tmin: t - range / 2, tmean: t, prcp: t > 0.5 ? pr : 0, snow: t <= 0.5 ? pr * 0.6 : 0, synthetic: true };
  }

  // ------------------------------------------------------------ 일별 기록 받기 (하루 한 번, 브라우저에 보관)
  //   지난해 8월 1일(남반구 2월 1일) ~ 오늘. 기록 API(며칠 늦음) + 예보 API 의 past_days(최근 두 주)를 잇는다.
  var DAILY = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,snowfall_sum';
  function seasonStart(lat, today) { var y = today.getFullYear(); return lat >= 0 ? new Date(y - 1, 7, 1) : new Date(y - 1, 1, 1); }
  function toRows(j) {
    var d = j && j.daily; if (!d || !d.time) return [];
    return d.time.map(function (t, i) {
      var mx = d.temperature_2m_max[i], mn = d.temperature_2m_min[i], me = d.temperature_2m_mean ? d.temperature_2m_mean[i] : null;
      if (mx == null || mn == null) return null;
      return { date: t, tmax: mx, tmin: mn, tmean: me == null ? (mx + mn) / 2 : me, prcp: d.precipitation_sum[i] || 0, snow: d.snowfall_sum[i] || 0 };
    }).filter(Boolean);
  }
  var memo = {};
  function history(lat, lon, now) {
    now = now || new Date();
    var key = 'nature:' + lat.toFixed(1) + ',' + lon.toFixed(1), today = ymd(now);
    if (memo[key] && memo[key].day === today) return memo[key].p;
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { stored = null; }
    var p;
    if (stored && stored.day === today && stored.rows && stored.rows.length > 30) p = Promise.resolve(stored.rows);
    else {
      var from = seasonStart(lat, now), end = new Date(now); end.setDate(end.getDate() - 7);
      var q = '?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) + '&daily=' + DAILY + '&timezone=auto';
      var arch = fetch('https://archive-api.open-meteo.com/v1/archive' + q + '&start_date=' + ymd(from) + '&end_date=' + ymd(end)).then(function (r) { return r.json(); }).then(toRows).catch(function () { return []; });
      var rec = fetch('https://api.open-meteo.com/v1/forecast' + q + '&past_days=14&forecast_days=1').then(function (r) { return r.json(); }).then(toRows).catch(function () { return []; });
      p = Promise.all([arch, rec]).then(function (rs) {
        var by = {};
        rs[0].forEach(function (r) { by[r.date] = r; });
        rs[1].forEach(function (r) { if (r.date <= today) by[r.date] = r; });
        var rows = Object.keys(by).sort().map(function (k) { return by[k]; });
        if (rows.length > 30) { try { localStorage.setItem(key, JSON.stringify({ day: today, rows: rows })); } catch (e) { /* 저장 못 해도 */ } }
        else if (stored && stored.rows) rows = stored.rows;   // 오늘 못 받으면 어제 것
        return rows;
      });
    }
    memo[key] = { day: today, p: p };
    return p;
  }
  // 빈 날은 평년 기후로 메워 끊김 없는 일별 계열로 (첫날 ~ 오늘)
  function fill(rows, lat, now) {
    var from = seasonStart(lat, now), by = {}, out = [];
    (rows || []).forEach(function (r) { by[r.date] = r; });
    var end = ymd(now);
    for (var d = new Date(from); ymd(d) <= end; d.setDate(d.getDate() + 1)) { var k = ymd(d); out.push(by[k] || climate(lat, d)); }
    return out;
  }

  // ------------------------------------------------------------ 식물 (종류마다 규칙)
  //   kind: tree(낙엽 활엽수) · pine · evergreen · shrub · flower · vine
  //   f600: 600℃ 법칙 누적(2/1~ 일 최고기온 합)의 꽃 문턱 · gdd: 일평균 5℃ 넘는 만큼의 합(1/1~) 문턱 · photo: 낮 길이 문턱(단일식물)
  //   colorStart: 단풍이 시작되는 일 최저기온 · leafOut: 꽃 핀 뒤 잎이 나기까지 날 수
  var SPECIES = {
    cherry:    { name: '벚나무', kind: 'tree', crown: 'umbrella', f600: 600, bloomDays: 16, blossom: '#F6C4D3', leaf: ['#A8D57E', '#5E9C4A'], autumn: ['#E9A04F', '#D2553D'], colorStart: 8, leafOut: 6, bark: '#7A5A4A',
                 rule: '2월 1일부터 매일 낮 최고기온을 더해 600℃가 되면 꽃이 핍니다(600℃ 법칙). 일주일쯤 뒤 만개, 비바람이 불면 꽃잎이 빨리 집니다. 가을엔 다른 나무보다 일찍 물듭니다.' },
    plum:      { name: '매화', kind: 'tree', crown: 'round', f600: 290, bloomDays: 22, blossom: '#FBEDF1', leaf: ['#B4D88A', '#6AA052'], autumn: ['#C9B45A', '#B08A45'], colorStart: 6, leafOut: 20, bark: '#5E4638',
                 rule: '봄꽃 가운데 가장 먼저 — 최고기온 누적 약 290℃에 핍니다. 쌀쌀해도 오래 갑니다.' },
    magnolia:  { name: '목련', kind: 'tree', crown: 'oval', f600: 480, bloomDays: 11, blossom: '#FFF7EC', bigBloom: true, leaf: ['#ACD47F', '#5F9A4C'], autumn: ['#C7A75A', '#9C7A45'], colorStart: 6, leafOut: 9, bark: '#8A8078',
                 rule: '잎보다 큰 흰 꽃이 먼저 — 최고기온 누적 약 480℃. 열흘쯤 피었다 집니다.' },
    maple:     { name: '단풍나무', kind: 'tree', crown: 'round', f600: 700, flowerless: true, leaf: ['#C8D86A', '#5B9846'], spring: '#D98C6C', autumn: ['#F0B34A', '#E0462E'], colorStart: 5, bark: '#6E5444',
                 rule: '최저기온이 5℃ 아래로 내려가면 물들기 시작해 약 20일 뒤 가장 붉습니다. 추울수록 빨리, 서리가 내리면 잎이 떨어집니다.' },
    ginkgo:    { name: '은행나무', kind: 'tree', crown: 'cone', f600: 760, flowerless: true, leaf: ['#C6DE79', '#6FA548'], autumn: ['#F6D84E', '#F2BE2C'], colorStart: 4, massDrop: true, bark: '#7C6656',
                 rule: '최저기온 4℃ 아래에서 노랗게 물들고, 첫 서리(0℃ 아래)가 오면 며칠 만에 잎을 한꺼번에 떨굽니다.' },
    birch:     { name: '자작나무', kind: 'tree', crown: 'oval', f600: 640, flowerless: true, leaf: ['#BFE08A', '#79AE55'], autumn: ['#F2D35C', '#E5B640'], colorStart: 7, bark: '#EEE8DD', birch: true,
                 rule: '흰 줄기. 봄에 일찍 잎이 나고 가을엔 노랗게, 조금씩 오래 떨어집니다.' },
    apple:     { name: '사과나무', kind: 'tree', crown: 'round', f600: 900, bloomDays: 12, blossom: '#FCEEF0', leaf: ['#A9D27B', '#5A974A'], autumn: ['#D9B655', '#B98E45'], colorStart: 5, leafOut: 0, fruit: '#D8463A', fruitGdd: [500, 2300, 3300], bark: '#6B5142',
                 rule: '최고기온 누적 약 900℃에 흰 꽃. 꽃이 진 뒤 따뜻한 날(일평균 5℃ 넘는 만큼)이 약 2,300도 쌓이면 빨갛게 익습니다.' },
    persimmon: { name: '감나무', kind: 'tree', crown: 'round', f600: 1050, flowerless: true, leaf: ['#B5D77E', '#4F8C43'], autumn: ['#E8913F', '#C9512F'], colorStart: 6, fruit: '#F08A2A', fruitGdd: [300, 2500, 1e9], keepFruit: true, bark: '#5B463A',
                 rule: '잎이 늦게 나고 가을에 주황빛으로 익습니다. 잎이 다 져도 감은 겨울까지 남아 까치밥이 됩니다.' },
    pine:      { name: '소나무', kind: 'pine', leaf: ['#5A8A50', '#3E6B40'], bark: '#8A5A42',
                 rule: '늘 푸릅니다. 눈이 오면 층층이 눈이 쌓이고, 5월쯤(적산온도 약 300도) 노란 송홧가루 순이 올라옵니다.' },
    camellia:  { name: '동백나무', kind: 'evergreen', leaf: ['#3F7448', '#2F5F3C'], flower: '#D6334A', bark: '#6A5548',
                 rule: '늘푸른 잎. 서늘한 겨울~이른 봄(일평균 -2~12℃)에 붉은 꽃이 피고, 꽃송이째 툭 떨어집니다. 영하 8℃ 아래면 꽃이 상합니다.' },
    forsythia: { name: '개나리', kind: 'shrub', form: 'arch', f600: 400, bloomDays: 20, blossom: '#F6CF3A', leaf: ['#B5D97D', '#6AA24E'], autumn: ['#C9B860', '#A99550'], colorStart: 5, leafOut: 8,
                 rule: '최고기온 누적 약 400℃에 잎보다 먼저 노란 꽃이 가지 가득 핍니다.' },
    azalea:    { name: '진달래', kind: 'shrub', form: 'mound', f600: 440, bloomDays: 14, blossom: '#E98BB8', leaf: ['#A9CF79', '#5E9348'], autumn: ['#D58B4E', '#B9563C'], colorStart: 5, leafOut: 9,
                 rule: '최고기온 누적 약 440℃에 잎보다 먼저 분홍 꽃. 꽃이 지고 잎이 납니다.' },
    hydrangea: { name: '수국', kind: 'shrub', form: 'hydrangea', gdd: 900, bloomDays: 45, leaf: ['#9CCB78', '#4F8F48'], autumn: ['#B9A05A', '#8C7A4C'], colorStart: 4, leafF600: 650, dryHeads: true,
                 rule: '따뜻한 날이 쌓여(일평균 5℃ 넘는 만큼 약 900도) 6~7월에 핍니다. 흙이 산성이면 파랑, 알칼리면 분홍 — 설정에서 고릅니다. 마른 꽃은 겨울까지 남습니다.' },
    rose:      { name: '장미', kind: 'shrub', form: 'rose', f600: 1400, bloomDays: 24, rebloom: 13.0, blossom: '#E2526A', leaf: ['#8FC072', '#467E42'], autumn: ['#A99A55', '#7E6E45'], colorStart: 3, leafF600: 600,
                 rule: '최고기온 누적 약 1,400℃(5월 하순)에 크게 피고, 낮이 13시간 아래로 짧아지는 가을에 한 번 더 핍니다.' },
    lavender:  { name: '라벤더', kind: 'shrub', form: 'lavender', gdd: 1050, bloomDays: 30, blossom: '#9D86D2', leaf: ['#A9BC9C', '#8EA585'], evergreenish: true,
                 rule: '적산온도 약 1,050도(6월 하순)에 보랏빛 꽃대가 올라옵니다. 잎은 은빛으로 겨울을 납니다.' },
    tulip:     { name: '튤립', kind: 'flower', form: 'tulip', f600: 800, bloomDays: 15, blossom: '#EF6A5E', sprout: 300, gone: 1300, thermo: 12,
                 rule: '최고기온 누적 약 800℃에 핍니다. 낮 기온이 12℃를 넘으면 벌어지고 밤·추운 비에는 오므립니다(온도 반응). 여름엔 땅속 알뿌리로 쉽니다.' },
    sunflower: { name: '해바라기', kind: 'flower', form: 'sunflower', annual: true, gdd10: [0, 700, 1100], blossom: '#F7C531',
                 rule: '최저기온이 10℃ 넘게 이어지면 싹이 트고, 10℃ 넘는 날이 약 700도 쌓이면(7월) 핍니다. 어린 꽃은 해를 따라 고개를 돌리고, 다 자라면 동쪽을 봅니다. 서리에 시듭니다.' },
    cosmos:    { name: '코스모스', kind: 'flower', form: 'cosmos', annual: true, photo: 13.2, blossom: '#EE8FB8',
                 rule: '낮이 13.2시간보다 짧아지면 꽃눈이 생기는 단일식물이라 늦여름부터 피고, 첫 서리에 집니다.' },
    mum:       { name: '국화', kind: 'flower', form: 'mum', photo: 12.0, blossom: '#F2C14E', hardy: -4,
                 rule: '낮이 12시간보다 짧아져야 피는 단일식물(10~11월). 된서리(-4℃ 아래)에 집니다.' },
    glory:     { name: '나팔꽃', kind: 'vine', form: 'glory', annual: true, gdd10: [0, 450, 1e9], blossom: '#6F8FE8',
                 rule: '여름 아침, 동트기 전에 피어 한낮이면 오므립니다 — 날마다 새 꽃. 서리에 시듭니다.' },
  };
  var ORDER = ['cherry', 'plum', 'magnolia', 'maple', 'ginkgo', 'birch', 'apple', 'persimmon', 'pine', 'camellia', 'forsythia', 'azalea', 'hydrangea', 'rose', 'lavender', 'tulip', 'sunflower', 'cosmos', 'mum', 'glory'];

  // ------------------------------------------------------------ 지표 계산
  //   S: 채운 일별 계열(첫날 = 지난해 8/1). md: 북반구 기준 '월일' 숫자(남반구는 여섯 달 옮김)
  function indices(S, lat, now) {
    var south = lat < 0, n = S.length, i = n - 1;
    function md(r) { var m = +r.date.slice(5, 7), d = +r.date.slice(8, 10); if (south) m = (m + 5) % 12 + 1; return m * 100 + d; }
    var MD = S.map(md);
    // 봄 해(1/1~7/31): 날마다 누적 — 600℃ 법칙(2/1~ 최고기온), GDD5·GDD10(1/1~)
    var spring = [], f = 0, g5 = 0, g10 = 0, on = false, janIdx = 0, augIdx = 0;
    for (var k = 0; k < n; k++) {
      var r = S[k], m = MD[k];
      if (m === 101) janIdx = k;
      if (m === 801) augIdx = k;
      if (m >= 101 && m < 801) {
        if (!on) { on = true; f = 0; g5 = 0; g10 = 0; }
        g5 += Math.max(0, r.tmean - 5); g10 += Math.max(0, r.tmean - 10);
        if (m >= 201) f += Math.max(0, r.tmax);
      } else on = false;
      spring.push(on ? { f: f, g5: g5, g10: g10 } : { f: 0, g5: 0, g10: 0 });
    }
    // 가을 해(8/1~1/31): 첫 서리 · 된서리
    var firstFrost = -1, hardFrost = -1;
    for (k = augIdx; k < n; k++) { if (S[k].tmin <= 0 && firstFrost < 0) firstFrost = k; if (S[k].tmin <= -4 && hardFrost < 0) hardFrost = k; }
    // 눈 쌓임(cm): 내린 눈 더하고, 영상이면 1℃당 2.5cm, 비가 오면 더 녹는다. 가지의 눈은 하루 이틀이면 떨어진다
    var depth = 0, branchSnow = 0;
    for (k = 0; k < n; k++) {
      r = S[k];
      depth += r.snow;
      depth -= 1.2 * Math.max(0, r.tmax) + 1.5 * Math.max(0, r.tmean) + (r.snow || r.tmean <= 0 ? 0 : r.prcp * 0.3);   // 낮 최고기온이 영상이면 햇볕에도 녹는다
      depth = Math.max(0, depth);
      branchSnow = r.snow > 0.3 && r.tmax < 2.5 ? Math.min(1, branchSnow * 0.5 + r.snow / 3) : branchSnow * (r.tmax > 1 ? 0.2 : 0.55);
    }
    function avg(key, days) { var s = 0, c = 0; for (var q = Math.max(0, n - days); q < n; q++) { s += S[q][key]; c++; } return c ? s / c : 0; }
    var doy = dayOfYear(now);
    var mdNow = MD[i];
    return {
      i: i, S: S, MD: MD, spring: spring, md: mdNow, south: south, janIdx: janIdx, augIdx: augIdx,
      inAut: mdNow >= 801 || mdNow < 201,
      f600: spring[i].f, gdd5: spring[i].g5, gdd10: spring[i].g10,
      firstFrost: mdNow >= 801 || mdNow < 201 ? firstFrost : -1, hardFrost: mdNow >= 801 || mdNow < 201 ? hardFrost : -1,
      snowDepth: depth, branchSnow: branchSnow,
      t7: avg('tmean', 7), t3: avg('tmean', 3), tmin7: avg('tmin', 7), tmin3: avg('tmin', 3),
      rain2: (S[i] ? S[i].prcp : 0) + 0.5 * (S[i - 1] ? S[i - 1].prcp : 0),
      dayLen: dayLength(lat, doy), dayLenPrev: dayLength(lat, doy - 7), lat: lat,
      today: S[i],
    };
  }
  // 이번 봄 해에서 누적값이 문턱을 넘은 날의 자리 (없으면 -1). 가을이면 지난 봄(이 해 1/1~7/31)을 본다
  function crossIdx(I, key, th) {
    for (var k = I.janIdx; k <= I.i && I.MD[k] < 801 && I.MD[k] >= 101; k++) if (I.spring[k][key] >= th) return k;
    return -1;
  }
  // 단풍: 최저기온이 문턱(colorStart) 아래로 내려간 첫날부터의 추위 합. (문턱+4 - 최저)/4 — 문턱 그대로면 하루 1, 더 추우면 더 빨리.
  //   20 → 80%(절정). 11월이 되도록 문턱에 안 닿는 따뜻한 곳은 낮이 짧아진 것만으로 천천히 물든다
  function autumnOf(I, th) {
    if (!I.inAut) return { prog: 0, start: -1 };
    var cold = 0, start = -1;
    for (var k = I.augIdx; k <= I.i; k++) {
      var r = I.S[k], m = I.MD[k];
      if (start < 0 && (r.tmin <= th || (m >= 1101 && m < 1300))) start = k;
      if (start >= 0) cold += r.tmin <= th ? Math.max(0.4, (th + 4 - r.tmin) / 4) : 0.3;
    }
    return { prog: clamp(cold / 20 * 0.8, 0, 1), start: start, cold: cold };
  }
  function sumSince(I, k0, base) { var g = 0; for (var k = Math.max(0, k0); k <= I.i; k++) g += Math.max(0, I.S[k].tmean - base); return g; }

  // ------------------------------------------------------------ 식물 하나의 지금 상태
  //   leaf{cover, young, autumn, fall} · bloom{amount, open, falling, bud, dry} · fruit{amount, ripe} · snow · alive · dormant · grow · wilt · size · note
  function plantState(sp, I, now, opt) {
    var s = SPECIES[sp]; if (!s) return null;
    opt = opt || {};
    var st = { sp: sp, kind: s.kind, leaf: { cover: 1, young: 0, autumn: 0, fall: 0 }, bloom: { amount: 0, open: 1, falling: 0, bud: 0, dry: 0 }, fruit: { amount: 0, ripe: 0 }, snow: I.branchSnow, alive: 1, dormant: 0, grow: 1, wilt: 0, note: '' };
    var md = I.md, hour = now.getHours() + now.getMinutes() / 60;
    var wetWind = clamp((I.today.prcp || 0) / 10 + (opt.wind || 0) / 40, 0, 1);
    // 낙엽 활엽수의 잎
    function deciduous(leafKey, leafTh, lag) {
      var cover = 0, young = 0;
      if (md >= 201 && md < 801) {
        var c = crossIdx(I, leafKey, leafTh);
        var since = c < 0 ? -1 : I.i - c - lag;
        cover = since < 0 ? 0 : smooth(0, 16, since);
        young = since < 0 ? 0 : 1 - smooth(8, 35, since);
      } else if (md >= 801) cover = 1;
      var au = autumnOf(I, s.colorStart == null ? 5 : s.colorStart), fall = 0;
      if (I.inAut) {
        st.leaf.autumn = au.prog;
        fall = clamp((au.prog - 0.78) / 0.35, 0, 1);
        if (I.firstFrost >= 0) {
          var d = I.i - I.firstFrost;
          fall = Math.max(fall, s.massDrop ? (au.prog > 0.55 ? clamp(d / 3, 0, 1) : 0.15) : clamp(d / 10, 0, 0.95) * smooth(0.3, 0.8, au.prog));
        }
        if (I.hardFrost >= 0) fall = Math.max(fall, clamp((I.i - I.hardFrost) / 4, 0, 1));
        if (md < 201) fall = 1;
      }
      st.leaf.fall = fall;
      st.leaf.cover = clamp(cover * (1 - fall), 0, 1);
      st.leaf.young = young;
    }
    // 꽃: 문턱을 넘은 날부터 bloomDays 동안 피고 진다 (비바람은 빨리 지게)
    function blossom(key, th) {
      var c = crossIdx(I, key, th), cur = I.spring[I.i][key];
      var len = s.bloomDays || 14;
      if (md >= 801 || md < 101) return;
      if (c < 0) { st.bloom.bud = smooth(th * 0.55, th, cur); return; }
      var d = I.i - c, age = d * (1 + wetWind * 0.5);
      st.bloom.age = d;
      st.bloom.amount = age < len * 0.35 ? smooth(-0.5, len * 0.35, age) : 1 - smooth(len * 0.55, len, age);
      st.bloom.falling = age > len * 0.45 && age < len * 1.15 ? clamp(1 - Math.abs(age - len * 0.8) / (len * 0.35), 0, 1) : 0;
      if (st.bloom.amount < 0.02) st.bloom.amount = 0;
    }
    switch (s.kind) {
      case 'tree': {
        deciduous('f', s.f600, s.flowerless ? 0 : (s.leafOut == null ? 7 : s.leafOut));
        if (!s.flowerless) blossom('f', s.f600);
        if (s.fruit) {
          var c = crossIdx(I, 'f', s.f600);
          if (c >= 0 && md >= 101) {
            var g = sumSince(I, c + 10, 5);
            st.fruit.amount = smooth(s.fruitGdd[0] * 0.4, s.fruitGdd[0], g);
            st.fruit.ripe = smooth(s.fruitGdd[1] * 0.72, s.fruitGdd[1], g);
            if (s.keepFruit) { if (I.hardFrost >= 0) st.fruit.amount *= 1 - clamp((I.i - I.hardFrost) / 70, 0, 0.8); }
            else st.fruit.amount *= 1 - Math.max(smooth(s.fruitGdd[2] * 0.9, s.fruitGdd[2], g), smooth(0.4, 0.9, st.leaf.fall));
          } else if (md < 201 && s.keepFruit) { st.fruit.amount = 0.15; st.fruit.ripe = 1; }   // 1월: 까치밥 몇 개
        }
        if (st.bloom.amount > 0.3 && !s.leafOut === false) st.leaf.cover *= 1 - st.bloom.amount * 0.5;
        break;
      }
      case 'pine':
        st.leaf.cover = 1; st.pollen = md < 801 ? smooth(250, 330, I.gdd5) * (1 - smooth(480, 600, I.gdd5)) : 0;
        st.snow = Math.min(1, I.branchSnow * 1.3);
        break;
      case 'evergreen': {
        st.leaf.cover = 1;
        var t7 = I.t7, season = md >= 1115 || md < 425;
        st.bloom.amount = season ? smooth(-4, -1, t7) * (1 - smooth(11, 15, t7)) * (md >= 1201 || md < 401 ? 1 : 0.45) : 0;
        if (I.tmin3 < -8) st.bloom.damaged = 1;
        st.bloom.dropped = season ? clamp(st.bloom.amount * 0.5 + (md >= 201 && md < 425 ? 0.5 : 0), 0, 1) : 0;
        break;
      }
      case 'shrub':
        if (s.evergreenish) { st.leaf.cover = 1; st.leaf.autumn = I.t7 < 3 ? 0.3 : 0; }
        else deciduous(s.leafF600 ? 'f' : 'f', s.leafF600 || s.f600, s.leafF600 ? 0 : (s.leafOut || 0));
        if (s.f600 != null) blossom('f', s.f600); else if (s.gdd != null) blossom('g5', s.gdd);
        if (s.rebloom && I.inAut && md >= 801 && I.dayLen < s.rebloom && I.dayLen < I.dayLenPrev && I.firstFrost < 0) st.bloom.amount = Math.max(st.bloom.amount, 0.5 * smooth(s.rebloom, s.rebloom - 0.7, I.dayLen));
        if (s.dryHeads) {
          var hc = crossIdx(I, 'g5', s.gdd);
          if (hc >= 0 && I.i - hc > s.bloomDays * 0.8 || (md >= 801 && hc >= 0)) { st.bloom.dry = clamp((I.i - hc - s.bloomDays * 0.8) / 40, 0, 1); st.bloom.amount = Math.max(st.bloom.amount, 0.75); }
          if (md < 201 || (md >= 801 && st.leaf.fall > 0.95 && I.snowDepth > 3)) st.bloom.amount *= 0.7;
        }
        break;
      case 'flower': case 'vine':
        if (s.form === 'tulip') {
          var ff = I.f600;
          st.alive = md >= 201 && md < 801 && ff >= s.sprout && ff < s.gone ? 1 : 0;
          st.dormant = 1 - st.alive;
          st.grow = smooth(s.sprout, s.f600 * 0.95, ff);
          blossom('f', s.f600);
          var warm = (opt.temp != null ? opt.temp : I.today.tmax) >= s.thermo;
          var dayNow = opt.sunAlt != null ? opt.sunAlt > 2 : (hour > 7 && hour < 18);
          st.bloom.open = warm && dayNow && !opt.raining ? 1 : 0.2;
          st.leaf.cover = st.alive; st.leaf.autumn = smooth(s.f600 + 250, s.gone, ff);
        } else if (s.annual) {
          // 싹: 봄 해에 최저기온 7일 평균이 10℃ 넘은 첫날부터 · 서리에 시듦 · 이듬해 다시 (씨앗)
          var sk = -1;
          for (var q = I.janIdx + 6; q <= I.i && I.MD[q] < 801 && I.MD[q] >= 101; q++) { var w = 0; for (var z = q - 6; z <= q; z++) w += I.S[z].tmin; if (w / 7 >= 10) { sk = q; break; } }
          if (sk < 0 && md >= 801) sk = I.augIdx - 80;   // 가을: 지난 봄에 싹튼 것으로
          if (sk < 0 || md < 401 && md >= 101) { st.alive = 0; st.dormant = 1; break; }
          var gs = sumSince(I, sk, 10);
          st.grow = smooth(0, 380, gs);
          if (s.gdd10) { st.bloom.amount = smooth(s.gdd10[1] * 0.88, s.gdd10[1], gs) * (1 - smooth(s.gdd10[2] * 0.85, s.gdd10[2], gs)); st.bloom.seed = smooth(s.gdd10[1] + 200, s.gdd10[2], gs); st.bloom.young = 1 - smooth(s.gdd10[1], s.gdd10[1] + 250, gs); }
          if (s.photo) st.bloom.amount = (I.dayLen < s.photo && I.dayLen < I.dayLenPrev ? smooth(s.photo, s.photo - 0.8, I.dayLen) : 0) * smooth(150, 400, gs);
          if (s.form === 'glory') {   // 하루 주기: 동트기 전에 피어 한낮에 오므린다
            var sa = opt.sunAlt == null ? (hour > 5 && hour < 11 ? 30 : -10) : opt.sunAlt, rising = opt.sunRising == null ? hour < 12 : opt.sunRising;
            st.bloom.open = rising ? smooth(-9, -3, sa) * (1 - smooth(48, 62, sa)) : 0.05;
          }
          if (md >= 1001 && s.form !== 'cosmos') st.wilt = Math.max(st.wilt, smooth(1001, 1110, md));   // 서리가 없어도 가을이 깊으면 저절로 진다
          if (I.firstFrost >= 0) { var dd = I.i - I.firstFrost; st.wilt = Math.max(st.wilt, clamp(dd / 4, 0, 1)); if (dd > 14) { st.alive = 0; st.dormant = 1; } }
          st.bloom.amount *= 1 - st.wilt;
          if (md < 201) { st.alive = 0; st.dormant = 1; }
        } else if (s.photo) {   // 국화 (여러해살이 단일식물)
          var spg = I.spring[I.i];
          st.grow = I.inAut && md >= 801 ? 1 : smooth(30, 500, spg.g5);
          st.dormant = (md < 801 && spg.g5 < 30) || md < 201 ? 1 : 0;
          st.bloom.amount = I.dayLen < I.dayLenPrev && I.dayLen < s.photo ? smooth(s.photo, s.photo - 1.2, I.dayLen) : 0;
          if (I.hardFrost >= 0) { st.wilt = clamp((I.i - I.hardFrost) / 6, 0, 1); st.bloom.amount *= 1 - st.wilt * 0.8; }
          if (st.dormant) { st.bloom.amount = 0; st.wilt = 1; }
        }
        break;
    }
    // 심은 지 며칠 — 어린 나무에서 큰 나무로 (동물의 숲처럼). 나무 14일 · 떨기나무 7일 · 풀꽃 3일
    var full = s.kind === 'tree' || s.kind === 'pine' || s.kind === 'evergreen' ? 14 : s.kind === 'shrub' ? 7 : 3;
    st.size = opt.plantedAt ? clamp(0.3 + 0.7 * (now - opt.plantedAt) / (full * 86400000), 0.3, 1) : 1;
    st.note = describe(s, st, I);
    return st;
  }
  function pct(x) { return Math.round(clamp(x, 0, 1) * 100) + '%'; }
  function describe(s, st, I) {
    if (st.dormant) return s.form === 'tulip' ? '땅속 알뿌리로 쉬는 중' : s.annual ? '씨앗으로 겨울을 나는 중' : '쉬는 중';
    if (st.wilt > 0.5) return '서리를 맞아 시드는 중';
    if (st.bloom.dry > 0.3) return '빛바랜 꽃이 남아 있어요';
    if (st.bloom.seed > 0.5 && st.bloom.amount < 0.3) return '씨앗이 여물어 고개를 숙였어요';
    if (st.bloom.amount > 0.6) return st.bloom.falling > 0.4 ? '꽃잎이 흩날리는 중' : '꽃이 한창';
    if (st.bloom.amount > 0.05) return st.bloom.falling > 0.3 ? '꽃잎이 지는 중' : '꽃이 피는 중';
    if (st.bloom.bud > 0.05) return s.f600 ? '꽃눈이 부푸는 중 — 600℃ 법칙 누적 ' + Math.round(I.f600) + '℃ / ' + s.f600 + '℃' : '꽃눈이 부푸는 중';
    if (st.fruit.amount > 0.2 && st.fruit.ripe > 0.6) return st.leaf.cover < 0.2 ? '잎 진 가지에 열매가 남아 있어요' : '열매가 익었어요';
    if (st.fruit.amount > 0.2) return '열매가 자라는 중';
    if (st.leaf.fall > 0.6) return '잎을 다 떨구고 겨울눈으로 쉬는 중';
    if (st.leaf.autumn > 0.05) return '단풍 ' + pct(st.leaf.autumn) + ' — 최저기온이 ' + (s.colorStart == null ? 5 : s.colorStart) + '℃ 아래로 내려간 뒤 물드는 중';
    if (st.leaf.cover > 0 && st.leaf.young > 0.3) return '새잎이 돋는 중';
    if (s.photo && I.dayLen >= s.photo) return '낮 ' + I.dayLen.toFixed(1) + '시간 — ' + s.photo + '시간보다 짧아지면 꽃눈이 생겨요';
    if (s.f600 && I.f600 > 0 && I.f600 < s.f600) return '600℃ 법칙 누적 ' + Math.round(I.f600) + '℃ / ' + s.f600 + '℃';
    if ((s.kind === 'tree' || s.kind === 'shrub') && st.leaf.cover < 0.05 && !s.evergreenish) return '겨울눈으로 봄을 기다리는 중';
    return '푸르게 자라는 중';
  }

  // ------------------------------------------------------------ 풍경 전체의 지금 상태
  function world(I, now, cur) {
    cur = cur || {};
    var md = I.md;
    var groundSnow = clamp(I.snowDepth / 5, 0, 1);
    var peakT = I.t7 - 5.2;   // 해발 800m — 기온감률 6.5℃/km
    var forest = plantState('maple', I, now, {}), forest2 = plantState('birch', I, now, {});
    var hum = cur.humidity == null ? 70 : cur.humidity, h = now.getHours();
    var day = cur.sunAlt == null ? (h > 6 && h < 18) : cur.sunAlt > 3;
    var night = cur.sunAlt == null ? (h >= 20 || h < 4) : cur.sunAlt < -6;
    var temp = cur.temp == null ? I.today.tmax : cur.temp, raining = !!cur.raining, wind = cur.wind || 0;
    var growing = I.gdd5 > 120 || (md >= 801 && I.firstFrost < 0);
    var critters = {
      butterflies: day && temp >= 15 && !raining && wind < 25 && growing ? Math.round(clamp((temp - 13) / 8, 0, 1) * 3) : 0,
      dragonflies: day && temp >= 15 && temp <= 31 && !raining && I.dayLen < I.dayLenPrev && md >= 805 && md < 1110 && I.firstFrost < 0 ? 3 : 0,
      fireflies: night && temp >= 18 && wind < 15 && !raining && md >= 601 && md < 820 && (h >= 20 || h < 1) ? Math.round(clamp((temp - 17) / 6, 0, 1) * 16 * (hum > 65 ? 1 : 0.5)) : 0,
      geese: md >= 1010 && md < 1225 && ((h >= 6 && h < 9) || (h >= 16 && h < 19)) && !raining ? 1 : 0,
      swallows: day && !raining && md >= 405 && md < 905 ? 2 : 0,
      bees: day && temp >= 13 && !raining ? 1 : 0,
    };
    return {
      grassGreen: smooth(7, 12, I.t7), groundSnow: groundSnow, snowDepth: I.snowDepth, branchSnow: I.branchSnow,
      pondIce: smooth(-0.5, -3, I.t3), peakSnow: clamp((-peakT - 1) / 5, 0, 1),
      forest: { cover: forest.leaf.cover, autumn: forest.leaf.autumn, young: forest.leaf.young, fall: forest.leaf.fall, cover2: forest2.leaf.cover, autumn2: forest2.leaf.autumn },
      wet: clamp(I.rain2 / 8 + (raining ? 0.6 : 0), 0, 1), puddle: clamp((I.rain2 - 4) / 10 + (raining ? 0.35 : 0), 0, 1) * (1 - groundSnow),
      leafLitter: clamp(forest.leaf.fall * 1.2, 0, 1) * (1 - groundSnow) * (md >= 1001 || md < 301 ? 1 : 0) * (md < 301 && md >= 101 ? 0.4 : 1),
      silverGrass: md >= 915 && md < 1231 ? smooth(915, 1001, md) : (md < 301 ? 0.6 : 0),
      wildflowers: md >= 301 && md < 1101 ? 1 : 0,
      critters: critters, dayLen: I.dayLen, f600: I.f600, gdd5: I.gdd5, t7: I.t7, md: md,
    };
  }
  // 무지개: 최근 비 + 지금은 그침 + 해가 0~42° + 구름이 걷힘 → 해 반대편(방위+180°) 42° 원
  function rainbow(cur) {
    if (!cur || cur.raining || cur.sunAlt == null) return null;
    if (!(cur.sunAlt > 0 && cur.sunAlt < 42) || (cur.cloud != null && cur.cloud > 0.75) || !cur.recentRain) return null;
    return { az: (cur.sunAz + 180) % 360, top: 42 - cur.sunAlt };
  }

  // ------------------------------------------------------------ 한 번에: 계열 → 지표 → 상태
  function compute(rows, lat, now, cur) {
    var S = fill(rows, lat, now), I = indices(S, lat, now);
    return { I: I, world: world(I, now, cur), rainbow: rainbow(cur), synthetic: !rows || rows.length < 30 };
  }
  function load(lat, lon, now) { return history(lat, lon, now).catch(function () { return []; }); }

  var api = { SPECIES: SPECIES, ORDER: ORDER, load: load, compute: compute, plantState: plantState, dayLength: dayLength, climate: climate, fill: fill, indices: indices, ymd: ymd, parse: parse };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Nature = api;
})(typeof window !== 'undefined' ? window : this);
