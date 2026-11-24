/****************************************************************
 * 운평장로교회 — 교적 인증 신청 알림 (Google Apps Script)  (2026-11-24 담임목사 지시)
 * --------------------------------------------------------------
 * 동작: 5분마다 Supabase 의 member_match_push_feed 를 읽어,
 *   (1) 교적 인증 신청이 새로 들어왔으면 관리자 기기에 OneSignal 푸시
 *         제목 : 교적 인증 신청
 *         본문 : 교적 인증 신청 N건이 들어왔습니다. 권한 관리에서 확인해 주세요.
 *         누르면 교적관리(gyojeok.html)가 열립니다.
 *   (2) 관리자가 승인하거나 돌려보냈으면 신청한 사람의 기기에 결과를 푸시
 *         승인     : 정회원으로 승인되었습니다. (누르면 dashboard.html)
 *         돌려보냄 : 교적 인증 신청이 승인되지 않았습니다. 내 정보에서 확인해 주세요. (누르면 admin.html)
 *
 *  ※ 기기 판별: 관리자가 로그인해 홈페이지를 열면 그 기기에 태그 mm=<관리자 알림 열쇠> 가 붙고(js/layout.js),
 *     신청한 사람이 내 정보 화면을 열면 태그 mq=<그 신청의 알림 열쇠> 가 붙습니다(js/finance-member.js).
 *     열쇠는 무작위 32자이고 이름 · 교적 정보가 아닙니다. 피드도 열쇠 · 건수 · 번호 · 승인 여부만 돌려줍니다.
 *     알림은 그 기기에서 알림을 켠 사람만 받습니다.
 *  ※ 필요한 SQL: supabase/20261124_2330_member_match_approval.sql · 20261124_2355_member_match_push.sql
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 나눔터/QT 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) OneSignal REST 키는 같은 프로젝트의 기존 설정(스크립트 속성 ONESIGNAL_REST_KEY)을 씁니다.
 *   3) 함수 목록에서  createMemberMatchPushTrigger  를 한 번 실행 (권한 승인) → 5분마다 확인
 *        (이미 들어와 있던 신청과 이미 난 결과는 '보낸 것'으로 표시하고 시작합니다)
 *   4) (테스트)  pollMemberMatch  를 직접 실행하면 바로 확인 · 발송합니다.
 *   멈추려면  deleteMemberMatchPushTrigger
 ****************************************************************/

const MMATCH_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "",   // 비워두면 스크립트 속성 ONESIGNAL_REST_KEY 사용(권장)
  POLL_MINUTES: 5,          // 확인 주기(분) — 1/5/10/15/30 중 하나
};

/** 5분마다 확인 트리거 등록 (한 번만 실행) */
function createMemberMatchPushTrigger() {
  deleteMemberMatchPushTrigger();
  ScriptApp.newTrigger("pollMemberMatch").timeBased().everyMinutes(MMATCH_CONFIG.POLL_MINUTES).create();
  // 등록 시점에 이미 있던 신청 · 결과는 '보낸 것'으로 — 알림이 한꺼번에 쏟아지지 않게
  const props = PropertiesService.getScriptProperties();
  const feed = fetchMemberMatchFeed_(0);
  if (feed) {
    props.setProperty("memberMatchAfter", String(Number(feed.max_id || 0)));
    props.setProperty("memberMatchDecided", JSON.stringify((feed.decided || []).map(function (d) { return Number(d.id); })));
  }
  Logger.log(MMATCH_CONFIG.POLL_MINUTES + "분마다 교적 인증 신청 확인이 등록되었습니다. 기준 번호=" + (feed ? Number(feed.max_id || 0) : "읽지 못함"));
}

/** 트리거 지우기 */
function deleteMemberMatchPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollMemberMatch") ScriptApp.deleteTrigger(t);
  });
}

/** 피드 호출 — { max_id, key, n, decided: [{ id, key, ok }] } */
function fetchMemberMatchFeed_(after) {
  const res = UrlFetchApp.fetch(MMATCH_CONFIG.SUPABASE_URL + "/rest/v1/rpc/member_match_push_feed", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ p_after: Number(after) || 0 }),
    headers: { apikey: MMATCH_CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + MMATCH_CONFIG.SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("피드를 읽지 못했습니다: " + res.getResponseCode() + " " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText() || "null");
}

/** 새 신청은 관리자에게, 난 결과는 신청한 사람에게 */
function pollMemberMatch() {
  const props = PropertiesService.getScriptProperties();
  const afterRaw = props.getProperty("memberMatchAfter");
  if (afterRaw === null || afterRaw === undefined || afterRaw === "") {   // 기록이 없으면(첫 실행) 기준만 저장
    const f0 = fetchMemberMatchFeed_(0);
    if (f0) {
      props.setProperty("memberMatchAfter", String(Number(f0.max_id || 0)));
      props.setProperty("memberMatchDecided", JSON.stringify((f0.decided || []).map(function (d) { return Number(d.id); })));
    }
    Logger.log("최초 실행 — 기준만 저장(발송 안 함)");
    return;
  }
  const after = Number(afterRaw) || 0;
  const feed = fetchMemberMatchFeed_(after);
  if (!feed) return;

  // (1) 새 신청 → 관리자 기기
  const n = Number(feed.n || 0), maxId = Number(feed.max_id || 0);
  if (n > 0 && !feed.key) {
    // 관리자 기기가 아직 하나도 등록되지 않았다 — 기준 번호를 넘기지 않고 다음 확인 때 다시 본다
    Logger.log("새 신청 " + n + "건 — 관리자 알림 열쇠가 아직 없습니다(관리자가 로그인해 홈페이지를 한 번 열면 생깁니다).");
  } else {
    if (n > 0) osPushMemberMatch_("mm", feed.key, "교적 인증 신청", "교적 인증 신청 " + n + "건이 들어왔습니다. 권한 관리에서 확인해 주세요.", "gyojeok.html");
    if (maxId > after) props.setProperty("memberMatchAfter", String(maxId));
  }

  // (2) 난 결과 → 신청한 사람의 기기 (한 신청에 한 번)
  let sent = [];
  try { sent = JSON.parse(props.getProperty("memberMatchDecided") || "[]"); } catch (e) { sent = []; }
  const decided = feed.decided || [];
  let m = 0;
  decided.forEach(function (d) {
    if (!d || !d.key || sent.indexOf(Number(d.id)) >= 0) return;
    if (d.ok) osPushMemberMatch_("mq", d.key, "교적 인증", "정회원으로 승인되었습니다.", "dashboard.html");
    else osPushMemberMatch_("mq", d.key, "교적 인증", "교적 인증 신청이 승인되지 않았습니다. 내 정보에서 확인해 주세요.", "admin.html");
    m++;
  });
  // 피드에 아직 남아 있는 번호만 기억한다(하루 지나 피드에서 빠진 번호는 지운다)
  props.setProperty("memberMatchDecided", JSON.stringify(decided.map(function (d) { return Number(d.id); })));
  Logger.log("확인 완료: 새 신청 " + n + "건, 결과 알림 " + m + "건, 기준 번호=" + maxId);
}

/** OneSignal REST 키 — 스크립트 속성(ONESIGNAL_REST_KEY) 우선, 같은 프로젝트의 기존 푸시 설정도 재사용 */
function memberMatchRestKey_() {
  function ok(v) { return v && String(v).indexOf("여기에") < 0 && String(v).length > 10; }
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  if (ok(MMATCH_CONFIG.ONESIGNAL_REST_KEY)) return MMATCH_CONFIG.ONESIGNAL_REST_KEY;
  try { if (typeof POST_CONFIG !== "undefined" && ok(POST_CONFIG.ONESIGNAL_REST_KEY)) return POST_CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  try { if (typeof CONFIG !== "undefined" && ok(CONFIG.ONESIGNAL_REST_KEY)) return CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  return "";
}

/** OneSignal 푸시 — 태그 <tag>=<열쇠> 가 붙은 기기에만 */
function osPushMemberMatch_(tag, key, title, body, path) {
  const restKey = memberMatchRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 를 넣어 주세요."); return; }
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify({
      app_id: MMATCH_CONFIG.ONESIGNAL_APP_ID, target_channel: "push",
      filters: [{ field: "tag", key: String(tag), relation: "=", value: String(key) }],
      headings: { en: title, ko: title }, contents: { en: body, ko: body },
      url: MMATCH_CONFIG.SITE_URL + path,
    }),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답(" + tag + "): " + res.getResponseCode() + " " + res.getContentText());
}
