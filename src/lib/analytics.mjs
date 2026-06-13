// ── GA4 측정 ID (SSOT) ─────────────────────────────────────────────
// 변경은 이 한 곳만(links.mjs·slug.mjs 와 동일한 SSOT 규율).
//   · Base.astro 가 prod 빌드에서만 gtag 로더를 head 에 주입한다(로컬 dev HTML 비오염).
//   · 런타임에도 it-cher.com 에서만 측정해 로컬 preview·공개 미러(soongu/it-cher) 호스팅이
//     같은 속성에 hit 를 보내지 않게 한다.
//   · verify-build.mjs 9) 섹션이 dist HTML(Base 렌더 페이지)에 이 ID 로더가 박혔는지 게이트한다.
//
// 주의: 이건 '측정 ID'(G- 접두어)다 — gtag 태그가 쓰는 값.
//   접두어 없는 숫자(예: 397783371)는 '속성 ID/계정 ID' 로 Data API·BigQuery 용이며 웹 태깅엔 안 쓴다.
export const GA_MEASUREMENT_ID = 'G-C6FQ12V07J'
