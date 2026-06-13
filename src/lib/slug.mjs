// 슬러그 정규화 단일 출처(SSOT).
// 목표: 한글/공백/대소문자/구분자 혼재를 안정적 ASCII 슬러그로 정규화 → 배포 URL 안정화.
// content.mjs(라우트 슬러그)와 scripts/sync-decks.mjs(데크 폴더 ASCII 개명)가 함께 import 하여
// 같은 규칙을 쓰므로, 생성 URL과 디스크의 데크 폴더명이 절대 어긋나지 않는다(404 방지).

// 임의 문자열 → 안전한 ASCII 슬러그. 비ASCII(한글 등)는 제거된다.
// 코드/정처기 라우트 슬러그처럼 입력이 이미 ASCII인 경우 결과는 소문자 정규화와 동일.
//   'A1' → 'a1' · 'day07-5' → 'day07-5' · 'Hello World' → 'hello-world'
export function slugify(input) {
  return String(input)
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')      // 공백·언더스코어 → 하이픈
    .replace(/[^a-z0-9-]+/g, '-') // 그 외(기호·한글) → 하이픈
    .replace(/-+/g, '-')          // 연속 하이픈 축약
    .replace(/^-+|-+$/g, '')      // 양끝 하이픈 제거
}

// 한글 데크 폴더명 → 구조화된 ASCII 슬러그 + 메타데이터.
// 슬러그는 한글 주제명을 음차하지 않고, 이미 ASCII인 구조 정보(과목/번호)로만 만든다.
//   '필기-3과목-25강-관계대수'      → { kind:'cpe',  slug:'cpe-s3-25', subjectDir:'3과목', num:25, topic:'관계대수' }
//   'SQLD-벼락치기-1부-데이터모델링' → { kind:'sqld', slug:'sqld-1',    num:1,  topic:'데이터모델링' }
// 파싱 불가 시 null (호출부에서 경고 후 스킵).
export function deckMeta(name) {
  const nfc = String(name).normalize('NFC')

  let m = nfc.match(/^필기-(\d+)과목-(\d+)강-(.+)$/)
  if (m) {
    const subjectNum = parseInt(m[1], 10)
    const num = parseInt(m[2], 10)
    return {
      kind: 'cpe',
      slug: `cpe-s${subjectNum}-${num}`,
      subjectDir: `${m[1]}과목`,
      subjectSlug: `s${subjectNum}`,
      num,
      topic: m[3],
      src: nfc,
    }
  }

  m = nfc.match(/^SQLD-벼락치기-(\d+)부-(.+)$/)
  if (m) {
    const num = parseInt(m[1], 10)
    return { kind: 'sqld', slug: `sqld-${num}`, num, topic: m[2], src: nfc }
  }

  return null
}
