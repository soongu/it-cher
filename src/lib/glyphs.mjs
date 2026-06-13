// 공용 라인 글리프 path SSOT — 단색(currentColor) Lucide 스타일 24px 아이콘.
// Glyph.astro(빌드타임 렌더)와 런타임 주입 카드(start 온보딩 결과)가 같은 출처를 공유한다.
// 코딩 트랙의 기술 브랜드 로고(public/img/tech, <img>)와 달리, 공식 로고가 없는 목표·도메인·섹션
// 아이콘은 모두 이 글리프로 통일한다. 색은 담는 타일의 color 를 따른다(coral/cool/ok).
export const GLYPHS = {
  // 자격증 도메인
  award: ['<circle cx="12" cy="8" r="6"/>', '<path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'],
  database: ['<ellipse cx="12" cy="5" rx="9" ry="3"/>', '<path d="M3 5v14a9 3 0 0 0 18 0V5"/>', '<path d="M3 12a9 3 0 0 0 18 0"/>'],
  chart: ['<path d="M3 3v18h18"/>', '<path d="M18 17V9"/>', '<path d="M13 17V5"/>', '<path d="M8 17v-3"/>'],
  cloud: ['<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'],
  // 자격증 단계 노드
  'file-text': ['<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>', '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>', '<path d="M16 13H8"/>', '<path d="M16 17H8"/>', '<path d="M10 9H8"/>'],
  book: ['<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>', '<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'],
  terminal: ['<path d="m4 17 6-6-6-6"/>', '<path d="M12 19h8"/>'],
  clipboard: ['<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', '<path d="m9 14 2 2 4-4"/>'],
  // 코딩 목표(버킷)
  globe: ['<circle cx="12" cy="12" r="10"/>', '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>', '<path d="M2 12h20"/>'],
  server: ['<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>', '<rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>', '<path d="M6 6h.01"/>', '<path d="M6 18h.01"/>'],
  smartphone: ['<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>', '<path d="M12 18h.01"/>'],
  sparkles: ['<path d="M9.94 14.06A2 2 0 0 0 8.5 12.6L2.4 11a.5.5 0 0 1 0-.96L8.5 8.44A2 2 0 0 0 9.94 7L11.52.9a.5.5 0 0 1 .96 0l1.58 6.1A2 2 0 0 0 15.5 8.44L21.6 10a.5.5 0 0 1 0 .96L15.5 12.6a2 2 0 0 0-1.44 1.46L12.48 20.2a.5.5 0 0 1-.96 0z"/>', '<path d="M20 3v4"/>', '<path d="M22 5h-4"/>'],
  rocket: ['<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>', '<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>', '<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>', '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'],
  // 트랙 총괄
  graduation: ['<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/>', '<path d="M22 10v6"/>', '<path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'],
  code: ['<path d="m18 16 4-4-4-4"/>', '<path d="m6 8-4 4 4 4"/>', '<path d="m14.5 4-5 16"/>'],
}

// 런타임(innerHTML) 주입용 SVG 문자열. Glyph.astro 와 동일한 마크업을 문자열로 반환한다.
// 빌드타임에 호출돼 신뢰된 마크업이므로 호출부에서 그대로 삽입한다(사용자 입력 아님).
export function glyphSvg(name, cls = '') {
  const paths = (GLYPHS[name] || GLYPHS.award).join('')
  return `<svg class="gi${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}
