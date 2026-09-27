// 성경 기록 동기화 — 설교자의 성경(PC)이 메모·형광펜·활동 기록을 담임목사 계정(modu_*)과 주고받는다 (2026-09-27)
//   인증: 앱의 license.json 에 있는 서명된 허가증 {token, sig} (license 함수가 Ed25519 로 서명한 것)
//         → 서명·만료 확인 → 허가증의 코드 해시(ch)가 sync_owners 에 있을 때만 그 계정으로 읽고 쓴다
//         → 다른 코드는 { ok:false, why:"not-owner" } — 담임목사 한 사람만 쓴다
//   POST { token, sig, op:"pull", since }                         → { ok, now, notes[], highlights[], tombstones[], activity[] }
//   POST { token, sig, op:"push", notes[], deletes[], hl_set[], hl_del[], activity[] } → { ok, now, ids:{ [local]: remoteId } }
//   배포: npx supabase functions deploy bible-sync --no-verify-jwt --project-ref cetacttsdwzxjzkyozgd

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUB_B64 = "KoiIBei45cvp5Im6pXmB2YDoJqwE/2wL1XLew68gdh8=";   // license 함수 서명의 공개키 (license-main.js 와 같음)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSONH = { ...CORS, "Content-Type": "application/json" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: JSONH });
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

function b64dec(s: string) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
function b64urlText(s: string) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = b + "===".slice((b.length + 3) % 4);
  return decodeURIComponent(escape(atob(pad)));
}
async function verify(token: string, sig: string) {
  const key = await crypto.subtle.importKey("raw", b64dec(PUB_B64), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, b64dec(sig), new TextEncoder().encode(token));
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;
const cut = (s: unknown, n: number) => String(s ?? "").slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return out({ ok: false, why: "bad-json" }, 400); }

  // ── 허가증 확인 ──
  const token = String(b.token ?? ""), sig = String(b.sig ?? "");
  if (!token || !sig) return out({ ok: false, why: "no-token" }, 401);
  let ok = false; try { ok = await verify(token, sig); } catch { ok = false; }
  if (!ok) return out({ ok: false, why: "bad-sig" }, 401);
  let t: Record<string, any>; try { t = JSON.parse(b64urlText(token)); } catch { return out({ ok: false, why: "bad-token" }, 401); }
  if (!t.exp || t.exp * 1000 < Date.now()) return out({ ok: false, why: "expired" }, 401);
  const owner = await rest(`sync_owners?code_hash=eq.${enc(String(t.ch))}&select=user_id,label`);
  if (!owner?.length) return out({ ok: false, why: "not-owner" }, 403);
  const lic = await rest(`app_licenses?code_hash=eq.${enc(String(t.ch))}&select=revoked,pc_id`);
  if (!lic?.length || lic[0].revoked || (lic[0].pc_id && lic[0].pc_id !== t.pid)) return out({ ok: false, why: "revoked" }, 403);
  const uid: string = owner[0].user_id;
  const now = new Date().toISOString();
  const device = cut(b.device || owner[0].label || "PC", 40);

  try {
    if (b.op === "pull") {
      const since = b.since ? new Date(b.since).toISOString() : "1970-01-01T00:00:00Z";
      const u = `user_id=eq.${uid}`;
      const [notes, highlights, tombstones, activity] = await Promise.all([
        rest(`modu_notes?${u}&updated_at=gt.${enc(since)}&select=id,ref,book,title,theme,content,tags,links,created_at,updated_at&order=updated_at.asc&limit=5000`),
        rest(`modu_highlights?${u}&select=bi,ci,vi,color,ref,created_at&limit=20000`),
        rest(`modu_tombstones?${u}&at=gt.${enc(since)}&select=kind,key,at&order=at.asc&limit=5000`),
        rest(`modu_activity?${u}&at=gt.${enc(since)}&select=id,kind,ref,book,label,data,device,at&order=at.desc&limit=3000`),
      ]);
      return out({ ok: true, now, notes, highlights, tombstones, activity });
    }

    if (b.op === "push") {
      const ids: Record<string, number> = {};
      // 메모: remote id 가 있으면 고치고(더 새것일 때만), 없으면 새로 넣는다
      for (const n of (Array.isArray(b.notes) ? b.notes : []).slice(0, 500)) {
        const row = { user_id: uid, ref: cut(n.ref, 200), book: cut(n.book, 40), title: cut(n.title, 300) || "제목 없음", theme: cut(n.theme, 200),
          content: cut(n.content, 200000), tags: cut(n.tags, 1000), links: Array.isArray(n.links) ? n.links.slice(0, 200).map((x: unknown) => cut(x, 300)) : [],
          updated_at: n.updated_at ? new Date(n.updated_at).toISOString() : now };
        if (n.rid) {
          const cur = await rest(`modu_notes?id=eq.${Number(n.rid)}&user_id=eq.${uid}&select=id,updated_at`);
          if (cur?.length) {
            if (new Date(cur[0].updated_at) <= new Date(row.updated_at)) await rest(`modu_notes?id=eq.${Number(n.rid)}&user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } });
            ids[String(n.local)] = Number(n.rid); continue;
          }
        }
        // 같은 제목·내용이 이미 있으면 새로 만들지 않고 이어 붙인다 (처음 합칠 때 겹침 방지)
        const same = await rest(`modu_notes?user_id=eq.${uid}&title=eq.${enc(row.title)}&select=id,content`);
        const dup = (same ?? []).find((x: any) => x.content === row.content);
        if (dup) { ids[String(n.local)] = dup.id; continue; }
        const ins = await rest(`modu_notes`, { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=representation" } });
        ids[String(n.local)] = ins[0].id;
      }
      for (const rid of (Array.isArray(b.deletes) ? b.deletes : []).slice(0, 500)) {
        await rest(`modu_notes?id=eq.${Number(rid)}&user_id=eq.${uid}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      }
      const hs = (Array.isArray(b.hl_set) ? b.hl_set : []).slice(0, 5000).map((h: any) => ({ user_id: uid, bi: h.bi | 0, ci: h.ci | 0, vi: h.vi | 0, color: cut(h.color, 20), ref: cut(h.ref, 100) }));
      if (hs.length) await rest(`modu_highlights?on_conflict=user_id,bi,ci,vi`, { method: "POST", body: JSON.stringify(hs), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
      for (const h of (Array.isArray(b.hl_del) ? b.hl_del : []).slice(0, 5000)) {
        await rest(`modu_highlights?user_id=eq.${uid}&bi=eq.${h.bi | 0}&ci=eq.${h.ci | 0}&vi=eq.${h.vi | 0}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      }
      const acts = (Array.isArray(b.activity) ? b.activity : []).slice(0, 2000).map((a: any) => ({ user_id: uid, kind: cut(a.kind, 30), ref: cut(a.ref, 200), book: cut(a.book, 40),
        label: cut(a.label, 300), data: a.data && typeof a.data === "object" ? a.data : {}, device, at: a.at ? new Date(a.at).toISOString() : now }));
      if (acts.length) await rest(`modu_activity`, { method: "POST", body: JSON.stringify(acts), headers: { Prefer: "return=minimal" } });
      return out({ ok: true, now, ids });
    }
    return out({ ok: false, why: "bad-op" }, 400);
  } catch (e) {
    return out({ ok: false, why: "server", msg: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
});
