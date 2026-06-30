/****************************************************************
 * 운평장로교회 — 나의 도서관 (구글 드라이브 책 목록 웹앱)
 * --------------------------------------------------------------
 * 목사님 구글 드라이브의 '나의 도서관' 폴더에 있는 책(PDF 등) 목록을
 * 홈페이지 목회행정 ▸ 나의 도서관 탭에 표지 그리드로 보여줍니다.
 * (표지=드라이브 썸네일, 클릭=드라이브 뷰어로 열람. 관리자 전용)
 *
 * ▼ 설정 방법 (한 번만)
 *   1) script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기
 *   2) 아래 FOLDER_ID 를 본인 '나의 도서관' 폴더 ID로 바꾸기
 *        - 드라이브에서 그 폴더 열면 주소가
 *          https://drive.google.com/drive/folders/XXXXXXXX  →  XXXXXXXX 부분이 폴더 ID
 *   3) 배포 ▸ 새 배포 ▸ 유형: 웹 앱
 *        - 실행 계정: 나
 *        - 액세스 권한: 모든 사용자
 *   4) 배포 후 나오는 웹 앱 URL(.../exec)을 복사 → config.js 의 LIBRARY_API_URL 에 붙여넣기
 *   5) (테스트) 함수 listBooksTest 를 한 번 실행해 권한 승인 + 로그로 목록 확인
 ****************************************************************/

var FOLDER_ID = '여기에_폴더_ID';   // ← '나의 도서관' 폴더 ID

// 표지/열람 대상으로 보여줄 파일 확장자(원하면 추가)
var BOOK_EXT = /\.(pdf|epub|hwp|hwpx|docx?|txt)$/i;

function doGet(e) {
  try {
    var fid = (e && e.parameter && e.parameter.folderId) || FOLDER_ID;
    var books = listBooks_(fid);
    return json_({ ok: true, count: books.length, books: books });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** 폴더(및 하위 폴더 1단계)의 책 파일을 모아 반환 */
function listBooks_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var out = [];
  collectFiles_(folder, '', out);
  // 하위 폴더 1단계까지 분류로 포함
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sf = subs.next();
    collectFiles_(sf, sf.getName(), out);
  }
  out.sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); });
  return out;
}

function collectFiles_(folder, category, out) {
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (!BOOK_EXT.test(name)) continue;       // 책 파일만
    var base = name.replace(BOOK_EXT, '').trim();
    // 파일명에서 "제목 - 저자" 또는 "제목_저자" 형태면 저자 분리(아니면 저자 빈값)
    var title = base, author = '';
    var m = base.match(/^(.*?)\s*[-_]\s*([^\-_]{1,20})$/);
    if (m) { title = m[1].trim(); author = m[2].trim(); }
    out.push({
      id: f.getId(),
      title: title,
      author: author,
      category: category || '',
      mime: f.getMimeType(),
      updated: f.getLastUpdated().toISOString()
    });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 설정 확인용: 실행하면 로그에 책 목록이 찍힙니다 */
function listBooksTest() {
  var books = listBooks_(FOLDER_ID);
  Logger.log('책 ' + books.length + '권');
  books.slice(0, 20).forEach(function (b) { Logger.log((b.category ? '[' + b.category + '] ' : '') + b.title + (b.author ? ' / ' + b.author : '')); });
}
