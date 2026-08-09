/****************************************************************
 * 운평장로교회 — 주일학교 QT·필사 인증 푸시 (Google Apps Script)
 * --------------------------------------------------------------
 * 동작: 5분마다 Supabase의 인증 피드(ss_cert_feed)를 확인하여
 *       새 인증샷이 올라오면 '교사단 기기'에만 OneSignal 푸시를 보냅니다.
 *         제목 : 📖 주일학교 인증 도착
 *         본문 : 새 QT·필사 인증 N건이 올라왔어요. 확인하고 ❤·✔ 눌러 주세요!
 *       알림을 탭하면 대시보드(dashboard.html)가 열립니다.
 *
 *  ※ 교사단 기기 판별: 교사/부장/서기/관리자가 대시보드를 열면
 *     사이트가 자동으로 OneSignal 태그(ss_teacher=1)를 붙입니다.
 *     이 스크립트는 그 태그가 있는 기기에만 발송합니다.
 *  ※ ss_cert_feed 는 이름·사진 없이 건수/종류만 반환(공개 anon 키로 안전).
 *     OneSignal REST 키만 비밀이며, 이 스크립트(비공개)에만 들어갑니다.
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 나눔터 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) 아래 SSCERT_CONFIG 의 ONESIGNAL_REST_KEY 채우기 (나눔터 푸시와 동일한 키)
 *   3) 함수 목록에서  createSsCertPushTrigger  를 한 번 실행 (권한 승인)
 *        → 5분마다 새 인증 확인이 등록됩니다.
 *   4) (테스트) 인증을 하나 올린 뒤  pollSsCerts  를 직접 실행하면 즉시 발송됩니다.
 ****************************************************************/

const SSCERT_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "여기에_OneSignal_REST_API_KEY",
  POLL_MINUTES: 5,   // 확인 주기(분) — 1/5/10/15/30 중 하나
};

/** 5분마다 새 인증 확인 트리거 등록 (한 번만 실행) */
function createSsCertPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollSsCerts") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("pollSsCerts").timeBased().everyMinutes(SSCERT_CONFIG.POLL_MINUTES).create();
  Logger.log(SSCERT_CONFIG.POLL_MINUTES + "분마다 주일학교 인증 확인 트리거가 등록되었습니다.");
  // 첫 등록 시, 기존 인증으로 알림이 쏟아지지 않도록 현재 최신 id를 '이미 본 것'으로 표시
  primeSsCertId_();
}

/** 인증 피드 호출 */
function fetchSsCertFeed_() {
  const res = UrlFetchApp.fetch(SSCERT_CONFIG.SUPABASE_URL + "/rest/v1/rpc/ss_cert_feed", {
    method: "post",
    contentType: "application/json",
    payload: "{}",
    headers: {
      apikey: SSCERT_CONFIG.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SSCERT_CONFIG.SUPABASE_ANON_KEY,
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("피드 조회 실패: " + res.getResponseCode() + " " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText() || "null");
}

/** 새 인증을 찾아 교사단에게 푸시 */
function pollSsCerts() {
  const feed = fetchSsCertFeed_();
  if (!feed) return;
  const props = PropertiesService.getScriptProperties();
  const lastSeen = Number(props.getProperty("lastSsCertId") || 0);
  const maxId = Number(feed.maxId || 0);

  // 첫 실행(기록 없음)이면 폭주 방지: 최신 id만 저장하고 끝
  if (!lastSeen) {
    props.setProperty("lastSsCertId", String(maxId));
    Logger.log("최초 실행 — 기준 id=" + maxId + " 저장(발송 안 함)");
    return;
  }
  if (maxId <= lastSeen) { Logger.log("새 인증 없음 (lastSeen=" + lastSeen + ")"); return; }

  const recent = feed.recent || [];
  const fresh = recent.filter(function (r) { return Number(r.id) > lastSeen; });
  const n = Math.max(fresh.length, 1);
  const kinds = {};
  fresh.forEach(function (r) { kinds[r.stype] = (kinds[r.stype] || 0) + 1; });
  const kindTxt = Object.keys(kinds).map(function (k) { return k + " " + kinds[k] + "건"; }).join(" · ");

  osPushSs_(
    "📖 주일학교 인증 도착",
    "새 인증 " + n + "건이 올라왔어요" + (kindTxt ? " (" + kindTxt + ")" : "") + ". 확인하고 ❤·✔ 눌러 주세요!"
  );
  props.setProperty("lastSsCertId", String(maxId));
  Logger.log("발송 완료: 새 인증 " + n + "건, 기준 id=" + maxId);
}

/** 현재 최신 인증 id를 '이미 본 것'으로 저장(첫 설정용) */
function primeSsCertId_() {
  const feed = fetchSsCertFeed_();
  if (feed) {
    PropertiesService.getScriptProperties().setProperty("lastSsCertId", String(Number(feed.maxId || 0)));
    Logger.log("기준 id=" + Number(feed.maxId || 0) + " 저장 완료");
  }
}

/** OneSignal 푸시 전송 — 교사 태그(ss_teacher=1) 기기에만 */
function osPushSs_(title, body) {
  const payload = {
    app_id: SSCERT_CONFIG.ONESIGNAL_APP_ID,
    target_channel: "push",
    filters: [{ field: "tag", key: "ss_teacher", relation: "=", value: "1" }],
    headings: { en: title, ko: title },
    contents: { en: body, ko: body },
    url: SSCERT_CONFIG.SITE_URL + "dashboard.html",
  };
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Key " + SSCERT_CONFIG.ONESIGNAL_REST_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답: " + res.getResponseCode() + " " + res.getContentText());
}
