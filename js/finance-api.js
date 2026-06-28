/* finance-api.js — 재정 API(Apps Script) 공통 클라이언트
 * 기존 사이트 패턴 그대로: supabase-js 멈춤(getSession 잠금) 회피 위해
 * localStorage의 세션 토큰을 직접 읽어 Apps Script 웹앱을 호출.
 * 콘솔 확인용: [finance-api.js] v20260701i
 */
console.log('[finance-api.js] v20260701i');

window.WPF = (function () {
  function ref() {
    try { return (window.SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)[1]; }
    catch (e) { return ''; }
  }
  // 로그인 세션(access_token) 직접 읽기
  function token() {
    try {
      const raw = localStorage.getItem('sb-' + ref() + '-auth-token');
      if (!raw) return null;
      const s = JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function loggedIn() { return !!token(); }

  // Apps Script 호출. action + 파라미터 → JSON 결과.
  // Content-Type을 text/plain 으로 보내 CORS 프리플라이트를 피함.
  async function call(action, params) {
    const url = window.FINANCE_API_URL;
    if (!url) throw new Error('재정 API가 설정되지 않았습니다.');
    const body = Object.assign({ action: action, token: token() }, params || {});
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error('서버 응답을 해석할 수 없습니다.'); }
      if (data && data.ok === false) throw new Error(data.error || '요청이 거부되었습니다.');
      return data;
    } finally { clearTimeout(timer); }
  }

  return { token: token, loggedIn: loggedIn, call: call };
})();
