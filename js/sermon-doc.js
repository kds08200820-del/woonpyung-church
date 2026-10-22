/* ============================================================
   운평장로교회 — 설교 문서 공용 모듈 (window.SermonDoc)

   설교 매니저 편집기 · 인쇄(PDF) · 발표자 모드가 **같은 쪽 나눔**을 쓰게 하는 바탕.
   편집 화면에서 3쪽 둘째 문단이면 PDF 에서도, 아이패드에서도 3쪽 둘째 문단이어야 한다.

   · 저장 형식은 그대로 HTML(sermons.content). 줄간격·자간·용지 설정은 맨 바깥
     <div data-se-root data-se-lh data-se-ls data-se-page='{…}'> 래퍼에 실린다(unwrap/wrap).
   · 쪽 나눔(paginate)은 ProseMirror 와 무관한 순수 DOM 계산이라 인쇄·발표자 화면은
     이 파일과 css/sermon-doc.css 만 있으면 된다. 편집기(js/sermon-editor.js)는 같은 계산을
     데코레이션으로 그린다.
   · 글꼴이 다 내려받아진 뒤에 재야 쪽이 같다 — renderPages 가 document.fonts.ready 를 기다린다.
   ============================================================ */
window.SermonDoc = (function () {
  'use strict';

  var MMPX = 96 / 25.4;                       // 1㎜ = 3.78px (96dpi) — 화면·인쇄 공통 물리 크기
  var PAPERS = { A4: [210, 297], iPad: [180, 240], Letter: [216, 279], B5: [176, 250] };
  var PGNUM_FMT = { num: '{i}', numTotal: '{i} / {n}', dash: '- {i} -', kr: '{i}페이지', paren: '({i})' };
  var HEADERS = { none: '없음', title: '제목', 'title-date': '제목 · 날짜', custom: '직접 입력' };
  var DEFAULTS = { paper: 'A4', margin: 20, pgnum: 'off', header: 'none', headerText: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // 용지 설정 정규화 — 모르는 값은 기본값으로
  function settingsFrom(o) {
    o = o || {};
    var s = {};
    s.paper = PAPERS[o.paper] ? o.paper : DEFAULTS.paper;
    s.margin = Number(o.margin) || DEFAULTS.margin; if (s.margin < 8) s.margin = 8; if (s.margin > 40) s.margin = 40;
    s.pgnum = (PGNUM_FMT[o.pgnum] || o.pgnum === 'off') ? o.pgnum : DEFAULTS.pgnum;
    s.header = HEADERS[o.header] ? o.header : DEFAULTS.header;
    s.headerText = String(o.headerText || '').slice(0, 120);
    return s;
  }
  function metrics(s) {
    s = settingsFrom(s);
    var sz = PAPERS[s.paper];
    var pw = Math.round(sz[0] * MMPX), ph = Math.round(sz[1] * MMPX), mg = Math.round(s.margin * MMPX);
    return { pw: pw, ph: ph, mg: mg, innerW: pw - 2 * mg, innerH: ph - 2 * mg, wmm: sz[0], hmm: sz[1] };
  }

  // ── 저장 HTML 래퍼 ─────────────────────────────────────────
  //  줄간격·자간은 편집기 전체 스타일이라 문단 HTML 에 실리지 않는다 → 맨 바깥 div 하나에 모아 저장(예전 방식 그대로),
  //  용지·여백·머리글·쪽번호(data-se-page)도 같은 래퍼에 JSON 으로 싣는다(없으면 기본값).
  function unwrap(html) {
    var out = { inner: String(html || ''), lh: '', ls: '', page: null };
    if (!/data-se-root/.test(out.inner)) return out;
    var d = document.createElement('div'); d.innerHTML = out.inner;
    var r = d.firstElementChild;
    if (!r || d.children.length !== 1 || !r.hasAttribute('data-se-root')) return out;
    out.lh = r.getAttribute('data-se-lh') || '';
    out.ls = r.getAttribute('data-se-ls') || '';
    try { out.page = r.getAttribute('data-se-page') ? JSON.parse(r.getAttribute('data-se-page')) : null; } catch (e) { out.page = null; }
    out.inner = r.innerHTML;
    return out;
  }
  function wrap(inner, meta) {
    meta = meta || {};
    var lh = meta.lh || '', ls = meta.ls || '', page = meta.page ? JSON.stringify(settingsFrom(meta.page)) : '';
    if (!lh && !ls && !page) return inner;
    return '<div data-se-root="1"' + (lh ? ' data-se-lh="' + esc(lh) + '"' : '') + (ls ? ' data-se-ls="' + esc(ls) + '"' : '') +
      (page ? ' data-se-page="' + esc(page) + '"' : '') +
      ' style="' + (lh ? 'line-height:' + esc(lh) + ';' : '') + (ls ? 'letter-spacing:' + esc(ls) : '') + '">' + inner + '</div>';
  }
  // 옛 평문 원고(태그 없음) → 문단 HTML
  function plainToHtml(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n');
    if (!t.trim()) return '';
    return t.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function isHtml(s) { return /<(p|div|h[1-6]|ul|ol|li|blockquote|br|span|mark|b|i|strong|em|u|s|font|table|img)\b/i.test(String(s || '')); }

  // ── 앞부분(제목·본문 성경)·기도 — 인쇄·발표자·편집기 첫 쪽이 같은 모양 ──
  function fmtDateK(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(ymd || '')) return ymd || '';
    var d = new Date(String(ymd).slice(0, 10) + 'T00:00:00'), W = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + W[d.getDay()] + ')';
  }
  // opts: { seriesLine, hymnLine, bibleLabel }
  function frontMatterHTML(rec, opts) {
    rec = rec || {}; opts = opts || {};
    var meta = [fmtDateK(rec.sermon_date), rec.service, opts.hymnLine, rec.scripture, rec.preacher].filter(Boolean).join('   ·   ');
    var h = '<div class="sdoc-front">';
    if (opts.seriesLine) h += '<div class="sdoc-series">' + esc(opts.seriesLine) + '</div>';   // 문서에는 이모지를 넣지 않는다(2026-10-13 목사님 지시)
    h += '<div class="sdoc-title">' + esc(rec.title || '(제목없음)') + '</div>';
    if (meta) h += '<div class="sdoc-meta">' + esc(meta) + '</div>';
    h += '<hr class="sdoc-hr">';
    var bible = String(rec.bible_text || '').trim();
    if (bible.replace(/\s/g, '')) {
      h += '<div class="sdoc-h">' + esc(opts.bibleLabel || '성경 본문  ·  개역개정') + '</div>';
      bible.split(/\n+/).forEach(function (line) { line = line.trim(); if (line) h += '<p class="sdoc-bible">' + esc(line) + '</p>'; });
      h += '<hr class="sdoc-hr">';
    }
    h += '<div class="sdoc-h">설교 원고</div></div>';
    return h;
  }
  function prayerHTML(rec) {
    var p = String((rec && rec.prayer) || '').trim();
    if (!p) return '';
    var body = isHtml(p) ? p : p.split(/\n{2,}/).map(function (x) { return '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>'; }).join('');
    return '<div class="sdoc-prayer"><h2 class="sdoc-prayer-h">기도</h2>' + body + '</div>';
  }
  // 한 문서 전체(앞부분 + 원고 + 기도) — 인쇄·발표자가 그대로 흘려 넣는다
  function composeHTML(rec, opts) {
    var u = unwrap(rec && rec.content);
    var body = isHtml(u.inner) ? u.inner : plainToHtml(u.inner);
    if (!body.replace(/<[^>]+>/g, '').replace(/\s|&nbsp;/g, '')) body = '<p class="sdoc-empty">(설교 원고가 비어 있습니다)</p>';
    // 원고는 편집기(.sedit-pm)와 같은 공백 규칙(.sdoc-text)으로 — 그래야 줄바꿈·쪽이 편집 화면과 똑같다
    return { html: frontMatterHTML(rec, opts) + '<div class="sdoc-text">' + body + '</div>' + prayerHTML(rec), lh: u.lh, ls: u.ls, page: settingsFrom(u.page || (opts && opts.page)) };
  }

  // ── 줄 상자 계산 ────────────────────────────────────────────
  //  Range.getClientRects 는 줄마다가 아니라 '인라인 조각(굵게·색·형광펜…)마다' 상자를 준다.
  //  세로로 겹치는 조각을 한 줄로 묶어야 단어가 쪽 경계에서 "의|미"처럼 쪼개지지 않는다.
  function groupLineRects(rects, originTop) {
    var lines = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.width <= 0 && r.height <= 0) continue;
      var top = r.top - originTop, bottom = r.bottom - originTop;
      var L = lines.length ? lines[lines.length - 1] : null;
      if (L && top < L.bottom - 2) { if (top < L.top) L.top = top; if (bottom > L.bottom) L.bottom = bottom; }
      else lines.push({ top: top, bottom: bottom });
    }
    return lines;
  }
  function lineBoxes(el, originTop) {
    var r = document.createRange(); r.selectNodeContents(el);
    return groupLineRects(r.getClientRects(), originTop);
  }
  // el 안에서 lineTop(흐름 좌표) 줄의 첫 글자 위치 — 글자 하나짜리 Range 의 윗변으로 판정(이분 탐색)
  function charPosAtLine(el, lineTop, originTop) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], total = 0, tn;
    while ((tn = walker.nextNode())) { if (tn.data.length) { nodes.push({ node: tn, start: total, len: tn.data.length }); total += tn.data.length; } }
    if (!total) return null;
    function posAt(idx) { for (var i = 0; i < nodes.length; i++) { if (idx < nodes[i].start + nodes[i].len) return { node: nodes[i].node, offset: idx - nodes[i].start }; } var L = nodes[nodes.length - 1]; return { node: L.node, offset: L.len }; }
    function topAt(idx) {
      var a = posAt(idx), r = document.createRange();
      r.setStart(a.node, a.offset);
      try { r.setEnd(a.node, Math.min(a.node.data.length, a.offset + 1)); } catch (e) { return 1e9; }
      var rect = r.getBoundingClientRect();
      if (!rect.width && !rect.height) return -1e9;   // 줄바꿈 공백 등 상자 없는 글자 — 앞쪽으로 취급
      return rect.top - originTop;
    }
    var lo = 0, hi = total - 1, found = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (topAt(mid) >= lineTop - 0.5) { found = mid; hi = mid - 1; } else lo = mid + 1; }
    if (found <= 0) return null;
    var p = posAt(found);
    // 분할점이 텍스트 노드 끝이면 '다음 노드의 시작'으로 — 사이에 낀 빈 인라인이 뒷쪽으로 쓸려가지 않게
    if (p.offset >= p.node.data.length) for (var k = 0; k < nodes.length; k++) if (nodes[k].node === p.node && k + 1 < nodes.length) { p = { node: nodes[k + 1].node, offset: 0 }; break; }
    return p;
  }

  var LEAF_BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,table,div,hr,figure,pre';
  function isBreakMarker(el) { return el.nodeType === 1 && el.classList.contains('pg-manual-break'); }
  function isAtomic(el) { return /^(TABLE|HR|IMG|IFRAME|FIGURE|VIDEO)$/.test(el.tagName); }
  function isHeading(el) { return !!el && el.nodeType === 1 && /^H[1-6]$/.test(el.tagName); }
  function blockRect(el, originTop) { var r = el.getBoundingClientRect(); return { top: r.top - originTop, bottom: r.bottom - originTop }; }

  // 한 쪽에 들어갈 수 있는 끝을 찾는다. 반환:
  //   null → 전부 들어감 / { before: el } → el 앞에서 나눔 / { pos: {node, offset}, lineTop } → 글자 위치에서 나눔(문단 중간)
  //   { consume: el } → 수동 쪽 나눔 표시 el 을 삭제한 뒤 그 다음부터 새 쪽
  //  pageStart: 이 컨테이너의 첫 블록이 쪽 맨 위인가 (비어 있는 쪽을 만들지 않기 위해 — 한 줄은 반드시 넣는다)
  //  fromY: 이 y(흐름 좌표) 위쪽은 이미 앞 쪽에 들어간 것으로 본다 — 편집기처럼 내용을 잘라 내지 않고
  //         한 흐름 위에서 쪽을 거듭 찾을 때 쓴다(인쇄는 잘라 내므로 늘 0)
  function findBreak(container, limitY, originTop, pageStart, fromY) {
    fromY = fromY || 0;
    var kids = container.children;
    var seen = false;   // 이 컨테이너에서 fromY 아래의 첫 블록을 만났는가(그 블록이 쪽 첫 블록)
    for (var i = 0; i < kids.length; i++) {
      var b = kids[i];
      var br = blockRect(b, originTop);
      if (isBreakMarker(b)) {
        if (br.top <= fromY + 0.5 && fromY > 0) continue;   // 이미 지나온(앞 쪽에서 처리한) 나눔 표시
        // 쪽 맨 위의 수동 나눔은 뜻이 없다(빈 쪽 방지) — 인쇄 흐름에서는 지우고, 편집기 흐름(fromY>0)에서는 건너뛴다
        if (pageStart && !seen) { if (!fromY) { b.remove(); i--; } continue; }
        return { consume: b };
      }
      if (fromY > 0 && br.bottom <= fromY + 0.5) continue;   // 앞 쪽에 이미 들어간 블록
      if (br.bottom <= limitY + 0.5) { pageStart = false; seen = true; continue; }   // 들어감
      var first = pageStart && !seen;
      seen = true;
      // ── 넘치는 블록 ──
      if (isAtomic(b)) return first ? (b.nextElementSibling ? { before: b.nextElementSibling } : null) : { before: b };   // 표·그림: 통째로(쪽 첫 블록이면 넘쳐도 넣는다)
      if (b.querySelector(LEAF_BLOCK_SEL)) {
        // 목록·인용·셀 같은 묶음: 안으로 들어가 나눌 자리를 찾는다
        var inner = findBreak(b, limitY, originTop, first, fromY);
        if (inner && inner.before && inner.before === b.firstElementChild && !first) return keepWithPrev(container, b);   // 안의 첫 블록부터 안 들어감 → 묶음 앞에서
        if (inner) return inner;
        return first ? (b.nextElementSibling ? { before: b.nextElementSibling } : null) : keepWithPrev(container, b);
      }
      // 잎 블록(문단·제목·항목): 줄 단위로 나눈다. fromY 위의 줄은 앞 쪽 것이므로 뺀다
      var lines = lineBoxes(b, originTop).filter(function (L) { return !(fromY > 0 && L.bottom <= fromY + 0.5); });
      var straddles = fromY > 0 && br.top < fromY - 0.5;   // 앞 쪽에서 잘려 이어지는 문단
      if (!lines.length) return first ? (b.nextElementSibling ? { before: b.nextElementSibling } : null) : { before: b };
      var bad = -1;
      for (var li = 0; li < lines.length; li++) if (lines[li].bottom > limitY + 0.5) { bad = li; break; }
      if (bad < 0) { pageStart = false; continue; }   // 상자(여백)만 넘고 글줄은 다 들어감
      // 홀로 남는 줄 막기(워드의 '외톨이 줄' 기본값 2줄): 뒤에 한 줄만 남으면 한 줄 더 넘기고, 앞에 한 줄만 남으면 문단째 넘긴다
      if (lines.length - bad === 1 && bad >= 2) bad--;
      if (bad <= 1 && !first && !straddles) return keepWithPrev(container, b);
      if (bad === 0) bad = 1;   // 쪽 첫 문단인데 첫 줄도 안 들어가는 경우(여백보다 큰 줄) — 그래도 한 줄은 넣는다
      var pos = charPosAtLine(b, lines[bad].top, originTop);
      if (!pos) return first ? (b.nextElementSibling ? { before: b.nextElementSibling } : null) : keepWithPrev(container, b);
      // lineTop = 넘치는 줄의 '줄 상자' 윗변 — 글자 상자 사이의 행간 한가운데(앞 줄 글자 바닥과 이 줄 글자 윗변의 중간)
      return { pos: pos, lineTop: bad > 0 ? (lines[bad - 1].bottom + lines[bad].top) / 2 : lines[bad].top };
    }
    return null;
  }
  // 블록 앞에서 나누되, 바로 앞이 제목이면 제목도 함께 다음 쪽으로(제목이 쪽 끝에 홀로 남지 않게)
  function keepWithPrev(container, b) {
    var pv = b.previousElementSibling;
    if (isHeading(pv) && pv !== container.firstElementChild) return { before: pv };
    return { before: b };
  }

  // flow 안의 내용을 쪽마다 잘라 pages 로 옮긴다. flow 는 쪽 본문 폭(innerW)으로 놓인 보이지 않는 흐름 상자.
  //  각 쪽은 { el: 쪽 요소, body: 본문 요소 } — 머리글·쪽번호는 호출한 쪽이 덧붙인다(decoratePage).
  function paginate(flow, m, maxPages) {
    var pages = [];
    maxPages = maxPages || 400;
    // 흐름 상자는 측정 기준점. 쪽 본문 높이(innerH)만큼 잘라 낸다.
    var guard = 0;
    while (flow.firstChild && guard++ < maxPages) {
      // 맨 앞 공백 텍스트 제거
      while (flow.firstChild && flow.firstChild.nodeType === 3 && !flow.firstChild.textContent.trim()) flow.removeChild(flow.firstChild);
      if (!flow.firstChild) break;
      var originTop = flow.getBoundingClientRect().top;
      var brk = findBreak(flow, m.innerH, originTop, true);
      var range = document.createRange();
      range.setStart(flow, 0);
      var consumed = null;
      if (!brk) range.setEnd(flow, flow.childNodes.length);
      else if (brk.consume) { range.setEndBefore(brk.consume); consumed = brk.consume; }
      else if (brk.before) range.setEndBefore(brk.before);
      else range.setEnd(brk.pos.node, brk.pos.offset);
      var frag = range.extractContents();
      if (consumed) consumed.remove();
      // 문단 중간에서 잘렸으면: 앞조각은 아래 여백 0, 이어지는 뒷조각은 위 여백 0 (워드처럼 줄이 그대로 이어짐)
      if (brk && brk.pos) {
        markSplitHead(frag);
        var tail = flow.firstElementChild;
        if (tail) {
          markSplitTail(tail);
          // 번호 목록이 항목 중간에서 갈라지면 뒷조각 첫 항목은 '같은 번호'(이어지는 항목)
          var headOl = lastDeep(frag, 'OL');
          if (headOl && tail.tagName === 'OL') tail.setAttribute('start', String((Number(headOl.getAttribute('start')) || 1) + headOl.children.length - 1));
        }
      } else if (brk && brk.before) {
        // 묶음(목록) 안에서 항목 사이로 갈라져도 번호는 이어진다
        var headOl2 = lastDeep(frag, 'OL'), tail2 = flow.firstElementChild;
        if (headOl2 && tail2 && tail2.tagName === 'OL') tail2.setAttribute('start', String((Number(headOl2.getAttribute('start')) || 1) + headOl2.children.length));
      }
      if (!frag.firstChild && !brk) break;
      pages.push(frag);
      if (!brk) break;
    }
    return pages;
  }
  function markSplitHead(frag) {
    // extractContents 가 복제한 '부분 포함' 조상들 = 조각의 마지막 자식 사슬 (문단 앞조각 — 아래 여백 0)
    var el = frag.lastElementChild;
    while (el) { el.setAttribute('data-sdoc-head', '1'); el = el.lastElementChild; }
  }
  function markSplitTail(tail) {
    // 흐름에 남은 원래 요소의 첫 자식 사슬 = 뒷조각 (위 여백 0, 목록 항목이면 글머리 기호 없이 이어짐)
    var el = tail;
    while (el) { el.setAttribute('data-sdoc-cont', '1'); el = el.firstElementChild; }
  }
  function lastDeep(frag, tag) {
    var el = frag.lastElementChild, hit = null;
    while (el) { if (el.tagName === tag) hit = el; el = el.lastElementChild; }
    return hit;
  }

  // ── 쪽 요소 만들기(머리글·바닥글·꺾쇠) ──
  function headerText(s, rec) {
    if (s.header === 'title') return rec.title || '';
    if (s.header === 'title-date') return [rec.title, fmtDateK(rec.sermon_date)].filter(Boolean).join('  ·  ');
    if (s.header === 'custom') return s.headerText || '';
    return '';
  }
  function pageNumText(s, i, n) { var f = PGNUM_FMT[s.pgnum]; return f ? f.replace('{i}', i).replace('{n}', n) : ''; }
  function makePage(m, s, rec, i, n, frag) {
    var pg = document.createElement('div'); pg.className = 'sdoc-page';
    pg.style.width = m.pw + 'px'; pg.style.height = m.ph + 'px'; pg.style.padding = m.mg + 'px';
    var hd = headerText(s, rec), fo = pageNumText(s, i, n);
    if (hd) { var h = document.createElement('div'); h.className = 'sdoc-head'; h.style.top = Math.max(6, Math.round(m.mg * 0.42)) + 'px'; h.style.left = m.mg + 'px'; h.style.right = m.mg + 'px'; h.textContent = hd; pg.appendChild(h); }
    var body = document.createElement('div'); body.className = 'sdoc sdoc-body'; body.style.height = m.innerH + 'px';
    if (frag) body.appendChild(frag);
    pg.appendChild(body);
    if (fo) { var f = document.createElement('div'); f.className = 'sdoc-foot'; f.style.bottom = Math.max(6, Math.round(m.mg * 0.4)) + 'px'; f.style.left = m.mg + 'px'; f.style.right = m.mg + 'px'; f.textContent = fo; pg.appendChild(f); }
    return pg;
  }

  function waitImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (im) {
      if (im.complete) return Promise.resolve();
      return new Promise(function (res) { im.onload = im.onerror = function () { res(); }; setTimeout(res, 8000); });
    }));
  }
  // requestAnimationFrame 이 아니라 setTimeout — 창 없는(headless) 브라우저가 PDF 를 찍을 때는 화면 프레임이 돌지 않아
  // rAF 콜백이 영영 안 오고 빈 쪽만 찍혔다(2026-10-13). 타이머는 가상 시간으로 앞당겨져 확실히 실행된다.
  function nextFrame() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // 문서를 쪽으로 그려 mount 에 넣는다. 돌려주는 Promise → { pages: [el], total, metrics, settings }
  //  rec: sermons 한 건, opts: { settings, seriesLine, hymnLine, bibleLabel, html(이미 합친 HTML 을 쓸 때), lh, ls }
  function renderPages(mount, rec, opts) {
    opts = opts || {};
    var comp = opts.html != null ? { html: opts.html, lh: opts.lh || '', ls: opts.ls || '', page: settingsFrom(opts.settings) } : composeHTML(rec, opts);
    var s = settingsFrom(opts.settings || comp.page), m = metrics(s);
    var doc = mount.ownerDocument || document;
    // 보이지 않는 흐름 상자 — 쪽 본문과 똑같은 폭·글꼴·줄간격으로 한 번에 흘려 놓고 잘라 낸다
    var flow = doc.createElement('div'); flow.className = 'sdoc sdoc-flow';
    flow.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;width:' + m.innerW + 'px;';
    if (comp.lh) flow.style.lineHeight = comp.lh;
    if (comp.ls) flow.style.letterSpacing = /^-?[\d.]+$/.test(comp.ls) ? comp.ls + 'px' : comp.ls;
    flow.innerHTML = comp.html;
    // 빈 문단(빈 줄)은 편집기에서 한 줄 높이를 차지한다 — 인쇄도 같게 <br> 을 넣어 준다
    Array.prototype.forEach.call(flow.querySelectorAll('p:empty,h1:empty,h2:empty,h3:empty,li:empty'), function (p) { p.appendChild(doc.createElement('br')); });
    doc.body.appendChild(flow);
    return nextFrame().then(function () { return (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : null; })
      .then(function () { return waitImages(flow); })
      .then(nextFrame)
      .then(function () {
        var frags = paginate(flow, m);
        flow.remove();
        var total = Math.max(1, frags.length);
        mount.innerHTML = '';
        var pages = [];
        if (!frags.length) frags.push(null);
        frags.forEach(function (fr, i) {
          var pg = makePage(m, s, rec || {}, i + 1, total, fr);
          if (comp.lh) pg.querySelector('.sdoc-body').style.lineHeight = comp.lh;
          if (comp.ls) pg.querySelector('.sdoc-body').style.letterSpacing = /^-?[\d.]+$/.test(comp.ls) ? comp.ls + 'px' : comp.ls;
          mount.appendChild(pg); pages.push(pg);
        });
        return { pages: pages, total: total, metrics: m, settings: s };
      });
  }
  // 인쇄용 @page 규칙 — 쪽 크기를 용지와 똑같이, 브라우저 여백 0 (여백은 쪽 안에서 우리가 준다)
  function pageCSS(s) { var m = metrics(s); return '@page{size:' + m.wmm + 'mm ' + m.hmm + 'mm;margin:0}'; }

  return {
    MMPX: MMPX, PAPERS: PAPERS, PGNUM_FMT: PGNUM_FMT, HEADERS: HEADERS, DEFAULTS: DEFAULTS,
    esc: esc, fmtDateK: fmtDateK, isHtml: isHtml, plainToHtml: plainToHtml,
    settingsFrom: settingsFrom, metrics: metrics, unwrap: unwrap, wrap: wrap,
    frontMatterHTML: frontMatterHTML, prayerHTML: prayerHTML, composeHTML: composeHTML,
    groupLineRects: groupLineRects, lineBoxes: lineBoxes, charPosAtLine: charPosAtLine, findBreak: findBreak,
    paginate: paginate, makePage: makePage, renderPages: renderPages, pageCSS: pageCSS, headerText: headerText, pageNumText: pageNumText
  };
})();
