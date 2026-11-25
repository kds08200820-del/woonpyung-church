/* ============================================================
   운평장로교회 — 파일 업로드 공용 모듈 (Cloudflare R2 Worker 연동)
   window.ChurchUpload.upload(file, {folder, compress, onProgress(0~1)}) → { url, key }   (영상도 가능 — 서버 상한 100MB)
   window.ChurchUpload.remove(key)
   window.ChurchUpload.compressImage(file) → File(압축본)
   - 이미지는 업로드 전 자동 축소·압축(최대 변 1600px, JPEG 82%)
   - R2_UPLOAD_URL 미설정 시 isReady()=false
   ============================================================ */
window.ChurchUpload = (function () {
  function base() { return (window.R2_UPLOAD_URL || "").replace(/\/$/, ""); }
  function isReady() { return !!base(); }

  function token() {
    try {
      const ref = (window.SUPABASE_URL || "").split("//")[1].split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return "";
      const obj = JSON.parse(raw);
      return obj.access_token || (obj.currentSession && obj.currentSession.access_token) || "";
    } catch (e) { return ""; }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const u = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(u); reject(e); };
      img.src = u;
    });
  }

  // 이미지 자동 압축(휴대폰 사진 5MB → 보통 200~400KB)
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.82;
    if (!file || !/^image\//.test(file.type)) return file;          // 이미지 아님
    if (/gif|svg|x-icon/.test(file.type)) return file;               // GIF/SVG는 원본 유지
    try {
      const img = await loadImage(file);
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);              // 투명 PNG → 흰 배경
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (!blob || blob.size >= file.size) return file;             // 효과 없으면 원본
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
    } catch (e) {
      return file; // 압축 실패 시 원본 업로드
    }
  }

  // 영상: 기기에 따라 file.type 이 비어 오므로 확장자로 보정(비어 있으면 서버가 octet-stream 으로 저장해 재생이 안 된다)
  const VIDEO_TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg" };
  function mediaType(f) {
    if (f.type) return f.type;
    const m = String(f.name || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
    return (m && VIDEO_TYPES[m[1]]) || "application/octet-stream";
  }

  async function upload(file, opts) {
    opts = opts || {};
    if (!isReady()) throw new Error("업로드 서버가 아직 설정되지 않았습니다.");
    if (!token()) throw new Error("로그인이 필요합니다.");
    const folder = opts.folder || "uploads";
    const f = (opts.compress === false) ? file : await compressImage(file);
    const headers = {
      Authorization: "Bearer " + token(),
      "Content-Type": mediaType(f),
      "x-filename": encodeURIComponent(f.name || "file"),
      "x-folder": folder,
    };
    if (opts.onProgress) {   // 큰 파일(영상)은 진행률을 보여 주려고 XHR 로 올린다
      return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("POST", base() + "/upload");
        Object.keys(headers).forEach((k) => x.setRequestHeader(k, headers[k]));
        x.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress(e.loaded / e.total); };
        x.onerror = () => reject(new Error("네트워크 오류로 올리지 못했습니다. 다시 시도해 주세요."));
        x.ontimeout = () => reject(new Error("시간이 너무 오래 걸려 중단했습니다. 와이파이에서 다시 시도해 주세요."));
        x.onload = () => {
          let d = {}; try { d = JSON.parse(x.responseText || "{}"); } catch (e) {}
          if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error(d.error || ("업로드 실패 (" + x.status + ")")));
        };
        x.send(f);
      });
    }
    const res = await fetch(base() + "/upload", { method: "POST", headers, body: f });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || ("업로드 실패 (" + res.status + ")"));
    return data; // { url, key }
  }

  async function remove(key) {
    if (!isReady() || !key) return false;
    try {
      const res = await fetch(base() + "/f/" + key.split("/").map(encodeURIComponent).join("/"), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token() },
      });
      return res.ok;
    } catch (e) { return false; }
  }

  // ── 재정 청원 영수증: 청원자와 재정 담당자만 (2026-11-24) ──
  //   저장된 주소(…/f/fin-receipts/…)를 저장소 워커의 6시간짜리 서명 주소로 바꾼다.
  //   워커가 아직 이 기능을 모르면(배포 전) 원래 주소를 그대로 쓴다.
  const rcptCache = {};
  function rcptKey(u) {
    const m = String(u || "").match(/\/f\/(fin-receipts\/[^?#]+)/);
    if (!m) return null;
    try { return m[1].split("/").map(decodeURIComponent).join("/"); } catch (e) { return null; }
  }
  async function receiptUrls(urls) {
    const now = Date.now();
    const need = [...new Set((urls || []).map(rcptKey).filter(Boolean))].filter((k) => !rcptCache[k] || rcptCache[k].exp < now + 60000);
    if (need.length && isReady() && token()) {
      try {
        const res = await fetch(base() + "/fin-rcpt-urls", {
          method: "POST",
          headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
          body: JSON.stringify({ keys: need }),
        });
        if (res.ok) {
          const d = await res.json();
          Object.keys((d && d.urls) || {}).forEach((k) => { rcptCache[k] = { url: d.urls[k], exp: now + 5.5 * 3600 * 1000 }; });
        }
      } catch (e) { /* 원래 주소로 */ }
    }
    const out = {};
    (urls || []).forEach((u) => { const k = rcptKey(u); out[u] = (k && rcptCache[k] && rcptCache[k].url) || u; });
    return out;
  }
  // 청원 줄들의 receipts 를 서명 주소로 바꿔 돌려준다(원래 주소는 receipts_raw 에)
  async function signReceiptRows(rows) {
    rows = rows || [];
    const all = [];
    rows.forEach((p) => { (p.receipts || []).forEach((u) => all.push(u)); });
    if (!all.length) return rows;
    const map = await receiptUrls(all);
    rows.forEach((p) => { if ((p.receipts || []).length) { p.receipts_raw = p.receipts; p.receipts = p.receipts.map((u) => map[u] || u); } });
    return rows;
  }

  // ── 지키는 폴더(2026-11-25): 교적 사진 · 문서 첨부 · 성도별 자료 · 자료실 · 재정 그림 · 증명서 도장 ──
  //   저장된 주소(…/f/<폴더>/…)는 그대로 두고, 화면에 보일 때만 파일 워커의 6시간짜리 서명 주소(/p/…)로 바꾼다.
  //   · signUrls(urls)  : { 원래 주소: 보일 주소 }
  //   · signHtml(html)  : 글 속의 주소를 바꾼 글(새 창에 인쇄할 때)
  //   · 화면에 그려지는 img · a · audio · video · source · iframe · embed 는 저절로 바뀐다(아래 지켜보기).
  //   워커가 아직 이 기능을 모르거나 권한이 없으면 원래 주소를 그대로 쓴다.
  const PROT_FOLDERS = "gyojeok|financereceipt|churchseal|affairsdocuments|archive|resources";
  const protCache = {};
  function protKey(u) {
    const s = String(u || "");
    if (!base() || s.indexOf(base() + "/f/") !== 0) return null;
    const m = s.slice(base().length + 3).match(new RegExp("^((?:" + PROT_FOLDERS + ")/[^?#]+)"));
    if (!m) return null;
    try { return m[1].split("/").map(decodeURIComponent).join("/"); } catch (e) { return null; }
  }
  let protWait = null;   // 같은 순간에 여러 곳이 부르면 한 번에 묻는다
  const protNeed = new Set();
  function askProt() {
    if (protWait) return protWait;
    protWait = new Promise((resolve) => setTimeout(resolve, 0)).then(async () => {
      const keys = [...protNeed]; protNeed.clear(); protWait = null;
      if (!keys.length || !isReady() || !token()) return;
      try {
        const res = await fetch(base() + "/sign-urls", {
          method: "POST",
          headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        });
        const now = Date.now();
        if (res.ok) {
          const d = await res.json();
          Object.keys((d && d.urls) || {}).forEach((k) => { protCache[k] = { url: d.urls[k], exp: now + 5.5 * 3600 * 1000 }; });
        }
        keys.forEach((k) => { if (!protCache[k]) protCache[k] = { url: null, exp: now + 5 * 60 * 1000 }; });   // 안 되는 것은 5분 동안 다시 묻지 않는다
      } catch (e) { /* 원래 주소로 */ }
    });
    return protWait;
  }
  async function signUrls(urls) {
    const now = Date.now();
    (urls || []).forEach((u) => { const k = protKey(u); if (k && (!protCache[k] || protCache[k].exp < now + 60000)) protNeed.add(k); });
    if (protNeed.size) await askProt();
    const out = {};
    (urls || []).forEach((u) => { const k = protKey(u); out[u] = (k && protCache[k] && protCache[k].url) || u; });
    return out;
  }
  async function signHtml(html) {
    html = String(html || "");
    if (!base()) return html;
    const esc = base().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(esc + "/f/(?:" + PROT_FOLDERS + ")/[^\"'\\s<>)]+", "g");
    const found = html.match(re);
    if (!found) return html;
    const map = await signUrls([...new Set(found)]);
    return html.replace(re, (u) => map[u] || u);
  }
  // 화면에 그려지는 것 지켜보기 — 지키는 주소가 보이면 서명 주소로 바꾼다
  const PROT_ATTRS = { IMG: "src", A: "href", AUDIO: "src", VIDEO: "src", SOURCE: "src", IFRAME: "src", EMBED: "src", TRACK: "src" };
  function fixEls(els) {
    const todo = [];
    els.forEach((el) => {
      const at = PROT_ATTRS[el.tagName]; if (!at) return;
      const v = el.getAttribute(at);
      if (v && protKey(v)) todo.push([el, at, v]);
    });
    if (!todo.length) return;
    signUrls(todo.map((t) => t[2])).then((map) => {
      todo.forEach(([el, at, v]) => {
        const nu = map[v];
        if (nu && nu !== v && el.getAttribute(at) === v) {
          el.setAttribute(at, nu);
          if (el.tagName === "SOURCE" && el.parentNode && el.parentNode.load) { try { el.parentNode.load(); } catch (e) {} }
        }
      });
    });
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    const sel = Object.keys(PROT_ATTRS).map((t) => t.toLowerCase() + "[" + PROT_ATTRS[t] + "*='/f/']").join(",");
    const els = [...root.querySelectorAll(sel)];
    if (root.tagName && PROT_ATTRS[root.tagName]) els.push(root);
    fixEls(els);
  }
  function watch() {
    if (!isReady() || typeof MutationObserver === "undefined" || !document.documentElement) return;
    scan(document.documentElement);
    new MutationObserver((list) => {
      const els = [];
      list.forEach((m) => {
        if (m.type === "attributes") { if (m.target.nodeType === 1) els.push(m.target); }
        else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (PROT_ATTRS[n.tagName]) els.push(n); if (n.querySelectorAll) scan(n); } });
      });
      if (els.length) fixEls(els);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href"] });
  }
  // window.open(지키는 주소) — 빈 창을 먼저 열고(팝업 차단 피하기) 서명 주소로 옮긴다
  if (typeof window.open === "function" && !window.__wpProtOpen) {
    window.__wpProtOpen = true;
    const rawOpen = window.open.bind(window);
    window.open = function (u, name, features) {
      if (!protKey(u)) return rawOpen(u, name, features);
      const w = rawOpen("", name || "_blank", features);
      signUrls([u]).then((map) => { const to = map[u] || u; if (w && !w.closed) w.location.href = to; else rawOpen(to, name, features); });
      return w;
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();

  return { isReady, compressImage, upload, remove, receiptUrls, signReceiptRows, signUrls, signHtml };
})();
