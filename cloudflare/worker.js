/****************************************************************
 * 운평장로교회 — 파일 업로드 중계 Worker (Cloudflare Workers + R2)
 * --------------------------------------------------------------
 *  - POST   /upload        로그인 교인이 파일 업로드 → R2 저장 → { url, key } 반환
 *  - GET    /f/<key>       저장된 파일 보기/다운로드 (공개, 1년 캐시)
 *  - DELETE /f/<key>       본인이 올린 파일 삭제
 *
 *  - POST   /qt-audio-list       QT 낭독 음원 목록      (관리자)
 *  - POST   /qt-audio-delete     QT 낭독 음원 삭제      (관리자, x-qt-name)
 *  - POST   /bible-audio-list    성경읽기 음원 목록      (관리자)
 *  - POST   /bible-audio-delete  성경읽기 음원 삭제      (관리자, x-bible-name)
 *  - POST   /book-audio-list     오디오북 음원 목록      (관리자)
 *  - POST   /book-audio-delete   오디오북 음원 삭제      (관리자, x-book-name)
 *    목회행정 대시보드의 "AI 음성 생성"·"성경 음원 관리"·"오디오북 음원 관리" 카드가 쓴다.
 *    성경은 1189장이라 R2 목록 한도(1회 1000개)를 넘으므로 이어받아 모두 가져온다.
 *
 *  - POST   /book-audio-url      오디오북 재생 열쇠 발급 (정회원/관리자)
 *  - GET    /book-audio/<이름>    오디오북 재생          (열쇠 서명 확인 · Range 지원)
 *    책 «레위기에서 만난 예수 그리스도»는 판매 중인 책이라 음원을 공개하면 안 된다.
 *    그래서 오디오북만은 공개 경로(/f/)로 내보내지 않는다. 정회원임을 확인한 뒤
 *    짧은 기간(6시간)만 유효한 서명을 발급하고, 그 서명이 붙은 주소로만 들려준다.
 *    (주소에 개인정보를 담지 않는다 — 파일 이름과 만료 시각에 대한 서명뿐이다)
 *    Settings → Variables and Secrets 에 Secret 추가 필요:
 *         BOOK_AUDIO_SECRET  = (충분히 긴 무작위 문자열)
 *    미설정 시 오디오북 재생만 막히고 나머지 기능은 정상 동작한다.
 *
 *  ▼ 대시보드 설정(코드에 비밀키 안 넣음)
 *    1) R2 버킷 생성 (예: church-uploads)
 *    2) 이 Worker 생성 후 이 코드 붙여넣기
 *    3) Settings → Variables and Secrets 에 일반 변수 2개 추가
 *         SUPABASE_URL       = https://cetacttsdwzxjzkyozgd.supabase.co
 *         SUPABASE_ANON_KEY  = sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G
 *    4) Settings → Bindings → R2 bucket 추가
 *         변수 이름(Variable name) = BUCKET   ← 반드시 이 이름
 *         버킷 = 위에서 만든 church-uploads
 *    5) 배포(Deploy) 후 Worker 주소(...workers.dev)를 js/config.js 의
 *       window.R2_UPLOAD_URL 에 넣기
 *
 *  ▼ (선택) 무인 워커 업로드 — 주일 자료 자동 생성용
 *    tools/worship_worker.py 는 사람 로그인 없이 도는 프로그램이라
 *    사용자 토큰을 만들 수 없다. 그 경우에만 쓰는 전용 비밀키를 둔다.
 *      Settings → Variables and Secrets 에 Secret 추가
 *         WORKER_UPLOAD_KEY  = (충분히 긴 무작위 문자열)
 *    같은 값을 워커 PC 환경변수 WORKER_UPLOAD_KEY 에도 넣는다.
 *    이 키는 업로드만 허용하며 삭제에는 쓸 수 없다. 미설정 시 무인 업로드는 막힌다.
 ****************************************************************/

// 업로드를 허용할 출처(우리 홈페이지)
const ALLOW_ORIGINS = [
  "https://k-logos.com",
  "https://www.k-logos.com",
  "https://kds08200820-del.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];
const MAX_BYTES = 100 * 1024 * 1024; // 1건 최대 100MB (Cloudflare 무료 플랜 요청 본문 상한)

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    // x-worker-key 는 일부러 뺀다 — 브라우저에서 쓰라고 만든 키가 아니다.
    "Access-Control-Allow-Headers": "authorization, content-type, x-filename, x-folder, x-qt-name, x-bible-name, x-book-name",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, req) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// Supabase 토큰으로 로그인 사용자 확인
async function verifyUser(token, env) {
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) {
    return null;
  }
}

// 무인 워커 확인 — 길이가 같을 때만 비교하고, 자리마다 XOR 을 누적해
// 앞부분만 맞춰가며 키를 알아내는 시도(타이밍 공격)를 막는다.
function isWorkerKey(req, env) {
  const want = env.WORKER_UPLOAD_KEY || "";
  const got = req.headers.get("x-worker-key") || "";
  if (!want || want.length < 24 || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// 관리자인지 확인 — admins 테이블에 자기 행이 보이는지로 판단한다.
// (admins_select_self 정책 덕분에 본인 행은 본인 토큰으로 읽을 수 있다)
async function isAdmin(user, token, env) {
  try {
    const r = await fetch(
      env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/admins?select=uid&uid=eq." + user.id,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

// 정회원인지 확인 — member_links 의 본인 행을 본인 토큰으로 읽어 판단한다.
// (member_links_select 정책 덕분에 본인 행은 본인 토큰으로 읽을 수 있다)
async function isFullMember(user, token, env) {
  try {
    const r = await fetch(
      env.SUPABASE_URL.replace(/\/$/, "") +
        "/rest/v1/member_links?select=member_status&user_id=eq." + user.id,
      { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] && rows[0].member_status === "정회원";
  } catch (e) {
    return false;
  }
}

// ── 오디오북 재생 열쇠(서명) ──────────────────────────────────
// 파일 이름 + 만료 시각에 대한 HMAC. 주소에 개인정보를 담지 않으면서도
// 정회원 확인을 거친 사람만 그 주소를 만들 수 있게 한다.
function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function bookSign(name, exp, env) {
  const secret = env.BOOK_AUDIO_SECRET || "";
  if (!secret || secret.length < 24) return null;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${name}|${exp}`)
  );
  return hex(mac).slice(0, 40);
}
// 자리마다 XOR 을 누적해 앞부분만 맞춰가며 서명을 알아내는 시도를 막는다.
function sameSig(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 음원 관리 대상. 대시보드의 음원 카드들이 이 경로들을 부른다.
const AUDIO_ROUTES = {
  "/qt-audio-list": { prefix: "tts/", del: false },
  "/qt-audio-delete": { prefix: "tts/", del: true, nameHeader: "x-qt-name" },
  "/bible-audio-list": { prefix: "bible/", del: false },
  "/bible-audio-delete": { prefix: "bible/", del: true, nameHeader: "x-bible-name" },
  "/book-audio-list": { prefix: "audiobook/", del: false },
  "/book-audio-delete": { prefix: "audiobook/", del: true, nameHeader: "x-book-name" },
};

// 오디오북 저장 위치. 공개 /f/ 로 나가지 않는 유일한 폴더다.
const BOOK_PREFIX = "audiobook/";
const BOOK_TICKET_SEC = 6 * 60 * 60; // 재생 열쇠 유효 시간(6시간)

// 음원 업로드 대상. 교회PC의 무인 스크립트가 '이름을 지정해' 올린다.
//   · /upload 는 키를 <folder>/<owner>/<시각>-<난수> 로 만들기 때문에 쓸 수 없다.
//     홈페이지는 tts/qt-<날짜>-<지문>.wav 라는 정확한 이름으로 음성을 찾는다.
//   · 교회PC qt_tts_daily.mjs → POST /qt-audio (x-qt-name 헤더에 파일 이름)
const AUDIO_UPLOAD_ROUTES = {
  "/qt-audio": { prefix: "tts/", nameHeader: "x-qt-name" },
  "/bible-audio": { prefix: "bible/", nameHeader: "x-bible-name" },
  "/book-audio": { prefix: BOOK_PREFIX, nameHeader: "x-book-name" },
};

// R2 목록은 한 번에 1000개까지만 온다. 성경은 1189장이라 반드시 이어받아야 한다.
async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  for (let guard = 0; guard < 20; guard++) {
    const page = await bucket.list({ prefix, limit: 1000, cursor });
    for (const o of page.objects) {
      out.push({
        name: o.key.slice(prefix.length),
        size: o.size,
        created_at: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      });
    }
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return out;
}

function rand() {
  return Math.random().toString(36).slice(2, 10);
}

function safeExt(name) {
  const m = String(name || "").toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return m ? m[0] : "";
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(req) });
    }

    // ----- 오디오북 재생 (열쇠 서명 확인 · Range 지원) -----
    // 로그인 헤더를 붙일 수 없는 <audio> 태그가 부르는 자리라, 로그인 대신
    // 아래 /book-audio-url 이 발급한 짧은 서명으로 확인한다.
    if (req.method === "GET" && url.pathname.startsWith("/book-audio/")) {
      const name = decodeURIComponent(url.pathname.slice("/book-audio/".length));
      const exp = parseInt(url.searchParams.get("e") || "0", 10);
      const sig = url.searchParams.get("s") || "";
      if (!name || name.includes("/") || name.includes("..")) {
        return json({ error: "파일 이름이 올바르지 않습니다." }, 400, req);
      }
      if (!exp || exp * 1000 < Date.now()) {
        return json({ error: "재생 시간이 만료되었습니다. 새로고침 후 다시 들어 주세요." }, 401, req);
      }
      const want = await bookSign(name, exp, env);
      if (!want || !sameSig(want, sig)) {
        return json({ error: "재생 권한을 확인할 수 없습니다." }, 403, req);
      }
      const obj = await env.BUCKET.get(BOOK_PREFIX + name, { range: req.headers, onlyIf: req.headers });
      if (!obj) return new Response("Not found", { status: 404, headers: corsHeaders(req) });
      const h = new Headers(corsHeaders(req));
      obj.writeHttpMetadata(h);
      h.set("etag", obj.httpEtag);
      h.set("Accept-Ranges", "bytes");
      // 정회원에게만 들려주는 파일이라 중간 서버(CDN·회사망)에 남지 않게 한다.
      h.set("Cache-Control", "private, max-age=3600");
      let status = obj.body ? 200 : 304;
      if (obj.body && obj.range && typeof obj.range.offset === "number" && typeof obj.range.length === "number") {
        const start = obj.range.offset;
        const end = start + obj.range.length - 1;
        h.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
        h.set("Content-Length", String(obj.range.length));
        status = 206;
      } else if (obj.body) {
        h.set("Content-Length", String(obj.size));
      }
      return new Response(obj.body, { status, headers: h });
    }

    // ----- 파일 보기/다운로드 (공개) -----
    if (req.method === "GET" && url.pathname.startsWith("/f/")) {
      const key = decodeURIComponent(url.pathname.slice(3));
      // 오디오북은 판매 중인 책이라 공개 경로로 내보내지 않는다.
      if (key.startsWith(BOOK_PREFIX)) {
        return json({ error: "오디오북은 정회원 로그인 후 들을 수 있습니다." }, 403, req);
      }
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: corsHeaders(req) });
      const h = new Headers(corsHeaders(req));
      obj.writeHttpMetadata(h);
      h.set("etag", obj.httpEtag);
      h.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers: h });
    }

    // ----- 여기부터는 로그인(또는 무인 워커 키) 필요 -----
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await verifyUser(token, env);
    const isWorker = !user && isWorkerKey(req, env);
    if (!user && !isWorker) return json({ error: "로그인이 필요합니다. 다시 로그인 후 시도해 주세요." }, 401, req);

    // ----- 오디오북 재생 열쇠 발급 (정회원 또는 관리자) -----
    // 한 번 부르면 요청한 파일들에 대한 서명을 한꺼번에 돌려준다(챕터마다 왕복하지 않게).
    if (req.method === "POST" && url.pathname === "/book-audio-url") {
      if (!user) return json({ error: "로그인이 필요합니다." }, 401, req);
      if (!env.BOOK_AUDIO_SECRET || env.BOOK_AUDIO_SECRET.length < 24) {
        return json({ error: "오디오북 설정이 아직 끝나지 않았습니다(관리자 문의)." }, 503, req);
      }
      const ok = (await isFullMember(user, token, env)) || (await isAdmin(user, token, env));
      if (!ok) {
        return json({ error: "정회원만 들을 수 있습니다.", reason: "not-member" }, 403, req);
      }
      let names = [];
      try {
        const body = await req.json();
        names = Array.isArray(body && body.names) ? body.names : [];
      } catch (e) {}
      names = names
        .filter((n) => typeof n === "string" && n && !n.includes("/") && !n.includes("..") && n.length <= 200)
        .slice(0, 200);
      if (!names.length) return json({ error: "재생할 파일이 없습니다." }, 400, req);
      // 실제로 올라와 있는 장에만 서명을 준다 — 홈페이지가 '아직 없는 장'을 따로
      // 확인하러 다시 오지 않아도 되고, 없는 파일로 재생을 시도하지도 않는다.
      const have = new Set((await listAll(env.BUCKET, BOOK_PREFIX)).map((f) => f.name));
      const exp = Math.floor(Date.now() / 1000) + BOOK_TICKET_SEC;
      const files = {};
      for (const n of names) if (have.has(n)) files[n] = await bookSign(n, exp, env);
      return json({ ok: true, exp, base: `${url.origin}/book-audio/`, files }, 200, req);
    }

    // ----- 음원 목록·삭제 (관리자 전용) -----
    const audio = AUDIO_ROUTES[url.pathname];
    if (req.method === "POST" && audio) {
      if (!user || !(await isAdmin(user, token, env))) {
        return json({ error: "관리자만 사용할 수 있습니다." }, 403, req);
      }
      if (!audio.del) {
        const files = await listAll(env.BUCKET, audio.prefix);
        return json({ ok: true, files }, 200, req);
      }
      let name = req.headers.get(audio.nameHeader) || "";
      try { name = decodeURIComponent(name); } catch (e) {}
      // 파일 이름만 받는다 — 경로를 섞어 다른 폴더를 건드리지 못하게 한다.
      if (!name || name.includes("/") || name.includes("..")) {
        return json({ error: "파일 이름이 올바르지 않습니다." }, 400, req);
      }
      await env.BUCKET.delete(audio.prefix + name);
      return json({ ok: true, deleted: name }, 200, req);
    }

    // ----- 음원 업로드 (이름 지정 · 관리자 또는 무인 워커) -----
    // 교회PC 스크립트가 만든 낭독 음성을 홈페이지가 찾는 정확한 이름으로 저장한다.
    const audioUp = AUDIO_UPLOAD_ROUTES[url.pathname];
    if (req.method === "POST" && audioUp) {
      if (!isWorker && !(user && (await isAdmin(user, token, env)))) {
        return json({ error: "관리자만 사용할 수 있습니다." }, 403, req);
      }
      let name = req.headers.get(audioUp.nameHeader) || "";
      try { name = decodeURIComponent(name); } catch (e) {}
      // 파일 이름만 받는다 — 경로를 섞어 다른 폴더에 쓰지 못하게 한다.
      if (!name || name.includes("/") || name.includes("..") || name.length > 200) {
        return json({ error: "파일 이름이 올바르지 않습니다." }, 400, req);
      }
      if (!/\.(wav|mp3|m4a|ogg)$/i.test(name)) {
        return json({ error: "음성 파일(wav·mp3·m4a·ogg)만 올릴 수 있습니다." }, 400, req);
      }
      const upLen = parseInt(req.headers.get("Content-Length") || "0", 10);
      if (upLen > MAX_BYTES) {
        return json({ error: "파일이 너무 큽니다(최대 " + Math.round(MAX_BYTES / 1024 / 1024) + "MB)." }, 413, req);
      }
      if (!req.body) return json({ error: "빈 파일입니다." }, 400, req);
      const audioKey = audioUp.prefix + name;
      // 메모리에 담지 않고 R2로 바로 스트리밍(낭독 음성은 30MB를 넘는다)
      await env.BUCKET.put(audioKey, req.body, {
        httpMetadata: { contentType: req.headers.get("Content-Type") || "audio/wav" },
      });
      return json({ ok: true, url: `${url.origin}/f/${audioUp.prefix}${encodeURIComponent(name)}`, key: audioKey }, 200, req);
    }

    // ----- 업로드 -----
    if (req.method === "POST" && url.pathname === "/upload") {
      const folder = (req.headers.get("x-folder") || "uploads").replace(/[^a-zA-Z0-9_-]/g, "") || "uploads";
      let origName = req.headers.get("x-filename") || "file";
      try { origName = decodeURIComponent(origName); } catch (e) {}
      const ext = safeExt(origName);
      const ct = req.headers.get("Content-Type") || "application/octet-stream";
      const lenHeader = req.headers.get("Content-Length");
      const len = lenHeader ? parseInt(lenHeader, 10) : 0;
      const maxMB = Math.round(MAX_BYTES / 1024 / 1024);
      if (len > MAX_BYTES) return json({ error: "파일이 너무 큽니다(최대 " + maxMB + "MB)." }, 413, req);
      if (!req.body || len === 0) return json({ error: "빈 파일입니다." }, 400, req);
      // 무인 워커가 올린 것은 사람 파일과 섞이지 않게 system 아래 둔다.
      const owner = user ? user.id : "system";
      const key = `${folder}/${owner}/${Date.now()}-${rand()}${ext}`;
      // 메모리에 담지 않고 R2로 바로 스트리밍(큰 파일 안전)
      await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: ct } });
      const fileUrl = `${url.origin}/f/${key.split("/").map(encodeURIComponent).join("/")}`;
      return json({ url: fileUrl, key }, 200, req);
    }

    // ----- 삭제(본인 파일만) -----
    if (req.method === "DELETE" && url.pathname.startsWith("/f/")) {
      // 무인 워커 키로는 지울 수 없다 — 실수나 유출 시 피해를 업로드로만 묶어둔다.
      if (!user) return json({ error: "삭제는 로그인 후에만 가능합니다." }, 403, req);
      const key = decodeURIComponent(url.pathname.slice(3));
      if (!key.includes(`/${user.id}/`)) {
        return json({ error: "본인이 올린 파일만 삭제할 수 있습니다." }, 403, req);
      }
      await env.BUCKET.delete(key);
      return json({ ok: true }, 200, req);
    }

    return json({ error: "지원하지 않는 요청입니다." }, 404, req);
  },
};
