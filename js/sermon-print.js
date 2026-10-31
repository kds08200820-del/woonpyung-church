/* ============================================================
   운평장로교회 — 설교 인쇄(PDF) 화면 (sermon-print.html)
   설교 매니저 '내보내기'가 연다. 편집 화면과 똑같은 쪽(SermonDoc.renderPages)을 그려
   ① 브라우저 인쇄(PDF로 저장) ② 교회 PC 워커에게 PDF 를 만들어 Google Drive 에 넣게 한다.

   자료 전달: 설교 매니저가 sessionStorage 'wp_sermon_print' 에 { rec, settings, seriesLine, hymnLine } 를 넣고 이 창을 연다.
   워커용 독립 HTML(window.__SERMON_PRINT__ 에 같은 자료를 박아 넣은 파일)도 같은 스크립트로 그려진다.
   ============================================================ */
(function () {
  'use strict';
  var SD = window.SermonDoc;
  var mount = document.getElementById('pages'), st = document.getElementById('st');
  var payload = window.__SERMON_PRINT__ || null;
  // 자료 받기: ① localStorage(설교 매니저가 막 넣은 것, 읽고 지운다) ② 여는 창의 변수 ③ 이 탭의 sessionStorage(새로 고침 대비)
  if (!payload) {
    try { payload = JSON.parse(localStorage.getItem('wp_sermon_print') || 'null'); localStorage.removeItem('wp_sermon_print'); } catch (e) { payload = null; }
    if (!payload) { try { payload = window.opener && window.opener.__WP_SERMON_PRINT__ || null; } catch (e) { payload = null; } }
    if (payload) { try { sessionStorage.setItem('wp_sermon_print', JSON.stringify(payload)); } catch (e) { } }
    else { try { payload = JSON.parse(sessionStorage.getItem('wp_sermon_print') || 'null'); } catch (e) { payload = null; } }
  }
  var standalone = !!window.__SERMON_PRINT__;   // 워커가 여는 파일 — 도구 막대 없이 쪽만

  function msg(t, bad) { if (st) { st.textContent = t; st.style.color = bad ? '#A33A2A' : ''; } }
  function fit() {   // 화면 폭에 맞춰 쪽을 축소해 보여 준다(인쇄에는 영향 없음)
    if (standalone || !mount.firstChild) return;
    var pw = mount.firstChild.offsetWidth || 794, avail = Math.min(window.innerWidth - 24, 1100);
    var z = Math.min(1, avail / pw);
    mount.style.zoom = z;
  }
  window.addEventListener('resize', fit);

  if (!payload || !payload.rec) {
    msg('인쇄할 설교 자료가 없습니다. 설교 매니저에서 [내보내기]를 눌러 주세요.', true);
    return;
  }
  var rec = payload.rec, settings = SD.settingsFrom(payload.settings || SD.unwrap(rec.content).page);
  document.title = (rec.sermon_date ? String(rec.sermon_date).slice(0, 10) + ' ' : '') + (rec.title || '설교');
  var sty = document.createElement('style'); sty.textContent = SD.pageCSS(settings); document.head.appendChild(sty);
  msg('쪽을 그리는 중…');
  window.__SERMON_PRINT_READY__ = false;
  SD.renderPages(mount, rec, { settings: settings, seriesLine: payload.seriesLine || '', hymnLine: payload.hymnLine || '' }).then(function (r) {
    msg(r.total + '쪽 · ' + r.settings.paper + ' · 여백 ' + r.settings.margin + '㎜');
    fit();
    window.__SERMON_PRINT_READY__ = true;   // 워커(헤드리스 Edge)가 이 값을 보고 PDF 로 찍는다
    document.body.setAttribute('data-ready', '1');
    if (/[?&]print=1/.test(location.search)) setTimeout(function () { window.print(); }, 300);
  }).catch(function (e) { msg('그리기 실패: ' + (e && e.message || e), true); });

  // ── 도구 막대 ──
  var bPrint = document.getElementById('b_print'), bDrive = document.getElementById('b_drive'), bClose = document.getElementById('b_close');
  if (bPrint) bPrint.onclick = function () { window.print(); };
  if (bClose) bClose.onclick = function () { window.close(); setTimeout(function () { if (!window.closed) history.back(); }, 300); };

  // Drive 저장 — 교회 PC 워커(tools/ai_worker.py, kind=sermon_pdf)에 맡긴다. 워커가 이 화면과 같은 독립 HTML 을 Edge 로 찍어 Apps Script 로 Drive 폴더에 넣는다.
  if (bDrive) bDrive.onclick = function () {
    if (!window.SermonPdfJob) { msg('Drive 저장 기능을 불러오지 못했습니다.', true); return; }
    bDrive.disabled = true; var old = bDrive.textContent; bDrive.textContent = '교회 PC에 요청 중…';
    window.SermonPdfJob.request(payload, function (t) { msg(t); }).then(function (res) {
      bDrive.disabled = false; bDrive.textContent = old;
      var link = document.getElementById('drive_link');
      if (link) { link.href = res.url; link.textContent = '열어보기 → ' + (res.folder || '') + '/' + (res.fileName || ''); link.style.display = ''; }
      msg('✓ Google Drive 에 저장했습니다.');
    }).catch(function (e) { bDrive.disabled = false; bDrive.textContent = old; msg('Drive 저장 실패: ' + (e && e.message || e), true); });
  };
})();
