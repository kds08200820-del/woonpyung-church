/* ============================================================
   운평장로교회 — 구제선교위원회 회계 장부: 엑셀 읽기와 자동 분류
   window.MissionLedger
     readXlsx(arrayBuffer, JSZip) → Promise<[{ name, rows: string[][] }]>   엑셀(.xlsx) 시트들을 글자 표로
     pick(sheets)                 → { entries, opening, sheet, hasCategory, note }  거래 줄 찾기
     classify(entries, rules, history) → 항목이 빈 줄에 항목을 붙인다(규칙 → 예전 기록 → 기본 규칙 → 미분류)
     summarize(entries, opening)  → { income, spend, balance, from, to }
   화면(js/mission.js)과 시험(node)에서 같이 쓴다. DOM 을 쓰지 않는다.
   ============================================================ */
(function (root) {
  "use strict";

  /* ── 엑셀(.xlsx) 읽기 ── */
  function unesc(s) {
    return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(Number(d)); }).replace(/&amp;/g, "&");
  }
  function texts(xml) {      // <t>…</t> 들을 이어 붙인다(윗첨자 발음 표기 <rPh> 는 뺀다)
    var out = "", re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    xml = String(xml).replace(/<rPh[\s\S]*?<\/rPh>/g, "");
    while ((m = re.exec(xml))) out += unesc(m[1]);
    return out;
  }
  function colIdx(ref) { var s = String(ref).replace(/[0-9]+$/, ""), n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }

  function readXlsx(buf, JSZip) {
    return JSZip.loadAsync(buf).then(function (zip) {
      var f = function (p) { var e = zip.file(p); return e ? e.async("string") : Promise.resolve(""); };
      return Promise.all([f("xl/sharedStrings.xml"), f("xl/workbook.xml"), f("xl/_rels/workbook.xml.rels")]).then(function (a) {
        var shared = [], m, re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
        while ((m = re.exec(a[0]))) shared.push(m[1] ? texts(m[1]) : "");
        var rels = {}; re = /<Relationship\s[^>]*>/g;
        while ((m = re.exec(a[2]))) { var id = /Id="([^"]+)"/.exec(m[0]), tg = /Target="([^"]+)"/.exec(m[0]); if (id && tg) rels[id[1]] = tg[1].replace(/^\/?xl\//, "").replace(/^\//, ""); }
        var sheets = []; re = /<sheet\s[^>]*>/g;
        while ((m = re.exec(a[1]))) {
          var nm = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]);
          sheets.push({ name: nm ? unesc(nm[1]) : "", path: "xl/" + ((rid && rels[rid[1]]) || ("worksheets/sheet" + (sheets.length + 1) + ".xml")) });
        }
        return Promise.all(sheets.map(function (s) {
          return f(s.path).then(function (xml) {
            var rows = [], rr = /<row[\s>][\s\S]*?<\/row>/g, r;
            while ((r = rr.exec(xml))) {
              var row = [], cr = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
              while ((c = cr.exec(r[0]))) {
                var ref = /r="([A-Z]+)\d+"/.exec(c[1]), t = /t="(\w+)"/.exec(c[1]), body = c[2] || "";
                var v = /<v>([\s\S]*?)<\/v>/.exec(body), val = "";
                if (t && t[1] === "s") val = v ? (shared[Number(v[1])] || "") : "";
                else if (t && t[1] === "inlineStr") val = texts(body);
                else val = v ? unesc(v[1]) : "";
                var idx = ref ? colIdx(ref[1]) : row.length;
                while (row.length < idx) row.push("");
                row[idx] = val;
              }
              rows.push(row);
            }
            return { name: s.name, rows: rows };
          });
        }));
      });
    });
  }

  /* ── 거래 줄 찾기 ── */
  var HEAD = {
    date: /^(거래\s*일시|거래\s*일자|거래\s*일|거래\s*날짜|날짜|일자|일시)/,
    income: /^(수입|입금|입금액|입금\s*금액|맡기신\s*금액|받은\s*금액)/,
    spend: /^(지출|출금|출금액|출금\s*금액|찾으신\s*금액|보낸\s*금액)/,
    amount: /^(거래\s*금액|금액)/,
    kind: /^(구분|입출금\s*구분|입출\s*구분)$/,
    balance: /^(잔액|거래\s*후\s*잔액)/,
    content: /^(내용|적요|기재\s*내용|거래\s*내용|거래\s*기록\s*사항|받는\s*분|보낸\s*분|의뢰인|내역)/,
    memo: /^(메모|비고)/,
    category: /^(항목|분류|계정)/,
    method: /^(거래\s*구분|거래\s*유형|거래\s*방법|거래\s*종류|처리\s*구분)/,
  };
  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function num(s) { var t = String(s == null ? "" : s).replace(/[,\s원₩]/g, ""); if (t === "" || t === "-") return 0; var n = Number(t); return isFinite(n) ? Math.round(n) : 0; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateOf(v) {       // → { d: 'YYYY-MM-DD', t: 'HH:MM:SS' } 또는 null
    var s = norm(v); if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {      // 엑셀 날짜 번호
      var ms = Math.round((Number(s) - 25569) * 86400000), dt = new Date(ms);
      return { d: dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate()),
        t: s.indexOf(".") >= 0 ? pad(dt.getUTCHours()) + ":" + pad(dt.getUTCMinutes()) + ":" + pad(dt.getUTCSeconds()) : "" };
    }
    var m = /^(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})일?[.\s]*(?:\(.\))?\s*(?:(오전|오후)\s*)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) { var c = /^(\d{4})(\d{2})(\d{2})(?:\s*(\d{2}):?(\d{2}):?(\d{2})?)?$/.exec(s); if (c) m = [0, c[1], c[2], c[3], null, c[4], c[5], c[6]]; }
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (!(y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    var hh = m[5] == null ? null : Number(m[5]);
    if (hh != null && m[4] === "오후" && hh < 12) hh += 12;
    if (hh != null && m[4] === "오전" && hh === 12) hh = 0;
    return { d: y + "-" + pad(mo) + "-" + pad(d), t: hh == null ? "" : pad(hh) + ":" + pad(Number(m[6] || 0)) + ":" + pad(Number(m[7] || 0)) };
  }
  function findHead(rows) {
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var map = {}, r = rows[i] || [];
      for (var c = 0; c < r.length; c++) {
        var h = norm(r[c]).replace(/\(.*?\)/g, "").trim(); if (!h) continue;
        for (var k in HEAD) if (map[k] == null && HEAD[k].test(h)) {
          if (k === "kind" && HEAD.method.test(h)) continue;
          map[k] = c; break;
        }
      }
      if (map.date != null && ((map.income != null && map.spend != null) || map.amount != null)) return { row: i, map: map };
    }
    return null;
  }
  function parseSheet(sheet) {
    var hd = findHead(sheet.rows); if (!hd) return null;
    var M = hd.map, out = [], g = function (r, k) { return M[k] == null ? "" : norm(r[M[k]]); };
    for (var i = hd.row + 1; i < sheet.rows.length; i++) {
      var r = sheet.rows[i] || [], dt = dateOf(g(r, "date")); if (!dt) continue;
      var inc = 0, sp = 0;
      if (M.income != null && M.spend != null) { inc = num(g(r, "income")); sp = num(g(r, "spend")); }
      else { var a = Math.abs(num(g(r, "amount"))), kd = g(r, "kind") + " " + g(r, "method"); if (/출금|지출|이체출금|찾/.test(kd) || num(g(r, "amount")) < 0) sp = a; else inc = a; }
      if (inc < 0) { sp = -inc; inc = 0; } if (sp < 0) { inc = -sp; sp = 0; }
      // 한 줄에 수입과 지출이 함께 있으면 두 줄로 나눈다(은행 내역에는 없고 집계표에만 있다)
      [["수입", inc], ["지출", sp]].forEach(function (p) {
        if (!(p[1] > 0)) return;
        var bal = M.balance == null ? null : num(g(r, "balance"));
        out.push({ entry_date: dt.d, entry_time: dt.t, kind: p[0], amount: p[1], category: g(r, "category"), content: g(r, "content"),
          memo: g(r, "memo"), method: g(r, "method"), balance: (inc > 0 && sp > 0) ? null : bal });
      });
    }
    return { name: sheet.name, entries: out, map: M };
  }
  function pick(sheets) {
    var best = null;
    (sheets || []).forEach(function (s) {
      var p = parseSheet(s); if (!p || !p.entries.length) return;
      p.score = p.entries.length + (p.map.content != null ? 100000 : 0) + (p.map.category != null ? 1000 : 0);
      if (!best || p.score > best.score) best = p;
    });
    if (!best) return { entries: [], opening: null, sheet: "", hasCategory: false, note: "거래 줄을 찾지 못했습니다. 첫 줄에 날짜와 수입·지출(또는 입금·출금) 칸 이름이 있어야 합니다." };
    var es = best.entries.slice();
    es.forEach(function (e, i) { e._i = i; });
    es.sort(function (a, b) { return (a.entry_date + a.entry_time).localeCompare(b.entry_date + b.entry_time) || (a._i - b._i); });
    // 은행 내역은 새 거래가 위에 오는 일이 많다 — 같은 시각이면 원래 차례를 뒤집어야 잔액이 이어진다
    var desc = best.entries.length > 1 && (best.entries[0].entry_date + best.entries[0].entry_time) > (best.entries[best.entries.length - 1].entry_date + best.entries[best.entries.length - 1].entry_time);
    if (desc) es.sort(function (a, b) { return (a.entry_date + a.entry_time).localeCompare(b.entry_date + b.entry_time) || (b._i - a._i); });
    var opening = null, f = es[0];
    if (f && f.balance != null) opening = f.balance - (f.kind === "수입" ? f.amount : -f.amount);
    es.forEach(function (e) {
      e.dedupe = [e.entry_date, e.entry_time, e.kind, e.amount, e.content, e.balance == null ? "" : e.balance].join("|");
      delete e._i;
    });
    // 같은 지문이 한 파일에 두 번 나오면(같은 날 같은 금액·내용, 잔액 칸 없음) 차례 번호를 붙여 둘 다 살린다
    var seen = {};
    es.forEach(function (e) { var n = (seen[e.dedupe] = (seen[e.dedupe] || 0) + 1); if (n > 1) e.dedupe += "#" + n; });
    return { entries: es, opening: opening, sheet: best.name, hasCategory: best.map.category != null, note: "" };
  }

  /* ── 자동 분류 ── */
  //   rules   : [{ keyword, kind('' | '수입' | '지출'), category }]  — 회계가 고친 것을 기억한 규칙
  //   history : [{ kind, content, category }]                      — 장부에 이미 있는 줄
  function classify(entries, rules, history) {
    var rs = (rules || []).filter(function (r) { return r && r.keyword && r.category && r.active !== false; })
      .sort(function (a, b) { return String(b.keyword).length - String(a.keyword).length; });   // 긴 낱말이 먼저
    var hist = {};
    (history || []).forEach(function (h) { if (h && h.content && h.category && h.category !== "미분류") hist[h.kind + "|" + norm(h.content)] = h.category; });
    return (entries || []).map(function (e) {
      var o = Object.assign({}, e), cat = norm(e.category), how = "file";
      if (!cat) {
        var hay = norm(e.content) + " " + norm(e.memo) + " " + norm(e.method), hit = null;
        for (var i = 0; i < rs.length; i++) if ((!rs[i].kind || rs[i].kind === e.kind) && hay.indexOf(rs[i].keyword) >= 0) { hit = rs[i]; break; }
        if (hit) { cat = hit.category; how = "rule"; }
        else if (e.content && hist[e.kind + "|" + norm(e.content)]) { cat = hist[e.kind + "|" + norm(e.content)]; how = "history"; }
        else if (/이자/.test(hay) && e.kind === "수입") { cat = "예금이자"; how = "basic"; }
        else if (/자동\s*이체/.test(norm(e.method)) && e.kind === "지출" && e.content) { cat = "정기이체 · " + norm(e.content); how = "basic"; }
        else { cat = "미분류"; how = "none"; }
      }
      o.category = cat.slice(0, 60); o.how = how;
      return o;
    });
  }

  function summarize(entries, opening) {
    var inc = 0, sp = 0, from = "", to = "";
    (entries || []).forEach(function (e) {
      if (e.kind === "수입") inc += e.amount; else sp += e.amount;
      if (!from || e.entry_date < from) from = e.entry_date;
      if (!to || e.entry_date > to) to = e.entry_date;
    });
    return { income: inc, spend: sp, balance: (opening || 0) + inc - sp, from: from, to: to, n: (entries || []).length };
  }

  var api = { readXlsx: readXlsx, pick: pick, classify: classify, summarize: summarize, _dateOf: dateOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MissionLedger = api;
})(typeof window !== "undefined" ? window : globalThis);
