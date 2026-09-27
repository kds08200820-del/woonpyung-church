/* 성경 기록 하나로 — 이 성경으로 한 모든 일(장 읽기·찾기·지도·낱말·주석·학습·책 개관)을 자동으로 적는다.
   저장은 ACTDB(데스크탑: preload → notes-main 의 activity 표 → 서버 동기화 / 모두의 성경: bridge → Supabase modu_activity).
   담임목사 계정·코드일 때만 켜진다 (ACTDB.enabled). 지식 그래프(kgraph.js)가 ACT.list() 로 읽어 마디로 그린다. */
var ACT = (function(){
  var on = false, last = {}, tms = {};
  function db(){ return window.ACTDB; }
  function check(){ if(db() && db().enabled) Promise.resolve(db().enabled()).then(function(v){ on = !!v; }, function(){ on = false; }); }
  check(); setTimeout(check, 4000); setTimeout(check, 12000);   /* 모두의 성경은 로그인이 늦게 끝날 수 있다 */
  function log(kind, o){
    if(!on || !db()) return;
    o = o || {};
    var key = kind + '|' + (o.label || '') + '|' + (o.ref || ''), now = Date.now();
    if(last[key] && now - last[key] < 120000) return;          /* 같은 일을 2분 안에 또 하면 한 번만 */
    last[key] = now;
    try { Promise.resolve(db().add({ kind:kind, ref:o.ref || '', book:o.book || '', label:o.label || '', data:o.data || {} })).catch(function(){}); } catch(e){}
  }
  /* 머문 것만 적는다 — 장은 3초, 낱말은 2.5초 */
  function later(slot, ms, fn){ clearTimeout(tms[slot]); tms[slot] = setTimeout(fn, ms); }
  function read(bi, ci, name){ if(!on || bi < 0) return; later('read', 3000, function(){ log('read', { ref:name + ' ' + (ci + 1) + '장', book:name, label:name + ' ' + (ci + 1) + '장', data:{ bi:bi, ci:ci } }); }); }
  function word(info, refName){
    if(!on || !info) return;
    later('word', 2500, function(){
      var lab = info.lemma || info.word || ''; if(!lab) return;
      log('word', { label:lab, ref:refName || '', data:{ kind:info.kind || '', no:info.no || '', word:info.word || '', bi:info.bi, ci:info.ci, vi:info.vi } });
    });
  }
  return { log:log, read:read, word:word, enabled:function(){ return on; },
           list:function(n){ return on && db() ? Promise.resolve(db().list(n || 3000)).catch(function(){ return []; }) : Promise.resolve([]); } };
})();
/* 다른 기기에서 받은 메모·형광펜이 있으면 지금 화면을 다시 그린다 */
if(window.SYNC && SYNC.onChanged) SYNC.onChanged(function(){
  try { if(window.APP && APP.render) APP.render(); } catch(e){}
  try { if(window.NT && NT.reload) NT.reload(); } catch(e){}
});
