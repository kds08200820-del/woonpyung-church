/* ============================================================
   신앙 정원 — 문구표 (i18n)
   · 사용자에게 보이는 모든 문구는 여기(마크업·다른 js 에 한글 리터럴 없음)
   · t(key, vars) / setLocale(locale, timezone) / fmtNum·fmtDate·fmtTime(Intl, 교회 locale·timezone)
   · apply(root): data-i18n / data-i18n-aria / data-i18n-ph / data-i18n-title 속성을 채운다
   · db: 백엔드(attend_hero·worship_schedule·주보)가 쓰는 고정값 — 번역 대상이 아님
   ============================================================ */
window.GardenI18n = (function () {
  'use strict';
  var KO = {
    'page.title': '내 정원 | 운평장로교회',
    'brand': '신앙 정원',
    'common.close': '닫기',
    'demo.name': '해바라기',

    'study.title': '서재',
    'study.dashboard': '대시보드',
    'study.audiobook': '오디오북 듣기',
    'rail.title': '오늘',
    'rail.streak': '큐티 {n}일 연속',
    'rail.offline': '오프라인 · 마지막 상태',
    'rail.loading': '정원을 불러오는 중…',
    'talent.unit': '달란트',
    'talent.open': '창고 열기',

    'growth.title': '내 식물',
    'growth.xp': '{cur} / {next} XP',
    'growth.done': '거둔 열매 {n}그루',
    'growth.first': '첫 그루를 키우는 중',

    'todo.title': '오늘의 할 일',
    'todo.count': '{done}/{total}',
    'todo.empty': '오늘 할 일이 아직 없습니다 — 교회 규칙이 정해지면 여기에 보입니다',
    'todo.done': '완료',
    'todo.login.done': '오늘 정원에 들렀어요',
    'todo.login.todo': '동기화되면 자동으로 적립됩니다',
    'todo.worship.none': '지금은 진행 중인 예배가 없습니다',

    'kind.login': '정원 들르기',
    'kind.qt_amen': '큐티 아멘',
    'kind.streak_qt_7': '큐티 7일 연속',
    'kind.bible_day': '성경 읽기',
    'kind.worship_sunday': '주일 예배 출석',
    'kind.worship_weekday': '주중 예배 출석',
    'kind.audiobook_chapter': '오디오북 한 장',
    'kind.heart_given': '성장기 하트',
    'kind.post': '나눔터 글',
    'kind.comment': '댓글',
    'kind.reaction': '공감',
    'kind.album_like': '앨범 좋아요',
    'kind.form_entry': '행사 신청',
    'kind.modu_day': '모두의 성경',
    'kind.plant_done': '열매 거두기',
    'kind.weather_rain': '비 오는 날',

    'stage.0': '씨앗',
    'stage.1': '싹',
    'stage.2': '어린 나무',
    'stage.3': '자란 나무',
    'stage.4': '꽃',
    'stage.5': '열매',

    'species.sunflower': '해바라기',
    'species.sunflower.desc': '해를 따라 고개를 드는 밝은 꽃',
    'species.olive': '올리브나무',
    'species.olive.desc': '평화와 기름부음의 나무',
    'species.fig': '무화과나무',
    'species.fig.desc': '때가 되면 열매를 맺는 나무',
    'species.grape': '포도나무',
    'species.mustard': '겨자나무',
    'species.lily': '백합',

    'wx.clear': '맑음',
    'wx.cloudy': '흐림',
    'wx.fog': '안개',
    'wx.rain': '비',
    'wx.snow': '눈',
    'wx.label': '지금 날씨 {w} {temp}도',

    'qt.title': '오늘의 큐티',
    'qt.badge.today': '오늘의 큐티',
    'qt.badge.recent': '최근 큐티',
    'qt.read': '묵상 읽기',
    'qt.listen': '오늘의 말씀 듣기',
    'qt.loading': '오늘의 말씀을 불러오는 중…',
    'qt.none': '아직 등록된 큐티가 없습니다',
    'qt.amen.done': '✓ 오늘 아멘했어요',
    'qt.meditation': '묵상',
    'qt.prayer': '기도',

    'amen.label': '기도문까지 읽고, 오늘의 큐티에 아멘 합니다',
    'amen.done': '✓ 오늘의 큐티를 마치고 아멘 하셨습니다',
    'amen.rank': '✓ 오늘 {n}번째 아멘! 은혜 충만한 하루 되세요',
    'amen.saved': '아멘! 정원에 적립됩니다',
    'amen.err.table': '아멘 저장 표가 아직 없습니다 — 관리자에게 알려 주세요',
    'amen.err.save': '저장하지 못했습니다. 다시 시도해 주세요',

    'store.title': '창고',
    'store.sub': '활동으로 모은 달란트와 자람 기록',
    'store.more': '더 보기',
    'store.loading': '불러오는 중…',
    'store.empty': '아직 기록이 없습니다 — 큐티 아멘으로 시작해 보세요',
    'store.total': '전체 {n}건 중 {shown}건',
    'store.notready': '창고가 아직 준비되지 않았습니다',
    'store.err': '기록을 불러오지 못했습니다',

    'onboard.title': '첫 심기',
    'onboard.step': '{n} / {total}',
    'onboard.step1.title': '정원에서 부를 이름',
    'onboard.step2.title': '씨앗 고르기',
    'onboard.nick.label': '닉네임',
    'onboard.nick.ph': '정원에서 보일 이름 (20자까지)',
    'onboard.avatar.label': '내 모습',
    'onboard.avatar.a': '첫째 모습',
    'onboard.avatar.b': '둘째 모습',
    'onboard.avatar.c': '셋째 모습',
    'onboard.avatar.n': '{n}번째 모습',
    'onboard.avatar.pastor': '목사님 모습',
    'profile.open': '내 모습 바꾸기',
    'profile.title': '내 모습 바꾸기',
    'profile.save': '저장',
    'profile.saving': '저장하는 중…',
    'profile.done': '모습을 바꿨습니다',
    'onboard.next': '다음',
    'onboard.back': '이전',
    'onboard.seed.label': '씨앗',
    'onboard.name.label': '식물 이름',
    'onboard.name.ph': '12자까지',
    'onboard.plant': '심기',
    'onboard.planting': '심는 중…',
    'onboard.done': '{name}을(를) 심었어요. 활동할수록 자랍니다',
    'onboard.err.nick': '이름을 1~20자로 적어 주세요',
    'onboard.err.notready': '정원 서버가 아직 준비되지 않았습니다',
    'onboard.err.save': '심지 못했습니다. 다시 시도해 주세요',

    'svc.dawn': '새벽기도회',
    'svc.dawn.time': '새벽 4:30',
    'svc.wed': '수요기도회',
    'svc.wed.time': '오전 11:00',
    'svc.sun1': '주일 1부 예배',
    'svc.sun1.time': '오전 9:20',
    'svc.sun2': '주일 2부 예배',
    'svc.sun2.time': '오전 11:00',
    'svc.sun': '주일 예배',
    'svc.part': '{n}부',
    'svc.word': '예배',
    'banner.live.sun': '{part}예배가 진행 중입니다',
    'banner.live': '오늘의 예배 · {label}',
    'banner.join.sun': '{part}예배 참여하기',
    'banner.open': '열기',
    'banner.sunday': '오늘은 주일입니다',
    'banner.soon': '곧 {label}가 시작됩니다',
    'attend.login': '로그인하면 출석이 기록됩니다',
    'attend.ok': '출석했습니다 — {svc} · 정시',
    'attend.ok.late': '출석했습니다 — {svc} · {min}분 늦음',
    'attend.already': '오늘 {svc} 출석은 이미 되어 있습니다',
    'attend.member': '내 정보에서 교적을 연결하면 출석이 기록됩니다',
    'worship.err': '예배 화면을 불러오지 못했습니다',

    'bar.label': '정원 이동',
    'bar.mine': '내 정원',
    'bar.church': '우리 교회',
    'bar.world': '세계',
    'bar.about': '교회 소개',
    'bar.soon': '{what}은(는) 준비 중입니다',

    'gate.login.t': '로그인하면 내 정원이 열립니다',
    'gate.login.m': '큐티·성경 읽기·예배 출석이 쌓일수록 내 식물이 자랍니다',
    'gate.login.btn': '로그인',
    'gate.home': '교회 소개 보기',
    'gate.retry': '다시 시도',
    'gate.error.t': '정원을 불러오지 못했습니다',
    'gate.error.m': '인터넷 연결을 확인한 뒤 다시 시도해 주세요',
    'gate.notready.t': '정원을 준비하고 있습니다',
    'gate.notready.m': '곧 문을 엽니다. 조금만 기다려 주세요',
    'gate.signing.t': '로그인하는 중…',
    'gate.signing.m': '잠시만 기다려 주세요',
    'gate.noconfig': '서버 설정이 없습니다',

    'sync.first': '지난 기록 {n}건으로 +{xp} 자랐어요',
    'sync.harvest': '열매를 거뒀어요! 지금까지 {n}그루',
    'sync.stageup': '{name}이(가) {stage} 단계로 자랐어요'
  };
  /* 백엔드·주보가 쓰는 고정값(번역하지 않음) */
  var DB = { cal_dawn: '새벽기도', cal_wed: '수요기도회', svc_dawn: '새벽기도회', svc_wed: '수요기도회', svc_sun1: '주일 1부', svc_sun2: '주일 2부', svc_sun: '주일 예배', combined_re: '통합\\s*예배' };

  var DICT = { ko: KO };
  var cur = { locale: 'ko', timezone: 'Asia/Seoul' };
  function dict() { return DICT[cur.locale] || DICT[cur.locale.split('-')[0]] || KO; }
  function has(key) { return dict()[key] != null || KO[key] != null; }
  function t(key, vars) {
    var s = dict()[key]; if (s == null) s = KO[key]; if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? String(vars[k]) : ''; });
    return s;
  }
  function setLocale(locale, timezone) {
    if (locale) cur.locale = String(locale);
    if (timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); cur.timezone = timezone; } catch (e) { } }
  }
  function fmtNum(n) { try { return new Intl.NumberFormat(cur.locale).format(+n || 0); } catch (e) { return String(+n || 0); } }
  function fmtDate(d, opts) { try { return new Intl.DateTimeFormat(cur.locale, opts || { timeZone: cur.timezone, month: 'short', day: 'numeric' }).format(d); } catch (e) { return String(d); } }
  function fmtTime(d, opts) { try { return new Intl.DateTimeFormat(cur.locale, opts || { timeZone: cur.timezone, hour: 'numeric', minute: '2-digit' }).format(d); } catch (e) { return String(d); } }
  /* 교회 시간대의 yyyy-mm-dd */
  function dateStr(d) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: cur.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }
  function todayStr() { return dateStr(new Date()); }
  var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  /* 교회 시간대의 지금 — {y,m,d,hh,mm,ss,dow,date} */
  function nowParts(d) {
    d = d || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: cur.timezone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
      var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
      var hh = (+o.hour) % 24;
      return { y: +o.year, m: +o.month, d: +o.day, hh: hh, mm: +o.minute, ss: +o.second, dow: DOW[o.weekday] != null ? DOW[o.weekday] : d.getDay(), date: o.year + '-' + o.month + '-' + o.day };
    } catch (e) {
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(), mm: d.getMinutes(), ss: d.getSeconds(), dow: d.getDay(), date: d.toISOString().slice(0, 10) };
    }
  }
  function apply(root) {
    root = root || document;
    var each = function (sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); };
    each('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    each('[data-i18n-aria]', function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    each('[data-i18n-ph]', function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    each('[data-i18n-title]', function (el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  }
  return {
    t: t, has: has, setLocale: setLocale, locale: function () { return cur.locale; }, timezone: function () { return cur.timezone; },
    fmtNum: fmtNum, fmtDate: fmtDate, fmtTime: fmtTime, dateStr: dateStr, todayStr: todayStr, nowParts: nowParts, apply: apply, db: DB,
    add: function (locale, map) { DICT[locale] = DICT[locale] || {}; for (var k in map) DICT[locale][k] = map[k]; }
  };
})();
