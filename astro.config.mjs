import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// 콘텐츠 정본(MD)은 형제 폴더에 그대로 두고 빌드타임에 fs로 읽는다 (비파괴).
//   ../backend-lecture-project/lectures/**
//   ../정보처리기사 강의교안 작업/**
// 완성 슬라이드 데크는 scripts/sync-decks.mjs 가 public/decks/ 로 미리 복사한다
// (deck-stage 엔진의 ../../ 상대경로 보존 + 한글 폴더명을 ASCII 슬러그로 개명해 배포 URL 안정화).
export default defineConfig({
  // 배포: AWS S3 + CloudFront, apex 도메인 it-cher.com (Route53). → docs/DEPLOY-AWS.md
  site: 'https://it-cher.com',
  // base는 apex 루트 호스팅이므로 기본값 '/'를 유지(서브경로 호스팅 아님). 명시해 의도 고정.
  base: '/',
  // 빌드 포맷은 directory(기본): 각 라우트를 `경로/index.html`로 생성 → 트레일링슬래시 URL.
  // 진도 키 매칭(목록 href·data-lec-key·data-prog-items[].h)이 트레일링슬래시 URL에 의존하므로 유지.
  // CloudFront는 디렉터리 요청을 .../index.html 로 재작성해야 함(docs/DEPLOY-AWS.md의 URL 재작성 함수).
  build: { format: 'directory' },
  integrations: [
    // sitemap: src/pages 로 생성된 라우트만 등록한다(404 자동 제외).
    //   데크(public/decks/**)는 정적 패스스루라 페이지 목록에 없어 본래 안 들어오고,
    //   강의대본(*_강의대본-*.md)은 페이지가 아예 없다(파일명/제목만 사용) → 둘 다 URL 부재.
    //   filter 는 만일을 대비한 방어선: /decks/ 가 섞여도 sitemap 에서 제외(불변식 #2 보호).
    //   /play/ 는 기능용 풀뷰포트 플레이어 셸(noindex) → 사이트맵 비대상.
    sitemap({ filter: (page) => !page.includes('/decks/') && !page.includes('/play/') }),
  ],
})
