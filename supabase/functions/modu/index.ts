// ============================================================
//  2026 모두의 성경(모바일 PWA) — 서버 함수
//  · op:'me'        로그인한 정회원(또는 관리자)인지 확인하고 주석 열쇠·배포 중인 모바일 판을 돌려준다
//  · op:'translate' 영어 주석 번역 중계 (브라우저에서는 CORS 로 막히므로 여기서 대신 부른다)
//  배포: supabase functions deploy modu --no-verify-jwt   (로그인은 여기서 직접 검사한다)
//  비밀키: COMMENTARY_KEY (license 함수와 같은 것)
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const COMMENTARY_KEY = Deno.env.get("COMMENTARY_KEY") ?? "";

const ALLOW_ORIGINS = [
  "https://k-logos.com",
  "https://www.k-logos.com",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];
function corsHeaders(origin: string) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
async function svc(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.ok ? await r.json() : [];
}
function cmp(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

// ── 번역 중계 (설교자의 성경 main.js 의 방식과 같다) ──
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function gtranslate(text: string, sl: string, tl: string): Promise<{ ok: boolean; text?: string; why?: string }> {
  sl = encodeURIComponent(sl || "auto"); tl = encodeURIComponent(tl || "ko");
  const q = encodeURIComponent(text);
  const ways = [
    { url: `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=${tl}&q=${q}`,
      parse: (j: unknown) => Array.isArray(j) ? (Array.isArray(j[0]) ? j[0][0] : j[0]) : (j as { sentences?: { trans: string }[] }).sentences?.map(s => s.trans).join("") },
    { url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${q}`,
      parse: (j: unknown) => Array.isArray(j) && Array.isArray(j[0]) ? j[0].map((s: string[]) => s[0]).join("") : "" },
  ];
  let why = "";
  for (const w of ways) {
    try {
      const r = await fetch(w.url, { headers: { "User-Agent": UA } });
      if (r.ok) { const out = w.parse(await r.json()); if (out) return { ok: true, text: String(out) }; why = "bad-response"; }
      else why = "HTTP " + r.status;
    } catch (e) { why = String((e as Error).message || e); }
  }
  return { ok: false, why };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, why: "method" }, cors, 405);

  // 1) 로그인 검사
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ ok: false, why: "login_required" }, cors, 401);
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } });
  if (!userRes.ok) return json({ ok: false, why: "login_required" }, cors, 401);
  const user = await userRes.json();
  const uid = String(user.id || "");

  // 2) 정회원(교적 인증) 또는 관리자
  const [links, admins] = await Promise.all([
    svc(`member_links?user_id=eq.${uid}&select=member_status,member_name`),
    svc(`admins?uid=eq.${uid}&select=uid`),
  ]);
  const isAdmin = Array.isArray(admins) && admins.length > 0;
  const status = Array.isArray(links) && links[0] ? String(links[0].member_status || "") : "";
  const isMember = status === "정회원" || isAdmin;
  const name = Array.isArray(links) && links[0] ? String(links[0].member_name || "") : "";

  const body = await req.json().catch(() => ({}));
  const op = String(body.op || "me");

  if (op === "me") {
    if (!isMember) return json({ ok: false, why: "not_member", status }, cors, 403);
    const rels = await svc(`modu_release?enabled=eq.true&select=version,notes,updated_at`);
    const latest = Array.isArray(rels) && rels.length ? rels.sort((a, b) => cmp(b.version, a.version))[0] : null;
    return json({ ok: true, uid, name, admin: isAdmin, dk: COMMENTARY_KEY, release: latest }, cors);
  }
  if (op === "translate") {
    if (!isMember) return json({ ok: false, why: "not_member" }, cors, 403);
    const text = String(body.text || "").slice(0, 20000);
    if (!text.trim()) return json({ ok: false, why: "empty" }, cors);
    const parts: string[] = []; let cur = "";
    text.split(/(?<=[.!?…]["”’)]?\s)|\n+/).forEach(p => { if ((cur + p).length > 1800 && cur) { parts.push(cur); cur = p; } else cur += p; });
    if (cur) parts.push(cur);
    const outs: string[] = [];
    for (const p of parts) { const r = await gtranslate(p, String(body.sl || ""), String(body.tl || "")); if (!r.ok) return json(r, cors); outs.push(r.text || ""); }
    return json({ ok: true, text: outs.join("\n") }, cors);
  }
  return json({ ok: false, why: "unknown-op" }, cors, 400);
});
