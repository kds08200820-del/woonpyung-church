/****************************************************************
 * 운평장로교회 — 나의 도서관 (구글 드라이브 책 목록 웹앱) · Drive API 고속판
 * --------------------------------------------------------------
 * 드라이브 '나의 도서관' 폴더(+하위폴더)의 책 목록을 빠르게 반환합니다.
 * DriveApp(파일 하나씩) 대신 Drive 고급 서비스(Drive.Files.list, 1000개씩)를
 * 사용해 수천 권도 빠르게 읽습니다.
 *
 * ▼ 설정 방법 (한 번만)
 *   1) script.google.com → (기존 프로젝트 코드 전체 교체) 이 코드 붙여넣기
 *   2) 왼쪽 '서비스(Services)' + → "Drive API" 추가 (식별자: Drive)   ★중요★
 *   3) 아래 FOLDER_ID 를 폴더 ID(권장) 또는 폴더 이름으로 (사이트에서 넘기면 안 바꿔도 됨)
 *   4) 배포 ▸ 배포 관리 ▸ (기존 배포) 편집 ▸ 버전: 새 버전 ▸ 배포   (URL 그대로 유지됨)
 *   5) (테스트) listBooksTest 실행 → 권한 승인 → 실행 로그에 "책 N권"
 ****************************************************************/

var FOLDER_ID = '여기에_폴더_ID';   // 폴더 ID(권장) 또는 폴더 이름. 사이트가 ?folderId= 로 넘기면 무시됨.
var BOOK_EXT = /\.(pdf|epub|hwp|hwpx|docx?|txt)$/i;
var FOLDER_MIME = 'application/vnd.google-apps.folder';

function doGet(e) {
  try {
    var fid = (e && e.parameter && e.parameter.folderId) || FOLDER_ID;
    var books = listBooks_(resolveFolderId_(fid));
    return json_({ ok: true, count: books.length, books: books });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** 폴더 ID 또는 이름 → 폴더 ID */
function resolveFolderId_(idOrName) {
  if (/^[A-Za-z0-9_\-]{20,}$/.test(idOrName)) return idOrName;     // 이미 ID
  var res = Drive.Files.list({
    q: "mimeType = '" + FOLDER_MIME + "' and title = '" + String(idOrName).replace(/'/g, "\\'") + "' and trashed = false",
    maxResults: 1
  });
  if (res.items && res.items.length) return res.items[0].id;
  throw new Error('폴더를 찾을 수 없습니다: ' + idOrName + ' (폴더 ID 권장)');
}

/** 폴더(+하위폴더 전체)의 책 파일을 Drive.Files.list 로 빠르게 수집 */
function listBooks_(rootId) {
  var out = [], queue = [{ id: rootId, cat: '' }], guard = 0;
  while (queue.length && guard < 8000) {
    guard++;
    var node = queue.shift();
    var pageToken = null;
    do {
      var res = Drive.Files.list({
        q: "'" + node.id + "' in parents and trashed = false",
        maxResults: 1000,
        pageToken: pageToken,
        fields: 'nextPageToken, items(id, title, mimeType)'
      });
      var items = res.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.mimeType === FOLDER_MIME) {
          queue.push({ id: it.id, cat: node.cat || it.title });    // 최상위 하위폴더명 = 분류 힌트
        } else if (BOOK_EXT.test(it.title || '')) {
          out.push({ id: it.id, title: String(it.title).replace(BOOK_EXT, '').trim(), author: '', category: node.cat || '' });
        }
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
  }
  out.sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); });
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 설정 확인용 */
function listBooksTest() {
  var books = listBooks_(resolveFolderId_(FOLDER_ID));
  Logger.log('책 ' + books.length + '권');
  books.slice(0, 20).forEach(function (b) { Logger.log((b.category ? '[' + b.category + '] ' : '') + b.title); });
}
