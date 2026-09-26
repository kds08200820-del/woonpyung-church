/* 2026 모두의 성경(모바일 PWA) — 브라우저용 브리지
   데스크탑(Electron) preload 가 주던 창(APPINFO·TTS·WEB·PRINT·NOTES·HLDB·COMMDATA·LICENSE·UPDATE)을
   브라우저·Supabase 로 똑같은 모양으로 만들어 준다. 원어 음성(AUDIO·REC)은 없다.
   설정값은 config.js(window.MODU) 에서 온다: version, dataBase, supabaseUrl, anonKey. */
(function(){
  var M = window.MODU || {};
  var FN = (M.supabaseUrl || '') + '/functions/v1/modu';
  var sb = null, me = null, dk = null;         /* me: 서버가 확인한 정회원 정보 · dk: 주석 열쇠(메모리에만) */

  window.APPINFO = { title: M.title || '2026 모두의 성경' };

  /* ── Supabase 클라이언트 (홈페이지와 같은 계정 저장소를 쓴다 → 사이트에서 로그인했으면 그대로 이어진다) ── */
  function client(){
    if(sb) return sb;
    if(!window.supabase || !M.supabaseUrl) return null;
    sb = window.supabase.createClient(M.supabaseUrl, M.anonKey);
    return sb;
  }
  function session(){ var c = client(); return c ? c.auth.getSession().then(function(r){ return r.data && r.data.session || null; }) : Promise.resolve(null); }
  function callFn(body){
    return session().then(function(s){
      if(!s) return { ok:false, why:'login_required' };
      return fetch(FN, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + s.access_token, 'apikey': M.anonKey }, body: JSON.stringify(body) })
        .then(function(r){ return r.json(); })
        .catch(function(e){ return { ok:false, offline:true, why:String(e && e.message || e) }; });
    });
  }

  /* ── TTS: 브라우저 음성 합성 ── */
  var synth = window.speechSynthesis || null;
  function voices(){
    if(!synth) return [];
    return synth.getVoices().map(function(v){ return { name:v.name, lang:v.lang }; });
  }
  window.TTS = {
    voices: function(){ return Promise.resolve(voices()); },
    speak: function(text, lang, rate){
      if(!synth) return Promise.resolve({ ok:false, why:'no-voice' });
      var vs = synth.getVoices(), want = lang === 'he' ? /^he/i : lang === 'el' ? /^el/i : /^en/i;
      var v = vs.filter(function(x){ return want.test(x.lang); })[0] || vs.filter(function(x){ return /^en/i.test(x.lang); })[0] || vs[0];
      if(!v) return Promise.resolve({ ok:false, why:'no-voice' });
      try{ synth.cancel(); var u = new SpeechSynthesisUtterance(String(text || '').slice(0, 300)); u.voice = v; u.lang = v.lang; u.rate = Math.max(.5, Math.min(1.6, +rate || 1)); synth.speak(u); }catch(e){ return Promise.resolve({ ok:false, why:'error' }); }
      return Promise.resolve({ ok:true, voice:v.name, lang:v.lang });
    },
    stop: function(){ if(synth) synth.cancel(); return Promise.resolve(true); }
  };

  /* ── 바깥 링크·번역·인쇄 ── */
  window.WEB = {
    open: function(url){ if(/^https?:/.test(url)) window.open(url, '_blank', 'noopener'); return Promise.resolve({ ok:true }); },
    translate: function(text, sl, tl){ return callFn({ op:'translate', text:text, sl:sl, tl:tl }); }
  };
  window.PRINT = {
    html: function(h){
      var w = window.open('', '_blank');
      if(!w) return Promise.resolve({ ok:false });
      w.document.open(); w.document.write(h); w.document.close();
      setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400);
      return Promise.resolve({ ok:true });
    }
  };

  /* ── 메모장 (Supabase modu_notes) — 데스크탑 notes-main.js 와 같은 뜻의 함수들 ── */
  var notesCache = null;
  function parseLinks(text){
    var set = {}, out = [], m, re = /\[\[([^\[\]|#]+?)(?:[|#][^\]]*)?\]\]/g;
    while((m = re.exec(text || ''))){ var t = m[1].trim(); if(t && !set[t]){ set[t] = 1; out.push(t); } }
    return out;
  }
  function tagsOf(n){
    var set = {}, out = [], m, re = /(^|\s)#([^\s#,]+)/g, src = (n.tags || '') + ' ' + (n.content || '');
    while((m = re.exec(src))){ var t = '#' + m[2]; if(!set[t]){ set[t] = 1; out.push(t); } }
    return out.join(' ');
  }
  function refBook(ref){ var m = String(ref || '').match(/^[가-힣]+/); return m ? m[0] : ''; }
  function rowOut(r){
    return { id:r.id, ref:r.ref, book:r.book, title:r.title, theme:r.theme, tags:r.tags, content:r.content, links:r.links || [],
             created_at:r.created_at, updated_at:r.updated_at, snip:String(r.content || '').slice(0, 160) };
  }
  function allNotes(force){
    if(notesCache && !force) return Promise.resolve(notesCache);
    var c = client(); if(!c) return Promise.resolve([]);
    return c.from('modu_notes').select('*').order('updated_at', { ascending:false }).then(function(r){
      notesCache = (r.data || []).map(rowOut); return notesCache;
    });
  }
  function withBacklinks(n, all){
    n.backlinks = all.filter(function(o){ return o.id !== n.id && (o.links || []).indexOf(n.title) >= 0; }).map(function(o){ return { id:o.id, title:o.title, ref:o.ref }; });
    return n;
  }
  window.NOTES = {
    list: function(q){
      q = String(q || '').trim().toLowerCase();
      return allNotes().then(function(all){
        var rows = q ? all.filter(function(n){ return [n.title, n.ref, n.theme, n.content, n.tags].some(function(x){ return String(x || '').toLowerCase().indexOf(q) >= 0; }); }) : all;
        return rows.map(function(n){ return { id:n.id, ref:n.ref, book:n.book, title:n.title, theme:n.theme, tags:n.tags, updated_at:n.updated_at, snip:n.snip }; });
      });
    },
    get: function(id){ return allNotes().then(function(all){ var n = all.filter(function(x){ return x.id === (id | 0); })[0]; return n ? withBacklinks(Object.assign({}, n), all) : null; }); },
    save: function(n){
      var c = client(); if(!c) return Promise.reject(new Error('no-client'));
      return session().then(function(s){
        if(!s) throw new Error('login');
        var row = { user_id:s.user.id, ref:n.ref || '', book:n.book || refBook(n.ref), title:n.title, theme:n.theme || '', content:n.content || '',
                    tags:tagsOf(n), links:parseLinks((n.content || '') + ' ' + (n.links || '')), updated_at:new Date().toISOString() };
        var q = n.id ? c.from('modu_notes').update(row).eq('id', n.id).select() : c.from('modu_notes').insert(row).select();
        return q.then(function(r){ if(r.error) throw r.error; return allNotes(true).then(function(){ return window.NOTES.get(r.data[0].id); }); });
      });
    },
    remove: function(id){ var c = client(); return c.from('modu_notes').delete().eq('id', id | 0).then(function(){ return allNotes(true); }).then(function(){ return true; }); },
    graph: function(){
      return allNotes().then(function(all){
        var byTitle = {}; all.forEach(function(n){ byTitle[n.title] = n; });
        var nodes = all.map(function(n){ return { id:'n' + n.id, nid:n.id, label:n.title, ref:n.ref, book:n.book, tags:n.tags, deg:0, ghost:false }; });
        var idx = {}; nodes.forEach(function(x){ idx[x.id] = x; });
        var edges = [];
        all.forEach(function(n){ (n.links || []).forEach(function(t){
          var from = 'n' + n.id, to = byTitle[t] ? 'n' + byTitle[t].id : 'g:' + t;
          if(!idx[to]){ idx[to] = { id:to, nid:0, label:t, ref:'', book:'', tags:'', deg:0, ghost:true }; nodes.push(idx[to]); }
          if(from === to) return;
          edges.push({ from:from, to:to }); idx[from].deg++; idx[to].deg++;
        }); });
        return { nodes:nodes, edges:edges };
      });
    },
    stats: function(){
      return allNotes().then(function(all){
        function top(key, lim){ var c = {}; all.forEach(function(n){ var v = n[key]; if(v) c[v] = (c[v] || 0) + 1; }); return Object.keys(c).map(function(k){ var o = { c:c[k] }; o[key] = k; return o; }).sort(function(a, b){ return b.c - a.c; }).slice(0, lim); }
        var d30 = Date.now() - 30 * 864e5;
        var recentRows = all.filter(function(n){ return new Date(n.updated_at).getTime() >= d30; });
        var rb = {}; recentRows.forEach(function(n){ if(n.book) rb[n.book] = (rb[n.book] || 0) + 1; });
        var tagc = {}; all.forEach(function(n){ String(n.tags || '').split(/\s+/).filter(Boolean).forEach(function(t){ tagc[t] = (tagc[t] || 0) + 1; }); });
        var lc = {}; all.forEach(function(n){ (n.links || []).forEach(function(t){ if(all.some(function(o){ return o.title === t; })) lc[t] = (lc[t] || 0) + 1; }); });
        return { total:all.length, recent:recentRows.length, books:top('book', 12), themes:top('theme', 12),
                 recentBooks:Object.keys(rb).map(function(k){ return { book:k, c:rb[k] }; }).sort(function(a, b){ return b.c - a.c; }).slice(0, 6),
                 tags:Object.keys(tagc).map(function(t){ return { tag:t, c:tagc[t] }; }).sort(function(a, b){ return b.c - a.c; }).slice(0, 15),
                 linked:Object.keys(lc).map(function(t){ return { title:t, c:lc[t] }; }).sort(function(a, b){ return b.c - a.c; }).slice(0, 8) };
      });
    },
    corpus: function(limit){ return allNotes().then(function(all){ return all.slice(0, limit || 200).map(function(n){ return { ref:n.ref, title:n.title, theme:n.theme, tags:n.tags, body:String(n.content || '').slice(0, 600) }; }); }); },
    file: function(){ return Promise.resolve('supabase:modu_notes'); }
  };

  /* ── 형광펜 (Supabase modu_highlights) ── */
  var hlCache = null;
  function allHl(force){
    if(hlCache && !force) return Promise.resolve(hlCache);
    var c = client(); if(!c) return Promise.resolve([]);
    /* 읽기 오류(토큰 갱신 전 401, 잠깐 끊김 등)는 캐시에 담지 않는다 — 담으면 다시 읽을 때까지 형광펜이 모두 사라진 것처럼 보인다 */
    return c.from('modu_highlights').select('bi,ci,vi,color,ref,created_at').order('created_at', { ascending:false }).then(function(r){
      if(r.error){ console.warn('[modu] 형광펜 읽기 실패', r.error.message || r.error); return hlCache || []; }
      hlCache = r.data || []; return hlCache;
    });
  }
  window.HLDB = {
    chapter: function(bi, ci){ return allHl().then(function(all){ return all.filter(function(h){ return h.bi === bi && h.ci === ci; }).map(function(h){ return { vi:h.vi, color:h.color }; }); }); },
    all: function(){ return allHl().then(function(all){ return all.slice(); }); },
    set: function(list){
      var c = client(); if(!c) return Promise.reject(new Error('no-client'));
      return session().then(function(s){
        if(!s) throw new Error('login');                                   /* 로그인 전이면 저장할 수 없다 — 조용히 넘기지 않는다 */
        var rows = (list || []).map(function(h){ return { user_id:s.user.id, bi:h.bi, ci:h.ci, vi:h.vi, color:h.color, ref:h.ref || '' }; });
        return c.from('modu_highlights').upsert(rows, { onConflict:'user_id,bi,ci,vi' }).then(function(r){ if(r.error) throw r.error; return allHl(true); }).then(function(){ return true; });
      });
    },
    remove: function(list){
      var c = client(); if(!c) return Promise.reject(new Error('no-client'));
      return Promise.all((list || []).map(function(h){ return c.from('modu_highlights').delete().match({ bi:h.bi, ci:h.ci, vi:h.vi }).then(function(r){ if(r.error) throw r.error; }); })).then(function(){ return allHl(true); }).then(function(){ return true; });
    },
    refresh: function(){ hlCache = null; return allHl(true); },
    counts: function(){ return allHl().then(function(all){ var o = {}; all.forEach(function(h){ o[h.color] = (o[h.color] || 0) + 1; }); return o; }); }
  };

  /* ── 주석 풀기: commentary.enc = 'SBC1' + iv(12) + tag(16) + AES-256-GCM(gzip(JSON)) ── */
  var commCache = null;
  function b64(s){ var bin = atob(s), u = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  window.COMMDATA = {
    load: function(){
      if(!me) return Promise.resolve({ ok:false, why:'license' });
      if(commCache) return Promise.resolve({ ok:true, json:commCache });
      if(!dk) return Promise.resolve({ ok:false, why:'no-key' });
      /* 암호화 주석: 저장소(data/d1, 빠름)에서 먼저, 없으면 자료 서버에서 */
      return fetch('data/d1/commentary.enc?v=20260926').then(function(r){ return r.ok ? r : fetch(M.dataBase + 'commentary.enc'); }).then(function(r){ if(!r.ok) throw new Error('no-file'); return r.arrayBuffer(); }).then(function(buf){
        var u = new Uint8Array(buf);
        if(String.fromCharCode(u[0], u[1], u[2], u[3]) !== 'SBC1') throw new Error('bad-file');
        var iv = u.slice(4, 16), tag = u.slice(16, 32), body = u.slice(32);
        var ct = new Uint8Array(body.length + 16); ct.set(body); ct.set(tag, body.length);   /* WebCrypto 는 암호문 뒤에 태그를 붙인 꼴 */
        return crypto.subtle.importKey('raw', b64(dk), { name:'AES-GCM' }, false, ['decrypt'])
          .then(function(key){ return crypto.subtle.decrypt({ name:'AES-GCM', iv:iv, tagLength:128 }, key, ct); })
          .then(function(packed){ return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); })
          .then(function(json){ commCache = json; return { ok:true, json:json }; });
      }).catch(function(e){ var w = String(e && e.message || e); return { ok:false, why:/no-file|bad-file/.test(w) ? w : 'bad-key' }; });
    }
  };

  /* ── 업데이트: 서버(modu_release)의 배포 판과 이 앱의 판을 견준다. 새 판이면 서비스 워커를 새로 받고 다시 연다 ── */
  var updListeners = {}, latest = null;
  function cmpVer(a, b){ var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for(var i = 0; i < 3; i++){ var d = (x[i] || 0) - (y[i] || 0); if(d) return d; } return 0; }
  function prefs(){ try{ return JSON.parse(localStorage.getItem('modu.update') || '{}'); }catch(e){ return {}; } }
  window.UPDATE = {
    check: function(){
      var cur = M.version || '0';
      /* 사이트에 올라간 config.js 의 판이 곧 배포 판이다 (git push 만으로 안내가 나간다). 관리 화면의 공지문이 있으면 덧붙인다 */
      var site = fetch('config.js?t=' + Date.now(), { cache:'no-store' }).then(function(r){ return r.text(); }).then(function(t){ var m = t.match(/"version":\s*"([^"]+)"/); var b = t.match(/"built":\s*"([^"]+)"/); return m ? { version:m[1], date:b ? b[1] : '' } : null; }).catch(function(){ return null; });
      var srv = callFn({ op:'me' }).then(function(r){ return r.ok ? (r.release || null) : null; }).catch(function(){ return null; });
      return Promise.all([site, srv]).then(function(a){
        var s = a[0], rel = a[1];
        if(!s) return { ok:false, why:'offline', cur:cur };
        latest = { version:s.version, notes:(rel && rel.version === s.version ? rel.notes : '') || (rel && cmpVer(rel.version, s.version) >= 0 ? rel.notes : '') || '', updated_at:s.date };
        var newer = cmpVer(latest.version, cur) > 0;
        return { ok:true, cur:cur, latest:{ version:latest.version, notes:latest.notes, date:latest.updated_at, size:0, full:false }, newer:newer, ready:false, skipped:newer && prefs().skip === latest.version };
      });
    },
    download: function(){
      var p = navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(function(reg){ return reg ? reg.update() : null; }) : Promise.resolve();
      return p.then(function(){ (updListeners.progress || []).forEach(function(f){ f({ got:1, total:1 }); }); return { ok:true }; }).catch(function(){ return { ok:true }; });
    },
    apply: function(){
      return (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null)).then(function(reg){
        if(reg && reg.waiting) reg.waiting.postMessage({ type:'skip' });
        return caches ? caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); }) : null;
      }).then(function(){ location.reload(); return { ok:true }; });
    },
    applied: function(){ return Promise.resolve({ version:'', error:'', cur:M.version }); },
    pref: function(p){ var o = prefs(); if(p) Object.assign(o, p); try{ localStorage.setItem('modu.update', JSON.stringify(o)); }catch(e){} return Promise.resolve(o); },
    on: function(ev, fn){ (updListeners[ev] = updListeners[ev] || []).push(fn); }
  };

  /* ── 인증: 홈페이지 로그인 + 정회원 ── */
  window.LICENSE = {
    status: function(){ return Promise.resolve(me ? { state:'ok', daysLeft:999, renew:false, label:me.name || '', hasKey:!!dk, code:'' } : { state:'none' }); },
    verify: function(){ return Promise.resolve({ ok:!!me }); },
    activate: function(){ return Promise.resolve({ ok:false, msg:'홈페이지 로그인으로 인증합니다' }); },
    profile: function(){ return Promise.resolve(me ? { name:me.name || '', email:'', sent:true, confirmed:true } : null); },
    register: function(){ return Promise.resolve({ ok:true }); },
    release: function(){ return Promise.resolve({ ok:false, msg:'모바일판에는 없습니다' }); },
    pc: function(){ return Promise.resolve({ name:navigator.userAgent, board:'', os:navigator.platform }); }
  };

  /* ── 문(gate) 화면 ── */
  var gate = null;
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function gateEl(){
    if(gate) return gate;
    gate = document.createElement('div'); gate.id = 'moGate';
    gate.innerHTML = '<div class="mo-card"><div class="mo-brand"><img src="icon.png" alt=""><span>' + esc(APPINFO.title) + '</span></div><div id="moBody"></div><div class="mo-foot">v' + esc(M.version || '') + ' · © K-LOGOS</div></div>';
    document.body.appendChild(gate);
    return gate;
  }
  function gateShow(html){ gateEl(); gate.hidden = false; document.getElementById('moBody').innerHTML = html; }
  function gateHide(){ if(gate) gate.hidden = true; }
  function loginForm(msg, bad){
    gateShow((msg ? '<div class="mo-msg' + (bad ? ' bad' : '') + '">' + esc(msg) + '</div>' : '') +
      '<button type="button" class="mo-btn kakao" id="moKakao">카카오로 로그인</button>' +
      '<div class="mo-or">또는 이메일로</div>' +
      '<input class="mo-in" id="moEmail" type="email" placeholder="이메일" autocomplete="username">' +
      '<input class="mo-in" id="moPw" type="password" placeholder="비밀번호" autocomplete="current-password">' +
      '<button type="button" class="mo-btn primary" id="moLogin">로그인</button>' +
      '<div class="mo-hint">운평장로교회 홈페이지(k-logos.com) 계정으로 로그인합니다. 교적 인증을 마친 정회원만 쓸 수 있습니다.</div>');
    document.getElementById('moKakao').onclick = function(){
      var c = client(); if(!c) return;
      c.auth.signInWithOAuth({ provider:'kakao', options:{ redirectTo: location.origin + location.pathname } });
    };
    function go(){
      var c = client(), email = document.getElementById('moEmail').value.trim(), pw = document.getElementById('moPw').value;
      if(!email || !pw) return loginForm('이메일과 비밀번호를 적어 주세요.', true);
      gateShow('<div class="mo-msg">로그인 중…</div>');
      c.auth.signInWithPassword({ email:email, password:pw }).then(function(r){
        if(r.error) return loginForm('로그인하지 못했습니다: ' + (r.error.message || ''), true);
        start();
      });
    }
    document.getElementById('moLogin').onclick = go;
    document.getElementById('moPw').onkeydown = function(e){ if(e.key === 'Enter') go(); };
  }
  function lockForm(why){
    var text = why === 'not_member' ? '교적 인증을 마친 정회원만 쓸 수 있습니다. 홈페이지 [내 정보]에서 교적 연결을 마치신 뒤 다시 열어 주세요.'
             : why === 'offline' ? '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
             : '확인하지 못했습니다 (' + why + ')';
    gateShow('<div class="mo-msg bad">' + esc(text) + '</div>' +
      '<button type="button" class="mo-btn primary" id="moRetry">다시 확인</button>' +
      '<a class="mo-btn" href="https://k-logos.com/account.html" target="_blank" rel="noopener">홈페이지 내 정보 열기</a>' +
      '<button type="button" class="mo-btn" id="moOut">다른 계정으로 로그인</button>');
    document.getElementById('moRetry').onclick = start;
    document.getElementById('moOut').onclick = logout;
  }
  function logout(){ var c = client(); (c ? c.auth.signOut() : Promise.resolve()).then(function(){ me = null; dk = null; notesCache = null; hlCache = null; commCache = null; start(); }); }
  function opened(){
    gateHide();
    notesCache = null; hlCache = null;                                     /* 문이 열리기 전에 읽은(비어 있을 수 있는) 메모·형광펜은 버리고 다시 읽는다 */
    if(window.APP && APP.setComm) window.COMMDATA.load().then(function(r){
      if(r.ok){ var d = null; try{ d = JSON.parse(r.json); }catch(e){} window.COMMSTATE = d ? '' : '주석을 풀지 못했습니다'; APP.setComm(d); }
      else { window.COMMSTATE = r.why === 'no-key' ? '주석 열쇠를 받지 못했습니다' : '주석을 풀지 못했습니다 (' + r.why + ')'; APP.setComm(null); }
    });
    if(window.paintLicense) window.paintLicense();
    setTimeout(function(){ if(window.UPD) UPD.autoCheck(); }, 2500);
    window.dispatchEvent(new Event('modu-opened'));
  }
  function start(){
    gateShow('<div class="mo-msg">로딩 중…</div>');
    if(!client()){ setTimeout(start, 300); return; }        /* supabase-js 가 아직 안 왔으면 잠시 뒤 */
    session().then(function(s){
      if(!s) return loginForm('');
      return callFn({ op:'me' }).then(function(r){
        if(r.ok){ me = r; dk = r.dk || null; latest = r.release || null; opened(); return; }
        if(r.why === 'login_required') return loginForm('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        lockForm(r.offline ? 'offline' : (r.why || 'error'));
      });
    });
  }
  /* 설정 화면의 '사용 허가' 칸 — 로그인한 사람과 로그아웃 단추 */
  window.paintLicense = function(){
    var box = document.getElementById('licInfo'); if(!box) return;
    box.innerHTML = me ? '<span>정회원 인증됨' + (me.name ? ' · ' + esc(me.name) : '') + (me.admin ? ' (관리자)' : '') + '</span> <button type="button" class="btn" id="moLogout">로그아웃</button>' : '<span>로그인되지 않음</span>';
    var b = document.getElementById('moLogout'); if(b) b.onclick = logout;
    var rel = document.getElementById('licRelease'); if(rel) rel.hidden = true;
  };
  window.MODU_AUTH = { start:start, logout:logout, me:function(){ return me; } };
  /* 문(로딩) 화면은 이 스크립트가 읽히는 즉시 띄운다 — 앱이 성경을 먼저 그린 뒤 '로딩 중'이 뜨고 다시 성경이 나오는 깜빡임을 막는다
     (이 스크립트는 body 안, app.js 앞에 있어 body 가 이미 있다) */
  try{ gateShow('<div class="mo-msg">로딩 중…</div>'); }catch(e){}
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
