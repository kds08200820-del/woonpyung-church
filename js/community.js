/* ============================================================
   운평장로교회 — 나눔터(게시판) (Supabase)
   posts / comments 테이블 사용. RLS로 권한 통제.
   ============================================================ */
(function () {
  const list = document.getElementById("boardList");
  if (!list) return; // community.html 아닐 때
  const notice = document.getElementById("boardNotice");
  const writeBtn = document.getElementById("boardWriteBtn");
  const form = document.getElementById("boardForm");
  const cancelBtn = document.getElementById("boardCancel");
  const loading = document.getElementById("boardLoading");

  // 미설정 시: 안내만 표시
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

  // 모달
  const postModal = document.getElementById("postModal");
  const postDetail = document.getElementById("postDetail");
  const commentList = document.getElementById("commentList");
  const commentForm = document.getElementById("commentForm");
  const commentLogin = document.getElementById("commentLogin");

  let sb = null;
  let me = null; // 현재 사용자
  let openPostId = null;

  function start(client) {
    sb = client;
    if (loading) loading.hidden = false;
    sb.auth.getUser().then(({ data }) => { me = data && data.user; });
    sb.auth.onAuthStateChange((_e, session) => { me = session ? session.user : null; });
    loadPosts();

    writeBtn.addEventListener("click", async () => {
      const { data } = await sb.auth.getUser();
      me = data && data.user;
      if (!me) { alert("글을 쓰려면 먼저 로그인해 주세요."); const b = document.getElementById("loginBtn"); if (b) b.click(); return; }
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    cancelBtn.addEventListener("click", () => { form.hidden = true; form.reset(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name =
        (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) ||
        (me.email ? me.email.split("@")[0] : "성도");
      const { error } = await sb.from("posts").insert({
        user_id: me.id, author_name: name,
        title: fd.get("title"), content: fd.get("content"),
      });
      if (error) { alert("등록 오류: " + error.message); return; }
      form.reset(); form.hidden = true;
      loadPosts();
    });

    postModal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closePost(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !postModal.hidden) closePost(); });
    commentForm.addEventListener("submit", addComment);
  }

  async function loadPosts() {
    let data, error;
    try {
      const res = await sb.from("posts").select("*").order("created_at", { ascending: false });
      data = res.data; error = res.error;
    } catch (e) { error = e; }
    if (loading) loading.hidden = true;
    if (error) { list.innerHTML = `<p class="qt-loading">목록을 불러오지 못했습니다. 새로고침(Ctrl+Shift+R) 해 주세요.</p>`; return; }
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
    const { data: p } = await sb.from("posts").select("*").eq("id", id).single();
    if (!p) return;
    const { data: u } = await sb.auth.getUser();
    me = u && u.user;
    const mine = me && me.id === p.user_id;
    postDetail.innerHTML = `
      <span class="m-eyebrow">${fmtDate(p.created_at)} · ${esc(p.author_name)}</span>
      <h3 class="m-title">${esc(p.title)}</h3>
      <div class="post-body">${esc(p.content).replace(/\n/g, "<br>")}</div>
      ${mine ? `<div class="post-actions"><button class="auth-btn" id="postEdit">수정</button><button class="auth-btn" id="postDelete">삭제</button></div>` : ""}`;
    if (mine) {
      document.getElementById("postDelete").addEventListener("click", () => deletePost(id));
      document.getElementById("postEdit").addEventListener("click", () => editPost(p));
    }
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
      const { error } = await sb.from("posts").update({ title, content }).eq("id", p.id);
      if (error) { alert("수정 오류: " + error.message); return; }
      await openPost(p.id);
      loadPosts();
    });
    document.getElementById("editCancel").addEventListener("click", () => openPost(p.id));
  }

  async function deletePost(id) {
    if (!confirm("이 글을 삭제할까요?")) return;
    const { error } = await sb.from("posts").delete().eq("id", id);
    if (error) { alert("삭제 오류: " + error.message); return; }
    closePost(); loadPosts();
  }

  async function loadComments(postId) {
    const { data } = await sb.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
    if (!data || !data.length) { commentList.innerHTML = `<p class="comment-empty">첫 댓글을 남겨보세요.</p>`; return; }
    commentList.innerHTML = data.map((c) => {
      const mine = me && me.id === c.user_id;
      return `<div class="comment-item">
        <div class="ci-head"><span class="ci-name">${esc(c.author_name)}</span><span class="ci-date">${fmtDate(c.created_at)}</span></div>
        <p>${esc(c.content)}</p>
        ${mine ? `<button class="ci-del" data-id="${c.id}">삭제</button>` : ""}
      </div>`;
    }).join("");
    commentList.querySelectorAll(".ci-del").forEach((b) =>
      b.addEventListener("click", async () => {
        await sb.from("comments").delete().eq("id", b.dataset.id);
        loadComments(postId);
      })
    );
  }

  async function addComment(e) {
    e.preventDefault();
    const input = commentForm.querySelector("input[name=comment]");
    const text = input.value.trim();
    if (!text || !me || !openPostId) return;
    const name =
      (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) ||
      (me.email ? me.email.split("@")[0] : "성도");
    const { error } = await sb.from("comments").insert({
      post_id: openPostId, user_id: me.id, author_name: name, content: text,
    });
    if (error) { alert("댓글 오류: " + error.message); return; }
    input.value = "";
    loadComments(openPostId);
  }

  if (window.__sb) start(window.__sb);
  else window.addEventListener("sb-ready", (e) => start(e.detail.sb), { once: true });
})();
