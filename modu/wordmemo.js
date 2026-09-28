/* 원어 메모 — 히브리어·헬라어 낱말을 눌러 메모를 남긴다 (2026-09-28)
   · 메모는 메모장(NOTES)에 보통 메모로 저장된다. 낱말과의 연결은 태그 `#원어/H430` `#원어/G2316` 하나로 한다
     (표를 바꾸지 않아 데스크탑 SQLite·모바일 Supabase·동기화 모두 그대로 쓰인다).
   · 메모가 있는 낱말은 본문(대조 원어·스테판 원어 성경)에서 밑줄·굵게(.wm) 표시되고, 낱말 창·뜻 상자에 메모가 보인다.
   · 데스크탑(app.js)·모두의 성경(modu/) 이 같은 파일을 쓴다. */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var TAG_RE = /#원어\/([HG]\d+)/g;
  var map = {}, loaded = false, loading = null, pending = null;

  function keyOf(info){
    if(!info) return '';
    if(info.kind === 'heb'){ var no = (info.entries && info.entries[0] || {}).no; return no ? 'H' + String(no).replace(/\D/g, '') : ''; }
    if(info.kind === 'grk') return info.no ? 'G' + String(info.no).replace(/\D/g, '') : '';
    return '';
  }
  function tagOf(key){ return '#원어/' + key; }
  function parse(list){
    var m = {};
    (list || []).forEach(function(n){
      var t = String(n.tags || ''), r, seen = {};
      TAG_RE.lastIndex = 0;
      while((r = TAG_RE.exec(t))){ if(seen[r[1]]) continue; seen[r[1]] = 1; (m[r[1]] = m[r[1]] || []).push(n); }
    });
    return m;
  }
  /* 메모장 전체를 한 번 읽어 낱말별로 나눠 둔다 — 메모가 바뀌면(저장·다른 창 알림) 다시 읽는다 */
  function load(force){
    if(!window.NOTES || !NOTES.list) return Promise.resolve(map);
    if(loading && !force) return loading;
    loading = NOTES.list('').then(function(list){
      var before = JSON.stringify(Object.keys(map).sort());
      map = parse(list); loaded = true; loading = null;
      if(JSON.stringify(Object.keys(map).sort()) !== before) remark();
      return map;
    }).catch(function(){ loading = null; return map; });
    return loading;
  }
  function has(key){ return !!(key && map[key] && map[key].length); }
  function cls(key){ return has(key) ? ' wm' : ''; }
  function listFor(key){ return (map[key] || []).slice(); }
  /* 본문에 이미 그려진 낱말의 표시를 맞춘다 (다시 그리지 않고 클래스만) */
  function remark(){
    var els = document.querySelectorAll('[data-wk]');
    for(var i = 0; i < els.length; i++) els[i].classList.toggle('wm', has(els[i].getAttribute('data-wk')));
  }

  /* ── 낱말 창·뜻 상자에 붙는 메모 칸 ── */
  function section(info){
    var key = keyOf(info); if(!key) return '';
    var ms = listFor(key);
    var h = '<div class="wm-sec" data-wk="' + key + '"><div class="wm-head"><b>📝 이 낱말의 메모</b>' +
            '<span class="wm-n">' + (ms.length ? ms.length + '개' : '없음') + '</span>' +
            '<button type="button" class="btn wm-add">메모 남기기</button></div>';
    if(ms.length) h += '<div class="wm-list">' + ms.map(function(n){
      return '<button type="button" class="wm-item" data-id="' + n.id + '" title="메모장에서 열기">' +
             '<span class="t">' + esc(n.title) + '</span>' + (n.ref && String(n.title).indexOf(n.ref) < 0 ? '<span class="r">' + esc(n.ref) + '</span>' : '') +
             (n.snip ? '<span class="s">' + esc(String(n.snip).replace(/\s+/g, ' ')) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    return h + '</div>';
  }
  function bind(root, info){
    if(!root) return;
    var add = root.querySelector('.wm-add'); if(add) add.onclick = function(e){ e.stopPropagation(); openEditor(info); };
    var items = root.querySelectorAll('.wm-item');
    for(var i = 0; i < items.length; i++) items[i].onclick = function(e){ e.stopPropagation(); openNote(+this.getAttribute('data-id')); };
  }
  function openNote(id){
    if(!id) return;
    if(window.POP && !POP.isPop){ POP.open('notes', { nid:id }); return; }       /* 데스크탑: 메모장 창 */
    if(window.APP && APP.showView) APP.showView('notes');
    if(window.NT && NT.openNote) NT.openNote(id, '');
  }

  /* ── 메모 쓰기 창 (index.html 을 바꾸지 않도록 여기서 만든다) ── */
  function ensureModal(){
    if($('wmModal')) return;
    var d = document.createElement('div'); d.className = 'modal wm-modal'; d.id = 'wmModal'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '원어 메모');
    d.innerHTML = '<div class="modal-card wmcard">' +
      '<div class="m-head"><div class="m-word" id="wmWord"></div><span class="spacer"></span><button type="button" class="wb-x" id="wmClose" title="닫기 (Esc)" aria-label="닫기">×</button></div>' +
      '<div class="m-body">' +
        '<div class="wm-meta" id="wmMeta"></div>' +
        '<input id="wmTitle" class="askinput" placeholder="제목" autocomplete="off">' +
        '<textarea id="wmText" class="wm-text" placeholder="이 낱말에 대해 적어 두고 싶은 것 — 뜻·용례·설교 적용…" spellcheck="false"></textarea>' +
        '<p class="hint">저장한 메모는 메모장에 <b id="wmTag"></b> 태그로 들어가고, 이 낱말이 나오는 모든 곳에서 밑줄로 표시됩니다.</p>' +
      '</div>' +
      '<div class="m-foot"><button type="button" class="btn primary" id="wmSave">저장</button><button type="button" class="btn" id="wmCancel">취소</button></div>' +
    '</div>';
    document.body.appendChild(d);
    $('wmClose').onclick = close; $('wmCancel').onclick = close;
    $('wmSave').onclick = save;
    /* 드래그로 글을 고르다 바깥에서 놓아도 닫히지 않게 — 눌렀다 뗀 곳이 모두 바탕일 때만 닫는다 */
    var downOut = false;
    d.addEventListener('mousedown', function(e){ downOut = (e.target === d); });
    d.addEventListener('mouseup', function(e){ if(downOut && e.target === d) close(); downOut = false; });
    d.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ e.stopPropagation(); close(); }
      else if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); save(); }
    });
  }
  var cur = null, lastFocus = null, saving = false;
  function openEditor(info){
    var key = keyOf(info); if(!key) return;
    ensureModal();
    cur = { info:info, key:key };
    var word = info.kind === 'heb' && window.APP && APP.heb ? APP.heb(info.word) : info.word;
    $('wmWord').textContent = word || key;
    $('wmWord').className = 'm-word' + (info.kind === 'heb' ? '' : ' ltr');
    $('wmWord').setAttribute('dir', info.kind === 'heb' ? 'rtl' : 'ltr');
    var mean = meanOf(info);
    $('wmMeta').textContent = key + (info.lemma ? ' · ' + info.lemma : '') + (mean ? ' · ' + mean : '') + (info.ref ? ' · ' + info.ref : '');
    $('wmTitle').value = (info.lemma || word || key) + (info.ref ? ' — ' + info.ref : '');
    $('wmText').value = '';
    $('wmTag').textContent = tagOf(key);
    lastFocus = document.activeElement;
    $('wmModal').hidden = false;
    setTimeout(function(){ $('wmText').focus(); }, 0);
  }
  function meanOf(info){
    try{
      if(info.kind === 'heb'){ var e = info.entries && info.entries[0]; return e && e.mean ? String(e.mean).slice(0, 60) : ''; }
      if(info.kind === 'grk'){ var d = info.entry; return d && d[5] ? String(d[5]).slice(0, 60) : ''; }
    }catch(e){}
    return '';
  }
  function close(){
    var m = $('wmModal'); if(!m || m.hidden) return;
    m.hidden = true; cur = null;
    try{ if(lastFocus && lastFocus.focus) lastFocus.focus(); }catch(e){}
  }
  function isOpen(){ var m = $('wmModal'); return !!(m && !m.hidden); }
  function save(){
    if(!cur || saving) return;
    var text = $('wmText').value.trim(), title = $('wmTitle').value.trim() || cur.key;
    if(!text){ if(window.APP) APP.toast('메모 내용을 적어 주세요'); $('wmText').focus(); return; }
    var info = cur.info, key = cur.key;
    var theme = '원어 메모', ref = info.ref || '';
    saving = true; $('wmSave').disabled = true;
    NOTES.save({ id:0, ref:ref, title:title, theme:theme, tags:tagOf(key), content:text }).then(function(){
      saving = false; $('wmSave').disabled = false;
      close();
      if(window.APP) APP.toast('원어 메모를 저장했습니다 — ' + key);
      if(window.POP) try{ POP.notify('notes'); }catch(e){}
      return load(true);
    }).then(function(){
      /* 열려 있는 낱말 창·뜻 상자의 메모 칸을 새로 그린다 */
      refreshSections();
    }).catch(function(e){ saving = false; $('wmSave').disabled = false; if(window.APP) APP.toast('저장하지 못했습니다: ' + (e && e.message || e)); });
  }
  var shown = [];   /* 지금 화면에 붙어 있는 메모 칸 [{root, info}] */
  function mount(root, info){
    if(!root) return;
    var key = keyOf(info);
    var old = root.querySelector('.wm-sec'); if(old) old.remove();
    if(!key) return;
    root.insertAdjacentHTML('beforeend', section(info));
    bind(root.querySelector('.wm-sec'), info);
    shown = shown.filter(function(s){ return s.root !== root; }); shown.push({ root:root, info:info });
    if(!loaded) load().then(function(){ refreshSections(); });
  }
  function refreshSections(){
    shown = shown.filter(function(s){ return document.body.contains(s.root); });
    shown.forEach(function(s){ var sec = s.root.querySelector('.wm-sec'); if(!sec) return; sec.outerHTML = section(s.info); bind(s.root.querySelector('.wm-sec'), s.info); });
  }

  /* 다른 창(메모장)에서 바뀌면 다시 읽는다 */
  if(window.POP && POP.onNotify) POP.onNotify(function(kind){ if(kind === 'notes') load(true).then(refreshSections); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && isOpen()){ e.stopPropagation(); close(); } }, true);
  if(document.readyState === 'complete') setTimeout(function(){ load(); }, 800); else window.addEventListener('load', function(){ setTimeout(function(){ load(); }, 800); });

  window.WM = { keyOf:keyOf, has:has, cls:cls, list:listFor, load:load, remark:remark, section:section, bind:bind, mount:mount, open:openEditor, isOpen:isOpen, close:close, refresh:refreshSections };
})();
