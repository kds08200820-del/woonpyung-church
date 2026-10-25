/****************************************************************
 * 운평장로교회 — 학습·세례(입교) 신청서 알림 (Google Apps Script)
 * --------------------------------------------------------------
 * 동작: 5분마다 Supabase 의 '지금 신청 기간인 신청서'(app_open_forms)를 확인해,
 *       학습·세례(입교) 신청서(kind = baptism)가 새로 올라오면
 *       그 신청서의 '대상자' 기기에만 OneSignal 푸시를 보냅니다.
 *         제목 : 📖 학습·세례(입교) 신청 안내
 *         본문 : 「신청서 제목」 신청서가 올라왔어요. 대상이시면 신청해 주세요.
 *       알림을 탭하면 그 신청서(forms.html?f=번호)가 바로 열립니다.
 *
 *  ※ 대상자 기기 판별: 대상자 확정(목회 행정 > 신청서 > 신청 대상)이 끝난 뒤, 대상 성도가
 *     알림을 켜고 사이트에 로그인해 페이지를 열면 사이트가 OneSignal 태그(bt_<신청서번호>=1)를 붙입니다
 *     (js/layout.js · 서버 함수 app_my_targets 가 내 교적 매칭키로 판단 — 이름·키는 기기에 올리지 않습니다).
 *     이 스크립트는 그 태그가 있는 기기에만 보냅니다. 대상 확정 전에 올린 신청서는 대상이 확정된 뒤
 *     '지금 다시 보내기'(resendBaptismPush)로 보낼 수 있습니다.
 *  ※ app_open_forms 는 공개 anon 키로 읽을 수 있습니다(신청서 제목·기간만, 개인정보 없음).
 *     OneSignal REST 키만 비밀이며, 이 스크립트(비공개)에만 들어갑니다.
 *
 * ▼ 설정 방법 (한 번만)
 *   1) 나눔터/QT 푸시와 같은 Apps Script 프로젝트에 이 파일을 추가
 *   2) OneSignal REST 키는 같은 프로젝트의 기존 설정(스크립트 속성 ONESIGNAL_REST_KEY)에서 자동으로 가져옵니다.
 *   3) 함수 목록에서  createBaptismPushTrigger  를 한 번 실행 (권한 승인)
 *        → 5분마다 새 신청서 확인이 등록됩니다. (이미 올라와 있던 신청서는 '보낸 것'으로 표시하고 시작합니다)
 *   4) (테스트) 신청서를 올린 뒤  pollBaptismForms  를 직접 실행하면 즉시 확인·발송됩니다.
 *   5) 대상자를 나중에 확정했거나 한 번 더 알리고 싶으면  resendBaptismPush  (아래 RESEND_FORM_ID 에 번호를 적고 실행)
 ****************************************************************/

const BAPT_CONFIG = {
  SUPABASE_URL: "https://cetacttsdwzxjzkyozgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G", // 공개키(안전)
  SITE_URL: "https://k-logos.com/",
  ONESIGNAL_APP_ID: "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71",
  ONESIGNAL_REST_KEY: "",   // 비워두면 스크립트 속성 ONESIGNAL_REST_KEY 사용(권장)
  POLL_MINUTES: 5,          // 확인 주기(분) — 1/5/10/15/30 중 하나
  RESEND_FORM_ID: 0,        // resendBaptismPush 로 다시 보낼 신청서 번호
};

/** 5분마다 새 학습·세례 신청서 확인 트리거 등록 (한 번만 실행) */
function createBaptismPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollBaptismForms") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("pollBaptismForms").timeBased().everyMinutes(BAPT_CONFIG.POLL_MINUTES).create();
  // 등록 시점에 이미 올라와 있던 신청서는 '보낸 것'으로 — 알림이 한꺼번에 쏟아지지 않게
  const forms = fetchOpenForms_() || [];
  const ids = forms.filter(function (f) { return f.kind === "baptism"; }).map(function (f) { return Number(f.id); });
  PropertiesService.getScriptProperties().setProperty("baptNotified", JSON.stringify(ids));
  Logger.log(BAPT_CONFIG.POLL_MINUTES + "분마다 학습·세례 신청서 확인 트리거가 등록되었습니다. 기존 신청서 " + ids.length + "건은 보낸 것으로 표시했습니다.");
}

/** 지금 신청 기간인 신청서 목록 (공개) */
function fetchOpenForms_() {
  const res = UrlFetchApp.fetch(BAPT_CONFIG.SUPABASE_URL + "/rest/v1/rpc/app_open_forms", {
    method: "post",
    contentType: "application/json",
    payload: "{}",
    headers: { apikey: BAPT_CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + BAPT_CONFIG.SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("신청서 목록 조회 실패: " + res.getResponseCode() + " " + res.getContentText());
    return null;
  }
  return JSON.parse(res.getContentText() || "[]");
}

/** 새 학습·세례 신청서를 찾아 대상자 기기에 푸시 */
function pollBaptismForms() {
  const forms = fetchOpenForms_();
  if (!forms) return;
  const props = PropertiesService.getScriptProperties();
  let notified = [];
  try { notified = JSON.parse(props.getProperty("baptNotified") || "[]"); } catch (e) { notified = []; }
  const fresh = forms.filter(function (f) { return f.kind === "baptism" && notified.indexOf(Number(f.id)) < 0; });
  if (!fresh.length) { Logger.log("새 학습·세례 신청서 없음"); return; }
  fresh.forEach(function (f) {
    osPushBapt_(f);
    notified.push(Number(f.id));
  });
  props.setProperty("baptNotified", JSON.stringify(notified));
}

/** 번호로 지정한 신청서를 대상자에게 다시 보낸다 (대상 확정이 늦었을 때) */
function resendBaptismPush() {
  const id = Number(BAPT_CONFIG.RESEND_FORM_ID || 0);
  if (!id) { Logger.log("BAPT_CONFIG.RESEND_FORM_ID 에 신청서 번호를 적고 다시 실행하세요."); return; }
  const forms = (fetchOpenForms_() || []).filter(function (f) { return Number(f.id) === id && f.kind === "baptism"; });
  if (!forms.length) { Logger.log("지금 신청 기간인 학습·세례 신청서 " + id + " 번이 없습니다."); return; }
  osPushBapt_(forms[0]);
}

/** OneSignal REST 키 — 스크립트 속성(ONESIGNAL_REST_KEY) 우선, 같은 프로젝트의 기존 푸시 설정도 재사용 */
function baptRestKey_() {
  function ok(v) { return v && String(v).indexOf("여기에") < 0 && String(v).length > 10; }
  try { var p = PropertiesService.getScriptProperties().getProperty("ONESIGNAL_REST_KEY"); if (ok(p)) return p; } catch (e) {}
  if (ok(BAPT_CONFIG.ONESIGNAL_REST_KEY)) return BAPT_CONFIG.ONESIGNAL_REST_KEY;
  try { if (typeof POST_CONFIG !== "undefined" && ok(POST_CONFIG.ONESIGNAL_REST_KEY)) return POST_CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  try { if (typeof CONFIG !== "undefined" && ok(CONFIG.ONESIGNAL_REST_KEY)) return CONFIG.ONESIGNAL_REST_KEY; } catch (e) {}
  return "";
}

/** OneSignal 푸시 전송 — 이 신청서의 대상 태그(bt_<번호>=1) 기기에만 */
function osPushBapt_(f) {
  const restKey = baptRestKey_();
  if (!restKey) { Logger.log("OneSignal REST 키를 찾지 못했습니다 — 스크립트 속성 ONESIGNAL_REST_KEY 에 키를 넣어 주세요."); return; }
  const title = "📖 학습·세례(입교) 신청 안내";
  const body = "「" + String(f.title || "신청서") + "」 신청서가 올라왔어요. 대상이시면 신청해 주세요.";
  const payload = {
    app_id: BAPT_CONFIG.ONESIGNAL_APP_ID,
    target_channel: "push",
    filters: [{ field: "tag", key: "bt_" + f.id, relation: "=", value: "1" }],
    headings: { en: title, ko: title },
    contents: { en: body, ko: body },
    url: BAPT_CONFIG.SITE_URL + "forms.html?f=" + f.id,
  };
  const res = UrlFetchApp.fetch("https://api.onesignal.com/notifications", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Key " + restKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  Logger.log("OneSignal 응답(" + f.id + "번): " + res.getResponseCode() + " " + res.getContentText());
}
