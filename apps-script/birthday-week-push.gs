/****************************************************************
 * 운평장로교회 — 매주 월요일 생일자 알림 (Google Apps Script)  (2026-11-22 담임목사 지시)
 * --------------------------------------------------------------
 * 동작: 매주 월요일 아침 7시쯤 Supabase 의 bday_push_feed 를 읽어
 *       관리자(담임목사) 기기에만 OneSignal 푸시를 보냅니다.
 *         제목 : 이번 주 생일 N명
 *         본문 : 11/23(월)~11/29(일) · 11월 생일 M명 — 눌러서 명단 보기
 *       알림을 누르면 목회행정 매니저의 '생일 맞는 교인' 창(affairs.html?bday=1)이 열립니다(로그인 필요).
 *
 *  ※ 기기 판별: 관리자가 목회행정 매니저(affairs.html)를 열면 사이트가 그 기기에 OneSignal 태그 bk=<알림 열쇠> 를 붙입니다.
 *     열쇠는 무작위 32자입니다. 피드는 건수와 열쇠만 돌려주고, 이름 · 생년월일은 OneSignal 로 나가지 않습니다.
 *  ※ 필요한 SQL: supabase/20261122_1200_birthday_week_push.sql
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 나눔터/QT 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) OneSignal REST 키는 같은 프로젝트의 기존 설정(스크립트 속성 ONESIGNAL_REST_KEY)을 씁니다.
 *   3) 함수 목록에서  createBirthdayPushTrigger  를 한 번 실행 (권한 승인) → 매주 월요일 7시쯤
 *   4) (시험)  sendBirthdayWeek  를 직접 실행하면 바로 보냅니다.
 *   멈추려면  deleteBirthdayPushTrigger
 ****************************************************************/

const BDAY_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "",   // 비워두면 스크립트 속성 ONESIGNAL_REST_KEY 사용(권장)
  HOUR: 7,                  // 월요일 몇 시쯤 보낼지
};

function createBirthdayPushTrigger() {
  deleteBirthdayPushTrigger();
  ScriptApp.newTrigger("sendBirthdayWeek").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(BDAY_CONFIG.HOUR).inTimezone("Asia/Seoul").create();
  Logger.log("매주 월요일 " + BDAY_CONFIG.HOUR + "시쯤 생일자 알림이 등록되었습니다.");
}
function deleteBirthdayPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sendBirthdayWeek") ScriptApp.deleteTrigger(t); });
}

function sendBirthdayWeek() {
  const res = UrlFetchApp.fetch(BDAY_CONFIG.SUPABASE_URL + "/rest/v1/rpc/bday_push_feed", {
    method: "post", contentType: "application/json", payload: "{}",
    headers: { apikey: BDAY_CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + BDAY_CONFIG.SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) { Logger.log("피드 조회 실패: " + res.getResponseCode() + " " + res.getContentText()); return; }
  const f = JSON.parse(res.getContentText() || "null");
  if (!f) return;
  const keys = f.keys || [];
  if (!keys.length) { Logger.log("알림 받을 기기가 없습니다 — 관리자 계정으로 목회행정 매니저를 한 번 열어 주세요."); return; }
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const md = function (s) {   // "2026-11-23" → "11/23(월)"
    const p = String(s).split("-").map(Number);
    return p[1] + "/" + p[2] + "(" + WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ")";
  };
  const mon = Number(String(f.month || "").slice(5, 7));
  const title = Number(f.week_n) ? "이번 주 생일 " + f.week_n + "명" : "이번 주 생일 맞는 교인은 없습니다";
  const body = md(f.week_start) + "~" + md(f.week_end) + " · " + mon + "월 생일 " + Number(f.month_n || 0) + "명 — 눌러서 명단 보기";
  keys.forEach(function (k) { bdayPush_(k, title, body); });
  Logger.log("보냄: " + title + " / " + body + " (기기 " + keys.length + ")");
}

function bdayRestKey_() {
  function ok(v) { return v && String(v).indexOf("여기에") < 0 && String(v).length > 10; }
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  if (ok(BDAY_CONFIG.ONESIGNAL_REST_KEY)) return BDAY_CONFIG.ONESIGNAL_REST_KEY;
  try { if (typeof POST_CONFIG !== "undefined" && ok(POST_CONFIG.ONESIGNAL_REST_KEY)) return POST_CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  try { if (typeof CONFIG !== "undefined" && ok(CONFIG.ONESIGNAL_REST_KEY)) return CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  return "";
}

function bdayPush_(key, title, body) {
  const restKey = bdayRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 를 넣어 주세요."); return; }
  const payload = {
    app_id: BDAY_CONFIG.ONESIGNAL_APP_ID,
    target_channel: "push",
    filters: [{ field: "tag", key: "bk", relation: "=", value: String(key) }],
    headings: { en: title, ko: title },
    contents: { en: body, ko: body },
    url: BDAY_CONFIG.SITE_URL + "affairs.html?bday=1",
  };
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
}
