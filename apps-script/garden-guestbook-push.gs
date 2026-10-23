/****************************************************************
 * 운평장로교회 — 신앙 정원 방명록 알림 푸시 (Google Apps Script)
 * --------------------------------------------------------------
 * 동작: 5분마다 Supabase 의 방명록 알림 피드(garden_guestbook_push_feed)를 읽어
 *       내 정원 방명록에 새 글이 달린 정원 주인의 기기에만 OneSignal 푸시를 보냅니다.
 *         제목 : 신앙 정원 방명록
 *         본문 : 내 정원 방명록에 새 글 N개가 있습니다.
 *       알림을 누르면 신앙 정원(garden.html)이 열립니다.
 *
 *  ※ 주인 기기 판별: 성도가 신앙 정원을 열면 사이트가 그 기기에 OneSignal 태그 gk=<정원 알림 열쇠> 를 붙입니다.
 *     열쇠는 무작위 글자라 누구인지 알 수 없고, 피드에는 열쇠와 건수만 있습니다(이름·글 없음, 공개 anon 키로 안전).
 *  ※ 주인이 스스로 쓴 글·숨긴 글·이미 본 글·하루 지난 글은 알리지 않습니다(SQL 쪽에서 거름).
 *
 * ▼ 설정 방법 (한 번만) — 먼저 supabase/20261023_2350_garden_guestbook_push.sql 이 실행돼 있어야 합니다
 *   1) 나눔터/QT/주일학교 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) OneSignal REST 키는 같은 프로젝트의 기존 설정(스크립트 속성 ONESIGNAL_REST_KEY 또는 POST_CONFIG/CONFIG)을 씁니다
 *   3) 함수 목록에서 createGardenGbPushTrigger 를 한 번 실행 (권한 승인)
 *        → 5분마다 새 방명록 확인이 등록됩니다. (그만두기: deleteGardenGbPushTrigger)
 *   4) (시험) 다른 계정으로 방명록에 글을 남긴 뒤 pollGardenGuestbook 을 직접 실행하면 바로 보냅니다.
 ****************************************************************/

const GARDENGB_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "",   // 비워두면 스크립트 속성 ONESIGNAL_REST_KEY 사용(권장)
  POLL_MINUTES: 5,          // 확인 주기(분) — 1/5/10/15/30 중 하나
};

/** 5분마다 확인 트리거 등록 (한 번만 실행) */
function createGardenGbPushTrigger() {
  deleteGardenGbPushTrigger();
  ScriptApp.newTrigger("pollGardenGuestbook").timeBased().everyMinutes(GARDENGB_CONFIG.POLL_MINUTES).create();
  Logger.log(GARDENGB_CONFIG.POLL_MINUTES + "분마다 방명록 알림 확인 트리거가 등록되었습니다.");
  // 첫 등록 때 지난 글로 알림이 쏟아지지 않도록 지금의 마지막 번호를 '이미 본 것'으로
  const feed = fetchGardenGbFeed_(0);
  if (feed) {
    PropertiesService.getScriptProperties().setProperty("lastGardenGbId", String(Number(feed.max_id || 0)));
    Logger.log("기준 번호=" + Number(feed.max_id || 0) + " 저장");
  }
}

/** 트리거 지우기 */
function deleteGardenGbPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollGardenGuestbook") ScriptApp.deleteTrigger(t);
  });
}

/** 피드 호출 — { max_id, keys: [{ key, n }] } */
function fetchGardenGbFeed_(after) {
  const res = UrlFetchApp.fetch(GARDENGB_CONFIG.SUPABASE_URL + "/rest/v1/rpc/garden_guestbook_push_feed", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ p_after: Number(after) || 0 }),
    headers: {
      apikey: GARDENGB_CONFIG.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + GARDENGB_CONFIG.SUPABASE_ANON_KEY,
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("피드 조회 실패: " + res.getResponseCode() + " " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText() || "null");
}

/** 새 방명록 글을 찾아 주인 기기에 푸시 */
function pollGardenGuestbook() {
  const props = PropertiesService.getScriptProperties();
  const lastSeen = Number(props.getProperty("lastGardenGbId") || 0);
  if (!lastSeen) {   // 기록이 없으면(첫 실행) 기준 번호만 저장
    const f0 = fetchGardenGbFeed_(0);
    if (f0) props.setProperty("lastGardenGbId", String(Number(f0.max_id || 0)));
    Logger.log("최초 실행 — 기준 번호만 저장(발송 안 함)");
    return;
  }
  const feed = fetchGardenGbFeed_(lastSeen);
  if (!feed) return;
  const keys = feed.keys || [];
  keys.forEach(function (k) {
    if (!k || !k.key) return;
    osPushGardenGb_(k.key, "신앙 정원 방명록", "내 정원 방명록에 새 글 " + Number(k.n || 1) + "개가 있습니다.");
  });
  if (Number(feed.max_id || 0) > lastSeen) props.setProperty("lastGardenGbId", String(Number(feed.max_id)));
  Logger.log("확인 완료: 알림 " + keys.length + "곳, 기준 번호=" + Number(feed.max_id || 0));
}

/** OneSignal REST 키 — 스크립트 속성(ONESIGNAL_REST_KEY) 우선, 같은 프로젝트의 기존 푸시 설정도 재사용 */
function gardenGbRestKey_() {
  function ok(v) { return v && String(v).indexOf("여기에") < 0 && String(v).length > 10; }
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  if (ok(GARDENGB_CONFIG.ONESIGNAL_REST_KEY)) return GARDENGB_CONFIG.ONESIGNAL_REST_KEY;
  try { if (typeof POST_CONFIG !== "undefined" && ok(POST_CONFIG.ONESIGNAL_REST_KEY)) return POST_CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  try { if (typeof CONFIG !== "undefined" && ok(CONFIG.ONESIGNAL_REST_KEY)) return CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  return "";
}

/** OneSignal 푸시 — 태그 gk=<열쇠> 가 붙은 기기에만 */
function osPushGardenGb_(key, title, body) {
  const restKey = gardenGbRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 를 넣어 주세요."); return; }
  const payload = {
    app_id: GARDENGB_CONFIG.ONESIGNAL_APP_ID,
    target_channel: "push",
    filters: [{ field: "tag", key: "gk", relation: "=", value: String(key) }],
    headings: { en: title, ko: title },
    contents: { en: body, ko: body },
    url: GARDENGB_CONFIG.SITE_URL + "garden.html",
  };
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
}
