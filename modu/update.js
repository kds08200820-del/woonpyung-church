/* 원격 업데이트 화면 — 인증이 끝난 뒤 조용히 확인해 새 판이 있으면 알린다(안 해도 쓰는 데 지장 없음).
   도구 막대·설정의 [최신 업데이트 확인]을 누르면 확인 뒤 최신이면 안내, 새 판이면 곧바로 내려받는다.
   화면은 설치 마법사 꼴: 왼쪽에 단계(새 판 확인 → 내려받기 → 설치), 오른쪽에 내용, 아래에 단추 줄. */
var UPD = (function(){
  var $ = APP.$, esc = APP.esc, U = window.UPDATE || null;
  var ov = null, info = null, busy = false, prog = { t0:0, last:0, lastGot:0, speed:0 };
  var STEPS = [['check', '새 판 확인'], ['download', '내려받기'], ['install', '설치']];
  function fmtMB(n){ return n ? (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1) + ' MB' : ''; }
  function fmtSec(s){ if(!isFinite(s) || s < 0) return ''; s = Math.round(s); return s < 60 ? s + '초' : Math.floor(s / 60) + '분 ' + (s % 60) + '초'; }
  function el(){
    if(ov) return ov;
    ov = document.createElement('div'); ov.className = 'upd-ov'; ov.hidden = true;
    ov.innerHTML =
      '<div class="upd-win" role="dialog" aria-modal="true" aria-labelledby="updTitle">' +
        '<div class="upd-side">' +
          '<div class="upd-brand"><img src="../build/icon.png" alt=""><div><b>' + esc((window.APPINFO && APPINFO.title) || '설교자의 성경') + '</b><span>업데이트</span></div></div>' +
          '<ol class="upd-steps" id="updSteps">' + STEPS.map(function(s, i){ return '<li data-step="' + s[0] + '"><i>' + (i + 1) + '</i><span>' + s[1] + '</span></li>'; }).join('') + '</ol>' +
          '<div class="upd-sidefoot">메모·형광펜·설정·인증은<br>업데이트 뒤에도 그대로 남습니다</div>' +
        '</div>' +
        '<div class="upd-main">' +
          '<div class="upd-head"><h2 id="updTitle">업데이트</h2><div class="upd-sub" id="updSub"></div></div>' +
          '<div class="upd-body" id="updBody"></div>' +
          '<div class="upd-prog" id="updProg" hidden><div class="upd-bar"><div class="upd-fill" id="updFill"></div></div><div class="upd-progrow"><span id="updPct">0%</span><span id="updMsg"></span></div></div>' +
          '<div class="upd-msg" id="updNote"></div>' +
          '<div class="upd-foot"><div class="upd-footl" id="updFootL"></div><div class="upd-btns" id="updBtns"></div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !ov.hidden && !busy) hide(); });
    return ov;
  }
  function setStep(name, doneAll){
    var seen = false;
    [].forEach.call($('updSteps').children, function(li){
      var k = li.dataset.step;
      li.classList.remove('on', 'done');
      if(doneAll){ li.classList.add('done'); return; }
      if(k === name){ li.classList.add('on'); seen = true; }
      else if(!seen) li.classList.add('done');
    });
  }
  /* 창을 그린다: 단계·제목·부제·본문·단추. 진행 막대는 download 에서만 켠다 */
  function show(o){
    el(); ov.hidden = false; document.body.classList.add('modal-open');
    setStep(o.step, o.doneAll);
    $('updTitle').textContent = o.title; $('updSub').textContent = o.sub || '';
    $('updBody').innerHTML = o.body || '';
    $('updProg').hidden = !o.progress; $('updNote').textContent = o.note || ''; $('updNote').className = 'upd-msg' + (o.bad ? ' bad' : '');
    $('updFootL').textContent = o.footl || '';
    var bx = $('updBtns'); bx.innerHTML = '';
    (o.btns || []).forEach(function(b){ var x = document.createElement('button'); x.type = 'button'; x.className = 'btn upd-btn' + (b.primary ? ' primary' : ''); x.textContent = b.t; x.onclick = b.fn; if(b.disabled) x.disabled = true; bx.appendChild(x); });
    setTimeout(function(){ var p = bx.querySelector('.primary') || bx.firstChild; if(p) p.focus(); }, 0);
  }
  function hide(){ if(ov){ ov.hidden = true; document.body.classList.remove('modal-open'); } }
  function verLine(rel){
    return '<div class="upd-verrow"><span class="upd-ver">' + esc(rel.version) + '</span><span class="upd-tag">새 판</span>' +
           '<span class="upd-meta">지금 쓰는 판 ' + esc(info && info.cur || '') + (rel.size ? ' · 내려받기 ' + fmtMB(rel.size) : '') + (rel.date ? ' · ' + esc(String(rel.date).slice(0, 10)) : '') + '</span></div>';
  }
  function notes(rel){
    var n = String(rel.notes || '').trim();
    if(!n) return '';
    var items = n.split(/\n+|\s·\s/).map(function(s){ return s.trim(); }).filter(Boolean);
    return '<div class="upd-notes"><div class="upd-noteh">바뀐 점</div><ul>' + items.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
  }
  /* 새 판 안내 → 내려받기 → 다시 시작 */
  function offer(auto){
    var rel = info.latest;
    if(rel.full){                                   /* 전체 설치 파일이 필요한 큰 판 */
      show({ step:'check', title:'새 판 ' + rel.version + ' 이 나왔습니다', sub:'이번 판은 전체 설치 파일로 설치해야 합니다',
        body: verLine(rel) + notes(rel) + '<div class="upd-note">음성·자료가 크게 바뀐 판입니다. 설치 파일을 받아 실행하면 새 판으로 바뀝니다.</div>',
        btns:[{ t:'나중에', fn:function(){ later(rel); } }, { t:'설치 파일 내려받기', primary:true, fn:function(){ if(rel.full_url && window.WEB) WEB.open(rel.full_url); hide(); } }] });
      return;
    }
    if(info.ready){ askRestart(rel); return; }
    if(auto){
      show({ step:'check', title:'새 판 ' + rel.version + ' 이 나왔습니다', sub:'지금 받지 않아도 프로그램은 그대로 쓸 수 있습니다',
        body: verLine(rel) + notes(rel),
        btns:[{ t:'나중에', fn:function(){ later(rel); } }, { t:'다음 — 지금 받기', primary:true, fn:function(){ download(rel); } }] });
    } else download(rel);
  }
  function later(rel){ if(U) U.pref({ skip:rel.version }); hide(); APP.toast('다음에 실행할 때 다시 알려 드립니다 — 설정 옆 [업데이트 확인]으로 언제든 받을 수 있습니다'); }
  function download(rel){
    busy = true; prog = { t0:Date.now(), last:Date.now(), lastGot:0, speed:0 };
    show({ step:'download', title:'업데이트 ' + rel.version + ' 내려받는 중', sub:'잠시 기다려 주세요. 받는 동안에도 프로그램은 쓸 수 있습니다',
      body: verLine(rel) + notes(rel), progress:true, footl:'내려받기를 마치면 설치 단계로 넘어갑니다',
      btns:[{ t:'숨기기', fn:function(){ hide(); APP.toast('뒤에서 계속 받습니다 — 마치면 다시 알려 드립니다'); } }] });
    $('updFill').style.width = '0%'; $('updPct').textContent = '0%'; $('updMsg').textContent = '연결하는 중…';
    U.download().then(function(r){
      busy = false;
      if(!r.ok){
        var why = r.why === 'hash' ? '받은 파일이 손상되었습니다. 다시 시도해 주세요.' : r.why === 'busy' ? '이미 내려받는 중입니다.' : '내려받지 못했습니다 (' + String(r.why) + '). 인터넷 연결을 확인해 주세요.';
        show({ step:'download', title:'업데이트를 받지 못했습니다', sub:'', body: verLine(rel), note: why, bad:true,
          btns:[{ t:'닫기', fn:hide }, { t:'다시 시도', primary:true, fn:function(){ download(rel); } }] });
        return;
      }
      info.ready = true; askRestart(rel);
    }, function(e){ busy = false; show({ step:'download', title:'업데이트를 받지 못했습니다', body: verLine(rel), note:String(e && e.message || e), bad:true, btns:[{ t:'닫기', fn:hide }, { t:'다시 시도', primary:true, fn:function(){ download(rel); } }] }); });
  }
  function askRestart(rel){
    show({ step:'install', title:'설치할 준비가 끝났습니다', sub:'다시 시작하면 1분 안에 새 판으로 바뀌어 열립니다',
      body: verLine(rel) + '<div class="upd-ready"><i>✓</i><div><b>' + esc(rel.version) + ' 내려받기 완료</b><span>파일 검증을 마쳤습니다' + (rel.size ? ' · ' + fmtMB(rel.size) : '') + '</span></div></div>' + notes(rel),
      btns:[{ t:'종료할 때 설치', fn:function(){ hide(); APP.toast('다음에 실행할 때 설치를 이어 갑니다'); } },
            { t:'지금 다시 시작해 설치', primary:true, fn:function(){ busy = true; $('updNote').textContent = '다시 시작하는 중…'; setStep('install', true); U.apply().then(function(r){ if(!r.ok){ busy = false; $('updNote').textContent = '설치를 시작하지 못했습니다.'; $('updNote').className = 'upd-msg bad'; setStep('install'); } }); } }] });
  }
  /* 자동 확인(인증 뒤, 조용히) */
  function autoCheck(){
    if(!U || (window.POP && POP.isPop)) return;   /* 따로 뜬 창은 새 판 확인을 하지 않는다 (본문 창이 한다) */
    U.applied().then(function(a){
      if(a && a.version && a.version === a.cur) APP.toast('업데이트를 마쳤습니다 — 지금 ' + a.cur + ' 판입니다');
      else if(a && a.error) APP.toast('업데이트 설치에 실패했습니다: ' + a.error.slice(0, 80));
    });
    U.pref().then(function(p){
      if(p.auto === false) return;
      return U.check({ manual:false }).then(function(r){ info = r; paintSettings(r); if(r.ok && r.newer && !r.skipped) offer(true); });
    });
  }
  /* 수동 확인(도구 막대·설정) */
  function manual(){
    if(!U) return APP.toast('이 창에서는 업데이트를 확인할 수 없습니다');
    if(busy) return;
    APP.toast('최신 판을 확인하는 중…');
    U.check({ manual:true }).then(function(r){
      info = r; paintSettings(r);
      if(!r.ok) return APP.toast('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
      if(!r.newer) return APP.toast('지금 쓰는 ' + r.cur + ' 이 최신 판입니다');
      offer(false);
    });
  }
  function paintSettings(r){
    var e = $('updInfo'); if(!e) return;
    if(!r || !r.ok) e.textContent = '지금 판 ' + (r && r.cur ? r.cur : '') + ' · 서버에 연결하지 못했습니다';
    else if(!r.latest) e.textContent = '지금 판 ' + r.cur + ' · 배포 중인 새 판이 없습니다';
    else e.textContent = '지금 판 ' + r.cur + ' · 배포 중인 판 ' + r.latest.version + (r.newer ? ' — 새 판이 있습니다' : ' (최신)');
  }
  function onProgress(p){
    if(!p.total || !ov) return;
    var now = Date.now(), pct = Math.round(p.got / p.total * 100);
    if(now - prog.last >= 700){ var dt = (now - prog.last) / 1000; prog.speed = prog.speed ? prog.speed * .5 + ((p.got - prog.lastGot) / dt) * .5 : (p.got - prog.lastGot) / dt; prog.last = now; prog.lastGot = p.got; }
    var left = prog.speed > 0 ? (p.total - p.got) / prog.speed : NaN;
    $('updFill').style.width = pct + '%'; $('updPct').textContent = pct + '%';
    $('updMsg').textContent = fmtMB(p.got) + ' / ' + fmtMB(p.total) + (prog.speed > 0 ? ' · ' + fmtMB(prog.speed) + '/초' : '') + (fmtSec(left) ? ' · 남은 시간 약 ' + fmtSec(left) : '');
  }
  /* 화면 확인용: 가짜 자료로 세 단계를 차례로 보여 준다 (개발자 도구에서 UPD.demo()) */
  function demo(){
    info = { cur:'3.6.5', latest:{ version:'3.6.7', size:97099644, date:'2026-09-26', notes:'화면 제목·정보에 실제 설치된 판 번호가 표시되도록 · 성경지도 거리재기(직선·자유선) · 검색·메모장·지도가 따로 뜨는 창으로' } };
    var rel = info.latest;
    show({ step:'check', title:'새 판 ' + rel.version + ' 이 나왔습니다', sub:'지금 받지 않아도 프로그램은 그대로 쓸 수 있습니다', body: verLine(rel) + notes(rel),
      btns:[{ t:'나중에', fn:hide }, { t:'다음 — 지금 받기', primary:true, fn:function(){
        show({ step:'download', title:'업데이트 ' + rel.version + ' 내려받는 중', sub:'잠시 기다려 주세요. 받는 동안에도 프로그램은 쓸 수 있습니다', body: verLine(rel) + notes(rel), progress:true, footl:'내려받기를 마치면 설치 단계로 넘어갑니다', btns:[{ t:'숨기기', fn:hide }] });
        prog = { t0:Date.now(), last:Date.now(), lastGot:0, speed:0 }; var got = 0;
        var tm = setInterval(function(){ got += rel.size / 40; if(got >= rel.size){ clearInterval(tm); got = rel.size; } onProgress({ got:got, total:rel.size }); if(got >= rel.size) setTimeout(function(){ askRestart(rel); }, 400); }, 150);
      } }] });
  }
  function init(){
    if(!U) return;
    U.on('progress', onProgress);
    var b = $('updCheck'); if(b) b.onclick = manual;
    var a = $('updAuto'); if(a){ U.pref().then(function(p){ a.checked = p.auto !== false; }); a.onchange = function(){ U.pref({ auto:a.checked }); }; }
  }
  return { init:init, autoCheck:autoCheck, manual:manual, demo:demo };
})();
UPD.init();
