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

  return { isReady, compressImage, upload, remove };
})();
