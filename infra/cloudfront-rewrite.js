// CloudFront Function (viewer-request) — 정적 디렉터리 URL을 S3 오브젝트 키로 재작성한다.
//
// Astro build.format='directory' → 각 라우트는 `경로/index.html` 로 생성된다.
// CloudFront(REST/OAC 오리진)에 디렉터리 경로를 그대로 넘기면 해당 키가 없어 403이 나므로
// 여기서 index.html 을 붙여준다.
//   "/"                 → "/index.html"
//   "/cert/cpe/"        → "/cert/cpe/index.html"
//   "/cert/cpe"         → "/cert/cpe/index.html"   (확장자 없는 경로)
//   "/_astro/app.css"   → 그대로 통과               (마지막 세그먼트에 '.' 있으면 파일)
//   "/pagefind/x.js"    → 그대로 통과
//   "/decks/.../01.html"→ 그대로 통과
//
// 사이트 내부 링크·자산은 전부 절대경로(/img, /_astro, /pagefind)라 상대경로 해석 깨짐 없음(불변식).
// 데크 내부는 자기 디렉터리(트레일링 슬래시) 기준 상대경로라, 데크 진입 URL이 슬래시로 끝나면 정상.
//
// 런타임은 cloudfront-js-2.0 이지만 ES5 호환 문법만 사용(endsWith/slice 대신 charAt/substring).
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // 1) 디렉터리(슬래시로 끝) → index.html
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
    return request;
  }

  // 2) 마지막 세그먼트에 '.' 없음(=확장자 없는 경로) → /index.html
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }

  // 3) 그 외(확장자 있는 실제 파일) → 그대로 통과
  return request;
}
