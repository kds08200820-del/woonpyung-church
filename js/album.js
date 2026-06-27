/* ============================================================
   운평장로교회 — 교회 앨범 (사진 드래그&드롭 업로드 → 압축 → Cloudflare R2)
   - 카테고리별 카드: 대표 사진(최근) + 장수 표시
   - 로그인 교인: 카드에 사진을 끌어다 놓거나 '＋ 사진 올리기'로 업로드
   - 카드 클릭 시 갤러리 모달에서 전체 사진 보기 / 본인·관리자는 삭제
   - 사진은 업로드 전 자동 압축(ChurchUpload) 후 R2에 저장,
     메타데이터(URL·카테고리)는 album_photos 테이블에 기록
   ============================================================ */
(function () {
  const grid = document.getElementById("albumGrid");
  if (!grid) return;
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    grid.innerHTML = '<p class="placeholder-note">로그인 기능 연결 후 이용할 수 있습니다.</p>';
    return;
  }

  const CATEGORIES = ["주일 예배", "여름성경학교", "수련회", "지역 섬김", "전 성도 식사", "연합예배"];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function localSession() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  function currentUser() { const s = localSession(); return (s && s.user) || null; }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("서버 응답이 지연됩니다")), ms))]);
  async function api(method, path, body, extra) {
    const sess = localSession();
    const token = sess && sess.access_token;
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (extra) Object.assign(headers, extra);
    return withTimeout((async () => {
      const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
      if (!res.ok) { const m = (data && (data.message || data.hint || data.error)) || ("HTTP " + res.status); const err = new Error(m); err.status = res.status; throw err; }
      return data;
    })(), 10000);
  }
  const displayName = (u) => (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || (u && u.email ? u.email.split("@")[0] : "성도");
  function openLogin() { const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } }

  let _isAdmin = null;
  async function isAdminUser() {
    if (_isAdmin !== null) return _isAdmin;
    const me = currentUser();
    if (!me || !me.id) { _isAdmin = false; return false; }
    try { const rows = await api("GET", `admins?uid=eq.${me.id}&select=uid`); _isAdmin = Array.isArray(rows) && rows.length > 0; }
    catch (e) { _isAdmin = false; }
    return _isAdmin;
  }
  const uploadReady = () => !!(window.ChurchUpload && window.ChurchUpload.isReady());

  let photos = [];   // 전체 사진
  const byCat = (cat) => photos.filter((p) => p.category === cat).sort((a, b) => b.id - a.id);

  async function load() {
    try { photos = await api("GET", "album_photos?select=*&order=created_at.desc") || []; }
    catch (e) { photos = []; }
    render();
  }

  function render() {
    const loggedIn = !!currentUser();
    grid.innerHTML = CATEGORIES.map((cat) => {
      const list = byCat(cat);
      const cover = list[0];
      const coverStyle = cover ? `style="background-image:url('${esc(cover.url)}')"` : "";
      return `<div class="album-card${cover ? " has-photo" : ""}" data-cat="${esc(cat)}">
        <div class="album-thumb" ${coverStyle}>${cover ? "" : "📷"}</div>
        <div class="album-cap"><span class="ac-name">${esc(cat)}</span><span class="album-count">${list.length}</span></div>
        ${loggedIn && uploadReady() ? `
          <button type="button" class="album-add" data-cat="${esc(cat)}" title="사진 올리기">＋ 사진</button>
          <input type="file" class="album-input" accept="image/*" multiple hidden />
          <div class="album-droplay"><span>여기에 사진을 놓으세요</span></div>` : ""}
      </div>`;
    }).join("");

    grid.querySelectorAll(".album-card").forEach((card) => {
      const cat = card.getAttribute("data-cat");
      const input = card.querySelector(".album-input");
      const addBtn = card.querySelector(".album-add");

      // 카드 클릭 → 갤러리 (단, ＋버튼/입력 클릭은 제외)
      card.addEventListener("click", (e) => {
        if (e.target.closest(".album-add") || e.target.closest(".album-input")) return;
        openGallery(cat);
      });

      if (addBtn && input) {
        addBtn.addEventListener("click", (e) => { e.stopPropagation(); input.click(); });
        input.addEventListener("change", () => handleFiles(card, cat, input.files));
        ["dragenter", "dragover"].forEach((ev) => card.addEventListener(ev, (e) => { e.preventDefault(); card.classList.add("drag"); }));
        ["dragleave", "drop"].forEach((ev) => card.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave" && card.contains(e.relatedTarget)) return; card.classList.remove("drag"); }));
        card.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files) handleFiles(card, cat, e.dataTransfer.files); });
      }
    });
  }

  async function handleFiles(card, cat, fileList) {
    const me = currentUser();
    if (!me) { alert("사진을 올리려면 로그인해 주세요."); openLogin(); return; }
    if (!uploadReady()) { alert("업로드 서버가 아직 설정되지 않았습니다."); return; }
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!files.length) { alert("이미지 파일만 올릴 수 있습니다."); return; }
    const cap = card.querySelector(".album-count");
    const orig = cap ? cap.textContent : "";
    for (let i = 0; i < files.length; i++) {
      if (cap) cap.textContent = `올리는 중 ${i + 1}/${files.length}`;
      try {
        const r = await window.ChurchUpload.upload(files[i], { folder: "album" });
        await api("POST", "album_photos", { category: cat, url: r.url, key: r.key, user_id: me.id, author_name: displayName(me) }, { Prefer: "return=minimal" });
      } catch (e) { if (cap) cap.textContent = orig; alert("업로드 오류: " + e.message); return; }
    }
    await load();
  }

  // ===== 갤러리 모달 =====
  const modal = document.getElementById("albumModal");
  const galTitle = document.getElementById("albumModalTitle");
  const gal = document.getElementById("albumGallery");
  function closeGallery() { if (modal) { modal.hidden = true; document.body.style.overflow = ""; } }
  if (modal) {
    modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeGallery(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeGallery(); });
  }

  async function openGallery(cat) {
    if (!modal) return;
    const list = byCat(cat);
    const me = currentUser();
    const admin = await isAdminUser();
    galTitle.textContent = cat;
    if (!list.length) {
      gal.innerHTML = `<p class="placeholder-note" style="grid-column:1/-1;">아직 사진이 없습니다.${currentUser() ? " 카드에 사진을 끌어다 놓아 올려보세요." : " 로그인 후 올릴 수 있어요."}</p>`;
    } else {
      gal.innerHTML = list.map((p) => {
        const canDel = (me && me.id === p.user_id) || admin;
        return `<figure class="gal-item">
          <a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(cat)}" loading="lazy" /></a>
          ${canDel ? `<button type="button" class="gal-del" data-id="${p.id}" data-key="${esc(p.key || "")}">삭제</button>` : ""}
        </figure>`;
      }).join("");
      gal.querySelectorAll(".gal-del").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("이 사진을 삭제할까요?")) return;
        b.disabled = true;
        try {
          await api("DELETE", `album_photos?id=eq.${b.dataset.id}`, null, { Prefer: "return=minimal" });
          if (b.dataset.key && window.ChurchUpload) window.ChurchUpload.remove(b.dataset.key);
        } catch (e) { b.disabled = false; alert("삭제 오류: " + e.message); return; }
        await load(); openGallery(cat);
      }));
    }
    modal.hidden = false; document.body.style.overflow = "hidden";
  }

  load();
})();
