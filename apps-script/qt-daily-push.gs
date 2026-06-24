/****************************************************************
 * 운평장로교회 — 매일 아침 QT 푸시 자동 발송 (Google Apps Script)
 * --------------------------------------------------------------
 * 동작: 매일 새벽 6시에 구글 시트의 "오늘 날짜" QT를 읽어
 *       OneSignal로 푸시 알림(제목=QT 제목, 본문=성경 구절)을 보냅니다.
 *       알림을 탭하면 홈페이지의 오늘 QT 전문이 열립니다.
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 이 QT 구글 시트에서  확장 프로그램 ▸ Apps Script  열기
 *   2) 이 코드 전체를 붙여넣기
 *   3) 아래 CONFIG 4줄을 본인 값으로 채우기
 *        - ONESIGNAL_APP_ID, ONESIGNAL_REST_KEY : OneSignal 대시보드에서 발급
 *   4) 함수 목록에서 createDailyTrigger 를 한 번 실행 (권한 승인)
 *        → 매일 06:00(한국시간) 자동 발송이 등록됩니다.
 *   5) (테스트) sendTodayQT 를 직접 실행하면 즉시 한 번 발송됩니다.
 ****************************************************************/

const CONFIG = {
  SHEET_ID: "1Yg0dPnZEj18e9K5t-CC8ESwoXp1hP9Ro9AdTEhFSb0w",
  DATE_HEADER: "날짜",          // 날짜가 들어있는 열 머리글
  CONTENT_HEADER: "QT 내용",     // QT 본문이 들어있는 열 머리글
  SITE_URL: "https://kds08200820-del.github.io/woonpyung-church/",
  ONESIGNAL_APP_ID: "여기에_OneSignal_App_ID",
  ONESIGNAL_REST_KEY: "여기에_OneSignal_REST_API_KEY",
};

/** 매일 06:00 트리거 등록 (한 번만 실행) */
function createDailyTrigger() {
  // 기존 동일 트리거 제거(중복 방지)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendTodayQT") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendTodayQT").timeBased().atHour(6).everyDays(1).create();
  Logger.log("매일 06시 발송 트리거가 등록되었습니다.");
}

/** 오늘 날짜 QT를 찾아 푸시 발송 */
function sendTodayQT() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(function (h) { return String(h).trim(); });
  const dCol = header.indexOf(CONFIG.DATE_HEADER);
  const cCol = header.indexOf(CONFIG.CONTENT_HEADER);
  if (dCol < 0 || cCol < 0) { Logger.log("머리글(날짜/QT 내용)을 찾을 수 없습니다."); return; }

  const today = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy.MM.dd");

  let content = "";
  for (let i = 1; i < values.length; i++) {
    const d = String(values[i][dCol]).trim().replace(/-/g, ".");
    if (d === today) { content = String(values[i][cCol]).trim(); break; }
  }
  if (!content) { Logger.log("오늘(" + today + ") QT 내용이 비어 있어 발송하지 않습니다."); return; }

  const info = digest(content);
  const title = info.title || "오늘의 QT 말씀";
  const body = info.ref ? info.ref : "탭하여 오늘의 묵상을 읽어 보세요.";

  sendPush(title, body);
  Logger.log("발송 완료: " + title + " / " + body);
}

/** QT 본문에서 제목·성경구절 추출 */
function digest(content) {
  const lines = content.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  const meaningful = lines.filter(function (l) { return !/^📖|^📅|^샬롬|오늘의 QT/.test(l); });
  let ref = "";
  for (let i = 0; i < meaningful.length; i++) {
    if (/\d+\s*[:：]\s*\d+/.test(meaningful[i]) && meaningful[i].length < 30) { ref = meaningful[i]; break; }
  }
  let title = "";
  for (let i = 0; i < meaningful.length; i++) {
    if (meaningful[i] !== ref) { title = meaningful[i]; break; }
  }
  return { title: title, ref: ref };
}

/** OneSignal 푸시 전송 */
function sendPush(title, body) {
  const payload = {
    app_id: CONFIG.ONESIGNAL_APP_ID,
    target_channel: "push",
    included_segments: ["Subscribed Users"], // 대시보드의 세그먼트 이름과 일치해야 함
    headings: { en: title, ko: title },
    contents: { en: body, ko: body },
    url: CONFIG.SITE_URL + "?qt=open",
  };
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Key " + CONFIG.ONESIGNAL_REST_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
}
