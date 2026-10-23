/* ============================================================
   신앙 정원 — 주간 날씨 (2026-10-23 담임목사: "이번 주 주일에 태풍이 온다고 합니다. 일기예보를 미리 알아야 합니다.
     일기예보 데이터를 가져다 실시간 반영하고 주간 날씨를 볼 수 있도록")
   · 날씨 칩을 누르면 7일 예보(Open-Meteo, 1시간마다 새로) — 날씨·최고/최저·비 올 확률·비 양·바람·순간 바람
   · 바람·비가 기상청 주의보 기준을 넘는 날은 표시하고, 주일이면 맨 위에 안내(예배에 오실 때 안전)
   · 지역은 GardenRegion(내가 고른 곳 → 교적 주소 → 교회). 여기서 우편번호로 바꾸거나 되돌린다
   GardenWeather.init({ i18n, sdk, hud, region, place }) · open() · alerts() → Promise<[{day, text, sunday}]>
   ============================================================ */
window.GardenWeather = (function () {
  'use strict';
  var I, SDK, HUD, REG, place, t;
  var W = { rec: null };
  var ICON = { clear: 'wx-sun', cloudy: 'wx-cloud', fog: 'wx-fog', rain: 'wx-rain', snow: 'wx-snow' };
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kind(code) { return window.GardenScene ? window.GardenScene.weatherOf(code) : 'clear'; }
  function dayInfo(ds) { var p = String(ds).split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return { dow: d.getUTCDay(), md: (+p[1]) + '/' + (+p[2]) }; }

  // 기상청 특보 기준을 빌린 표시(하루 최댓값 기준): 강풍주의보 풍속 14m/s·순간 20m/s, 강풍경보 21m/s·순간 26m/s / 호우 하루 60mm·110mm
  function warns(d) {
    var out = [], lv = 0;
    if ((d.gust || 0) >= 26 || (d.wind || 0) >= 21) { out.push(t('wx.warn.wind2')); lv = 2; }
    else if ((d.gust || 0) >= 20 || (d.wind || 0) >= 14) { out.push(t('wx.warn.wind')); lv = Math.max(lv, 1); }
    if ((d.rain || 0) >= 110) { out.push(t('wx.warn.rain2')); lv = 2; }
    else if ((d.rain || 0) >= 60) { out.push(t('wx.warn.rain')); lv = Math.max(lv, 1); }
    if (kind(d.code) === 'snow' && (d.rain || 0) >= 5) { out.push(t('wx.warn.snow')); lv = Math.max(lv, 1); }
    return { list: out, level: lv };
  }
  function where() {
    var r = REG && REG.current(), p = (place && place()) || {};
    if (r) return { lat: r.lat, lng: r.lng, label: r.label, src: r.src };
    return { lat: p.lat, lng: p.lng, label: p.name || '', src: 'church' };
  }
  function rows() { var w = where(); return SDK.forecast ? SDK.forecast(w.lat, w.lng, I.timezone()) : Promise.resolve(null); }

  // 앞으로 7일 중 조심할 날 (안내 도우미가 쓴다)
  function alerts() {
    return rows().then(function (ds) {
      return (ds || []).map(function (d, i) {
        var w = warns(d), di = dayInfo(d.date); if (!w.list.length) return null;
        return { i: i, sunday: di.dow === 0, level: w.level, text: di.dow === 0 ? t('wx.alert.sun', { date: di.md, what: w.list.join('·') }) : t('wx.alert.day', { day: i === 0 ? t('wx.today') : DOW[di.dow] + '요일', date: di.md, what: w.list.join('·') }) };
      }).filter(Boolean);
    }, function () { return []; });
  }

  function draw() {
    var w = where(), box = $('gwBody');
    $('gwPlace').textContent = t('wx.week.sub', { place: w.label || '', src: t('wx.src.' + w.src) });
    $('gwReset').hidden = w.src !== 'user';
    box.innerHTML = '<p class="g-empty">' + esc(t('wx.loading')) + '</p>';
    rows().then(function (ds) {
      if (!W.rec) return;
      if (!ds || !ds.length) { box.innerHTML = '<p class="g-empty">' + esc(t('wx.err')) + '</p>'; return; }
      var alertsH = '', sunAlert = null, firstAlert = null;
      var li = ds.map(function (d, i) {
        var di = dayInfo(d.date), k = kind(d.code), wr = warns(d);
        if (wr.list.length) { var a = { di: di, i: i, list: wr.list }; if (!firstAlert) firstAlert = a; if (di.dow === 0 && !sunAlert) sunAlert = a; }
        var name = i === 0 ? t('wx.today') : DOW[di.dow];
        return '<li class="gw-day' + (di.dow === 0 ? ' is-sun' : '') + (i === 0 ? ' is-today' : '') + (wr.level ? ' is-warn' + wr.level : '') + '">' +
          '<span class="gw-d"><b>' + esc(name) + '</b><small>' + esc(di.md) + (di.dow === 0 && i !== 0 ? ' · ' + esc(t('wx.sun')) : '') + '</small></span>' +
          '<img class="gw-ic" alt="" src="images/garden/default/ui/' + ICON[k] + '.webp"><span class="gw-k">' + esc(t('wx.' + k)) + '</span>' +
          '<span class="gw-t"><b>' + Math.round(d.tmax) + '°</b> / ' + Math.round(d.tmin) + '°</span>' +
          '<span class="gw-r">' + esc(t('wx.rainp', { p: d.pop != null ? Math.round(d.pop) : '–' })) + (d.rain >= 0.5 ? ' · ' + esc(t('wx.mm', { n: Math.round(d.rain) })) : '') + '</span>' +
          '<span class="gw-w">' + esc(t('wx.wind', { n: Math.round(d.wind || 0) })) + (d.gust ? ' · ' + esc(t('wx.gust', { n: Math.round(d.gust) })) : '') + '</span>' +
          (wr.list.length ? '<span class="gw-warn">' + esc(wr.list.join(' · ')) + '</span>' : '') + '</li>';
      }).join('');
      var a = sunAlert || firstAlert;
      if (a) alertsH = '<p class="gw-alert' + (sunAlert ? ' is-sun' : '') + '" role="status">' + esc(sunAlert ? t('wx.alert.sun', { date: a.di.md, what: a.list.join('·') }) : t('wx.alert.day', { day: a.i === 0 ? t('wx.today') : DOW[a.di.dow] + '요일', date: a.di.md, what: a.list.join('·') })) + '</p>';
      box.innerHTML = alertsH + '<ul class="gw-days">' + li + '</ul><p class="g-wl-note gw-credit">' + esc(t('wx.credit')) + '</p>';
    }, function () { if (W.rec) box.innerHTML = '<p class="g-empty">' + esc(t('wx.err')) + '</p>'; });
  }
  function open() {
    if (W.rec) return;
    W.rec = HUD.openModal('gmWeather', { onClose: function () { W.rec = null; } });
    if (W.rec) draw();
  }
  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; REG = o.region; place = o.place; t = I.t;
    var chip = $('gWx'); if (chip) chip.addEventListener('click', open);
    if ($('gwPick')) $('gwPick').addEventListener('click', function () {
      var b = this; b.disabled = true;
      REG.pick({ title: t('wx.region.pick'), close: t('common.close') }).then(function (v) {
        b.disabled = false;
        if (v && v.fail) { HUD.toast(t('wx.region.fail')); return; }
        if (v) { HUD.toast(t('wx.region.saved', { place: v.label })); if (W.rec) draw(); }
      }, function () { b.disabled = false; HUD.toast(t('wx.region.fail')); });
    });
    if ($('gwReset')) $('gwReset').addEventListener('click', function () {
      REG.reset().then(function () { var w = where(); HUD.toast(t('wx.region.saved', { place: w.label })); if (W.rec) draw(); });
    });
  }
  return { init: init, open: open, alerts: alerts, warns: warns };
})();
