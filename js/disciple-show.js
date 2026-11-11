/* disciple-show.js — 양육반 '강의 창' (2026-11-11 담임목사 지시: "공부 시작을 누르면 '오늘의 예배'처럼 강의 전용 창")
 *  · js/disciple.js 의 강 화면 [강의 창 열기] 가 부른다: WPCDiscShow.open(opts)
 *    opts = { lesson, className, songs:[{b,n}], songsLabel, materials:[{title,url,type}], bible: () => Promise<개역개정>, refLabel, onClose,
 *             startPart(이 대목부터), done{'3-4':1}(지난번까지 마친 대목), leader, onStop(keys) → Promise, afterStop(msg), hasNext, onNext }
 *  · 인도자: [■ 여기서 마치기] — 오늘 마친 대목만 저장하고 나머지는 다음 수업으로 이월. 마침 슬라이드의 [이 강 모두 마치고 저장]·[마치고 다음 강으로]
 *  · 슬라이드: 표지 → 함께 부를 찬양(악보) → 학습 목표 → 이 강 자료(그림·음성·영상) → 대목·문항(성경 본문 크게) → 나눔 → 삶의 과제 → 암송 → 마침
 *  · 넘기기: ←/→·PageUp/Down·Space·Home/End, 화면 좌우 누르기, 손가락 밀기(왼쪽 가장자리 28px 에서 시작한 밀기는 브라우저 '뒤로'라 세지 않음)
 *  · 닫기: × · Esc · 휴대폰 '뒤로'(창을 열 때 기록을 하나 넣는다). 열린 동안 뒤 화면 스크롤 막음, 닫으면 초점 되돌림.
 *  · 악보는 화면에 맞춰 보이고(object-fit:contain), 크게 보기는 모두의 성경 악보 창(손가락 확대·넘기기를 이미 갖춘 곳)으로 연다.
 */
console.log('[disciple-show.js] v20261112ld1');

(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var cur = null;   // 열린 창 하나

  function songImg(x) { return 'modu/data/' + (x.b === 'h' ? 'hymn' : 'ccm') + '/' + ('00' + x.n).slice(-3) + '.webp'; }
  function songUrl(x) { return 'modu/index.html#' + (x.b === 'h' ? 'hymn' : 'ccm') + '=' + x.n; }
  function ccm(n) { var L = window.CCMS || []; for (var i = 0; i < L.length; i++) if (L[i].no === +n) return L[i]; return null; }

  // 슬라이드 목록 만들기 — {k: 종류, h: 목차 이름, html, fit: 악보·그림처럼 화면 맞춤이면 true}
  function build(o) {
    var L = o.lesson, S = [], today = new Date();
    S.push({ k: 'cover', h: '표지', html:
      '<div class="dcs-cover"><p class="dcs-eye">제자훈련 양육반 · 제' + L.no + '강 · ' + esc(L.group) + '</p><h1>' + esc(L.title) + '</h1>' +
      (o.leader ? '<p class="dcs-one">' + esc(L.one) + '</p>' : '') + '<p class="dcs-meta">' + esc(o.className || '') + ' · ' + today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일 · 교재 ' + esc(L.pages) + '쪽</p></div>' });
    var songs = (o.songs || []).filter(function (x) { return x && x.n; });
    if (songs.length) {
      S.push({ k: 'songs', h: '함께 부를 찬양', html: '<div class="dcs-text"><p class="dcs-eye">' + esc(o.songsLabel || '함께 부를 찬양') + '</p><h2>함께 부를 찬양</h2><ol class="dcs-list">' +
        songs.map(function (x) { var c = x.b === 'c' ? ccm(x.n) : null; return '<li><b>' + (x.b === 'h' ? '새찬송가 ' + x.n + '장' : x.n + '번') + '</b> ' + esc(c ? c.title : '') + (c && c.key ? ' <small>' + esc(c.key) + '조</small>' : '') + '</li>'; }).join('') + '</ol></div>' });
      songs.forEach(function (x) {
        var c = x.b === 'c' ? ccm(x.n) : null, name = (x.b === 'h' ? '새찬송가 ' + x.n + '장' : x.n + '번') + (c ? ' ' + c.title : '');
        S.push({ k: 'score', h: '♪ ' + name, fit: true, html: '<figure class="dcs-figure"><img class="dcs-fit" src="' + esc(songImg(x)) + '" alt="' + esc(name + ' 악보') + '" draggable="false">' +
          '<figcaption>' + esc(name) + ' <a href="' + esc(songUrl(x)) + '" target="_blank" rel="noopener">악보 크게 보기 ↗</a></figcaption></figure>' });
      });
    }
    // (2026-11-12 담임목사) 한 줄로·학습 목표·요약은 인도자 화면에만
    if (o.leader) S.push({ k: 'goals', h: '학습 목표', html: '<div class="dcs-text"><p class="dcs-eye">제' + L.no + '강</p><h2>학습 목표</h2><ol class="dcs-list">' + L.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ol>' +
      '<div class="dcs-sum">' + L.summary.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div></div>' });
    (o.materials || []).forEach(function (m) {
      var t = esc(m.title || '자료');
      if (m.type === 'image') S.push({ k: 'img', h: '🖼 ' + (m.title || '그림'), fit: true, html: '<figure class="dcs-figure"><img class="dcs-fit" src="' + esc(m.url) + '" alt="' + t + '" draggable="false"><figcaption>' + t + '</figcaption></figure>' });
      else if (m.type === 'audio') S.push({ k: 'audio', h: '🎧 ' + (m.title || '음성'), html: '<div class="dcs-text dcs-media"><p class="dcs-eye">이 강 자료 · 음성</p><h2>' + t + '</h2><audio controls preload="none" src="' + esc(m.url) + '"></audio></div>' });
      else if (m.type === 'video') S.push({ k: 'video', h: '🎬 ' + (m.title || '영상'), fit: true, html: '<figure class="dcs-figure"><video class="dcs-fit" controls playsinline preload="none" src="' + esc(m.url) + '"></video><figcaption>' + t + '</figcaption></figure>' });
      else S.push({ k: 'file', h: '📎 ' + (m.title || '자료'), html: '<div class="dcs-text"><p class="dcs-eye">이 강 자료</p><h2>' + t + '</h2><p><a class="dcs-btn" href="' + esc(m.url) + '" target="_blank" rel="noopener">파일 열기 ↗</a></p></div>' });
    });
    if (L.sections && L.sections.length) {
      var qn = 0;
      L.sections.forEach(function (sec) {
        var pname = L.parts[sec.part - 1] || '';
        S.push({ k: 'part', part: sec.part, h: '대목 ' + sec.part + ' · ' + pname, html: '<div class="dcs-cover dcs-part"><p class="dcs-eye">제' + L.no + '강 · ' + sec.part + '번째 대목</p><h1>' + esc(pname) + '</h1><p class="dcs-meta">문항 ' + sec.items.length + '개 · 교재를 펴십시오</p></div>' });
        sec.items.forEach(function (it) {
          qn++;
          S.push({ k: 'item', part: sec.part, h: '　문항 ' + qn + ' · ' + it.t, refs: it.refs, html: '<div class="dcs-text"><p class="dcs-eye">' + esc(pname) + ' · 문항 ' + qn + (it.kind === 'w' ? ' · 내 생각 적기' : it.kind === 't' ? ' · 표 채우기' : '') + '</p><h2>' + esc(it.t) + '</h2>' +
            (it.refs && it.refs.length ? '<ul class="dcs-verses">' + it.refs.map(function (r) { return '<li data-ref="' + esc(JSON.stringify(r)) + '"><b>' + esc(o.refLabel(r)) + '</b><span class="dcs-vt">' + (r[2] ? '본문을 불러오는 중…' : '성경을 펴서 함께 읽으십시오.') + '</span></li>'; }).join('') + '</ul>' : '<p class="dcs-note">교재에 생각을 적고 함께 나눕니다.</p>') + '</div>' });
        });
      });
    } else {
      L.parts.forEach(function (p, n) { S.push({ k: 'part', part: n + 1, h: '대목 ' + (n + 1) + ' · ' + p, html: '<div class="dcs-cover dcs-part"><p class="dcs-eye">제' + L.no + '강 · ' + (n + 1) + '번째 대목</p><h1>' + esc(p) + '</h1><p class="dcs-meta">교재를 펴십시오</p></div>' }); });
      if (0) S.push({ k: 'flow', h: '교재의 흐름', html: '<div class="dcs-text"><h2>교재의 흐름</h2><ol class="dcs-list">' + L.parts.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></div>' });
    }
    S.push({ k: 'share', h: '나눔', html: '<div class="dcs-text"><p class="dcs-eye">나눔과 적용</p><h2>함께 나눕시다</h2><ol class="dcs-list">' + L.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') +
      (L.apply || []).map(function (a) { return '<li>' + esc(a.t) + '</li>'; }).join('') + '</ol></div>' });
    S.push({ k: 'tasks', h: '삶의 과제', html: '<div class="dcs-text"><p class="dcs-eye">다음 모임까지</p><h2>삶의 과제</h2><ul class="dcs-list">' + L.tasks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' });
    S.push({ k: 'memory', h: '암송', html: '<div class="dcs-text dcs-mem"><p class="dcs-eye">암송 · ' + esc(o.refLabel(L.memory.ref)) + '</p><p class="dcs-memtext">' +
      L.memory.text.split(/\s+/).map(function (w, i) { return '<span class="dcs-w" data-i="' + i + '">' + esc(w) + '</span>'; }).join(' ') + '</p>' +
      '<p><button type="button" class="dcs-btn" data-hide>가리고 외워 보기</button> <span class="dcs-note">가린 낱말을 누르면 하나씩 보입니다</span></p></div>' });
    S.push({ k: 'end', h: '마침', html: '<div class="dcs-cover"><p class="dcs-eye">제' + L.no + '강</p><h1>' + esc(L.title) + '</h1><p class="dcs-one">수고하셨습니다. 삶의 과제를 기억하십시오.</p>' +
      (o.leader ? '<p><button type="button" class="dcs-btn" data-finish>이 강 모두 마치고 저장</button>' + (o.hasNext ? ' <button type="button" class="dcs-btn" data-finish="next">마치고 다음 강으로 ›</button>' : '') + '</p>' : '') +
      '<p><button type="button" class="dcs-btn dcs-ghost" data-close>강의실 나가기</button></p></div>' });
    return S;
  }

  function open(o) {
    if (cur) cur.close(true);
    var S = build(o), i = 0, opener = document.activeElement, bodyOv = document.body.style.overflow, htmlOv = document.documentElement.style.overflow;
    var ov = document.createElement('div');
    ov.className = 'dcs'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '제' + o.lesson.no + '강 강의 창'); ov.tabIndex = -1;
    ov.innerHTML = '<header class="dcs-bar"><b class="dcs-title">제' + o.lesson.no + '강 ' + esc(o.lesson.title) + '</b><span class="dcs-pg" aria-live="polite"></span>' +
      (o.leader ? '<button type="button" class="dcs-stopbtn" data-stop>■ 여기서 마치기</button>' : '') + '<button type="button" class="dcs-ic" data-toc aria-label="목차">☰</button><button type="button" class="dcs-ic" data-full aria-label="전체 화면">⛶</button><button type="button" class="dcs-ic" data-x aria-label="강의 창 닫기">×</button></header>' +
      '<main class="dcs-stage"></main>' +
      '<nav class="dcs-nav"><button type="button" class="dcs-nb" data-prev aria-label="앞 슬라이드">‹</button><span class="dcs-prog"><i></i></span><button type="button" class="dcs-nb" data-next aria-label="다음 슬라이드">›</button></nav>' +
      '<div class="dcs-stop" hidden></div><div class="dcs-toc" hidden><ol>' + S.map(function (s, n) { return '<li><button type="button" data-go="' + n + '">' + esc(s.h) + '</button></li>'; }).join('') + '</ol></div>';
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    var stage = ov.querySelector('.dcs-stage'), pg = ov.querySelector('.dcs-pg'), bar = ov.querySelector('.dcs-prog i'), toc = ov.querySelector('.dcs-toc');
    var bible = null;

    function fillVerses() {
      var lis = stage.querySelectorAll('li[data-ref]'); if (!lis.length) return;
      (bible ? Promise.resolve(bible) : o.bible().then(function (B) { bible = B; return B; })).then(function (B) {
        Array.prototype.forEach.call(lis, function (li) {
          var r = JSON.parse(li.dataset.ref), vt = li.querySelector('.dcs-vt'); if (!r[2] || vt.dataset.ok) return;
          var ch = B[r[0]] && B[r[0]][r[1] - 1], out = [];
          for (var n = r[2]; n <= (r[3] || r[2]); n++) if (ch && ch[n - 1]) out.push((r[3] && r[3] !== r[2] ? '<sup>' + n + '</sup>' : '') + esc(ch[n - 1]));
          vt.innerHTML = out.length ? out.join(' ') : '성경을 펴서 함께 읽으십시오.'; vt.dataset.ok = '1';
        });
      }).catch(function () { Array.prototype.forEach.call(lis, function (li) { li.querySelector('.dcs-vt').textContent = '성경을 펴서 함께 읽으십시오.'; }); });
    }
    function show(n) {
      i = Math.max(0, Math.min(S.length - 1, n));
      Array.prototype.forEach.call(stage.querySelectorAll('audio,video'), function (m) { try { m.pause(); } catch (e) { } });
      var s = S[i];
      stage.className = 'dcs-stage' + (s.fit ? ' is-fit' : '');
      stage.innerHTML = '<section class="dcs-slide dcs-' + s.k + '">' + s.html + '</section>';
      stage.scrollTop = 0;
      pg.textContent = (i + 1) + ' / ' + S.length;
      bar.style.width = Math.round((i + 1) / S.length * 100) + '%';
      ov.querySelector('[data-prev]').disabled = i === 0; ov.querySelector('[data-next]').disabled = i === S.length - 1;
      if (s.k === 'item') fillVerses();
      var hide = stage.querySelector('[data-hide]');
      if (hide) hide.onclick = function () { var m = stage.querySelector('.dcs-memtext'); var on = m.classList.toggle('is-hidden'); Array.prototype.forEach.call(m.querySelectorAll('.dcs-w'), function (w) { w.classList.remove('is-shown'); }); hide.textContent = on ? '모두 보기' : '가리고 외워 보기'; };
      Array.prototype.forEach.call(stage.querySelectorAll('.dcs-w'), function (w) { w.onclick = function (e) { e.stopPropagation(); w.classList.add('is-shown'); }; });
      var cl = stage.querySelector('[data-close]'); if (cl) cl.onclick = function () { close(); };
      // 다음 악보·그림 미리 받기
      var nx = S[i + 1]; if (nx && nx.fit) { var m2 = /src="([^"]+)"/.exec(nx.html); if (m2 && /\.(webp|png|jpe?g|gif)$/i.test(m2[1])) { var im = new Image(); im.src = m2[1].replace(/&amp;/g, '&'); } }
    }
    function next() { if (i < S.length - 1) show(i + 1); }
    function prev() { if (i > 0) show(i - 1); }
    function onKey(e) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { e.preventDefault(); if (!stopBox.hidden) { stopBox.hidden = true; return; } if (!toc.hidden) { toc.hidden = true; return; } if (document.fullscreenElement) return; close(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !/^(BUTTON|A|AUDIO|VIDEO)$/.test(e.target.tagName))) { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(S.length - 1); }
      else if (e.key === 'Tab') {   // 창 안에서만 돈다
        var f = Array.prototype.filter.call(ov.querySelectorAll('button,a[href],audio,video,[tabindex]'), function (x) { return x.offsetParent !== null && !x.disabled; });
        if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    // 손가락 밀기: 왼쪽 가장자리(28px)에서 시작한 밀기는 브라우저 '뒤로' 몫이라 세지 않는다
    var tx = null, ty = 0;
    stage.addEventListener('touchstart', function (e) { var t = e.touches[0]; tx = (e.touches.length === 1 && t.clientX > 28) ? t.clientX : null; ty = t.clientY; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (tx == null) return; var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
    }, { passive: true });
    // 화면 왼쪽·오른쪽 가장자리 누르기(글·단추·링크가 아닌 곳)
    stage.addEventListener('click', function (e) {
      if (e.target.closest('a,button,audio,video,input,textarea,label,.dcs-w,li[data-ref]')) return;
      var r = stage.getBoundingClientRect(), x = e.clientX - r.left;
      if (x > r.width * 0.75) next(); else if (x < r.width * 0.25) prev();
    });
    // ── 인도자: 여기서 마치기 — 오늘 마친 대목을 고르고 저장(나머지는 다음 수업으로 이월) ──
    var stopBox = ov.querySelector('.dcs-stop');
    function partNow() { var s = S[i]; if (s.part) return s.part; for (var j = i; j < S.length; j++) if (S[j].part) return 0; return o.lesson.parts.length + 1; }
    function save(keys, then) {
      return Promise.resolve(o.onStop(keys)).then(function (msg) { close(); if (then) then(); else if (o.afterStop) o.afterStop(msg); });
    }
    function openStop() {
      var L = o.lesson, now = partNow(), done = o.done || {}, from = o.startPart || 1;
      stopBox.innerHTML = '<div class="dcs-stop-card" role="dialog" aria-label="여기서 마치기"><h2>여기서 마치기</h2><p>오늘 마친 대목에 표시하십시오. 표시하지 않은 대목은 다음 수업에서 이어서 합니다.</p><ul>' +
        L.parts.map(function (p, n) {
          var no = n + 1, k = L.no + '-' + no, was = !!done[k], on = was || (no >= from && no < now);
          return '<li><label><input type="checkbox" value="' + k + '"' + (on ? ' checked' : '') + (was ? ' disabled' : '') + '> ' + no + '. ' + esc(p) +
            (was ? ' <em>지난번에 마침</em>' : no === now ? ' <em class="is-now">지금 여기</em>' : '') + '</label></li>';
        }).join('') + '</ul><p class="dcs-msg" role="status"></p><p><button type="button" class="dcs-btn" data-save>저장하고 마치기</button> <button type="button" class="dcs-btn dcs-ghost" data-cancel>계속 수업하기</button></p></div>';
      stopBox.hidden = false;
      stopBox.querySelector('[data-cancel]').onclick = function () { stopBox.hidden = true; };
      var sb = stopBox.querySelector('[data-save]'); sb.focus();
      sb.onclick = function () {
        if (sb.disabled) return; sb.disabled = true; sb.textContent = '저장 중…';
        var keys = Array.prototype.filter.call(stopBox.querySelectorAll('input:checked:not([disabled])'), function () { return true; }).map(function (x) { return x.value; });
        save(keys).catch(function (e) { sb.disabled = false; sb.textContent = '저장하고 마치기'; stopBox.querySelector('.dcs-msg').textContent = '저장하지 못했습니다: ' + (e && e.message || ''); });
      };
    }
    if (o.leader) ov.querySelector('[data-stop]').onclick = openStop;
    stage.addEventListener('click', function (e) {
      var f = e.target.closest('[data-finish]'); if (!f || f.disabled) return;
      f.disabled = true; f.textContent = '저장 중…';
      var all = o.lesson.parts.map(function (p, n) { return o.lesson.no + '-' + (n + 1); }).filter(function (k) { return !(o.done || {})[k]; });
      save(all, f.dataset.finish === 'next' && o.onNext ? o.onNext : null).catch(function (er) { f.disabled = false; f.textContent = '다시 시도'; alert('저장하지 못했습니다: ' + (er && er.message || '')); });
    });
    ov.querySelector('[data-prev]').onclick = prev;
    ov.querySelector('[data-next]').onclick = next;
    ov.querySelector('[data-x]').onclick = function () { close(); };
    ov.querySelector('[data-toc]').onclick = function () { toc.hidden = !toc.hidden; if (!toc.hidden) { var b = toc.querySelector('[data-go="' + i + '"]'); if (b) b.focus(); } };
    toc.onclick = function (e) { var b = e.target.closest('[data-go]'); if (!b) { if (e.target === toc) toc.hidden = true; return; } toc.hidden = true; show(+b.dataset.go); };
    ov.querySelector('[data-full]').onclick = function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      var req = ov.requestFullscreen || ov.webkitRequestFullscreen; if (req) { try { var p = req.call(ov); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
    };
    document.addEventListener('keydown', onKey);
    // 휴대폰 '뒤로' = 창 닫기
    var pushed = false;
    try { history.pushState({ dcs: 1 }, ''); pushed = true; } catch (e) { }
    function onPop() { if (cur && cur.ov === ov) close(true); }
    window.addEventListener('popstate', onPop);

    var closed = false;
    function close(fromPop) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop);
      if (document.fullscreenElement === ov) { try { document.exitFullscreen(); } catch (e) { } }
      Array.prototype.forEach.call(ov.querySelectorAll('audio,video'), function (m) { try { m.pause(); } catch (e) { } });
      ov.remove(); document.documentElement.style.overflow = htmlOv; document.body.style.overflow = bodyOv;
      if (pushed && !fromPop) { try { history.back(); } catch (e) { } }
      cur = null;
      if (opener && opener.focus && document.body.contains(opener)) opener.focus();
      if (o.onClose) o.onClose();
    }
    cur = { ov: ov, close: close };
    var start = 0;
    if (o.startPart) for (var si = 0; si < S.length; si++) if (S[si].k === 'part' && S[si].part >= o.startPart) { start = si; break; }
    show(start);
    ov.focus();
    return cur;
  }

  window.WPCDiscShow = { open: open };
})();
