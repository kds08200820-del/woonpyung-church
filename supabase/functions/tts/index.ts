// Supabase Edge Function: tts — 글을 자연스러운 한국어 음성으로 (Google Gemini TTS)
// 주보 AI와 같은 GEMINI_API_KEY 를 그대로 재사용합니다.
//
// 배포(1회):
//   1) supabase functions deploy tts --project-ref cetacttsdwzxjzkyozgd
//   2) 시크릿 확인:  supabase secrets set GEMINI_API_KEY=AIza...   (이미 주보 AI에 설정돼 있으면 생략)
// 프런트에서 POST { text } → audio/wav 바이너리를 돌려줍니다.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_VOICE = "Kore"; // 차분한 여성 톤. 다른 후보: Charon(남), Puck, Aoede, Leda, Zephyr ...

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY 미설정 — Supabase 시크릿에 추가하세요." }, 500);
    const { text, voice } = await req.json().catch(() => ({} as any));
    const clean = String(text ?? "").trim();
    if (!clean) return json({ error: "text 없음" }, 400);
    const capped = clean.slice(0, 4000); // 비용·지연 상한(약 4천 자)
    const prompt =
      "다음 글을, 한국 교회 성도에게 들려주듯 따뜻하고 차분하며 또렷하게 낭독해 주세요. 문장 부호에 맞춰 자연스럽게 쉬세요:\n\n" +
      capped;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: String(voice || DEFAULT_VOICE) } } },
      },
    };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "TTS 생성 실패", detail: j?.error?.message || ("HTTP " + r.status) }, 502);

    const parts = j?.candidates?.[0]?.content?.parts || [];
    const part = parts.find((p: any) => p?.inlineData?.data);
    const data = part?.inlineData?.data;
    const mime = part?.inlineData?.mimeType || "audio/L16;rate=24000";
    if (!data) return json({ error: "오디오 응답 없음", detail: JSON.stringify(j).slice(0, 300) }, 502);

    const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
    const wav = pcmToWav(b64ToBytes(data), rate);
    return new Response(wav, { headers: { ...cors, "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return json({ error: "오류", detail: String((e as any)?.message || e) }, 500);
  }
});
