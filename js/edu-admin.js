/* edu-admin.js — 목회행정: 강의실(학습·세례(입교) 교육과정) 이수자·수강 현황·증명서 (2026-10-25 담임목사 지시)
 *  affairs.js 대시보드가 불러 WPCEduAdmin.dash(panel, ctx) 로 연다. ctx = { api, esc, note, pushBackClose }
 *  · 대시보드: '교육 · 강의실' 숫자 카드 3개 + '교육 이수자 명단' 표(시험지 PDF · 증명서 발급 · 교적 연결)
 *  · 창: 이수자 / 수강 현황 / 증명서 대장 — 증명서 직접 발급(강의실 밖에서 문답한 성도도), 취소 표시
 *  · 증명서 발급: rpc edu_cert_issue → 번호(2026-학-001)·자료실(member_files) 항목 → edu-print.html?cert= 인쇄
 *    '교적 신급·세례일도 바꾸기' 를 고르면 교적(gyojeok)도 WPF.call('updateGyojeok') 로 함께 고친다
 *  자료: supabase/20261025_1600_edu_classroom.sql (실행 전에는 카드에 '준비 중' 으로 조용히 표시)
 */
console.log('[edu-admin.js] v20261025cr1');

(function () {
  if (window.WPCEduAdmin) return;
  var COURSE = { learn: '학습', baptism: '세례(입교)' };
  var CH = (window.WPC_CATECHISM && window.WPC_CATECHISM.church) || { name: '운평장로교회', pastor: '김동석' };
  var X = null;   // ctx
  var D = { results: [], certs: [], prog: [], ready: null };
  var GJ = null;  // 교적 [{id,name,key,birth,grade,bap,role,group}]

  function esc(s) { return X.esc(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dday(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function birthOfKey(k) { var b = String(k || '').split('|')[1] || ''; return /^\d{8}$/.test(b) ? b.slice(0, 4) + '-' + b.slice(4, 6) + '-' + b.slice(6, 8) : ''; }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }
  function certOf(r) { return D.certs.filter(function (c) { return c.result_id === r.id && !c.voided_at; })[0] || null; }
  function passed() { return D.results.filter(function (r) { return r.passed; }); }

  function load() {
    return Promise.all([
      X.api('GET', 'edu_exam_results?select=id,user_id,course,member_key,member_name,score,correct,total,passed,created_at&order=created_at.desc&limit=2000'),
      X.api('GET', 'edu_certificates?select=*&order=created_at.desc&limit=2000'),
      X.api('POST', 'rpc/edu_admin_progress', {}).catch(function () { return []; })
    ]).then(function (res) {
      D.results = res[0] || []; D.certs = res[1] || []; D.prog = Array.isArray(res[2]) ? res[2] : []; D.ready = true;
    }, function (e) { D.ready = notReady(e) ? false : null; throw e; });
  }
  function loadGJ() {
    if (GJ) return Promise.resolve(GJ);
    if (!window.WPF) return Promise.resolve([]);
    return WPF.call('listGyojeok').then(function (r) {
      GJ = (r.members || []).filter(function (m) { return m['이름']; }).map(function (m) {
        return { id: m['교적ID'], name: m['이름'], key: m['매칭키'] || '', birth: String(m['생년월일'] || '').slice(0, 10), grade: m['신급'] || '', bap: String(m['세례일'] || '').slice(0, 10), role: m['직책'] || '', group: m['그룹'] || m['소속그룹'] || '' };
      });
      return GJ;
    }).catch(function () { GJ = []; return GJ; });
  }
  function gjByKey(k) { if (!k || !GJ) return null; for (var i = 0; i < GJ.length; i++) if (GJ[i].key === k) return GJ[i]; return null; }

  /* ═════════════ 대시보드 ═════════════ */
  function dash(panel, ctx) {
    X = ctx;
    var box = panel.querySelector('#eduList');
    function setCard(numId, subId, n, sub) { var a = panel.querySelector('#' + numId), b = panel.querySelector('#' + subId); if (a) a.textContent = n; if (b) b.textContent = sub; }
    ['eduDoneCard', 'eduProgCard', 'eduCertCard'].forEach(function (id, i) { var c = panel.querySelector('#' + id); if (c) c.onclick = function () { openModal(['done', 'prog', 'cert'][i]); }; });
    var more = panel.querySelector('[data-edu-open]'); if (more) more.onclick = function () { openModal('done'); };
    load().then(function () {
      var ps = passed(), nL = ps.filter(function (r) { return r.course === 'learn'; }).length, nB = ps.length - nL;
      var wait = ps.filter(function (r) { return !certOf(r); });
      var inprog = D.prog.filter(function (p) { return !p.passed; }), ready = inprog.filter(function (p) { return (p.done || []).length >= (p.course === 'learn' ? 11 : 12); });
      var yr = String(new Date().getFullYear()), certsY = D.certs.filter(function (c) { return !c.voided_at && String(c.issued_on || '').slice(0, 4) === yr; });
      setCard('eduDoneNum', 'eduDoneSub', ps.length + '명', '학습 ' + nL + ' · 세례(입교) ' + nB + (wait.length ? ' · 증명서 대기 ' + wait.length : '') + ' · 눌러서 명단');
      setCard('eduProgNum', 'eduProgSub', inprog.length + '명', (ready.length ? '시험 볼 차례 ' + ready.length + '명 · ' : '') + '진도·응시 현황 · 눌러서 보기');
      setCard('eduCertNum', 'eduCertSub', certsY.length + '건', yr + '년 발급 · 전체 ' + D.certs.filter(function (c) { return !c.voided_at; }).length + '건 · 눌러서 대장');
      if (wait.length) X.note('edu', '강의실에서 <b>' + wait.length + '명</b>이 교육을 이수했습니다 — ' + esc(wait.slice(0, 3).map(function (r) { return r.member_name + '(' + COURSE[r.course] + ')'; }).join(', ')) + (wait.length > 3 ? ' 외' : '') + '. 당회 문답 뒤 증명서를 발급해 주십시오.', '이수자 보기', function () { openModal('done'); }, 'eduDoneCard');
      if (box) drawList(box, ps.slice(0, 8));
    }).catch(function (e) {
      var ready = D.ready === false;
      setCard('eduDoneNum', 'eduDoneSub', '–', ready ? '준비 중 — SQL 20261025_1600 실행 뒤 표시' : '불러오지 못했습니다');
      setCard('eduProgNum', 'eduProgSub', '–', ready ? '준비 중' : '불러오지 못했습니다');
      setCard('eduCertNum', 'eduCertSub', '–', ready ? '준비 중' : '불러오지 못했습니다');
      if (box) box.innerHTML = '<p style="color:#A3907F;font-size:.86rem;margin:0">' + (ready ? '강의실 기록 표가 아직 없습니다. 마이그레이션 supabase/20261025_1600_edu_classroom.sql 을 실행하면 이수자가 여기에 나타납니다.' : '이수자 명단을 불러오지 못했습니다: ' + esc((e && e.message) || '')) + '</p>';
    });
  }
  // 이수자 표(대시보드·창 공용)
  function drawList(box, rows, redraw) {
    if (!rows.length) { box.innerHTML = '<p style="color:#A3907F;font-size:.86rem;margin:0">아직 이수자가 없습니다. 성도들이 <a href="classroom.html" target="_blank" rel="noopener" style="text-decoration:underline">강의실</a>에서 과정을 마치면 여기에 나타납니다.</p>'; return; }
    box.innerHTML = '<div style="overflow:auto"><table class="dsh-tbl edu-tbl"><tbody>' + rows.map(function (r) {
      var c = certOf(r);
      return '<tr><td class="d">' + esc(dday(r.created_at)) + '</td>' +
        '<td class="edu-s" style="white-space:nowrap;width:1%"><span class="dsh-chip">' + esc(COURSE[r.course] || r.course) + '</span></td>' +
        '<td class="t">' + esc(r.member_name) + (r.member_key ? '' : ' <span class="dsh-chip" style="border-color:#E3B9A6;color:#A33A2A">교적 미연결</span>') + '</td>' +
        '<td class="edu-n">' + esc(r.score) + '점</td>' +
        '<td class="edu-act"><a class="dn-btn" style="margin:0" href="edu-print.html?sheet=' + r.id + '" target="_blank" rel="noopener">시험지 PDF</a>' +
        (r.member_key ? '' : '<button type="button" class="dn-btn" style="margin:0" data-link="' + r.id + '">교적 연결</button>') +
        (c ? '<a class="dn-btn" style="margin:0;background:#13110F;color:#fff;border-color:#13110F" href="edu-print.html?cert=' + c.id + '" target="_blank" rel="noopener">증명서 ' + esc(c.cert_no) + '</a>'
          : '<button type="button" class="dn-btn" style="margin:0" data-issue="' + r.id + '">증명서 발급</button>') +
        '</td></tr>';
    }).join('') + '</tbody></table></div>';
    bindRowActions(box, redraw || function () { drawList(box, rows); });
  }
  function bindRowActions(box, redraw) {
    Array.prototype.forEach.call(box.querySelectorAll('[data-issue]'), function (b) { b.onclick = function () { var r = D.results.filter(function (x) { return String(x.id) === b.dataset.issue; })[0]; issueDialog(r, null, redraw); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-link]'), function (b) { b.onclick = function () { var r = D.results.filter(function (x) { return String(x.id) === b.dataset.link; })[0]; linkDialog(r, redraw); }; });
  }

  /* ═════════════ 창: 이수자 / 수강 현황 / 증명서 대장 ═════════════ */
  function overlay(maxw) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(23,17,12,.5);z-index:9700;display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto';
    ov.innerHTML = '<div class="edu-box" style="background:#fff;border-radius:6px;max-width:' + (maxw || 1000) + 'px;width:100%;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.3)"></div>';
    document.body.appendChild(ov);
    var close = X.pushBackClose(function () { ov.remove(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    return { ov: ov, box: ov.querySelector('.edu-box'), close: close };
  }
  function openModal(tab) {
    var m = overlay(1040), cur = tab || 'done';
    function head() {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><h3 style="margin:0;color:var(--accent,#3A281C)">🎓 강의실 — 학습·세례(입교) 교육</h3>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn btn-line" href="classroom.html" target="_blank" rel="noopener" style="padding:3px 11px">강의실 열기 ↗</a><button class="btn btn-line" data-x="reload" style="padding:3px 11px">새로고침</button><button class="btn btn-line" data-x="close" style="padding:3px 11px">닫기</button></div></div>' +
        '<p style="margin:0 0 10px;font-size:.78rem;color:#AFA49C;line-height:1.55">이수 = 강의실에서 모든 장을 공부하고 이수 시험(20문항)에서 70점 이상. 이수 기록은 교적 매칭키와 함께 저장되어 교적 상세·자료실(출석/이수)에도 보입니다. 당회 문답과 예식을 마치면 <b>증명서 발급</b>을 눌러 번호를 매겨 인쇄합니다.</p>' +
        '<div class="fin-tabs" style="margin:8px 0 14px">' + [['done', '이수자'], ['prog', '수강 현황'], ['cert', '증명서 대장']].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (t[0] === cur ? 'active' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="eduBody"></div>';
    }
    function draw() {
      m.box.innerHTML = head();
      m.box.querySelector('[data-x="close"]').onclick = m.close;
      m.box.querySelector('[data-x="reload"]').onclick = function () { body.innerHTML = '<p class="qt-loading">불러오는 중…</p>'; load().then(draw, function (e) { body.innerHTML = '<p style="color:#A33A2A">' + esc(e.message) + '</p>'; }); };
      Array.prototype.forEach.call(m.box.querySelectorAll('[data-tab]'), function (b) { b.onclick = function () { cur = b.dataset.tab; draw(); }; });
      var body = m.box.querySelector('#eduBody');
      if (D.ready !== true) { body.innerHTML = '<p style="color:#A3907F">강의실 기록 표가 아직 없습니다. supabase/20261025_1600_edu_classroom.sql 을 실행해 주십시오.</p>'; return; }
      if (cur === 'done') drawDone(body, draw);
      else if (cur === 'prog') drawProg(body);
      else drawCerts(body, draw);
    }
    if (D.ready === true) draw(); else { m.box.innerHTML = '<p class="qt-loading">불러오는 중…</p>'; load().then(draw, draw); }
  }
  function drawDone(body, redraw) {
    var ps = passed(), q = '';
    body.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><input id="eduQ" placeholder="이름 검색" style="flex:1;min-width:160px;padding:7px 10px;border:1px solid #DDD9D5;border-radius:3px;font:inherit">' +
      '<span style="font-size:.84rem;color:#7D7167">이수 ' + ps.length + '명 · 응시 ' + D.results.length + '회</span></div><div id="eduDoneList"></div>';
    var list = body.querySelector('#eduDoneList');
    function paint() { var v = q.trim(); drawList(list, ps.filter(function (r) { return !v || String(r.member_name).indexOf(v) >= 0; }), redraw); }
    body.querySelector('#eduQ').oninput = function () { q = this.value; paint(); };
    paint();
  }
  function drawProg(body) {
    var C = window.WPC_CATECHISM, tot = function (c) { return C && C.courses[c] ? C.courses[c].chapters.length + 1 : (c === 'learn' ? 11 : 12); };
    if (!D.prog.length) { body.innerHTML = '<p style="color:#A3907F">아직 강의실을 연 성도가 없습니다.</p>'; return; }
    body.innerHTML = '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>이름</th><th>과정</th><th>진도</th><th class="num">응시</th><th class="num">최고점</th><th>상태</th><th>마지막 공부</th></tr></thead><tbody>' +
      D.prog.map(function (p) {
        var n = (p.done || []).length, t = tot(p.course), st = p.passed ? '<span class="fin-pill" style="background:#13110F;color:#fff">이수</span>' : n >= t ? '<span class="fin-pill" style="background:#FBEDE4;color:#9C4825">시험 볼 차례</span>' : '<span class="fin-pill">공부 중</span>';
        return '<tr><td><b>' + esc(p.name) + '</b>' + (p.member_key ? '' : ' <small style="color:#A33A2A">교적 미연결</small>') + '</td><td>' + esc(COURSE[p.course] || p.course) + '</td>' +
          '<td><div style="display:flex;align-items:center;gap:8px;min-width:150px"><div class="dsh-bar" style="height:8px"><i style="width:' + Math.round(n / t * 100) + '%"></i></div><span style="font-size:.8rem;white-space:nowrap">' + n + '/' + t + '</span></div></td>' +
          '<td class="num">' + (p.tries || 0) + '</td><td class="num">' + (p.best == null ? '–' : p.best + '점') + '</td><td>' + st + '</td><td style="white-space:nowrap">' + esc(dday(p.updated_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  /* ── 도장 설정: 교회 직인(images/운평장로교회직인.png, '회' 자에 반쯤 걸침) · 당회장 인('(인)' 자리) ──
       당회장 인은 저장소(공개)에 넣지 않고 교회 파일 서버(R2)에 올려 주소만 app_settings 'edu_img_pastor_seal' 에 둔다(관리자·재정권한자만 읽음).
       흰 바탕 사진도 올릴 수 있게 밝은 바탕을 투명하게 바꾼 PNG 로 올린다 */
  var PS_KEY = 'edu_img_pastor_seal';
  function sealsHTML() {
    return '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;border:1px solid #E4DED9;border-radius:4px;padding:12px 14px;background:#FBFAF9;margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;align-items:center;min-width:240px;flex:1"><img src="images/' + encodeURIComponent('운평장로교회직인.png') + '" alt="교회 직인" style="width:58px;height:58px;object-fit:contain">' +
      '<div style="font-size:.8rem;color:#6B625B;line-height:1.55"><b style="color:#2E2016">교회 직인</b><br>‘' + esc(CH.name || '운평장로교회') + '’ 의 끝 글자 ‘회’ 에 반쯤 걸쳐 찍힙니다.</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;min-width:280px;flex:1.4"><span id="psPrev" style="width:58px;height:58px;display:inline-flex;align-items:center;justify-content:center;border:1px dashed #D8D3D0;border-radius:4px;font-size:.72rem;color:#AFA49C;flex:none">불러오는 중</span>' +
      '<div style="font-size:.8rem;color:#6B625B;line-height:1.55"><b style="color:#2E2016">당회장 인</b><br>‘담임목사 ' + esc(CH.pastor || '') + ' (인)’ 자리에 찍힙니다. 흰 바탕 사진도 됩니다(바탕을 투명하게 바꿔 저장).' +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap"><input type="file" id="psFile" accept="image/*" hidden><button type="button" class="btn btn-line" id="psUp" style="padding:3px 11px;font-size:.78rem">도장 이미지 올리기</button>' +
      '<button type="button" class="btn btn-line" id="psDel" style="padding:3px 11px;font-size:.78rem;color:#A33A2A" hidden>지우기</button><span id="psMsg" style="font-size:.78rem"></span></div></div></div></div>';
  }
  // 밝은 바탕(흰색·누런 종이)을 투명하게 — 붉은 인주만 남긴다. 최대 600px PNG
  function sealToPng(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 600 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
        var d = g.getImageData(0, 0, w, h), px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          var r = px[i], gg = px[i + 1], b = px[i + 2], light = Math.min(r, gg, b);
          if (light > 200) px[i + 3] = 0;                                   // 거의 흰 바탕 → 투명
          else if (light > 150) px[i + 3] = Math.round(px[i + 3] * (200 - light) / 50);   // 가장자리는 부드럽게
        }
        g.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        cv.toBlob(function (blob) { blob ? resolve(new File([blob], 'pastor-seal.png', { type: 'image/png' })) : reject(new Error('이미지를 바꾸지 못했습니다')); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
      img.src = url;
    });
  }
  function bindSeals(body) {
    var prev = body.querySelector('#psPrev'), msg = body.querySelector('#psMsg'), fi = body.querySelector('#psFile'), del = body.querySelector('#psDel');
    function show(u) {
      prev.innerHTML = u ? '<img src="' + esc(u) + '" alt="당회장 인" style="width:56px;height:56px;object-fit:contain">' : '미등록';
      del.hidden = !u;
    }
    function say(ok, t) { msg.style.color = ok ? 'green' : '#A33A2A'; msg.textContent = t; }
    if (!window.WPF) { prev.textContent = '–'; say(false, '설정 저장소를 쓸 수 없습니다'); return; }
    WPF.call('getSettings').then(function (r) { show((r && r.settings && r.settings[PS_KEY]) || ''); }, function () { show(''); });
    body.querySelector('#psUp').onclick = function () { fi.click(); };
    fi.onchange = function () {
      var f = fi.files && fi.files[0]; fi.value = '';
      if (!f) return;
      if (!(window.ChurchUpload && ChurchUpload.isReady())) { say(false, '업로드 서버가 설정되지 않았습니다'); return; }
      say(true, ''); msg.style.color = '#93867C'; msg.textContent = '올리는 중…';
      sealToPng(f).then(function (png) { return ChurchUpload.upload(png, { folder: 'church/seal', compress: false }); })
        .then(function (res) { return WPF.call('setSetting', { key: PS_KEY, value: res.url }).then(function () { show(res.url); say(true, '✓ 저장했습니다. 이제 증명서에 찍힙니다.'); }); })
        .catch(function (e) { say(false, '실패: ' + (e.message || e)); });
    };
    del.onclick = function () {
      if (!confirm('당회장 인 이미지를 지울까요? (증명서에는 ‘(인)’ 만 남습니다)')) return;
      WPF.call('setSetting', { key: PS_KEY, value: '' }).then(function () { show(''); say(true, '지웠습니다'); }, function (e) { say(false, '실패: ' + e.message); });
    };
  }
  function drawCerts(body, redraw) {
    body.innerHTML = sealsHTML() + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn btn-solid" id="eduNewCert" style="padding:7px 14px">＋ 증명서 직접 발급</button>' +
      '<span style="font-size:.8rem;color:#93867C">강의실 밖에서 문답한 성도도 교적에서 골라 발급할 수 있습니다. 발급하면 자료실(성도별 자료)에도 들어갑니다.</span></div>' +
      (D.certs.length ? '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>번호</th><th>종류</th><th>이름</th><th>문답일</th><th>예식일</th><th>집례</th><th>발급일</th><th></th></tr></thead><tbody>' +
        D.certs.map(function (c) {
          var off = !!c.voided_at;
          return '<tr style="' + (off ? 'opacity:.5;text-decoration:line-through' : '') + '"><td style="white-space:nowrap"><b>' + esc(c.cert_no) + '</b></td><td>' + esc(c.kind) + '</td><td>' + esc(c.member_name) + '</td><td>' + esc(c.qa_date || '') + '</td><td>' + esc(c.rite_date || '') + '</td><td>' + esc(c.officiant || '') + '</td><td style="white-space:nowrap">' + esc(c.issued_on) + '</td>' +
            '<td style="text-align:right;white-space:nowrap;text-decoration:none"><a class="btn btn-line" href="edu-print.html?cert=' + c.id + '" target="_blank" rel="noopener" style="padding:3px 10px;font-size:.8rem">보기·인쇄</a>' +
            (off ? '' : ' <button type="button" class="btn btn-line" data-void="' + c.id + '" style="padding:3px 10px;font-size:.8rem;color:#A33A2A">취소</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p style="color:#A3907F">아직 발급한 증명서가 없습니다.</p>');
    body.querySelector('#eduNewCert').onclick = function () { issueDialog(null, null, redraw); };
    bindSeals(body);
    Array.prototype.forEach.call(body.querySelectorAll('[data-void]'), function (b) {
      b.onclick = function () {
        var c = D.certs.filter(function (x) { return String(x.id) === b.dataset.void; })[0];
        if (!c || !confirm(c.cert_no + ' ' + c.member_name + ' ' + c.kind + '교인 증명서를 취소로 표시할까요?\n(지우지 않고 ‘취소’ 표시만 남습니다. 번호는 다시 쓰지 않습니다.)')) return;
        X.api('PATCH', 'edu_certificates?id=eq.' + c.id, { voided_at: new Date().toISOString() }, 'return=minimal')
          .then(function () { c.voided_at = new Date().toISOString(); redraw(); }, function (e) { alert('취소하지 못했습니다: ' + e.message); });
      };
    });
  }

  /* ═════════════ 교적에서 고르기(이름 검색) ═════════════ */
  function memberPicker(inp, hint, onPick) {
    var field = inp.parentNode, pop = null;
    field.style.position = 'relative';
    inp.setAttribute('autocomplete', 'off');
    function close() { if (pop) { pop.remove(); pop = null; } }
    inp.addEventListener('input', function () {
      onPick(null); close();
      var v = inp.value.trim(); if (!v || !GJ || !GJ.length) return;
      var hits = GJ.filter(function (m) { return m.name.indexOf(v) >= 0; }).slice(0, 8);
      if (!hits.length) return;
      pop = document.createElement('div'); pop.className = 'fin-sugg';
      hits.forEach(function (m) {
        var d = document.createElement('div');
        d.innerHTML = esc(m.name) + ' <span style="color:#AFA49C;font-size:.78rem">' + esc([m.birth, m.grade, m.role, m.group].filter(Boolean).join(' · ')) + '</span>';
        d.onmousedown = function (e) { e.preventDefault(); inp.value = m.name; close(); onPick(m); };
        pop.appendChild(d);
      });
      field.appendChild(pop);
    });
    inp.addEventListener('blur', function () { setTimeout(close, 150); });
  }
  function linkDialog(r, done) {
    if (!r) return;
    var m = overlay(460);
    m.box.innerHTML = '<h3 style="margin:0 0 6px;color:var(--accent,#3A281C)">교적 연결 — ' + esc(r.member_name) + '</h3>' +
      '<p style="margin:0 0 12px;font-size:.82rem;color:#93867C;line-height:1.55">이 분의 계정이 아직 교적과 연결되지 않아 이수 기록에 교적 매칭키가 없습니다. 교적에서 같은 분을 골라 주십시오.</p>' +
      '<div class="af-field"><label>교적에서 찾기</label><input id="eduLinkQ" value="' + esc(r.member_name) + '" placeholder="이름"></div><div id="eduLinkHint" style="font-size:.8rem;margin-top:6px;min-height:1.2em;color:#AFA49C">교적을 불러오는 중…</div>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-solid" id="eduLinkGo" disabled style="padding:8px 18px">연결</button><button class="btn btn-line" id="eduLinkX" style="padding:8px 14px">닫기</button><span id="eduLinkMsg" style="font-size:.84rem;align-self:center"></span></div>';
    var pick = null, inp = m.box.querySelector('#eduLinkQ'), hint = m.box.querySelector('#eduLinkHint'), go = m.box.querySelector('#eduLinkGo');
    m.box.querySelector('#eduLinkX').onclick = m.close;
    loadGJ().then(function () {
      hint.textContent = GJ.length ? '이름을 입력해 목록에서 고르십시오.' : '교적을 불러오지 못했습니다(교적관리 권한 필요).';
      memberPicker(inp, hint, function (mm) { pick = mm; go.disabled = !mm; hint.style.color = mm ? '#2F6B4F' : '#AFA49C'; hint.innerHTML = mm ? '🔗 ' + esc(mm.name) + ' · ' + esc(mm.key) : '목록에서 고르십시오.'; });
      inp.dispatchEvent(new Event('input'));
    });
    go.onclick = function () {
      if (!pick) return;
      go.disabled = true;
      var body = { member_key: pick.key, member_name: pick.name };
      X.api('PATCH', 'edu_exam_results?id=eq.' + r.id, body, 'return=minimal')
        .then(function () { return X.api('PATCH', 'member_files?file_url=eq.' + encodeURIComponent('edu-print.html?sheet=' + r.id), body, 'return=minimal').catch(function () { }); })
        .then(function () { r.member_key = pick.key; r.member_name = pick.name; m.close(); if (done) done(); },
          function (e) { go.disabled = false; var g = m.box.querySelector('#eduLinkMsg'); g.style.color = '#A33A2A'; g.textContent = '실패: ' + e.message; });
    };
  }

  /* ═════════════ 증명서 발급 ═════════════ */
  function issueDialog(r, _unused, done) {
    var m = overlay(620);
    var kind0 = r ? (r.course === 'learn' ? '학습' : '세례') : '학습';
    m.box.innerHTML = '<h3 style="margin:0 0 4px;color:var(--accent,#3A281C)">교인 증명서 발급</h3>' +
      '<p style="margin:0 0 12px;font-size:.8rem;color:#93867C;line-height:1.55">' + (r ? esc(r.member_name) + ' · 강의실 ' + esc(COURSE[r.course]) + ' 과정 이수 ' + esc(dday(r.created_at)) + ' (' + esc(r.score) + '점)' : '강의실 시험과 상관없이 교적에서 골라 발급합니다.') +
      ' 번호는 해마다 종류별로 매겨집니다(예: ' + new Date().getFullYear() + '-학-001).</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="af-field"><label>종류</label><select id="ci_kind">' + ['학습', '세례', '입교'].map(function (k) { return '<option' + (k === kind0 ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div>' +
      '<div class="af-field"><label>성명</label><input id="ci_name" value="' + esc(r ? r.member_name : '') + '" placeholder="교적에서 이름 검색"></div>' +
      '<div class="af-field"><label>생년월일</label><input type="date" id="ci_birth" value="' + esc(r ? birthOfKey(r.member_key) : '') + '"></div>' +
      '<div class="af-field"><label>문답받은 날</label><input type="date" id="ci_qa"></div>' +
      '<div class="af-field"><label id="ci_rite_l">학습받은 날</label><input type="date" id="ci_rite"></div>' +
      '<div class="af-field"><label>집례 목사</label><input id="ci_off" value="' + esc((CH.pastor || '') + ' 목사') + '"></div>' +
      '<div class="af-field"><label>받은 곳(교회)</label><input id="ci_church" value="' + esc(CH.name || '운평장로교회') + '"></div>' +
      '<div class="af-field"><label>발급일</label><input type="date" id="ci_on" value="' + today() + '"></div>' +
      '<div class="af-field" style="grid-column:1/-1"><label>메모(증명서 아래 작게, 선택)</label><input id="ci_memo" placeholder="예: 제2026-1기 학습 문답"></div>' +
      '</div>' +
      '<div id="ci_link" style="font-size:.8rem;margin-top:8px;min-height:1.2em;color:#AFA49C"></div>' +
      '<label id="ci_gjw" style="display:none;align-items:center;gap:7px;margin-top:10px;font-size:.86rem;color:#38332E"><input type="checkbox" id="ci_gj" checked> <span id="ci_gjt"></span></label>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap"><button class="btn btn-solid" id="ci_go" style="padding:9px 22px">발급하고 인쇄</button><button class="btn btn-line" id="ci_x" style="padding:9px 16px">닫기</button><span id="ci_msg" style="font-size:.84rem"></span></div>';
    var $ = function (id) { return m.box.querySelector('#' + id); };
    var pick = null;
    m.box.querySelector('#ci_x').onclick = m.close;
    function syncKind() {
      var k = $('ci_kind').value;
      $('ci_rite_l').textContent = k === '학습' ? '학습받은 날' : k === '세례' ? '세례받은 날' : '입교한 날';
      var w = $('ci_gjw');
      if (pick && pick.id) {
        w.style.display = 'flex';
        $('ci_gjt').textContent = '교적도 고치기 — 신급 ‘' + (pick.grade || '없음') + '’ → ‘' + k + '’' + (k === '세례' ? ' · 세례일 = 세례받은 날' : '') + ' (교적관리 권한 필요)';
      } else w.style.display = 'none';
    }
    function showPick(mm) {
      pick = mm;
      var h = $('ci_link');
      if (mm) { h.style.color = '#2F6B4F'; h.innerHTML = '🔗 교적 연결: <b>' + esc(mm.name) + '</b> · ' + esc([mm.birth, mm.grade, mm.role].filter(Boolean).join(' · ')); if (mm.birth && !$('ci_birth').value) $('ci_birth').value = mm.birth; }
      else if (r && r.member_key) { h.style.color = '#2F6B4F'; h.textContent = '🔗 교적 연결: ' + r.member_key; }
      else { h.style.color = '#AFA49C'; h.textContent = '교적 미연결 — 이름만 기록됩니다(이름을 지우고 다시 입력하면 교적에서 고를 수 있습니다).'; }
      syncKind();
    }
    $('ci_kind').onchange = syncKind;
    loadGJ().then(function () {
      memberPicker($('ci_name'), $('ci_link'), function (mm) { showPick(mm); });
      showPick(r && r.member_key ? gjByKey(r.member_key) : null);
    });
    $('ci_go').onclick = function () {
      var name = $('ci_name').value.trim(), kind = $('ci_kind').value, msg = $('ci_msg');
      if (!name) { msg.style.color = '#A33A2A'; msg.textContent = '성명을 적어 주십시오.'; return; }
      var key = pick ? pick.key : (r ? r.member_key : null);
      var rite = $('ci_rite').value || null;
      var w = window.open('', '_blank');   // 팝업 차단을 피하려고 누른 순간에 창을 연다
      $('ci_go').disabled = true; msg.style.color = '#93867C'; msg.textContent = '발급하는 중…';
      X.api('POST', 'rpc/edu_cert_issue', {
        p_kind: kind, p_result: r ? r.id : null, p_member_key: key || null, p_member_name: name, p_birth: $('ci_birth').value || null,
        p_qa_date: $('ci_qa').value || null, p_rite_date: rite, p_officiant: $('ci_off').value, p_church: $('ci_church').value,
        p_issued_on: $('ci_on').value || null, p_memo: $('ci_memo').value
      }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || '발급하지 못했습니다.');
        var url = 'edu-print.html?cert=' + res.id;
        if (w) w.location.href = url; else window.open(url, '_blank');
        var after = Promise.resolve('');
        if (pick && pick.id && $('ci_gj').checked && window.WPF) {
          var f = { '신급': kind }; if (kind === '세례' && rite) f['세례일'] = rite;
          after = WPF.call('updateGyojeok', { id: pick.id, fields: f }).then(function () { pick.grade = kind; if (f['세례일']) pick.bap = rite; return ' · 교적 신급을 고쳤습니다'; }, function (e) { return ' · 교적은 고치지 못했습니다(' + e.message + ')'; });
        }
        return X.api('GET', 'edu_certificates?id=eq.' + res.id + '&select=*').then(function (rows) { if (rows && rows[0]) D.certs.unshift(rows[0]); return after; })
          .then(function (extra) { msg.style.color = 'green'; msg.textContent = '✓ ' + res.cert_no + ' 발급했습니다' + extra + '. 자료실에도 보관했습니다.'; $('ci_go').textContent = '발급됨'; if (done) done(); });
      }).catch(function (e) {
        if (w) w.close();
        $('ci_go').disabled = false; msg.style.color = '#A33A2A';
        msg.textContent = notReady(e) ? '준비 중 — SQL 20261025_1600 을 먼저 실행해 주십시오.' : '실패: ' + e.message;
      });
    };
  }

  window.WPCEduAdmin = { dash: dash, open: function (ctx, tab) { X = ctx; openModal(tab); } };
})();
