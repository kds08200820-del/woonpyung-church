/* ============================================================
   예배순서 보관함 (worship.html) — 달 단위 → 주차(주일 기준) → 날짜별 예배
   · 주일 예배: 그 주일 주보(js/bulletins.js)
   · 새벽기도회 화~금: 그날 QT(qt_published)의 본문
   · 수요기도회: 그 주 주보의 수요기도회 줄
   누르면 js/worship.js 의 보기 창(정회원 확인)이 열린다.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var W = window.WPCWorship; if (!W || !$('waMonths')) return;
  var DOWK = ['일', '월', '화', '수', '목', '금', '토'];
  var todayStr = W.today, cur = todayStr.slice(0, 7);         /* YYYY-MM */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(d, n) { return new Date(d.getTime() + n * 864e5); }
  function fromYmd(s) { var m = s.split('-'); return new Date(Date.UTC(+m[0], +m[1] - 1, +m[2])); }
  var WEEKN = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

  /* 달의 주일들 → 주차. 그 주일부터 토요일까지가 한 주 */
  function weeksOf(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), first = new Date(Date.UTC(y, m - 1, 1)), out = [];
    var d = first; while (d.getUTCDay() !== 0) d = addDays(d, 1);
    var i = 0;
    while (d.getUTCMonth() === m - 1) { out.push({ n: i + 1, sunday: ymd(d), days: [1, 2, 3, 4, 5, 6].map(function (k) { return ymd(addDays(d, k)); }) }); d = addDays(d, 7); i++; }
    return out;
  }
  function bulletinOf(date) { var L = W.bulletins(); for (var i = 0; i < L.length; i++) if (L[i].date === date) return L[i]; return null; }
  var qtByMonth = {};
  function loadQtMonth(ym) {
    if (qtByMonth[ym]) return Promise.resolve(qtByMonth[ym]);
    if (!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve((qtByMonth[ym] = {}));
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), from = ym + '-01', to = ymd(addDays(new Date(Date.UTC(y, m, 1)), 6));   /* 다음 달 첫 주 토요일까지 */
    var u = window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/qt_published?select=sermon_date,title,scripture&sermon_date=gte.' + from + '&sermon_date=lte.' + to + '&order=sermon_date.asc';
    return fetch(u, { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { var map = {}; (rows || []).forEach(function (r) { map[String(r.sermon_date).slice(0, 10)] = r; }); qtByMonth[ym] = map; return map; })
      .catch(function () { qtByMonth[ym] = {}; return {}; });
  }
  function dl(date) { var d = fromYmd(date); return (d.getUTCMonth() + 1) + '.' + d.getUTCDate() + ' (' + DOWK[d.getUTCDay()] + ')'; }

  function row(kind, date, label, title, sub, ok) {
    return '<button type="button" class="wa-row' + (ok ? '' : ' off') + (date === todayStr ? ' today' : '') + '" data-kind="' + kind + '" data-date="' + date + '"' + (ok ? '' : ' disabled') + '>' +
      '<span class="wa-date">' + esc(dl(date)) + '</span><span class="wa-kind">' + esc(label) + '</span>' +
      '<span class="wa-text"><b>' + esc(title || (ok ? '' : '자료 없음')) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
      (ok ? '<span class="wa-go">보기 →</span>' : '') + '</button>';
  }
  function render() {
    var box = $('waMonths'), y = +cur.slice(0, 4), m = +cur.slice(5, 7);
    $('waMonthLabel').textContent = y + '년 ' + m + '월';
    box.innerHTML = '<p class="wa-loading">불러오는 중…</p>';
    loadQtMonth(cur).then(function (qt) {
      var weeks = weeksOf(cur), h = '';
      weeks.forEach(function (w) {
        var b = bulletinOf(w.sunday), wed = b ? W.wedInfo(b) : null;
        h += '<section class="wa-week"><h3>' + m + '월 ' + WEEKN[w.n - 1] + ' 주 <small>' + esc(dl(w.sunday)) + ' ~ ' + esc(dl(w.days[5])) + '</small></h3>';
        h += row('sunday', w.sunday, '주일 예배', b ? b.title : '', b ? b.scripture + (b.preacher ? ' · ' + b.preacher : '') : '주보가 아직 없습니다', !!b);
        w.days.forEach(function (d, i) {
          var dow = i + 1;                                     /* 1=월 … 6=토 */
          if (dow >= 2 && dow <= 5) { var q = qt[d]; h += row('dawn', d, '새벽기도회', q ? (q.scripture || q.title) : '', q ? q.title : 'QT 본문이 없습니다', !!q); }
          if (dow === 3) h += row('wed', d, '수요기도회', wed ? (wed.title ? '«' + wed.title + '»' : wed.ref) : '', wed ? (wed.series ? wed.series + ' · ' : '') + wed.ref : '주보에 수요기도회 줄이 없습니다', !!wed);
        });
        h += '</section>';
      });
      box.innerHTML = h || '<p class="wa-loading">이 달에는 주일이 없습니다.</p>';
      var t = box.querySelector('.wa-row.today'); if (t && cur === todayStr.slice(0, 7)) { try { t.scrollIntoView({ block: 'center' }); } catch (e) {} }
    });
  }
  function shift(n) {
    var y = +cur.slice(0, 4), m = +cur.slice(5, 7) + n;
    while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
    cur = y + '-' + pad(m); render();
  }
  $('waPrev').onclick = function () { shift(-1); };
  $('waNext').onclick = function () { shift(1); };
  $('waToday').onclick = function () { cur = todayStr.slice(0, 7); render(); };
  $('waMonths').addEventListener('click', function (e) {
    var r = e.target.closest('.wa-row'); if (!r || r.disabled) return;
    var kind = r.dataset.kind, date = r.dataset.date;
    var sunday = kind === 'sunday' ? date : ymd(addDays(fromYmd(date), -fromYmd(date).getUTCDay()));
    W.open(kind, { date: date, bulletin: bulletinOf(sunday) });
  });
  render();
})();
