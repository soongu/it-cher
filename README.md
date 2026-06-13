# it-cher

비전공자를 위한 IT 자격증·코딩 **무료 강의 사이트**, 그리고 튜터 **홍순구**의 포트폴리오.
백엔드 없는 **100% 정적 사이트**(Astro)로, 여러 강의교안과 슬라이드 데크를 하나로 통합합니다.

🔗 **Live:** https://it-cher.com

## 무엇인가

- **자격증 트랙** — 정보처리기사·SQLD 등, 슬라이드 데크로 학습
- **코딩 트랙** — 웹·서버·AI 만들기, 문서 뷰로 학습
- 가입 없이 바로 보는 무료 자료 + 진도 저장(localStorage) · 전체 검색(Pagefind)

## 기술 스택

- **Astro 5** (SSG, 100% static) · **markdown-it**(커스텀 플러그인) · **Pagefind**(정적 전체검색)
- **Terraform** IaC — AWS **S3 + CloudFront**(OAC) + ACM + Route53
- Pretendard / JetBrains Mono · 라이트/다크 테마

## 엔지니어링 하이라이트

- **비파괴 콘텐츠 인제스트** — 원본 교안을 수정하지 않고 빌드타임에 읽어 통합
- **ASCII 슬러그 SSOT** + macOS **NFC 정규화** — 한글 파일명/URL 안정화
- **검색 색인 게이트** — 본문만 색인(`data-pagefind-body`), 보호 콘텐츠 자동 제외
- **선언적 진도 런타임** — 무계정·무서버, JS가 꺼져도 graceful degrade
- **데크 임베드** — 고정 슬라이드를 모바일에서 fit-to-width + 화면 내 조작
- **SEO** — sitemap·robots·canonical·Open Graph 카드 + JSON-LD(Organization/Course) 구조화데이터
- **접근성** — skip-to-content, `<main>` 랜드마크, 키보드 내비게이션
- **빌드 무결성 게이트** — `npm run verify`: 페이지 수·비ASCII URL·검색/구조화데이터 누출을 자동 검사
- **IaC 배포** — `npm run deploy`: 빌드 검증 게이트 → S3 동기화 → CloudFront 무효화

## 개발

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ 정적 산출물
npm run preview
npm run check    # build + 무결성 검증 게이트
```

## 배포 (AWS)

```bash
cd infra && terraform init && terraform apply   # S3 + CloudFront + ACM + Route53
npm run deploy                                   # build+verify → S3 sync → CloudFront invalidation
```

자세한 내용은 [`infra/README.md`](infra/README.md).

## 참고

강의 **콘텐츠 원본**(교안 MD · 슬라이드 데크)은 별도로 관리되며 이 저장소에 포함되지 않습니다.
이 저장소는 그 산출물을 빌드타임에 읽어 하나의 사이트로 통합하는 **사이트 코드**입니다.

---

© 2026 it-cher · Theo Labs
