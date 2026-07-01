/* dashboard.js — 대시보드(dashboard.html): 정회원 전용 개인 홈
 * 오늘의 큐티(아멘 체크)·이번주 설교·주보·진행중인 교육·헌금·가계도·QT 진행표
 * 콘솔: [dashboard.js] v20260701da
 */
console.log('[dashboard.js] v20260701da');

(function () {
  var root = document.getElementById('dashRoot');
  if (!root) return;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  function pad2(n) { return ('0' + n).slice(-2); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // 성경 본문(줄마다 "번호 내용")을 절 목록으로 정돈
  function bibleVersesHTML(text) {
    var lines = String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.map(function (ln) {
      var m = ln.match(/^(\d+)\s*(.*)$/);
      if (m) return '<div class="qtc-verse"><span class="qtc-vn">' + m[1] + '</span><span>' + esc(m[2]) + '</span></div>';
      return '<div class="qtc-verse"><span>' + esc(ln) + '</span></div>';
    }).join('');
  }
  // ── 갓피아(GODpia) 성경 듣기 딥링크 (main.js의 QT 위젯 내부 스코프라 접근 불가 → 자체 보유) ──
  var GODPIA_BASE = 'https://www.godpia.com/read/reading.asp';
  var GODPIA_VOL = {
    '창세기':'gen','출애굽기':'exo','레위기':'lev','민수기':'num','신명기':'deu',
    '여호수아':'jos','사사기':'jdg','룻기':'rut','사무엘상':'1sa','사무엘하':'2sa',
    '열왕기상':'1ki','열왕기하':'2ki','역대상':'1ch','역대하':'2ch','에스라':'ezr',
    '느헤미야':'neh','에스더':'est','욥기':'job','시편':'psa','잠언':'pro',
    '전도서':'ecc','아가':'sng','이사야':'isa','예레미야':'jer','예레미야애가':'lam',
    '에스겔':'ezk','다니엘':'dan','호세아':'hos','요엘':'jol','아모스':'amo',
    '오바댜':'oba','요나':'jnh','미가':'mic','나훔':'nam','하박국':'hab',
    '스바냐':'zep','학개':'hag','스가랴':'zec','말라기':'mal','마태복음':'mat',
    '마가복음':'mrk','누가복음':'luk','요한복음':'jhn','사도행전':'act','로마서':'rom',
    '고린도전서':'1co','고린도후서':'2co','갈라디아서':'gal','에베소서':'eph','빌립보서':'php',
    '골로새서':'col','데살로니가전서':'1th','데살로니가후서':'2th','디모데전서':'1ti','디모데후서':'2ti',
    '디도서':'tit','빌레몬서':'phm','히브리서':'heb','야고보서':'jas','베드로전서':'1pe',
    '베드로후서':'2pe','요한일서':'1jn','요한이서':'2jn','요한삼서':'3jn','유다서':'jud','요한계시록':'rev',
    '창':'gen','출':'exo','레':'lev','민':'num','신':'deu','수':'jos','삿':'jdg','룻':'rut',
    '삼상':'1sa','삼하':'2sa','왕상':'1ki','왕하':'2ki','대상':'1ch','대하':'2ch','스':'ezr',
    '느':'neh','에':'est','욥':'job','시':'psa','잠':'pro','전':'ecc','아':'sng','사':'isa',
    '렘':'jer','애':'lam','겔':'ezk','단':'dan','호':'hos','욜':'jol','암':'amo','옵':'oba',
    '욘':'jnh','미':'mic','나':'nam','합':'hab','습':'zep','학':'hag','슥':'zec','말':'mal',
    '마':'mat','막':'mrk','눅':'luk','요':'jhn','행':'act','롬':'rom','고전':'1co','고후':'2co',
    '갈':'gal','엡':'eph','빌':'php','골':'col','살전':'1th','살후':'2th','딤전':'1ti','딤후':'2ti',
    '딛':'tit','몬':'phm','히':'heb','약':'jas','벧전':'1pe','벧후':'2pe','요일':'1jn','요이':'2jn',
    '요삼':'3jn','유':'jud','계':'rev'
  };
  function godpiaUrl(ref) {
    if (!ref) return GODPIA_BASE;
    var m = String(ref).replace(/\s+/g, ' ').trim().match(/([가-힣]+)\s*(\d+)\s*[:：]/);
    if (!m) return GODPIA_BASE;
    var code = GODPIA_VOL[m[1]];
    return code ? (GODPIA_BASE + '?vol=' + code + '&chap=' + m[2]) : GODPIA_BASE;
  }

  // 묵상/기도(HTML 또는 줄바꿈 텍스트)를 문단 블록으로 변환
  function toParaHTML(text) {
    var s = String(text || '');
    if (!s.trim()) return '';
    if (/<[a-z][\s\S]*>/i.test(s)) return s; // 이미 HTML(리치텍스트)이면 그대로
    return s.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  function sbUser() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split('.')[0];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = s.currentSession || s;
      return (s && s.user) || null;
    } catch (e) { return null; }
  }

  // ── 로그인 대기 → 정회원 확인 ──
  var tries = 0;
  function waitLogin() {
    if (!window.FINANCE_API_URL) { showLocked('준비 중', '로그인 기능이 아직 설정되지 않았습니다.'); return; }
    if (window.WPF && WPF.token()) { boot(); return; }
    if (tries++ < 20) { setTimeout(waitLogin, 400); return; }
    showLocked('로그인이 필요합니다', '대시보드는 정회원 로그인 후 이용할 수 있습니다.', true);
  }
  function showLocked(title, msg, offerProfileLink) {
    root.innerHTML = '<div class="member-lock"><div class="lock-icon">🔒</div><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p></div>';
    var lock = root.querySelector('.member-lock');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-line'; b.style.marginTop = '12px';
    if (offerProfileLink) {
      b.textContent = '로그인';
      b.onclick = function () { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } };
    } else {
      b.textContent = '내 정보로 이동 →';
      b.onclick = function () { location.href = 'admin.html'; };
    }
    lock.appendChild(b);
  }

  function boot() {
    root.innerHTML = '<p class="qt-loading">확인 중입니다…</p>';
    WPF.call('me').then(function (me) {
      if (me.status !== '정회원') { showLocked('정회원 전용 페이지입니다', '교적 인증 후 정회원이 되면 대시보드를 이용할 수 있습니다.'); return; }
      renderDashboard(me);
    }).catch(function (e) { showLocked('오류가 발생했습니다', e.message); });
  }

  function renderDashboard(me) {
    root.innerHTML =
      '<div class="form-card" style="margin-bottom:22px;padding:16px 18px;">' +
      '<h2 style="margin:0;font-size:1.15rem;color:var(--accent,#032257);">' + esc(me.memberName || '') + '님, 환영합니다 🙏</h2>' +
      '</div>' +
      '<div id="myEdu" style="margin-bottom:26px;"></div>' +
      '<div id="qtProgress" style="margin-bottom:26px;"></div>' +
      '<div id="dashQt" style="margin-bottom:26px;"></div>' +
      '<section style="margin-bottom:26px;"><div class="section-head"><span class="eyebrow">THIS SUNDAY</span><h2>이번 주 말씀</h2></div><div class="home-sermon" id="homeSermon"></div></section>' +
      '<section style="margin-bottom:26px;"><div class="section-head"><span class="eyebrow">THIS WEEK</span><h2>이번 주 주보</h2></div><div id="homeBulletin"></div></section>' +
      '<div class="form-card" style="margin-bottom:26px;padding:16px 18px;"><h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">💝 헌금</h3><div id="offeringList"><p class="qt-loading">불러오는 중…</p></div></div>' +
      '<div id="familyTree" style="margin-bottom:26px;"></div>';
    loadMyEdu(me);
    loadQtProgress(me);
    loadTodayQt(me);
    loadHomeSermon();
    loadHomeBulletin();
    loadOfferings(me);
    loadFamily(me);
  }

  /* ================= 이번 주 말씀 / 주보 (main.js 홈 위젯을 대시보드에서 직접 채움) ================= */
  // main.js는 페이지 로드 시 1회만 #homeSermon/#homeBulletin을 채우는데, 대시보드는
  // 로그인 확인 후 비동기로 이 요소들을 나중에 만들기 때문에 그 타이밍을 놓친다.
  // 그래서 같은 BULLETINS 데이터로 대시보드가 직접 채운다.
  function loadHomeSermon() {
    var el = document.getElementById('homeSermon');
    if (!el || typeof BULLETINS === 'undefined' || !BULLETINS.length) return;
    var b = BULLETINS[0];
    el.style.cursor = 'pointer';
    el.title = '클릭해서 설교 요약 보기';
    el.innerHTML =
      '<span class="hs-date">' + b.dateLabel + ' · 주일 낮 예배</span>' +
      '<h3 class="hs-title">' + b.title + '</h3>' +
      '<p class="hs-ref">' + b.scripture + ' · ' + b.preacher + '</p>' +
      '<blockquote class="hs-quote">' + b.quote + '</blockquote>';
    el.onclick = function () { if (typeof openSermonSummary === 'function') openSermonSummary(0); };
  }
  function loadHomeBulletin() {
    var el = document.getElementById('homeBulletin');
    if (!el || typeof BULLETINS === 'undefined' || !BULLETINS.length) return;
    var b = BULLETINS[0];
    var orderItems = (b.order || []).map(function (o) { return '<li>' + o + '</li>'; }).join('');
    var newsItems = (b.news || []).slice(0, 3).map(function (n) { return '<li><strong>' + n.title + '</strong>' + n.detail + '</li>'; }).join('');
    el.innerHTML =
      '<div class="hb-card">' +
      '<div class="hb-hd"><span class="hb-hd-week">' + b.week + ' · 주일 낮 예배</span><span class="hb-hd-date">' + b.dateLabel + '</span></div>' +
      '<div class="hb-body">' +
      '<div class="hb-col"><p class="hb-col-title">예배 순서</p><ol class="hb-order">' + orderItems + '</ol></div>' +
      '<div class="hb-col"><p class="hb-col-title">이 주의 말씀 강해</p><ul class="hb-extra"><li>' + (b.wed || '') + '</li><li>' + (b.dawn || '') + '</li><li>' + (b.qt || '') + '</li></ul>' +
      (newsItems ? '<p class="hb-col-title">한 주의 소식</p><ul class="hb-news">' + newsItems + '</ul>' : '') +
      '</div></div>' +
      '<div class="hb-ft"><a class="btn btn-line" href="word.html#archive">주보 전체 보기 →</a></div>' +
      '</div>';
  }

  /* ================= 오늘의 큐티 (홈 화면과 동일한 카드) + 아멘 체크 ================= */
  function loadTodayQt(me) {
    var el = document.getElementById('dashQt'); if (!el) return;
    el.innerHTML = '<div class="qt-today"><p class="qt-loading">오늘의 말씀을 불러오는 중입니다…</p></div>';
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, t = todayStr();
    fetch(url + '/rest/v1/qt_published?select=*&sermon_date=eq.' + t, { headers: { apikey: ak, Authorization: 'Bearer ' + ak } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var q = rows && rows[0];
        if (!q) { el.innerHTML = '<div class="qt-today"><p class="qt-loading">오늘 등록된 큐티가 아직 없습니다.</p></div>'; return; }
        var dotDate = t.replace(/-/g, '.');
        var listenHref = (typeof godpiaUrl === 'function') ? godpiaUrl(q.scripture) : 'https://www.godpia.com/read/reading.asp';
        el.innerHTML =
          '<div class="qt-today">' +
          '<button type="button" class="qt-card-today" id="dashQtOpen">' +
          '<span class="qt-badge">오늘의 QT · ' + esc(dotDate) + '</span>' +
          (q.title ? '<h3 class="qt-card-title">' + esc(q.title) + '</h3>' : '') +
          (q.scripture ? '<p class="qt-card-ref">' + esc(q.scripture) + '</p>' : '') +
          '<span class="qt-card-more">묵상 전문 읽기 →</span>' +
          '</button>' +
          '<div id="dashQtFull" hidden style="margin-top:18px"></div>' +
          '</div>' +
          '<div class="qt-listen-wrap">' +
          '<a class="qt-listen-btn" href="' + esc(listenHref) + '" target="_blank" rel="noopener noreferrer">🎧 말씀 듣기</a>' +
          (q.scripture ? '<p class="qt-listen-note">갓피아(GODpia)에서 ‘' + esc(q.scripture) + '’ 말씀을 들어요</p>' : '<p class="qt-listen-note">갓피아(GODpia) 성경 듣기로 이동합니다</p>') +
          '</div>';
        var opened = false;
        document.getElementById('dashQtOpen').onclick = function () {
          opened = !opened;
          var full = document.getElementById('dashQtFull');
          full.hidden = !opened;
          if (opened && !full.dataset.loaded) {
            full.dataset.loaded = '1';
            full.innerHTML =
              '<div class="form-card qtc-card">' +
              (q.qt_bible_text ? '<div class="qtc-bible">' + bibleVersesHTML(q.qt_bible_text) + '</div>' : '') +
              (q.content ? '<div class="qtc-head">📝 묵상</div><div class="qtc-body">' + toParaHTML(q.content) + '</div>' : '') +
              (q.prayer ? '<div class="qtc-head">🙏 기도</div><div class="qtc-body">' + toParaHTML(q.prayer) + '</div>' : '') +
              '<div id="dashAmenBox" class="qtc-amen"></div>' +
              '</div>';
            loadAmenState(me, t);
          }
        };
      })
      .catch(function () { el.innerHTML = '<p style="color:#c0392b;font-size:.88rem;">큐티를 불러오지 못했습니다.</p>'; });
  }
  function loadAmenState(me, t) {
    var box = document.getElementById('dashAmenBox'); if (!box) return;
    var uid = sbUser() && sbUser().id, tok = WPF.token();
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY;
    if (!uid) { box.innerHTML = ''; return; }
    fetch(url + '/rest/v1/qt_checks?select=id&check_date=eq.' + t, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (rows && rows.length) { box.innerHTML = '<span class="qtc-amen-done">✓ 오늘의 큐티를 마치고 아멘 하셨습니다</span>'; return; }
        box.innerHTML = '<label><input type="checkbox" id="dashAmenChk"> 🙏 기도문까지 읽고, 오늘의 큐티에 아멘 합니다</label>';
        var chk = document.getElementById('dashAmenChk');
        if (chk) chk.onchange = function () {
          if (!chk.checked) return;
          chk.disabled = true;
          fetch(url + '/rest/v1/qt_checks', {
            method: 'POST', headers: { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ user_id: uid, check_date: t })
          }).then(function (r) {
            if (!r.ok && r.status !== 409) return r.text().then(function (txt) { throw new Error(txt); });
            box.innerHTML = '<span class="qtc-amen-done">✓ 오늘의 큐티를 마치고 아멘 하셨습니다</span>';
          }).catch(function (e) {
            chk.disabled = false; chk.checked = false;
            var msg = (e && e.message) || '';
            if (/does not exist|42P01|schema cache|Could not find the table/i.test(msg)) {
              alert('저장에 실패했습니다 — Supabase에 qt_checks 테이블이 아직 없습니다.\n관리자는 supabase/qt_checks.sql 을 Supabase SQL Editor에서 1회 실행해 주세요.');
            } else {
              alert('저장에 실패했습니다: ' + (msg || '알 수 없는 오류') + '\n다시 시도해 주세요.');
            }
          });
        };
      })
      .catch(function () { box.innerHTML = ''; });
  }

  /* ================= 진행중인 교육 ================= */
  function fmtSize(n) { if (!n && n !== 0) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  function eduLabel(r) { return esc(r.title) + (r.cohort ? ' · ' + esc(r.cohort) : '') + (r.class_name ? ' · ' + esc(r.class_name) : ''); }
  function loadMyEdu(me) {
    var el = document.getElementById('myEdu'); if (!el) return;
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    if (!url || !ak || !tok) return;
    var t = todayStr();
    fetch(url + '/rest/v1/edu_records?select=id,title,cohort,class_name,edu_date,end_date,teacher&edu_date=lte.' + t, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var ongoing = (rows || []).filter(function (r) { return !r.end_date || r.end_date >= t; });
        if (!ongoing.length) { el.innerHTML = ''; return; }
        var box = '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">📚 진행중인 교육</h3>';
        el.innerHTML = box + ongoing.map(function (r) {
          return '<div class="my-edu-item" data-id="' + esc(r.id) + '" style="border:1px solid #e8edf3;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" class="my-edu-head">' +
            '<b style="font-size:.92rem">' + eduLabel(r) + '</b>' +
            '<span style="font-size:.78rem;color:#9aa5b1">' + esc(r.teacher || '') + ' ▾</span></div>' +
            '<div class="my-edu-body" hidden style="margin-top:8px;font-size:.83rem"></div></div>';
        }).join('') + '</div>';
        Array.prototype.forEach.call(el.querySelectorAll('.my-edu-item'), function (box2) {
          var head = box2.querySelector('.my-edu-head'), bodyEl = box2.querySelector('.my-edu-body');
          var loaded = false;
          head.onclick = function () {
            bodyEl.hidden = !bodyEl.hidden;
            if (!bodyEl.hidden && !loaded) { loaded = true; loadMyEduMaterials(box2.dataset.id, bodyEl, tok, url, ak); }
          };
        });
      })
      .catch(function () { el.innerHTML = ''; });
  }
  function loadMyEduMaterials(eduId, bodyEl, tok, url, ak) {
    bodyEl.innerHTML = '<p class="qt-loading">자료 불러오는 중…</p>';
    fetch(url + '/rest/v1/edu_materials?edu_id=eq.' + eduId + '&select=*&order=created_at.desc', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length) { bodyEl.innerHTML = '<p style="color:#9aa5b1">등록된 자료가 없습니다.</p>'; return; }
        bodyEl.innerHTML = rows.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #f0f3f7">' +
            '<span>📎 ' + esc(r.title) + (r.size ? ' <span style="color:#9aa5b1;font-size:.76rem">· ' + fmtSize(r.size) + '</span>' : '') + '</span>' +
            '<a href="#" class="my-mat-dl" data-path="' + esc(r.path) + '" data-title="' + esc(r.title) + '" style="color:var(--accent,#032257)">다운로드</a></div>';
        }).join('');
        Array.prototype.forEach.call(bodyEl.querySelectorAll('.my-mat-dl'), function (a) {
          a.onclick = function (e) {
            e.preventDefault(); var old = a.textContent; a.textContent = '준비 중…';
            fetch(url + '/storage/v1/object/sign/edu_materials/' + a.dataset.path.split('/').map(encodeURIComponent).join('/'), {
              method: 'POST', headers: { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
            }).then(function (r) { return r.json(); }).then(function (d) {
              a.textContent = old;
              if (!d || !d.signedURL) { alert('다운로드 오류: ' + (d && d.message || '알 수 없는 오류')); return; }
              window.open(url + '/storage/v1' + d.signedURL + '&download=' + encodeURIComponent(a.dataset.title || ''), '_blank');
            }).catch(function (err) { a.textContent = old; alert('다운로드 오류: ' + err.message); });
          };
        });
      })
      .catch(function () { bodyEl.innerHTML = '<p style="color:#9aa5b1">자료를 불러오지 못했습니다.</p>'; });
  }

  /* ================= 헌금 ================= */
  function offeringsFromSupabase(me) {
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var keys = [me.memberKey, me.spouseKey].filter(Boolean);
    if (!url || !ak || !tok || !keys.length) return Promise.reject(new Error('no-supabase'));
    var inlist = keys.map(function (k) { return '"' + encodeURIComponent(k) + '"'; }).join(',');
    var q = url + '/rest/v1/offerings?select=offer_date,category,service,giver,member_key,amount&member_key=in.(' + inlist + ')&order=offer_date.desc&limit=5000';
    return fetch(q, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); }); return r.json(); });
  }
  function spouseBanner(name) {
    return name ? '<p style="background:#e8f6ee;border:1px solid #bfe3cd;color:#1e874b;padding:8px 12px;border-radius:8px;font-size:.85rem;margin-bottom:14px;">💑 배우자 <b>' + esc(name) + '</b>님과 <b>가정 헌금</b>이 합산되어 표시됩니다.</p>' : '';
  }
  function loadOfferings(me) {
    var el = document.getElementById('offeringList');
    offeringsFromSupabase(me).then(function (rows) {
      var note = spouseBanner(me.spouse);
      var list = (rows || []).map(function (o) {
        return { date: o.offer_date, account: o.category || '', service: o.service || '', amount: o.amount, giver: o.giver || '',
                 who: (me.spouseKey && String(o.member_key) === String(me.spouseKey)) ? 'spouse' : 'self' };
      });
      if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
      var r = { spouse: me.spouse || '', total: list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0) };
      renderWithFilter(el, list, r, me, note);
    }).catch(function () {
      WPF.call('myOfferings').then(function (r) {
        var note = spouseBanner(r.spouse);
        var list = r.offerings || [];
        if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
        renderWithFilter(el, list, r, me, note);
      }).catch(function (e) {
        if (el) el.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">헌금 조회 실패: ' + esc(e.message) + '</p>';
      });
    });
  }
  function fmtDate(d) { return String(d == null ? '' : d).slice(0, 10); }
  function anyService(list) { return list.some(function (o) { return o.service; }); }
  function statCard(label, val, color) {
    return '<div style="flex:1;min-width:104px;background:#fff;border:1px solid #e8edf3;border-radius:12px;padding:13px 15px;"><div style="color:#7b8794;font-size:.76rem;margin-bottom:5px;">' + label + '</div><div style="font-size:1.2rem;font-weight:700;color:' + color + ';">' + val + '</div></div>';
  }
  function whoOf(o, selfName, spouseName) {
    if (o.giver) {
      if (spouseName && o.giver === spouseName) return 'spouse';
      if (selfName && o.giver === selfName) return 'self';
    }
    if (o.who === 'self' || o.who === 'spouse') return o.who;
    return 'self';
  }
  function renderWithFilter(el, list, r, me, spouseNote) {
    var selfName = me.memberName || '본인';
    var spouseName = r.spouse || '';
    var hasSelf = list.some(function (o) { return whoOf(o, selfName, spouseName) === 'self'; });
    var hasSpouse = !!spouseName && list.some(function (o) { return whoOf(o, selfName, spouseName) === 'spouse'; });
    if (!hasSpouse || !hasSelf) { renderOfferingView(el, list, r, me, spouseNote); return; }
    el.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      '  <button type="button" class="btn fm-who" data-w="all">합산</button>' +
      '  <button type="button" class="btn fm-who" data-w="self">' + esc(selfName) + '</button>' +
      '  <button type="button" class="btn fm-who" data-w="spouse">' + esc(spouseName) + '</button>' +
      '</div><div id="fmInner"></div>';
    var inner = el.querySelector('#fmInner');
    var tabs = el.querySelectorAll('.fm-who');
    function setActive(b) {
      Array.prototype.forEach.call(tabs, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show(w, btn) {
      setActive(btn);
      var filtered = w === 'all' ? list : list.filter(function (o) { return whoOf(o, selfName, spouseName) === w; });
      var note = w === 'all' ? spouseNote : '';
      var rr = { spouse: r.spouse, total: w === 'all' ? r.total : undefined };
      renderOfferingView(inner, filtered, rr, me, note);
    }
    Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.dataset.w, b); }; });
    show('all', tabs[0]);
  }
  function renderOfferingView(el, list, r, me, spouseNote) {
    var PAL = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7', '#eab308', '#f43f5e', '#0ea5e9'];
    var byAcc = {};
    list.forEach(function (o) { var a = o.account || '기타'; if (!byAcc[a]) byAcc[a] = { name: a, total: 0, count: 0 }; byAcc[a].total += Number(o.amount) || 0; byAcc[a].count++; });
    var accs = Object.keys(byAcc).map(function (k) { return byAcc[k]; }).sort(function (a, b) { return b.total - a.total; });
    accs.forEach(function (a, i) { a.color = PAL[i % PAL.length]; });
    var total = r.total || list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
    var ds = list.map(function (o) { return fmtDate(o.date); }).filter(Boolean).sort();
    var period = ds.length ? ds[0] + ' ~ ' + ds[ds.length - 1] : '';
    var hasGiver = list.some(function (o) { return o.giver && o.giver !== (me.memberName || ''); });
    var R = 54, C = 2 * Math.PI * R, off = 0;
    var segs = accs.map(function (a) {
      var len = (a.total / (total || 1)) * C;
      var s = '<circle r="' + R + '" cx="75" cy="75" fill="none" stroke="' + a.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 75 75)"></circle>';
      off += len; return s;
    }).join('');
    var donut = '<svg viewBox="0 0 150 150" width="150" height="150" style="flex:0 0 auto;">' + segs +
      '<text x="75" y="70" text-anchor="middle" font-size="10" fill="#7b8794">총 헌금</text>' +
      '<text x="75" y="89" text-anchor="middle" font-size="12" font-weight="700" fill="#032257">' + won(total) + '</text></svg>';
    var legend = '<div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px;">' +
      accs.map(function (a) { return '<div style="display:flex;align-items:center;gap:8px;font-size:.85rem;"><span style="width:11px;height:11px;border-radius:3px;background:' + a.color + ';flex:0 0 auto;"></span><span style="flex:1;">' + esc(a.name) + '</span><b style="font-variant-numeric:tabular-nums;">' + won(a.total) + '</b><span style="color:#9aa5b1;width:40px;text-align:right;">' + (total ? (a.total / total * 100).toFixed(0) : 0) + '%</span></div>'; }).join('') +
      '</div>';
    var maxAcc = accs.length ? accs[0].total : 1;
    var byTab = '<table style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      accs.map(function (a) {
        var bar = (a.total / (maxAcc || 1) * 100).toFixed(1);
        return '<tr><td style="padding:7px 8px 7px 0;white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + a.color + ';margin-right:6px;"></span>' + esc(a.name) + '</td>' +
          '<td style="width:44%;padding:7px 0;"><div style="background:#eef2f7;border-radius:5px;height:9px;overflow:hidden;"><div style="width:' + bar + '%;height:100%;background:' + a.color + ';"></div></div></td>' +
          '<td style="text-align:right;padding:7px 0 7px 8px;font-variant-numeric:tabular-nums;"><b>' + won(a.total) + '</b> <span style="color:#9aa5b1;">' + a.count + '건</span></td></tr>';
      }).join('') + '</table>';
    var sorted = list.slice().sort(function (a, b) { return String(fmtDate(b.date)).localeCompare(String(fmtDate(a.date))); });
    var sv = anyService(list);
    var allTab = '<div style="overflow:auto;max-height:460px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      '<thead><tr style="position:sticky;top:0;background:#f5f8fc;"><th style="text-align:left;padding:8px;">일자</th>' + (hasGiver ? '<th style="text-align:left;padding:8px;">헌금자</th>' : '') + '<th style="text-align:left;padding:8px;">항목</th>' + (sv ? '<th style="text-align:left;padding:8px;">예배</th>' : '') + '<th style="text-align:right;padding:8px;">금액</th></tr></thead><tbody>' +
      sorted.map(function (o) { return '<tr><td style="padding:6px 8px;">' + esc(fmtDate(o.date)) + '</td>' + (hasGiver ? '<td style="padding:6px 8px;">' + esc(o.giver || '') + '</td>' : '') + '<td style="padding:6px 8px;">' + esc(o.account || '') + '</td>' + (sv ? '<td style="padding:6px 8px;">' + esc(o.service || '') + '</td>' : '') + '<td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">' + won(o.amount) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc;"><td colspan="' + (1 + (hasGiver ? 1 : 0) + (sv ? 1 : 0)) + '" style="padding:8px;text-align:right;">합계</td><td style="padding:8px;text-align:right;">' + won(total) + '</td></tr></tfoot></table></div>';
    el.innerHTML = spouseNote +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
        statCard('총 헌금액', won(total) + '원', '#032257') +
        statCard('헌금 건수', list.length + '건', '#1e874b') +
        statCard('헌금 항목', accs.length + '개', '#3b82f6') +
      '</div>' +
      '<div class="form-card" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:14px;padding:18px;">' + donut + legend + '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<button type="button" class="btn os-tab" data-o="acc">항목별</button>' +
        '<button type="button" class="btn os-tab" data-o="all">전체 내역</button>' +
      '</div>' +
      '<div id="osPanel"></div>' +
      '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:10px;">🔒 본인(부부)에게만 표시됩니다.' + (period ? ' · 기간 ' + esc(period) : '') + '</p>';
    var panel = el.querySelector('#osPanel');
    var tabs2 = el.querySelectorAll('.os-tab');
    function setActive2(b) {
      Array.prototype.forEach.call(tabs2, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show2(which, btn) { setActive2(btn); panel.innerHTML = which === 'all' ? allTab : '<div class="form-card" style="padding:16px;">' + byTab + '</div>'; }
    Array.prototype.forEach.call(tabs2, function (b) { b.onclick = function () { show2(b.dataset.o, b); }; });
    show2('acc', tabs2[0]);
  }

  /* ================= 가계도 ================= */
  function loadFamily(me) {
    var el = document.getElementById('familyTree'); if (!el) return;
    if (!(window.WPF && WPF.call)) return;
    WPF.call('myFamily').then(function (r) {
      var ms = (r && r.members) || [];
      if (!ms.length) { el.innerHTML = ''; return; }
      el.innerHTML = renderFamilyTree(ms, me);
    }).catch(function () { el.innerHTML = ''; });
  }
  function renderFamilyTree(ms, me) {
    var myKeys = [me.memberKey, me.spouseKey].filter(Boolean).map(String);
    function bday(m) { var bd = (String(m.member_key || '').split('|')[1]) || ''; if (bd.length === 8) return bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8); return String(m.birth || '').slice(0, 10); }
    function headOf(m) { return m.head || m.name; }
    var heads = {}, order = [];
    ms.forEach(function (m) { var h = headOf(m); if (!heads[h]) { heads[h] = []; order.push(h); } heads[h].push(m); });
    var myHead = (function () { for (var i = 0; i < ms.length; i++) if (myKeys.indexOf(String(ms[i].member_key)) >= 0) return headOf(ms[i]); return order[0]; })();
    order.sort(function (a, b) { return (b === myHead ? 0 : 1) - (a === myHead ? 0 : 1) || a.localeCompare(b, 'ko'); });
    function isMine(m) { return myKeys.indexOf(String(m.member_key)) >= 0; }
    function person(m, kind) {
      var mine = isMine(m);
      var icon = kind === 'head' ? '⌂ ' : (kind === 'spouse' ? '💑 ' : '');
      return '<span style="display:inline-flex;align-items:center;gap:5px">' + icon +
        '<b style="' + (mine ? 'color:#1e874b' : (kind === 'head' ? 'color:var(--accent,#032257)' : '')) + '">' + esc(m.name) + '</b>' +
        (mine ? '<span style="font-size:.7rem;background:#e8f6ee;color:#1e874b;border-radius:999px;padding:1px 7px">나</span>' : '') +
        '<span style="font-size:.74rem;color:#7b8794">' + esc(kind === 'head' ? '세대주' : (m.relation || (kind === 'spouse' ? '배우자' : ''))) + (bday(m) ? ' · ' + esc(bday(m)) : '') + '</span></span>';
    }
    function household(h) {
      var fam = heads[h];
      var head = null, spouse = null;
      for (var i = 0; i < fam.length; i++) if (fam[i].name === h) { head = fam[i]; break; }
      for (var j = 0; j < fam.length; j++) { var f = fam[j]; if (f !== head && (f.relation === '배우자' || (head && f.member_key && f.member_key === head.spouse_key))) { spouse = f; break; } }
      var others = fam.filter(function (m) { return m !== head && m !== spouse; }).sort(function (a, b) { return bday(a).localeCompare(bday(b)); });
      var origin = head && head.origin_head ? head.origin_head : '';
      var isMy = (h === myHead);
      return '<div style="border:1px solid ' + (isMy ? '#bfe3cd' : '#e8edf3') + ';border-radius:12px;padding:12px 14px;margin-bottom:10px;background:' + (isMy ? '#f4fbf6' : '#fff') + '">' +
        (origin ? '<div style="font-size:.76rem;color:#9aa5b1;margin-bottom:5px">↑ ' + esc(origin) + '님 가정에서 분가</div>' : '') +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' + (head ? person(head, 'head') : '') + (spouse ? '<span style="color:#cdd5e1">—</span>' + person(spouse, 'spouse') : '') + '</div>' +
        others.map(function (m) { return '<div style="padding:4px 0 4px 18px;color:#cbd5e1">└ ' + person(m, 'child') + '</div>'; }).join('') +
        '</div>';
    }
    return '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 4px;color:var(--accent,#032257);font-size:1rem">👪 우리 가족 가계도</h3>' +
      '<p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px">교적에 등록된 우리 가족 관계입니다. (변경은 교회 사무실·관리자에게 문의)</p>' +
      order.map(household).join('') + '</div>';
  }

  /* ================= QT 진행표 (성경 66권 커버리지) ================= */
  var BIBLE_OT = ['창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기', '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기'];
  var BIBLE_NT = ['마태복음', '마가복음', '누가복음', '요한복음', '사도행전', '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서', '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서', '요한계시록'];
  var BOOK_ALIAS = (function () {
    var m = {};
    BIBLE_OT.concat(BIBLE_NT).forEach(function (n) { m[n] = n; });
    var ab = { 창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기', 수: '여호수아', 삿: '사사기', 룻: '룻기', 삼상: '사무엘상', 삼하: '사무엘하', 왕상: '열왕기상', 왕하: '열왕기하', 대상: '역대상', 대하: '역대하', 스: '에스라', 느: '느헤미야', 에: '에스더', 욥: '욥기', 시: '시편', 잠: '잠언', 전: '전도서', 아: '아가', 사: '이사야', 렘: '예레미야', 애: '예레미야애가', 겔: '에스겔', 단: '다니엘', 호: '호세아', 욜: '요엘', 암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가', 나: '나훔', 합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기', 마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음', 행: '사도행전', 롬: '로마서', 고전: '고린도전서', 고후: '고린도후서', 갈: '갈라디아서', 엡: '에베소서', 빌: '빌립보서', 골: '골로새서', 살전: '데살로니가전서', 살후: '데살로니가후서', 딤전: '디모데전서', 딤후: '디모데후서', 딛: '디도서', 몬: '빌레몬서', 히: '히브리서', 약: '야고보서', 벧전: '베드로전서', 벧후: '베드로후서', 요일: '요한일서', 요이: '요한이서', 요삼: '요한삼서', 유: '유다서', 계: '요한계시록' };
    Object.keys(ab).forEach(function (k) { m[k] = ab[k]; });
    return m;
  })();
  function bookOf(scripture) {
    var s = String(scripture == null ? '' : scripture).trim();
    var m = s.match(/^([가-힣]+)/);
    if (!m) return null;
    var tok = m[1];
    if (BOOK_ALIAS[tok]) return BOOK_ALIAS[tok];
    for (var len = tok.length; len >= 1; len--) {
      var pre = tok.slice(0, len);
      if (BOOK_ALIAS[pre]) return BOOK_ALIAS[pre];
    }
    return null;
  }
  function loadQtProgress(me) {
    var el = document.getElementById('qtProgress'); if (!el) return;
    el.innerHTML = '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 4px;font-size:1rem;color:var(--accent,#032257);">📊 QT 진행표</h3><p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px;">아멘한 큐티의 말씀 본문이 성경 66권 중 어디를 지나왔는지 보여줍니다. 표시된 책을 누르면 그때 읽은 큐티를 다시 볼 수 있습니다.</p><div id="qtProgGrid"><p class="qt-loading">불러오는 중…</p></div><div id="qtProgDetail"></div></div>';
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var uid = sbUser() && sbUser().id;
    if (!uid || !tok) { el.querySelector('#qtProgGrid').innerHTML = ''; return; }
    fetch(url + '/rest/v1/qt_checks?select=check_date&order=check_date.asc', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (checks) {
        var dates = (checks || []).map(function (c) { return c.check_date; }).filter(Boolean);
        if (!dates.length) { drawGrid({}, {}); return; }
        var inlist = dates.map(function (d) { return '"' + d + '"'; }).join(',');
        return fetch(url + '/rest/v1/qt_published?select=sermon_date,title,scripture,qt_bible_text,content,prayer&sermon_date=in.(' + inlist + ')&order=sermon_date.desc', { headers: { apikey: ak, Authorization: 'Bearer ' + ak } })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            var covered = {}, byBook = {};
            (rows || []).forEach(function (r) {
              var bk = bookOf(r.scripture); if (!bk) return;
              covered[bk] = (covered[bk] || 0) + 1;
              (byBook[bk] = byBook[bk] || []).push(r);
            });
            drawGrid(covered, byBook);
          });
      })
      .catch(function () { drawGrid({}, {}); });
    function grpHTML(list, covered) {
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;">' +
        list.map(function (b) {
          var n = covered[b] || 0;
          var on = n > 0;
          return '<div class="qtc-bookcell' + (on ? ' on' : '') + '" data-book="' + esc(b) + '" title="' + esc(b) + (on ? ' · ' + n + '회 · 눌러서 보기' : '') + '" style="padding:7px 4px;text-align:center;border-radius:6px;font-size:.74rem;font-weight:700;background:' + (on ? '#0d9488' : '#eef2f7') + ';color:' + (on ? '#fff' : '#9aa5b1') + ';word-break:keep-all;line-height:1.3;' + (on ? 'cursor:pointer;' : '') + '">' + esc(b) + (on ? '<div style="font-size:.64rem;font-weight:400;opacity:.85;">' + n + '회</div>' : '') + '</div>';
        }).join('') + '</div>';
    }
    function entryHTML(r, i) {
      return '<div class="qtc-bookentry" data-i="' + i + '" style="border:1px solid #e8edf3;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<b style="font-size:.9rem;">' + esc(r.title || '') + '</b>' +
        '<span style="font-size:.76rem;color:#9aa5b1;">' + esc(r.sermon_date) + ' ▾</span></div>' +
        (r.scripture ? '<div style="font-size:.8rem;color:var(--accent,#032257);margin-top:2px;">' + esc(r.scripture) + '</div>' : '') +
        '<div class="qtc-bookentry-body" hidden style="margin-top:10px;"></div></div>';
    }
    function drawGrid(covered, byBook) {
      var grid = el.querySelector('#qtProgGrid'); if (!grid) return;
      var detail = el.querySelector('#qtProgDetail');
      var totalCovered = BIBLE_OT.concat(BIBLE_NT).filter(function (b) { return covered[b]; }).length;
      grid.innerHTML =
        '<p style="font-size:.85rem;color:#3a4a63;margin:0 0 10px;font-weight:600;">' + totalCovered + ' / 66권 커버</p>' +
        '<div style="margin-bottom:6px;font-size:.76rem;color:#9aa5b1;font-weight:700;">구약</div>' + grpHTML(BIBLE_OT, covered) +
        '<div style="margin:14px 0 6px;font-size:.76rem;color:#9aa5b1;font-weight:700;">신약</div>' + grpHTML(BIBLE_NT, covered);
      Array.prototype.forEach.call(grid.querySelectorAll('.qtc-bookcell.on'), function (cell) {
        cell.onclick = function () { showBookQt(cell.dataset.book, byBook[cell.dataset.book] || [], detail); };
      });
    }
    function showBookQt(book, rows, detail) {
      if (!detail) return;
      detail.innerHTML = '<div style="border-top:1px solid #eef1f5;margin-top:16px;padding-top:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<b style="font-size:.92rem;color:var(--accent,#032257);">' + esc(book) + ' — 읽은 큐티 ' + rows.length + '건</b>' +
        '<button type="button" id="qtProgDetailClose" class="btn btn-line" style="padding:3px 12px;font-size:.78rem;white-space:nowrap;">✕ 닫기</button></div>' +
        '<div style="margin-top:10px;">' + rows.map(entryHTML).join('') + '</div></div>';
      var closeBtn = detail.querySelector('#qtProgDetailClose');
      if (closeBtn) closeBtn.onclick = function () { detail.innerHTML = ''; };
      Array.prototype.forEach.call(detail.querySelectorAll('.qtc-bookentry'), function (card) {
        var r = rows[Number(card.dataset.i)];
        var body = card.querySelector('.qtc-bookentry-body');
        var loaded = false;
        card.onclick = function () {
          body.hidden = !body.hidden;
          if (!body.hidden && !loaded) {
            loaded = true;
            body.innerHTML =
              (r.qt_bible_text ? '<div class="qtc-bible">' + bibleVersesHTML(r.qt_bible_text) + '</div>' : '') +
              (r.content ? '<div class="qtc-head">📝 묵상</div><div class="qtc-body">' + toParaHTML(r.content) + '</div>' : '') +
              (r.prayer ? '<div class="qtc-head">🙏 기도</div><div class="qtc-body">' + toParaHTML(r.prayer) + '</div>' : '');
          }
        };
      });
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitLogin);
  else waitLogin();
})();
