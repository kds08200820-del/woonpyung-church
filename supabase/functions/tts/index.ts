// Supabase Edge Function: tts — 글을 자연스러운 한국어 음성으로 (Google Gemini TTS)
// 주보 AI와 같은 GEMINI_API_KEY 를 그대로 재사용합니다.
//
// ✅ 캐시: 한 번 만든 음성은 Supabase Storage(tts-cache 버킷)에 저장해 두고,
//    같은 글은 다시 생성하지 않고 저장본을 돌려줍니다(모든 성도·모든 재생에 적용 → 사실상 무료 재생).
//
// 배포(1회):
//   1) 버킷 생성:   Supabase ▸ SQL Editor 에서 supabase/tts_cache_bucket.sql 실행
//   2) 함수 배포:   supabase functions deploy tts --project-ref cetacttsdwzxjzkyozgd
//   3) 시크릿:      GEMINI_API_KEY (주보 AI에 이미 있으면 생략). SUPABASE_URL/SERVICE_ROLE_KEY는 자동 주입.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_VOICE = "Kore"; // 40대 여성 느낌의 차분·또렷한 성인 여성(정상 작동 확인). 후보: Aoede·Leda. ※Autonoe·Gacrux·Sulafat·Vindemiatrix는 빈응답 버그로 금지
const CACHE_BUCKET = "tts-cache";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const wavHeaders = { ...cors, "Content-Type": "audio/wav", "Cache-Control": "public, max-age=604800" };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// PCM(16-bit LE, mono) → WAV (브라우저 <audio> 재생용)
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const numCh = 1, bps = 16;
  const blockAlign = (numCh * bps) / 8;
  const byteRate = sampleRate * blockAlign;
  const buf = new ArrayBuffer(44 + pcm.length);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, byteRate, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bps, true);
  ws(36, "data"); dv.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function cacheGet(path: string): Promise<Uint8Array | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${CACHE_BUCKET}/${path}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}
async function cachePut(path: string, wav: Uint8Array): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${CACHE_BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "audio/wav", "x-upsert": "true" },
      body: wav,
    });
  } catch { /* 캐시 저장 실패는 무시(재생은 정상) */ }
}
// 생성 기록(관리자 대시보드 열람용). 실패해도 재생엔 영향 없음.
async function logGen(row: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tts_log`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch { /* 로그 실패 무시 */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY 미설정 — Supabase 시크릿에 추가하세요." }, 500);
    const { text, voice, date, sig } = await req.json().catch(() => ({} as any));
    const clean = String(text ?? "").trim();
    if (!clean) return json({ error: "text 없음" }, 400);
    const capped = clean.slice(0, 12000); // 사실상 제한 없음(QT는 최대 ~4천 자). 폭주 방지용 안전 상한만.
    const voiceName = String(voice || DEFAULT_VOICE);

    // 1) 캐시 확인 — 날짜(+내용지문 sig)가 오면 qt-<날짜>-<sig>.wav(프런트가 이 경로로 스트리밍).
    //    sig가 내용에 따라 바뀌므로 QT를 수정하면 새 파일이 만들어져 옛 음성을 재사용하지 않는다.
    const dateOk = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const sigOk = typeof sig === "string" && /^[a-z0-9]{1,12}$/.test(sig);
    const path = dateOk
      ? (sigOk ? `qt-${date}-${sig}.wav` : `qt-${date}.wav`)
      : (await sha256hex(voiceName + "|" + capped)) + ".wav";
    const cached = await cacheGet(path);
    if (cached) return new Response(cached, { headers: { ...wavHeaders, "X-TTS-Cache": "hit" } });

    // 2) 없으면 Gemini로 생성.
    //    Gemini TTS 미리보기 모델은 가끔 오디오 없이 finishReason:OTHER(빈 응답)를 돌려주는
    //    알려진 버그가 있어(긴 본문일수록 잦음), 오디오가 나올 때까지 최대 5회 재시도한다.
    const prompt =
      "다음 글을, 40대 중후반 여성의 따뜻하고 차분한 목소리로 또렷하게 낭독해 주세요.\n" +
      "낭독 규칙:\n" +
      "1) 성경 본문에서 각 절 앞의 절 번호(1, 2, 3 같은 숫자)는 소리 내어 읽지 말고, 내용만 매끄럽게 이어서 읽으세요.\n" +
      "2) '마5:1-11'이나 '시편 110:1-7'처럼 나오는 성경 구절 표기는 책 이름을 풀어서, 콜론(:)은 '장'으로(단, 시편은 '편'으로), 붙임표(-)는 '에서'로 읽으세요. 예: '마5:1-11' → '마태복음 5장 1절에서 11절'.\n" +
      "3) 문장 부호에 맞춰 자연스럽게 쉬세요.\n\n" +
      capped;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    };
    let data: string | undefined;
    let mime = "audio/L16;rate=24000";
    let lastDetail = "";
    for (let attempt = 0; attempt < 5 && !data; attempt++) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body) },
      );
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastDetail = j?.error?.message || ("HTTP " + r.status);
        if (r.status === 429 || r.status >= 500) continue;   // 일시적 오류만 재시도
        return json({ error: "TTS 생성 실패", detail: lastDetail }, 502);
      }
      const part = (j?.candidates?.[0]?.content?.parts || []).find((p: any) => p?.inlineData?.data);
      if (part?.inlineData?.data) {
        data = part.inlineData.data;
        mime = part.inlineData.mimeType || mime;
      } else {
        lastDetail = "빈 응답(finishReason OTHER) — 재시도";   // 알려진 버그: 다시 시도
      }
    }
    if (!data) return json({ error: "오디오 생성 실패(재시도 후에도 빈 응답)", detail: lastDetail }, 502);

    const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
    const wav = pcmToWav(b64ToBytes(data), rate);

    // 3) 캐시에 저장(다음부터는 공짜 재생) — 저장 실패해도 이번 재생은 정상
    await cachePut(path, wav);
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${CACHE_BUCKET}/${path}`;
    await logGen({ qt_date: (typeof date === "string" && date) ? date : null, label: capped.slice(0, 60), url: publicUrl, bytes: wav.length, voice: voiceName });
    return new Response(wav, { headers: { ...wavHeaders, "X-TTS-Cache": "miss" } });
  } catch (e) {
    return json({ error: "오류", detail: String((e as any)?.message || e) }, 500);
  }
});
