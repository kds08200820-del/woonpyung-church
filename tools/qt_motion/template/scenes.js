/*
 * scenes.js — 운평장로교회 매일 QT 모션 영상 틀.
 * 장면은 손으로 짜지 않는다. js/plan.js 의 window.PLAN(그날의 계획)을 읽어 화면을 만들고,
 * 모든 움직임을 음성 큐(c01…)에 묶는다. 계획의 모양은 tools/qt_motion/README.md 참고.
 *
 * 장면 종류: title(여는 화면) · shot(로컬 AI 그림 + 이름표) · verse(말씀) · say(한 문장) · triple(그림 세 칸) · end(맺음)
 */
Video.define(async ({ tl, cue, cues, scene, gsap }) => {
  const P = window.PLAN, stage = document.getElementById('stage');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const br = (s) => esc(s).replace(/\n/g, '<br>');
  const add = (html, parent = stage) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstChild; parent.appendChild(e); return e; };
  const last = cues[cues.length - 1];

  // 큐 안의 구절이 말해지는 때 (구절이 없거나 틀리면 큐 시작 조금 뒤)
  const when = (a, lead = 0.15) => {
    const c = cue(a.cue);
    if (a.phrase && c.text.includes(a.phrase)) return Math.max(c.start + 0.05, c.about(a.phrase) - lead);
    return c.start + 0.3;
  };

  // 값 줄: 앞 값에서 다음 값으로 (건너뛰어 봐도 같은 그림)
  const track = (target, init, keys) => {
    gsap.set(target, init);
    let prev = init;
    for (const k of keys) {
      const from = {}; for (const p in k.to) from[p] = prev[p];
      tl.fromTo(target, from, { ...k.to, duration: k.d, ease: k.ease || 'sine.inOut', immediateRender: false }, k.at);
      prev = { ...prev, ...k.to };
    }
  };
  const layer = (el, t0, t1, fade = 0.45) => {
    scene(el, Math.max(0, t0 - 0.05), t1 == null ? null : t1 + fade + 0.05);
    const keys = [];
    if (t0 > 0.01) keys.push({ at: t0, d: fade, to: { opacity: 1 } });
    if (t1 != null) keys.push({ at: t1, d: fade, to: { opacity: 0 } });
    track(el, { opacity: t0 > 0.01 ? 0 : 1 }, keys);
  };
  const pop = (el, t0, t1, rot = -2) => {
    gsap.set(el, { autoAlpha: 0, scale: 0.6, rotation: rot, transformOrigin: '0% 100%' });
    tl.fromTo(el, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.38, ease: 'back.out(2.2)', immediateRender: false }, t0);
    if (t1 != null) tl.fromTo(el, { autoAlpha: 1, scale: 1 }, { autoAlpha: 0, scale: 0.9, duration: 0.25, ease: 'power2.in', immediateRender: false }, t1 - 0.25);
  };
  const rise = (el, t0, t1, y = 40) => {
    gsap.set(el, { autoAlpha: 0, y });
    tl.fromTo(el, { autoAlpha: 0, y }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out', immediateRender: false }, t0);
    if (t1 != null) tl.fromTo(el, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -20, duration: 0.3, ease: 'power2.in', immediateRender: false }, t1 - 0.3);
  };

  // 그림이 천천히 움직이는 길 (장면마다 번갈아)
  const DRIFT = [
    [{ scale: 1.04, x: -20, y: 0 }, { scale: 1.2, x: 40, y: -30 }],
    [{ scale: 1.22, x: 60, y: -20 }, { scale: 1.05, x: -30, y: 0 }],
    [{ scale: 1.05, x: 0, y: -40 }, { scale: 1.22, x: 0, y: 40 }],
    [{ scale: 1.25, x: 0, y: -160 }, { scale: 1.08, x: 0, y: 60 }],
    [{ scale: 1.2, x: 0, y: 30 }, { scale: 1.04, x: 0, y: 0 }],
  ];

  // ───────── 장면의 시작·끝 ─────────
  const S = P.scenes.map((s) => ({ ...s }));
  S.forEach((s, i) => { s.t0 = i === 0 ? 0 : (s.type === 'end' && !s.from ? last.end + 0.5 : cue(s.from).start); });
  S.forEach((s, i) => { s.t1 = i + 1 < S.length ? S[i + 1].t0 : null; });

  // 화면을 먼저 다 만들고(그림 읽기까지) 그다음 시간표를 짠다
  let shotNo = 0;
  for (const s of S) {
    if (s.type === 'shot') {
      s.el = add(`<div class="shot"><img src="assets/user/${esc(s.image)}.jpg" alt=""></div>`);
      s.tags = (s.labels || []).slice(0, 2).map((l, i) => add(`<div class="pill tag ${i ? 'low' : 'high'}${l.warn ? ' warn' : ''}">${esc(l.text)}</div>`));
      if (s.verse) s.over = add(`<p class="verse over">${br(s.verse.text)}<i>${esc(s.verse.ref || '')}</i></p>`);
    } else if (s.type === 'title') {
      s.el = add(`<section class="card"><div class="pill kick">${esc(P.kicker || '')}</div><h1>${esc(s.big || '')}<b>${esc(s.small || '')}</b></h1><p class="title sub">${br(s.title || '')}</p></section>`);
    } else if (s.type === 'verse') {
      s.el = add(`<section class="card"><p class="verse">${br(s.text)}<i>${esc(s.ref || '')}</i></p></section>`);
    } else if (s.type === 'say') {
      s.el = add(`<section class="card ${s.tone === 'paper' ? '' : 'blue'}"><p class="say ${s.tone === 'paper' ? 'ink' : ''}">${br(s.text)}</p></section>`);
    } else if (s.type === 'triple') {
      s.el = add(`<section class="card"><p class="say ink head">${br(s.heading || '')}</p>${(s.panels || []).slice(0, 3).map((p, i) =>
        `<div class="panel pn${i + 1}"><img src="assets/user/${esc(p.image)}.jpg" alt=""><div class="pill">${esc(p.label)} <small>${esc(p.sub || '')}</small></div></div>`).join('')}</section>`);
    } else if (s.type === 'end') {
      s.el = add(`<section class="card"><p class="title">${br(s.title || P.title || '')}</p><div class="pill ref">${esc(s.ref || '')}</div></section>`);
    }
  }
  await Promise.all([...stage.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));

  for (const s of S) {
    if (!s.el) continue;
    layer(s.el, s.t0, s.t1);
    const out = s.t1 == null ? null : s.t1 - 0.05;
    if (s.type === 'shot') {
      const [a, b] = DRIFT[shotNo++ % DRIFT.length], img = s.el.querySelector('img');
      gsap.set(img, { transformOrigin: '50% 50%', ...a });
      tl.fromTo(img, a, { ...b, duration: (s.t1 == null ? last.end + 4 : s.t1) - s.t0 + 1.0, ease: 'none', immediateRender: false }, Math.max(0, s.t0 - 0.1));
      s.tags.forEach((el, i) => {
        const l = s.labels[i], t = when(l), nextT = s.labels[i + 1] && i + 1 < 2 ? null : out;
        const end = l.until ? cue(l.until).end + 0.2 : (i === 0 && s.labels[1] ? Math.max(t + 1.6, when(s.labels[1]) + 1.2) : out);
        pop(el, t, end == null ? null : Math.min(end, out == null ? end : out), i ? 2 : -2);
      });
      if (s.over) rise(s.over, when(s.verse.at || { cue: s.from }), out);
    } else if (s.type === 'title') {
      pop(s.el.querySelector('.kick'), 0.2, null, -1.5);
      rise(s.el.querySelector('h1'), 0.25, null, 50);
      rise(s.el.querySelector('.sub'), s.titleAt ? when(s.titleAt) : Math.min(2.2, (s.t1 || 4) * 0.5), null, 40);
    } else if (s.type === 'verse') {
      rise(s.el.querySelector('.verse'), s.t0 + 0.25, null);
    } else if (s.type === 'say') {
      rise(s.el.querySelector('.say'), s.t0 + 0.25, null);
    } else if (s.type === 'triple') {
      rise(s.el.querySelector('.head'), s.t0 + 0.2, null);
      [...s.el.querySelectorAll('.panel')].forEach((el, i) => {
        const p = s.panels[i], t = p.cue ? when(p, 0.2) : s.t0 + 0.8 + i * 0.9;
        gsap.set(el, { autoAlpha: 0, x: 120 });
        tl.fromTo(el, { autoAlpha: 0, x: 120 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power3.out', immediateRender: false }, t);
      });
    } else if (s.type === 'end') {
      rise(s.el.querySelector('.title'), s.t0 + 0.3, null, 50);
      pop(s.el.querySelector('.ref'), s.t0 + 0.9, null, -1.5);
    }
  }
  tl.to({}, { duration: 0.01 }, last.end + (P.tail || 4.2) - 0.02);   // 끝 화면을 붙든다
});
