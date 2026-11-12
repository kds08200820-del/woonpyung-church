// Fish Audio 요청 모양(/v1/tts, format pcm)을 받아 교회 PC 의 GPT-SoVITS(QT 목소리)로 녹음해 돌려주는 다리.
//   node sovits_bridge.mjs [port=9881]      tts.mjs 는 FISH_API_URL=http://127.0.0.1:9881/v1/tts 로 부른다.
import http from 'node:http';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const V = JSON.parse(fs.readFileSync('C:/qt-video/tts_config.json', 'utf8'));
const API = V.api.replace(/\/$/, '');
const PORT = Number(process.argv[2] || 9881);
let loaded = false;
async function useVoice() {
  if (loaded) return;
  for (const [ep, p] of [['set_gpt_weights', V.gpt_weights], ['set_sovits_weights', V.sovits_weights]]) {
    const r = await fetch(`${API}/${ep}?weights_path=${encodeURIComponent(p)}`);
    if (!r.ok) throw new Error(`${ep} ${r.status}`);
  }
  loaded = true;
}
function sovits(text) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${API}/tts`);
    const payload = JSON.stringify({ text, text_lang: 'ko', ref_audio_path: V.ref_audio, prompt_text: V.prompt_text, prompt_lang: 'ko',
      text_split_method: 'cut5', speed_factor: V.speed, media_type: 'wav', streaming_mode: false, ...V.infer });
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => { const b = Buffer.concat(ch); res.statusCode === 200 && b.length > 1000 ? resolve(b) : reject(new Error(`sovits ${res.statusCode}: ${b.slice(0, 200)}`)); });
    });
    req.on('error', reject); req.setTimeout(600000, () => req.destroy(new Error('timeout'))); req.end(payload);
  });
}
http.createServer((req, res) => {
  const ch = []; req.on('data', (c) => ch.push(c));
  req.on('end', async () => {
    try {
      const b = JSON.parse(Buffer.concat(ch).toString('utf8'));
      const text = String(b.text || '').replace(/\[[^\]]*\]/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();   // Fish 지시 꼬리표는 뺀다
      await useVoice();
      const t0 = Date.now();
      const wav = await sovits(text);
      const ff = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', String(b.sample_rate || 44100), '-f', 's16le', 'pipe:1'], { input: wav, maxBuffer: 1 << 28 });
      if (ff.status !== 0) throw new Error('ffmpeg ' + ff.stderr);
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s → ${(ff.stdout.length / 2 / (b.sample_rate || 44100)).toFixed(2)}s  ${text.slice(0, 30)}`);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(ff.stdout);
    } catch (e) { console.error(String(e)); res.writeHead(500); res.end(String(e)); }
  });
}).listen(PORT, '127.0.0.1', () => console.log('bridge on', PORT));
