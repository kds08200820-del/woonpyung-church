/****************************************************************
 * 운평장로교회 — 교회 PC 워커가 멈추면 관리자에게 알림 (Google Apps Script)  (2026-11-25 담임목사 지시)
 * --------------------------------------------------------------
 * 동작: 30분마다 Supabase 의 worker_health_push_feed 를 읽어, 마지막 확인이 40분 넘게 지난 워커가 있으면
 *       관리자 기기(태그 mm — 교적 인증 신청 알림과 같은 기기)에 한 번 알린다.
 *         제목 : 교회 PC 워커 확인
 *         본문 : 「AI 답변 · 설교 PDF」 워커가 45분째 응답이 없습니다. 당회실 PC 가 켜져 있는지 확인해 주세요.
 *       같은 워커는 다시 살아날 때까지 한 번만 알린다. 밤 10시 ~ 아침 7시에는 알리지 않는다(아침에 한 번).
 *  ※ 필요한 SQL: supabase/20261125_1400_worker_health.sql
 *  ※ 워커가 새 코드(tools/worker_heartbeat.py)로 한 번 켜진 뒤부터 기록이 생긴다.
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 교적 인증 신청 알림(member-match-push.gs)과 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) 함수 목록에서  createWorkerHealthPushTrigger  를 한 번 실행 → 30분마다 확인
 *   멈추려면  deleteWorkerHealthPushTrigger
 ****************************************************************/

const WHEALTH_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  QUIET_FROM: 22, QUIET_TO: 7,   // 이 시간(한국)에는 알리지 않는다
};

function createWorkerHealthPushTrigger() {
  deleteWorkerHealthPushTrigger();
  ScriptApp.newTrigger("pollWorkerHealth").timeBased().everyMinutes(30).create();
  Logger.log("30분마다 교회 PC 워커 확인이 등록되었습니다.");
}
function deleteWorkerHealthPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "pollWorkerHealth") ScriptApp.deleteTrigger(t); });
}

function fetchWorkerHealthFeed_() {
  const res = UrlFetchApp.fetch(WHEALTH_CONFIG.SUPABASE_URL + "/rest/v1/rpc/worker_health_push_feed", {
    method: "post", contentType: "application/json", payload: "{}",
    headers: { apikey: WHEALTH_CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + WHEALTH_CONFIG.SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) { Logger.log("피드를 읽지 못했습니다: " + res.getResponseCode() + " " + res.getContentText()); return null; }
  return JSON.parse(res.getContentText() || "null");
}

function pollWorkerHealth() {
  const feed = fetchWorkerHealthFeed_();
  if (!feed) return;
  const props = PropertiesService.getScriptProperties();
  let told = {};
  try { told = JSON.parse(props.getProperty("workerHealthTold") || "{}"); } catch (e) { told = {}; }
  const stale = feed.stale || [];
  const now = {};
  stale.forEach(function (w) { now[w.name] = true; });
  Object.keys(told).forEach(function (k) { if (!now[k]) delete told[k]; });   // 다시 살아난 워커는 잊는다
  const hour = Number(Utilities.formatDate(new Date(), "Asia/Seoul", "H"));
  const quiet = hour >= WHEALTH_CONFIG.QUIET_FROM || hour < WHEALTH_CONFIG.QUIET_TO;
  const fresh = stale.filter(function (w) { return !told[w.name]; });
  if (fresh.length && !quiet && feed.key) {
    const names = fresh.map(function (w) { return "「" + w.label + "」"; }).join(", ");
    const mins = Math.max.apply(null, fresh.map(function (w) { return Number(w.minutes) || 0; }));
    const body = names + " 워커가 " + (mins >= 120 ? Math.floor(mins / 60) + "시간" : mins + "분") + "째 응답이 없습니다. 당회실 PC 가 켜져 있는지 확인해 주세요.";
    if (osPushWorkerHealth_(feed.key, "교회 PC 워커 확인", body)) fresh.forEach(function (w) { told[w.name] = true; });   // 보낸 것만 '알림'으로 적는다
  }
  props.setProperty("workerHealthTold", JSON.stringify(told));
  Logger.log("확인 완료: 멈춤 " + stale.length + "개, 새로 알림 " + (quiet ? 0 : fresh.length) + "개" + (quiet ? " (조용한 시간)" : ""));
}

function workerHealthRestKey_() {
  function ok(v) { return v && String(v).indexOf("여기에") < 0 && String(v).length > 10; }
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  return "";
}

/** OneSignal 푸시 — 태그 mm=<관리자 열쇠> 가 붙은 기기에만. 보냈으면 true */
function osPushWorkerHealth_(key, title, body) {
  const restKey = workerHealthRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 를 넣어 주세요."); return false; }
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify({
      app_id: WHEALTH_CONFIG.ONESIGNAL_APP_ID, target_channel: "push",
      filters: [{ field: "tag", key: "mm", relation: "=", value: String(key) }],
      headings: { en: title, ko: title }, contents: { en: body, ko: body },
      url: WHEALTH_CONFIG.SITE_URL + "affairs.html",
    }),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
  return res.getResponseCode() === 200;
}
