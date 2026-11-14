/****************************************************************
 * 운평장로교회 — 구제선교위원회 회비 납부일 알림 (Google Apps Script)  (2026-11-14 담임목사 지시)
 * --------------------------------------------------------------
 * 동작: 하루 한 번(아침 10시쯤) Supabase 의 mission_dues_push_feed 를 읽어,
 *       '스스로 정한 회비 납부일이 지났는데 이번 달 회비(또는 연납)가 아직 체크되지 않은 정회원' 의 기기에만
 *       OneSignal 푸시를 보냅니다. 같은 사람에게 한 달에 한 번만 보냅니다.
 *         제목 : 구제선교위원회 회비 안내
 *         본문 : 이번 달 회비 납부일이 지났습니다. 이미 내셨으면 회계 확인 뒤 정리됩니다.
 *       알림을 누르면 구제선교위원회 페이지의 정회원 · 회비 칸(mission.html#join)이 열립니다.
 *
 *  ※ 기기 판별: 정회원이 납부일을 정하고 홈페이지(구제선교위원회 페이지)를 열면, 사이트가 그 기기에
 *     OneSignal 태그 md=<알림 열쇠> 를 붙입니다(js/mission-join.js). 열쇠는 무작위 32자이고 이름 · 교적 정보가 아닙니다.
 *     피드도 열쇠와 달('YYYY-MM')만 돌려줍니다.
 *  ※ 필요한 SQL: supabase/20261114_1500_mission_regular_members.sql
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 나눔터/QT 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) OneSignal REST 키는 같은 프로젝트의 기존 설정(스크립트 속성 ONESIGNAL_REST_KEY)을 씁니다.
 *   3) 함수 목록에서  createMissionDuesPushTrigger  를 한 번 실행 (권한 승인) → 매일 아침 10시쯤 확인
 *   4) (테스트)  pollMissionDues  를 직접 실행하면 바로 확인 · 발송합니다.
 *   멈추려면  deleteMissionDuesPushTrigger
 ****************************************************************/

const MDUES_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "",   // 비워두면 스크립트 속성 ONESIGNAL_REST_KEY 사용(권장)
  HOUR: 10,                 // 매일 몇 시쯤 확인할지
};

function createMissionDuesPushTrigger() {
  deleteMissionDuesPushTrigger();
  ScriptApp.newTrigger("pollMissionDues").timeBased().everyDays(1).atHour(MDUES_CONFIG.HOUR).inTimezone("Asia/Seoul").create();
  Logger.log("매일 " + MDUES_CONFIG.HOUR + "시쯤 회비 납부일 알림 확인이 등록되었습니다.");
}
function deleteMissionDuesPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "pollMissionDues") ScriptApp.deleteTrigger(t); });
}

function fetchMissionDuesFeed_() {
  const res = UrlFetchApp.fetch(MDUES_CONFIG.SUPABASE_URL + "/rest/v1/rpc/mission_dues_push_feed", {
    method: "post", contentType: "application/json", payload: "{}",
    headers: { apikey: MDUES_CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + MDUES_CONFIG.SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) { Logger.log("피드를 읽지 못했습니다: " + res.getResponseCode() + " " + res.getContentText()); return null; }
  return JSON.parse(res.getContentText() || "[]");
}

/** 하루 한 번: 납부일이 지난 정회원 기기에 알림 (같은 달 두 번 안 보냄) */
function pollMissionDues() {
  const feed = fetchMissionDuesFeed_();
  if (!feed) return;
  const props = PropertiesService.getScriptProperties();
  let sent = {};
  try { sent = JSON.parse(props.getProperty("missionDuesSent") || "{}"); } catch (e) { sent = {}; }
  const ym = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM");
  Object.keys(sent).forEach(function (k) { if (sent[k] !== ym) delete sent[k]; });   // 지난달 기록은 비운다
  let n = 0;
  feed.forEach(function (r) {
    if (!r || !r.key || sent[r.key] === r.ym) return;
    osPushMissionDues_(r.key);
    sent[r.key] = r.ym; n++;
  });
  props.setProperty("missionDuesSent", JSON.stringify(sent));
  Logger.log("회비 알림 " + n + "건 보냄 (대상 " + feed.length + "건)");
}

function missionDuesRestKey_() {
  var ok = function (v) { return v && String(v).length > 10; };
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  if (ok(MDUES_CONFIG.ONESIGNAL_REST_KEY)) return MDUES_CONFIG.ONESIGNAL_REST_KEY;
  try { if (typeof POST_CONFIG !== "undefined" && ok(POST_CONFIG.ONESIGNAL_REST_KEY)) return POST_CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  try { if (typeof CONFIG !== "undefined" && ok(CONFIG.ONESIGNAL_REST_KEY)) return CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  return "";
}

/** OneSignal 푸시 — 태그 md=<열쇠> 가 붙은 기기에만 */
function osPushMissionDues_(key) {
  const restKey = missionDuesRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 를 넣어 주세요."); return; }
  const title = "구제선교위원회 회비 안내", body = "이번 달 회비 납부일이 지났습니다. 이미 내셨으면 회계 확인 뒤 정리됩니다.";
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify({
      app_id: MDUES_CONFIG.ONESIGNAL_APP_ID, target_channel: "push",
      filters: [{ field: "tag", key: "md", relation: "=", value: String(key) }],
      headings: { en: title, ko: title }, contents: { en: body, ko: body },
      url: MDUES_CONFIG.SITE_URL + "mission.html#join",
    }),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
}
