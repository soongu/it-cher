// ─────────────────────────────────────────────────────────────────────────────
// 퍼널 링크 SSOT (Single Source of Truth)
//
// 사이트의 3대 목적 중 하나 = 유료 채널 유입 퍼널. 이 파일이 그 링크의 유일한 정본.
// 예전에는 #klue/#sparta/#eduwill 죽은 in-page 앵커가 10개 파일 16곳에 흩어져 있었다.
// 이제는 ↓ url 값 한 곳만 고치면 사이트 전체 CTA가 실제 주소로 바뀐다.
//
// ✅ 실 URL 주입 완료(2026-06). URL이 바뀌면 아래 FUNNELS.*.url 한 곳만 고치면
//    사이트 전체 CTA에 반영된다(페이지 쪽은 손대지 않음).
//    - klue 만 아직 comingSoon(앱 런칭 전) → 클릭 불가 '준비중' 표시. 런칭 시 19행 플래그만 제거.
// ─────────────────────────────────────────────────────────────────────────────

export const FUNNELS = {
  klue: {
    // ⚠️ comingSoon: Klue 앱이 아직 런칭 전이라 모든 Klue CTA를 '준비중'(클릭 불가)으로 표시한다.
    //    런칭되면 이 줄만 지우거나 false 로 바꾸면 사이트 전역 Klue 링크가 다시 라이브된다.
    //    (렌더는 components/FunnelLink.astro 가 이 플래그를 보고 ExtLink ↔ '준비중'을 가른다.)
    comingSoon: true,
    url: 'https://klueapp.com', // 런칭 시 위 comingSoon 제거하면 라이브
    name: 'Klue',
    kind: '자사 학습앱',
    desc: '정처기·SQLD 초개인화 학습. 오답 AI 복습.',
    persona:
      '자격증 수강생(정처기·SQLD) — 강사 본인이 만든 초개인화 학습앱. 오답을 AI가 단원별로 묶어 복습.',
    // logoImg: 정사각 심볼/워드마크 자산. logoFit='fill'은 자체 배경+라운드 보유 심볼(타일 꽉 채움),
    //   'contain'은 워드마크(흰 칩 위 여백 포함). 없으면 logoText/logoBg 글자 배지로 폴백.
    logoImg: '/img/funnel/klue.svg', // 자사 브랜드 자산(project-theo Path-K, geometry LOCKED)
    logoFit: 'fill',
    logoText: 'K',
    logoBg: 'var(--coral-600)',
  },
  sparta: {
    url: 'https://nbcamp.spartaclub.kr/spring', // 팀스파르타 내일배움캠프 백엔드(Spring)
    name: '팀스파르타',
    kind: '부트캠프',
    desc: '백엔드 부트캠프로 더 깊게.',
    persona:
      '코딩 수강생(웹·서버·AI) — 무료 문서로 감 잡은 뒤 실무 프로젝트까지 가려는 입문자.',
    logoImg: '/img/funnel/sparta.png', // 내일배움캠프 공식 워드마크(운영자 제공, 카드 링크=nbcamp Spring)
    logoFit: 'contain',
    logoText: '스',
    logoBg: '#1b2430',
  },
  eduwill: {
    url: 'https://it.eduwill.net/ProductAuto/index?masterSeq=MTk0NDE=', // 에듀윌 IT자격증 온라인강의
    name: '에듀윌',
    kind: '온라인 강의',
    desc: '자격증 온라인강의 정규 커리큘럼.',
    persona: '자격증 수강생 — 정규 커리큘럼이 필요한 학생용 온라인강의.',
    logoImg: '/img/funnel/eduwill.png', // 에듀윌 공식 워드마크(img.eduwill.net GNB 자산)
    logoFit: 'contain',
    logoText: '에',
    logoBg: 'var(--info)',
  },
};

// 푸터 funnel-grid 등 '세 채널을 순서대로' 렌더할 때 사용하는 정렬 배열.
export const FUNNEL_LIST = [FUNNELS.klue, FUNNELS.sparta, FUNNELS.eduwill]
