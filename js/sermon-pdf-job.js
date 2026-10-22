/* ============================================================
   운평장로교회 — 설교 PDF 를 교회 PC 워커에게 맡기기 (window.SermonPdfJob)

   브라우저는 PDF 파일을 만들 수 없다(인쇄 창에서 사람이 '저장'을 눌러야 한다). 그래서
   ① 이 화면과 똑같이 그려지는 **독립 HTML** 한 장을 만들어(standaloneHTML)
   ② ai_jobs 큐(kind = sermon_pdf)에 넣으면
   ③ 교회 PC 워커(tools/ai_worker.py)가 Edge 를 창 없이 띄워 그 HTML 을 PDF 로 찍고
   ④ Apps Script(saveSermonPdf)로 Google Drive '{연도}설교/{예배명}/' 폴더에 넣는다.
   결과(result)는 { url, folder, fileName } JSON.
   ============================================================ */
window.SermonPdfJob = (function () {
  'use strict';
  var POLL_MS = 2500, OFFLINE_MS = 45000, GIVEUP_MS = 240000;

  function sb() { return (window.SUPABASE_URL || '').replace(/\/$/, ''); }
  function sess() {
    try {
      var ref = sb().match(/https?:\/\/([^.:/]+)/)[1];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token'); if (!raw) return null;
      var s = JSON.parse(raw); s = (s && s.currentSession) ? s.currentSession : s;
      return { uid: s && s.user && s.user.id, token: s && s.access_token };
    } catch (e) { return null; }
  }
  function api(method, path, body, prefer) {
    var s = sess(), h = { apikey: window.SUPABASE_ANON_KEY || '', 'Content-Type': 'application/json' };
    if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    if (prefer) h.Prefer = prefer;
    var opt = { method: method, headers: h }; if (body) opt.body = JSON.stringify(body);
    return fetch(sb() + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var m = t; try { m = JSON.parse(t).message || t; } catch (e) {} throw new Error(m || ('HTTP ' + r.status)); });
      return r.status === 204 ? null : r.json();
    });
  }

  // 이 화면이 쓰는 자산(css·js)의 실제 주소 — 버전(?v=)까지 그대로 가져가 워커도 같은 파일로 그린다.
  // 기준은 sermon-doc.js 가 실린 곳(…/js/sermon-doc.js?v=…) — 어느 페이지에서 만들어도 같은 사이트 파일을 가리킨다.
  function docScript() { var el = document.querySelector('script[src*="sermon-doc.js"]'); return el ? new URL(el.src, document.baseURI) : null; }
  function assetUrl(sel, rel) {
    var el = document.querySelector(sel);
    if (el && (el.href || el.src)) { try { return new URL(el.href || el.src, document.baseURI).href; } catch (e) { } }
    var ds = docScript();
    if (!ds) return rel;
    var base = ds.href.replace(/js\/sermon-doc\.js.*$/, '');
    return base + rel + (ds.search || '');
  }
  function fontsLink() {
    var l = Array.prototype.filter.call(document.querySelectorAll('link[rel=stylesheet]'), function (x) { return /fonts\.googleapis\.com/.test(x.href); });
    return l.map(function (x) { return '<link href="' + x.href + '" rel="stylesheet">'; }).join('');
  }
  // 워커가 Edge 로 여는 독립 HTML — sermon-print.html 과 같은 스크립트가 같은 쪽을 그린다
  function standaloneHTML(payload) {
    var json = JSON.stringify(payload).replace(/<\//g, '<\\/');
    var rec = payload.rec || {};
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
      '<title>' + esc((rec.sermon_date ? String(rec.sermon_date).slice(0, 10) + ' ' : '') + (rec.title || '설교')) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      fontsLink() +
      '<link rel="stylesheet" href="' + esc(assetUrl('link[href*="sermon-doc.css"]', 'css/sermon-doc.css')) + '">' +
      '<style>html,body{margin:0;background:#fff}#pages{padding:0}</style>' +
      '</head><body><div id="pages"></div>' +
      '<script>window.__SERMON_PRINT__=' + json + ';</script>' +
      '<script src="' + esc(assetUrl('script[src*="sermon-doc.js"]', 'js/sermon-doc.js')) + '"></script>' +
      '<script src="' + esc(assetUrl('script[src*="sermon-print.js"]', 'js/sermon-print.js')) + '"></script>' +
      '</body></html>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function poll(id, onState) {
    var t0 = Date.now(), claimed = false;
    return new Promise(function (resolve, reject) {
      (function tick() {
        setTimeout(function () {
          api('GET', 'ai_jobs?id=eq.' + id + '&select=status,result,error').then(function (rows) {
            var j = (rows || [])[0], waited = Date.now() - t0;
            if (j && j.status === 'done') { var r = null; try { r = JSON.parse(j.result || '{}'); } catch (e) { r = { url: j.result }; } return resolve(r); }
            if (j && j.status === 'error') return reject(new Error(j.error || 'PDF 를 만드는 중 오류가 났습니다.'));
            if (j && j.status === 'processing' && !claimed) { claimed = true; if (onState) onState('교회 PC 가 PDF 를 만드는 중입니다… (30초 안팎)'); }
            if (!claimed && waited > OFFLINE_MS) return reject(new Error('교회 PC 의 워커가 꺼져 있는 것 같습니다. 교회 PC 에서 tools/목회AI워커.bat 를 실행해 주세요. (지금은 [인쇄 · PDF로 저장]으로 내려받을 수 있습니다)'));
            if (waited > GIVEUP_MS) return reject(new Error('시간이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.'));
            tick();
          }).catch(reject);
        }, POLL_MS);
      })();
    });
  }

  // payload: { rec, settings, seriesLine, hymnLine } → Promise<{url, folder, fileName}>
  function request(payload, onState) {
    var rec = payload.rec || {};
    if (!rec.sermon_date || !rec.title) return Promise.reject(new Error('일자와 제목이 있어야 Drive 에 저장할 수 있습니다.'));
    var s = sess(); if (!s || !s.token) return Promise.reject(new Error('로그인이 필요합니다.'));
    var html = standaloneHTML(payload);
    var job = { html: html, date: String(rec.sermon_date).slice(0, 10), title: rec.title, service: rec.service || '' };
    if (onState) onState('교회 PC 에 PDF 를 요청하는 중…');
    return api('POST', 'rpc/ai_enqueue', { p_kind: 'sermon_pdf', p_payload: job }).catch(function (e) {
      throw new Error(/ai_enqueue/.test(e.message || '') ? 'AI 워커가 아직 준비되지 않았습니다(supabase/ai_jobs.sql).' : e.message);
    }).then(function (r) {
      if (!r || !r.ok) {
        var m = (r && r.error) || 'PDF 작업을 등록하지 못했습니다.';
        if (/알 수 없는 요청/.test(m)) m = 'Drive 저장에는 supabase/20261013_1800_sermon_pdf_job.sql 을 SQL Editor 에서 한 번 실행해야 합니다.';
        throw new Error(m);
      }
      return poll(r.id, onState);
    });
  }

  return { request: request, standaloneHTML: standaloneHTML };
})();
