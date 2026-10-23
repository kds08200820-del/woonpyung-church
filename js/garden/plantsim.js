/* ============================================================
   신앙 정원 — 꽃집 식물의 하루하루 (2026-10-23)
   그 고장의 실제 일별 날씨(Open-Meteo: 최고·최저기온, 비, 햇빛 시간)와 내가 물 준 날로
   흙 속 물(물통 모형)을 하루씩 셈해 식물이 지금 어떤지 정한다. 서버는 수확 시기만 확인하고, 시듦·꽃 핌은 여기서 같은 자료로 늘 같게 나온다.
   · 물통: 뿌리 둘레 흙이 머금는 물 40mm. 비 + 물 주기(15mm)로 차고, 증발산(기온·햇빛 따라)으로 준다
   · 가뭄: 흙이 마른(8mm 아래) 날이 품목의 drought_days 를 넘으면 시든다
   · 과습: 큰비(20mm↑)나 흙이 꽉 찬 채 비 오는 날이 이어지면(wet: low 3일·mid 6일) 뿌리가 썩는다
   · 서리·추위: frost_kill 품목은 최저 −1℃ 이하에서, 모든 품목은 min_temp 아래에서 죽는다
   · 꽃: 꽃 피는 달에 피고, 사흘 내리 해가 6시간 넘게 나면 만개
   · 마음(XP): 심었다고 자라지 않는다. 자란 날 = least(심은 지 날수, 심은 뒤 쌓인 XP ÷ 하루치(10)) — 신앙생활이 곧 관심
     (날씨·물은 실제 날수로 셈하고, 자람·꽃·열매는 자란 날로 셈한다. 서버 garden_farm_harvest 와 같은 셈)
   GardenPlant.weather(lat, lng) → Promise<rows> · GardenPlant.state(item, tile, rows, waterDays, now, tz, xpDay)
   ============================================================ */
window.GardenPlant = (function () {
  'use strict';
  var CAP = 40, WATER_MM = 15;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymdOf(d, tz) {
    try { var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); return p; }
    catch (e) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  }
  function days(a, b) { return Math.floor((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000); }

  /* ── 날씨: 지난 92일 + 오늘 (하루 한 번 받아 둔다) ── */
  var memo = {};
  function weather(lat, lng, tz) {
    var today = ymdOf(new Date(), tz), key = 'gp_wx:' + (+lat).toFixed(2) + ',' + (+lng).toFixed(2);
    if (memo[key] && memo[key].day === today) return memo[key].p;
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { cached = null; }
    var p;
    if (cached && cached.day === today && cached.rows && cached.rows.length > 20) p = Promise.resolve(cached.rows);
    else {
      var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + (+lat).toFixed(4) + '&longitude=' + (+lng).toFixed(4) +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&past_days=92&forecast_days=1&timezone=' + encodeURIComponent(tz || 'auto');
      p = fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var d = j && j.daily; if (!d || !d.time) return (cached && cached.rows) || [];
        var rows = d.time.map(function (t, i) {
          return { date: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], prcp: d.precipitation_sum[i] || 0, sun: (d.sunshine_duration[i] || 0) / 3600 };
        }).filter(function (r) { return r.tmax != null && r.tmin != null && r.date <= today; });
        try { localStorage.setItem(key, JSON.stringify({ day: today, rows: rows })); } catch (e) { /* 저장 못 해도 */ }
        return rows;
      }).catch(function () { return (cached && cached.rows) || []; });
    }
    memo[key] = { day: today, p: p };
    return p;
  }

  /* ── 상태 ── */
  function inMonths(list, m) { return (list || []).indexOf(m) >= 0; }
  function state(item, tile, rows, waterDays, now, tz, xpDay) {
    var m = (item && item.model) || {}, type = m.type || (item && item.category === 'tree' ? 'tree' : 'annual');
    now = now || new Date();
    var today = ymdOf(now, tz), month = +today.slice(5, 7);
    var planted = tile && tile.item_at ? ymdOf(new Date(tile.item_at), tz) : today;
    var age = Math.max(0, days(planted, today));
    // 마음(XP)으로 자란 날 — tile.xp_since 가 없으면(옛 서버) 날수 그대로
    var xd = Math.max(1, +xpDay || 10), xp = tile && tile.xp_since != null ? +tile.xp_since : null;
    var grown = xp == null ? age : Math.min(age, Math.floor(xp / xd));
    var water = {}; (waterDays || []).forEach(function (d) { water[d] = 1; });
    var out = { age: age, grown: grown, xp: xp, xpDay: xd, needXp: 0, alive: true, cause: '', stage: 'grow', label: '', needWater: false, moisture: CAP, ready: false, full: false, bloom: false, dryDays: 0, wetDays: 0 };

    // 물통을 심은 날부터(최근 92일 안에서) 하루씩
    var mm = 30, dry = 0, wet = 0, lastWet = planted, sunRun = 0;
    var start = rows.length ? rows[0].date : today;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.date < planted) continue;
      var w = water[r.date] ? WATER_MM : 0;
      var mon = +r.date.slice(5, 7), dormant = (type === 'tree' || type === 'shrub' || type === 'perennial' || type === 'bulb') && (mon === 12 || mon <= 2);
      mm = Math.min(CAP, mm + r.prcp + w);
      if (r.prcp >= 5 || w) lastWet = r.date;
      var tmean = (r.tmax + r.tmin) / 2, sunFrac = Math.min(1, r.sun / 12);
      var et = (tmean > 0 ? 0.6 + 0.12 * Math.max(0, r.tmax) : 0.2) * (0.5 + 0.5 * sunFrac) * (dormant ? 0.3 : 1);
      mm = Math.max(0, mm - et);
      if (mm < 8) dry++; else if (mm > 14) dry = 0;
      if (r.prcp >= 20 || (mm >= CAP - 1 && r.prcp >= 5)) wet++; else if (r.prcp < 1) wet = Math.max(0, wet - 1);
      sunRun = r.sun >= 6 && r.prcp < 10 ? sunRun + 1 : 0;
      var drought = m.drought_days || 10, wetLimit = m.wet === 'low' ? 3 : m.wet === 'mid' ? 6 : 99;
      if (!out.cause && !dormant && dry > drought) out.cause = 'drought';
      if (!out.cause && wet >= wetLimit) out.cause = 'wet';
      if (!out.cause && m.frost_kill && r.tmin <= -1) out.cause = 'frost';
      if (!out.cause && m.min_temp != null && r.tmin < m.min_temp) out.cause = 'cold';
      if (out.cause) { out.alive = false; out.diedOn = r.date; break; }
    }
    out.moisture = Math.round(mm); out.dryDays = dry; out.wetDays = wet; out.simFrom = planted < start ? start : planted;
    var sinceWet = days(lastWet, today), every = m.water_every || 3;
    out.needWater = out.alive && sinceWet >= every && !((type !== 'annual') && (month === 12 || month <= 2));
    out.sinceWater = sinceWet;
    if (!out.alive) { out.stage = 'dead'; return out; }

    if (item.category === 'flower') {
      var firstBloom = m.first_bloom_days || 30;
      var bloomNow = inMonths(m.bloom_months, month) && grown >= firstBloom;
      if (inMonths(m.bloom_months, month) && age >= firstBloom && grown < firstBloom) out.needXp = Math.ceil(firstBloom * xd - xp);
      out.bloom = bloomNow; out.full = bloomNow && sunRun >= 3;
      var lastBloom = Math.max.apply(null, (m.bloom_months || [0]));
      if (type === 'annual' && grown > firstBloom && !bloomNow && month > lastBloom) { out.stage = 'done'; return out; }
      out.stage = bloomNow ? (out.full ? 'full' : 'bloom') : (grown < 14 ? 'sprout' : 'grow');
      return out;
    }
    if (type === 'tree') {
      var years = grown / 365.25, yf = m.years_to_fruit || 3;
      out.years = Math.floor(age / 365.25) + 1;
      if (years < yf) {
        if (age / 365.25 >= yf) out.needXp = Math.ceil(yf * 365.25) * xd - xp;
        out.stage = grown < 30 ? 'sapling' : 'young'; out.yearsLeft = Math.ceil(yf - years); return out;
      }
      out.stage = inMonths(m.harvest_months, month) ? 'fruit' : (month === 12 || month <= 2 ? 'rest' : 'grow');
      out.ready = out.stage === 'fruit';
      return out;
    }
    // 먹거리(한해살이)
    var fd = m.first_days || 60, wd = m.window_days || 30;
    if (age >= fd && grown < fd) out.needXp = Math.ceil(fd * xd - xp);
    if (grown < fd * 0.3) out.stage = 'sprout';
    else if (grown < fd) { out.stage = 'grow'; out.daysLeft = fd - grown; }
    else if (grown < fd + wd) { out.stage = 'harvest'; out.ready = true; }
    else out.stage = 'done';
    return out;
  }
  var CAUSE = { drought: '흙이 오래 말라 시들었습니다', wet: '비가 계속 와 뿌리가 썩었습니다', frost: '서리를 맞아 얼었습니다', cold: '견딜 수 있는 추위보다 추웠습니다' };
  return { weather: weather, state: state, ymd: ymdOf, CAUSE: CAUSE };
})();
