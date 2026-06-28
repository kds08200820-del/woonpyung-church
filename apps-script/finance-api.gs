/*** ============================================================
 * 운평장로교회 — 재정 API (Apps Script 웹앱)
 * 역할: 구글시트(교적·재정)를 읽고/쓰는 보안 API.
 *   - 홈페이지에서 보낸 Supabase 로그인 토큰을 검증해
 *     "본인 헌금만 조회 / 재정관리는 권한자만" 을 서버에서 강제.
 *   - service_role 키는 이 스크립트의 '스크립트 속성'에만 보관(브라우저 노출 없음).
 *
 * [배포 전 1회 설정]
 *   1) 운평재정_장부 시트 ▸ 확장 프로그램 ▸ Apps Script 에 이 파일을 붙여넣기
 *   2) 좌측 톱니(프로젝트 설정) ▸ 스크립트 속성 ▸ 속성 추가:
 *        이름 : SUPABASE_SERVICE_KEY
 *        값   : (Supabase service_role 키)        ← 코드엔 절대 안 적음
 *   3) 편집기에서 함수 'setup' 한 번 실행(권한 허용) → 재정 시트에 탭 자동 생성
 *   4) 배포 ▸ 새 배포 ▸ 유형:웹 앱 ▸ 실행:나 ▸ 액세스:모든 사용자 ▸ 배포
 *   5) 나온 '웹 앱 URL'을 홈페이지 config 에 넣음(다음 단계에서 안내)
 * ============================================================ */

// ── 고정 설정(비밀 아님: 파일ID/공개URL/anon공개키) ──
var GYOJEOK_SHEET_ID = '1UQ9G-4jrVRy1TPywC76xMEpwEZL1nxf_xXdqSnfx6TU'; // 운평교적_데이터
var JAEJEONG_SHEET_ID = '1HtXV55KccpB9MztYN2aRwupeAFlwie9mhQjBkgpXOko'; // 운평재정_장부
var YESAN_SHEET_ID = '1Ag9oU5qgge4rEgz_wJND_gDYZzOFgAVT5FmS-XF1BoA';   // 운평재정_예산
var SUPABASE_URL = 'https://cetacttsdwzxjzkyozgd.supabase.co';
var SUPABASE_ANON = 'sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G';

// ── 비밀: 스크립트 속성에서만 읽음 ──
function SERVICE_KEY_() {
  var k = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
  if (!k) throw new Error('스크립트 속성 SUPABASE_SERVICE_KEY 가 설정되지 않았습니다.');
  return k;
}

/* ============================================================
 * 1회 실행: 재정 시트 탭(전표/계정과목/예배) 생성 + 기본값 채우기
 * ============================================================ */
function setup() {
  var ss = SpreadsheetApp.openById(JAEJEONG_SHEET_ID);

  // 전표 탭(첫 시트 사용/이름 정리)
  var jeon = ss.getSheetByName('전표');
  if (!jeon) {
    jeon = ss.getSheets()[0];
    jeon.setName('전표');
  }
  if (jeon.getLastRow() < 1) {
    jeon.getRange(1, 1, 1, 13).setValues([[
      '전표ID', '일자', '구분', '종류', '계정', '예배', '헌금자', '매칭키', '금액', '수단', '적요', '등록자', '등록시각'
    ]]);
  }

  // 계정과목 탭
  if (!ss.getSheetByName('계정과목')) {
    var acc = ss.insertSheet('계정과목');
    acc.getRange(1, 1, 1, 4).setValues([['코드', '계정명', '구분', '분류']]);
    var accRows = [
      ['101', '십일조', '수입', '헌금'], ['102', '주일헌금', '수입', '헌금'],
      ['103', '감사헌금', '수입', '헌금'], ['104', '성일감사헌금', '수입', '헌금'],
      ['105', '구역헌금', '수입', '헌금'], ['106', '헌신예배헌금', '수입', '헌금'],
      ['107', '선교헌금', '수입', '헌금'], ['108', '건축헌금', '수입', '헌금'],
      ['109', '절기헌금', '수입', '헌금'], ['110', '장학헌금', '수입', '헌금'],
      ['111', '임직헌금', '수입', '헌금'], ['119', '기타헌금', '수입', '헌금'],
      ['150', '이자수입', '수입', '기타수입'], ['151', '기타수입', '수입', '기타수입'],
      ['201', '총회비', '지출', '상회비'], ['202', '노회비', '지출', '상회비'],
      ['203', '시찰비', '지출', '상회비'], ['204', '교역자회비', '지출', '상회비'],
      ['205', '세례의무금', '지출', '상회비'], ['206', '대외협력비', '지출', '상회비'],
      ['301', '교역자사례비', '지출', '인건비'], ['302', '직원급여', '지출', '인건비'],
      ['311', '사무비', '지출', '운영비'], ['312', '관리비(공과금)', '지출', '운영비'],
      ['313', '비품구입비', '지출', '운영비'], ['314', '수리유지비', '지출', '운영비'],
      ['401', '예배비', '지출', '사역비'], ['402', '교육비', '지출', '사역비'],
      ['403', '선교비', '지출', '사역비'], ['404', '전도비', '지출', '사역비'],
      ['405', '구제비', '지출', '사역비'], ['406', '심방비', '지출', '사역비'],
      ['407', '행사비', '지출', '사역비'], ['501', '건축비', '지출', '기타지출'],
      ['502', '예비비', '지출', '기타지출'], ['519', '기타지출', '지출', '기타지출']
    ];
    acc.getRange(2, 1, accRows.length, 4).setValues(accRows);
  }

  // 예배 탭
  if (!ss.getSheetByName('예배')) {
    var svc = ss.insertSheet('예배');
    svc.getRange(1, 1, 1, 2).setValues([['예배명', '순서']]);
    svc.getRange(2, 1, 6, 2).setValues([
      ['주일오전예배', 1], ['주일오후예배', 2], ['수요예배', 3],
      ['금요기도회', 4], ['새벽기도회', 5], ['절기/특별예배', 6]
    ]);
  }
  return '재정 시트 준비 완료 (전표/계정과목/예배)';
}

/* ============================================================
 * 웹앱 진입점
 *   - 홈페이지는 fetch(POST, Content-Type: text/plain) 로 호출(프리플라이트 회피)
 *   - body = JSON 문자열 { action, token, ... }
 * ============================================================ */
function doGet() {
  return json_({ ok: true, service: '운평재정 API', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = req.action;
    if (action === 'match') return json_(actionMatch_(req));
    if (action === 'me') return json_(actionMe_(req));
    if (action === 'myOfferings') return json_(actionMyOfferings_(req));
    if (action === 'masters') return json_(actionMasters_(req));
    if (action === 'budget') return json_(actionBudget_(req));
    if (action === 'listVouchers') return json_(actionListVouchers_(req));
    if (action === 'addVoucher') return json_(actionAddVoucher_(req));
    if (action === 'updateVoucher') return json_(actionUpdateVoucher_(req));
    if (action === 'deleteVoucher') return json_(actionDeleteVoucher_(req));
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ============================================================
 * 액션들
 * ============================================================ */

// 교적 매칭(이름+생년월일) → 정/준회원 기록
function actionMatch_(req) {
  var user = verifyUser_(req.token);            // 토큰 검증(본인 확인)
  var name = String(req.name || '').trim();
  var birth = String(req.birth || '').replace(/[^0-9]/g, ''); // YYYYMMDD
  if (!name || birth.length !== 8) return { ok: false, error: '이름과 생년월일(YYYYMMDD)을 정확히 입력하세요.' };
  var key = name + '|' + birth;

  var hit = findGyojeokByKey_(key);
  if (hit) {
    upsertLink_(user.id, {
      member_status: '정회원', member_key: key,
      member_id: hit['교적ID'] ? Number(hit['교적ID']) : null,
      member_name: name, matched_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    return { ok: true, status: '정회원', name: name };
  } else {
    upsertLink_(user.id, {
      member_status: '준회원', member_key: key, member_name: name,
      note: '교적 자동매칭 실패 — 관리자 승인 대기', updated_at: new Date().toISOString()
    });
    return { ok: true, status: '준회원', message: '교적에서 이름+생년월일이 일치하지 않습니다. 관리자 승인 후 정회원이 됩니다.' };
  }
}

// 내 상태(정/준회원, 재정권한)
function actionMe_(req) {
  var user = verifyUser_(req.token);
  var link = getLink_(user.id);
  return {
    ok: true,
    email: user.email,
    status: link ? link.member_status : '준회원',
    memberName: link ? link.member_name : '',
    canFinance: isAdmin_(user.id) || (link ? !!link.can_finance : false)
  };
}

// 본인 헌금 조회(정회원 + 매칭키 보유 시 본인 것만)
function actionMyOfferings_(req) {
  var user = verifyUser_(req.token);
  var link = getLink_(user.id);
  if (!link || link.member_status !== '정회원' || !link.member_key) {
    return { ok: true, status: link ? link.member_status : '준회원', offerings: [], total: 0 };
  }
  var rows = readObjects_(JAEJEONG_SHEET_ID, '전표');
  var mine = rows.filter(function (r) { return String(r['매칭키']) === link.member_key && String(r['종류']) === '헌금'; });
  mine.sort(function (a, b) { return String(b['일자']).localeCompare(String(a['일자'])); });
  var total = 0;
  var out = mine.map(function (r) {
    var amt = Number(r['금액']) || 0; total += amt;
    return { date: r['일자'], account: r['계정'], service: r['예배'], amount: amt, memo: r['적요'] };
  });
  return { ok: true, status: '정회원', memberName: link.member_name, offerings: out, total: total };
}

// 재정관리 화면용 기초데이터(권한자만)
function actionMasters_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var members = readObjects_(GYOJEOK_SHEET_ID, '교적').map(function (m) {
    return { name: m['이름'], key: m['매칭키'], birth: m['생년월일'], group: m['그룹'] };
  }).filter(function (m) { return m.name; });
  var accounts = readObjects_(JAEJEONG_SHEET_ID, '계정과목');
  var services = readObjects_(JAEJEONG_SHEET_ID, '예배');
  return { ok: true, members: members, accounts: accounts, services: services };
}

// 예산 조회(권한자만) — 운평재정_예산 시트
function actionBudget_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var rows = readObjects_(YESAN_SHEET_ID, '운평재정_예산');
  if (!rows.length) rows = readObjects_(YESAN_SHEET_ID, SpreadsheetApp.openById(YESAN_SHEET_ID).getSheets()[0].getName());
  return { ok: true, budget: rows };
}

// 전표 목록(권한자만)
function actionListVouchers_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var rows = readObjects_(JAEJEONG_SHEET_ID, '전표');
  if (req.from) rows = rows.filter(function (r) { return String(r['일자']) >= req.from; });
  if (req.to) rows = rows.filter(function (r) { return String(r['일자']) <= req.to; });
  rows.sort(function (a, b) { return String(b['일자']).localeCompare(String(a['일자'])); });
  return { ok: true, vouchers: rows };
}

// 전표 추가(권한자만)
function actionAddVoucher_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var v = req.voucher || {};
  var sh = SpreadsheetApp.openById(JAEJEONG_SHEET_ID).getSheetByName('전표');
  var id = 'V' + Date.now();
  sh.appendRow([
    id, v.date || '', v.type || '', v.kind || '', v.account || '', v.service || '',
    v.payer || '', v.memberKey || '', Number(v.amount) || 0, v.method || '',
    v.memo || '', user.email || '', new Date().toISOString()
  ]);
  return { ok: true, id: id };
}

// 전표 수정(권한자만)
function actionUpdateVoucher_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var sh = SpreadsheetApp.openById(JAEJEONG_SHEET_ID).getSheetByName('전표');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(req.id)) {
      var v = req.voucher || {};
      sh.getRange(i + 1, 2, 1, 10).setValues([[
        v.date, v.type, v.kind, v.account, v.service, v.payer, v.memberKey, Number(v.amount) || 0, v.method, v.memo
      ]]);
      return { ok: true };
    }
  }
  return { ok: false, error: '전표를 찾을 수 없습니다: ' + req.id };
}

// 전표 삭제(권한자만)
function actionDeleteVoucher_(req) {
  var user = verifyUser_(req.token);
  requireFinance_(user.id);
  var sh = SpreadsheetApp.openById(JAEJEONG_SHEET_ID).getSheetByName('전표');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(req.id)) { sh.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: '전표를 찾을 수 없습니다: ' + req.id };
}

/* ============================================================
 * 보안/유틸
 * ============================================================ */

// Supabase 토큰 검증 → { id, email }  (위조 불가: Supabase 서버가 검증)
function verifyUser_(token) {
  if (!token) throw new Error('로그인이 필요합니다(토큰 없음).');
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    method: 'get', muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON }
  });
  if (res.getResponseCode() !== 200) throw new Error('로그인 토큰이 유효하지 않습니다.');
  var u = JSON.parse(res.getContentText());
  if (!u || !u.id) throw new Error('사용자 정보를 확인할 수 없습니다.');
  return { id: u.id, email: u.email };
}

// 재정 접근 권한 강제(관리자거나 can_finance)
function requireFinance_(uid) {
  if (isAdmin_(uid)) return true;
  var link = getLink_(uid);
  if (link && link.can_finance) return true;
  throw new Error('재정관리 접근 권한이 없습니다.');
}

function isAdmin_(uid) {
  var r = sbAdmin_('get', '/rest/v1/admins?uid=eq.' + uid + '&select=uid');
  return r.length > 0;
}
function getLink_(uid) {
  var r = sbAdmin_('get', '/rest/v1/member_links?user_id=eq.' + uid + '&select=*');
  return r.length ? r[0] : null;
}
function upsertLink_(uid, fields) {
  fields.user_id = uid;
  sbAdmin_('post', '/rest/v1/member_links?on_conflict=user_id', fields, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
}

// Supabase REST 호출(service_role → RLS 우회). 서버 전용.
function sbAdmin_(method, path, body, extraHeaders) {
  var key = SERVICE_KEY_();
  var headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (extraHeaders) for (var h in extraHeaders) headers[h] = extraHeaders[h];
  var opt = { method: method, headers: headers, muteHttpExceptions: true };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, opt);
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase 오류 ' + code + ': ' + res.getContentText());
  var txt = res.getContentText();
  return txt ? JSON.parse(txt) : [];
}

// 시트 → 객체배열(첫 행을 헤더로)
function readObjects_(sheetId, tabName) {
  var sh = SpreadsheetApp.openById(sheetId).getSheetByName(tabName);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var o = {}; var blank = true;
    for (var c = 0; c < head.length; c++) { o[head[c]] = data[i][c]; if (data[i][c] !== '') blank = false; }
    if (!blank) out.push(o);
  }
  return out;
}

function findGyojeokByKey_(key) {
  var rows = readObjects_(GYOJEOK_SHEET_ID, '교적');
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['매칭키']) === key) return rows[i];
  return null;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
