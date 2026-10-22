/* ============================================================
   운평장로교회 — 설교 원고 편집기 엔진 (window.SermonEditor)

   브라우저 기본 편집기(contenteditable + execCommand) 대신 ProseMirror(js/vendor/prosemirror.min.js, MIT) 위에 만든
   워드식 편집기. 설교 매니저(affairs.js sermonEditor)가 리본·저장과 연결해 쓴다.

   · 저장 형식은 그대로 HTML(sermons.content) — 스키마의 toDOM 이 예전 편집기가 쓰던 태그(<p>·<h2>·<b>·<mark>·
     <span style="color…">·.se-chk·.se-note·.pg-manual-break 등)를 그대로 내보내므로 발표자 모드·카카오·AI 등
     다른 화면은 손대지 않아도 된다. 예전 원고도 parseDOM 규칙으로 그대로 읽힌다.
   · 쪽 나눔은 인쇄(js/sermon-doc.js)와 **같은 계산**을 쓴다: 원고를 보이지 않는 깨끗한 흐름에 복제해 쪽 경계를 찾고,
     편집 화면에는 그 자리에 '간격'(데코레이션)만 끼워 넣는다. 문서 자체는 손대지 않으니 실행취소·커서가 흔들리지 않는다.
   · 앞부분(제목·본문 성경)과 기도는 편집기 위아래에 붙는 고정 영역 — 인쇄 첫 쪽·마지막 쪽과 같은 모양.
   ============================================================ */
window.SermonEditor = (function () {
  'use strict';
  var PM = window.PM, SD = window.SermonDoc;
  if (!PM || !SD) { return { create: function () { throw new Error('ProseMirror 번들(js/vendor/prosemirror.min.js)과 js/sermon-doc.js 가 먼저 실려야 합니다.'); } }; }
  var M = PM.model, S = PM.state, V = PM.view, C = PM.commands, H = PM.history, K = PM.keymap, IR = PM.inputrules, L = PM.schemaList, T = PM.tables, G = PM.gapcursor, D = PM.dropcursor, SR = PM.search;
  var Schema = M.Schema, DOMParser = M.DOMParser, DOMSerializer = M.DOMSerializer, Fragment = M.Fragment;
  var EditorState = S.EditorState, Plugin = S.Plugin, PluginKey = S.PluginKey, TextSelection = S.TextSelection, NodeSelection = S.NodeSelection, Selection = S.Selection;
  var EditorView = V.EditorView, Decoration = V.Decoration, DecorationSet = V.DecorationSet;

  // ── 글자 크기 값 정리: px 숫자로 ─────────────────────────────
  var SIZE_KEY = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
  var FONT_SIZE_ATTR = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };   // 옛 <font size=N>
  function pxOf(v) {
    v = String(v || '').trim().toLowerCase();
    if (!v) return null;
    if (SIZE_KEY[v]) return SIZE_KEY[v];
    var m = v.match(/^([\d.]+)\s*(px|pt|em|rem|%)?$/); if (!m) return null;
    var n = parseFloat(m[1]), u = m[2] || 'px';
    if (u === 'pt') n = n * 4 / 3; else if (u === 'em' || u === 'rem') n = n * 18; else if (u === '%') n = n * 18 / 100;
    n = Math.round(n * 10) / 10;
    return (n >= 6 && n <= 120) ? n : null;
  }
  function isBoldWeight(v) { v = String(v || '').trim(); return /^(bold|bolder)$/i.test(v) || (parseInt(v, 10) || 0) >= 600; }
  function isNormalWeight(v) { v = String(v || '').trim(); return /^(normal|lighter)$/i.test(v) || ((parseInt(v, 10) || 999) < 600); }
  function cleanColor(v) { v = String(v || '').trim(); if (!v || /^(transparent|inherit|initial|unset|currentcolor)$/i.test(v) || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(v)) return null; return v; }
  function alignOf(dom) { var a = (dom.style && dom.style.textAlign) || dom.getAttribute('align') || ''; a = String(a).toLowerCase(); return /^(center|right|justify)$/.test(a) ? a : null; }
  function alignStyle(attrs) { return attrs.align ? { style: 'text-align:' + attrs.align } : {}; }

  // ── 스키마 ──────────────────────────────────────────────────
  var nodes = {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*', group: 'block', attrs: { align: { default: null } },
      parseDOM: [{ tag: 'p', getAttrs: function (d) { return { align: alignOf(d) }; } }, { tag: 'div', getAttrs: function (d) { return (d.classList.contains('pg-manual-break') || d.classList.contains('sdoc-video')) ? false : { align: alignOf(d) }; } }],
      toDOM: function (n) { return ['p', alignStyle(n.attrs), 0]; }
    },
    heading: {
      content: 'inline*', group: 'block', defining: true, attrs: { level: { default: 2 }, align: { default: null } },
      parseDOM: [1, 2, 3, 4, 5, 6].map(function (l) { return { tag: 'h' + l, getAttrs: function (d) { return { level: Math.min(3, l), align: alignOf(d) }; } }; }),
      toDOM: function (n) { return ['h' + n.attrs.level, alignStyle(n.attrs), 0]; }
    },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: function () { return ['blockquote', 0]; } },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: function () { return ['hr']; } },
    page_break: {   // Ctrl+Enter 수동 쪽 나눔 — 인쇄·발표자 모드에서 쪽을 가른다
      group: 'block', atom: true, selectable: true,
      parseDOM: [{ tag: 'div.pg-manual-break' }, { tag: '[data-pgbreak]' }],
      toDOM: function () { return ['div', { 'class': 'pg-manual-break', 'data-pgbreak': '1' }]; }
    },
    video: {   // 유튜브 등 영상 — 블록
      group: 'block', atom: true, selectable: true, attrs: { src: {} },
      parseDOM: [{ tag: 'iframe[src]', getAttrs: function (d) { return { src: d.getAttribute('src') }; } }, { tag: 'div.sdoc-video', getAttrs: function (d) { var f = d.querySelector('iframe'); return f ? { src: f.getAttribute('src') } : false; } }],
      toDOM: function (n) { return ['div', { 'class': 'sdoc-video' }, ['iframe', { src: n.attrs.src, allowfullscreen: '', style: 'width:100%;aspect-ratio:16/9;border:0;border-radius:8px' }]]; }
    },
    image: {
      inline: true, group: 'inline', draggable: true, attrs: { src: {}, alt: { default: '' }, width: { default: null } },
      parseDOM: [{ tag: 'img[src]', getAttrs: function (d) { return { src: d.getAttribute('src'), alt: d.getAttribute('alt') || '', width: d.style.width || d.getAttribute('width') || null }; } }],
      toDOM: function (n) { var a = { src: n.attrs.src, alt: n.attrs.alt || '' }; if (n.attrs.width) a.style = 'width:' + n.attrs.width + (/^\d+$/.test(n.attrs.width) ? 'px' : ''); return ['img', a]; }
    },
    checkbox: {   // 클릭으로 ☐/☑ 를 오가는 인라인 기호
      inline: true, group: 'inline', atom: true, selectable: false, attrs: { on: { default: false } },
      parseDOM: [{ tag: 'span.se-chk', getAttrs: function (d) { return { on: d.getAttribute('data-on') === '1' || /☑/.test(d.textContent) }; } }],
      toDOM: function (n) { return ['span', { 'class': 'se-chk', 'data-on': n.attrs.on ? '1' : '0', contenteditable: 'false' }, n.attrs.on ? '☑' : '☐']; }
    },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: function () { return ['br']; } },
    text: { group: 'inline' }
  };
  var marks = {
    link: { attrs: { href: {}, cls: { default: null } }, inclusive: false, parseDOM: [{ tag: 'a[href]', getAttrs: function (d) { return { href: d.getAttribute('href'), cls: d.getAttribute('class') || null }; } }], toDOM: function (m) { var a = { href: m.attrs.href, target: '_blank', rel: 'noopener' }; if (m.attrs.cls) a['class'] = m.attrs.cls; return ['a', a, 0]; } },
    note: { attrs: { text: { default: '' } }, inclusive: false, parseDOM: [{ tag: 'span.se-note', getAttrs: function (d) { return { text: d.getAttribute('title') || '' }; } }], toDOM: function (m) { return ['span', { 'class': 'se-note', title: m.attrs.text }, 0]; } },
    font_family: { attrs: { family: {} }, parseDOM: [{ style: 'font-family', getAttrs: function (v) { v = String(v || '').trim(); return v && !/^inherit$/i.test(v) ? { family: v } : false; } }, { tag: 'font[face]', getAttrs: function (d) { return { family: d.getAttribute('face') }; } }], toDOM: function (m) { return ['span', { style: 'font-family:' + m.attrs.family }, 0]; } },
    font_size: { attrs: { size: {} }, parseDOM: [{ style: 'font-size', getAttrs: function (v) { var px = pxOf(v); return px ? { size: px } : false; } }, { tag: 'font[size]', getAttrs: function (d) { var px = FONT_SIZE_ATTR[d.getAttribute('size')]; return px ? { size: px } : false; } }], toDOM: function (m) { return ['span', { style: 'font-size:' + m.attrs.size + 'px' }, 0]; } },
    color: { attrs: { color: {} }, parseDOM: [{ style: 'color', getAttrs: function (v) { var c = cleanColor(v); return c ? { color: c } : false; } }, { tag: 'font[color]', getAttrs: function (d) { return { color: d.getAttribute('color') }; } }], toDOM: function (m) { return ['span', { style: 'color:' + m.attrs.color }, 0]; } },
    highlight: { attrs: { color: { default: '#fff59d' } }, parseDOM: [{ tag: 'mark', getAttrs: function (d) { return { color: cleanColor(d.style.backgroundColor) || '#fff59d' }; } }, { style: 'background-color', getAttrs: function (v) { var c = cleanColor(v); return c ? { color: c } : false; } }], toDOM: function (m) { return ['mark', { style: 'background-color:' + m.attrs.color }, 0]; } },
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: function (d) { return d.style.fontWeight !== 'normal' && null; } }, { style: 'font-weight', getAttrs: function (v) { return isBoldWeight(v) && null; } }], toDOM: function () { return ['b', 0]; } },
    italic: { parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }], toDOM: function () { return ['i', 0]; } },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration', getAttrs: function (v) { return /underline/.test(v) && null; } }, { style: 'text-decoration-line', getAttrs: function (v) { return /underline/.test(v) && null; } }], toDOM: function () { return ['u', 0]; } },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }, { style: 'text-decoration', getAttrs: function (v) { return /line-through/.test(v) && null; } }, { style: 'text-decoration-line', getAttrs: function (v) { return /line-through/.test(v) && null; } }], toDOM: function () { return ['s', 0]; } },
    superscript: { excludes: 'subscript', parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }], toDOM: function () { return ['sup', 0]; } },
    subscript: { excludes: 'superscript', parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }], toDOM: function () { return ['sub', 0]; } }
  };
  var base = new Schema({ nodes: nodes, marks: marks });
  var withLists = L.addListNodes(base.spec.nodes, 'paragraph block*', 'block');
  // ordered_list 의 start 를 유지(갈라진 번호 목록 등) — addListNodes 기본 spec 에 toDOM 이 있으나 attrs 순서를 그대로 따름
  var tableSpecs = T.tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {
    background: { default: null, getFromDOM: function (d) { return d.style.backgroundColor || null; }, setDOMAttr: function (v, a) { if (v) a.style = (a.style || '') + 'background-color:' + v + ';'; } }
  } });
  var schema = new Schema({ nodes: withLists.append(tableSpecs), marks: marks });
  var parser = DOMParser.fromSchema(schema), serializer = DOMSerializer.fromSchema(schema);

  // ── HTML ↔ 문서 ─────────────────────────────────────────────
  function htmlToDoc(html) {
    var box = document.createElement('div');
    box.innerHTML = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?o:p[^>]*>/gi, '');
    // 예전 쪽 나눔 흔적(.pg-break-spacer)·커서 마커가 남아 있으면 걷어 낸다
    Array.prototype.forEach.call(box.querySelectorAll('.pg-break-spacer, [data-caretmk]'), function (n) { n.remove(); });
    return parser.parse(box);
  }
  function docToHtml(doc) {
    var box = document.createElement('div');
    box.appendChild(serializer.serializeFragment(doc.content));
    return box.innerHTML;
  }
  function isEmptyDoc(doc) { return doc.childCount === 1 && doc.firstChild.type.name === 'paragraph' && doc.firstChild.content.size === 0; }

  // ── 명령 ────────────────────────────────────────────────────
  function markActive(state, type) {
    var sel = state.selection;
    if (sel.empty) return !!type.isInSet(state.storedMarks || sel.$from.marks());
    return state.doc.rangeHasMark(sel.from, sel.to, type);
  }
  function setMark(type, attrs) {   // 속성 있는 마크(색·글꼴·크기): 선택이 없으면 '다음 입력'에, 있으면 선택 전체에(같은 종류는 바뀐다)
    return function (state, dispatch) {
      var sel = state.selection, tr = state.tr;
      if (sel.empty) tr.addStoredMark(type.create(attrs));
      else { sel.ranges.forEach(function (r) { tr.addMark(r.$from.pos, r.$to.pos, type.create(attrs)); }); }
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    };
  }
  function unsetMark(type) {
    return function (state, dispatch) {
      var sel = state.selection, tr = state.tr;
      if (sel.empty) tr.removeStoredMark(type);
      else sel.ranges.forEach(function (r) { tr.removeMark(r.$from.pos, r.$to.pos, type); });
      if (dispatch) dispatch(tr);
      return true;
    };
  }
  function clearFormat(state, dispatch) {   // 선택 부분의 글자 서식 전부 지우기(링크·메모는 남긴다)
    var sel = state.selection; if (sel.empty) return false;
    var tr = state.tr;
    Object.keys(schema.marks).forEach(function (k) { if (k === 'link' || k === 'note') return; sel.ranges.forEach(function (r) { tr.removeMark(r.$from.pos, r.$to.pos, schema.marks[k]); }); });
    if (dispatch) dispatch(tr);
    return true;
  }
  function setTextblock(nodeType, attrs) {   // 문단 종류 바꾸기 — 정렬은 유지
    return function (state, dispatch) {
      var tr = state.tr, changed = false;
      state.selection.ranges.forEach(function (r) {
        state.doc.nodesBetween(r.$from.pos, r.$to.pos, function (node, pos) {
          if (!node.isTextblock) return;
          if (node.type === nodeType && JSON.stringify(Object.assign({}, node.attrs, attrs)) === JSON.stringify(node.attrs)) return;
          var $pos = tr.doc.resolve(tr.mapping.map(pos));
          var index = $pos.index();
          if (!$pos.parent.canReplaceWith(index, index + 1, nodeType)) return;
          tr.setBlockType(tr.mapping.map(pos), tr.mapping.map(pos) + node.nodeSize, nodeType, Object.assign({ align: node.attrs.align || null }, attrs));
          changed = true;
        });
      });
      if (!changed) return false;
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    };
  }
  function setAlign(align) {
    return function (state, dispatch) {
      var tr = state.tr, changed = false;
      state.selection.ranges.forEach(function (r) {
        state.doc.nodesBetween(r.$from.pos, r.$to.pos, function (node, pos) {
          if (node.isTextblock && node.type.attrs.align) { tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, { align: align })); changed = true; }
        });
      });
      if (!changed) return false;
      if (dispatch) dispatch(tr);
      return true;
    };
  }
  function blockquoteToggle(state, dispatch) {
    var range = state.selection.$from.blockRange(state.selection.$to);
    if (!range) return false;
    var inQuote = false; for (var d = range.depth; d > 0; d--) if (range.$from.node(d).type === schema.nodes.blockquote) { inQuote = true; break; }
    return inQuote ? C.lift(state, dispatch) : C.wrapIn(schema.nodes.blockquote)(state, dispatch);
  }
  function listToggle(listType) {   // 같은 목록이면 풀고, 다른 목록이면 종류만 바꾸고, 아니면 감싼다
    return function (state, dispatch) {
      var $from = state.selection.$from, listNode = null, listPos = -1;
      for (var d = $from.depth; d > 0; d--) { var n = $from.node(d); if (n.type === schema.nodes.bullet_list || n.type === schema.nodes.ordered_list) { listNode = n; listPos = $from.before(d); break; } }
      if (listNode && listNode.type === listType) return L.liftListItem(schema.nodes.list_item)(state, dispatch);
      if (listNode) { if (dispatch) dispatch(state.tr.setNodeMarkup(listPos, listType)); return true; }
      return L.wrapInList(listType)(state, dispatch);
    };
  }
  function insertHtml(html) {
    return function (state, dispatch) {
      var box = document.createElement('div'); box.innerHTML = html;
      var slice = parser.parseSlice(box);
      if (dispatch) dispatch(state.tr.replaceSelection(slice).scrollIntoView());
      return true;
    };
  }
  function insertNodeAfterBlock(node) {   // 영상·쪽 나눔처럼 블록 하나를 지금 문단 뒤(또는 커서 자리에서 문단을 갈라)에 넣는다
    return function (state, dispatch) {
      var tr = state.tr.replaceSelectionWith(node);
      // 넣은 블록 뒤에 빈 문단이 없으면 하나 만들어 커서를 둔다
      var pos = tr.selection.$from.pos;
      var $p = tr.doc.resolve(pos);
      if ($p.parent === tr.doc && $p.nodeAfter == null) { tr.insert(pos, schema.nodes.paragraph.create()); tr.setSelection(TextSelection.create(tr.doc, pos + 1)); }
      else if ($p.parent === tr.doc && $p.nodeAfter && !$p.nodeAfter.isTextblock) { tr.insert(pos, schema.nodes.paragraph.create()); tr.setSelection(TextSelection.create(tr.doc, pos + 1)); }
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    };
  }
  function insertTable(rows, cols) {
    return function (state, dispatch) {
      rows = Math.max(1, Math.min(30, rows || 2)); cols = Math.max(1, Math.min(10, cols || 2));
      var cells = [], rowsN = [];
      for (var r = 0; r < rows; r++) {
        cells = [];
        for (var c = 0; c < cols; c++) cells.push((r === 0 ? schema.nodes.table_header : schema.nodes.table_cell).createAndFill());
        rowsN.push(schema.nodes.table_row.create(null, cells));
      }
      var table = schema.nodes.table.create(null, rowsN);
      var tr = state.tr.replaceSelectionWith(table);
      // 첫 칸으로 커서 — 넣은 표를 찾아 표(+1)·행(+1)·칸(+1)·문단(+1) 안으로
      var around = tr.mapping.map(state.selection.from), found = -1;
      tr.doc.nodesBetween(Math.max(0, around - table.nodeSize - 2), Math.min(tr.doc.content.size, around + 2), function (n, p) { if (found < 0 && n.type === schema.nodes.table) found = p; });
      if (found >= 0) { try { tr.setSelection(TextSelection.create(tr.doc, found + 4)); } catch (e) { } }
      if (dispatch) dispatch(tr.scrollIntoView());
      return true;
    };
  }
  function noteCmd(text) {
    return function (state, dispatch) {
      var sel = state.selection, mark = schema.marks.note.create({ text: text });
      var tr = state.tr;
      if (sel.empty) tr.replaceSelectionWith(schema.text('[메모]', [mark]), false);
      else sel.ranges.forEach(function (r) { tr.addMark(r.$from.pos, r.$to.pos, mark); });
      if (dispatch) dispatch(tr);
      return true;
    };
  }

  // ── 붙여넣기 정리: Word·한글·웹의 군더더기 제거 ──────────────
  var PASTE_MAX = 300 * 1024;
  function transformPastedHTML(html) {
    html = String(html || '');
    if (html.length > PASTE_MAX) return '';   // 너무 크면 평문 경로로(handlePaste 가 처리)
    return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?o:p[^>]*>/gi, '').replace(/<(meta|link|style|script)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<(meta|link)[^>]*>/gi, '').replace(/\sclass="(Mso[^"]*|[^"]*\bmso[^"]*)"/gi, '');
  }

  // ── 쪽 나눔(페이저): 깨끗한 복제 흐름에서 경계를 찾아 데코레이션 간격으로 그린다 ──
  var pagerKey = new PluginKey('sermonPager');
  var GAP = 26;   // 쪽 사이 어두운 간격(px) — 화면용
  function pathOf(node, root) {   // root 기준 자식 인덱스 경로(간격 요소는 세지 않는다)
    var path = [];
    while (node && node !== root) {
      var p = node.parentNode, i = 0, c = p.firstChild;
      while (c && c !== node) { if (!(c.nodeType === 1 && c.classList.contains('sedit-gap'))) i++; c = c.nextSibling; }
      path.unshift(i); node = p;
    }
    return node === root ? path : null;
  }
  function nodeAt(root, path) {
    var node = root;
    for (var k = 0; k < path.length; k++) {
      var i = path[k], c = node.firstChild;
      while (c) { if (!(c.nodeType === 1 && c.classList.contains('sedit-gap'))) { if (i === 0) break; i--; } c = c.nextSibling; }
      if (!c) return null; node = c;
    }
    return node;
  }
  function gapEl(h, inline) {
    var el = document.createElement(inline ? 'span' : 'div');
    el.className = 'sedit-gap' + (inline ? ' sedit-gap-inline' : '');
    el.setAttribute('contenteditable', 'false');
    el.style.cssText = 'display:block;height:' + Math.max(0, Math.round(h)) + 'px;pointer-events:none;user-select:none';
    return el;
  }

  // ── 편집기 만들기 ────────────────────────────────────────────
  //  opts: { mount(필수: 쪽 안의 편집 영역을 넣을 요소), html, meta:{lh, ls, page}, front(앞부분 요소) , prayer(기도 요소),
  //         page(쪽 요소 — 배경·오버레이), overlay(머리글·쪽번호 레이어), getZoom(), onUpdate(), onSelection(), onPages(n), uploadImage(file)→Promise<url> }
  function create(opts) {
    opts = opts || {};
    var mount = opts.mount; if (!mount) throw new Error('mount 가 필요합니다.');
    var listeners = { update: [], selection: [], pages: [] };
    function emit(k, a) { listeners[k].forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); }
    var meta = { lh: (opts.meta && opts.meta.lh) || '', ls: (opts.meta && opts.meta.ls) || '', page: SD.settingsFrom(opts.meta && opts.meta.page) };

    var pagerPlugin = new Plugin({
      key: pagerKey,
      state: {
        init: function () { return DecorationSet.empty; },
        apply: function (tr, set) { var m = tr.getMeta(pagerKey); if (m && m.set) return m.set; return set.map(tr.mapping, tr.doc); }
      },
      props: { decorations: function (state) { return pagerKey.getState(state); } },
      view: function () { return { update: function (view, prev) { if (view.state.doc !== prev.doc) pager.schedule(); }, destroy: function () { pager.stop(); } }; }
    });
    var listKeys = {
      Enter: L.splitListItem(schema.nodes.list_item),
      Tab: C.chainCommands(T.goToNextCell(1), L.sinkListItem(schema.nodes.list_item)),
      'Shift-Tab': C.chainCommands(T.goToNextCell(-1), L.liftListItem(schema.nodes.list_item))
    };
    var keys = {
      'Mod-z': H.undo, 'Mod-y': H.redo, 'Mod-Shift-z': H.redo,
      'Mod-b': C.toggleMark(schema.marks.bold), 'Mod-i': C.toggleMark(schema.marks.italic), 'Mod-u': C.toggleMark(schema.marks.underline),
      'Mod-Enter': function (state, dispatch) { return insertNodeAfterBlock(schema.nodes.page_break.create())(state, dispatch); },
      'Shift-Enter': function (state, dispatch) { if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; },
      Backspace: C.chainCommands(IR.undoInputRule, C.deleteSelection, C.joinBackward, C.selectNodeBackward),
      'Mod-f': function () { if (editor.onFind) { editor.onFind(); return true; } return false; }
    };
    var rules = IR.inputRules({ rules: [
      IR.wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
      IR.wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, function (m) { return { order: +m[1] }; }, function (m, node) { return node.childCount + node.attrs.order === +m[1]; }),
      IR.wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote)
    ] });
    var plugins = [
      rules, K.keymap(listKeys), K.keymap(keys), K.keymap(C.baseKeymap),
      D.dropCursor({ color: '#032257', width: 2 }), G.gapCursor(),
      T.columnResizing({}), T.tableEditing(),
      H.history({ depth: 200, newGroupDelay: 500 }),
      SR.search({ wrapping: true }),
      pagerPlugin
    ];
    var state = EditorState.create({ doc: htmlToDoc(opts.html || ''), plugins: plugins });
    var view = new EditorView(mount, {
      state: state,
      attributes: { 'class': 'sdoc sedit-pm', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' },
      dispatchTransaction: function (tr) {
        var st = view.state.apply(tr);
        view.updateState(st);
        if (tr.docChanged) emit('update', { tr: tr });
        if (tr.selectionSet || tr.docChanged || tr.storedMarksSet) emit('selection', null);
      },
      transformPastedHTML: transformPastedHTML,
      handlePaste: function (v, e, slice) {
        var cd = e.clipboardData; if (!cd) return false;
        var html = ''; try { html = cd.getData('text/html') || ''; } catch (err) { }
        if (html && html.length > PASTE_MAX) {   // 웹페이지 통째 등 — 평문으로
          var text = ''; try { text = cd.getData('text/plain') || ''; } catch (err) { }
          if (!text) return false;
          var paras = text.split(/\n{2,}/).map(function (p) { var lines = p.split('\n'), content = []; lines.forEach(function (l, i) { if (i) content.push(schema.nodes.hard_break.create()); if (l) content.push(schema.text(l)); }); return schema.nodes.paragraph.create(null, content); });
          v.dispatch(v.state.tr.replaceSelection(new M.Slice(Fragment.from(paras), 0, 0)).scrollIntoView());
          if (editor.onNotice) editor.onNotice('붙여넣은 서식이 너무 커서(' + Math.round(html.length / 1024) + 'KB) 서식 없이 평문으로 넣었습니다.');
          return true;
        }
        return false;
      },
      handleClickOn: function (v, pos, node, nodePos, e) {
        if (node.type === schema.nodes.checkbox) { v.dispatch(v.state.tr.setNodeMarkup(nodePos, null, { on: !node.attrs.on })); e.preventDefault(); return true; }
        return false;
      },
      handleDOMEvents: {
        compositionend: function () { pager.schedule(); return false; }
      }
    });
    view.dom.style.lineHeight = meta.lh || '';
    view.dom.style.letterSpacing = meta.ls ? (/^-?[\d.]+$/.test(meta.ls) ? meta.ls + 'px' : meta.ls) : '';

    // ── 페이저 ──
    var pager = (function () {
      var timer = null, stopped = false, breaks = [], pageCount = 1, verifying = 0, widgetGaps = [];
      function settings() { return meta.page; }
      function zoom() { return (opts.getZoom && opts.getZoom()) || 1; }
      function column() { return mount.parentNode; }   // 앞부분 + 편집기 + 기도가 들어 있는 세로 흐름(쪽 안)
      function schedule(ms) { if (stopped) return; clearTimeout(timer); timer = setTimeout(run, ms == null ? 120 : ms); }
      function stop() { stopped = true; clearTimeout(timer); }
      function clearWidgetGaps() { widgetGaps.forEach(function (g) { var p = g.parentNode; if (p) { p.removeChild(g); p.normalize(); } }); widgetGaps = []; }
      function run() {
        if (stopped) return;
        if (view.composing) { schedule(200); return; }
        var m = SD.metrics(settings()), col = column();
        if (!col) return;
        // 앞부분·기도에 직접 끼웠던 간격을 먼저 걷어 낸다(갈라진 텍스트 노드도 합쳐) — 복제·경로 계산이 그 구조를 기준으로 한다
        clearWidgetGaps();
        Array.prototype.forEach.call(col.querySelectorAll('.sedit-pagefirst-x'), function (n) { n.classList.remove('sedit-pagefirst-x'); });
        // 1) 깨끗한 흐름 복제: 앞부분·원고·기도를 한 상자에, 간격 요소는 뺀다 — 인쇄와 똑같은 레이아웃
        var flow = document.createElement('div'); flow.className = 'sdoc sdoc-flow';
        flow.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;width:' + m.innerW + 'px;';
        var live = [], clones = [];
        Array.prototype.forEach.call(col.children, function (ch) {
          if (ch.classList.contains('sedit-overlay') || ch.classList.contains('sedit-crop')) return;
          var c = ch.cloneNode(true);
          Array.prototype.forEach.call(c.querySelectorAll('.sedit-gap, .ProseMirror-search-match, .column-resize-handle'), function (n) { if (n.classList.contains('sedit-gap') || n.classList.contains('column-resize-handle')) n.remove(); });
          c.removeAttribute('contenteditable'); c.classList.remove('ProseMirror-focused');
          Array.prototype.forEach.call(c.querySelectorAll('.sedit-pagefirst'), function (n) { n.classList.remove('sedit-pagefirst'); });
          live.push(ch); clones.push(c); flow.appendChild(c);
        });
        document.body.appendChild(flow);
        var originTop = flow.getBoundingClientRect().top;
        // 2) 경계 찾기 — 흐름 하나 위에서 fromY 를 옮겨 가며(인쇄의 잘라 내기와 같은 결과)
        var found = [], fromY = 0, guard = 0;
        while (guard++ < 300) {
          var brk = SD.findBreak(flow, fromY + m.innerH, originTop, true, fromY);
          if (!brk) break;
          var y = null, item = { kind: null };
          if (brk.pos) {
            y = brk.lineTop; item.kind = 'inline';
            item.path = pathOf(brk.pos.node, flow); item.offset = brk.pos.offset;
          } else {
            var el = brk.before || (brk.consume ? nextElement(brk.consume) : null);
            if (!el) break;
            y = el.getBoundingClientRect().top - originTop; item.kind = 'block'; item.path = pathOf(el, flow);
            var prev = prevElement(el);
            var csB = getComputedStyle(el);
            item.prevBottom = prev ? (prev.getBoundingClientRect().bottom - originTop + (parseFloat(getComputedStyle(prev).marginBottom) || 0)) : (el.getBoundingClientRect().top - originTop - (parseFloat(csB.marginTop) || 0));
          }
          if (y == null || y <= fromY + 0.5) break;   // 진전 없음 — 무한 반복 방지
          item.y = y; found.push(item); fromY = y;
        }
        flow.remove();
        // 3) 간격 높이 계산 + 살아 있는 DOM 자리로 옮기기
        var decos = [], S = 0, manual = [], firstBlocks = [];
        found.forEach(function (it, k) {
          var T = (k + 1) * (m.ph + GAP);   // 다음 쪽 본문 윗변(흐름 좌표)
          var h = it.kind === 'inline' ? (T - it.y - S) : (T - it.prevBottom - S);
          if (h < 0) h = 0;
          S += h;
          var liveNode = nodeAt(col, it.path);
          if (!liveNode) return;
          var inPM = view.dom.contains(liveNode);
          if (inPM) {
            var pos;
            try { pos = it.kind === 'inline' ? view.posAtDOM(liveNode, it.offset) : view.posAtDOM(liveNode.parentNode, indexIn(liveNode)); } catch (e) { return; }
            decos.push(Decoration.widget(pos, (function (hh, inline) { return function () { return gapEl(hh, inline); }; })(h, it.kind === 'inline'), { side: -1, key: 'gap' + k + ':' + Math.round(h), marks: [], ignoreSelection: true }));
            if (it.kind === 'block') { var $p = view.state.doc.resolve(pos), after = $p.nodeAfter; if (after && after.isBlock) decos.push(Decoration.node(pos, pos + after.nodeSize, { 'class': 'sedit-pagefirst' })); }
          } else {
            manual.push({ node: liveNode, offset: it.offset, h: h, inline: it.kind === 'inline', block: it.kind === 'block' ? liveNode : null });
          }
        });
        breaks = found; pageCount = found.length + 1;
        // 앞부분·기도(편집기 밖 고정 영역)의 간격은 그 DOM 에 직접 끼운다
        manual.forEach(function (g) {
          var el = gapEl(g.h, g.inline);
          if (g.inline && g.node.nodeType === 3) { var tail = g.node.splitText(g.offset); tail.parentNode.insertBefore(el, tail); }
          else if (g.inline) { g.node.parentNode.insertBefore(el, g.node); }
          else { g.node.parentNode.insertBefore(el, g.node); g.node.classList.add('sedit-pagefirst-x'); }
          widgetGaps.push(el);
        });
        var tr = view.state.tr.setMeta(pagerKey, { set: DecorationSet.create(view.state.doc, decos) }).setMeta('addToHistory', false);
        if (view.hasFocus()) tr.scrollIntoView();
        view.dispatch(tr);
        layoutPages(m);
        emit('pages', pageCount);
        // 4) 다음 틱에 실측 검증 — 여백 겹침·반올림으로 어긋난 만큼 간격을 보정(최대 2회)
        verifying = 0; setTimeout(verify, 0);
      }
      function verify() {
        if (stopped || verifying >= 2) return;
        var m = SD.metrics(settings()), col = column(), z = zoom();
        var colTop = col.getBoundingClientRect().top;
        var gaps = Array.prototype.slice.call(col.querySelectorAll('.sedit-gap'));
        if (gaps.length !== breaks.length) return;
        var drift = 0, fixed = false;
        gaps.forEach(function (g, k) {
          var T = (k + 1) * (m.ph + GAP);
          var nextTop;
          if (g.classList.contains('sedit-gap-inline')) nextTop = (g.getBoundingClientRect().bottom - colTop) / z;
          else { var nb = g.nextElementSibling; while (nb && nb.classList.contains('sedit-gap')) nb = nb.nextElementSibling; if (!nb) return; nextTop = (nb.getBoundingClientRect().top - colTop) / z; }
          var d = T - nextTop;
          if (Math.abs(d) > 0.75) { var h = (parseFloat(g.style.height) || 0) + d; g.style.height = Math.max(0, Math.round(h)) + 'px'; fixed = true; }
        });
        if (fixed) { verifying++; setTimeout(verify, 0); }
      }
      function nextElement(el) { var n = el.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
      function prevElement(el) { var n = el.previousSibling; while (n && (n.nodeType !== 1 || n.classList.contains('sedit-gap'))) n = n.previousSibling; return n; }
      function indexIn(el) { var i = 0, c = el.parentNode.firstChild; while (c && c !== el) { i++; c = c.nextSibling; } return i; }
      // 쪽 배경(흰 종이 + 간격 줄무늬)·높이·머리글·쪽번호·꺾쇠
      function layoutPages(m) {
        var page = opts.page, ov = opts.overlay; if (!page) return;
        var n = pageCount, s = settings();
        page.style.width = m.pw + 'px';
        page.style.padding = m.mg + 'px';
        page.style.minHeight = (n * m.ph + (n - 1) * GAP) + 'px';
        page.style.backgroundImage = 'repeating-linear-gradient(to bottom,#ffffff 0,#ffffff ' + (m.ph - 2) + 'px,#c7ccd6 ' + (m.ph - 2) + 'px,#c7ccd6 ' + m.ph + 'px,#242a34 ' + m.ph + 'px,#242a34 ' + (m.ph + GAP) + 'px)';
        var col = column(); if (col) col.style.minHeight = (n * m.innerH + (n - 1) * (2 * m.mg + GAP)) + 'px';
        if (!ov) return;
        var h = '', off = m.mg - 18, rec = opts.getRec ? opts.getRec() : {};
        for (var i = 1; i <= n; i++) {
          var top0 = (i - 1) * (m.ph + GAP);
          h += '<i class="sdoc-crop tl" style="top:' + (top0 + off) + 'px;left:' + off + 'px"></i><i class="sdoc-crop tr" style="top:' + (top0 + off) + 'px;right:' + off + 'px"></i><i class="sdoc-crop bl" style="top:' + (top0 + m.ph - off - 17) + 'px;left:' + off + 'px"></i><i class="sdoc-crop br" style="top:' + (top0 + m.ph - off - 17) + 'px;right:' + off + 'px"></i>';
          var hd = SD.headerText(s, rec), fo = SD.pageNumText(s, i, n);
          if (hd) h += '<div class="sdoc-head" style="top:' + (top0 + Math.max(6, Math.round(m.mg * 0.42))) + 'px;left:' + m.mg + 'px;right:' + m.mg + 'px">' + SD.esc(hd) + '</div>';
          if (fo) h += '<div class="sdoc-foot" style="top:' + (top0 + m.ph - Math.max(6, Math.round(m.mg * 0.4)) - 14) + 'px;left:' + m.mg + 'px;right:' + m.mg + 'px">' + SD.esc(fo) + '</div>';
        }
        ov.innerHTML = h;
      }
      return { schedule: schedule, stop: stop, run: run, count: function () { return pageCount; }, layout: function () { layoutPages(SD.metrics(settings())); } };
    })();

    // ── 바깥에 주는 API ──
    var editor = {
      view: view, schema: schema,
      get state() { return view.state; },
      focus: function () { view.focus(); },
      destroy: function () { pager.stop(); view.destroy(); },
      on: function (k, f) { if (listeners[k]) listeners[k].push(f); return editor; },
      onFind: null, onNotice: null,
      getHTML: function () { return docToHtml(view.state.doc); },
      getContent: function () { return isEmptyDoc(view.state.doc) ? '' : SD.wrap(docToHtml(view.state.doc), { lh: meta.lh, ls: meta.ls, page: meta.page }); },
      getText: function () { return view.state.doc.textBetween(0, view.state.doc.content.size, '\n\n', function (n) { return n.type === schema.nodes.hard_break ? '\n' : ''; }); },
      isEmpty: function () { return isEmptyDoc(view.state.doc); },
      setHTML: function (html, keepHistory) {   // 원고 통째로 바꾸기(자동분류 등) — 실행취소 한 단계로 남는다
        var u = SD.unwrap(html);
        if (u.lh || u.ls) { meta.lh = u.lh; meta.ls = u.ls; view.dom.style.lineHeight = meta.lh; view.dom.style.letterSpacing = meta.ls ? (/^-?[\d.]+$/.test(meta.ls) ? meta.ls + 'px' : meta.ls) : ''; }
        if (u.page) meta.page = SD.settingsFrom(u.page);
        var doc = htmlToDoc(SD.isHtml(u.inner) ? u.inner : SD.plainToHtml(u.inner));
        var tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
        tr.setSelection(Selection.atStart(tr.doc));
        if (keepHistory === false) tr.setMeta('addToHistory', false);
        view.dispatch(tr);
      },
      meta: meta,
      setLineHeight: function (v) { meta.lh = v ? String(v) : ''; view.dom.style.lineHeight = meta.lh; pager.schedule(0); emit('update', { meta: true }); },
      setLetterSpacing: function (v) { meta.ls = (v === '' || v == null) ? '' : String(v); view.dom.style.letterSpacing = meta.ls ? (/^-?[\d.]+$/.test(meta.ls) ? meta.ls + 'px' : meta.ls) : ''; pager.schedule(0); emit('update', { meta: true }); },
      setPage: function (p) { meta.page = SD.settingsFrom(Object.assign({}, meta.page, p || {})); pager.layout(); pager.schedule(0); emit('update', { meta: true }); },
      getPage: function () { return Object.assign({}, meta.page); },
      repaginate: function () { pager.schedule(0); },
      relayout: function () { pager.layout(); },
      pageCount: function () { return pager.count(); },
      // 리본 상태
      isActive: function (name) {
        var st = view.state;
        switch (name) {
          case 'bold': case 'italic': case 'underline': case 'strike': case 'superscript': case 'subscript': return markActive(st, schema.marks[name]);
          case 'strikeThrough': return markActive(st, schema.marks.strike);
          case 'insertUnorderedList': return inList(schema.nodes.bullet_list);
          case 'insertOrderedList': return inList(schema.nodes.ordered_list);
          case 'table': return T.isInTable(st);
        }
        return false;
        function inList(type) { var $f = st.selection.$from; for (var d = $f.depth; d > 0; d--) if ($f.node(d).type === type) return true; return false; }
      },
      cursorInfo: function () {   // 커서 자리의 문단 종류·글꼴·크기·정렬 — 리본 동기화용
        var st = view.state, $f = st.selection.$from, blk = $f.parent, info = { block: 'p', align: blk.attrs && blk.attrs.align || null, fontFamily: null, fontSize: null };
        if (blk.type === schema.nodes.heading) info.block = 'h' + blk.attrs.level;
        for (var d = $f.depth; d > 0; d--) if ($f.node(d).type === schema.nodes.blockquote) { info.block = 'blockquote'; break; }
        var marks = st.storedMarks || $f.marks();
        marks.forEach(function (mk) { if (mk.type === schema.marks.font_family) info.fontFamily = mk.attrs.family; if (mk.type === schema.marks.font_size) info.fontSize = mk.attrs.size; });
        if (!info.fontSize || !info.fontFamily) {   // 마크가 없으면 실제 그려진 값(기본 글꼴·크기)
          try { var dom = view.domAtPos($f.pos).node, el = dom.nodeType === 3 ? dom.parentNode : dom, cs = getComputedStyle(el); if (!info.fontSize) info.fontSize = Math.round(parseFloat(cs.fontSize)); if (!info.fontFamily) info.fontFamily = cs.fontFamily; } catch (e) { }
        }
        return info;
      },
      // 명령 실행 — 리본 단추 이름(예전 execCommand 이름 호환) → ProseMirror 명령
      exec: function (cmd, val) {
        var st = view.state, dispatch = view.dispatch, ok = false, N = schema.nodes, MK = schema.marks;
        view.focus();
        switch (cmd) {
          case 'undo': ok = H.undo(st, dispatch); break;
          case 'redo': ok = H.redo(st, dispatch); break;
          case 'bold': case 'italic': case 'underline': case 'superscript': case 'subscript': ok = C.toggleMark(MK[cmd])(st, dispatch); break;
          case 'strikeThrough': case 'strike': ok = C.toggleMark(MK.strike)(st, dispatch); break;
          case 'foreColor': ok = setMark(MK.color, { color: val })(st, dispatch); break;
          case 'hiliteColor': case 'backColor': ok = (val === 'transparent' || !val) ? unsetMark(MK.highlight)(st, dispatch) : setMark(MK.highlight, { color: val })(st, dispatch); break;
          case 'fontName': ok = val ? setMark(MK.font_family, { family: val })(st, dispatch) : unsetMark(MK.font_family)(st, dispatch); break;
          case 'fontSize': var px = pxOf(val); ok = px ? setMark(MK.font_size, { size: px })(st, dispatch) : unsetMark(MK.font_size)(st, dispatch); break;
          case 'removeFormat': ok = clearFormat(st, dispatch); break;
          case 'formatBlock':
            var tag = String(val || 'P').toUpperCase();
            if (tag === 'BLOCKQUOTE') ok = blockquoteToggle(st, dispatch);
            else if (/^H[1-3]$/.test(tag)) ok = setTextblock(N.heading, { level: +tag[1] })(st, dispatch);
            else ok = setTextblock(N.paragraph, {})(st, dispatch);
            break;
          case 'insertUnorderedList': ok = listToggle(N.bullet_list)(st, dispatch); break;
          case 'insertOrderedList': ok = listToggle(N.ordered_list)(st, dispatch); break;
          case 'indent': ok = L.sinkListItem(N.list_item)(st, dispatch); break;
          case 'outdent': ok = L.liftListItem(N.list_item)(st, dispatch); break;
          case 'justifyLeft': ok = setAlign(null)(st, dispatch); break;
          case 'justifyCenter': ok = setAlign('center')(st, dispatch); break;
          case 'justifyRight': ok = setAlign('right')(st, dispatch); break;
          case 'justifyFull': ok = setAlign('justify')(st, dispatch); break;
          case 'insertHorizontalRule': ok = insertNodeAfterBlock(N.horizontal_rule.create())(st, dispatch); break;
          case 'insertHTML': ok = insertHtml(String(val || ''))(st, dispatch); break;
          case 'insertText': dispatch(st.tr.insertText(String(val || '')).scrollIntoView()); ok = true; break;
          case 'insertImage': dispatch(st.tr.replaceSelectionWith(N.image.create({ src: val }), false).scrollIntoView()); ok = true; break;
          case 'insertVideo': ok = insertNodeAfterBlock(N.video.create({ src: val }))(st, dispatch); break;
          case 'insertCheckbox': dispatch(st.tr.replaceSelectionWith(N.checkbox.create({ on: false }), false).insertText(' ').scrollIntoView()); ok = true; break;
          case 'insertPageBreak': ok = insertNodeAfterBlock(N.page_break.create())(st, dispatch); break;
          case 'insertNote': ok = noteCmd(String(val || ''))(st, dispatch); break;
          case 'insertTable': ok = insertTable(val && val.rows, val && val.cols)(st, dispatch); break;
          case 'addRowAfter': ok = T.addRowAfter(st, dispatch); break;
          case 'addRowBefore': ok = T.addRowBefore(st, dispatch); break;
          case 'addColumnAfter': ok = T.addColumnAfter(st, dispatch); break;
          case 'addColumnBefore': ok = T.addColumnBefore(st, dispatch); break;
          case 'deleteRow': ok = T.deleteRow(st, dispatch); break;
          case 'deleteColumn': ok = T.deleteColumn(st, dispatch); break;
          case 'deleteTable': ok = T.deleteTable(st, dispatch); break;
          case 'mergeCells': ok = T.mergeCells(st, dispatch); break;
          case 'splitCell': ok = T.splitCell(st, dispatch); break;
          case 'toggleHeaderRow': ok = T.toggleHeaderRow(st, dispatch); break;
          case 'selectAll': ok = C.selectAll(st, dispatch); break;
          case 'fontReset':   // 원고 전체의 글꼴·크기·색·형광펜을 기본값으로(구조는 유지)
            var tr = st.tr; ['font_family', 'font_size', 'color', 'highlight'].forEach(function (k) { tr.removeMark(0, st.doc.content.size, MK[k]); });
            dispatch(tr); ok = true; break;
          default: console.warn('SermonEditor: 모르는 명령', cmd);
        }
        return ok;
      },
      // 찾기·바꾸기
      find: function (q, opt) {
        opt = opt || {};
        var query = new SR.SearchQuery({ search: q || '', caseSensitive: !!opt.caseSensitive, literal: true, replace: opt.replace || '', wholeWord: !!opt.wholeWord });
        view.dispatch(SR.setSearchState(view.state.tr, query));
        return q ? countMatches(query) : 0;
      },
      findNext: function () { return SR.findNext(view.state, view.dispatch); },
      findPrev: function () { return SR.findPrev(view.state, view.dispatch); },
      replaceNext: function () { return SR.replaceNext(view.state, view.dispatch); },
      replaceAll: function () { return SR.replaceAll(view.state, view.dispatch); },
      clearFind: function () { view.dispatch(SR.setSearchState(view.state.tr, new SR.SearchQuery({ search: '' }))); }
    };
    function countMatches(query) { var n = 0; try { var r = query.findNext(view.state, 0); var seen = {}; while (r && !seen[r.from]) { seen[r.from] = 1; n++; r = query.findNext(view.state, r.to); } } catch (e) { } return n; }

    pager.layout();
    pager.schedule(0);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { pager.schedule(0); }); } catch (e) { }
    return editor;
  }

  return { create: create, schema: schema, htmlToDoc: htmlToDoc, docToHtml: docToHtml };
})();
