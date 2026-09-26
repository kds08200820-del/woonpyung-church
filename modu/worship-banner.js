/* 2026 모두의 성경 — 예배 안내 띠 (홈페이지 히어로의 '오늘의 예배' 흐름을 본문 화면 위에 작은 띠로)
   · 주일: 오전 6시부터 '오늘은 주일입니다', 예배 1시간 전부터 '곧 예배가 시작됩니다' + 남은 시간
   · 수요기도회·새벽기도회: 30분 전부터 '곧 예배가 시작됩니다' + 남은 시간 — 그날 예배가 있을 때만(달력 worship_schedule)
   · 예배 10분 전 ~ 끝난 뒤 10분: '오늘의 예배 열기' → 홈페이지 첫 화면(정회원은 거기서 순서대로 본다)
   미리 보기: ?worship=countdown | countdown-wed | countdown-dawn */
(function(){
  'use strict';
  var M = window.MODU || {};
  var PAD = 10;
  var SCHED = [
    { kind:'dawn',   label:'새벽기도회', time:'새벽 4:30',  days:[1,2,3,4,5,6], from:4*60+30, to:6*60,     lead:30,  cal:'새벽기도' },
    { kind:'wed',    label:'수요기도회', time:'오전 11:00', days:[3],           from:11*60,   to:12*60,    lead:30,  cal:'수요기도회' },
    { kind:'sunday', label:'주일 예배',  time:'오전 9:20',  days:[0],           from:9*60+20, to:12*60+30, lead:200, cal:'' }   /* 주일은 6:00 부터(=200분 전) */
  ];
  function kst(){ return new Date(Date.now() + (9*60 + new Date().getTimezoneOffset())*60000); }
  function ymd(d){ return d.toISOString().slice(0,10); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function hasSermon(date, service){
    if(!service) return Promise.resolve(true);
    if(!(M.supabaseUrl && M.anonKey)) return Promise.resolve(false);
    var u = M.supabaseUrl.replace(/\/$/, '') + '/rest/v1/worship_schedule?select=sermon_date&sermon_date=eq.' + date + '&service=eq.' + encodeURIComponent(service) + '&limit=1';
    return fetch(u, { headers:{ apikey:M.anonKey, Authorization:'Bearer ' + M.anonKey } })
      .then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){ return !!(rows && rows.length); }).catch(function(){ return false; });
  }
  var fm = location.search.match(/[?&]worship=(countdown(?:-wed|-dawn)?)/);
  var preview = fm ? (fm[1] === 'countdown-wed' ? 'wed' : fm[1] === 'countdown-dawn' ? 'dawn' : 'sunday') : '';
  var okCache = {};                                            /* '날짜|예배' → true/false (달력 확인은 하루 한 번) */

  var bar = null;
  function ensure(){
    if(bar) return bar;
    var view = document.getElementById('v-read'), head = view && view.querySelector('.vhead');
    if(!head) return null;
    bar = document.createElement('a'); bar.id = 'moWorship'; bar.className = 'mo-worship'; bar.hidden = true;
    bar.innerHTML = '<span class="mw-t"></span><span class="mw-c"></span><span class="mw-go">›</span>';
    head.parentNode.insertBefore(bar, head.nextSibling);
    return bar;
  }
  function show(title, count, href, state){
    var b = ensure(); if(!b) return;
    b.querySelector('.mw-t').textContent = title;
    b.querySelector('.mw-c').textContent = count || '';
    b.href = href; b.hidden = false; b.dataset.state = state;
  }
  function hide(){ if(bar) bar.hidden = true; }

  function tick(){
    var n = kst(), dow = n.getUTCDay(), date = ymd(n), sec = n.getUTCHours()*3600 + n.getUTCMinutes()*60 + n.getUTCSeconds();
    var pick = null, sc, i;
    for(i = 0; i < SCHED.length; i++){
      sc = SCHED[i];
      if(preview){ if(sc.kind === preview){ pick = { sc:sc, left: 25*60, live:false }; break; } continue; }
      if(sc.days.indexOf(dow) < 0) continue;
      var left = sc.from*60 - sec;
      if(sec >= (sc.from - PAD)*60 && sec <= (sc.to + PAD)*60){ pick = { sc:sc, left:left, live:true }; break; }
      if(left > PAD*60 && left <= sc.lead*60){ pick = { sc:sc, left:left, live:false }; break; }
    }
    if(!pick){ hide(); return; }
    sc = pick.sc;
    var key = date + '|' + sc.cal;
    if(!preview && sc.cal){
      if(okCache[key] === undefined){ okCache[key] = null; hasSermon(date, sc.cal).then(function(ok){ okCache[key] = ok; tick(); }); }
      if(!okCache[key]){ hide(); return; }
    }
    var href = '../index.html?worship=' + sc.kind;
    if(pick.live){ show('오늘의 예배 · ' + sc.label, '열기', href, 'live'); return; }
    var l = pick.left, soon = sc.kind !== 'sunday' || l <= 3600;
    if(!soon){ show('오늘은 주일입니다', sc.label + ' ' + sc.time, href, 'day'); return; }
    var h = Math.floor(l/3600), m = Math.floor(l%3600/60), s = l%60;
    show('곧 ' + sc.label + '가 시작됩니다', (h ? h + ':' : '') + pad(m) + ':' + pad(s), href, 'soon');
  }
  function start(){ if(!ensure()){ setTimeout(start, 500); return; } tick(); setInterval(tick, 1000); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
