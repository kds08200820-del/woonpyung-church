/* 원격 업데이트 화면 — 인증이 끝난 뒤 조용히 확인해 새 판이 있으면 알린다(안 해도 쓰는 데 지장 없음).
   도구 막대·설정의 [최신 업데이트 확인]을 누르면 확인 뒤 최신이면 안내, 새 판이면 곧바로 내려받는다. */
var UPD = (function(){
  var $ = APP.$, esc = APP.esc, U = window.UPDATE || null;
  var ov = null, info = null, busy = false;
  function fmtMB(n){ return n ? (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1) + ' MB' : ''; }
  function el(){
    if(ov) return ov;
    ov = document.createElement('div'); ov.className = 'upd-ov'; ov.hidden = true;
    ov.innerHTML = '<div class="upd-card" role="dialog" aria-modal="true"><h2 id="updTitle">업데이트</h2><div id="updBody"></div><div class="upd-bar" id="updBar" hidden><div class="upd-fill" id="updFill"></div></div><div class="upd-msg" id="updMsg"></div><div class="upd-btns" id="updBtns"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function(e){ if(e.target === ov) ov._down = true; });
    ov.addEventListener('click', function(e){ if(e.target === ov && ov._down && !busy) hide(); ov._down = false; });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !ov.hidden && !busy) hide(); });
    return ov;
  }
  function show(title, body, btns, msg){
    el(); ov.hidden = false; document.body.classList.add('modal-open');
    $('updTitle').textContent = title; $('updBody').innerHTML = body; $('updMsg').textContent = msg || '';
    $('updBar').hidden = true;
    var bx = $('updBtns'); bx.innerHTML = '';
    btns.forEach(function(b){ var x = document.createElement('button'); x.type = 'button'; x.className = 'btn' + (b.primary ? ' primary' : ''); x.textContent = b.t; x.onclick = b.fn; bx.appendChild(x); });
    setTimeout(function(){ var p = bx.querySelector('.primary') || bx.firstChild; if(p) p.focus(); }, 0);
  }
  function hide(){ if(ov){ ov.hidden = true; document.body.classList.remove('modal-open'); } }
  function notes(rel){
    var n = String(rel.notes || '').trim();
    return '<div class="upd-ver">' + esc(rel.version) + '<span class="dim"> · 지금 쓰는 판 ' + esc(info.cur) + (rel.size ? ' · 내려받기 ' + fmtMB(rel.size) : '') + (rel.date ? ' · ' + esc(String(rel.date).slice(0, 10)) : '') + '</span></div>' +
           (n ? '<div class="upd-notes">' + esc(n).replace(/\n/g, '<br>') + '</div>' : '');
  }
  /* 새 판 안내 → 내려받기 → 다시 시작 */
  function offer(auto){
    var rel = info.latest;
    if(rel.full){                                   /* 전체 설치 파일이 필요한 큰 판 */
      show('새 판 ' + rel.version + ' 이 나왔습니다', notes(rel) + '<div class="upd-note">이번 판은 음성·자료가 크게 바뀌어 전체 설치 파일로 설치해야 합니다. 설치해도 메모·형광펜·설정은 그대로 남습니다.</div>',
        [{ t:'설치 파일 내려받기', primary:true, fn:function(){ if(rel.full_url && window.WEB) WEB.open(rel.full_url); hide(); } }, { t:'나중에', fn:function(){ later(rel); } }]);
      return;
    }
    if(info.ready){ askRestart(rel); return; }
    if(auto){
      show('새 판 ' + rel.version + ' 이 나왔습니다', notes(rel) + '<div class="upd-note">지금 받지 않아도 프로그램은 그대로 쓸 수 있습니다. 메모·형광펜·설정·인증은 업데이트 뒤에도 그대로 남습니다.</div>',
        [{ t:'지금 받기', primary:true, fn:function(){ download(rel); } }, { t:'나중에', fn:function(){ later(rel); } }]);
    } else download(rel);
  }
  function later(rel){ if(U) U.pref({ skip:rel.version }); hide(); APP.toast('다음에 실행할 때 다시 알려 드립니다 — 설정 옆 [업데이트 확인]으로 언제든 받을 수 있습니다'); }
  function download(rel){
    busy = true;
    show('업데이트 ' + rel.version + ' 내려받는 중', notes(rel), [], '잠시 기다려 주세요…');
    $('updBar').hidden = false; $('updFill').style.width = '0%';
    U.download().then(function(r){
      busy = false;
      if(!r.ok){
        var why = r.why === 'hash' ? '받은 파일이 손상되었습니다. 다시 시도해 주세요.' : r.why === 'busy' ? '이미 내려받는 중입니다.' : '내려받지 못했습니다 (' + esc(String(r.why)) + '). 인터넷 연결을 확인해 주세요.';
        show('업데이트를 받지 못했습니다', notes(rel), [{ t:'다시 시도', primary:true, fn:function(){ download(rel); } }, { t:'닫기', fn:hide }], why);
        return;
      }
      info.ready = true; askRestart(rel);
    }, function(){ busy = false; show('업데이트를 받지 못했습니다', notes(rel), [{ t:'닫기', fn:hide }]); });
  }
  function askRestart(rel){
    show('업데이트 ' + rel.version + ' 준비 끝', notes(rel) + '<div class="upd-note">다시 시작하면 1분 안에 새 판으로 바뀌어 열립니다. 메모·형광펜·설정·인증은 그대로 유지됩니다.</div>',
      [{ t:'지금 다시 시작해 설치', primary:true, fn:function(){ busy = true; $('updMsg').textContent = '다시 시작하는 중…'; U.apply().then(function(r){ if(!r.ok){ busy = false; $('updMsg').textContent = '설치를 시작하지 못했습니다.'; } }); } },
       { t:'종료할 때', fn:function(){ hide(); APP.toast('다음에 실행할 때 설치를 이어 갑니다'); } }]);
  }
  /* 자동 확인(인증 뒤, 조용히) */
  function autoCheck(){
    if(!U) return;
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
  function init(){
    if(!U) return;
    U.on('progress', function(p){ if(!p.total) return; $('updFill').style.width = Math.round(p.got / p.total * 100) + '%'; $('updMsg').textContent = fmtMB(p.got) + ' / ' + fmtMB(p.total); });
    var b = $('updCheck'); if(b) b.onclick = manual;
    var a = $('updAuto'); if(a){ U.pref().then(function(p){ a.checked = p.auto !== false; }); a.onchange = function(){ U.pref({ auto:a.checked }); }; }
  }
  return { init:init, autoCheck:autoCheck, manual:manual };
})();
UPD.init();
