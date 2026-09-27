/* 지도 비교 — 같은 지역의 두 시대 지도를 나란히 놓고 통치 구조·지명·사건이 어떻게 달라졌는지 본다 (성경연구 메뉴)
   · 왼쪽·오른쪽 지도를 고르면 같은 범위로 맞춰 그린다 (ATLAS.renderTo)
   · 오른쪽 목록 맨 위에 '같은 지역 · 다른 시대' 추천 (겹치는 범위가 넓고 성경 순서가 먼 것)
   · 아래에 두 지도의 해설, 그리고 지명 비교(왼쪽에만 · 양쪽 모두 · 오른쪽에만)
   · 지도를 누르면 그 지도를 크게 연다 */
var MAPCMP = (function(){
  var $ = APP.$, esc = APP.esc, BOOKS = APP.BOOKS;
  var box = null, L = null, R = null, same = true, ro = null, opener = null;

  function maps(){ return (window.ATLAS && ATLAS.list ? ATLAS.list() : window.ATLAS_MAPS || []).filter(function(m){ return m.bounds; }); }
  function firstRef(m){ var r = (m.match || [])[0]; return r ? r[0] * 1000 + r[1] : 99999; }
  function refLabel(m){ var r = (m.match || [])[0]; return r && BOOKS[r[0]] ? BOOKS[r[0]].n + ' ' + r[1] + (r[2] !== r[1] ? '-' + r[2] : '') + '장' : '개관'; }
  function area(b){ return Math.max(1e-9, (b[0] - b[2]) * (b[3] - b[1])); }
  function overlap(a, b){
    var n = Math.min(a[0], b[0]), s = Math.max(a[2], b[2]), w = Math.max(a[1], b[1]), e = Math.min(a[3], b[3]);
    if(n <= s || e <= w) return 0;
    var o = (n - s) * (e - w); return o / Math.max(area(a), area(b));     /* 1 = 같은 범위 */
  }
  var RULE = /왕국|제국|지파|시대|나라|통치|분열|통일|정복|포로|귀환|분할|영토/;   /* 통치 구조를 다루는 지도끼리 먼저 */
  function suggest(m){
    if(!m) return [];
    return maps().filter(function(x){ return x !== m && overlap(x.bounds, m.bounds) >= .25; })
      .map(function(x){ return { m:x, s:overlap(x.bounds, m.bounds) * 2 + Math.min(1, Math.abs(firstRef(x) - firstRef(m)) / 20000) + (x.base === m.base ? .3 : 0) + (RULE.test(x.title) && RULE.test(m.title) ? 1.2 : 0) }; })
      .sort(function(a, b){ return b.s - a.s; }).slice(0, 12).map(function(o){ return o.m; });
  }
  function options(sel, list, rec){
    var all = maps().slice().sort(function(a, b){ return firstRef(a) - firstRef(b); });
    var h = '';
    if(rec && rec.length) h += '<optgroup label="같은 지역 · 다른 시대 (추천)">' + rec.map(function(m){ return '<option value="' + esc(m.id) + '">' + esc(m.title) + ' — ' + esc(refLabel(m)) + '</option>'; }).join('') + '</optgroup>';
    h += '<optgroup label="모든 지도 (성경 순서)">' + all.map(function(m){ return '<option value="' + esc(m.id) + '">' + esc(m.title) + ' — ' + esc(refLabel(m)) + '</option>'; }).join('') + '</optgroup>';
    sel.innerHTML = h;
  }
  function union(a, b){ return [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])]; }
  function placeName(id){ var p = window.ATLAS_PLACES && ATLAS_PLACES[id]; return p ? String(p[2] || id) : id; }
  function placesOf(m){ var o = {}; (m.places || []).forEach(function(id){ var p = window.ATLAS_PLACES && ATLAS_PLACES[id]; if(p && p[4] !== 'p') o[id] = 1; }); (m.marks || []).forEach(function(k){ if(k && k[0]) o[k[0]] = 1; }); return o; }
  function chips(ids){ return ids.length ? ids.map(function(id){ return '<span class="mc-chip">' + esc(placeName(id)) + '</span>'; }).join('') : '<span class="mc-dim">없음</span>'; }

  function paint(){
    if(!L || !R) return;
    var b = same ? union(L.bounds, R.bounds) : null;
    [['L', L], ['R', R]].forEach(function(p){
      var side = p[0], m = p[1], cv = $('mc' + side + 'Cv'), wrap = cv.parentElement, r = wrap.getBoundingClientRect();
      $('mc' + side + 'T').textContent = m.title; $('mc' + side + 'Ref').textContent = refLabel(m);
      $('mc' + side + 'Txt').textContent = m.text || '';
      $('mc' + side + 'Rt').innerHTML = (m.routes || []).map(function(rt){ return '<span class="mc-rt"><i style="border-top:3px ' + (rt.dash ? 'dashed' : 'solid') + ' ' + esc(rt.color || '#c0392b') + '"></i>' + esc(rt.name) + '</span>'; }).join('');
      cv.classList.add('mc-loading');
      ATLAS.renderTo(m, cv, Math.max(240, r.width), Math.max(220, r.height), b, function(){ cv.classList.remove('mc-loading'); });
    });
    var a = placesOf(L), c = placesOf(R), onlyL = [], both = [], onlyR = [];
    Object.keys(a).forEach(function(id){ (c[id] ? both : onlyL).push(id); });
    Object.keys(c).forEach(function(id){ if(!a[id]) onlyR.push(id); });
    var ko = function(x, y){ return placeName(x).localeCompare(placeName(y), 'ko'); };
    onlyL.sort(ko); both.sort(ko); onlyR.sort(ko);
    $('mcDiff').innerHTML =
      '<div class="mc-dcol"><div class="mc-dh">왼쪽에만 <b>' + onlyL.length + '</b></div>' + chips(onlyL) + '</div>' +
      '<div class="mc-dcol mid"><div class="mc-dh">양쪽 모두 <b>' + both.length + '</b></div>' + chips(both) + '</div>' +
      '<div class="mc-dcol"><div class="mc-dh">오른쪽에만 <b>' + onlyR.length + '</b></div>' + chips(onlyR) + '</div>';
    $('mcSame').classList.toggle('on', same);
    if(window.ACT) ACT.log('map', { label:'지도 비교 · ' + L.title + ' ↔ ' + R.title, data:{ id:L.id, cmp:R.id } });
  }
  function setL(m, keepR){ L = m; $('mcLSel').value = m.id; var rec = suggest(m); options($('mcRSel'), null, rec); if(!keepR || !R || R === L || overlap(R.bounds, m.bounds) < .25) R = rec[0] || maps().filter(function(x){ return x !== m; })[0];   /* 오른쪽은 같은 지역일 때만 그대로 */ $('mcRSel').value = R.id; paint(); }
  function build(){
    box = document.createElement('div'); box.className = 'modal mc-modal'; box.id = 'mcModal'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '지도 비교');
    box.innerHTML =
      '<div class="mc-card">' +
        '<div class="mc-head"><b>지도 비교</b><span class="mc-sub">같은 지역, 다른 시대 — 나란히 놓고 봅니다</span><span class="mc-sp"></span>' +
          '<button type="button" class="btn" id="mcSame" title="두 지도를 같은 범위로 맞춰 그립니다">같은 범위</button>' +
          '<button type="button" class="btn" id="mcSwap" title="왼쪽·오른쪽 바꾸기">⇄ 바꾸기</button>' +
          '<button type="button" class="wb-x" id="mcClose" aria-label="닫기">×</button></div>' +
        '<div class="mc-body">' +
          ['L', 'R'].map(function(s){
            return '<section class="mc-pane"><select id="mc' + s + 'Sel" class="mc-sel"></select>' +
              '<div class="mc-cvwrap"><canvas id="mc' + s + 'Cv" title="누르면 이 지도를 크게 엽니다"></canvas></div>' +
              '<div class="mc-info"><div class="mc-t"><span id="mc' + s + 'T"></span> <small id="mc' + s + 'Ref"></small></div><div class="mc-rts" id="mc' + s + 'Rt"></div><div class="mc-txt" id="mc' + s + 'Txt"></div></div></section>';
          }).join('') +
        '</div>' +
        '<div class="mc-diff" id="mcDiff"></div>' +
      '</div>';
    document.body.appendChild(box);
    var st = document.createElement('style');
    st.textContent =
      '.mc-modal{z-index:205;padding:14px}.mc-card{width:min(1500px,86vw);height:min(960px,86vh);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow2);overflow:hidden}' +
      '.mc-card{position:relative;resize:both;min-width:560px;min-height:420px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px)}' +
      '.mc-head{cursor:move;user-select:none;touch-action:none}.mc-head :is(button,select,input){cursor:pointer}.mc-dragging,.mc-dragging *{cursor:move!important;user-select:none!important}' +
      '@media (max-width:900px){.mc-card{min-width:0;resize:none}}' +
      '.mc-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line)}.mc-head b{font-size:17px}.mc-sub{color:var(--fg3);font-size:13px}.mc-sp{flex:1}' +
      '.mc-head .btn.on{background:var(--accent);color:var(--accent-fg,#fff);border-color:var(--accent)}' +
      '.mc-body{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}' +
      '.mc-pane{display:flex;flex-direction:column;min-height:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}' +
      '.mc-sel{margin:8px;height:34px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--fg);font:inherit;font-size:14px;padding:0 8px}' +
      '.mc-cvwrap{flex:1;min-height:200px;position:relative;cursor:zoom-in}.mc-cvwrap canvas{position:absolute;inset:0;width:100%;height:100%}.mc-loading{opacity:.35}' +
      '.mc-info{max-height:34%;overflow:auto;padding:8px 12px;border-top:1px solid var(--line);font-size:13.5px;line-height:1.7}.mc-t{font-weight:700;margin-bottom:4px}.mc-t small{color:var(--fg3);font-weight:400}' +
      '.mc-txt{color:var(--fg2);white-space:pre-wrap}.mc-rts{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:4px}.mc-rt{display:inline-flex;align-items:center;gap:6px;font-size:12.5px}.mc-rt i{display:inline-block;width:22px}' +
      '.mc-diff{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0 10px 10px;max-height:24%;overflow:auto}' +
      '.mc-dcol{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg)}.mc-dcol.mid{background:var(--panel2)}.mc-dh{font-size:12.5px;color:var(--fg3);margin-bottom:6px}.mc-dh b{color:var(--fg)}' +
      '.mc-chip{display:inline-block;margin:0 5px 5px 0;padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;background:var(--panel)}.mc-dim{color:var(--fg3);font-size:12.5px}' +
      '@media (max-width:900px){.mc-body{grid-template-columns:1fr;overflow:auto}.mc-pane{min-height:420px}.mc-diff{grid-template-columns:1fr}.mc-sub{display:none}}';
    document.head.appendChild(st);
    $('mcClose').onclick = close;
    /* 창 옮기기: 머리줄을 끌면 창이 따라온다 (화면 밖으로는 못 나감), 두 번 누르면 가운데로. 끌다가 밖에서 놓아도 창은 닫히지 않는다 */
    (function(){
      var card = box.querySelector('.mc-card'), head = box.querySelector('.mc-head'), dx = 0, dy = 0, sx = 0, sy = 0, ox = 0, oy = 0, on = false;
      function apply(){ card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }
      function clamp(){
        card.style.transform = ''; var r = card.getBoundingClientRect();
        dx = Math.max(160 - r.right, Math.min(window.innerWidth - 160 - r.left, dx));   /* 창이 적어도 160px 는 보이게 */
        dy = Math.max(8 - r.top, Math.min(window.innerHeight - 56 - r.top, dy)); apply();   /* 머리줄은 늘 화면 안에 */
      }
      head.addEventListener('pointerdown', function(e){
        if(e.button !== 0 || e.target.closest('button,select,input,a')) return;
        on = true; sx = e.clientX; sy = e.clientY; ox = dx; oy = dy; head.setPointerCapture(e.pointerId); document.body.classList.add('mc-dragging'); e.preventDefault();
      });
      head.addEventListener('pointermove', function(e){ if(!on) return; dx = ox + e.clientX - sx; dy = oy + e.clientY - sy; apply(); });
      function end(e){ if(!on) return; on = false; document.body.classList.remove('mc-dragging'); try { head.releasePointerCapture(e.pointerId); } catch(x){} clamp(); }
      head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
      head.addEventListener('dblclick', function(e){ if(e.target.closest('button,select,input')) return; dx = dy = 0; apply(); });
      window.addEventListener('resize', function(){ if(!box.hidden) clamp(); });
    })();
    $('mcSame').onclick = function(){ same = !same; paint(); };
    $('mcSwap').onclick = function(){ var t = L; L = R; R = t; $('mcLSel').value = L.id; options($('mcRSel'), null, suggest(L)); $('mcRSel').value = R.id; paint(); };
    $('mcLSel').onchange = function(){ var m = ATLAS.byId(this.value); if(m) setL(m, true); };
    $('mcRSel').onchange = function(){ var m = ATLAS.byId(this.value); if(m){ R = m; paint(); } };
    ['L', 'R'].forEach(function(s){ $('mc' + s + 'Cv').onclick = function(){ var m = s === 'L' ? L : R; close(); if(APP.openAtlasAt) APP.openAtlasAt(m, null); else ATLAS.open(m); }; });
    var down = false;
    box.addEventListener('mousedown', function(e){ down = e.target === box; });
    box.addEventListener('click', function(e){ if(down && e.target === box) close(); down = false; });
    box.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } });
    ro = new ResizeObserver(function(){ if(!box.hidden) { clearTimeout(ro._t); ro._t = setTimeout(paint, 150); } });
    ro.observe($('mcLCv').parentElement);
  }
  function open(left, right){
    if(!window.ATLAS || !ATLAS.renderTo){ APP.toast('지도 자료를 읽지 못했습니다'); return; }
    if(!box) build();
    opener = document.activeElement;
    options($('mcLSel'), null, null);
    box.hidden = false;
    var st = APP.st || {}, m = left || (st.bi >= 0 ? (ATLAS.mapsFor(st.bi, st.ci)[0]) : null) || maps()[0];
    setL(m, false);
    if(right){ R = right; $('mcRSel').value = R.id; paint(); }
    setTimeout(function(){ $('mcLSel').focus(); }, 0);
  }
  function close(){ if(!box || box.hidden) return; box.hidden = true; if(opener && opener.focus) try { opener.focus(); } catch(e){} }
  return { open:open, close:close };
})();
