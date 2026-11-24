/* finance-weekly.js — 재정관리 「주간 재정보고」 탭
 * 주(주일~토요일)를 고르면 장부(offerings·expenses)로 주간 재정보고서를 채운다.
 *  1쪽 수입(계정별 현금·온라인·합계) + 금주 재정 요약(전주 이월금 + 수입 − 지출 = 차인 잔액)
 *  2쪽 지출(분류별 소계 + 계정별 금액, 3단)
 *  3쪽~ 헌금 내역서(항목별 이름·금액, 4단, 필요한 쪽 수만)
 * 이월금은 매주 자동: 그 주가 속한 회계연도의 시작 이월금 + 회계연도 시작 ~ 그 주 직전 수입·지출.
 * 「인쇄」는 보고서 쪽만 가로 A4 로 바로 인쇄한다(print CSS, 화면 메뉴는 빠짐).
 * 모양은 2027예결산/2027_주간_재정보고서_양식.docx(make_weekly.py)와 같게: 흑백 + 빨강 포인트, 로고 하나.
 * finance.js 가 window.FinWeekly.render(panel, ctx) 를 부른다.
 */
console.log('[finance-weekly.js] v20261124wk1 (주간 재정보고)');

window.FinWeekly = (function () {
  var state = { sunday: null, showZero: false, fill: false, pet: {}, view: 'report' };   // fill: 장부 숫자도 채워 인쇄(기본은 수기 양식)   // 고른 주(주일 날짜), 0원 계정 보이기, 주마다 고친 결의서 줄
  var LOGO = 'images/finance-logo-bw.png?v=20261124wk1';
  var DOW = ['주일', '월', '화', '수', '목', '금', '토'];

  function pad2(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dt(s) { return new Date(s + 'T00:00:00'); }
  function addDays(s, n) { var d = dt(s); d.setDate(d.getDate() + n); return ymd(d); }
  function sundayOf(s) { var d = dt(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); }
  function md(s) { var d = dt(s); return (d.getMonth() + 1) + '.' + d.getDate(); }
  // 주 이름: 주일 날짜 기준 "11월 4주" (그 달의 몇 번째 주일인지)
  function weekName(sun) { var d = dt(sun); return (d.getMonth() + 1) + '월 ' + (Math.floor((d.getDate() - 1) / 7) + 1) + '주'; }

  function injectCSS() {
    if (document.getElementById('wkCss')) return;
    var css = [
      // ── 조작 줄 ──
      '.wk-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.wk-bar select{padding:7px 10px;border:1px solid #D9D8D5;border-radius:2px;font:inherit;background:#fff;min-width:250px}',
      '.wk-bar .btn{padding:7px 14px}',
      '.wk-bar .wk-nav{padding:7px 11px}',
      '.wk-bar label{display:inline-flex;align-items:center;gap:5px;font-size:.88rem;color:#565552;cursor:pointer}',
      '.wk-bar .wk-print{margin-left:auto;font-weight:700}',
      '.wk-note{font-size:.84rem;color:#898885;margin:10px 0 0;line-height:1.55}',
      // ── 화면 미리보기: 실제 A4 가로 크기를 줄여서 보여 준다 ──
      '.wk-scaler{position:relative;overflow:hidden}',
      '.wk-scaler .wk-doc{transform-origin:0 0;position:absolute;left:0;top:0}',
      '.wk-doc .wk-page{box-shadow:0 2px 14px rgba(0,0,0,.13);margin:0 0 18px}',
      // ── 보고서 쪽 (화면·인쇄 같은 모양) ──
      '.wk-page{width:297mm;height:210mm;padding:11mm 15mm 9mm;box-sizing:border-box;background:#fff;color:#111;position:relative;overflow:hidden;',
      ' font-family:"Noto Sans KR","Malgun Gothic","맑은 고딕",sans-serif;font-size:9pt;line-height:1.25;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.wk-page *{box-sizing:border-box}',
      '.wk-head{display:grid;grid-template-columns:7mm 60mm 1fr 70mm;align-items:center;height:13mm;border-bottom:1.3pt solid #111;margin-bottom:5mm}',
      '.wk-head img{height:7.5mm;display:block}',
      '.wk-head .org{font-size:10pt;color:#333;padding-left:2mm}',
      '.wk-head .ttl{text-align:center;font-size:17pt;font-weight:700;letter-spacing:.02em;white-space:nowrap}',
      '.wk-head .side{text-align:right}',
      '.wk-head .side b{display:block;color:#C62828;font-size:10pt}',
      '.wk-head .side span{display:block;color:#777;font-size:8pt;margin-top:1mm}',
      '.wk-foot{position:absolute;right:15mm;bottom:5mm;font-size:7.5pt;color:#9A9A9A}',
      '.wk-foot b{color:#C62828;font-size:8pt}',
      '.wk-sub{font-size:10.5pt;font-weight:700;margin:0 0 2mm}',
      '.wk-t{width:100%;border-collapse:collapse;table-layout:fixed;border-top:1pt solid #111;border-bottom:1pt solid #111}',
      '.wk-t th{background:#F2F2F2;font-size:8.5pt;font-weight:700;text-align:center;height:5.5mm;padding:0 1.6mm;border-bottom:.5pt solid #BDBDBD}',
      '.wk-t td{height:5.6mm;padding:0 1.6mm;border-bottom:.5pt solid #BDBDBD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wk-t th+th,.wk-t td+td{border-left:.5pt solid #BDBDBD}',
      '.wk-t tr:last-child td{border-bottom:0}',
      '.wk-t .n{text-align:right;font-variant-numeric:tabular-nums}',
      '.wk-t .z{color:#B0B0B0}',
      '.wk-t .g{background:#F2F2F2;font-weight:700}',
      '.wk-t .tot td{background:#E4E4E4;font-weight:700;font-size:9.5pt;height:6.6mm;border-top:.5pt solid #BDBDBD}',
      '.wk-t td.sumcol,.wk-t th.sumcol{border-left:1pt solid #BDBDBD}',
      // 1쪽: 수입(왼쪽) + 요약(오른쪽)
      '.wk-p1{display:grid;grid-template-columns:166mm 95mm;column-gap:6mm}',
      '.wk-in td.grp{text-align:center;font-weight:700;font-size:8.5pt;background:#F2F2F2;white-space:normal}',
      '.wk-sum td{height:11.5mm}',
      '.wk-sum td.sym{text-align:center;color:#C62828;font-size:12pt;font-weight:700}',
      '.wk-sum td.lab b{display:block;font-size:10pt}',
      '.wk-sum td.lab span{display:block;font-size:7pt;color:#777;margin-top:.6mm}',
      '.wk-sum td.amt{text-align:right;font-size:11pt;font-variant-numeric:tabular-nums}',
      '.wk-sum .red{color:#C62828}',
      '.wk-sum tr.last td{background:#E4E4E4}',
      '.wk-sum tr.last td.amt{font-weight:700;font-size:12pt;color:#C62828}',
      '.wk-sum tr.cash td{height:7mm;font-size:8.5pt;color:#555;background:#fff}',
      '.wk-sum tr.cash b{color:#111;font-variant-numeric:tabular-nums}',
      '.wk-fy{font-size:8pt;color:#777;margin-top:1.6mm;line-height:1.45}',
      '.wk-memo td{height:6.2mm}',
      '.wk-sign td{height:12mm}',
      '.wk-gap{height:5mm}',
      // 2쪽: 지출 3단
      '.wk-ex{display:grid;grid-template-columns:repeat(3,1fr);column-gap:5mm;align-items:start}',
      '.wk-ex .wk-t td{height:4.6mm;font-size:8.5pt}',
      '.wk-ex .wk-t td.it{padding-left:4.5mm}',
      '.wk-extot{display:flex;justify-content:flex-end;gap:8mm;align-items:center;margin-top:3mm;background:#E4E4E4;border-top:1pt solid #111;border-bottom:1pt solid #111;height:7.5mm;padding:0 3mm;font-weight:700;font-size:10pt}',
      '.wk-extot b{font-variant-numeric:tabular-nums;font-size:11pt}',
      '.wk-omit{font-size:7.8pt;color:#777;margin-top:2.2mm;line-height:1.45}',
      // 3쪽~: 헌금 내역 4단
      '.wk-of{display:grid;grid-template-columns:repeat(4,1fr);column-gap:5mm;align-items:start}',
      '.wk-of .wk-t td{height:4.75mm;font-size:8.5pt}',
      '.wk-of .wk-t td.oh{background:#F2F2F2;font-weight:700}',
      '.wk-of .wk-t td.oh span{float:right;font-weight:700;font-variant-numeric:tabular-nums}',
      '.wk-of .wk-t td.nm{padding-left:3mm}',
      '.wk-empty{color:#999;text-align:center;padding:16mm 0;font-size:10pt}',
      // ── 청원서(지출결의서): 세로 A4 ──
      '.wk-sec{font-size:.9rem;font-weight:700;color:#565552;margin:6px 0 8px}',
      '.wk-page.wk-pet{width:210mm;height:297mm;padding:14mm 15mm 12mm 18mm;font-size:10pt}',
      '.wk-pet .ph{display:grid;grid-template-columns:1fr auto;align-items:end;gap:6mm;margin-bottom:5mm}',
      '.wk-pet .ph .org{display:flex;align-items:center;gap:2mm;font-size:9.5pt;color:#333;margin-bottom:3mm}',
      '.wk-pet .ph .org img{height:7mm}',
      '.wk-pet .ph h1{font-size:22pt;letter-spacing:.55em;margin:0;font-weight:700}',
      '.wk-pet .ph .wk{font-size:11pt;font-weight:700;color:#C62828;margin-top:2.5mm}',
      '.wk-pet .ap{border-collapse:collapse;border:1pt solid #111}',
      '.wk-pet .ap td{border:.5pt solid #999;text-align:center;width:19mm;font-size:8.5pt}',
      '.wk-pet .ap td.k{width:7mm;background:#F2F2F2;font-weight:700;line-height:1.5}',
      '.wk-pet .ap tr:first-child td{height:6mm;background:#F2F2F2;font-weight:700}',
      '.wk-pet .ap tr:last-child td{height:17mm;padding:0;vertical-align:middle}',
      '.wk-pet .ap img.seal{display:block;margin:0 auto;max-width:16mm;max-height:15mm;object-fit:contain}',
      // 수기 양식(Word 와 같게)
      '.wk-form .wk-in td{height:var(--rh,5.6mm)}',
      '.wk-form .wk-sum td.amt.blank{color:#777;font-size:10pt}',
      '.wk-form .wk-sum tr.last td.amt.blank{color:#C62828;font-weight:700}',
      '.wk-form .wk-sum td.amt.filled{font-weight:700;font-size:12pt}',
      '.wk-form .wk-sum td{height:11.5mm}',
      '.wk-form .wk-memo td{height:6.2mm}',
      '.wk-form .wk-exf .wk-t td{height:var(--rh,4.25mm);font-size:8.5pt;padding-top:0;padding-bottom:0}',
      '.wk-form .wk-exf .wk-t td.g{background:#F2F2F2;font-weight:700}',
      '.wk-form .wk-exf .wk-t td.it{padding-left:4.5mm}',
      '.wk-form .wk-extotf{justify-content:flex-end;gap:3mm}',
      '.wk-form .wk-extotf small{font-weight:700;font-size:9.5pt}',
      '.wk-form .wk-extotf .box{display:inline-block;width:30mm;height:100%;border-left:.5pt solid #BDBDBD;margin-right:-3mm}',
      '.wk-form .wk-ofhint{font-size:8pt;color:#777;margin:-1.5mm 0 2mm}',
      '.wk-form .wk-off .wk-t td{height:6.6mm;font-size:10pt}',   // 2026-11-24 담임목사: "헌금자 명단 입력하는 칸이 너무 작다" → 손으로 쓰기 좋게 줄 높이 6.6mm
      '.wk-pet .wk-t td{height:6.7mm;font-size:9.5pt}',
      '.wk-pet .wk-t th{height:7mm;font-size:9.5pt}',
      '.wk-pet .tot td{height:8.5mm}',
      '.wk-pet .sumline{display:flex;justify-content:center;align-items:baseline;gap:5mm;margin:6mm 0 0;font-size:13pt;font-weight:700}',
      '.wk-pet .sumline b{color:#C62828;font-size:15pt;font-variant-numeric:tabular-nums;border-bottom:1pt solid #111;padding:0 6mm 1mm;min-width:55mm;text-align:right}',
      '.wk-pet .plea{text-align:center;margin-top:9mm;font-size:12pt;line-height:2.1}',
      '.wk-pet .plea .to{font-size:14pt;font-weight:700;letter-spacing:.15em;margin-top:3mm}',
      // ── 결의서 작성·정기 청구 화면 ──
      '.wk-pe-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
      '.wk-st{font-size:.82rem;color:#898885}',
      '.wk-pet-ed input,.wk-pet-ed select{width:100%;padding:5px 7px;border:1px solid #DDDCD9;border-radius:2px;font:inherit;font-size:.86rem;background:#fff}',
      '.wk-pet-ed input.n{text-align:right;font-variant-numeric:tabular-nums}',
      '.wk-pet-ed{min-width:940px}.wk-rc{min-width:1240px}.wk-dh{min-width:820px}',
      '.wk-pet-ed select[data-k=week]{min-width:72px}',
      '.wk-pet-ed input.sm{width:52px}.wk-pet-ed input.md{width:130px;margin-bottom:3px}.wk-pet-ed input[type=month]{width:140px}',
      '.wk-pet-ed td{padding:4px 5px!important;vertical-align:middle}',
      '.wk-pet-ed tr.off td{opacity:.5}',
      '.wk-pet-ed tr.onl td{background:#FBFAF7}',
      '.wk-pet-ed .st{font-size:.76rem;color:#565552;margin-top:2px}.wk-pet-ed .st.end{color:#A33A2A;font-weight:700}',
      '.wk-x{border:0;background:none;color:#A7A6A3;cursor:pointer;font-size:1rem;padding:2px 6px}.wk-x:hover{color:#C62828}',
      '.wk-rt{position:relative;display:block;height:16px;background:#F2F2F2;border-radius:2px;overflow:hidden;min-width:90px}',
      '.wk-rt i{position:absolute;left:0;top:0;bottom:0;background:#BDBDBD}',
      '.wk-rt.over i{background:#C62828}',
      '.wk-rt b{position:relative;font-size:.74rem;padding-left:5px;line-height:16px}',
      '.wk-rt.none{background:none;font-size:.78rem;color:#A7A6A3}',
      '.wk-pet-ed td small{display:block;font-size:.7rem;color:#898885;margin-top:2px;white-space:nowrap}',
      '.wk-pe-b{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}',
      '.tag{display:inline-block;font-size:.72rem;padding:1px 6px;border:1px solid #D9D8D5;border-radius:2px;color:#565552;margin-left:4px;text-decoration:none}',
      '.tag.rcp{border-color:#C62828;color:#C62828}',
      '.wk-pends{border-left:3px solid #C62828;background:#FDFCF9;padding:8px 12px;margin:0 0 10px;font-size:.88rem}',
      '.wk-pend{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #F0EFEC;padding:7px 0;flex-wrap:wrap}',
      '.wk-pend .memo{font-size:.8rem;color:#898885}',
      '.wk-pend .btn{padding:5px 12px}',
      '.bad{color:#C62828;font-weight:700}',
      '.wk-pet .rt{font-size:8.5pt}.wk-pet .rt.over{color:#C62828;font-weight:700}',
      '.wk-pet .att{font-size:7.5pt;color:#C62828}',
      '.wk-pet .rtnote{text-align:center;font-size:7.5pt;color:#777;margin-top:2mm}',
      '.wk-pet .pays{margin-top:3mm;border-top:1pt solid #111;border-bottom:.5pt solid #BDBDBD;padding:1.5mm 1mm;font-size:8.5pt}',
      '.wk-pet .pays b{display:block;font-size:9pt;margin-bottom:1mm}',
      '.wk-pet .pays div{display:flex;justify-content:space-between;gap:4mm;line-height:1.55}',
      '.wk-pet .pays div span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wk-rcp .rh{font-size:11pt;font-weight:700;border-bottom:1.3pt solid #111;padding-bottom:2mm;margin-bottom:4mm}',
      '.wk-rcp .rb{height:124mm;display:flex;flex-direction:column;margin-bottom:4mm;border:.5pt solid #BDBDBD;padding:3mm}',
      '.wk-rcp .rb .cap{font-size:9pt;margin-bottom:2mm}.wk-rcp .rb .cap b{color:#C62828}',
      '.wk-rcp .rb img{flex:1;min-height:0;width:100%;object-fit:contain}',
      '.wk-rcp .rb .pdf{font-size:9pt;color:#555;word-break:break-all}',
      // ── 인쇄: 보고서 쪽만, 가로 A4 ──
      // 왼쪽 메뉴 + 본문
      '.wk-layout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:18px;align-items:start}',
      '.wk-side{position:sticky;top:120px;background:#fff;border:1px solid var(--line,#F5F4F1);border-radius:2px;padding:8px}',
      '.wk-side-g{font-size:.74rem;font-weight:700;color:#A7A6A3;letter-spacing:.06em;padding:10px 10px 4px}',
      '.wk-side button{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;padding:9px 10px;font:inherit;font-size:.92rem;cursor:pointer;color:#111}',
      '.wk-side button:hover{background:#FDFCF9}',
      '.wk-side button.on{border-left-color:#C62828;background:#FBFAF7;font-weight:700}',
      '.wk-badge{background:#C62828;color:#fff;border-radius:999px;font-size:.7rem;font-weight:700;padding:1px 7px}',
      '.wk-hide{display:none}',
      '.wk-carry{border-left:4px solid #C62828}',
      '.wk-carry-l{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;font-size:.9rem}',
      '.wk-carry-l label{display:flex;gap:6px;align-items:center;cursor:pointer}',
      '@media (max-width:860px){.wk-layout{grid-template-columns:1fr}.wk-side{position:static;display:flex;flex-wrap:wrap;gap:4px}.wk-side-g{width:100%}.wk-side button{width:auto;border-left:0;border-bottom:3px solid transparent}.wk-side button.on{border-bottom-color:#C62828}}',
      // 금주 청구 내역
      '.wk-claim{border:1px solid #EEEDEA;border-left:4px solid #BDBDBD;border-radius:2px;margin:10px 0;background:#fff}',
      '.wk-claim.submitted{border-left-color:#C62828}.wk-claim.approved{border-left-color:#111}.wk-claim.rejected{opacity:.7}',
      '.wk-claim .ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid #F2F1EE;background:#FDFCF9}',
      '.wk-claim .ch .when{margin-left:auto;font-size:.76rem;color:#A7A6A3}',
      '.wk-claim .pill{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#F2F2F2;color:#555}',
      '.wk-claim .pill.submitted{background:#FBEDEA;color:#C62828}.wk-claim .pill.approved{background:#111;color:#fff}',
      '.wk-claim .cb{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;padding:10px 12px}',
      '.wk-claim .row{display:flex;gap:10px;align-items:baseline;padding:3px 0;font-size:.9rem}',
      '.wk-claim .row>span:first-child{flex:0 0 78px;color:#898885;font-size:.8rem}',
      '.wk-claim .row .amt{color:#C62828}.wk-claim .row small{color:#898885;margin-left:6px}',
      '.wk-claim .row .memo{white-space:pre-wrap}',
      '.wk-claim .acts{display:flex;gap:8px;margin-top:8px}.wk-claim .acts .btn{padding:6px 12px}',
      '.wk-claim .cr{display:flex;gap:6px;flex-wrap:wrap;align-content:flex-start}',
      '.wk-claim .cr .rc{display:block;width:140px;height:170px;border:1px solid #E5E4E1;border-radius:2px;overflow:hidden;background:#FAFAFA}',
      '.wk-claim .cr .rc img{width:100%;height:100%;object-fit:contain}',
      '.wk-claim .cr .rc.pdf{display:flex;align-items:center;justify-content:center;font-size:.8rem;color:#C62828;text-decoration:none;height:60px}',
      '.wk-claim .norc{font-size:.82rem;color:#A7A6A3;padding:8px}',
      '@media (max-width:700px){.wk-claim .cb{grid-template-columns:1fr}}',
      '#wkPrintHost{display:none}',
      '@media print{',
      ' body.wk-printing>*:not(#wkPrintHost){display:none!important}',
      ' body.wk-printing{margin:0!important;padding:0!important;background:#fff!important}',
      ' body.wk-printing #wkPrintHost{display:block!important}',
      ' #wkPrintHost .wk-page{box-shadow:none;margin:0;break-after:page;page-break-after:always}',
      ' #wkPrintHost .wk-page:last-child{break-after:auto;page-break-after:auto}',
      '}'
    ].join('\n');
    var s = document.createElement('style'); s.id = 'wkCss'; s.textContent = css; document.head.appendChild(s);
  }

  // 인쇄: 보고서는 가로 A4, 청원서는 세로 A4(이름 붙인 @page). @page 는 인쇄하는 동안만 붙였다가 뗀다(다른 인쇄에 영향 없게).
  // which: 'report' | 'petition' | 'all'
  function printPages(docEl, which, onDone) {
    var host = document.getElementById('wkPrintHost');
    if (host) host.remove();
    host = document.createElement('div'); host.id = 'wkPrintHost';
    var sel = which === 'report' ? '.wk-page.wk-land' : which === 'petition' ? '.wk-page.wk-pet' : '.wk-page';
    Array.prototype.forEach.call(docEl.querySelectorAll(sel), function (p) { host.appendChild(p.cloneNode(true)); });
    document.body.appendChild(host);
    var ps = document.createElement('style'); ps.id = 'wkPageCss';
    ps.textContent = '@page{size:A4 ' + (which === 'petition' ? 'portrait' : 'landscape') + ';margin:0}' +
      '@page wkland{size:A4 landscape;margin:0}@page wkpet{size:A4 portrait;margin:0}' +
      '@media print{#wkPrintHost .wk-land{page:wkland}#wkPrintHost .wk-pet{page:wkpet}}';
    document.head.appendChild(ps);
    document.body.classList.add('wk-printing');
    var done = false;
    function cleanup() {
      if (done) return; done = true;
      document.body.classList.remove('wk-printing');
      if (host.parentNode) host.remove();
      if (ps.parentNode) ps.remove();
      window.removeEventListener('afterprint', cleanup);
      if (onDone) onDone();
    }
    window.addEventListener('afterprint', cleanup);
    // 로고 그림이 다 읽힌 뒤 인쇄
    var imgs = host.querySelectorAll('img'), left = imgs.length;
    function go() { setTimeout(function () { window.print(); setTimeout(cleanup, 1500); }, 60); }
    if (!left) go();
    else Array.prototype.forEach.call(imgs, function (im) {
      if (im.complete) { if (--left === 0) go(); }
      else im.onload = im.onerror = function () { if (--left === 0) go(); };
    });
  }

  // =====================================================================
  //  화면 짜임 (2026-11-24 담임목사: "왼쪽에 메뉴를 만들어 지출결의서와 재정보고서를 분리,
  //  할부 등록 · 정기지출 등록 등을 지출결의서에, 금주 청구된 내역으로 각 부가 올린 청원서와 영수증을 볼 수 있도록")
  //   왼쪽 메뉴: 재정보고서 / 지출결의서(작성·인쇄 · 금주 청구 내역 · 정기 지출 등록 · 할부 등록)
  // =====================================================================
  var VIEWS = [
    { grp: '재정보고서' },
    { k: 'report', label: '주간 재정보고서' },
    { grp: '지출결의서' },
    { k: 'petition', label: '지출결의서 작성 · 인쇄' },
    { k: 'claims', label: '금주 청구 내역', badge: true },
    { k: 'regular', label: '정기 지출 등록' },
    { k: 'inst', label: '할부 등록' }
  ];
  function render(panel, X) {
    injectCSS();
    if (!state.view) state.view = 'report';
    panel.innerHTML = '<div class="wk-layout"><nav class="wk-side">' + VIEWS.map(function (v) {
      if (v.grp) return '<div class="wk-side-g">' + v.grp + '</div>';
      return '<button data-view="' + v.k + '"' + (state.view === v.k ? ' class="on"' : '') + '>' + v.label + (v.badge ? ' <span class="wk-badge" id="wkBadge" hidden></span>' : '') + '</button>';
    }).join('') + '</nav><div class="wk-main" id="wkMain"></div></div>';
    Array.prototype.forEach.call(panel.querySelectorAll('.wk-side [data-view]'), function (b) {
      b.onclick = function () { state.view = b.getAttribute('data-view'); render(panel, X); };
    });
    // 다른 화면으로 가는 단추(예: 결의서 화면의 「금주 청구 내역 보기」)
    if (!panel.__wkGoto) {
      panel.__wkGoto = true;
      panel.addEventListener('click', function (e) {
        var g = e.target.closest && e.target.closest('[data-goto]');
        if (g) { state.view = g.getAttribute('data-goto'); render(panel, X); }
      });
    }
    var main = panel.querySelector('#wkMain');
    if (state.view === 'regular') return renderRecurring(main, X, 'regular');
    if (state.view === 'inst') return renderRecurring(main, X, 'inst');
    renderWeek(main, X, panel);
  }

  function renderWeek(main, X, panel) {
    var won = X.won, esc = X.esc, view = state.view;
    var fyR = X.fyRange(X.fy());
    // 고른 주가 이 회계연도에 없으면: 오늘이 회계연도 안이면 이번 주, 아니면 회계연도 마지막 주
    var t = X.today();
    function inFYweek(sun) { return sun && addDays(sun, 6) >= fyR.from && sun <= fyR.to; }
    if (!inFYweek(state.sunday)) state.sunday = (t >= fyR.from && t <= fyR.to) ? sundayOf(t) : sundayOf(fyR.to);
    var weeks = [], s = sundayOf(fyR.from);
    while (s <= fyR.to) { weeks.push(s); s = addDays(s, 7); }
    var thisSun = sundayOf(t);
    var opts = weeks.map(function (w) {
      var a = w, b = addDays(w, 6);   // 한 주 = 주일 ~ 토요일(회계연도 경계에서도 자르지 않음)
      return '<option value="' + w + '"' + (w === state.sunday ? ' selected' : '') + '>' + dt(w).getFullYear() + '년 ' + weekName(w) + ' (' + md(a) + ' ~ ' + md(b) + ')' + (w === thisSun ? ' · 이번 주' : '') + '</option>';
    }).reverse().join('');
    var btns = '';
    if (view === 'report') {
      btns = '<label title="끄면 Word 양식처럼 이월금만 채운 수기 작성용으로 나옵니다"><input type="checkbox" id="wkFill"' + (state.fill ? ' checked' : '') + '> 장부 숫자도 채우기</label>' +
        (state.fill ? '<label><input type="checkbox" id="wkZero"' + (state.showZero ? ' checked' : '') + '> 0원 계정도 보기</label>' : '') +
        '<button class="btn btn-solid wk-print" id="wkPrint" title="주간 재정보고서를 가로 A4로 인쇄">🖨 재정보고서 인쇄</button>';
    } else {
      btns = '<button class="btn btn-solid wk-print" id="wkPrintPet" title="지출결의서와 영수증을 세로 A4로 인쇄">🖨 지출결의서 인쇄</button>';
    }
    btns += '<button class="btn btn-line" id="wkPrintAll" title="재정보고서와 지출결의서·영수증을 한 번에 인쇄">📚 일괄 출력</button>';
    var title = { report: '주간 재정보고서', petition: '지출결의서 작성 · 인쇄', claims: '금주 청구 내역' }[view];
    main.innerHTML =
      '<div class="fin-card"><div class="wk-bar">' +
      '<b style="color:var(--accent,#111)">' + title + '</b>' +
      '<button class="btn btn-line wk-nav" id="wkPrev" title="앞 주">◀</button>' +
      '<select id="wkSel">' + opts + '</select>' +
      '<button class="btn btn-line wk-nav" id="wkNext" title="다음 주">▶</button>' +
      '<button class="btn btn-line" id="wkThis">이번 주</button>' + btns +
      '</div><p class="wk-note" id="wkNote"></p></div>' +
      '<div id="wkBody"></div>' +
      '<div class="wk-scaler" id="wkScaler"' + (view === 'claims' ? ' style="position:absolute;left:-99999px;top:0;width:1200px"' : '') + '><p class="qt-loading">불러오는 중…</p></div>';
    var sel = main.querySelector('#wkSel');
    function again() { render(panel, X); }
    function pick(sun) { state.sunday = sun; again(); }
    sel.onchange = function () { pick(sel.value); };
    main.querySelector('#wkPrev').onclick = function () { var i = weeks.indexOf(state.sunday); if (i > 0) pick(weeks[i - 1]); };
    main.querySelector('#wkNext').onclick = function () { var i = weeks.indexOf(state.sunday); if (i >= 0 && i < weeks.length - 1) pick(weeks[i + 1]); };
    main.querySelector('#wkThis').onclick = function () {
      if (t < fyR.from || t > fyR.to) { alert('이번 주는 지금 고른 회계연도(' + fyR.from + ' ~ ' + fyR.to + ')에 들어 있지 않습니다. 위에서 회계연도를 바꿔 주세요.'); return; }
      pick(thisSun);
    };
    var zEl = main.querySelector('#wkZero'); if (zEl) zEl.onchange = function (e) { state.showZero = e.target.checked; again(); };
    var fEl = main.querySelector('#wkFill'); if (fEl) fEl.onchange = function (e) { state.fill = e.target.checked; again(); };

    var scaler = main.querySelector('#wkScaler'), body = main.querySelector('#wkBody');
    X.load().then(function () { return loadOnline(X, state.sunday); }).then(function (online) {
      var badge = panel.querySelector('#wkBadge');
      if (badge && online.pending && online.pending.length) { badge.hidden = false; badge.textContent = online.pending.length; }
      var rep = state.fill ? build(X, fyR) : buildForm(X, fyR);
      var docEl = null;
      function fit() {
        if (!scaler.isConnected) { window.removeEventListener('resize', fit); return; }
        if (!docEl || view === 'claims') return;
        var w = scaler.clientWidth || 1, natW = docEl.scrollWidth || 1123;
        var k = Math.min(1, w / natW);
        docEl.style.transform = 'scale(' + k + ')';
        scaler.style.height = Math.ceil(docEl.scrollHeight * k) + 'px';
      }
      // 미리보기: 화면마다 자기 쪽만 보이고, 나머지 쪽은 숨긴 채 두어 「일괄 출력」이 함께 찍는다
      function preview() {
        var rows = petRows(X, online);
        scaler.innerHTML = '<div class="wk-doc">' +
          '<div class="' + (view === 'report' ? '' : 'wk-hide') + '"><div class="wk-sec">주간 재정보고서 (가로 A4' + (state.fill ? ' · 장부 숫자 채움' : ' · 수기 작성용, 이월금만 채움') + ')</div>' + rep.html + '</div>' +
          '<div class="' + (view === 'petition' ? '' : 'wk-hide') + '"><div class="wk-sec">지출결의서 (세로 A4)</div>' + petitionPages(X, fyR, rows) + receiptPages(X, rows) + '</div>' +
          '</div>';
        docEl = scaler.querySelector('.wk-doc');
        fit();
      }
      if (view === 'report') main.querySelector('#wkNote').innerHTML = rep.note;
      else if (view === 'petition') {
        main.querySelector('#wkNote').innerHTML = '정기 지출 · 할부는 그 달 그 주에 저절로 들어갑니다(왼쪽 「정기 지출 등록」 · 「할부 등록」). 확인한 부서 청원은 영수증과 함께 붙습니다.';
        editor(body, X, fyR, online, preview, again);
      } else {
        main.querySelector('#wkNote').innerHTML = '이 주(' + weekName(state.sunday) + ') 지출결의서로 올라온 부서 · 청원자의 청원입니다. 「확인」한 청원만 결의서에 들어갑니다.';
        claimsView(body, X, fyR, online, again);
      }
      preview();
      window.addEventListener('resize', fit);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      var pr = main.querySelector('#wkPrint'); if (pr) pr.onclick = function () { printPages(docEl, 'report'); };
      // 당회장 도장이 찍힌 지출결의서를 인쇄하면 그 결의서의 (확인된) 온라인 청원을 「지급 완료」로 적는다(청원자 화면에 보임)
      function markPaid() {
        if (!chairSeal(X)) return;
        var ids = (online.approved || []).filter(function (p) { return !p.paid_at; }).map(function (p) { return p.id; });
        if (!ids.length) return;
        X.call('markPetitionsPaid', { ids: ids }).then(function () { (online.approved || []).forEach(function (p) { if (ids.indexOf(p.id) >= 0) p.paid_at = new Date().toISOString(); }); })
          .catch(function (er) { if (/fin_petition_mark_paid|schema cache|404/i.test(String(er && er.message))) return; alert('청원을 지급 완료로 적지 못했습니다: ' + er.message); });
      }
      var pp = main.querySelector('#wkPrintPet'); if (pp) pp.onclick = function () { printPages(docEl, 'petition', markPaid); };
      main.querySelector('#wkPrintAll').onclick = function () { printPages(docEl, 'all', markPaid); };
    }).catch(function (e) {
      scaler.innerHTML = '<div class="fin-card" style="color:#A33A2A">불러오지 못했습니다: ' + esc(e.message) + '</div>';
    });
  }

  // ── 금주 청구 내역: 이 주 결의서로 올라온 청원 + 다른 주의 확인 대기 ──
  function claimsView(box, X, fyR, online, reload) {
    var won = X.won, esc = X.esc, sun = state.sunday;
    if (online.missing) { box.innerHTML = '<div class="fin-card">온라인 청원 표가 아직 없습니다.</div>'; return; }
    var stName = { submitted: '확인 대기', approved: '확인함 · 결의서에 들어감', rejected: '돌려보냄' };
    var week = (online.week || []).concat(online.open || []).slice().sort(function (a, b) { return (a.status === 'submitted' ? 0 : 1) - (b.status === 'submitted' ? 0 : 1) || a.id - b.id; });
    var rt = rates(X, fyR, petRows(X, online));
    function card(p) {
      var recs = p.receipts || [];
      var o = rt[p.hang];
      return '<div class="wk-claim ' + esc(p.status) + '">' +
        '<div class="ch"><b>' + esc(p.dept || '재정 청원') + '</b> · ' + esc(p.requester_name || '') + '<span class="pill ' + esc(p.status) + '">' + esc(stName[p.status] || p.status) + '</span>' +
        (p.week_sunday !== sun ? '<span class="tag">' + esc(weekName(p.week_sunday)) + ' 결의서</span>' : '') + '<span class="when">' + esc(String(p.created_at || '').slice(0, 16).replace('T', ' ')) + '</span></div>' +
        '<div class="cb"><div class="cl">' +
        '<div class="row"><span>관 · 항</span><b>' + esc(p.gwan || '') + ' · ' + esc(p.hang || '') + '</b></div>' +
        '<div class="row"><span>지출 내역</span><b>' + esc(p.item || '') + '</b></div>' +
        '<div class="row"><span>금액</span><b class="amt">' + won(p.amount) + '원</b>' + (o && o.budget != null ? '<small>예산 집행률 ' + pct(o.rate) + '</small>' : '') + '</div>' +
        (p.pay_account ? '<div class="row"><span>받는 계좌</span><b>' + esc(p.pay_bank) + ' ' + esc(p.pay_account) + ' (예금주 ' + esc(p.pay_holder) + ')</b></div>' : '<div class="row"><span>받는 계좌</span><i>없음</i></div>') +
        (p.memo ? '<div class="row"><span>메모</span><span class="memo">' + esc(p.memo) + '</span></div>' : '') +
        (p.review_note ? '<div class="row"><span>돌려보낸 까닭</span><span class="memo">' + esc(p.review_note) + '</span></div>' : '') +
        '<div class="acts">' +
        (p.status === 'submitted' ? '<button class="btn btn-solid" data-ok="' + p.id + '">확인 → 결의서에 넣기</button><button class="btn btn-line" data-no="' + p.id + '">돌려보냄</button>' :
          '<button class="btn btn-line" data-back="' + p.id + '">다시 확인 대기로</button>') + '</div>' +
        '</div><div class="cr">' + (recs.length ? recs.map(function (u, i) {
          return /\.pdf(\?|$)/i.test(u) ? '<a class="rc pdf" href="' + esc(u) + '" target="_blank" rel="noopener">PDF 영수증 ' + (i + 1) + '</a>'
            : '<a class="rc" href="' + esc(u) + '" target="_blank" rel="noopener" title="크게 보기"><img src="' + esc(u) + '" alt="영수증 ' + (i + 1) + '" loading="lazy"></a>';
        }).join('') : '<div class="norc">영수증 없음</div>') + '</div></div></div>';
    }
    var tot = week.filter(function (p) { return p.status === 'approved' && p.week_sunday === sun; }).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    box.innerHTML =
      '<div class="fin-card"><div class="wk-pe-h"><b>' + dt(sun).getFullYear() + '년 ' + weekName(sun) + ' 금주 청구 내역 ' + week.length + '건</b>' +
      '<span class="wk-st">이 주 결의서에 확인한 청원 ' + won(tot) + '원</span></div>' +
      '<p class="wk-note" style="margin:0 0 8px">이 주 결의서의 청원과, 다른 주 결의서로 간 청원 중 아직 끝나지 않은 것(확인 대기 · 지급 전)을 함께 보입니다. 다른 주 것은 「○월 ○주 결의서」 표시가 붙습니다.</p>' +
      (week.length ? week.map(card).join('') : '<p class="wk-note" style="margin:0">올라온 청원이 없습니다.</p>') + '</div>';
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (t.getAttribute('data-ok')) review(t.getAttribute('data-ok'), 'approved');
      else if (t.getAttribute('data-no')) { var why = prompt('돌려보내는 까닭을 적어 주세요(청원자에게 보입니다).', ''); if (why != null) review(t.getAttribute('data-no'), 'rejected', why); }
      else if (t.getAttribute('data-back')) review(t.getAttribute('data-back'), 'submitted');
    });
    function review(id, status, why) {
      X.call('reviewPetition', { id: id, status: status, note: why || '' }).then(reload).catch(function (er) { alert('바꾸지 못했습니다: ' + er.message); });
    }
  }

  // =====================================================================
  //  수기 작성용 주간 재정보고서 (2027예결산/2027_주간_재정보고서_양식.docx 와 같은 모양)
  //  2026-11-24 담임목사: "재정보고서를 출력하는 이유는 이월금이 표기된 금주 재정보고서를 수기로 작성하기 위함"
  //  → 계정은 모두 적고 금액 칸은 비운다. 년·월·주와 전주 이월금만 채운다(이월금은 장부로 자동).
  //  1쪽 수입 항목(현금·온라인·합계) + 금주 재정 요약 + 특이사항 + 확인
  //  2쪽 지출(분류 줄 오른쪽 칸 = 소계, 3단)
  //  3~5쪽 헌금 내역서(이름 / (항목) · 헌금액, 4단 × 22줄 — 손으로 쓰기 좋게 칸을 키움)
  // =====================================================================
  function buildForm(X, fyR) {
    var won = X.won, esc = X.esc, M = X.M;
    var sun = state.sunday, from = sun;   // 한 주 = 주일 ~ 토요일
    var opening = X.balanceBefore(from);
    var year = dt(sun).getFullYear(), wname = weekName(sun);
    var pageNo = 0;
    function head(kind, side) {
      return '<div class="wk-head"><img src="' + LOGO + '" alt="운평장로교회 로고"><div class="org">운평장로교회 재정부</div>' +
        '<div class="ttl">' + year + '년 ' + wname + ' ' + kind + '</div>' +
        '<div class="side"><b>' + side + '</b><span>보고일&nbsp; ' + year + '.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.</span></div></div>';
    }
    function page(kind, side, body) {
      pageNo++;
      return '<div class="wk-page wk-land wk-form">' + head(kind, side) + body + '<div class="wk-foot">운평장로교회 재정부 · <b>' + pageNo + '</b></div></div>';
    }
    // 예산·계정 표의 계정(관 → 항), 이월금 계정은 뺀다
    function accTree(gubun) {
      var all = (M.budget || []).filter(function (b) { return String(b['구분']) === gubun; });
      var gs = all.filter(function (b) { return String(b['계정코드']).slice(-4) === '0000'; }).sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); });
      return gs.map(function (g) {
        var p3 = String(g['계정코드']).slice(0, 3);
        var items = all.filter(function (b) { var c = String(b['계정코드']); return c.slice(0, 3) === p3 && c.slice(-4) !== '0000' && !/이월금/.test(b['계정이름']); })
          .sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); }).map(function (b) { return b['계정이름']; });
        return { name: g['계정이름'], items: items };
      }).filter(function (g) { return g.items.length; });
    }

    // ── 1쪽 ──
    var inTree = accTree('수입'), inRows = '';
    inTree.forEach(function (g) {
      g.items.forEach(function (nm, i) {
        inRows += '<tr>' + (i === 0 ? '<td class="grp" rowspan="' + g.items.length + '">' + esc(g.name) + '</td>' : '') +
          '<td>' + esc(nm) + '</td><td></td><td></td><td class="sumcol"></td></tr>';
      });
    });
    var nIn = inTree.reduce(function (s, g) { return s + g.items.length; }, 0);
    var rowH = nIn > 26 ? 4.6 : 5.6;   // 계정이 많으면 줄 높이를 줄여 한 쪽에
    var inTable = '<div class="wk-sub">수입 항목</div><table class="wk-t wk-in" style="--rh:' + rowH + 'mm"><colgroup><col style="width:23mm"><col style="width:41mm"><col><col><col></colgroup>' +
      '<thead><tr><th>분류</th><th>항목</th><th>현금</th><th>온라인</th><th class="sumcol">합계</th></tr></thead><tbody>' + inRows +
      '<tr class="tot"><td colspan="2" style="text-align:center">수입 합계</td><td></td><td></td><td class="sumcol"></td></tr></tbody></table>';
    var sumTable = '<div class="wk-sub">금주 재정 요약</div><table class="wk-t wk-sum"><colgroup><col style="width:9mm"><col style="width:44mm"><col></colgroup>' +
      '<thead><tr><th></th><th>구분</th><th>금액</th></tr></thead><tbody>' +
      '<tr><td class="sym"></td><td class="lab"><b>전주 이월금</b><span>지난주 차인 잔액</span></td><td class="amt filled">' + won(opening) + ' 원</td></tr>' +
      '<tr><td class="sym">+</td><td class="lab"><b class="red">금주 수입</b><span>왼쪽 수입 합계</span></td><td class="amt blank">원</td></tr>' +
      '<tr><td class="sym">−</td><td class="lab"><b>금주 지출</b><span>2쪽 지출 합계</span></td><td class="amt blank">원</td></tr>' +
      '<tr class="last"><td class="sym">=</td><td class="lab"><b class="red">차인 잔액</b><span>다음 주 이월금</span></td><td class="amt blank red">원</td></tr>' +
      '<tr class="cash"><td colspan="3">금주 수입 중&nbsp;&nbsp; 현금 ____________ 원&nbsp;&nbsp; · &nbsp;&nbsp;온라인 ____________ 원</td></tr>' +
      '</tbody></table>';
    var memo = '<div class="wk-gap"></div><div class="wk-sub">특이사항</div><table class="wk-t wk-memo"><tbody><tr><td></td></tr><tr><td></td></tr><tr><td></td></tr><tr><td></td></tr></tbody></table>';
    var sign = '<div class="wk-gap"></div><div class="wk-sub">확인</div><table class="wk-t wk-sign"><thead><tr><th>작성자</th><th>재정부장</th><th>당회장</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr></tbody></table>';
    var html = page('재정보고서', '수입 · 요약', '<div class="wk-p1"><div>' + inTable + '</div><div>' + sumTable + memo + sign + '</div></div>');

    // ── 2쪽: 지출 3단 ──
    var exTree = accTree('지출');
    var sizes = exTree.map(function (g) { return 1 + g.items.length; }), total = sizes.reduce(function (a, b) { return a + b; }, 0);
    var cols = [[], [], []], cur = 0, acc = 0;
    exTree.forEach(function (g, i) { if (cur < 2 && acc + sizes[i] / 2 > total / 3 * (cur + 1)) cur++; cols[cur].push(g); acc += sizes[i]; });
    var nrows = Math.max.apply(null, cols.map(function (c) { return c.reduce(function (s, g) { return s + 1 + g.items.length; }, 0); }));
    var exH = nrows > 36 ? Math.max(3.4, Math.floor(150 / nrows * 10) / 10) : 4.25;
    function exCol(list) {
      var rows = '', n = 0;
      list.forEach(function (g) {
        rows += '<tr><td class="g">' + esc(g.name) + '</td><td class="g"></td></tr>'; n++;
        g.items.forEach(function (nm) { rows += '<tr><td class="it">' + esc(nm) + '</td><td></td></tr>'; n++; });
      });
      for (; n < nrows; n++) rows += '<tr><td></td><td></td></tr>';
      return '<table class="wk-t"><colgroup><col><col style="width:30mm"></colgroup><thead><tr><th>계정</th><th>금액</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    var exBody = '<div class="wk-ex wk-exf" style="--rh:' + exH + 'mm">' + cols.map(exCol).join('') + '</div>' +
      '<div class="wk-extot wk-extotf">지출 합계 &nbsp;<small>(분류 줄 오른쪽 칸 = 소계)</small><span class="box"></span></div>';
    html += page('재정보고서', '지출', exBody);

    // ── 3~4쪽: 헌금 내역서(빈 칸) ──
    for (var pg = 1; pg <= 3; pg++) {
      var blocks = '';
      for (var b = 0; b < 4; b++) {
        var trs = '';
        for (var r = 0; r < 22; r++) trs += '<tr><td></td><td></td></tr>';
        blocks += '<table class="wk-t"><colgroup><col><col style="width:28mm"></colgroup><thead><tr><th>이름 / (항목)</th><th>헌금액</th></tr></thead><tbody>' + trs + '</tbody></table>';
      }
      html += page('헌금 내역서', '헌금 내역 ' + pg,
        '<div class="wk-ofhint">항목이 바뀌는 곳은 이름 칸에 ( 십일조 ) 처럼 항목을 적고, 그 아래 줄부터 이름과 금액을 적습니다.</div><div class="wk-of wk-off">' + blocks + '</div>');
    }
    var note = year + '년 ' + wname + '(' + md(from) + ' ~ ' + md(addDays(sun, 6)) + ') 수기 작성용 양식입니다. 전주 이월금 <b>' + won(opening) + '원</b>은 장부로 자동 계산해 채웠습니다' +
      '(회계연도 시작 이월금 + ' + md(fyR.from) + '부터 이번 주 직전까지의 수입·지출). 나머지 금액 칸은 비워 둡니다. 「재정보고서 인쇄」 = 가로 A4 5쪽(헌금 내역서 3쪽).';
    return { html: html, note: note };
  }

  // ── 보고서 만들기 ──
  function build(X, fyR) {
    var won = X.won, esc = X.esc, M = X.M;
    var sun = state.sunday, from = sun, to = addDays(sun, 6);   // 한 주 = 주일 ~ 토요일
    var showZero = state.showZero;
    function isGrp(c) { return String(c || '').slice(-4) === '0000'; }
    function parOf(c) { return String(c || '').slice(0, 3) + '0000'; }
    function w0(n) { return n ? won(n) : ''; }

    // 이번 주 전표
    var wk = (M.vouchers || []).filter(function (v) { var d = X.fmtD(v['일자']); return d >= from && d <= to; });
    var incV = wk.filter(function (v) { return String(v['구분']) === '수입'; });
    var expV = wk.filter(function (v) { return String(v['구분']) !== '수입'; });

    // 계정 나무(예산·계정 표 순서). 장부에만 있는 계정은 '기타(미등록)'로.
    function tree(gubun, sums) {
      var all = (M.budget || []).filter(function (b) { return String(b['구분']) === gubun; });
      var groups = all.filter(function (b) { return isGrp(b['계정코드']); }).sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); });
      var kidsOf = {};
      all.filter(function (b) { return !isGrp(b['계정코드']); }).forEach(function (b) { (kidsOf[parOf(b['계정코드'])] = kidsOf[parOf(b['계정코드'])] || []).push(b); });
      var seen = {}, out = [];
      groups.forEach(function (g) {
        var kids = (kidsOf[g['계정코드']] || []).sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); });
        var items = [];
        kids.forEach(function (k) {
          var nm = k['계정이름'];
          if (/이월금/.test(nm)) return;              // 이월금은 요약 표에서 따로 다룬다
          if (seen[nm]) return;                       // 같은 이름 계정은 한 번만
          seen[nm] = 1;
          items.push({ name: nm, v: sums[nm] || null });
        });
        if (items.length) out.push({ name: g['계정이름'], items: items });
      });
      var extra = Object.keys(sums).filter(function (nm) { return !seen[nm]; });
      if (extra.length) out.push({ name: '기타(미등록)', items: extra.map(function (nm) { return { name: nm || '(계정 없음)', v: sums[nm] }; }) });
      return out;
    }

    // 수입: 계정별 현금·온라인
    var inSum = {}, cashT = 0, onT = 0;
    incV.forEach(function (v) {
      var a = v['계정'] || '', amt = Number(v['금액']) || 0, cash = !v['수단'] || v['수단'] === '현금';
      var o = inSum[a] = inSum[a] || { cash: 0, on: 0, tot: 0 };
      if (cash) { o.cash += amt; cashT += amt; } else { o.on += amt; onT += amt; }
      o.tot += amt;
    });
    var incT = cashT + onT;
    // 지출: 계정별 합계
    var exSum = {}, expT = 0;
    expV.forEach(function (v) { var a = v['계정'] || '', amt = Number(v['금액']) || 0; exSum[a] = (exSum[a] || 0) + amt; expT += amt; });

    // 이월금 (매주 자동): 회계연도 시작 이월금 + 회계연도 시작 ~ 이번 주 직전 수입·지출
    var opening = X.balanceBefore(from), closing = opening + incT - expT;
    var fy = X.fy(), fyCarry = X.carryInfo(fy);
    var cumIn = 0, cumEx = 0, cumTo = to > fyR.to ? fyR.to : to;   // 누계는 회계연도 안에서만
    (M.vouchers || []).forEach(function (v) { var d = X.fmtD(v['일자']); if (d >= fyR.from && d <= cumTo) { var a = Number(v['금액']) || 0; if (String(v['구분']) === '수입') cumIn += a; else cumEx += a; } });

    var year = dt(sun).getFullYear(), wname = weekName(sun);   // 주 이름은 주일 날짜로(2026 청원서와 같게)
    var period = md(from) + '(' + DOW[dt(from).getDay()] + ') ~ ' + md(to) + '(' + DOW[dt(to).getDay()] + ')';
    var pageNo = 0;
    function head(kind, side) {
      return '<div class="wk-head"><img src="' + LOGO + '" alt="운평장로교회 로고"><div class="org">운평장로교회 재정부</div>' +
        '<div class="ttl">' + year + '년 ' + wname + ' ' + kind + '</div>' +
        '<div class="side"><b>' + side + '</b><span>' + year + '.' + period + '</span></div></div>';
    }
    function page(kind, side, body) {
      pageNo++;
      return '<div class="wk-page wk-land">' + head(kind, side) + body + '<div class="wk-foot">운평장로교회 재정부 · <b>' + pageNo + '</b></div></div>';
    }

    // ── 1쪽: 수입 + 금주 재정 요약 ──
    var inTree = tree('수입', inSum), hiddenIn = 0;
    var inRows = '';
    inTree.forEach(function (g) {
      var items = g.items.filter(function (it) { if (showZero || (it.v && it.v.tot)) return true; hiddenIn++; return false; });
      if (!items.length) return;
      items.forEach(function (it, i) {
        var v = it.v || { cash: 0, on: 0, tot: 0 };
        inRows += '<tr>' + (i === 0 ? '<td class="grp" rowspan="' + items.length + '">' + esc(g.name) + '</td>' : '') +
          '<td' + (v.tot ? '' : ' class="z"') + '>' + esc(it.name) + '</td>' +
          '<td class="n">' + w0(v.cash) + '</td><td class="n">' + w0(v.on) + '</td><td class="n sumcol">' + (v.tot ? '<b>' + won(v.tot) + '</b>' : '') + '</td></tr>';
      });
    });
    if (!inRows) inRows = '<tr><td colspan="5" class="wk-empty">이번 주 수입 전표가 없습니다.</td></tr>';
    var inTable = '<div class="wk-sub">수입 항목</div><table class="wk-t wk-in"><colgroup><col style="width:24mm"><col><col style="width:31mm"><col style="width:31mm"><col style="width:33mm"></colgroup>' +
      '<thead><tr><th>분류</th><th>항목</th><th>현금</th><th>온라인</th><th class="sumcol">합계</th></tr></thead><tbody>' + inRows +
      '<tr class="tot"><td colspan="2" style="text-align:center">수입 합계</td><td class="n">' + won(cashT) + '</td><td class="n">' + won(onT) + '</td><td class="n sumcol">' + won(incT) + '</td></tr></tbody></table>' +
      (hiddenIn ? '<div class="wk-omit">이번 주 0원인 수입 계정 ' + hiddenIn + '개는 접어 두었습니다.</div>' : '');

    var sumTable = '<div class="wk-sub">금주 재정 요약</div><table class="wk-t wk-sum"><colgroup><col style="width:9mm"><col style="width:42mm"><col></colgroup>' +
      '<thead><tr><th></th><th>구분</th><th>금액</th></tr></thead><tbody>' +
      '<tr><td class="sym"></td><td class="lab"><b>전주 이월금</b><span>지난주 차인 잔액</span></td><td class="amt">' + won(opening) + ' 원</td></tr>' +
      '<tr><td class="sym">+</td><td class="lab"><b class="red">금주 수입</b><span>왼쪽 수입 합계</span></td><td class="amt red">' + won(incT) + ' 원</td></tr>' +
      '<tr><td class="sym">−</td><td class="lab"><b>금주 지출</b><span>' + (pageNo + 2) + '쪽 지출 합계</span></td><td class="amt">' + won(expT) + ' 원</td></tr>' +
      '<tr class="last"><td class="sym">=</td><td class="lab"><b class="red">차인 잔액</b><span>다음 주 이월금</span></td><td class="amt">' + won(closing) + ' 원</td></tr>' +
      '<tr class="cash"><td colspan="3">금주 수입 중&nbsp; 현금 <b>' + won(cashT) + '</b> 원 &nbsp;·&nbsp; 온라인 <b>' + won(onT) + '</b> 원</td></tr>' +
      '</tbody></table>' +
      '<div class="wk-fy">' + fy + '년도 누계(' + md(fyR.from) + ' ~ ' + md(cumTo) + '): 수입 ' + won(cumIn) + '원 · 지출 ' + won(cumEx) + '원<br>회계연도 시작 이월금 ' + won(fyCarry.value) + '원</div>';
    var memo = '<div class="wk-gap"></div><div class="wk-sub">특이사항</div><table class="wk-t wk-memo"><tbody><tr><td></td></tr><tr><td></td></tr><tr><td></td></tr></tbody></table>';
    var sign = '<div class="wk-gap"></div><div class="wk-sub">확인</div><table class="wk-t wk-sign"><thead><tr><th>작성자</th><th>재정부장</th><th>당회장</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr></tbody></table>';
    var html = page('재정보고서', '수입 · 요약', '<div class="wk-p1"><div>' + inTable + '</div><div>' + sumTable + memo + sign + '</div></div>');

    // ── 2쪽: 지출 (분류 소계 + 계정, 3단) ──
    var exTree = tree('지출', exSum), hiddenEx = 0, emptyGroups = [];
    var blocks = [];
    exTree.forEach(function (g) {
      var sub = g.items.reduce(function (s, it) { return s + (it.v || 0); }, 0);
      var items = g.items.filter(function (it) { if (showZero || it.v) return true; hiddenEx++; return false; });
      if (!showZero && !sub) { emptyGroups.push(g.name); return; }
      blocks.push({ name: g.name, sub: sub, items: items });
    });
    // 3단으로 나누기(순서 유지, 단 높이를 고르게)
    var sizes = blocks.map(function (b) { return 1 + b.items.length; }), total = sizes.reduce(function (a, b) { return a + b; }, 0);
    var cols = [[], [], []], cur = 0, acc = 0;
    blocks.forEach(function (b, i) { if (cur < 2 && acc + sizes[i] / 2 > total / 3 * (cur + 1)) cur++; cols[cur].push(b); acc += sizes[i]; });
    function exCol(list) {
      if (!list.length) return '<div></div>';
      var rows = list.map(function (b) {
        return '<tr><td class="g">' + esc(b.name) + '</td><td class="n g">' + w0(b.sub) + '</td></tr>' +
          b.items.map(function (it) { return '<tr><td class="it' + (it.v ? '' : ' z') + '">' + esc(it.name) + '</td><td class="n">' + w0(it.v) + '</td></tr>'; }).join('');
      }).join('');
      return '<table class="wk-t"><colgroup><col><col style="width:27mm"></colgroup><thead><tr><th>계정</th><th>금액</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    var exBody = blocks.length
      ? '<div class="wk-ex">' + cols.map(exCol).join('') + '</div>'
      : '<div class="wk-empty">이번 주 지출 전표가 없습니다.</div>';
    exBody += '<div class="wk-extot">지출 합계 <b>' + won(expT) + ' 원</b></div>';
    if (!showZero && (emptyGroups.length || hiddenEx)) exBody += '<div class="wk-omit">이번 주 0원인 계정은 접어 두었습니다' + (emptyGroups.length ? ' (지출 없는 분류: ' + emptyGroups.map(esc).join(', ') + ')' : '') + '. 모두 보려면 화면 위 「0원 계정도 보기」를 누르세요.</div>';
    html += page('재정보고서', '지출', exBody);

    // ── 3쪽~: 헌금 내역서 (항목별 이름·금액) ──
    var order = [];
    inTree.forEach(function (g) { g.items.forEach(function (it) { order.push(it.name); }); });
    var byAcc = {};
    incV.forEach(function (v) {
      var a = v['계정'] || '', nm = String(v['헌금자'] || '').trim() || '무명', key = v['매칭키'] || ('n:' + nm), amt = Number(v['금액']) || 0;
      var A = byAcc[a] = byAcc[a] || { list: [], idx: {} };
      if (A.idx[key] == null) { A.idx[key] = A.list.length; A.list.push({ name: nm, amt: 0 }); }
      A.list[A.idx[key]].amt += amt;
    });
    var lines = [];
    order.forEach(function (a) {
      var A = byAcc[a]; if (!A) return;
      var list = A.list.slice().sort(function (x, y) { return x.name.localeCompare(y.name, 'ko'); });
      lines.push({ h: true, name: a, amt: list.reduce(function (s, x) { return s + x.amt; }, 0), n: list.length });
      list.forEach(function (x) { lines.push({ name: x.name, amt: x.amt }); });
    });
    var ROWS = 31, PER = ROWS * 4, pages = [];
    for (var i = 0; i < lines.length; i += PER) pages.push(lines.slice(i, i + PER));
    if (!pages.length) pages.push([]);
    pages.forEach(function (pl, pi) {
      // 마지막 쪽은 4단 높이를 고르게
      var rowsHere = (pi === pages.length - 1) ? Math.max(1, Math.ceil(pl.length / 4)) : ROWS;
      var c4 = [0, 1, 2, 3].map(function (c) { return pl.slice(c * rowsHere, (c + 1) * rowsHere); });
      // 단 첫 줄이 이름이면 위 항목 이름을 다시 적어 준다(이어짐 표시)
      c4.forEach(function (col, ci) {
        if (!col.length || col[0].h) return;
        var start = pi * PER + ci * rowsHere;
        for (var k = start - 1; k >= 0; k--) if (lines[k].h) { col.unshift({ h: true, cont: true, name: lines[k].name }); break; }
      });
      var body = pl.length ? '<div class="wk-of">' + c4.map(function (col) {
        if (!col.length) return '<div></div>';
        return '<table class="wk-t"><colgroup><col><col style="width:24mm"></colgroup><thead><tr><th>이름</th><th>헌금액</th></tr></thead><tbody>' +
          col.map(function (x) {
            if (x.h) return '<tr><td class="oh" colspan="2">' + esc(x.name) + (x.cont ? ' (이어서)' : '<span>' + x.n + '명 · ' + won(x.amt) + '</span>') + '</td></tr>';
            return '<tr><td class="nm">' + esc(x.name) + '</td><td class="n">' + won(x.amt) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }).join('') + '</div>' : '<div class="wk-empty">이번 주 헌금 전표가 없습니다.</div>';
      html += page('헌금 내역서', '헌금 내역' + (pages.length > 1 ? ' ' + (pi + 1) : ''), body);
    });

    var note = '기간 ' + year + '.' + period + ' · 전표 수입 ' + incV.length + '건, 지출 ' + expV.length + '건. ' +
      '전주 이월금은 ' + fy + '년도 시작 이월금 <b>' + won(fyCarry.value) + '원</b>' + (fyCarry.auto ? '(앞 회계연도 장부로 자동 계산)' : '') +
      '에 ' + md(fyR.from) + '부터 이번 주 직전까지의 수입·지출을 더하고 빼서 자동으로 계산합니다. ' +
      '보고서는 가로 A4 ' + pageNo + '쪽, 청원서(지출결의서)는 세로 A4입니다. 「일괄 출력」은 보고서·청원서·영수증을 한 번에 인쇄합니다.';
    return { html: html, note: note, exTree: exTree };
  }

  // =====================================================================
  //  정기 청구(정기 지출 + 할부) — app_settings.recurring_claims (JSON)
  //  week: 0 = 매주, 1~5 = 그 달의 몇째 주일. kind: '정기' | '할부' | '선교'(전주 선교헌금 전액)
  //  할부: start = 1회차 연월(YYYY-MM), total = 총 회차(없으면 적립처럼 회차만 센다). 마지막 회차 다음 달부터 저절로 빠진다.
  //  bonusMonths·bonusAmount: 그 달에는 다른 금액(예: 목사 사례비 12·3·6·9월 4,000,000)
  //  지출내역의 {월} 은 그 달 숫자로, {전주} 는 지난주 이름(예: 11월 3주)으로 바뀐다.
  //  금액 기본값은 2026 청원서(52주) 그대로, 관·항은 홈페이지 예산·계정 표(budget)의 계정 이름으로 이었다.
  // =====================================================================
  var DEFAULT_CLAIMS = [
    { kind: '선교', week: 0, gwan: '기관보조', hang: '구제선교위원회', text: '구제선교위원회 {전주} 선교헌금', amount: 0, note: '구제선교위원회' },
    { kind: '정기', week: 1, gwan: '목회비', hang: '목사사례비', text: '목사 사례비', amount: 2000000, note: '담임목사', bonusMonths: '12,3,6,9', bonusAmount: 4000000 },
    { kind: '정기', week: 1, gwan: '목회비', hang: '도서비', text: '도서비', amount: 150000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '목회비', hang: '은급비', text: '은급비', amount: 120300, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '목회비', hang: '목회운영비', text: '목회활동비', amount: 150000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '목회비', hang: '대외사역비', text: '대외사역비', amount: 100000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '공과금', hang: '의료보험', text: '의료보험', amount: 200000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '공과금', hang: '통신 및 인터넷 요금', text: '통신비', amount: 100000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '관리비', hang: '차량유지비', text: '차량유지비', amount: 100000, note: '담임목사' },
    { kind: '정기', week: 1, gwan: '교육비', hang: '목회자 자녀 교육비', text: '자녀교육비', amount: 600000, note: '담임목사' },
    { kind: '정기', week: 2, gwan: '목회비', hang: '원로목사', text: '원로목사 사례비', amount: 2500000, note: '원로목사' },
    { kind: '정기', week: 2, gwan: '관리비', hang: '차량유지비', text: '원로목사 차량유지비', amount: 300000, note: '원로목사' },
    { kind: '정기', week: 2, gwan: '공과금', hang: '통신 및 인터넷 요금', text: '통신비', amount: 100000, note: '원로목사' },
    { kind: '정기', week: 3, gwan: '기관보조', hang: '유초등부', text: '유년부 활동비', amount: 200000, note: '주일학교부장' },
    { kind: '정기', week: 3, gwan: '기관보조', hang: '중고등부', text: '중고등부 활동비', amount: 100000, note: '한만형' },
    { kind: '정기', week: 3, gwan: '교제 친교비', hang: '주일 식사비', text: '주일 식사비 지원', amount: 100000, note: '신은주 사모' },
    { kind: '할부', week: 3, gwan: '관리비', hang: '자동차할부', text: '스타리아 할부', amount: 583994, note: '담임목사', start: '2023-12', total: 60 },
    { kind: '할부', week: 3, gwan: '관리비', hang: '자동차할부', text: '아이오닉5 할부', amount: 400000, note: '담임목사', start: '2025-12', total: 60 },
    { kind: '할부', week: 3, gwan: '시설관리비', hang: '설비 교체 적립금', text: '설비 교체 적립금', amount: 100000, note: '담임목사', start: '2025-12', total: null },
    { kind: '정기', week: 3, gwan: '교육비', hang: '주일학교 교재 및 QT교재비', text: '{월}월 주일학교 교재', amount: 55000, note: '계좌이체' },
    { kind: '할부', week: 3, gwan: '관리비', hang: '대출상환금', text: '대출금 상환', amount: 1000000, note: '원로목사', start: '2023-11', total: 30 },
    { kind: '정기', week: 4, gwan: '목회비', hang: '은급비', text: '은급비', amount: 79700, note: '계좌이체' },
    { kind: '정기', week: 4, gwan: '상회비', hang: '노회비', text: '노회 상납금', amount: 300000, note: '담임목사' },
    { kind: '정기', week: 4, gwan: '대외협력비', hang: '삼괴지역기독교연합회', text: '삼기연 회비', amount: 20000, note: '담임목사' },
    { kind: '할부', week: 4, gwan: '시설관리비', hang: '수리 및 공사비', text: '전기차 충전 설비 설치', amount: 188350, note: '담임목사', start: '2025-12', total: 12 },
    { kind: '정기', week: 4, gwan: '사무 관리비', hang: '프로그램 및 IT 서비스 사용 비용', text: '구글 One drive 구독료', amount: 29600, note: '담임목사' }
  ];
  // 2026-11-24 담임목사: "정기등록은 매월 몇째 주 등록되고, 한 회기 동안 운영된다. 할부는 회기와 무관하게 할부 개월 수만큼
  //   계속 청원된다. 정기등록은 다음 회기가 되면, 삭제하지 않는 한, 이월한다는 선택과 함께 이월되도록."
  //   → 정기 지출(정기 · 선교)은 fy(회기)를 가진다. 그 회기의 주에만 들어간다. 다음 회기로는 「정기 지출 이월」로 옮긴다.
  //     할부는 fy 가 없고 1회차 연월 ~ 총 회차까지 이어진다.
  //   fy 가 없는 예전 줄 · 기본값은 2026 청원서에서 가져온 것이므로 2026년도 정기 지출로 본다.
  var LEGACY_FY = 2026;
  function isReg(c) { return c.kind !== '할부'; }
  function withFy(list) { list.forEach(function (c) { if (isReg(c) && !c.fy) c.fy = LEGACY_FY; }); return list; }
  function defaultClaims(fy) {
    return DEFAULT_CLAIMS.map(function (c, i) { var o = JSON.parse(JSON.stringify(c)); o.id = 'd' + (i + 1); o.on = true; if (isReg(o)) o.fy = fy || LEGACY_FY; return o; });
  }
  function getClaims(X) {
    var raw = (X.M.settings || {}).recurring_claims;
    if (raw) { try { var a = JSON.parse(raw); if (Array.isArray(a)) return withFy(a); } catch (e) { /* 아래 기본값 */ } }
    return defaultClaims();
  }
  function claimsSaved(X) { return !!(X.M.settings || {}).recurring_claims; }
  function ymIndex(ym) { var p = String(ym || '').split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; }
  function instNo(c, ym) { return c.start ? ymIndex(ym) - ymIndex(c.start) + 1 : null; }
  // 그 달 이 청구의 상태: { active, no, label }
  function claimState(c, ym) {
    if (c.kind !== '할부') return { active: c.on !== false, no: null, label: '' };
    var n = instNo(c, ym), tot = Number(c.total) || 0;
    if (n == null || n < 1) return { active: false, no: n, label: '시작 전' };
    if (tot && n > tot) return { active: false, no: n, label: '끝남' };
    return { active: c.on !== false, no: n, label: n + (tot ? '/' + tot : '') + '회차' };
  }
  function weekNo(sun) { return Math.floor((dt(sun).getDate() - 1) / 7) + 1; }
  function ymOf(sun) { return sun.slice(0, 7); }
  function incomeSum(X, accRe, from, to) {
    var t = 0;
    (X.M.vouchers || []).forEach(function (v) { var d = X.fmtD(v['일자']); if (String(v['구분']) === '수입' && d >= from && d <= to && accRe.test(v['계정'] || '')) t += Number(v['금액']) || 0; });
    return t;
  }
  // 그 주의 정기 청구 줄
  function autoRows(X, sun) {
    var ym = ymOf(sun), wn = weekNo(sun), mon = Number(ym.slice(5, 7)), out = [];
    getClaims(X).forEach(function (c) {
      if (c.on === false) return;
      if (isReg(c) && Number(c.fy) !== Number(X.fy())) return;   // 정기 지출은 그 회기에만
      if (Number(c.week) !== 0 && Number(c.week) !== wn) return;
      var st = claimState(c, ym); if (!st.active) return;
      var text = String(c.text || ''), amt = Number(c.amount) || 0;
      if (c.kind === '선교') {
        var ps = addDays(sun, -7);
        text = text.replace('{전주}', weekName(ps));
        amt = incomeSum(X, /선교헌금/, ps, addDays(ps, 6));   // 지난주 선교헌금 전액(0원이어도 줄은 남긴다)
      }
      if (c.bonusMonths && String(c.bonusMonths).split(/[,\s]+/).map(Number).indexOf(mon) >= 0 && Number(c.bonusAmount)) amt = Number(c.bonusAmount);
      text = text.replace('{월}', mon);
      if (c.kind === '할부') text += ' (' + st.no + (Number(c.total) ? '/' + c.total : '') + ')';
      out.push({ gwan: c.gwan || '', hang: c.hang || '', text: text, amount: amt, note: c.note || '', src: 'c:' + (c.id || '') });
    });
    return out;
  }
  // 이 주 결의서 줄: 화면에서 고친 것 → 저장한 것 → 정기 청구 자동. 확인된 온라인 청원은 언제나 뒤에 붙는다.
  function draftRows(X, sun) {
    if (state.pet[sun]) return state.pet[sun];
    var raw = (X.M.settings || {})['petition_' + sun];
    if (raw) { try { var o = JSON.parse(raw); if (o && Array.isArray(o.rows)) return (state.pet[sun] = o.rows); } catch (e) { /* 자동으로 */ } }
    return (state.pet[sun] = autoRows(X, sun));
  }
  function petRows(X, online) {
    var rows = draftRows(X, state.sunday).slice();
    (online.approved || []).forEach(function (p) {
      rows.push({ gwan: p.gwan || '', hang: p.hang || '', text: p.item || '', amount: Number(p.amount) || 0,
        note: (p.dept ? p.dept + ' ' : '') + (p.requester_name || ''), src: 'o:' + p.id, receipts: p.receipts || [], dept: p.dept,
        pay: p.pay_account ? (p.pay_bank + ' ' + p.pay_account + ' (예금주 ' + p.pay_holder + ')') : '' });
    });
    return rows;
  }
  // 온라인 청원 읽기(표가 아직 없으면 빈 목록)
  function loadOnline(X, sun) {
    if (!X.call) return Promise.resolve({ approved: [], pending: [] });
    return X.call('listPetitions', { sunday: sun }).then(function (r) {
      var all = r.rows || [];
      return {
        approved: all.filter(function (p) { return p.status === 'approved' && p.week_sunday === sun; }),
        pending: all.filter(function (p) { return p.status === 'submitted'; }),
        week: all.filter(function (p) { return p.week_sunday === sun && p.status !== 'cancelled'; }),
        // 다른 주 결의서로 간 청원 중 아직 끝나지 않은 것(확인 대기 · 확인됨-지급 전) — 4주 · 5주 상관없이 금주 청구 내역에 보인다
        open: all.filter(function (p) { return p.week_sunday !== sun && (p.status === 'submitted' || (p.status === 'approved' && !p.paid_at)); })
      };
    }).catch(function () { return { approved: [], pending: [], missing: true }; });
  }

  // ── 예산 집행률: (회계연도 시작 ~ 이 주 전날 장부 지출 + 이 결의서 금액) ÷ 연 예산 ──
  // 같은 이름의 항이 여러 관에 있을 수 있다(예: 목회비·휴가비의 '원로목사') → 관이 맞는 줄을 먼저 고른다
  function budgetOf(X, hang, gwan) {
    var B = X.M.budget || [], gname = {};
    B.forEach(function (r) { var c = String(r['계정코드'] || ''); if (c.slice(-4) === '0000') gname[c.slice(0, 3)] = r['계정이름']; });
    var hits = B.filter(function (r) { return String(r['구분']) === '지출' && r['계정이름'] === hang && String(r['계정코드'] || '').slice(-4) !== '0000'; });
    var b = (gwan && hits.filter(function (r) { return gname[String(r['계정코드']).slice(0, 3)] === gwan; })[0]) || hits[0];
    return b ? (Number(b['예산']) || 0) : null;
  }
  function spentBefore(X, fyR, hang, before) {
    var t = 0;
    (X.M.vouchers || []).forEach(function (v) { var d = X.fmtD(v['일자']); if (String(v['구분']) !== '수입' && v['계정'] === hang && d >= fyR.from && d < before) t += Number(v['금액']) || 0; });
    return t;
  }
  function rates(X, fyR, rows) {
    var from = state.sunday, by = {};
    rows.forEach(function (r) {
      if (!r.hang) return;
      var o = by[r.hang] = by[r.hang] || { budget: budgetOf(X, r.hang, r.gwan), spent: spentBefore(X, fyR, r.hang, from), pet: 0 };
      o.pet += Number(r.amount) || 0;
    });
    Object.keys(by).forEach(function (k) { var o = by[k]; o.rate = o.budget ? (o.spent + o.pet) / o.budget * 100 : null; });
    return by;
  }
  function pct(v) { return v == null ? '—' : (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%'; }

  // ── 예산 계정 목록(관 → 항) ──
  function expenseTree(X) {
    var all = (X.M.budget || []).filter(function (b) { return String(b['구분']) === '지출'; });
    var gs = all.filter(function (b) { return String(b['계정코드']).slice(-4) === '0000'; }).sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); });
    return gs.map(function (g) {
      var p = String(g['계정코드']).slice(0, 3);
      return { name: g['계정이름'], items: all.filter(function (b) { var c = String(b['계정코드']); return c.slice(0, 3) === p && c.slice(-4) !== '0000'; }).sort(function (a, b) { return String(a['계정코드']).localeCompare(String(b['계정코드'])); }).map(function (b) { return b['계정이름']; }) };
    });
  }
  function datalists(X, esc) {
    var tr = expenseTree(X), allH = [];
    var h = '<datalist id="wkGwanList">' + tr.map(function (g) { return '<option value="' + esc(g.name) + '">'; }).join('') + '</datalist>';
    tr.forEach(function (g, i) { h += '<datalist id="wkH' + i + '">' + g.items.map(function (n) { allH.push(n); return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; });
    h += '<datalist id="wkHall">' + allH.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
    return { html: h, tree: tr };
  }
  function hangListId(tree, gwan) { for (var i = 0; i < tree.length; i++) if (tree[i].name === gwan) return 'wkH' + i; return 'wkHall'; }
  function gwanOf(tree, hang) { for (var i = 0; i < tree.length; i++) if (tree[i].items.indexOf(hang) >= 0) return tree[i].name; return ''; }

  // ── 결의서 작성 화면 ──
  function editor(box, X, fyR, online, preview, reload) {
    var won = X.won, esc = X.esc, sun = state.sunday;
    var rows = draftRows(X, sun), dl = datalists(X, esc);
    var savedRaw = (X.M.settings || {})['petition_' + sun], savedAt = '';
    try { savedAt = savedRaw ? (JSON.parse(savedRaw).at || '') : ''; } catch (e) { savedAt = ''; }
    function rowHTML(r, i) {
      var ro = String(r.src || '').indexOf('o:') === 0;
      if (ro) return '';
      return '<tr data-i="' + i + '">' +
        '<td><input data-k="gwan" list="wkGwanList" value="' + esc(r.gwan) + '"></td>' +
        '<td><input data-k="hang" list="' + hangListId(dl.tree, r.gwan) + '" value="' + esc(r.hang) + '"></td>' +
        '<td><input data-k="text" value="' + esc(r.text) + '"></td>' +
        '<td><input data-k="amount" class="n" inputmode="numeric" value="' + (r.amount ? won(r.amount) : '') + '"></td>' +
        '<td><input data-k="note" value="' + esc(r.note) + '"></td>' +
        '<td class="rate" data-h="' + esc(r.hang) + '"></td>' +
        '<td><button class="wk-x" data-del="' + i + '" title="이 줄 지우기">✕</button></td></tr>';
    }
    var onl = (online.approved || []).map(function (p) {
      return '<tr class="onl"><td>' + esc(p.gwan || '') + '</td><td>' + esc(p.hang || '') + '</td><td>' + esc(p.item || '') + ' <span class="tag">온라인 청원 · ' + esc(p.dept || '') + '</span>' + (p.paid_at ? ' <span class="tag">지급 완료</span>' : '') + rcpLinks(p, esc) + payLine(p, esc) + '</td><td class="n">' + won(p.amount) + '</td><td>' + esc(p.requester_name || '') + '</td><td class="rate" data-h="' + esc(p.hang || '') + '"></td><td><button class="wk-x" data-back="' + p.id + '" title="확인 취소(다시 대기로)">↺</button></td></tr>';
    }).join('');
    var pend = (online.pending || []).map(function (p) {
      return '<div class="wk-pend"><div><b>' + esc(p.dept || '') + '</b> · ' + esc(p.requester_name || '') + ' · ' + esc(p.hang || '') + ' · ' + esc(p.item || '') + ' · <b>' + won(p.amount) + '원</b>' +
        ' <span class="tag">' + esc(weekName(p.week_sunday)) + ' 결의서로</span>' + rcpLinks(p, esc) + payLine(p, esc) + (p.memo ? '<div class="memo">' + esc(p.memo) + '</div>' : '') + '</div>' +
        '<div><button class="btn btn-solid" data-ok="' + p.id + '">확인</button> <button class="btn btn-line" data-no="' + p.id + '">돌려보냄</button></div></div>';
    }).join('');
    var fyNow = Number(X.fy()), hasReg = getClaims(X).some(function (c) { return isReg(c) && Number(c.fy) === fyNow; });
    box.innerHTML = dl.html +
      (hasReg ? '' : '<div class="wk-pends">' + fyNow + '년도 정기 지출이 아직 없습니다. 지난 회기의 정기 지출을 이월하거나 새로 등록하세요. <button class="btn btn-line" data-goto="regular" style="padding:3px 10px;font-size:.8rem;margin-left:6px">정기 지출 등록 · 이월</button></div>') +
      '<div class="fin-card wk-pe"><div class="wk-pe-h"><b>지출결의서 작성 · ' + dt(sun).getFullYear() + '년 ' + weekName(sun) + '</b>' +
      '<span class="wk-st">' + (savedAt ? '저장됨 ' + esc(savedAt) : '정기 청구로 채운 상태 — 고치면 저절로 저장됩니다') + '</span></div>' +
      (pend ? '<div class="wk-pends"><b>확인 기다리는 청원 ' + online.pending.length + '건</b> — 확인하면 그 주 결의서에 들어갑니다. <button class="btn btn-line" data-goto="claims" style="padding:3px 10px;font-size:.8rem;margin-left:6px">금주 청구 내역에서 보기</button></div>' : '') +
      (online.missing ? '<p class="wk-note">온라인 청원 표가 아직 없습니다(데이터베이스 준비 전). 정기 청구와 직접 적은 줄만 나옵니다.</p>' : '') +
      '<div style="overflow:auto"><table class="fin-table wk-pet-ed"><thead><tr><th style="width:120px">관</th><th style="width:170px">항(예산 계정)</th><th>지출내역</th><th style="width:110px" class="num">금액</th><th style="width:120px">비고</th><th style="width:150px">예산 집행률</th><th style="width:34px"></th></tr></thead><tbody>' +
      rows.map(rowHTML).join('') + onl + '</tbody><tfoot><tr><td colspan="3" style="text-align:right"><b>합계</b></td><td class="num"><b id="wkPetSum"></b></td><td colspan="3"></td></tr></tfoot></table></div>' +
      '<div class="wk-pe-b"><button class="btn btn-line" id="wkAdd">+ 줄 더하기</button><button class="btn btn-line" id="wkRefill">정기 청구로 다시 채우기</button>' +
      (chairSeal(X) ? '' : '<span class="wk-note" style="margin:0;color:#C62828">당회장 도장 그림이 아직 없습니다 — 재정관리 ▸ 설정 ▸ 「당회장 도장」에서 올려 주세요.</span>') +
      '<span class="wk-note" style="margin:0">관·항은 2027 예산 계정에서 고릅니다. 집행률 = (회계연도 장부 지출 + 이 결의서) ÷ 연 예산. 고친 내용은 저절로 저장됩니다.</span></div></div>';

    function refreshRates() {
      var all = petRows(X, online), rt = rates(X, fyR, all), sum = 0;
      all.forEach(function (r) { sum += Number(r.amount) || 0; });
      box.querySelector('#wkPetSum').textContent = won(sum);
      Array.prototype.forEach.call(box.querySelectorAll('td.rate'), function (td) {
        var o = rt[td.getAttribute('data-h')];
        if (!td.getAttribute('data-h')) { td.innerHTML = ''; return; }
        if (!o || o.budget == null) { td.innerHTML = '<span class="wk-rt none">예산 없음</span>'; return; }
        var w = Math.min(100, o.rate || 0);
        td.innerHTML = '<span class="wk-rt' + (o.rate > 100 ? ' over' : '') + '"><i style="width:' + w + '%"></i><b>' + pct(o.rate) + '</b></span><small>' + won(o.spent + o.pet) + ' / ' + won(o.budget) + '</small>';
      });
    }
    // 고치면 잠시 뒤 저절로 저장한다(저장 단추 없음). 같은 box 를 다시 그려도 이벤트는 한 번만 붙인다.
    var ctx = box._wk = { rows: rows, sun: sun, X: X, dl: dl, refreshRates: refreshRates, preview: preview,
      rerender: function () { editor(box, X, fyR, online, preview, reload); }, reload: reload };
    if (!box._wkBound) {
      box._wkBound = true;
      box.addEventListener('input', function (e) {
        var c = box._wk, inp = e.target, tr = inp.closest && inp.closest('tr[data-i]'); if (!tr) return;
        var r = c.rows[Number(tr.getAttribute('data-i'))], k = inp.getAttribute('data-k'); if (!r || !k) return;
        if (k === 'amount') { r.amount = Number(String(inp.value).replace(/[^\d-]/g, '')) || 0; }
        else r[k] = inp.value;
        if (k === 'gwan') tr.querySelector('[data-k=hang]').setAttribute('list', hangListId(c.dl.tree, r.gwan));
        if (k === 'hang') {
          tr.querySelector('td.rate').setAttribute('data-h', r.hang);
          if (!r.gwan) { var g = gwanOf(c.dl.tree, r.hang); if (g) { r.gwan = g; tr.querySelector('[data-k=gwan]').value = g; } }
        }
        c.refreshRates(); clearTimeout(box._wkPv); box._wkPv = setTimeout(c.preview, 250);
        autoSave(box, 800);
      });
      box.addEventListener('focusout', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-k') === 'amount') { var v = Number(String(e.target.value).replace(/[^\d-]/g, '')) || 0; e.target.value = v ? box._wk.X.won(v) : ''; } });
      box.addEventListener('click', function (e) {
        var c = box._wk, t = e.target;
        if (t.getAttribute('data-del') != null) { c.rows.splice(Number(t.getAttribute('data-del')), 1); autoSave(box, 0); c.rerender(); c.preview(); }
        else if (t.getAttribute('data-ok')) review(t.getAttribute('data-ok'), 'approved');
        else if (t.getAttribute('data-no')) { var why = prompt('돌려보내는 까닭을 적어 주세요(부장에게 보입니다).', ''); if (why != null) review(t.getAttribute('data-no'), 'rejected', why); }
        else if (t.getAttribute('data-back')) review(t.getAttribute('data-back'), 'submitted');
        function review(id, status, why) {
          flushSave(box);
          c.X.call('reviewPetition', { id: id, status: status, note: why || '' }).then(c.reload).catch(function (er) { alert('바꾸지 못했습니다: ' + er.message); });
        }
      });
      window.addEventListener('pagehide', function () { flushSave(box); });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(box); });
    }
    box.querySelector('#wkAdd').onclick = function () { rows.push({ gwan: '', hang: '', text: '', amount: 0, note: '', src: 'm' }); autoSave(box, 0); ctx.rerender(); var ins = box.querySelectorAll('tr[data-i] [data-k=gwan]'); if (ins.length) ins[ins.length - 1].focus(); };
    box.querySelector('#wkRefill').onclick = function () {
      if (!confirm('이 주 결의서를 정기 청구 목록으로 다시 채울까요? 직접 적은 줄은 남깁니다.')) return;
      var keep = rows.filter(function (r) { return r.src === 'm'; });
      state.pet[sun] = autoRows(X, sun).concat(keep);
      ctx.rerender(); autoSave(box, 0); preview();
    };
    refreshRates();
  }
  // ── 결의서 자동 저장 ──
  function autoSave(box, ms) {
    var c = box._wk; if (!c) return;
    box._wkDirty = { sun: c.sun, rows: c.rows, X: c.X };
    var st = box.querySelector('.wk-st'); if (st) st.textContent = '저장 중…';
    clearTimeout(box._wkSv); box._wkSv = setTimeout(function () { flushSave(box); }, ms);
  }
  function flushSave(box) {
    clearTimeout(box._wkSv);
    var d = box._wkDirty; if (!d) return; box._wkDirty = null;
    var at = d.X.today() + ' ' + new Date().toTimeString().slice(0, 5);
    d.X.save('petition_' + d.sun, JSON.stringify({ rows: d.rows, at: at })).then(function () {
      var st = box.querySelector('.wk-st'); if (st && box._wk && box._wk.sun === d.sun && !box._wkDirty) st.textContent = '저장됨 ' + at;
    }).catch(function (er) {
      var st = box.querySelector('.wk-st'); if (st) st.textContent = '저장하지 못했습니다 — 다시 고치면 다시 저장합니다';
      alert('지출결의서를 저장하지 못했습니다: ' + er.message);
    });
  }
  // 당회장 도장: 재정관리 ▸ 설정 ▸ 「당회장 도장」(app_settings.rcp_img_chair). 지출결의서 결재란 당회장 칸에 찍는다.
  function chairSeal(X) { return (X.M.settings || {}).rcp_img_chair || ''; }
  function payLine(p, esc) {
    return p.pay_account ? '<div class="memo" style="font-size:.78rem;color:#565552">받는 계좌: ' + esc(p.pay_bank) + ' ' + esc(p.pay_account) + ' (예금주 ' + esc(p.pay_holder) + ')</div>' : '';
  }
  function rcpLinks(p, esc) {
    var r = p.receipts || [];
    return r.length ? ' ' + r.map(function (u, i) { return '<a class="tag rcp" href="' + esc(u) + '" target="_blank" rel="noopener">영수증' + (r.length > 1 ? ' ' + (i + 1) : '') + '</a>'; }).join(' ') : '';
  }

  // ── 지출결의서 인쇄 쪽(세로 A4) ──
  function petitionPages(X, fyR, rows) {
    var won = X.won, esc = X.esc, sun = state.sunday, sd = dt(sun);
    var rt = rates(X, fyR, rows), total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    var pays = rows.filter(function (r) { return r.pay; });
    var PROWS = Math.max(12, 22 - pays.length), pages = Math.max(1, Math.ceil(rows.length / PROWS)), html = '';
    for (var pp = 0; pp < pages; pp++) {
      var chunk = rows.slice(pp * PROWS, (pp + 1) * PROWS), last = pp === pages - 1, trs = '';
      for (var r = 0; r < PROWS; r++) {
        var v = chunk[r];
        if (v) {
          var o = rt[v.hang];
          trs += '<tr><td>' + esc(v.gwan) + '</td><td>' + esc(v.hang) + '</td><td>' + esc(v.text) + (v.receipts && v.receipts.length ? ' <span class="att">[영수증]</span>' : '') +
            '</td><td class="n">' + (v.amount ? won(v.amount) : '') + '</td><td class="n rt' + (o && o.rate > 100 ? ' over' : '') + '">' + (o && o.budget != null ? pct(o.rate) : '') + '</td><td>' + esc(v.note) + '</td></tr>';
        } else trs += '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
      }
      var pageSum = chunk.reduce(function (s, v) { return s + (Number(v.amount) || 0); }, 0);
      html += '<div class="wk-page wk-pet">' +
        '<div class="ph"><div><div class="org"><img src="' + LOGO + '" alt="운평장로교회 로고">운평장로교회 재정부</div>' +
        '<h1>지출결의서</h1><div class="wk">' + sd.getFullYear() + '년 ' + weekName(sun) + (pages > 1 ? ' (' + (pp + 1) + '/' + pages + ')' : '') + '</div></div>' +
        '<table class="ap"><tr><td class="k" rowspan="2">결<br>재</td><td>담당</td><td>기관장</td><td>재정부장</td><td>당회장</td></tr><tr><td></td><td></td><td></td><td>' + (chairSeal(X) ? '<img class="seal" src="' + esc(chairSeal(X)) + '" alt="당회장 도장">' : '') + '</td></tr></table></div>' +
        '<table class="wk-t"><colgroup><col style="width:21mm"><col style="width:34mm"><col><col style="width:22mm"><col style="width:14mm"><col style="width:31mm"></colgroup>' +
        '<thead><tr><th>관</th><th>항</th><th>지출내역</th><th>금액</th><th>집행률</th><th>비고</th></tr></thead><tbody>' + trs +
        // 2026-11-24 담임목사: 목록의 합계는 적는다(목록 금액을 쉽게 파악). 아래 「합 계 금」만 비워 둔다(수기로 더 적을 수 있게).
        '<tr class="tot"><td colspan="3" style="text-align:center">' + (pages > 1 ? '이 쪽 소계' : '합 계') + '</td><td class="n">' + won(pageSum) + '</td><td></td><td></td></tr></tbody></table>' +
        (last && pays.length ? '<div class="pays"><b>지급 계좌</b>' + pays.map(function (r) { return '<div><span>' + esc(r.hang) + ' · ' + esc(r.text) + ' · ' + won(r.amount) + '원</span><span>' + esc(r.pay) + '</span></div>'; }).join('') + '</div>' : '') +
        (last ? '<div class="sumline">합 계 금 <b>&nbsp;</b> 원</div>' +
          '<div class="rtnote">집행률: 2027 예산 계정의 연 예산 대비 (회계연도 장부 지출 + 이 결의서) 비율</div>' +
          '<div class="plea">위와 같이 재정을 청원하나이다.<br>주후 ' + sd.getFullYear() + '년 ' + (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일<div class="to">운평장로교회 당회장 귀하</div></div>' : '') +
        '<div class="wk-foot">운평장로교회 재정부 · 청원서' + (pages > 1 ? ' <b>' + (pp + 1) + '</b>' : '') + '</div></div>';
    }
    return html;
  }
  // ── 영수증 첨부 쪽(세로 A4, 한 쪽에 2장) ──
  function receiptPages(X, rows) {
    var won = X.won, esc = X.esc, items = [];
    rows.forEach(function (r) { (r.receipts || []).forEach(function (u) { items.push({ u: u, r: r }); }); });
    var html = '';
    for (var i = 0; i < items.length; i += 2) {
      html += '<div class="wk-page wk-pet wk-rcp"><div class="rh">지출결의서 영수증 첨부 · ' + dt(state.sunday).getFullYear() + '년 ' + weekName(state.sunday) + '</div>' +
        items.slice(i, i + 2).map(function (it) {
          var isPdf = /\.pdf(\?|$)/i.test(it.u);
          return '<div class="rb"><div class="cap">' + esc(it.r.dept || '') + ' · ' + esc(it.r.hang) + ' · ' + esc(it.r.text) + ' · <b>' + won(it.r.amount) + '원</b>' + (it.r.pay ? '<br>받는 계좌: ' + esc(it.r.pay) : '') + '</div>' +
            (isPdf ? '<div class="pdf">PDF 영수증: ' + esc(it.u) + '</div>' : '<img src="' + esc(it.u) + '" alt="영수증">') + '</div>';
        }).join('') + '<div class="wk-foot">운평장로교회 재정부 · 영수증 첨부</div></div>';
    }
    return html;
  }

  // =====================================================================
  //  「정기 청구」 관리 화면 (예산·계정 ▸ 정기 청구)
  // =====================================================================
  // mode: 'regular' = 정기 지출 등록, 'inst' = 할부 등록 (지출결의서 왼쪽 메뉴), 없으면 모두
  function renderRecurring(panel, X, mode) {
    var FY = Number(X.fy());
    function shown(c) { return mode === 'inst' ? c.kind === '할부' : (mode === 'regular' ? (isReg(c) && Number(c.fy) === FY) : true); }
    injectCSS();
    var won = X.won, esc = X.esc;
    panel.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    X.load().then(function () {
      var list = getClaims(X).map(function (c) { return JSON.parse(JSON.stringify(c)); });
      var dl = datalists(X, esc), fyR = X.fyRange(X.fy());
      var curYm = X.today().slice(0, 7);
      function months() { var a = [], i0 = ymIndex(fyR.from.slice(0, 7)); for (var k = 0; k < 12; k++) { var j = i0 + k; a.push(Math.floor(j / 12) + '-' + pad2(j % 12 + 1)); } return a; }
      // 회계연도 동안 이 청구가 나가는 금액(예상)
      function yearly(c) {
        if (c.on === false || c.kind === '선교') return 0;
        var t = 0;
        months().forEach(function (ym) {
          var st = claimState(c, ym); if (!st.active) return;
          var n = 1;
          if (Number(c.week) === 5) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)), d1 = new Date(y, m - 1, 1).getDay(), firstSun = 1 + (7 - d1) % 7; n = firstSun + 28 <= new Date(y, m, 0).getDate() ? 1 : 0; }
          var amt = Number(c.amount) || 0, mon = Number(ym.slice(5, 7));
          if (c.bonusMonths && String(c.bonusMonths).split(/[,\s]+/).map(Number).indexOf(mon) >= 0 && Number(c.bonusAmount)) amt = Number(c.bonusAmount);
          t += amt * n;
        });
        return t;
      }
      function rowHTML(c, i) {
        var st = claimState(c, curYm), wk = '<select data-k="week">' + [0, 1, 2, 3, 4, 5].map(function (w) { return '<option value="' + w + '"' + (Number(c.week) === w ? ' selected' : '') + '>' + (w ? w + '주' : '매주') + '</option>'; }).join('') + '</select>';
        var inst = c.kind === '할부'
          ? '<input data-k="start" type="month" value="' + esc(c.start || '') + '" title="1회차 연월"> <input data-k="total" class="sm" inputmode="numeric" value="' + esc(c.total == null ? '' : c.total) + '" placeholder="총" title="총 회차(비우면 회차만 셈)"><div class="st' + (st.label === '끝남' ? ' end' : '') + '">' + esc(st.label || '') + '</div>'
          : (c.kind === '선교' ? '<div class="st">지난주 선교헌금 전액</div>' : '<input data-k="bonusMonths" class="md" value="' + esc(c.bonusMonths || '') + '" placeholder="다른 금액 달 예: 12,3,6,9"> <input data-k="bonusAmount" class="md" inputmode="numeric" value="' + (c.bonusAmount ? won(c.bonusAmount) : '') + '" placeholder="그 달 금액">');
        return '<tr data-i="' + i + '"' + (c.on === false || st.label === '끝남' ? ' class="off"' : '') + '><td><input type="checkbox" data-k="on"' + (c.on !== false ? ' checked' : '') + '></td><td>' + esc(c.kind) + '</td><td>' + wk + '</td>' +
          '<td><input data-k="gwan" list="wkGwanList" value="' + esc(c.gwan) + '"></td><td><input data-k="hang" list="' + hangListId(dl.tree, c.gwan) + '" value="' + esc(c.hang) + '"></td>' +
          '<td><input data-k="text" value="' + esc(c.text) + '"></td><td><input data-k="amount" class="n" inputmode="numeric" value="' + (c.kind === '선교' ? '' : won(c.amount)) + '"' + (c.kind === '선교' ? ' disabled placeholder="자동"' : '') + '></td>' +
          '<td><input data-k="note" value="' + esc(c.note) + '"></td><td>' + inst + '</td><td><button class="wk-x" data-del="' + i + '">✕</button></td></tr>';
      }
      function compare() {
        var by = {};
        list.forEach(function (c) { if (!c.hang || c.kind === '선교' || !shown(c)) return; var o = by[c.hang] = by[c.hang] || { gwan: c.gwan, plan: 0 }; o.plan += yearly(c); });
        var rows = Object.keys(by).map(function (h) {
          var o = by[h], b = budgetOf(X, h, o.gwan), sp = spentBefore(X, fyR, h, addDays(X.today(), 1)), diff = b == null ? null : b - o.plan;
          var flag = b == null ? '<span class="bad">예산 계정 없음</span>' : (o.plan > b ? '<span class="bad">예산보다 ' + won(o.plan - b) + '원 많음</span>' : (diff > 0 ? '남는 예산 ' + won(diff) + '원(그때그때 지출용)' : '예산과 같음'));
          return '<tr><td>' + esc(o.gwan) + '</td><td>' + esc(h) + '</td><td class="num">' + won(o.plan) + '</td><td class="num">' + (b == null ? '—' : won(b)) + '</td><td>' + flag + '</td><td class="num">' + won(sp) + '</td><td class="num">' + (b ? pct(sp / b * 100) : '—') + '</td></tr>';
        }).join('');
        return '<div class="fin-card"><b>예산과 비교 (' + X.fy() + '년도)</b><p class="wk-note" style="margin:4px 0 8px">정기 청구로 한 해 동안 나갈 금액과 예산을 계정마다 견줍니다. 빨간 글씨는 확인이 필요한 곳입니다. 집행은 장부에 적힌 지출입니다.</p>' +
          '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>관</th><th>항</th><th class="num">정기 청구 연간</th><th class="num">연 예산</th><th>견줌</th><th class="num">장부 집행</th><th class="num">집행률</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      }
      // 지난 회기 정기 지출 가운데 아직 이 회기로 옮기지 않은 것
      function carryable() {
        return list.filter(function (c) { return isReg(c) && Number(c.fy) === FY - 1 && !list.some(function (d) { return isReg(d) && Number(d.fy) === FY && d.from === c.id; }); });
      }
      function carryBox() {
        if (mode !== 'regular') return '';
        var cs = carryable(); if (!cs.length) return '';
        return '<div class="fin-card wk-carry"><div class="wk-pe-h"><b>정기 지출 이월 — ' + (FY - 1) + '년도 → ' + FY + '년도</b><span class="wk-st">' + cs.length + '건</span></div>' +
          '<p class="wk-note" style="margin:0 0 8px">지난 회기의 정기 지출입니다. 이월할 것만 고른 뒤 「이월하기」를 누르세요. 고르지 않은 것은 옮기지 않습니다(지난 회기 기록은 그대로 남습니다). 옮긴 뒤 금액 · 주는 아래에서 고칠 수 있습니다.</p>' +
          '<div class="wk-carry-l">' + cs.map(function (c) {
            return '<label><input type="checkbox" data-carry="' + esc(c.id) + '"' + (c.on === false ? '' : ' checked') + '> ' + (Number(c.week) ? c.week + '주' : '매주') + ' · ' + esc(c.hang || '') + ' · ' + esc(c.text || '') + (c.kind === '선교' ? ' (선교헌금 자동)' : ' · ' + won(c.amount) + '원') + '</label>';
          }).join('') + '</div>' +
          '<div class="wk-pe-b"><button class="btn btn-solid" id="rcCarry">선택한 정기 지출 이월하기</button></div></div>';
      }
      function draw() {
        var order = list.map(function (c, i) { return { c: c, i: i }; }).filter(function (o) { return shown(o.c); }).sort(function (a, b) { return (Number(a.c.week) - Number(b.c.week)) || (a.i - b.i); });
        panel.innerHTML = dl.html +
          carryBox() +
          '<div class="fin-card wk-pe"><div class="wk-pe-h"><b>' + (mode === 'inst' ? '할부 등록 (회기와 상관없이 총 회차까지)' : (mode === 'regular' ? FY + '년도 정기 지출 등록' : '정기 청구 목록')) + '</b><span class="wk-st">' + (claimsSaved(X) ? '저장된 목록' : '기본값(2026 청원서에서 가져옴) — 저장하면 확정됩니다') + '</span></div>' +
          '<p class="wk-note" style="margin:0 0 8px">' + (mode === 'inst'
            ? '할부는 그 달 「주」에 「이름 (회차/총 회차)」로 지출결의서에 저절로 들어갑니다. 1회차 연월과 총 회차로 회차를 매달 1씩 올리고, 마지막 회차 다음 달부터 빠집니다(「끝남」). 끝이 없는 적립은 총 회차를 비워 두세요.'
            : '주를 고르면 그 달 그 주에 지출결의서에 저절로 들어갑니다(매주 = 주마다). 지출내역에 {월} 을 쓰면 그 달 숫자가, 선교헌금 줄은 지난주 선교헌금 전액이 들어갑니다. 달마다 금액이 다르면 「다른 금액 달」에 적습니다.') + '</p>' +
          '<div style="overflow:auto"><table class="fin-table wk-pet-ed wk-rc"><thead><tr><th>사용</th><th>종류</th><th>주</th><th>관</th><th>항(예산 계정)</th><th>지출내역</th><th class="num">금액</th><th>비고</th><th>할부 회차 / 다른 금액 달</th><th></th></tr></thead><tbody>' +
          order.map(function (o) { return rowHTML(o.c, o.i); }).join('') + '</tbody></table></div>' +
          '<div class="wk-pe-b">' + (mode !== 'inst' ? '<button class="btn btn-line" id="rcAdd">+ 정기 지출 더하기</button>' : '') + (mode !== 'regular' ? '<button class="btn btn-line" id="rcInst">+ 할부 등록</button>' : '') + '<button class="btn btn-solid" id="rcSave">💾 저장</button><button class="btn btn-line" id="rcReset" style="margin-left:auto">기본값으로 되돌리기</button><span id="rcMsg" class="wk-note" style="margin:0"></span></div></div>' +
          compare();
        wire();
      }
      function wire() {
        var cb = panel.querySelector('#rcCarry');
        if (cb) cb.onclick = function () {
          var ids = Array.prototype.filter.call(panel.querySelectorAll('[data-carry]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-carry'); });
          if (!ids.length) { alert('이월할 정기 지출을 고르세요.'); return; }
          list.filter(function (c) { return ids.indexOf(String(c.id)) >= 0; }).forEach(function (c, k) {
            var o = JSON.parse(JSON.stringify(c)); o.id = 'c' + Date.now().toString(36) + k; o.fy = FY; o.from = c.id; o.on = true; list.push(o);
          });
          list.forEach(function (c) { if (!c.id) c.id = 'c' + Math.random().toString(36).slice(2, 9); });
          X.save('recurring_claims', JSON.stringify(list)).then(function () { state.pet = {}; draw(); panel.querySelector('#rcMsg').textContent = ids.length + '건을 ' + FY + '년도로 이월해 저장했습니다.'; })
            .catch(function (er) { alert('저장하지 못했습니다: ' + er.message); });
        };
        var tb = panel.querySelector('.wk-rc tbody');
        tb.addEventListener('input', function (e) {
          var inp = e.target, tr = inp.closest('tr[data-i]'); if (!tr) return;
          var c = list[Number(tr.getAttribute('data-i'))], k = inp.getAttribute('data-k'); if (!c || !k) return;
          if (k === 'on') c.on = inp.checked;
          else if (k === 'amount' || k === 'bonusAmount') c[k] = Number(String(inp.value).replace(/[^\d]/g, '')) || 0;
          else if (k === 'total') c.total = inp.value.trim() ? (Number(inp.value.replace(/[^\d]/g, '')) || null) : null;
          else if (k === 'week') c.week = Number(inp.value);
          else c[k] = inp.value;
          if (k === 'gwan') tr.querySelector('[data-k=hang]').setAttribute('list', hangListId(dl.tree, c.gwan));
          if (k === 'hang' && !c.gwan) { var g = gwanOf(dl.tree, c.hang); if (g) { c.gwan = g; tr.querySelector('[data-k=gwan]').value = g; } }
          panel.querySelector('#rcMsg').textContent = '고친 내용이 아직 저장 안 됨';
        });
        tb.addEventListener('change', function (e) { var k = e.target.getAttribute('data-k'); if (k === 'on' || k === 'week' || k === 'start' || k === 'total') draw(); });
        tb.addEventListener('click', function (e) { var d = e.target.getAttribute('data-del'); if (d != null && confirm('이 줄을 목록에서 뺄까요? (저장해야 확정됩니다)')) { list.splice(Number(d), 1); draw(); } });
        function nid() { return 'c' + Date.now().toString(36); }
        var rcAdd = panel.querySelector('#rcAdd'); if (rcAdd) rcAdd.onclick = function () { list.push({ id: nid(), kind: '정기', week: 1, gwan: '', hang: '', text: '', amount: 0, note: '', on: true, fy: FY }); draw(); };
        var rcInst = panel.querySelector('#rcInst'); if (rcInst) rcInst.onclick = function () {
          var nm = prompt('할부 이름 (예: 스타리아 할부)'); if (!nm) return;
          var cur = prompt('지금(' + curYm + ') 몇 회차인가요? 예: 36/60  (적립처럼 끝이 없으면 12 처럼 회차만)', '1/12'); if (!cur) return;
          var m = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(cur); if (!m) { alert('36/60 처럼 적어 주세요.'); return; }
          var n = Number(m[1]), i0 = ymIndex(curYm) - (n - 1);
          list.push({ id: nid(), kind: '할부', week: 3, gwan: '', hang: '', text: nm, amount: 0, note: '', on: true, start: Math.floor(i0 / 12) + '-' + pad2(i0 % 12 + 1), total: m[2] ? Number(m[2]) : null });
          draw();
        };
        panel.querySelector('#rcSave').onclick = function () {
          list.forEach(function (c) { if (!c.id) c.id = nid(); });
          X.save('recurring_claims', JSON.stringify(list)).then(function () { panel.querySelector('#rcMsg').textContent = '저장했습니다.'; state.pet = {}; draw(); })
            .catch(function (er) { alert('저장하지 못했습니다: ' + er.message); });
        };
        panel.querySelector('#rcReset').onclick = function () {
          if (!confirm((mode === 'inst' ? '할부 목록' : FY + '년도 정기 지출') + '을 기본값(2026 청원서 기준)으로 되돌릴까요? 저장해야 확정됩니다.')) return;
          var keep = list.filter(function (c) { return !shown(c); });
          var add = defaultClaims(FY).filter(function (c) { return mode === 'inst' ? !isReg(c) : (mode === 'regular' ? isReg(c) : true); });
          add.forEach(function (c, k) { c.id = 'r' + Date.now().toString(36) + k; });
          list = keep.concat(add); draw();
        };
      }
      draw();
    }).catch(function (e) { panel.innerHTML = '<div class="fin-card" style="color:#A33A2A">불러오지 못했습니다: ' + esc(e.message) + '</div>'; });
  }

  // =====================================================================
  //  「부서·부장 청원」 화면 (예산·계정 ▸ 부서·부장 청원) — fin_dept_heads
  //  부서마다 교적에서 부장을 고르고, 그 부서가 청원할 수 있는 예산 계정(항)을 정한다.
  //  부장은 홈페이지 「재정 청원」(petition.html)에서 청원하고, 재정부는 「주간 재정보고」에서 확인한다.
  // =====================================================================
  var DEPTS = ['주일학교', '유년부', '초등부', '중고등부', '청년부', '성가대', '찬양단', '남선교회', '여전도회', '권사회', '구제선교위원회', '교육위원회', '전도부', '관리부'];
  function renderDepts(panel, X) {
    injectCSS();
    var esc = X.esc;
    panel.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    function norm(list) { return (list || []).map(function (r) { return { id: r.id, dept: r.dept, head_name: r.head_name, member_key: r.member_key || '', accounts: (r.accounts || []).slice(), active: r.active !== false }; }); }
    Promise.all([X.load(), X.call('listDeptHeads', {})]).then(function (res) {
      var rows = norm(res[1].rows);
      var tree = datalists(X, esc).tree;
      var mem = (X.M.members || []).filter(function (m) { return m.name; });
      function memLabel(m) { var b = String(m.key || '').split('|')[1] || ''; return m.name + (b ? ' (' + b.slice(0, 4) + '.' + b.slice(4, 6) + '.' + b.slice(6, 8) + ')' : '') + (m.role ? ' · ' + m.role : ''); }
      var lists = '<datalist id="wkMem">' + mem.map(function (m) { return '<option value="' + esc(memLabel(m)) + '">'; }).join('') + '</datalist>' +
        '<datalist id="wkDept">' + DEPTS.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>';
      var accOpts = '<option value="">+ 계정 더하기</option>' + tree.map(function (g) { return '<optgroup label="' + esc(g.name) + '">' + g.items.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('') + '</optgroup>'; }).join('');
      function findMem(label) {
        for (var i = 0; i < mem.length; i++) if (memLabel(mem[i]) === label) return mem[i];
        var byName = mem.filter(function (m) { return m.name === label; });
        return byName.length === 1 ? byName[0] : null;
      }
      function labelOf(r) { for (var k = 0; k < mem.length; k++) if (mem[k].key === r.member_key) return memLabel(mem[k]); return r.head_name || ''; }
      function linkNote(r) { return r.member_key ? '교적 연결됨' : '<span class="bad">교적 목록에서 골라 주세요</span>'; }
      function rowHTML(r, i) {
        return '<tr data-i="' + i + '"' + (r.active ? '' : ' class="off"') + '><td><input type="checkbox" data-k="active"' + (r.active ? ' checked' : '') + '></td>' +
          '<td><input data-k="dept" list="wkDept" value="' + esc(r.dept) + '"></td>' +
          '<td><input data-k="head" list="wkMem" value="' + esc(labelOf(r)) + '" placeholder="교적에서 이름 찾기"><div class="st">' + linkNote(r) + '</div></td>' +
          '<td>' + r.accounts.map(function (a, j) { return '<span class="tag">' + esc(a) + ' <button class="wk-x" data-rm="' + j + '">✕</button></span>'; }).join(' ') + ' <select data-k="acc" style="width:auto">' + accOpts + '</select></td>' +
          '<td><button class="btn btn-solid" data-save="1" style="padding:5px 12px">저장</button></td></tr>';
      }
      function draw(msg) {
        panel.innerHTML = lists + '<div class="fin-card wk-pe"><div class="wk-pe-h"><b>부서 · 부장 · 청원할 수 있는 예산 계정</b><span class="wk-st">' + esc(msg || '') + '</span></div>' +
          '<p class="wk-note" style="margin:0 0 8px">부장을 교적에서 고르면, 그분이 홈페이지에 로그인했을 때 「재정 청원」 화면에서 고른 계정으로 청원할 수 있습니다(로그인 계정이 교적과 연결되어 있어야 합니다). ' +
          '올라온 청원은 「주간 재정보고」에서 확인하면 돌아오는 주일의 지출결의서에 들어갑니다. 부장이 바뀌면 줄을 끄고(사용 해제) 새 줄을 만드세요.</p>' +
          '<div style="overflow:auto"><table class="fin-table wk-pet-ed wk-dh"><thead><tr><th>사용</th><th style="width:150px">부서</th><th style="width:240px">부장(교적)</th><th>청원할 수 있는 예산 계정(항)</th><th></th></tr></thead><tbody>' +
          rows.map(rowHTML).join('') + '</tbody></table></div>' +
          '<div class="wk-pe-b"><button class="btn btn-line" id="dhAdd">+ 부서 더하기</button></div></div>' +
          '<div class="fin-card"><b>부장 청원 화면</b><p class="wk-note" style="margin:6px 0 0">부장에게 <b>' + esc(location.origin) + '/petition.html</b> 주소를 알려 주세요.</p></div>';
        var tb = panel.querySelector('.wk-dh tbody');
        tb.addEventListener('input', function (e) {
          var inp = e.target, tr = inp.closest('tr[data-i]'); if (!tr) return;
          var r = rows[Number(tr.getAttribute('data-i'))], k = inp.getAttribute('data-k');
          if (k === 'dept') r.dept = inp.value.trim();
          else if (k === 'active') r.active = inp.checked;
          else if (k === 'head') { var m = findMem(inp.value.trim()); r.member_key = m ? m.key : ''; r.head_name = m ? m.name : inp.value.trim(); tr.querySelector('.st').innerHTML = linkNote(r); }
        });
        tb.addEventListener('change', function (e) {
          var inp = e.target, tr = inp.closest('tr[data-i]'); if (!tr) return;
          var r = rows[Number(tr.getAttribute('data-i'))];
          if (inp.getAttribute('data-k') === 'acc' && inp.value) { if (r.accounts.indexOf(inp.value) < 0) r.accounts.push(inp.value); draw('저장을 눌러 확정하세요'); }
        });
        tb.addEventListener('click', function (e) {
          var t = e.target, tr = t.closest('tr[data-i]'); if (!tr) return;
          var r = rows[Number(tr.getAttribute('data-i'))];
          if (t.getAttribute('data-rm') != null) { r.accounts.splice(Number(t.getAttribute('data-rm')), 1); draw('저장을 눌러 확정하세요'); return; }
          if (t.getAttribute('data-save') != null) {
            if (!r.dept) { alert('부서 이름을 적어 주세요.'); return; }
            if (!r.member_key) { alert('부장을 교적 목록에서 골라 주세요.'); return; }
            if (!r.accounts.length) { alert('청원할 수 있는 예산 계정을 하나 이상 고르세요.'); return; }
            X.call('saveDeptHead', { row: r }).then(function () { return X.call('listDeptHeads', {}); })
              .then(function (rr) { rows = norm(rr.rows); draw('저장했습니다'); })
              .catch(function (er) { alert('저장하지 못했습니다: ' + er.message); });
          }
        });
        panel.querySelector('#dhAdd').onclick = function () { rows.push({ dept: '', head_name: '', member_key: '', accounts: [], active: true }); draw(); };
      }
      draw();
    }).catch(function (e) {
      var missing = /fin_dept_heads|does not exist|PGRST/.test(e.message || '');
      panel.innerHTML = '<div class="fin-card">' + (missing ? '부서·부장 표가 아직 준비되지 않았습니다(데이터베이스 준비 전).' : '불러오지 못했습니다: ' + esc(e.message)) + '</div>';
    });
  }

  return { render: render, renderRecurring: renderRecurring, renderDepts: renderDepts };
})();
