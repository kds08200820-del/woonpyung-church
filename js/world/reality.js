/* ============================================================
   We Church — 실물 연동 엔진 (2026-10-23)
   가상 공간의 하늘·땅·사람이 '그 고장의 지금'을 그대로 따르게 하는 계산 모음.
   그리기와 떨어져 있어 신앙 정원·위처치 소개·뒷날 3D 지도에서 함께 쓴다(Node 에서도 require 가능).

   · 지역   REGIONS(시·군 대표 좌표) · nearestRegion(위도, 경도) — 회원의 고장이 기후·해·달을 정한다
   · 시각   그 고장 시간대의 날짜·시각·요일(Intl). 남의 PC 시계가 아니라 지역 기준
   · 해     NOAA 근사식 고도·방위, 일출·일몰·시민박명(고도 -0.833°·-6°를 이분법으로 찾음)
   · 달     월령·밝기·이름(삭·초승·상현·보름·하현·그믐)
   · 절기   태양 황경 15°마다 24절기(Meeus 25장 저정밀식, 오차 약 15분)
   · 공휴일 양력 공휴일 + 설날·부처님오신날·추석(삭 시각과 중기로 음력 달을 셈, 한국 표준시) + 대체공휴일 + 선거일
   · 교회력 부활절(그레고리력 계산) 기준 사순절·성령강림절, 대림절, 맥추·추수감사주일, 종교개혁주일 + 절기 색
   · 날씨   Open-Meteo 현재값(기온·습도·기압·구름·비·눈·바람·돌풍) + 미세먼지(대기질 API), 10분 보관
   · 물리   위도별 중력(국제 중력식), 공기 밀도, 소리 빠르기, 이슬점, 빗방울·눈송이 낙하 속도, 바람에 기우는 각, 바람 압력
   · effects(snapshot) — 위의 값이 가상 세계에서 무엇을 바꾸는지 한 줄씩(회원에게 보이는 문장, 자연 이야기로만)
   ============================================================ */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdUTC(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(ymd, n) { var d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)); return ymdUTC(d); }
  function dow(ymd) { return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))).getUTCDay(); }
  function dayDiff(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000); }

  // ------------------------------------------------------------ 지역
  //   1단계는 시·군 대표 좌표. 뒷날 garden_regions(지역 표)와 정밀 지도 자료로 바꾼다. elev = 대표 해발(m)
  var REGIONS = [
    { id: 'hwaseong-ujeong', name: '화성시 우정읍', prov: '경기', lat: 37.0893, lng: 126.8164, elev: 20, coast: true },
    { id: 'seoul', name: '서울', prov: '서울', lat: 37.5665, lng: 126.978, elev: 38 },
    { id: 'incheon', name: '인천', prov: '인천', lat: 37.4563, lng: 126.7052, elev: 10, coast: true },
    { id: 'suwon', name: '수원시', prov: '경기', lat: 37.2636, lng: 127.0286, elev: 40 },
    { id: 'ansan', name: '안산시', prov: '경기', lat: 37.3219, lng: 126.8309, elev: 15, coast: true },
    { id: 'siheung', name: '시흥시', prov: '경기', lat: 37.3799, lng: 126.8031, elev: 12, coast: true },
    { id: 'pyeongtaek', name: '평택시', prov: '경기', lat: 36.9921, lng: 127.1129, elev: 20 },
    { id: 'goyang', name: '고양시', prov: '경기', lat: 37.6584, lng: 126.832, elev: 30 },
    { id: 'seongnam', name: '성남시', prov: '경기', lat: 37.4201, lng: 127.1267, elev: 60 },
    { id: 'yongin', name: '용인시', prov: '경기', lat: 37.2411, lng: 127.1776, elev: 90 },
    { id: 'chuncheon', name: '춘천시', prov: '강원', lat: 37.8813, lng: 127.7298, elev: 80 },
    { id: 'gangneung', name: '강릉시', prov: '강원', lat: 37.7519, lng: 128.8761, elev: 25, coast: true },
    { id: 'cheongju', name: '청주시', prov: '충북', lat: 36.6424, lng: 127.489, elev: 60 },
    { id: 'cheonan', name: '천안시', prov: '충남', lat: 36.8151, lng: 127.1139, elev: 40 },
    { id: 'daejeon', name: '대전', prov: '대전', lat: 36.3504, lng: 127.3845, elev: 70 },
    { id: 'sejong', name: '세종', prov: '세종', lat: 36.48, lng: 127.289, elev: 50 },
    { id: 'jeonju', name: '전주시', prov: '전북', lat: 35.8242, lng: 127.148, elev: 50 },
    { id: 'gwangju', name: '광주', prov: '광주', lat: 35.1595, lng: 126.8526, elev: 40 },
    { id: 'mokpo', name: '목포시', prov: '전남', lat: 34.8118, lng: 126.3922, elev: 10, coast: true },
    { id: 'yeosu', name: '여수시', prov: '전남', lat: 34.7604, lng: 127.6622, elev: 15, coast: true },
    { id: 'daegu', name: '대구', prov: '대구', lat: 35.8714, lng: 128.6014, elev: 50 },
    { id: 'pohang', name: '포항시', prov: '경북', lat: 36.019, lng: 129.3435, elev: 10, coast: true },
    { id: 'andong', name: '안동시', prov: '경북', lat: 36.5684, lng: 128.7294, elev: 140 },
    { id: 'busan', name: '부산', prov: '부산', lat: 35.1796, lng: 129.0756, elev: 20, coast: true },
    { id: 'ulsan', name: '울산', prov: '울산', lat: 35.5384, lng: 129.3114, elev: 30, coast: true },
    { id: 'changwon', name: '창원시', prov: '경남', lat: 35.2281, lng: 128.6811, elev: 20, coast: true },
    { id: 'jinju', name: '진주시', prov: '경남', lat: 35.18, lng: 128.1076, elev: 30 },
    { id: 'jeju', name: '제주시', prov: '제주', lat: 33.4996, lng: 126.5312, elev: 30, coast: true },
    { id: 'seogwipo', name: '서귀포시', prov: '제주', lat: 33.2541, lng: 126.56, elev: 50, coast: true }
  ];
  REGIONS.forEach(function (r) { r.tz = 'Asia/Seoul'; });
  function regionById(id) { for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return null; }
  function nearestRegion(lat, lng) {
    var best = null, bd = 1e9;
    REGIONS.forEach(function (r) {
      var dy = (r.lat - lat) * 111, dx = (r.lng - lng) * 111 * Math.cos(lat * RAD), d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = r; }
    });
    return { region: best, km: bd };
  }

  // ------------------------------------------------------------ 시각 (지역 시간대)
  var fmtCache = {};
  function localParts(date, tz) {
    tz = tz || 'Asia/Seoul';
    var f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
    var o = {};
    f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    var y = +o.year, m = +o.month, d = +o.day, h = +o.hour % 24, mi = +o.minute, s = +o.second;
    var ymd = y + '-' + pad(m) + '-' + pad(d);
    var offMin = Math.round((Date.UTC(y, m - 1, d, h, mi, s) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    return { y: y, m: m, d: d, h: h, mi: mi, s: s, ymd: ymd, dow: dow(ymd), offMin: offMin, minutes: h * 60 + mi + s / 60 };
  }
  // 그 지역 날짜(ymd)의 자정(UTC 시각) — 하루 안에서 해·달을 찾을 때
  function localMidnight(ymd, tz) {
    var guess = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
    var off = localParts(guess, tz).offMin;
    return new Date(guess.getTime() - off * 60000);
  }

  // ------------------------------------------------------------ 해 (NOAA 근사, 오차 약 0.01°)
  function julian(date) { return date.getTime() / 86400000 + 2440587.5; }
  function sunPosition(date, lat, lng) {
    var n = julian(date) - 2451545.0;
    var L = norm360(280.460 + 0.9856474 * n), g = norm360(357.528 + 0.9856003 * n) * RAD;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var eps = (23.439 - 0.0000004 * n) * RAD;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var ha = (gmst * 15 + lng) * RAD - ra;
    var phi = lat * RAD;
    var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
    return { alt: alt * DEG, az: norm360(az * DEG), dec: dec * DEG };
  }
  // 고도가 h0 를 지나는 시각을 하루 안에서 찾는다 (10분 간격으로 훑고 이분법)
  function crossings(day0, lat, lng, h0) {
    var out = { up: null, down: null }, step = 600000, prev = sunPosition(day0, lat, lng).alt - h0;
    for (var t = day0.getTime() + step; t <= day0.getTime() + 86400000; t += step) {
      var cur = sunPosition(new Date(t), lat, lng).alt - h0;
      if ((prev < 0) !== (cur < 0)) {
        var a = t - step, b = t, fa = prev;
        for (var i = 0; i < 20; i++) {
          var mid = (a + b) / 2, fm = sunPosition(new Date(mid), lat, lng).alt - h0;
          if ((fa < 0) === (fm < 0)) { a = mid; fa = fm; } else b = mid;
        }
        if (prev < 0 && !out.up) out.up = new Date((a + b) / 2);
        else if (prev >= 0 && !out.down) out.down = new Date((a + b) / 2);
      }
      prev = cur;
    }
    return out;
  }
  function sunTimes(ymd, lat, lng, tz) {
    var day0 = localMidnight(ymd, tz);
    var rs = crossings(day0, lat, lng, -0.833), civ = crossings(day0, lat, lng, -6);
    var noon = null, best = -99;
    for (var t = day0.getTime(); t < day0.getTime() + 86400000; t += 300000) {
      var a = sunPosition(new Date(t), lat, lng).alt; if (a > best) { best = a; noon = new Date(t); }
    }
    return { sunrise: rs.up, sunset: rs.down, dawn: civ.up, dusk: civ.down, noon: noon, noonAlt: best,
      dayLength: rs.up && rs.down ? (rs.down - rs.up) / 3600000 : (best > 0 ? 24 : 0) };
  }
  // 하늘 때: 밤 · 새벽 · 아침노을 · 낮 · 저녁노을 · 해 질 녘 (해 고도와 오전·오후로)
  function skyPhase(alt, morning) {
    if (alt < -6) return 'night';
    if (alt < 0) return morning ? 'dawn' : 'dusk';
    if (alt < 8) return morning ? 'sunrise' : 'sunset';
    return 'day';
  }

  // ------------------------------------------------------------ 달
  var SYNODIC = 29.530588853, NEW_MOON_REF = 2451550.09766;   // 2000-01-06 14:20 TT
  function moonInfo(date) {
    var age = ((julian(date) - NEW_MOON_REF) % SYNODIC + SYNODIC) % SYNODIC;
    var f = age / SYNODIC, illum = (1 - Math.cos(2 * Math.PI * f)) / 2;
    var name = f < 0.034 || f >= 0.966 ? '삭' : f < 0.216 ? '초승달' : f < 0.284 ? '상현달' : f < 0.466 ? '차오르는 달'
      : f < 0.534 ? '보름달' : f < 0.716 ? '기우는 달' : f < 0.784 ? '하현달' : '그믐달';
    return { age: age, phase: f, illum: illum, name: name, waxing: f < 0.5 };
  }

  // ------------------------------------------------------------ 정밀 천문: 태양 황경 · 삭 (Meeus)
  var DELTA_T_DAYS = 69 / 86400;   // TT - UT (2020년대 약 69초)
  function solarLongitude(jde) {
    var T = (jde - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var om = (125.04 - 1934.136 * T) * RAD;
    return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  }
  // 황경이 lon 이 되는 시각(JD, UT). approxJd 근처에서 뉴턴법
  function solarTermJd(lon, approxJd) {
    var jd = approxJd;
    for (var i = 0; i < 12; i++) {
      var d = ((lon - solarLongitude(jd + DELTA_T_DAYS)) % 360 + 540) % 360 - 180;
      jd += d / 0.98564736;
      if (Math.abs(d) < 1e-6) break;
    }
    return jd;
  }
  function newMoonJde(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = (2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
    var Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
    var F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
    var Om = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
    var s = Math.sin;
    jde += -0.40720 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M)
      - 0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
      + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F)
      + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
      + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
    var A = [[299.77, 0.107408, 0.000325], [251.88, 0.016321, 0.000165], [251.83, 26.651886, 0.000164], [349.42, 36.412478, 0.000126],
      [84.66, 18.206239, 0.000110], [141.74, 53.303771, 0.000062], [207.14, 2.453732, 0.000060], [154.84, 7.306860, 0.000056],
      [34.52, 27.261239, 0.000047], [207.19, 0.121824, 0.000042], [291.34, 1.844379, 0.000040], [161.72, 24.198154, 0.000037],
      [239.56, 25.513099, 0.000035], [331.55, 3.592518, 0.000023]];
    for (var i = 0; i < A.length; i++) {
      var arg = A[i][0] + A[i][1] * k - (i === 0 ? 0.009173 * T2 : 0);
      jde += A[i][2] * s(arg * RAD);
    }
    return jde;
  }
  function jdToDate(jd) { return new Date((jd - 2440587.5) * 86400000); }
  // 한국 표준시(UTC+9) 날짜 — 음력·절기는 늘 한국 표준시로 센다(중국 달력과 하루 다를 수 있다)
  function kstYmd(jd) { return ymdUTC(new Date((jd - 2440587.5) * 86400000 + 9 * 3600000)); }
  function newMoonOnOrBefore(jd) {
    var k = Math.floor((jd - 2451550.09766) / 29.530588861) + 1, nm;
    while ((nm = newMoonJde(k) - DELTA_T_DAYS) > jd) k--;
    return nm;
  }
  function newMoonAfter(jd) { var k = Math.floor((jd - 2451550.09766) / 29.530588861) - 1, nm; while ((nm = newMoonJde(k) - DELTA_T_DAYS) <= jd) k++; return nm; }

  // ------------------------------------------------------------ 24절기
  var TERMS = [
    ['춘분', 0, '낮과 밤의 길이가 같아지는 때'], ['청명', 15, '하늘이 차츰 맑아지는 때'], ['곡우', 30, '봄비가 내려 곡식을 기름지게 하는 때'],
    ['입하', 45, '여름이 시작되는 때'], ['소만', 60, '햇볕이 풍부해 만물이 자라는 때'], ['망종', 75, '씨를 뿌리기 좋은 때'],
    ['하지', 90, '낮이 가장 긴 때'], ['소서', 105, '여름 더위가 시작되는 때'], ['대서', 120, '더위가 가장 심한 때'],
    ['입추', 135, '가을이 시작되는 때'], ['처서', 150, '더위가 그치는 때'], ['백로', 165, '이슬이 내리기 시작하는 때'],
    ['추분', 180, '밤이 길어지기 시작하는 때'], ['한로', 195, '찬 이슬이 맺히는 때'], ['상강', 210, '서리가 내리기 시작하는 때'],
    ['입동', 225, '겨울이 시작되는 때'], ['소설', 240, '얼음이 얼기 시작하는 때'], ['대설', 255, '큰 눈이 오는 때'],
    ['동지', 270, '밤이 가장 긴 때'], ['소한', 285, '추위가 시작되는 때'], ['대한', 300, '추위가 가장 심한 때'],
    ['입춘', 315, '봄이 시작되는 때'], ['우수', 330, '눈이 녹아 비가 되는 때'], ['경칩', 345, '개구리가 겨울잠에서 깨는 때']
  ];
  function termJdNear(lon, year) {
    // 황경 lon 의 절기가 그 해 대략 언제인지: 춘분(0°)이 3월 20일쯤, 하루 약 0.9856°
    var approxDoy = 79 + norm360(lon) / 0.9856;
    var jd0 = 2440587.5 + Date.UTC(year, 0, 1) / 86400000 + approxDoy - 1;
    if (approxDoy > 365) jd0 -= 365.2422;
    return solarTermJd(lon, jd0);
  }
  function solarTerms(year) {
    return TERMS.map(function (t) {
      var jd = termJdNear(t[1], year);
      return { name: t[0], lon: t[1], about: t[2], jd: jd, date: kstYmd(jd), at: jdToDate(jd) };
    }).sort(function (a, b) { return a.jd - b.jd; });
  }
  // 그 날의 절기 — 절기가 드는 날은 하루 내내 그 절기로 부른다(달력처럼). dayEnd = 그 지역 날짜의 끝 시각
  function currentTerm(dayEnd, todayYmd) {
    var jd = julian(dayEnd), lon = solarLongitude(jd + DELTA_T_DAYS), idx = Math.floor(norm360(lon) / 15);
    var t = TERMS[idx], nx = TERMS[(idx + 1) % 24];
    var since = solarTermJd(t[1], jd - (norm360(lon) - t[1]) / 0.9856), next = solarTermJd(nx[1], jd + (norm360(nx[1] - lon) || 15) / 0.9856);
    var nextDate = kstYmd(next);
    return { name: t[0], about: t[2], lon: lon, since: kstYmd(since), next: nx[0], nextDate: nextDate,
      daysToNext: todayYmd ? dayDiff(todayYmd, nextDate) : Math.ceil(next - jd), today: todayYmd ? kstYmd(since) === todayYmd : false };
  }
  function seasonOf(termLon, lat) {   // 절기로 정한 계절 (입춘·입하·입추·입동 기준), 남반구는 반대
    var l = norm360(termLon + (lat < 0 ? 180 : 0));
    if (l >= 315 || l < 45) return 'spring';
    if (l < 135) return 'summer';
    if (l < 225) return 'autumn';
    return 'winter';
  }
  var SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

  // ------------------------------------------------------------ 음력 공휴일 (한국 표준시)
  //   음력 n월 = 중기(中氣) n 이 든 달. 1월=우수(330°), 4월=소만(60°), 8월=추분(180°)
  function lunarMonthStartContaining(lon, year) {
    var jd = termJdNear(lon, year);
    var zq = kstYmd(jd), nm = newMoonOnOrBefore(jd + 1), start = kstYmd(nm);
    if (start > zq) start = kstYmd(newMoonOnOrBefore(nm - 1));   // 삭이 중기와 같은 날 늦게 들면 그 달
    return start;
  }
  function lunarDates(year) {
    var m1 = lunarMonthStartContaining(330, year), m4 = lunarMonthStartContaining(60, year), m8 = lunarMonthStartContaining(180, year);
    return { seollal: m1, buddha: addDays(m4, 7), chuseok: addDays(m8, 14) };
  }

  // ------------------------------------------------------------ 공휴일 (관공서의 공휴일에 관한 규정, 2023년 개정 대체공휴일 포함)
  var EXTRA_HOLIDAYS = {   // 법으로 정해지지만 해마다 따로 정해지는 날(선거일·임시공휴일). 새로 정해지면 여기에 더한다
    '2025-01-27': '임시공휴일', '2025-06-03': '대통령 선거일', '2026-06-03': '전국동시지방선거일', '2028-04-12': '국회의원 선거일',
    '2030-06-12': '전국동시지방선거일'
  };
  var holidayCache = {};
  function holidays(year) {
    if (holidayCache[year]) return holidayCache[year];
    var y = String(year), L = lunarDates(year), list = [];
    function add(date, name, subRule) { list.push({ date: date, name: name, sub: subRule || '' }); }
    add(y + '-01-01', '신정');
    add(addDays(L.seollal, -1), '설날 연휴', 'lunar'); add(L.seollal, '설날', 'lunar'); add(addDays(L.seollal, 1), '설날 연휴', 'lunar');
    add(y + '-03-01', '삼일절', 'weekend');
    add(y + '-05-05', '어린이날', 'weekend');
    add(L.buddha, '부처님오신날', 'weekend');
    add(y + '-06-06', '현충일');
    add(y + '-08-15', '광복절', 'weekend');
    add(addDays(L.chuseok, -1), '추석 연휴', 'lunar'); add(L.chuseok, '추석', 'lunar'); add(addDays(L.chuseok, 1), '추석 연휴', 'lunar');
    add(y + '-10-03', '개천절', 'weekend');
    add(y + '-10-09', '한글날', 'weekend');
    add(y + '-12-25', '기독탄신일(성탄절)', 'weekend');
    Object.keys(EXTRA_HOLIDAYS).forEach(function (d) { if (d.slice(0, 4) === y) add(d, EXTRA_HOLIDAYS[d]); });
    var taken = {};
    list.forEach(function (h) { (taken[h.date] = taken[h.date] || []).push(h); });
    function isOff(d) { return !!taken[d] || dow(d) === 0 || dow(d) === 6; }
    function nextFree(d) { var n = addDays(d, 1); while (isOff(n)) n = addDays(n, 1); return n; }
    var subs = [];
    // 설날·추석: 연휴가 일요일이나 다른 공휴일과 겹치면 연휴 다음 첫 평일
    [L.seollal, L.chuseok].forEach(function (c) {
      var days = [addDays(c, -1), c, addDays(c, 1)], hit = days.some(function (d) { return dow(d) === 0 || taken[d].length > 1; });
      if (hit) { var s = nextFree(days[2]); subs.push({ date: s, name: '대체공휴일(' + (c === L.seollal ? '설날' : '추석') + ')', sub: '' }); taken[s] = [subs[subs.length - 1]]; }
    });
    // 그 밖의 대체 대상: 토·일요일이거나 다른 공휴일과 겹치면 다음 첫 평일
    list.forEach(function (h) {
      if (h.sub !== 'weekend') return;
      var d = h.date, clash = dow(d) === 0 || dow(d) === 6 || taken[d].length > 1;
      if (clash && !subs.some(function (s) { return s.of === h.name; })) {
        var s = nextFree(d); var rec = { date: s, name: '대체공휴일(' + h.name.replace(/\(.*\)/, '') + ')', sub: '', of: h.name };
        subs.push(rec); taken[s] = [rec];
      }
    });
    var all = list.concat(subs).map(function (h) { return { date: h.date, name: h.name }; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    holidayCache[year] = all;
    return all;
  }
  function holidayOn(ymd) { return holidays(+ymd.slice(0, 4)).filter(function (h) { return h.date === ymd; }); }

  // ------------------------------------------------------------ 교회력
  function easter(year) {   // 그레고리력 부활절 (Anonymous Gregorian algorithm)
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return year + '-' + pad(month) + '-' + pad(day);
  }
  function nthSunday(year, month, n) { var d = year + '-' + pad(month) + '-01'; while (dow(d) !== 0) d = addDays(d, 1); return addDays(d, 7 * (n - 1)); }
  function lastSundayOnOrBefore(ymd) { var d = ymd; while (dow(d) !== 0) d = addDays(d, -1); return d; }
  function adventStart(year) { return addDays(lastSundayOnOrBefore(year + '-12-24'), -21); }
  function churchDays(year) {
    var E = easter(year), y = String(year);
    return [
      { date: y + '-01-06', name: '주현절' },
      { date: addDays(E, -46), name: '재의 수요일(사순절 시작)' },
      { date: addDays(E, -7), name: '종려주일' },
      { date: addDays(E, -2), name: '성금요일' },
      { date: E, name: '부활주일' },
      { date: nthSunday(year, 5, 1), name: '어린이주일' },
      { date: nthSunday(year, 5, 2), name: '어버이주일' },
      { date: addDays(E, 39), name: '승천일' },
      { date: addDays(E, 49), name: '성령강림주일' },
      { date: nthSunday(year, 7, 1), name: '맥추감사주일' },
      { date: lastSundayOnOrBefore(y + '-10-31'), name: '종교개혁주일' },
      { date: nthSunday(year, 11, 3), name: '추수감사주일' },
      { date: adventStart(year), name: '대림절 첫째 주일' },
      { date: y + '-12-25', name: '성탄절' },
      { date: y + '-12-31', name: '송구영신' }
    ].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  var LIT_COLORS = { purple: { ko: '보라', hex: '#6B4E7A' }, white: { ko: '흰색', hex: '#F4EEE2' }, green: { ko: '초록', hex: '#5E8C5A' }, red: { ko: '빨강', hex: '#B5452F' } };
  function liturgicalSeason(ymd) {
    var y = +ymd.slice(0, 4), E = easter(y), adv = adventStart(y);
    var s;
    if (ymd >= adv && ymd <= y + '-12-24') s = { name: '대림절', color: 'purple' };
    else if (ymd >= y + '-12-25' || ymd <= y + '-01-05') s = { name: '성탄절기', color: 'white' };
    else if (ymd < addDays(E, -46)) s = { name: '주현절기', color: 'green' };
    else if (ymd < E) s = { name: '사순절', color: 'purple' };
    else if (ymd < addDays(E, 49)) s = { name: '부활절기', color: 'white' };
    else if (ymd === addDays(E, 49)) s = { name: '성령강림주일', color: 'red' };
    else s = { name: '성령강림 후 절기', color: 'green' };
    s.colorKo = LIT_COLORS[s.color].ko; s.hex = LIT_COLORS[s.color].hex;
    return s;
  }
  function nextChurchDay(ymd) {
    var y = +ymd.slice(0, 4), all = churchDays(y).concat(churchDays(y + 1));
    for (var i = 0; i < all.length; i++) if (all[i].date >= ymd) return { date: all[i].date, name: all[i].name, days: dayDiff(ymd, all[i].date) };
    return null;
  }

  // ------------------------------------------------------------ 물리
  function gravity(lat, elev) {   // 국제 중력식(1967) + 높이 보정, m/s²
    var s1 = Math.sin(lat * RAD), s2 = Math.sin(2 * lat * RAD);
    return 9.780327 * (1 + 0.0053024 * s1 * s1 - 0.0000058 * s2 * s2) - 3.086e-6 * (elev || 0);
  }
  function satVapor(tC) { return 6.1078 * Math.pow(10, 7.5 * tC / (tC + 237.3)); }   // hPa (Magnus-Tetens)
  function airDensity(tC, pHpa, rh) {   // kg/m³ — 습한 공기는 조금 가볍다
    var pv = clamp(rh == null ? 60 : rh, 0, 100) / 100 * satVapor(tC), pd = (pHpa || 1013.25) - pv, T = tC + 273.15;
    return (pd * 100) / (287.058 * T) + (pv * 100) / (461.495 * T);
  }
  function soundSpeed(tC) { return 331.3 * Math.sqrt(1 + tC / 273.15); }
  function dewPoint(tC, rh) { var b = 17.62, c = 243.12, g = Math.log(clamp(rh, 1, 100) / 100) + b * tC / (c + tC); return c * g / (b - g); }
  // 빗방울: 비의 세기(mm/h) → 가운데 지름(Marshall-Palmer, D0 = 0.89 R^0.21 mm) → 끝 속도(Atlas: 9.65 - 10.3e^-0.6D m/s)
  function rainDrop(mmPerHour) {
    var R = Math.max(0.1, mmPerHour || 0.5), D = 0.89 * Math.pow(R, 0.21);
    return { diameter: D, speed: Math.max(1, 9.65 - 10.3 * Math.exp(-0.6 * D)) };
  }
  function snowFlake(tC) { return { speed: tC > 0 ? 1.6 : tC > -5 ? 1.1 : 0.8 }; }   // 젖은 눈은 무겁고 빨리, 마른 눈은 천천히 (m/s)
  function fallAngle(windMs, fallMs) { return Math.atan2(windMs || 0, Math.max(0.3, fallMs)) * DEG; }
  function windPressure(rho, windMs) { return 0.5 * rho * windMs * windMs; }   // 동압 Pa — 나무가 기우는 정도
  // 보퍼트 풍력 계급
  var BEAUFORT = [[0.3, '고요'], [1.6, '실바람'], [3.4, '남실바람'], [5.5, '산들바람'], [8.0, '건들바람'], [10.8, '흔들바람'], [13.9, '된바람'],
    [17.2, '센바람'], [20.8, '큰바람'], [24.5, '큰센바람'], [28.5, '노대바람'], [32.7, '왕바람'], [1e9, '싹쓸바람']];
  function beaufort(ms) { for (var i = 0; i < BEAUFORT.length; i++) if (ms < BEAUFORT[i][0]) return { force: i, name: BEAUFORT[i][1] }; return { force: 12, name: '싹쓸바람' }; }
  function compass(deg) { return ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'][Math.round(norm360(deg) / 22.5) % 16]; }

  // ------------------------------------------------------------ 날씨 (Open-Meteo, 열쇠 없이) · 미세먼지
  var WX_TTL = 10 * 60000;
  var WMO = { 0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '서리 안개', 51: '이슬비', 53: '이슬비', 55: '짙은 이슬비', 56: '어는 이슬비', 57: '어는 이슬비',
    61: '약한 비', 63: '비', 65: '강한 비', 66: '어는 비', 67: '어는 비', 71: '약한 눈', 73: '눈', 75: '강한 눈', 77: '싸락눈', 80: '소나기', 81: '소나기', 82: '강한 소나기',
    85: '눈 소나기', 86: '강한 눈 소나기', 95: '뇌우', 96: '우박 뇌우', 99: '강한 우박 뇌우' };
  function wxKind(code) {
    code = +code;
    if (code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    if (code >= 51) return 'rain';
    return 'cloudy';
  }
  function cacheGet(key) {
    try { var c = JSON.parse(root.sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < WX_TTL) return c.data; } catch (e) { /* 저장소 없음 */ }
    return null;
  }
  function cachePut(key, data) { try { root.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* 저장 못 해도 */ } }
  function fetchWeather(lat, lng) {
    var key = 'wc_wx:' + lat.toFixed(2) + ',' + lng.toFixed(2), hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4) +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=precipitation&past_hours=3&forecast_hours=1&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max&forecast_days=1&wind_speed_unit=ms&timezone=auto';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return null;
      var c = j.current, h = j.hourly || {}, d = j.daily || {};
      var recent = (h.precipitation || []).slice(0, 3).reduce(function (s, x) { return s + (x || 0); }, 0);
      var data = {
        temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, isDay: c.is_day !== 0,
        precip: c.precipitation || 0, rain: (c.rain || 0) + (c.showers || 0), snow: c.snowfall || 0, code: c.weather_code,
        cloud: c.cloud_cover, pressure: c.surface_pressure || c.pressure_msl, wind: c.wind_speed_10m || 0, windDir: c.wind_direction_10m || 0,
        gust: c.wind_gusts_10m || 0, recentRain: recent, tmax: d.temperature_2m_max && d.temperature_2m_max[0], tmin: d.temperature_2m_min && d.temperature_2m_min[0],
        daySum: d.precipitation_sum && d.precipitation_sum[0], uv: d.uv_index_max && d.uv_index_max[0], at: Date.now()
      };
      data.kind = wxKind(data.code); data.label = WMO[data.code] || '';
      cachePut(key, data);
      return data;
    }).catch(function () { return null; });
  }
  function fetchAir(lat, lng) {
    var key = 'wc_air:' + lat.toFixed(2) + ',' + lng.toFixed(2), hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    var u = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4) + '&current=pm10,pm2_5&timezone=auto';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return null;
      var data = { pm10: j.current.pm10, pm25: j.current.pm2_5 };
      data.grade = airGrade(data.pm10, data.pm25);
      cachePut(key, data);
      return data;
    }).catch(function () { return null; });
  }
  // 환경부 예보 등급: PM10 30/80/150, PM2.5 15/35/75 — 둘 중 나쁜 쪽
  function airGrade(pm10, pm25) {
    function g(v, a, b, c) { return v == null ? 0 : v <= a ? 1 : v <= b ? 2 : v <= c ? 3 : 4; }
    var n = Math.max(g(pm10, 30, 80, 150), g(pm25, 15, 35, 75));
    return { level: n, name: ['', '좋음', '보통', '나쁨', '매우 나쁨'][n] };
  }

  // ------------------------------------------------------------ 한 번에: 지금 이 고장
  function snapshot(region, now, wx, air) {
    now = now || new Date();
    var r = region || REGIONS[0], tz = r.tz || 'Asia/Seoul';
    var lp = localParts(now, tz), sun = sunPosition(now, r.lat, r.lng), times = sunTimes(lp.ymd, r.lat, r.lng, tz);
    var morning = times.noon ? now < times.noon : lp.h < 12;
    var term = currentTerm(new Date(localMidnight(addDays(lp.ymd, 1), tz).getTime() - 1000), lp.ymd), hol = holidayOn(lp.ymd), lit = liturgicalSeason(lp.ymd);
    var y = lp.y, upcoming = holidays(y).concat(holidays(y + 1)).filter(function (h) { return h.date > lp.ymd; })[0];
    var tC = wx && wx.temp != null ? wx.temp : null, rho = airDensity(tC == null ? 15 : tC, wx && wx.pressure, wx && wx.humidity);
    var drop = rainDrop(wx && wx.rain), flake = snowFlake(tC == null ? 0 : tC);
    var falling = wx && (wx.kind === 'snow' ? flake.speed : drop.speed);
    return {
      region: r, now: now, local: lp, sun: sun, sunTimes: times, phase: skyPhase(sun.alt, morning), moon: moonInfo(now),
      term: term, season: seasonOf(term.lon, r.lat), holiday: hol, nextHoliday: upcoming, sunday: lp.dow === 0,
      liturgy: lit, nextChurchDay: nextChurchDay(lp.ymd), weather: wx || null, air: air || null,
      physics: {
        g: gravity(r.lat, r.elev), rho: rho, sound: soundSpeed(tC == null ? 15 : tC), dew: wx && wx.humidity != null && tC != null ? dewPoint(tC, wx.humidity) : null,
        rainSpeed: drop.speed, dropMm: drop.diameter, snowSpeed: flake.speed,
        fallAngle: wx ? fallAngle(wx.wind, falling || drop.speed) : 0, windQ: wx ? windPressure(rho, wx.wind) : 0,
        beaufort: beaufort(wx ? wx.wind : 0), windFrom: wx ? compass(wx.windDir) : '', shadow: sun.alt > 0.5 ? 1 / Math.tan(sun.alt * RAD) : null
      }
    };
  }
  function load(region, now) {
    var r = region || REGIONS[0];
    return Promise.all([fetchWeather(r.lat, r.lng), fetchAir(r.lat, r.lng)]).then(function (x) { return snapshot(r, now, x[0], x[1]); });
  }

  // ------------------------------------------------------------ 가상 세계에 미치는 영향 (회원에게 보이는 문장)
  function hm(d, tz) { if (!d) return '—'; var p = localParts(d, tz); return pad(p.h) + ':' + pad(p.mi); }
  function fx(n, k) { return (Math.round(n * Math.pow(10, k || 0)) / Math.pow(10, k || 0)).toFixed(k || 0); }
  function effects(S) {
    var out = [], tz = S.region.tz, w = S.weather, P = S.physics, t = S.sunTimes;
    function add(area, text) { out.push({ area: area, text: text }); }
    // 하늘
    if (S.phase === 'night') add('하늘', '해가 진 밤입니다. 집과 교회의 창에 불이 켜지고, ' + S.moon.name + '(밝기 ' + Math.round(S.moon.illum * 100) + '%)이 마당을 비춥니다.');
    else if (S.phase === 'dawn' || S.phase === 'sunrise') add('하늘', '해가 뜨는 때입니다(해돋이 ' + hm(t.sunrise, tz) + '). 동쪽 하늘부터 밝아집니다.');
    else if (S.phase === 'dusk' || S.phase === 'sunset') add('하늘', '해가 지는 때입니다(해넘이 ' + hm(t.sunset, tz) + '). 서쪽 하늘이 붉고 그림자가 길어집니다.');
    else add('하늘', '해가 ' + compass(S.sun.az) + '쪽 하늘 ' + fx(S.sun.alt) + '° 높이에 있습니다. 그림자 길이는 물건 높이의 ' + fx(P.shadow, 1) + '배입니다.');
    // 날씨
    if (w) {
      if (w.kind === 'rain' || w.kind === 'storm') {
        add('날씨', '비가 옵니다(' + fx(w.rain || w.precip, 1) + 'mm). 빗방울(지름 약 ' + fx(P.dropMm, 1) + 'mm)이 초속 ' + fx(P.rainSpeed, 1) + 'm로 떨어지고' + (w.wind >= 1 ? ', 바람에 ' + fx(P.fallAngle) + '° 기울어 내립니다.' : ' 곧게 내립니다.'));
        add('정원', '흙이 젖어 오늘은 물을 주지 않아도 식물이 자랍니다. 길에는 물웅덩이가 생깁니다.');
      } else if (w.kind === 'snow') {
        add('날씨', '눈이 내립니다. 눈송이가 초속 ' + fx(P.snowSpeed, 1) + 'm로 천천히 떨어지고' + (w.wind >= 1 ? ' 바람에 ' + fx(P.fallAngle) + '° 날립니다.' : ' 지붕과 나뭇가지에 쌓입니다.'));
      } else if (w.kind === 'fog') add('날씨', '안개가 끼어 먼 산과 이웃 마을이 흐리게 보입니다.');
      else if (w.kind === 'cloudy') add('날씨', '구름이 하늘의 ' + Math.round(w.cloud || 0) + '%를 덮어 빛이 부드럽고 그림자가 옅습니다.');
      else add('날씨', '맑습니다. 구름 ' + Math.round(w.cloud || 0) + '%.');
      if (w.recentRain > 0.2 && w.kind !== 'rain' && w.kind !== 'storm' && S.sun.alt > 0 && S.sun.alt < 42) add('날씨', '방금 비가 그쳤고 해가 낮아 해 반대편 하늘에 무지개가 설 수 있습니다.');
      // 기온
      if (w.temp <= 0) add('땅', '기온이 영하(' + fx(w.temp, 1) + '℃)라 연못이 얼고, 식물은 자라기를 쉽니다.');
      else if (w.temp >= 30) add('정원', '한낮 기온이 ' + fx(w.temp, 1) + '℃입니다. 식물이 시들지 않게 그늘과 물이 필요합니다.');
      else if (P.dew != null && w.temp - P.dew < 2.5 && S.phase !== 'day') add('정원', '기온이 이슬점(' + fx(P.dew, 1) + '℃)에 가까워 풀잎에 이슬이 맺힙니다.');
      // 바람
      if (w.wind >= 14) add('이웃', P.beaufort.name + '(초속 ' + fx(w.wind, 1) + 'm)이 붑니다. 차를 몰고 이웃에게 가는 길이 잠시 닫힙니다.');
      else if (w.wind >= 1) add('바람', P.windFrom + '쪽에서 ' + P.beaufort.name + '(초속 ' + fx(w.wind, 1) + 'm)이 불어 나무가 ' + (P.windQ > 30 ? '크게' : P.windQ > 8 ? '천천히' : '살짝') + ' 흔들립니다(바람 압력 ' + fx(P.windQ, 1) + 'Pa).');
    }
    if (S.air && S.air.grade.level >= 3) add('하늘', '미세먼지가 ' + S.air.grade.name + '입니다. 먼 산이 뿌옇게 보이고 마당 일은 짧게 합니다.');
    // 절기·계절
    add('계절', (S.term.today ? '오늘은 ' : '') + S.term.name + ' — ' + S.term.about + '. 다음 절기 ' + S.term.next + '까지 ' + S.term.daysToNext + '일. 정원의 꽃과 잎은 달력이 아니라 이 고장 기온 기록으로 바뀝니다.');
    // 공휴일·주일·교회력
    if (S.sunday) add('교회', '주일입니다. 교회 문이 열려 있고 예배 시간에는 종이 울립니다.');
    if (S.holiday.length) add('마을', '오늘은 ' + S.holiday.map(function (h) { return h.name; }).join(', ') + '입니다. 집에 머무는 이웃이 많아 방문 길이 붐빕니다.');
    add('교회', '교회력: ' + S.liturgy.name + '(' + S.liturgy.colorKo + '). 교회 휘장과 강단 천이 이 색을 따릅니다.' +
      (S.nextChurchDay ? ' 다음 절기 날: ' + S.nextChurchDay.name + (S.nextChurchDay.days ? '(' + S.nextChurchDay.days + '일 뒤)' : '(오늘)') + '.' : ''));
    // 물리
    add('물리', '이 위도의 중력은 ' + fx(P.g, 3) + 'm/s²입니다. 떨어뜨린 물건은 이 값으로 떨어지고, 공기 밀도 ' + fx(P.rho, 3) + 'kg/m³로 바람 힘을 셉니다.');
    return out;
  }

  var api = {
    REGIONS: REGIONS, regionById: regionById, nearestRegion: nearestRegion, localParts: localParts,
    sunPosition: sunPosition, sunTimes: sunTimes, skyPhase: skyPhase, moonInfo: moonInfo,
    solarLongitude: solarLongitude, newMoonJde: newMoonJde, solarTerms: solarTerms, currentTerm: currentTerm, seasonOf: seasonOf, SEASON_KO: SEASON_KO,
    lunarDates: lunarDates, holidays: holidays, holidayOn: holidayOn, EXTRA_HOLIDAYS: EXTRA_HOLIDAYS,
    easter: easter, churchDays: churchDays, liturgicalSeason: liturgicalSeason, nextChurchDay: nextChurchDay,
    gravity: gravity, airDensity: airDensity, soundSpeed: soundSpeed, dewPoint: dewPoint, rainDrop: rainDrop, snowFlake: snowFlake,
    fallAngle: fallAngle, windPressure: windPressure, beaufort: beaufort, compass: compass,
    fetchWeather: fetchWeather, fetchAir: fetchAir, airGrade: airGrade, wxKind: wxKind, WMO: WMO,
    snapshot: snapshot, load: load, effects: effects, julian: julian
  };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.WorldReality = api;
})(typeof window !== 'undefined' ? window : this);
