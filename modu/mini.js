/* 2026 모두의 성경 — 미니 모드 (설교 작성기 안의 성경 칸·따로 뜬 성경 창)
   주소: modu/index.html?mini=1&ref=<본문>&sermon=<설교 제목>&sdate=<YYYY-MM-DD>
   · 처음에 본문 구절(ref)로 연다
   · 보고 있는 장을 설교 작성기에 알린다 (postMessage {type:'modu-ch', bi, ci}) — '이 장을 본문칸에 넣기'에 쓰인다
   · 설교 준비 중 읽은 장·찾은 말씀을 메모 「설교 준비 · 제목 (날짜)」에 모아 적는다 (Supabase modu_notes) */
(function(){
  'use strict';
  var q = new URLSearchParams(location.search);
  if(q.get('mini') !== '1') return;
  document.documentElement.classList.add('mo-mini');
  var REF = q.get('ref') || '', SERMON = (q.get('sermon') || '').trim(), SDATE = q.get('sdate') || '';
  var target = window.opener || (window.parent !== window ? window.parent : null);
  function post(msg){ try { if(target) target.postMessage(msg, location.origin); } catch(e){} }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function hm(){ var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ── 설교 준비 기록 → 메모 ── */
  var noteTitle = '설교 준비 · ' + (SERMON || '제목 없음') + (SDATE ? ' (' + SDATE + ')' : '');
  var pending = [], saving = false, noteId = 0, lastLogged = '';
  function log(line){ pending.push('- ' + hm() + ' ' + line); schedule(); }
  var tm = 0;
  function schedule(){ clearTimeout(tm); tm = setTimeout(flush, 8000); }
  function flush(){
    if(saving || !pending.length || !window.NOTES) return;
    saving = true;
    var lines = pending.splice(0);
    var findId = noteId ? Promise.resolve(noteId) : NOTES.list(noteTitle).then(function(rows){ var hit = (rows || []).filter(function(n){ return n.title === noteTitle; })[0]; return hit ? hit.id : 0; });
    findId.then(function(id){ return id ? NOTES.get(id) : null; }).then(function(n){
      var head = n ? n.content : ('설교: ' + (SERMON || '') + (SDATE ? '\n날짜: ' + SDATE : '') + (REF ? '\n본문: ' + REF : '') + '\n\n#설교준비\n\n읽고 찾은 말씀');
      return NOTES.save({ id: n ? n.id : 0, title: noteTitle, ref: REF, theme: '설교 준비', content: head + '\n' + lines.join('\n') });
    }).then(function(saved){ if(saved) noteId = saved.id; saving = false; if(pending.length) schedule(); }, function(){ pending = lines.concat(pending); saving = false; setTimeout(schedule, 20000); });
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function(){ if(document.hidden) flush(); });

  /* ── 보고 있는 장 알리기 + 기록 (3초 넘게 머문 장만) ── */
  var cur = '', since = 0;
  function bookName(bi){ var B = (window.APP && APP.BOOKS) || []; return B[bi] ? (B[bi].n || B[bi].name || '') : ''; }
  setInterval(function(){
    var st = window.APP && APP.st; if(!st || st.bi < 0) return;
    var key = st.bi + ':' + st.ci;
    if(key !== cur){ cur = key; since = Date.now(); post({ type:'modu-ch', bi: st.bi, ci: st.ci, book: bookName(st.bi) }); return; }
    if(Date.now() - since > 3000 && lastLogged !== key){ lastLogged = key; log(bookName(st.bi) + ' ' + (st.ci + 1) + '장 읽음'); }
  }, 700);

  /* ── 찾기 기록 ── */
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var t = e.target; if(!t || !t.id) return;
    if(t.id === 'q' || t.id === 'searchInput' || /search/i.test(t.id)){ var v = String(t.value || '').trim(); if(v) log('찾기: ' + v); }
  }, true);

  /* ── 처음 열 때 본문 구절로 ── */
  function goRef(){
    if(!REF) return true;
    if(!window.APP || !APP.parseRefList || !APP.BOOKS || !APP.BOOKS.length) return false;
    try {
      var list = APP.parseRefList(REF.replace(/[–—~]/g, '-').replace(/\s+/g, ' '));
      var r = list && list[0]; if(!r) return true;
      APP.openChapter(r.bi, r.ci, r.from >= 0 ? r.from : undefined);
    } catch(e){}
    return true;
  }
  var tries = 0; (function wait(){ if(goRef() || ++tries > 40) return; setTimeout(wait, 250); })();
  if(SERMON) log('설교 준비 시작' + (REF ? ' — ' + REF : ''));
})();
