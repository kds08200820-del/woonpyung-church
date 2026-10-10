/* ============================================================
   게시된 주보(Supabase bulletins_public)를 BULLETINS 맨 앞에 더한다 (2026-10-10 목사님 지시)
   — 설교 매니저 '주보 넣기'나 주보 제작에서 게시하면, bulletins.js 를 손으로 고치지 않아도
     홈페이지(말씀·주보·홈 카드)·오늘의 예배·발표자 모드가 새 주보를 쓴다.
   · bulletins.js 바로 뒤에 불러온다. 정적 BULLETINS 에 없는 더 최근 날짜만 더한다(같은 날짜는 정적 것을 둔다).
   · 받아 오면 window 에 'bulletins:live' 이벤트를 보낸다 — 페이지를 열 때 한 번 그린 곳은 이 이벤트로 다시 그린다.
   · 공개 뷰라 헌금 금액은 없다. 모양은 bulletins.js 의 주보 객체와 같다(+ live: true).
   ============================================================ */
(function () {
  if (typeof BULLETINS === 'undefined' || !Array.isArray(BULLETINS)) return;
  var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch !== 'function') return;
  var latest = BULLETINS.length ? BULLETINS[0].date : '2000-01-01';

  function conv(r) {
    var d = r.data || {}, dt = String(r.bdate || '').slice(0, 10), m = dt.split('-'), off = d.offering || {};
    var news = String(d.notices || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
      var i = s.indexOf(':');
      return i > 0 && i < 30 ? { title: s.slice(0, i).trim(), detail: s.slice(i + 1).trim() } : { title: s, detail: '' };
    });
    var b = {
      date: dt, dateLabel: m[0] + '. ' + m[1] + '. ' + m[2], month: m[0] + '-' + m[1], monthLabel: m[0] + '년 ' + Number(m[1]) + '월',
      week: d.week || '', title: r.title || '', scripture: r.scripture || '', preacher: r.preacher || '', quote: d.headline || '',
      order: (d.order || []).filter(function (o) { return o && !o.spacer && o.name; }).map(function (o) { return o.name + (o.detail ? ' · ' + o.detail : ''); }),
      wed: [d.wed_series, d.wed_title, d.wed_dateline].filter(Boolean).join(' · '),
      dawn: d.dawn || '', qt: d.qt || '',
      news: news,
      offering: Object.keys(off).filter(function (k) { return off[k]; }).map(function (k) { return { cat: k, names: off[k] }; }),
      live: true
    };
    if (d.column_title || d.column_body) b.book = { title: d.column_title || '', author: '', publisher: '', text: d.column_body || '' };
    if (d.summary && ((d.summary.points || []).length || d.summary.apply)) b.summary = d.summary;
    return b;
  }

  window.BULLETINS_LIVE = fetch(url.replace(/\/$/, '') + '/rest/v1/bulletins_public?select=bdate,title,scripture,preacher,data&bdate=gt.' + latest + '&order=bdate.desc&limit=4',
    { headers: { apikey: key, Authorization: 'Bearer ' + key } })
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (rows) {
      var add = (rows || []).filter(function (r) { return r && r.bdate; }).map(conv)
        .filter(function (b) { return !BULLETINS.some(function (x) { return x.date === b.date; }); })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (!add.length) return 0;
      BULLETINS.unshift.apply(BULLETINS, add);
      try { window.dispatchEvent(new CustomEvent('bulletins:live', { detail: { added: add.length } })); } catch (e) { }
      return add.length;
    })
    .catch(function () { return 0; });
})();
