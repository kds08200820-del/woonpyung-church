/* ============================================================
   운평장로교회 — 나눔터(게시판) (Supabase)
   posts / comments 테이블 사용. RLS로 권한 통제.
   ※ supabase-js getSession() 잠금으로 인한 멈춤을 피하기 위해
     localStorage 토큰 기반 REST 직접 호출(타임아웃 포함)을 사용합니다.
   ============================================================ */
(function () {
  const list = document.getElementById("boardList");
  if (!list) return; // community.html 아닐 때
  const notice = document.getElementById("boardNotice");
  const writeBtn = document.getElementById("boardWriteBtn");
  const form = document.getElementById("boardForm");
  const cancelBtn = document.getElementById("boardCancel");
  const loading = document.getElementById("boardLoading");

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    if (notice) notice.hidden = false;
    if (writeBtn) writeBtn.style.display = "none";
    return;
  }

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (e) { return ""; }
  };

  // ── 세션/REST 헬퍼 (getSession 미사용) ──
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
      const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
      if (!res.ok) {
        const msg = (data && (data.message || data.hint || data.error)) || ("HTTP " + res.status);
        const err = new Error(msg); err.status = res.status; throw err;
      }
      return data;
    })(), 8000);
  }
  const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
  const displayName = (u) =>
    (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) ||
    (u && u.email ? u.email.split("@")[0] : "성도");
  function openLogin() {
    const m = document.getElementById("authModal");
    if (m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  }
  // 관리자 여부(1회 조회 후 캐시)
  let _isAdmin = null;
  async function isAdminUser() {
    if (_isAdmin !== null) return _isAdmin;
    const me = currentUser();
    if (!me || !me.id) { _isAdmin = false; return false; }
    try {
      const rows = await api("GET", `admins?uid=eq.${me.id}&select=uid`);
      _isAdmin = Array.isArray(rows) && rows.length > 0;
    } catch (e) { _isAdmin = false; }
    return _isAdmin;
  }

  // 모달
  const postModal = document.getElementById("postModal");
  const postDetail = document.getElementById("postDetail");
  const commentList = document.getElementById("commentList");
  const commentForm = document.getElementById("commentForm");
  const commentLogin = document.getElementById("commentLogin");

  let openPostId = null;

  function init() {
    console.log("[community.js] v20260627o REST");
    loadPosts();

    writeBtn.addEventListener("click", () => {
      if (!currentUser()) { alert("글을 쓰려면 먼저 로그인해 주세요."); openLogin(); return; }
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    cancelBtn.addEventListener("click", () => { form.hidden = true; form.reset(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const me = currentUser();
      if (!me) { alert("로그인이 필요합니다."); openLogin(); return; }
      const fd = new FormData(form);
      const title = (fd.get("title") || "").trim();
      const content = (fd.get("content") || "").trim();
      if (!title || !content) { alert("제목과 내용을 입력해 주세요."); return; }
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await api("POST", "posts", { user_id: me.id, author_name: displayName(me), title, content }, { Prefer: "return=minimal" });
        form.reset(); form.hidden = true;
        loadPosts();
      } catch (err) {
        alert("등록 오류: " + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    postModal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closePost(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !postModal.hidden) closePost(); });
    commentForm.addEventListener("submit", addComment);
  }

  async function loadPosts() {
    if (loading) loading.hidden = false;
    let data;
    try {
      data = await api("GET", "posts?select=*&order=created_at.desc");
    } catch (e) {
      if (loading) loading.hidden = true;
      list.innerHTML = `<p class="qt-loading">목록을 불러오지 못했습니다: ${esc(e.message)}</p>
        <p style="text-align:center;margin-top:12px;"><button type="button" class="btn btn-line" id="boardRetry">다시 시도</button></p>`;
      const rb = document.getElementById("boardRetry");
      if (rb) rb.addEventListener("click", loadPosts);
      return;
    }
    if (loading) loading.hidden = true;
    if (!data || !data.length) { list.innerHTML = `<p class="qt-loading">아직 글이 없습니다. 첫 글을 남겨보세요!</p>`; return; }
    list.innerHTML = data.map((p) => `
      <button class="board-item" data-id="${p.id}">
        <h3>${esc(p.title)}</h3>
        <div class="bi-meta"><span>${esc(p.author_name)}</span><span>${fmtDate(p.created_at)}</span></div>
      </button>`).join("");
    list.querySelectorAll(".board-item").forEach((b) =>
      b.addEventListener("click", () => openPost(b.dataset.id))
    );
  }

  async function openPost(id) {
    openPostId = id;
    let p;
    try { p = first(await api("GET", `posts?id=eq.${id}&select=*`)); } catch (e) { alert("불러오기 오류: " + e.message); return; }
    if (!p) return;
    const me = currentUser();
    const admin = await isAdminUser();
    const mine = !!(me && p.user_id && me.id === p.user_id);
    const canDelete = mine || admin;
    postDetail.innerHTML = `
      <span class="m-eyebrow">${fmtDate(p.created_at)} · ${esc(p.author_name)}</span>
      <h3 class="m-title">${esc(p.title)}</h3>
      <div class="post-body">${esc(p.content).replace(/\n/g, "<br>")}</div>
      ${(mine || canDelete) ? `<div class="post-actions">
          ${mine ? `<button class="btn btn-line post-edit" id="postEdit">수정</button>` : ""}
          ${canDelete ? `<button class="btn post-del" id="postDelete">삭제${admin && !mine ? " (관리자)" : ""}</button>` : ""}
        </div>` : ""}`;
    if (mine) document.getElementById("postEdit").addEventListener("click", () => editPost(p));
    if (canDelete) document.getElementById("postDelete").addEventListener("click", () => deletePost(id));
    await loadComments(id);
    commentForm.hidden = !me;
    commentLogin.hidden = !!me;
    postModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePost() { postModal.hidden = true; document.body.style.overflow = ""; openPostId = null; }

  function editPost(p) {
    postDetail.innerHTML = `
      <span class="m-eyebrow">글 수정</span>
      <div class="form-field" style="margin:14px 0 12px"><label>제목</label><input type="text" id="editTitle" maxlength="100" value="${esc(p.title)}" /></div>
      <div class="form-field" style="margin:12px 0"><label>내용</label><textarea id="editContent" rows="7">${esc(p.content)}</textarea></div>
      <div class="post-actions" style="display:flex;gap:10px">
        <button class="btn btn-solid" id="editSave">저장</button>
        <button class="btn btn-line" id="editCancel">취소</button>
      </div>`;
    document.getElementById("editSave").addEventListener("click", async () => {
      const title = document.getElementById("editTitle").value.trim();
      const content = document.getElementById("editContent").value.trim();
      if (!title || !content) { alert("제목과 내용을 입력해 주세요."); return; }
      try {
        await api("PATCH", `posts?id=eq.${p.id}`, { title, content }, { Prefer: "return=minimal" });
      } catch (err) { alert("수정 오류: " + err.message); return; }
      await openPost(p.id);
      loadPosts();
    });
    document.getElementById("editCancel").addEventListener("click", () => openPost(p.id));
  }

  async function deletePost(id) {
    if (!confirm("이 글을 삭제할까요?")) return;
    try { await api("DELETE", `posts?id=eq.${id}`, null, { Prefer: "return=minimal" }); }
    catch (err) { alert("삭제 오류: " + err.message); return; }
    closePost(); loadPosts();
  }

  async function loadComments(postId) {
    let data;
    try { data = await api("GET", `comments?post_id=eq.${postId}&select=*&order=created_at.asc`); }
    catch (e) { commentList.innerHTML = `<p class="comment-empty">댓글을 불러오지 못했습니다.</p>`; return; }
    const me = currentUser();
    const admin = await isAdminUser();
    if (!data || !data.length) { commentList.innerHTML = `<p class="comment-empty">첫 댓글을 남겨보세요.</p>`; return; }
    commentList.innerHTML = data.map((c) => {
      const mine = (me && me.id === c.user_id) || admin;
      return `<div class="comment-item">
        <div class="ci-head"><span class="ci-name">${esc(c.author_name)}</span><span class="ci-date">${fmtDate(c.created_at)}</span></div>
        <p>${esc(c.content)}</p>
        ${mine ? `<button class="ci-del" data-id="${c.id}">삭제</button>` : ""}
      </div>`;
    }).join("");
    commentList.querySelectorAll(".ci-del").forEach((b) =>
      b.addEventListener("click", async () => {
        try { await api("DELETE", `comments?id=eq.${b.dataset.id}`, null, { Prefer: "return=minimal" }); } catch (e) {}
        loadComments(postId);
      })
    );
  }

  async function addComment(e) {
    e.preventDefault();
    const me = currentUser();
    const input = commentForm.querySelector("input[name=comment]");
    const text = input.value.trim();
    if (!text || !me || !openPostId) { if (!me) openLogin(); return; }
    try {
      await api("POST", "comments", { post_id: openPostId, user_id: me.id, author_name: displayName(me), content: text }, { Prefer: "return=minimal" });
    } catch (err) { alert("댓글 오류: " + err.message); return; }
    input.value = "";
    loadComments(openPostId);
  }

  init();
})();
