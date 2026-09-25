// ============================================================
//  설교자의 성경 — 설치 등록·월 인증 Edge Function
//  설치 마법사와 앱이 부른다. 로그인 없이 부르되, 식별 코드 해시로만 찾는다.
//    POST { op: "activate" | "verify" | "release", code, pc_id, pc_info:{name,board,os}, app, user?:{name,email} }
//    → { ok:true, token, sig, dk }  (token = base64url JSON, sig = Ed25519 서명, dk = 주석 암호화 열쇠)
//    → { ok:false, why: "no-code" | "in-use" | "revoked" | "mismatch" }
//  배포: supabase functions deploy license --no-verify-jwt --project-ref cetacttsdwzxjzkyozgd
//  비밀키: supabase secrets set LICENSE_SIGN_KEY=(Ed25519 개인키 32바이트 base64) --project-ref cetacttsdwzxjzkyozgd
//  공개키는 앱(license-main.js)에 들어 있다. 개인키는 여기(서버)에만 둔다.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGN_KEY = Deno.env.get("LICENSE_SIGN_KEY") ?? "";
const COMMENTARY_KEY = Deno.env.get("COMMENTARY_KEY") ?? "";   // 주석 암호화 열쇠 — 인증된 컴퓨터에만 내려 준다
const VALID_DAYS = 35;   // 허가증 유효 기간 — 앱은 한 달마다 다시 인증한다

const JSONH = { "Content-Type": "application/json" };
function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSONH });
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function b64url(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sign(msg: string) {
  // 원시 32바이트 개인키 → PKCS#8
  const raw = Uint8Array.from(atob(SIGN_KEY), (c) => c.charCodeAt(0));
  const pkcs8 = new Uint8Array([...Uint8Array.from(atob("MC4CAQAwBQYDK2VwBCIEIA=="), (c) => c.charCodeAt(0)), ...raw]);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
async function findRow(hash: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_licenses?code_hash=eq.${hash}&select=*`, { headers: H });
  const j = await r.json();
  return Array.isArray(j) && j.length ? j[0] : null;
}
async function patchRow(id: number, body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_licenses?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ ok: false, why: "method" }, 405);
  if (!SIGN_KEY || !SERVICE_KEY) return out({ ok: false, why: "server-not-configured" }, 500);
  let b: any;
  try { b = await req.json(); } catch { return out({ ok: false, why: "bad-json" }, 400); }

  const op = b.op === "verify" ? "verify" : "activate";
  const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pcId = String(b.pc_id ?? "").trim();
  if (code.length !== 16 || !/^[0-9a-f]{64}$/.test(pcId)) return out({ ok: false, why: "no-code" });
  const info = b.pc_info ?? {};
  const cut = (s: unknown, n: number) => String(s ?? "").slice(0, n);

  const hash = await sha256(code);
  const row = await findRow(hash);
  if (!row) return out({ ok: false, why: "no-code" });
  if (row.revoked) return out({ ok: false, why: "revoked" });

  // 설치 영구 삭제 — 같은 PC 에서 온 요청일 때만 PC 정보를 지운다. 코드는 다른 컴퓨터에서 다시 쓸 수 있다.
  if (b.op === "release") {
    if (row.pc_id && row.pc_id !== pcId) return out({ ok: false, why: "mismatch" });
    const ok = await patchRow(row.id, { pc_id: null, pc_name: null, pc_board: null, pc_os: null, activated_at: null,
      note: cut(`${row.note ?? ""}\n${new Date().toISOString().slice(0, 16)} 사용자가 설치 영구 삭제`, 1000).trim() });
    return out({ ok });
  }
  const now = new Date();
  const patch: Record<string, unknown> = {
    last_verified_at: now.toISOString(),
    verify_count: (row.verify_count ?? 0) + 1,
    app_version: cut(b.app, 20),
  };
  // 사용자 등록(이름·교회, 이메일) — 설치 마법사나 앱의 등록 창이 보낸다. 업그레이드 안내에 쓴다.
  const u = b.user ?? null;
  if (u && (u.name || u.email)) {
    const email = cut(u.email, 120).trim();
    if (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Object.assign(patch, { user_name: cut(u.name, 80).trim(), user_email: email, registered_at: now.toISOString() });
    }
  }
  if (!row.pc_id) {
    // 빈 코드 → 이 PC 에 묶는다 (관리자가 PC 정보를 지우면 다시 설치할 수 있다)
    Object.assign(patch, {
      pc_id: pcId, pc_name: cut(info.name, 60), pc_board: cut(info.board, 120), pc_os: cut(info.os, 80),
      activated_at: now.toISOString(),
    });
  } else if (row.pc_id !== pcId) {
    return out({ ok: false, why: op === "activate" ? "in-use" : "mismatch" });
  }
  let userSaved = false;
  if (!(await patchRow(row.id, patch))) {
    // 등록 칸이 아직 없으면(마이그레이션 전) 등록 정보 없이 다시 저장
    delete patch.user_name; delete patch.user_email; delete patch.registered_at;
    await patchRow(row.id, patch);
  } else userSaved = "user_name" in patch;

  const exp = Math.floor(now.getTime() / 1000) + VALID_DAYS * 86400;
  const token = b64url(JSON.stringify({ ch: hash, pid: pcId, iat: Math.floor(now.getTime() / 1000), exp, label: cut(row.label, 40), no: row.no }));
  const sig = await sign(token);
  return out({ ok: true, token, sig, exp, dk: COMMENTARY_KEY || undefined, user_saved: userSaved });
});
