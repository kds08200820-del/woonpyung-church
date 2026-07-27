/* 주보 렌더러 — 관리자(affairs.js)·홈페이지(main.js) 공용.
 * 실제 주보 용지(211mm × 380mm)에 맞춘 고품질 인쇄/PDF 레이아웃.
 * window.BulletinRender.open(rec, {amounts:true|false})
 *   rec = { bdate, title, scripture, preacher, data:{...} }
 *   amounts=true 일 때만 헌금 금액(offering_amounts) 표시(관리자 인쇄용).
 */
(function () {
  var OFFER_KEYS = ['십일조', '감사헌금', '주일헌금', '건축헌금', '선교헌금', '유년부', '차량헌금', '일천번기도'];
  var AMOUNT_KEYS = ['십일조', '감사헌금', '주일헌금', '생일감사', '건축헌금', '선교헌금', '차량헌금', '일천번제', '합계'];
  var COMMITTEE_KEYS = ['헌금위원', '안내위원', '주차·사찰', '이주의 기도'];
  // 표지 로고 — 재정(영수증) 설정의 로고(d.church_logo_url)가 있으면 그것을,
  // 없으면 홈페이지 PWA 아이콘(같은 도안, 항상 존재)을 기본값으로 쓴다.
  var DEFAULT_LOGO = 'https://k-logos.com/images/icon-512.png';
  var WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // 실제 인쇄 주보는 각 항목 앞에 01~10 큰 번호가 붙는다 — 그 자체가
  // 이 주보의 시각적 정체성이라 홈페이지 출력에도 그대로 붙인다.
  function h2Html(num, kr, en) { return '<h2>' + (num ? '<b class="secno">' + num + '</b>' : '') + esc(kr) + ' <span class="en">' + esc(en) + '</span></h2>'; }
  function ymd(v) { return String(v == null ? '' : v).slice(0, 10); }
  function dotDate(v) { return ymd(v).replace(/-/g, '. '); }

  function css(layout) {
    // 인쇄용 3단은 가로(380×211 landscape), 그 외(홈페이지 읽기)는 세로
    var page = layout === 'print3' ? '@page{size:380mm 211mm;margin:0}' : '@page{size:211mm 380mm;margin:0}';
    return [
      page,
      '*{box-sizing:border-box}html,body{margin:0;padding:0}',
      'body{font-family:"Noto Serif KR",serif;background:#d9dade;color:#1b1b1b;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.bar{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #ddd;padding:8px 14px;display:flex;gap:8px;align-items:center;justify-content:flex-end}',
      '.bar .info{margin-right:auto;font-size:.8rem;color:#8a8a8a}',
      '.bar button{font:inherit;border:0;background:#0a2c5c;color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer}',
      // 용지
      '.page{width:211mm;min-height:380mm;margin:16px auto;background:#fff;padding:14mm 13mm 12mm;box-shadow:0 4px 26px rgba(0,0,0,.20);position:relative}',
      // 머리글
      '.hd{text-align:center;padding-bottom:6mm;margin-bottom:7mm;border-bottom:2.4pt solid #0a2c5c;position:relative}',
      '.hd::after{content:"";position:absolute;left:0;right:0;bottom:-3.4pt;height:.9pt;background:#0a2c5c}',
      '.hd .eng{font-family:"Noto Sans KR",sans-serif;font-size:8pt;letter-spacing:.34em;color:#a8915c;font-weight:600}',
      '.hd .ch{font-family:"Noto Serif KR",serif;font-weight:700;font-size:25pt;letter-spacing:.26em;color:#0a2c5c;margin:2.5mm 0 1.5mm}',
      '.hd .sub{font-family:"Noto Sans KR",sans-serif;font-size:8.5pt;color:#777}',
      // 표지 말씀 헤드라인 배너
      '.hl{text-align:center;font-family:"Noto Serif KR",serif;font-size:1.12em;line-height:1.65;color:#0a2c5c;background:#f5f1e6;border:1px solid #e3d9bd;border-radius:8px;padding:14px 18px;margin:0 0 16px}',
      'body.l3 .hl{font-size:9.5pt;line-height:1.5;padding:4mm 5mm;margin-bottom:4mm}',
      // 섹션
      'section{margin-bottom:6mm;page-break-inside:avoid}',
      'h2{font-family:"Noto Sans KR",sans-serif;font-size:10.5pt;font-weight:700;color:#0a2c5c;margin:0 0 3mm;padding-bottom:1.4mm;border-bottom:1pt solid #d9cfb3;display:flex;align-items:baseline;gap:7px}',
      'h2 .en{font-size:7.5pt;font-weight:400;color:#b6a273;letter-spacing:.04em}',
      // 설교 강조
      '.serm{text-align:center;background:#f8f4ea;border:1pt solid #e3d9bd;border-radius:3mm;padding:6mm 4mm;margin-bottom:6mm}',
      '.serm .lab{font-family:"Noto Sans KR",sans-serif;font-size:8pt;letter-spacing:.26em;color:#a8895a}',
      '.serm .t{font-family:"Noto Serif KR",serif;font-size:17pt;font-weight:700;color:#1a1a1a;margin:2.4mm 0;line-height:1.32}',
      '.serm .m{font-family:"Noto Sans KR",sans-serif;font-size:9pt;color:#5a5346}',
      // 예배 순서
      'table{width:100%;border-collapse:collapse}',
      '.ord td{padding:1.5mm 2mm;font-size:9.5pt;border-bottom:.5pt solid #efece2;vertical-align:top}',
      '.ord .bno{width:8mm;text-align:center;color:#b6a273;font-family:"Noto Sans KR",sans-serif;font-size:8pt}',
      '.ord .bn{width:30mm;font-weight:600;font-family:"Noto Sans KR",sans-serif;color:#34415c}',
      '.ord .bd{color:#3a3a3a}',
      // 2단
      '.two{display:grid;grid-template-columns:1fr 1fr;gap:1.2mm 8mm}',
      '.ofg{font-size:9pt;padding:1.3mm 0;border-bottom:.5pt dotted #e7e1d1;line-height:1.5}',
      '.ofg b{font-family:"Noto Sans KR",sans-serif;color:#7a5d27;font-weight:600;margin-right:5px;font-size:8.5pt}',
      // 금액
      '.amt{margin-top:4mm;border:1pt solid #e6dcbe;border-radius:2mm;overflow:hidden}',
      '.amt td{padding:1.6mm 4mm;font-family:"Noto Sans KR",sans-serif;font-size:9pt;border-bottom:.5pt solid #efe7d0}',
      '.amt tr:last-child td{border-bottom:0;font-weight:700;background:#faf6ea}',
      '.amt .num{text-align:right}',
      // 주중
      '.wk{font-size:9.5pt;line-height:1.95}',
      '.lbl{display:inline-block;min-width:24mm;color:#7a5d27;font-weight:600;font-family:"Noto Sans KR",sans-serif;font-size:9pt}',
      // 칼럼
      '.col{font-size:9.5pt;line-height:1.85;white-space:pre-wrap;text-align:justify}',
      '.col .ct{font-family:"Noto Sans KR",sans-serif;font-weight:700;font-size:10pt;color:#7a5d27;margin-bottom:2mm;text-align:left}',
      // 광고
      '.news{margin:0;padding:0;list-style:none;counter-reset:n}',
      '.news li{position:relative;padding:1.5mm 0 1.5mm 9mm;font-size:9.5pt;line-height:1.6;border-bottom:.5pt dotted #eee;counter-increment:n}',
      '.news li::before{content:counter(n,decimal-leading-zero);position:absolute;left:0;top:1.7mm;font-family:"Noto Sans KR",sans-serif;font-size:8pt;font-weight:700;color:#b6a273}',
      // 꼬리
      '.foot{margin-top:7mm;padding-top:3.5mm;border-top:1pt solid #ddd;text-align:center;font-family:"Noto Sans KR",sans-serif;font-size:7.5pt;color:#9a9a9a;line-height:1.7}',
      '.note{font-size:7.5pt;color:#aaa;text-align:center;margin-top:3mm}',
      // ── 인쇄용 3단 양면 레이아웃(실제 주보 211×380mm · 신문식 3단) ──
      // 여백은 실제 인쇄 주보를 실측해 맞췄다(위 6.5mm·좌우 8mm 안팎).
      // 단을 나누던 점선(column-rule)은 뺐다 — 그만큼 단 사이 간격을 넓혀 공백만으로 구분한다.
      // 기본 글자 크기는 10pt — 어르신들도 읽으실 수 있게. 8pt 초안은 너무 작았다.
      'body.l3 .page{width:380mm;min-height:211mm;column-count:3;column-gap:11mm;padding:7mm 8mm 8mm;font-size:10pt;line-height:1.5}',
      'body.l3 section{-webkit-column-break-inside:avoid;break-inside:avoid;margin-bottom:5mm}',
      'body.l3 .hd{-webkit-column-break-inside:avoid;break-inside:avoid;padding-bottom:4mm;margin-bottom:5mm}',
      'body.l3 .hd .ch{font-size:18pt;letter-spacing:.18em;margin:2mm 0 1.2mm}.body.l3 .hd .eng{font-size:8pt}body.l3 .hd .sub{font-size:8pt}',
      'body.l3 h2{font-size:10.5pt;margin-bottom:2.4mm;padding-bottom:1.2mm;gap:5px}body.l3 h2 .en{font-size:7.5pt}',
      // 섹션 앞의 큰 번호(01~10) — 원본 실측 20pt를 3단 인쇄 축소 비율에 맞췄다.
      'h2 .secno{font-family:"Noto Serif KR",serif;font-weight:400;color:#0a2c5c;margin-right:2px}',
      'body.l3 h2 .secno{font-size:15pt;margin-right:1px}',
      'body.l3 .serm{padding:4mm 3mm;margin-bottom:4mm}body.l3 .serm .lab{font-size:7.5pt;letter-spacing:.18em}body.l3 .serm .t{font-size:14pt;margin:1.8mm 0}body.l3 .serm .m{font-size:9pt}',
      'body.l3 .ord td{font-size:9.5pt;padding:1.1mm 1.2mm}body.l3 .ord .bno{width:6mm;font-size:8pt}body.l3 .ord .bn{width:19mm;font-size:8.5pt}',
      'body.l3 .two{grid-template-columns:1fr;gap:.5mm}body.l3 .ofg{font-size:9pt;padding:.9mm 0}body.l3 .ofg b{font-size:8.5pt}',
      'body.l3 .amt td{font-size:9pt;padding:1.1mm 2.2mm}',
      'body.l3 .wk{font-size:9.5pt;line-height:1.75}body.l3 .lbl{min-width:19mm;font-size:9pt}',
      'body.l3 .col{font-size:9.5pt;line-height:1.65}body.l3 .col .ct{font-size:10pt}',
      'body.l3 .news li{font-size:9.5pt;padding-left:7mm;line-height:1.55}body.l3 .news li::before{font-size:8pt}',
      // 표지 — 실제 인쇄 주보와 같은 배치: 상단 발행 정보, 헤드라인 카드,
      // 큰 여백으로 아래로 밀어낸 로고·교회명·목사님 명단·연락처(하단 고정).
      // min-height 로 이 컬럼의 실제 인쇄 가용 높이(211mm - 상하 패딩)를 주고
      // flex 로 하단 정렬한다 — 신문식 컬럼 안에서도 이 블록만은 독립적으로 흐른다.
      // min-height 를 페이지 높이에 맞춰 강제하면 컬럼 균형 계산이 틀어져
      // 빈 페이지가 하나 더 생긴다(실측으로 확인). 대신 spacer 에 고정 여백을
      // 줘서 "아래쪽에 붙어 보이는" 정도로만 밀어낸다 — 안전한 절충.
      'body.l3 .cover{-webkit-column-break-inside:avoid;break-inside:avoid;-webkit-column-break-before:always;break-before:column;text-align:center}',
      'body.l3 .cv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm}',
      'body.l3 .cv-since{font-family:"Noto Sans KR",sans-serif;font-size:8pt;font-weight:700;color:#c0392b;text-align:left;line-height:1.6}',
      'body.l3 .cv-date{text-align:right;line-height:1}',
      'body.l3 .cv-date .day{font-family:"Noto Serif KR",serif;font-size:26pt;font-weight:600;color:#3a4a63}',
      'body.l3 .cv-date .my{display:block;margin-top:.6mm}',
      'body.l3 .cv-date .mo,body.l3 .cv-date .wd{display:block;font-family:"Noto Sans KR",sans-serif;font-size:7.5pt;font-weight:700;color:#c0392b}',
      'body.l3 .cv-spacer{height:30mm}',
      'body.l3 .cv-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:3mm}',
      'body.l3 .cv-logo{height:15mm;width:auto}',
      'body.l3 .cover .big{font-family:"Noto Serif KR",serif;font-weight:700;font-size:18pt;letter-spacing:.12em;color:#0a2c5c;margin:0}',
      'body.l3 .cover .ld{font-family:"Noto Sans KR",sans-serif;font-size:9pt;color:#333;line-height:1.75}',
      'body.l3 .cv-foot-line{border-top:1pt solid #0a2c5c;margin:4mm 0 3mm}',
      'body.l3 .cover .ad{font-family:"Noto Sans KR",sans-serif;font-size:8pt;color:#888;line-height:1.65}',
      'body.l3 .foot{display:none}',
      // 양면: 앞면(front) 다음에 새 페이지
      'body.l3 .front{page-break-after:always;break-after:page}',
      // 05 예배및교육안내 · 09 섬기는사람들 · 10 후원선교지 · 헤드라인 이미지
      '.hl-img{display:block;width:100%;height:auto;border-radius:6px;margin:0 0 16px}',
      'body.l3 .hl-img{margin-bottom:4mm}',
      '.svcRow{font-size:9.5pt;padding:1mm 0;line-height:1.6}',
      '.svcRow b{font-family:"Noto Sans KR",sans-serif;color:#34415c;font-weight:600;margin-right:6px}',
      '.wkgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:1.2mm;margin-top:3mm}',
      '.wkgrid .wd{text-align:center;font-size:8pt;line-height:1.5;border:.5pt solid #e7e1d1;border-radius:2mm;padding:2mm 1mm;font-family:"Noto Sans KR",sans-serif;color:#5a5346}',
      '.wkgrid .wd b{display:block;color:#7a5d27;font-size:8.5pt;margin-bottom:1mm}',
      '.staffRow{font-size:9pt;padding:1.2mm 0;line-height:1.55}',
      '.staffRow b{font-family:"Noto Sans KR",sans-serif;color:#7a5d27;font-weight:600;margin-right:5px;font-size:8.5pt}',
      '.misRow{font-size:9pt;padding:1.6mm 0;border-bottom:.5pt dotted #e7e1d1;line-height:1.55}',
      '.misRow b{font-family:"Noto Serif KR",serif;color:#0a2c5c;font-weight:700;display:block;font-size:9.5pt}',
      '.misRow span{color:#8a8578;font-size:8.5pt}',
      // 05 시간표·09 섬기는사람들·10 선교지는 원본 실측도 8pt다(명단류는
      // 작게 써서 정보를 압축한다). 본문(10pt)과 똑같이 키우면 2쪽에 안 들어간다.
      'body.l3 .svcRow,body.l3 .staffRow,body.l3 .misRow{font-size:8pt;padding:.9mm 0}',
      'body.l3 .wkgrid .wd{font-size:7pt;padding:1.3mm .6mm}body.l3 .wkgrid .wd b{font-size:7.5pt}',
      '@media print{html,body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;width:auto;min-height:auto}body.l3 .page{width:auto}}'
    ].join('');
  }

  // 05 예배 및 교육 안내 — 주일예배·주일학교 시간표 + 이번 주(주일~토) 일정
  function svcScheduleHTML(s) {
    if (!s) return '';
    var rows = [].concat(s.sunday_worship || [], s.sunday_school || []).map(function (r) {
      var label = r.session || r.group || '';
      var detail = [r.time, r.place].filter(Boolean).join(' · ') + (r.label ? ' · ' + r.label : '');
      return '<div class="svcRow"><b>' + esc(label) + '</b>' + esc(detail) + '</div>';
    }).join('');
    var days = s.week_days || ['주일', '화', '수', '목', '금', '토'];
    var sched = (s.week_this || s.week_default || {});
    var grid = days.map(function (dName) {
      var items = sched[dName] || [];
      return '<div class="wd"><b>' + esc(dName) + '</b>' + (items.length ? items.map(esc).join('<br>') : '·') + '</div>';
    }).join('');
    return '<section>' + h2Html('05', '예배 및 교육 안내', 'WORSHIP & EDUCATION') +
      rows + '<div class="wkgrid">' + grid + '</div></section>';
  }
  // 09 섬기는 사람들 — 목회자·장로·집사·권사·부서장 (church_settings.servants 스냅샷)
  function servantsHTML(sv) {
    if (!sv) return '';
    var lines = [];
    (sv.pastors || []).forEach(function (p) { lines.push([p.role, p.name]); });
    (sv.elders || []).forEach(function (p) { lines.push([p.role, p.name]); });
    Object.keys(sv.deacons || {}).forEach(function (k) { lines.push([k, sv.deacons[k]]); });
    Object.keys(sv.deaconesses || {}).forEach(function (k) { lines.push([k, sv.deaconesses[k]]); });
    Object.keys(sv.committees || {}).forEach(function (k) { lines.push([k, sv.committees[k]]); });
    if (!lines.length) return '';
    var html = lines.map(function (l) { return '<div class="staffRow"><b>' + esc(l[0]) + '</b>' + esc(l[1]) + '</div>'; }).join('');
    return '<section>' + h2Html('09', '섬기는 사람들', 'SERVANTS') + '<div class="two">' + html + '</div></section>';
  }
  // 10 후원 선교지 (church_settings.missions 스냅샷)
  function missionsHTML(mi) {
    var list = (mi && mi.list) || [];
    if (!list.length) return '';
    var html = list.map(function (m) {
      return '<div class="misRow"><b>' + esc(m.preacher || '') + ' · ' + esc(m.church || '') + '</b><span>' + esc(m.region || '') + '</span></div>';
    }).join('');
    return '<section>' + h2Html('10', '후원 선교지', 'MISSIONS') + html + '</section>';
  }

  function bodyHTML(rec, opts) {
    rec = rec || {}; opts = opts || {}; var d = rec.data || {};
    var orderHtml = (d.order || []).map(function (o, i) { return '<tr><td class="bno">' + (i + 1) + '</td><td class="bn">' + esc(o.name || '') + '</td><td class="bd">' + esc(o.detail || '') + '</td></tr>'; }).join('');
    // 명단·금액은 저장된 항목(동적) 전체를 순서대로 출력 — 특별헌금 등 포함
    var offObj = d.offering || {};
    var offHtml = Object.keys(offObj).map(function (k) { return offObj[k] ? '<div class="ofg"><b>' + esc(k) + '</b> ' + esc(offObj[k]) + '</div>' : ''; }).join('');
    var amtHtml = '';
    if (opts.amounts && d.offering_amounts) {
      var amtObj = d.offering_amounts;
      var keys = Object.keys(amtObj).filter(function (k) { return k !== '합계' && amtObj[k]; });
      var rows = keys.map(function (k) { var v = amtObj[k]; return '<tr><td>' + esc(k) + '</td><td class="num">' + esc(v) + (/[0-9]$/.test(v) ? ' 원' : '') + '</td></tr>'; }).join('');
      if (amtObj['합계']) rows += '<tr><td>합계</td><td class="num">' + esc(amtObj['합계']) + (/[0-9]$/.test(amtObj['합계']) ? ' 원' : '') + '</td></tr>';
      if (rows) amtHtml = '<table class="amt"><tbody>' + rows + '</tbody></table>';
    }
    var comHtml = COMMITTEE_KEYS.map(function (k) { return (d.committee && d.committee[k]) ? '<div class="ofg"><b>' + esc(k) + '</b> ' + esc(d.committee[k]) + '</div>' : ''; }).join('');
    var notices = (d.notices || '').split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    var sub = 'WOONPYEONG PRESBYTERIAN CHURCH · ' + esc(dotDate(rec.bdate)) + (d.no ? ' · No. ' + esc(d.no) : '') + (d.week ? ' · ' + esc(d.week) : '');

    // 표지 말씀 헤드라인 — 생성된 말씀 카드 이미지가 있으면 그것을, 없으면(예전 주보) 텍스트 배너로.
    var headlineHtml = '';
    if (d.headline_image_url) {
      headlineHtml = '<img class="hl-img" src="' + esc(d.headline_image_url) + '" alt="' + esc(d.headline || '이번 주 말씀') + '">';
    } else if (d.headline) {
      var hl = String(d.headline).replace(/^말씀:\s*/m, '').replace(/^헤드라인:\s*/m, '— ');
      headlineHtml = '<div class="hl">' + esc(hl).replace(/\n/g, '<br>') + '</div>';
    }
    // ── 섹션 조각 ──
    var hdBanner = '<div class="hd"><div class="eng">SUNDAY WORSHIP</div><div class="ch">운 평 장 로 교 회</div><div class="sub">' + sub + '</div></div>';
    var sermSec = '<section>' + h2Html('01', '주일 낮 예배', 'ORDER OF WORSHIP') +
      '<div class="serm"><div class="lab">오 늘 의 설 교 · SERMON</div><div class="t">' + esc(rec.title || '') + '</div><div class="m">본문 ● ' + esc(rec.scripture || '') + ' ● ' + esc(rec.preacher || '') + '</div></div>' +
      '<table class="ord"><tbody>' + orderHtml + '</tbody></table></section>';
    var midSec = (d.wed_title || d.wed_series || d.dawn || d.qt)
      ? ('<section>' + h2Html('02', '주중 · 새벽 · QT', 'PRAYER MEETINGS') + '<div class="wk">' +
        ((d.wed_series || d.wed_title) ? '<div><span class="lbl">수요기도회</span>' + esc([d.wed_series, d.wed_title].filter(Boolean).join(' — ')) + (d.wed_dateline ? '<br><span class="lbl"></span><span style="color:#6a6a6a;font-size:8.5pt">' + esc(d.wed_dateline) + '</span>' : '') + '</div>' : '') +
        (d.dawn ? '<div><span class="lbl">새벽기도회</span>' + esc(d.dawn) + '</div>' : '') +
        (d.qt ? '<div><span class="lbl">매일 QT</span>' + esc(d.qt) + '</div>' : '') + '</div></section>') : '';
    var svcSec = svcScheduleHTML(d.service_schedule);
    var offerSec = (offHtml || amtHtml) ? ('<section>' + h2Html('06', '향기로운 예물', 'FRAGRANT OFFERING') + (offHtml ? '<div class="two">' + offHtml + '</div>' : '') + amtHtml + '</section>') : '';
    var comSec = comHtml ? ('<section>' + h2Html('', '봉사위원 · 다음 주 기도', 'SERVANTS') + '<div class="two">' + comHtml + '</div></section>') : '';
    var colSec = (d.column_title || d.column_body) ? ('<section>' + h2Html('07', '신앙과 책', 'FAITH & BOOKS') + '<div class="col"><div class="ct">' + esc(d.column_title || '') + '</div>' + esc(d.column_body || '') + '</div></section>') : '';
    var newsSec = notices ? ('<section>' + h2Html('08', '한 주의 소식', 'THIS WEEK') + '<ul class="news">' + notices + '</ul></section>') : '';
    var staffSec = servantsHTML(d.servants);
    var missionsSec = missionsHTML(d.missions);
    var noteHtml = !opts.amounts ? '<p class="note">* 감사한 마음으로 드린 예물의 명단만 안내하며, 헌금 금액 내역은 게시하지 않습니다.</p>' : '';
    var fm = String(d.founded || '1964-03-01').match(/(\d{4})-(\d{2})-(\d{2})/);
    var sinceTxt = fm ? ('Since. ' + fm[1] + '.' + Number(fm[2]) + '.' + Number(fm[3])) : 'Since. 1964.3.1';
    // 표지 상단 우측의 날짜 배지(일자를 크게, 월·요일을 그 옆에) — 실제 인쇄 주보와 동일한 자리.
    var bd = rec.bdate ? new Date(ymd(rec.bdate) + 'T00:00:00') : null;
    var dateBadge = bd ? (
      '<div class="cv-date"><div class="day">' + bd.getDate() + '</div>' +
      '<div class="my"><span class="mo">' + (bd.getMonth() + 1) + '월</span><span class="wd">' + WEEKDAY_EN[bd.getDay()] + '</span></div></div>'
    ) : '';
    var logoUrl = d.church_logo_url || DEFAULT_LOGO;
    var coverBlock = '<div class="cover">' +
      '<div class="cv-top"><div class="cv-since">' + esc(sinceTxt) + '<br>No. ' + esc(d.no || '') + '. ' + esc(String(rec.bdate || '').slice(0, 4)) + '</div>' + dateBadge + '</div>' +
      (headlineHtml || '') +
      '<div class="cv-spacer"></div>' +
      '<div class="cv-brand"><img class="cv-logo" src="' + esc(logoUrl) + '" alt="운평장로교회"><div class="big">운 평 장 로 교 회</div></div>' +
      '<div class="ld">담임목사 김 동 석 · 원로목사 김 충 현 · 협동목사 안 창 선</div>' +
      '<div class="cv-foot-line"></div>' +
      '<div class="ad">화성특례시 우정읍 운평길 47   T.010-4032-2903<br>홈페이지 www.k-logos.com</div></div>';

    if (opts.layout === 'print3') {
      // 가로 3단 양면 — 앞면: 설교/예배순서·주중·안내·헌금/봉사위원 / 뒷면: 칼럼·광고·섬기는사람들·선교지·표지
      var front = '<div class="page front">' + sermSec + midSec + svcSec + offerSec + comSec + noteHtml + '</div>';
      var back = '<div class="page back">' + colSec + newsSec + staffSec + missionsSec + coverBlock + '</div>';
      return front + back;
    }
    // 홈페이지 읽기(세로 1단)
    return '<div class="page">' + hdBanner + (headlineHtml || '') + sermSec + midSec + svcSec + offerSec + comSec + colSec + newsSec + staffSec + missionsSec + noteHtml +
      '<div class="foot">운평장로교회 · 담임목사 김동석 · 화성특례시 우정읍 운평길 47 · www.k-logos.com</div></div>';
  }

  function fullHTML(rec, opts) {
    rec = rec || {}; opts = opts || {};
    var p3 = opts.layout === 'print3';
    var infoTxt = p3 ? '인쇄용 3단 · 가로 380×211mm (인쇄 설정: 가로/Landscape · 배율 100% · 여백 없음)' + (opts.amounts ? ' · 금액 포함' : '') : (opts.amounts ? '인쇄용 · 금액 포함' : '홈페이지용');
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(opts.fileName || ('주보 ' + ymd(rec.bdate))) + '</title>' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css(opts.layout) + '</style></head><body' + (p3 ? ' class="l3"' : '') + '>' +
      '<div class="bar"><span class="info">' + infoTxt + '</span><button onclick="window.print()">인쇄 / PDF 저장</button></div>' +
      bodyHTML(rec, opts) +
      '</body></html>';
  }

  function open(rec, opts) {
    var w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'); return; }
    w.document.write(fullHTML(rec, opts || {}));
    w.document.close(); w.focus();
  }

  window.BulletinRender = { open: open, html: fullHTML };
})();
