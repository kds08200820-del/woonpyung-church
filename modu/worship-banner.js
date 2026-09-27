/* 2026 모두의 성경 — 예배 안내 띠 (홈페이지 히어로의 '오늘의 예배' 흐름을 본문 화면 위에 작은 띠로)
   · 주일 1부: 오전 6시부터 '오늘은 주일입니다', 1시간 전부터 '곧 1부 예배가 시작됩니다' + 남은 시간 / 2부: 10:30부터 (1부에 들어간 기기는 제외)
   · 수요기도회·새벽기도회: 30분 전부터 '곧 예배가 시작됩니다' + 남은 시간 — 그날 예배가 있을 때만(달력 worship_schedule)
   · 예배 10분 전 ~ 끝난 뒤 10분: '오늘의 예배 열기' → 홈페이지 첫 화면(정회원은 거기서 순서대로 본다)
   미리 보기: ?worship=countdown | countdown-wed | countdown-dawn */
(function(){
  'use strict';
  var M = window.MODU || {};
  var PAD = 10;
  var SCHED = [
    { kind:'dawn',   label:'새벽기도회', time:'새벽 4:30',  days:[1,2,3,4,5,6], from:4*60+30, to:6*60,     lead:30,  cal:'새벽기도' },
    { kind:'wed',    label:'수요기도회', time:'오전 11:00', days:[3],           from:11*60,   to:12*60,    lead:60,  cal:'수요기도회' },   /* 1시간 전부터 */
    { kind:'sunday', part:1, label:'주일 1부 예배', time:'오전 9:20',  days:[0], from:9*60+20, to:10*60+40, lead:200, cal:'' },   /* 주일은 6:00 부터(=200분 전) */
    { kind:'sunday', part:2, label:'주일 2부 예배', time:'오전 11:00', days:[0], from:11*60,   to:12*60+30, lead:30,  cal:'' }    /* 1부에 들어간 사람에겐 2부 카운트 없음 */
  ];
  function kst(){ return new Date(Date.now() + 9*3600000); }   /* getUTC* 가 한국 시각이 되도록 9시간을 더한다 */
  function ymd(d){ return d.toISOString().slice(0,10); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function hasSermon(date, service){
    if(!service) return Promise.resolve(true);
    if(!(M.supabaseUrl && M.anonKey)) return Promise.resolve(false);
    var u = M.supabaseUrl.replace(/\/$/, '') + '/rest/v1/worship_schedule?select=sermon_date&sermon_date=eq.' + date + '&service=eq.' + encodeURIComponent(service) + '&limit=1';
    return fetch(u, { headers:{ apikey:M.anonKey, Authorization:'Bearer ' + M.anonKey } })
      .then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){ return !!(rows && rows.length); }).catch(function(){ return false; });
  }
  var fm = location.search.match(/[?&]worship=(countdown(?:-wed|-dawn|-2)?)/);
  var preview = fm ? (fm[1] === 'countdown-wed' ? 'wed' : fm[1] === 'countdown-dawn' ? 'dawn' : fm[1] === 'countdown-2' ? 'sunday2' : 'sunday1') : '';
  function joined(date){ try { return localStorage.getItem('ws_joined_' + date); } catch(e){ return null; } }   /* 홈페이지와 같은 열쇠(같은 도메인) */
  var okCache = {};
  var comb = null;                                             /* 이번 주일 통합예배(1부 없음)? null = 아직 모름 — 주일에만 주보(../js/bulletins.js)를 읽어 판단 */
  function loadCombined(date){
    if(comb !== null) return;
    comb = false;                                              /* 읽는 동안 기본값 */
    fetch('../js/bulletins.js?d=' + date).then(function(r){ return r.ok ? r.text() : ''; }).then(function(t){
      var i = t.indexOf('date: "' + date + '"'); if(i < 0) return;
      var j = t.indexOf('\n    date: "', i + 10); var blk = t.slice(i, j > 0 ? j : i + 20000);
      var m = blk.match(/combined:\s*(true|false)/);
      comb = m ? m[1] === 'true' : /통합\s*예배/.test(blk);
      apply(); tick();
    }).catch(function(){});
  }
  function apply(){
    var p1 = SCHED[2], p2 = SCHED[3];
    p1.days = comb ? [] : [0];
    p2.single = !!comb; p2.label = comb ? '주일 예배' : '주일 2부 예배'; p2.lead = comb ? 200 : 30;
  }
  function pname(sc){ return sc.kind === 'sunday' && !sc.single && sc.part ? sc.part + '부 ' : ''; }                                            /* '날짜|예배' → true/false (달력 확인은 하루 한 번) */

  var bar = null;
  function ensure(){
    if(bar) return bar;
    var view = document.getElementById('v-read'), head = view && view.querySelector('.vhead');
    if(!head) return null;
    bar = document.createElement('a'); bar.id = 'moWorship'; bar.className = 'mo-worship'; bar.hidden = true;
    bar.innerHTML = '<span class="mw-t"></span><span class="mw-c"></span><span class="mw-go">›</span>';
    bar.addEventListener('click', function(){ var st = bar.dataset.state, pt = bar.dataset.part; if(st === 'live' && pt) try { localStorage.setItem('ws_joined_' + ymd(kst()), pt); } catch(e){} });
    head.parentNode.insertBefore(bar, head.nextSibling);
    return bar;
  }
  function show(title, count, href, state){
    if(!bar || bar.dataset.state !== state) ensure();
    var b = ensure(); if(!b) return;
    b.querySelector('.mw-t').textContent = title;
    b.querySelector('.mw-c').textContent = count || '';
    b.href = href; b.hidden = false; b.dataset.state = state; b.dataset.part = curPart;
  }
  function hide(){ if(bar) bar.hidden = true; }

  var curPart = '';
  function tick(){
    var n = kst(), dow = n.getUTCDay(), date = ymd(n), sec = n.getUTCHours()*3600 + n.getUTCMinutes()*60 + n.getUTCSeconds();
    var pick = null, sc, i;
    if(dow === 0 && !preview) loadCombined(date);
    var jn = joined(date);
    for(i = 0; i < SCHED.length; i++){
      sc = SCHED[i];
      if(preview){ if((sc.kind + (sc.part || '')) === preview){ pick = { sc:sc, left: 25*60, live:false }; break; } continue; }
      if(sc.days.indexOf(dow) < 0) continue;
      var left = sc.from*60 - sec;
      /* 주일 2부 카운트(10:30~10:50)는 1부 진행 중과 겹친다 — 1부에 들어가지 않은 사람에겐 2부 카운트가 먼저 */
      if(sc.kind === 'sunday' && sc.part === 1 && !jn && sc.days.length){ var p2 = SCHED[i+1]; var l2 = p2.from*60 - sec; if(l2 > PAD*60 && l2 <= p2.lead*60){ pick = { sc:p2, left:l2, live:false }; break; } }
      if(sec >= (sc.from - PAD)*60 && sec <= (sc.to + PAD)*60){ pick = { sc:sc, left:left, live:true }; break; }
      if(sc.kind === 'sunday' && sc.part === 2 && !sc.single && jn) continue;
      if(left > PAD*60 && left <= sc.lead*60){ pick = { sc:sc, left:left, live:false }; break; }
    }
    if(!pick){ hide(); return; }
    sc = pick.sc; curPart = sc.part ? String(sc.part) : '';
    var key = date + '|' + sc.cal;
    if(!preview && sc.cal){
      if(okCache[key] === undefined){ okCache[key] = null; hasSermon(date, sc.cal).then(function(ok){ okCache[key] = ok; tick(); }); }
      if(!okCache[key]){ hide(); return; }
    }
    var href = '../index.html?worship=' + sc.kind;
    if(pick.live){ show(sc.kind === 'sunday' ? pname(sc) + '예배가 진행 중입니다' : '오늘의 예배 · ' + sc.label, sc.kind === 'sunday' ? pname(sc) + '예배 참여하기' : '열기', href, 'live'); return; }
    var l = pick.left, soon = !(sc.kind === 'sunday' && (sc.part === 1 || sc.single)) || l <= 3600;
    if(!soon){ show('오늘은 주일입니다', sc.label + ' ' + sc.time, href, 'day'); return; }
    var h = Math.floor(l/3600), m = Math.floor(l%3600/60), s = l%60;
    show('곧 ' + (sc.kind === 'sunday' ? pname(sc) + '예배' : sc.label) + '가 시작됩니다', (h ? h + ':' : '') + pad(m) + ':' + pad(s), href, 'soon');
  }
  function start(){ if(!ensure()){ setTimeout(start, 500); return; } tick(); setInterval(tick, 1000); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
