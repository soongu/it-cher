import fs from 'node:fs'
import path from 'node:path'
import { slugify } from './slug.mjs'
import { stripInlineMd } from './markdown.mjs'

// 빌드는 프로젝트 루트(project-lecture/)에서 실행 → 형제 폴더를 상대경로로 참조(비파괴).
const ROOT = process.cwd()
const BACKEND = path.resolve(ROOT, '..', 'backend-lecture-project', 'lectures')
const CERT = path.resolve(ROOT, '..', '정보처리기사 강의교안 작업')

const nfc = (s) => s.normalize('NFC') // macOS 파일명 NFD → NFC 정규화
function ls(dir) {
  try { return fs.readdirSync(dir).map(nfc) } catch { return [] }
}

// 데크 manifest: scripts/sync-decks.mjs 가 데크를 ASCII 슬러그로 개명하며 남긴 매핑.
// 한글 폴더를 직접 스캔하지 않으므로 NFD/NFC·인코딩 모호성과 한글 URL을 원천 제거한다.
// (sync 전이면 빈 배열 → cpe는 '슬라이드 준비중', sqld는 빈 목록으로 degrade)
const DECK_MANIFEST = path.join(ROOT, 'public', 'decks', 'manifest.json')
let DECKS = []
try { DECKS = JSON.parse(fs.readFileSync(DECK_MANIFEST, 'utf8')) } catch { DECKS = [] }
const CPE_DECK = new Map(DECKS.filter((d) => d.kind === 'cpe').map((d) => [`${d.subjectDir}#${d.num}`, d]))
const SQLD_DECKS = DECKS.filter((d) => d.kind === 'sqld').sort((a, b) => a.num - b.num)
const deckUrl = (slug) => `/decks/lectures/${slug}`

// 코딩 강의 '한 줄 요약'(빌드타임 정적 데이터, 비파괴) — 키 = `${dir}/${id}`.
// LLM은 빌드 중 못 돌리므로 사전 생성한 요약을 여기서 읽어 강의목록 행에 붙인다(없으면 graceful: null).
const SUMMARY_FILE = path.join(ROOT, 'src', 'data', 'lecture-summaries.json')
let LECTURE_SUMMARIES = {}
try { LECTURE_SUMMARIES = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) } catch { LECTURE_SUMMARIES = {} }

// ── 상단 2파트 taxonomy (헤더 내비게이션의 단일 출처) ──────────────
// 자격증은 '시험 구조' 그대로 드릴다운한다(실제 강의도서관 IA):
//   정처기 → 필기/실기 → (필기) 이론/문제풀이 → (이론) 1~5과목 → 강
//   SQLD   → 이론/문제풀이 → (문제풀이) 벼락치기 모의고사 → 부
// children = 하위 노드(허브 카드 구동), href = 깊은 시맨틱 경로(SSOT, 전부 ASCII).
// preview = '준비중' 노드의 랜딩 미리보기(제목·로드맵·라이브 대체링크·CTA). 강의대본 본문은 절대 안 읽음(불변식 #2) — 공개 시험 구성 라벨만.
// glyph = 도메인 라인 글리프 키(Glyph.astro 가 해석). 자격증은 공식 브랜드 로고가 없어 코딩 트랙의
//   기술 브랜드 로고(icon=이미지 경로)와 달리 단색 currentColor 글리프로 통일한다(내비·허브 카드 공용).
export const CERT_TRACKS = [
  {
    slug: 'cpe', label: '정보처리기사', mark: '정', glyph: 'award', sub: '필기 · 실기', status: 'live', href: '/cert/cpe/',
    children: [
      {
        slug: 'written', label: '필기', mark: '필', glyph: 'file-text', sub: '이론 · 문제풀이', status: 'live', href: '/cert/cpe/written/',
        children: [
          { slug: 'theory', label: '이론', mark: '이', glyph: 'book', sub: '1~5과목 핵심 슬라이드', status: 'live', href: '/cert/cpe/written/theory/' },
          { slug: 'practice', label: '문제풀이', mark: '문', glyph: 'clipboard', sub: '기출 유형별 풀이', status: 'soon', href: '/cert/cpe/written/practice/',
            preview: {
              context: '과목별 핵심 이론을 익혔다면, 다음은 기출 유형 풀이예요. 풀이 슬라이드는 곧 공개됩니다.',
              roadmap: ['과목별 기출 빈출 유형 풀이', '함정 보기·오답 노트 만드는 법', '시험 직전 1일 총정리'],
              live: { href: '/cert/cpe/written/theory/', label: '먼저 필기 이론 5과목 보기' },
              ctas: ['klue', 'eduwill'],
            } },
        ],
      },
      { slug: 'practical', label: '실기', mark: '실', glyph: 'terminal', sub: '프로그래밍·SQL·약술형', status: 'soon', href: '/cert/cpe/practical/',
        preview: {
          context: '실기는 곧 공개돼요. 그동안 필기로 기초를 탄탄히 다지세요.',
          roadmap: ['프로그래밍 언어 활용 (C·Java·Python)', 'SQL 활용', '약술형·서술형 대비', '2026년 1회 기출 복원 해설'],
          live: { href: '/cert/cpe/written/theory/', label: '정처기 필기 이론 먼저 보기' },
          ctas: ['klue', 'eduwill'],
        } },
    ],
  },
  {
    slug: 'sqld', label: 'SQLD', mark: 'SQ', glyph: 'database', sub: 'SQL 개발자', status: 'live', href: '/cert/sqld/',
    children: [
      { slug: 'theory', label: '이론', mark: '이', glyph: 'book', sub: '데이터 모델링·SQL 개념', status: 'soon', href: '/cert/sqld/theory/',
        preview: {
          context: '데이터 모델링과 SQL 개념을 처음부터 짚어주는 이론 슬라이드를 준비 중이에요. 정처기 필기처럼 핵심만 압축한 슬라이드로 공개됩니다. 지금은 벼락치기 모의고사로 핵심 유형을 먼저 풀어볼 수 있어요.',
          roadmap: ['1과목 · 데이터 모델링의 이해 (정규화·식별자)', '2과목 · SQL 기본 (SELECT·함수·집계·조인)', '2과목 · SQL 활용 (서브쿼리·계층형·윈도우)', 'Oracle ↔ 표준 방언 + 기출 함정 정리'],
          live: { href: '/cert/sqld/practice/', label: 'SQLD 벼락치기 모의고사 풀기' },
          ctas: ['klue', 'eduwill'],
        } },
      { slug: 'practice', label: '문제풀이', mark: '문', glyph: 'clipboard', sub: '벼락치기 모의고사', status: 'live', href: '/cert/sqld/practice/' },
    ],
  },
  { slug: 'adsp', label: 'ADsP', mark: 'AD', glyph: 'chart', sub: '데이터 분석 준전문가', status: 'soon', href: '/cert/adsp/',
    preview: {
      context: 'ADsP 강의는 준비 중이에요. 데이터 자격증이 목표라면 SQLD부터 시작해도 좋아요.',
      roadmap: ['데이터 이해', '데이터 분석 기획', '데이터 분석 (R·통계 기초)'],
      live: { href: '/cert/sqld/practice/', label: 'SQLD 벼락치기 먼저 보기' },
      ctas: ['klue', 'eduwill'],
    } },
  { slug: 'aws-saa', label: 'AWS SAA', mark: 'AW', glyph: 'cloud', sub: '솔루션스 아키텍트', status: 'soon', href: '/cert/aws-saa/',
    preview: {
      context: 'AWS 자격증 강의는 준비 중이에요. 클라우드는 코딩 트랙의 배포·운영과도 이어집니다.',
      roadmap: ['AWS 핵심 서비스 (EC2·S3·VPC)', '고가용성·확장 아키텍처 설계', '비용 최적화·보안'],
      live: { href: '/code/', label: '코딩 트랙 둘러보기' },
      ctas: ['sparta'],
    } },
]

// 자격증 트랙 조회(슬러그) — 준비중 페이지가 자기 preview/메타를 가져올 때 사용.
export function certTrack(slug) { return CERT_TRACKS.find((t) => t.slug === slug) || null }
// 트랙의 자식 노드 조회(예: cpe 의 written, sqld 의 practice).
export function certNode(trackSlug, childSlug) {
  const t = certTrack(trackSlug)
  return t && t.children ? t.children.find((c) => c.slug === childSlug) || null : null
}

// 코딩: '분야(학습 순서)' 기반 9분류 → 기술 토픽(부제). 거의 모든 분류가 dir 토픽을 가져
//   클릭 가능한 로드맵 페이지가 생긴다(준비중 포함). 실제 강의(lectures>0)를 가진 분류만 '운영' 배지(bucketIsLive).
//   분류 순서 = 학습 순서(기초→언어→웹→백엔드→모바일→데이터→AI→인프라→CS·자료구조[중급, 맨 끝]).
// icon = 토픽 기술 로고(devicon SVG, public/img/tech/*.svg 자체 호스팅). 토픽이 SSOT —
//   버킷 카드는 자기 토픽의 icon 을 모아 클러스터로, 토픽 카드는 📄 대신 이 로고를 쓴다.
// level/prereq/note = 난이도·선수지식 메타(학생경험 항목 5) — 강의 본문이 아닌 여기(SSOT)에서 정의.
//   선행 학습을 전제하는 트랙(예: 스프링 AI ← 스프링 부트·자바)을 화면에 알려 독학자가 막히지 않게 한다.
// repo = 토픽 실습 소스코드 GitHub 저장소 URL(SSOT). 강의목록 상단 RepoBanner 가 여기서 clone URL·저장소명을
//   파생한다. URL이 바뀌면 이 한 줄만 고치면 된다. (코드를 가진 토픽만 보유 — 없으면 배너 미노출)
// whatis = '뭘 배우나요?' 모달 카피(비전공 제1원칙) — 토픽 카드의 [뭘 배우나요?] CTA가 여는 모달이 읽는다.
//   강의 본문이 아닌 여기(SSOT)에서 입문자용 안내를 정의한다(비파괴). 키:
//     lead    = 한두 문장, 비유로 '이게 뭔지'(전공 용어 없이)
//     learn   = '이런 걸 배워요' 3~4줄(쉬운 말)
//     outcome = '다 배우면 이런 걸 할 수 있어요' 한 문단
//   (없으면 카드에 [뭘 배우나요?] 버튼을 숨기고 [시작하기]만 노출 — graceful)
export const CODE_BUCKETS = [
  { slug: 'basics', label: '기초소양', glyph: 'terminal', subtitle: '개발 첫걸음 · git · 리눅스',
    topics: [
      { dir: 'programming-intro', label: '개발 입문', level: 'intro',
        note: '코딩이 처음인 비전공자를 위한 첫 과목 — 컴퓨터의 원리와 “프로그래밍적 사고”를 먼저 잡아요. 선수 지식 없이 시작할 수 있어요.',
        whatis: {
          lead: '코드를 한 줄도 쓰기 전에, 컴퓨터에게 일을 시키는 “생각의 방법”부터 익히는 과목이에요. 요리로 치면 칼질을 배우기 전에 레시피를 읽고 순서를 짜는 법을 먼저 배우는 셈이에요.',
          learn: [
            '컴퓨터가 어떻게 일하는지 — 프로그램이 도는 기본 원리',
            '문제를 잘게 쪼개 순서대로 푸는 “프로그래밍적 사고”',
            '순서도·의사코드로 생각을 그림과 글로 정리하기',
            '브라우저에서 코드 한 줄을 직접 실행해 보는 첫 경험',
          ],
          outcome: '어떤 언어를 배우든 막히지 않는 “생각의 기초 체력”이 생겨요. 코딩이 처음인 비전공자에게 가장 먼저 권하는 출발점이에요.',
        } },
      { dir: 'git-github', label: 'Git·GitHub', level: 'intro', icon: '/img/tech/git.svg',
        note: '코드 버전 관리와 협업의 기본기 — 어떤 트랙을 가든 처음에 익혀두면 좋아요.',
        whatis: {
          lead: '내 코드의 모든 변경 이력을 사진 찍듯 저장해 두고, 언제든 과거로 되돌리거나 여럿이 한 코드를 함께 고칠 수 있게 해주는 도구예요. “보고서_최종_진짜최종_v3” 같은 복사본 지옥을 끝내줘요.',
          learn: [
            '변경 이력을 커밋으로 남기고 과거로 되돌리기',
            '브랜치로 갈라서 작업하고 다시 합치기(merge·rebase)',
            'GitHub에 올려 백업하고 협업하기',
            '여러 사람이 같은 코드를 충돌 없이 고치는 법',
          ],
          outcome: '코드를 안전하게 관리하고 팀으로 협업할 수 있어요. 어떤 트랙을 가든 맨 처음 익혀두면 평생 쓰는 기본기예요.',
        } },
      { dir: 'linux', label: '리눅스', level: 'intro', icon: '/img/tech/linux.svg',
        note: '서버·배포에서 쓰는 리눅스 셸과 명령어 기본기. 백엔드·인프라로 가기 전에 익혀두면 든든해요.',
        whatis: {
          lead: '서버 컴퓨터를 마우스 없이 키보드 명령어만으로 다루는 법이에요. 대부분의 웹서비스가 리눅스 서버 위에서 돌기 때문에, 백엔드·배포로 가려면 꼭 거치는 관문이에요.',
          learn: [
            '셸(터미널)에서 명령어로 파일과 폴더 다루기',
            '권한·프로세스 — 누가 무엇을 할 수 있는지 통제하기',
            '텍스트 검색·편집과 원격 서버 접속(SSH)',
            '반복 작업을 bash 스크립트로 자동화하기',
          ],
          outcome: '서버를 직접 다루고 배포·운영의 기초를 갖춰요. 백엔드·인프라(데브옵스)로 가기 전에 익혀두면 막히지 않아요.',
        } },
    ] },
  { slug: 'language', label: '언어기초', glyph: 'code', subtitle: '첫 프로그래밍 언어 · 자바·파이썬',
    topics: [
      { dir: 'java-basic', label: '자바 기초', level: 'intro', icon: '/img/tech/java.svg', repo: 'https://github.com/soongu/instagram-java-basic',
        whatis: {
          lead: '서버(웹서비스의 뒷단)에서 가장 널리 쓰이는 프로그래밍 언어예요. 컴퓨터에게 “이렇게 저렇게 일해라”라고 시키는 가장 기본적인 문법부터 차근차근 배워요.',
          learn: [
            '변수·조건문·반복문 — 프로그래밍의 기본 문법',
            '객체지향 — 현실의 개념을 코드로 묶어 정리하는 방법(자바의 핵심)',
            '컬렉션·예외처리 — 여러 데이터를 다루고 오류에 대비하기',
            '람다·스트림 등 요즘 자바 문법',
          ],
          outcome: '프로그래밍적 사고를 갖추고, 스프링 부트로 진짜 서버를 만들 준비가 끝나요. 정처기 실기에도 자바가 나와서 자격증 공부에도 도움이 돼요.',
        } },
      { dir: 'python-basic', label: '파이썬 기초', level: 'intro', icon: '/img/tech/python.svg',
        note: '프로그래밍 경험이 없어도 시작할 수 있는 파이썬 입문 — ‘개발 입문’을 먼저 들으면 더 수월해요. AI·데이터 분석으로 이어지는 출발점이에요.',
        whatis: {
          lead: '문법이 영어 문장처럼 읽혀서 입문자가 가장 부담 없이 시작하는 프로그래밍 언어예요. AI·데이터 분석·자동화로 가는 가장 넓은 출발점이에요.',
          learn: [
            '변수·조건문·반복문 — 프로그래밍의 기본 문법',
            '리스트·딕셔너리로 여러 데이터를 담고 다루기',
            '함수·모듈로 코드를 깔끔하게 나누고 재사용하기',
            '객체지향·예외처리, 요즘 파이썬(타입 힌트·비동기)까지',
          ],
          outcome: '파이썬으로 원하는 동작을 직접 코드로 짤 수 있고, 데이터 분석·AI(LangChain)로 자연스럽게 이어져요. 프로그래밍이 처음이어도 시작할 수 있어요.',
        } },
    ] },
  { slug: 'web', label: '웹 프론트', glyph: 'globe', subtitle: '화면 만들기 · HTML·리액트',
    topics: [
      { dir: 'html-css-js', label: 'HTML·CSS·JS', level: 'intro', icon: '/img/tech/javascript.svg', repo: 'https://github.com/soongu/instagram-html-css-js-basic',
        whatis: {
          lead: '웹페이지를 만드는 가장 기본이 되는 3가지 언어예요. 집 짓기에 비유하면 HTML은 뼈대(벽·문·창문), CSS는 인테리어(색·글꼴·배치), JavaScript는 전기·수도(버튼을 누르면 반응하는 동작)에 해당해요.',
          learn: [
            'HTML — 제목·문단·버튼·이미지 같은 화면 요소를 글로 적어 배치하기',
            'CSS — 색·글꼴·여백·레이아웃으로 보기 좋게 꾸미기',
            'JavaScript — 클릭·입력에 반응해 화면을 바꾸는 “동작” 넣기',
            '브라우저와 서버가 데이터를 주고받는 기본 원리',
          ],
          outcome: '내 손으로 간단한 웹페이지를 직접 만들고, 버튼·입력폼이 실제로 동작하는 화면까지 띄울 수 있어요. 모든 웹 개발의 출발점이라, 여기만 떼면 이후 리액트·서버 공부가 훨씬 수월해져요.',
        } },
      { dir: 'web-frontend-framework', label: '리액트', level: 'intermediate', prereq: ['HTML·CSS·JS'], icon: '/img/tech/react.svg',
        note: 'TypeScript · React · Next.js 트랙이에요. html-css-js에서 만든 순수 JS 화면을 React 컴포넌트로 다시 짭니다. 웹 기초를 먼저 익히고 오면 좋아요.',
        whatis: {
          lead: '버튼 하나, 목록 하나를 “부품(컴포넌트)”으로 만들어 레고처럼 조립해 화면을 짜는 도구예요. HTML·CSS·JS로 손수 만들던 걸 더 빠르고 덜 꼬이게 만들 수 있게 도와줘요.',
          learn: [
            'TypeScript — 실수를 미리 잡아주는 안전장치가 달린 자바스크립트',
            'React — 화면을 컴포넌트로 쪼개 재사용하고, 데이터가 바뀌면 화면이 알아서 갱신되게 하기',
            'Next.js — 검색 잘 되고 빠른, 실제 서비스 수준의 웹앱 만들기',
            '서버(API)에서 받아온 데이터를 화면에 보여주기',
          ],
          outcome: '인스타그램 같은 요즘 웹서비스의 화면을 만들 수 있어요. 실무 프론트엔드 개발자가 쓰는 바로 그 도구라 포트폴리오·취업으로 곧장 이어져요. (HTML·CSS·JS를 먼저 보고 오면 훨씬 쉬워요.)',
        } }] },
  { slug: 'backend', label: '백엔드', glyph: 'server', subtitle: '서버·API · 스프링',
    topics: [
      { dir: 'spring-boot', label: '스프링 부트', level: 'intermediate', prereq: ['자바 기초'], icon: '/img/tech/spring.svg',
        whatis: {
          lead: '자바로 진짜 “서버”를 만드는 도구예요. 앱이나 웹페이지가 보내는 요청(회원가입·로그인·글쓰기)을 받아 처리하고, 데이터베이스에 저장한 뒤 결과를 돌려주는 뒷단 전체를 담당해요.',
          learn: [
            '웹 서버를 띄우고 요청을 받아 응답하기',
            '데이터베이스와 연결해 정보를 저장·조회하기(JPA)',
            '회원가입·로그인·보안(Spring Security · JWT)',
            '인스타그램 같은 서비스의 기능을 직접 구현',
          ],
          outcome: '프론트엔드와 데이터베이스를 잇는 백엔드 서버를 처음부터 끝까지 만들 수 있어요. 백엔드 개발자 취업에 가장 핵심이 되는 기술이에요. (자바 기초를 먼저 익히고 오세요.)',
        } },
      { dir: 'polyglot-msa', label: 'MSA·폴리글랏', level: 'advanced', prereq: ['스프링 부트'],
        note: '스프링 부트로 만든 서비스를 여러 서비스로 나누는 MSA 트랙이에요. 백엔드를 충분히 익힌 다음 단계예요.',
        whatis: {
          lead: '하나의 큰 프로그램을 기능별로 잘게 나눈 작은 서버들(“마이크로서비스”)이 서로 대화하며 협력하게 만드는 방법이에요. 게다가 각 서버를 그 일에 가장 잘 맞는 언어로 짓는데, 주방에서 칼질·불·플레이팅 담당이 따로 있고 손발을 맞춰 한 상을 차리는 것과 같아요.',
          learn: [
            '추천은 Python(FastAPI), 알림은 Node(NestJS), 미디어는 Go처럼 일마다 맞는 언어로 서버 만들기',
            '언어가 달라도 gRPC(빠른 직접 호출)·Kafka(이벤트)로 서버끼리 대화시키기',
            'Kong API 게이트웨이로 여러 서버를 하나의 출입구로 묶기',
            '계약 테스트(Pact)로 서버끼리 약속이 깨지는 사고 막기',
          ],
          outcome: '여러 언어로 만든 서버들을 묶어 하나로 동작하는 진짜 마이크로서비스 시스템을 설계·운영할 수 있어요. 스프링 부트로 백엔드를 충분히 익힌 다음 단계예요.',
        } },
    ] },
  { slug: 'mobile', label: '모바일', glyph: 'smartphone', subtitle: '안드로이드 앱',
    topics: [
      { dir: 'mobile-app-programming', label: '리액트 네이티브', level: 'intermediate', prereq: ['리액트'], icon: '/img/tech/react.svg',
        note: 'web-frontend-framework에서 익힌 React를 그대로 모바일로 — React Native + Expo로 인스타그램 클론 앱을 만들어요. 새 언어를 배우지 않아요.',
        whatis: {
          lead: '웹에서 배운 React를 거의 그대로 써서 스마트폰 앱을 만드는 기술이에요(React Native + Expo). 새 언어를 처음부터 배우지 않고, 한 번 짠 코드로 안드로이드·아이폰 앱을 함께 만들 수 있어요.',
          learn: [
            '웹 React를 모바일 화면(컴포넌트)으로 옮겨 짜기',
            '서버(스프링 부트) API와 연결해 데이터 주고받기',
            '카메라·푸시 알림·권한 같은 휴대폰 기능 쓰기',
            'EAS로 빌드해서 앱스토어에 올리기',
          ],
          outcome: '인스타그램 같은 앱을 직접 만들어 내 폰에 띄우고 스토어 배포까지 해볼 수 있어요. 웹 리액트를 먼저 익히고 오면 훨씬 수월해요.',
        } },
      { dir: 'kotlin-native-android', label: '코틀린·안드로이드', level: 'intermediate', icon: '/img/tech/kotlin.svg',
        note: '코틀린으로 만드는 안드로이드 네이티브 앱 트랙이에요.',
        whatis: {
          lead: '우리가 매일 쓰는 안드로이드 앱을, 구글이 공식으로 미는 Kotlin 언어로 직접 만드는 트랙이에요. 화면은 “이렇게 생겨라”라고 코드로 말만 하면 그려주는 Jetpack Compose로 짜요. 자바와 사촌 같은 언어라 자바를 해봤다면 금방 익숙해져요.',
          learn: [
            'Kotlin — 자바보다 짧고, 값이 비어 터지는 실수를 막아주는 안전한 문법',
            'Jetpack Compose로 피드·버튼·목록 같은 화면을 직접 그리기',
            '서버(스프링 부트) API에 연결해 로그인·무한 스크롤·오프라인 저장 붙이기',
            '카메라·실시간 메시지·푸시 알림 같은 네이티브 기능 더하기',
          ],
          outcome: '인스타그램 같은 안드로이드 앱을 처음부터 만들어 Play 스토어에 올릴 수 있어요. 자바를 먼저 해봤다면 더 수월하고, 끝까지 가면 같은 코드로 아이폰 화면까지 공유해요.',
        } },
    ] },
  { slug: 'data', label: '데이터', glyph: 'database', subtitle: 'DB·데이터 분석',
    topics: [
      { dir: 'database', label: '데이터베이스', level: 'intro', icon: '/img/tech/oracle.svg',
        note: 'Oracle SQL로 SQLD 자격증을 대비하며 실전 SQL을 쌓는 트랙이에요. 프로그래밍 경험이 없어도 시작할 수 있고, 부트캠프에서는 자바 기초 다음·스프링 부트 직전에 배치하길 권해요.',
        whatis: {
          lead: '회원·주문·게시글 같은 정보를 차곡차곡 저장해 두고, 필요할 때 꺼내 쓰는 “거대한 창고”예요. 그 창고에 말을 거는 언어가 SQL이고, 이 과목에서 SQL을 배워요.',
          learn: [
            '데이터베이스가 뭐고 왜 필요한지 — 첫 SELECT까지',
            '데이터를 표로 설계하는 법(데이터 모델링·정규화)',
            '원하는 데이터를 골라 꺼내고·집계하고·합치는 SQL',
            'SQLD 자격증 대비 핵심 + 실전 함정 정리',
          ],
          outcome: '원하는 데이터를 자유롭게 조회·가공할 수 있고, SQLD 자격증까지 함께 대비돼요. 프로그래밍 경험이 없어도 시작할 수 있어 입문자에게 특히 좋아요.',
        } },
      { dir: 'python-data-analysis', label: '데이터 분석', level: 'intermediate', prereq: ['파이썬 기초'], icon: '/img/tech/pandas.svg',
        note: 'pandas로 데이터를 다루고 분석하는 트랙이에요. 파이썬 기초를 먼저 익히고 오면 좋아요.',
        whatis: {
          lead: '엑셀로는 버거운 큰 데이터를 파이썬(pandas)으로 빠르게 정리·분석해 “숨은 의미”를 캐내는 기술이에요. 표 데이터를 코드로 자유자재로 주무른다고 생각하면 돼요.',
          learn: [
            'pandas로 표 데이터를 불러와 정리·가공하기',
            '지저분한 데이터를 깨끗하게 다듬기(결측치·이상치)',
            '그래프(matplotlib·seaborn)로 데이터를 눈에 보이게 그리기',
            '데이터를 탐색(EDA)하고 머신러닝 직전까지 맛보기',
          ],
          outcome: '데이터에서 직접 인사이트를 찾아 그래프로 설명할 수 있어요. 파이썬 기초를 먼저 익히고 오면 좋고, AI·머신러닝으로 가는 다리가 돼요.',
        } },
    ] },
  { slug: 'ai', label: 'AI', glyph: 'sparkles', subtitle: '스프링 AI · LangChain',
    topics: [
      { dir: 'spring-ai', label: '스프링 AI', level: 'advanced', prereq: ['자바 기초', '스프링 부트'], icon: '/img/tech/spring.svg', repo: 'https://github.com/soongu/ai-friends',
        note: '스프링 부트로 만든 ai-friends 프로젝트 위에 얹어 진행해요. 자바·스프링이 처음이라면 먼저 “백엔드” 트랙부터 권해요.',
        whatis: {
          lead: '내가 만든 서버에 ChatGPT 같은 AI를 끼워 넣는 기술이에요. “AI에게 질문하고 답을 받아 우리 서비스에 활용하기”를 자바·스프링으로 구현해요.',
          learn: [
            'AI에게 프롬프트를 보내고 답을 받아오기',
            '이미지·음성까지 다루는 멀티모달',
            'AI가 직접 도구를 쓰게 하는 에이전트 · RAG(내 문서 기반 답변)',
            'AI 기능의 비용·운영 관리',
          ],
          outcome: '내 서비스에 AI 챗봇·추천·문서검색 같은 기능을 직접 붙일 수 있어요. 요즘 가장 수요가 많은 분야지만, 자바·스프링 기초가 먼저예요.',
        } },
      { dir: 'ai-programming', label: 'LangChain', level: 'advanced', prereq: ['파이썬 기초'], icon: '/img/tech/langchain.svg',
        note: 'LangChain·LangGraph로 파이썬에서 AI 애플리케이션을 만드는 트랙이에요. 파이썬 기초가 먼저예요.',
        whatis: {
          lead: '파이썬으로 ChatGPT 같은 AI를 엮어 진짜 “AI 제품”을 만드는 기술이에요(LangChain·LangGraph). 질문 한 번 던지는 걸 넘어, 내 문서를 읽고 스스로 도구를 쓰는 AI까지 만들어요.',
          learn: [
            'LangChain으로 AI 호출을 레고처럼 조립하기',
            'RAG — 내 문서를 검색해 근거 있는 답을 받기(벡터 DB)',
            'LangGraph 에이전트 — AI가 스스로 판단하고 도구 쓰게 하기',
            'AI 기능을 서버(FastAPI)로 감싸 제품으로 내보내기',
          ],
          outcome: '문서 검색 챗봇·AI 에이전트 같은 요즘 가장 수요 많은 AI 앱을 직접 만들 수 있어요. 파이썬 기초가 먼저예요. (자바·스프링으로 같은 걸 하려면 “스프링 AI”를 보세요.)',
        } },
    ] },
  { slug: 'infra', label: '인프라', glyph: 'rocket', subtitle: '도커·배포·운영',
    topics: [
      { dir: 'infra-devops', label: '인프라·데브옵스', level: 'advanced', prereq: ['스프링 부트'], icon: '/img/tech/docker.svg',
        note: '만든 앱을 Docker → AWS → 쿠버네티스 순서로 배포·운영하는 트랙이에요. 배포할 앱(스프링 부트)이 있어야 의미가 있어요.',
        whatis: {
          lead: '내가 만든 앱을 인터넷에 띄워 누구나 쓸 수 있게 “배달”하고, 잘 돌아가는지 24시간 지켜보며 자동으로 관리하는 기술이에요. 식당으로 치면 요리(개발) 이후의 매장 운영·배달 시스템 전체예요.',
          learn: [
            'Docker로 앱을 어디서나 똑같이 도는 상자에 담기',
            'AWS 클라우드에 서버를 올리고 운영하기',
            'Terraform·CI/CD로 배포를 코드로 자동화하기',
            '쿠버네티스로 여러 서버를 관리하고 상태를 모니터링하기',
          ],
          outcome: '앱을 직접 클라우드에 배포하고 안정적으로 운영할 수 있어요. 배포할 앱(스프링 부트)을 먼저 만들어 두면 훨씬 와닿아요.',
        } },
    ] },
  { slug: 'cs', label: 'CS·자료구조', glyph: 'chart', subtitle: '중급 · 자료구조·알고리즘·CS·클린코드',
    topics: [
      { dir: 'data-structures-algorithms', label: '자료구조·알고리즘', level: 'intermediate', prereq: ['파이썬 기초'],
        note: '코딩테스트의 관문 — 자료구조·알고리즘을 직접 구현하고 유형별로 풀어요. 언어 하나(파이썬·자바)를 뗀 다음에 권해요.',
        whatis: {
          lead: '데이터를 효율적으로 담는 “정리 상자(자료구조)”와, 문제를 빠르게 푸는 “레시피(알고리즘)”를 배우는 과목이에요. 코딩테스트의 관문이라 취업 준비의 핵심이에요.',
          learn: [
            '빅오 표기 — 내 코드가 빠른지 느린지 가늠하기',
            '배열·스택·큐·트리·그래프·해시 같은 자료구조',
            '정렬·이진탐색, 그리디·DP·백트래킹 같은 알고리즘',
            '실제 코딩테스트 유형별 문제 풀이',
          ],
          outcome: '“되긴 되는데 시간 초과”를 넘어 효율적인 코드를 짜고, 코딩테스트를 통과할 수 있어요. 파이썬이나 자바 하나를 뗀 뒤에 권해요.',
        } },
      { dir: 'cs-fundamentals', label: 'CS 기초지식', level: 'intermediate',
        note: '컴퓨터 구조·운영체제·네트워크 — 언어 밑에 깔린 원리와 기술 면접 CS 질문 대비. 코딩에 어느 정도 익숙해진 뒤가 좋아요.',
        whatis: {
          lead: '컴퓨터가 속에서 어떻게 돌아가는지 — 메모리·운영체제·네트워크의 원리를 배우는 과목이에요. 코드를 짜는 것 너머의 “왜 그렇게 동작하는가”를 알면 기술 면접에서 강해져요.',
          learn: [
            '컴퓨터 구조 — CPU·메모리 계층·캐시',
            '운영체제 — 프로세스·스레드·동기화',
            '네트워크 — TCP/IP·HTTP·통신 핸드셰이크',
            '기술 면접에서 자주 나오는 CS 질문 대비',
          ],
          outcome: '면접관이 “한 겹 아래”를 물어도 답할 수 있는 기초 내공이 생겨요. 코딩에 어느 정도 익숙해진 뒤에 보면 좋아요.',
        } },
      { dir: 'clean-code', label: '클린코드', level: 'intermediate',
        note: '읽기 좋고 고치기 쉬운 코드를 쓰는 법 — 리팩토링·설계 원칙. 코드를 충분히 써본 뒤에 빛을 발하는 주제예요.',
        whatis: {
          lead: '돌아가기만 하는 코드를 넘어, 남(과 미래의 나)이 읽기 좋고 고치기 쉬운 코드로 쓰는 법이에요. “나중에 고치지” 하고 미룬 코드가 보내는 비싼 청구서를 막아줘요.',
          learn: [
            '좋은 이름·작은 함수·군더더기 없는 주석 쓰기',
            '객체지향 설계 원칙(SOLID)으로 구조 잡기',
            '자주 쓰는 디자인 패턴 익히기',
            '지저분한 코드를 안전하게 다듬는 리팩토링',
          ],
          outcome: '읽기 좋고 바꾸기 쉬운 코드를 쓸 수 있어요. 코드를 충분히 써본 뒤에 보면 “왜 이게 중요한지” 확 와닿아요.',
        } },
    ] },
]

// 슬러그 = URL 경로(불변식 #3·#6: 전부 ASCII). 의미 전달을 위해 s1~s5 대신 과목을 뜻하는 영문 슬러그를 쓴다
// (한글 슬러그는 한글 URL → NFD/NFC 혼재 호스팅 깨짐이라 금지). dir(=원본 폴더명 '1과목'…)은 데크 매칭 키라 그대로 둔다.
const CPE_SUBJECTS = [
  { slug: 'design',   dir: '1과목', label: '1과목 · 소프트웨어 설계' },
  { slug: 'develop',  dir: '2과목', label: '2과목 · 소프트웨어 개발' },
  { slug: 'database', dir: '3과목', label: '3과목 · 데이터베이스 구축' },
  { slug: 'coding',   dir: '4과목', label: '4과목 · 프로그래밍 언어 활용' },
  { slug: 'security', dir: '5과목', label: '5과목 · 정보시스템 구축관리' },
]

// 분류가 클릭 가능한가 = dir 토픽(로드맵 페이지)을 가지는가 — config만으로 판정(내비 빠름). 현재 모든 분류가 해당.
export function bucketHasDir(b) { return b.topics.some((t) => t.dir) }
// 분류에 실제 강의가 있는가(=‘운영’ 배지, 없으면 ‘준비중’ 로드맵). 첫 호출 때 1회 FS 스캔 후 메모이즈(150페이지 렌더 공용).
//   raw CODE_BUCKETS 위에서 동작(Base.astro 내비가 codeBuckets() 없이 호출) — lazy 라 FALLBACK_TITLES 등 const 초기화 이후 실행됨.
let _liveBucketSlugs = null
export function bucketIsLive(b) {
  if (!_liveBucketSlugs) {
    _liveBucketSlugs = new Set(
      CODE_BUCKETS.filter((x) => x.topics.some((t) => t.dir && topicLectures(t.dir).length > 0)).map((x) => x.slug)
    )
  }
  return _liveBucketSlugs.has(b.slug)
}

// 원본 MD 불변. H1을 가상 프론트매터(title)로 추출, 본문에서 첫 H1만 제거.
export function loadDoc(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8')
  const h1 = raw.match(/^#\s+(.+?)\s*$/m)
  // 제목은 항상 plain text 로 소비됨(<h1>·<title>·og·JSON-LD·라벨) → 인라인 마크다운(**, `code`) 표식 제거.
  // 본문(body)은 그대로 둬 render() 가 볼드/코드를 정상 렌더한다.
  const title = stripInlineMd(h1 ? h1[1].trim() : path.basename(absPath, '.md'))
  const body = h1
    ? (raw.slice(0, h1.index) + raw.slice(h1.index + h1[0].length)).replace(/^\s+/, '')
    : raw
  return { title, body, hasH1: !!h1 }
}

// H5: H1 없는 강의 폴백 제목 맵(원본 비수정·황금률 — day01~03 은 원본에 H1 부재라 슬러그 'day01'이 노출됐다).
//   키 = `${dir}/${id}`. 실제 본문(Step 헤딩)에서 도출, day04+ 'DayNN: 주제' 표기와 일관.
//   목록·h1·title·이어보기·페이저·/map 6개 표면이 이 한 곳으로 동시 복구된다.
const FALLBACK_TITLES = {
  'java-basic/day01': 'Day01: 자바 시작 — JDK 설치와 첫 프로그램',
  'java-basic/day02': 'Day02: 변수와 타입',
  'java-basic/day03': 'Day03: 연산자',
}

// ── 코딩: 한 토픽 폴더의 *-lecture.md 자동 발견 ──────────────────
export function topicLectures(dir) {
  const abs = path.join(BACKEND, dir)
  return ls(abs)
    .filter((f) => f.endsWith('-lecture.md'))
    .map((f) => {
      const id = f.replace(/-lecture\.md$/, '')
      const d = loadDoc(path.join(abs, f))
      const ans = path.join(abs, id + '-answers.md')
      // 읽는 시간(한글 ~300자/분) — 목록 행 메타(raw 슬러그 대체). 본문은 이미 로드됨(추가 비용 0).
      const minutes = Math.max(1, Math.round(d.body.replace(/\s/g, '').length / 300))
      return {
        id, slug: slugify(id),
        title: d.hasH1 ? d.title : (FALLBACK_TITLES[`${dir}/${id}`] || id),
        minutes,
        summary: LECTURE_SUMMARIES[`${dir}/${id}`] || null, // 강의목록 행 한 줄 요약(없으면 null → 읽기시간 폴백)
        file: path.join(abs, f),
        answersFile: fs.existsSync(ans) ? ans : null,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
}

export function codeBuckets() {
  return CODE_BUCKETS.map((b) => {
    const topics = b.topics.map((t) =>
      t.dir ? { ...t, slug: t.dir, lectures: topicLectures(t.dir) } : { ...t, lectures: [] }
    )
    return { ...b, topics, status: bucketIsLive(b) ? 'live' : 'soon' }
  })
}
export function codeBucket(slug) { return codeBuckets().find((b) => b.slug === slug) || null }

// 선수지식 / '먼저 알면 좋아요' 칩 → 해당 토픽 페이지 딥링크. prereq 문자열은 토픽 label 과 동일(SSOT)이라 라벨로 매칭한다.
// 칩을 CTA 링크로 만들 때 LevelPrereq·WhatIsModal 이 공유. 매칭 토픽이 없으면 null → 호출부는 비링크 span 으로 graceful degrade.
export function topicHrefByLabel(label) {
  const key = String(label || '').trim()
  if (!key) return null
  for (const b of CODE_BUCKETS) {
    for (const t of b.topics) {
      if (t.dir && t.label === key) return `/code/${b.slug}/${t.dir}/`
    }
  }
  return null
}

// ── 코딩 커리큘럼 Phase/Category (강의 목록 그룹화의 단일 출처) ──────────────
// 형제 폴더 curriculum.md 의 학습 구조를 UI에 반영한다. 트랙마다 분류 체계가 다르다:
//   html-css-js = Category(강의 id 첫 글자 A/B/C…) · java/spring-ai/spring-boot = Phase(dayNN 일수 범위)
// 각 tier(필수/심화 또는 Act) → group(Phase/Category). 강의 0개 group 도 유지 → '준비중' 로드맵으로 노출.
// (커리큘럼 '구조'만 인코딩 — 강의대본 본문은 읽지 않는다. 불변식 #2)

// 'day08' → 8 · 'day14-5' → 14.5 · 'day07-5' → 7.5 (소수 Day 지원)
function dayFloat(id) {
  const m = String(id).match(/day0*(\d+)(?:-(\d+))?/i)
  return m ? parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 10 : 0) : 0
}
// 강의 행 배지 라벨: 'A1' → 'A-1' · 'day08' → 'Day 8' · 'day14-5' → 'Day 14.5'
export function moduleTag(id) {
  let m = String(id).match(/^([A-Za-z])-?(\d+)$/)
  if (m) return `${m[1].toUpperCase()}-${m[2]}`
  m = String(id).match(/^day0*(\d+)(?:-(\d+))?$/i)
  if (m) return `Day ${m[1]}${m[2] ? '.' + m[2] : ''}`
  return id
}

const TOPIC_CURRICULUM = {
  // ── 분야 9분류 신규 토픽 로드맵(0강 → 준비중 로드맵). 형제 폴더 curriculum.md 의 카테고리(모듈 ID A·B·C…) 구조.
  //    교안 파일은 모듈 ID('A1-lecture.md')를 쓰므로 by:'prefix'(첫 글자 = 카테고리 키). 강의대본 본문은 안 읽음(구조만). ──
  'programming-intro': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 프로그래밍의 첫 문', desc: '컴퓨터 원리 · 사고 도구 · 환경 첫걸음' },
      ] },
    ],
  },
  'git-github': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 버전 관리와 협업의 첫 문', desc: '로컬 Git · GitHub 협업 · 히스토리' },
      ] },
    ],
  },
  'linux': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 리눅스 셸·시스템 기본기', desc: '파일 · 권한 · 텍스트 · 원격 · 자동화' },
      ] },
    ],
  },
  'python-basic': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 파이썬 입문', desc: '환경(uv) · 변수 · 제어문' },
        { key: 'B', label: 'Category B · 자료구조 (내장)', desc: '리스트 · 딕셔너리 · 셋 · 튜플' },
        { key: 'C', label: 'Category C · 함수와 모듈', desc: '함수 · 스코프 · 모듈 · 패키지' },
        { key: 'D', label: 'Category D · 객체지향', desc: '클래스 · 상속 · 매직 메서드' },
        { key: 'E', label: 'Category E · 예외와 파일', desc: '예외 처리 · 파일 입출력' },
        { key: 'F', label: 'Category F · 모던 파이썬 & 비동기', desc: '타입 힌트 · 데코레이터 · async' },
        { key: 'G', label: 'Category G · 표준 라이브러리 & 테스트', desc: '표준 라이브러리 · pytest' },
      ] },
    ],
  },
  'mobile-app-programming': {
    by: 'prefix',
    tiers: [
      { label: '필수 과정', groups: [
        { key: 'A', label: 'Category A · React Native + Expo 입문', desc: '웹 React 를 모바일로' },
        { key: 'B', label: 'Category B · 상태 & 데이터', desc: 'spring-boot v2 API 연동' },
        { key: 'C', label: 'Category C · 네이티브 기능', desc: '카메라 · 푸시 · 권한 · 저장' },
        { key: 'D', label: 'Category D · 빌드 & 배포', desc: 'EAS 빌드 · 스토어 배포' },
      ] },
      { label: '심화 · 보너스 (선택)', groups: [
        { key: 'E', label: 'Category E · 애니메이션 & 인터랙션', desc: 'Reanimated · 제스처' },
        { key: 'F', label: 'Category F · 품질', desc: '테스트 · 접근성 · 성능 · 보안' },
        { key: 'G', label: 'Category G · iOS 보너스 트랙', desc: 'iOS 네이티브 맛보기' },
      ] },
    ],
  },
  'infra-devops': {
    by: 'prefix',
    tiers: [
      { label: '핵심 과정', groups: [
        { key: 'A', label: 'Category A · 컨테이너화', desc: 'Docker · 이미지 · Compose' },
        { key: 'B', label: 'Category B · 클라우드 (AWS)', desc: 'EC2 · S3 · VPC · LocalStack' },
        { key: 'C', label: 'Category C · IaC', desc: 'Terraform · 인프라 코드화' },
        { key: 'D', label: 'Category D · CI/CD & GitOps', desc: '파이프라인 · OIDC 키리스 배포' },
        { key: 'E', label: 'Category E · 오케스트레이션 (Kubernetes)', desc: 'K8s 배포 · 스케일 · 롤아웃' },
        { key: 'F', label: 'Category F · 모니터링 & Observability', desc: '메트릭 · 로그 · 트레이싱' },
      ] },
      { label: '심화 과정 (선택)', groups: [
        { key: 'G', label: 'Category G · 네트워크 & 보안', desc: '게이트웨이 · 보안 강화' },
        { key: 'H', label: 'Category H · 고급 운영', desc: '비용 · 멀티클러스터' },
      ] },
    ],
  },
  'data-structures-algorithms': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 기초와 복잡도', desc: '빅오 · 시간복잡도' },
        { key: 'B', label: 'Category B · 선형 자료구조', desc: '배열 · 스택 · 큐 · 연결리스트' },
        { key: 'C', label: 'Category C · 비선형 자료구조', desc: '트리 · 힙 · 그래프 · 해시' },
        { key: 'D', label: 'Category D · 정렬과 탐색', desc: '정렬 · 이진탐색' },
        { key: 'E', label: 'Category E · 알고리즘 패러다임', desc: '그리디 · DP · 백트래킹 · 그래프' },
        { key: 'F', label: 'Category F · 고급 & 실전', desc: '고급 그래프 · 실전 코딩테스트' },
      ] },
    ],
  },
  'cs-fundamentals': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 컴퓨터 구조', desc: 'CPU · 메모리 계층 · 캐시' },
        { key: 'B', label: 'Category B · 운영체제', desc: '프로세스 · 스레드 · 메모리 · 동기화' },
        { key: 'C', label: 'Category C · 네트워크', desc: 'TCP/IP · HTTP · 핸드셰이크' },
        { key: 'D', label: 'Category D · 데이터·복잡도 면접 기초', desc: 'DB · 자료구조 면접 핵심' },
        { key: 'E', label: 'Category E · 기술 면접 종합', desc: 'CS 면접 마무리' },
      ] },
    ],
  },
  'html-css-js': {
    by: 'prefix',
    tiers: [
      { label: '필수 과정', groups: [
        { key: 'A', label: 'Category A · HTML 기초', desc: '웹의 뼈대를 세운다' },
        { key: 'B', label: 'Category B · CSS 기초', desc: '뼈대에 옷을 입힌다' },
        { key: 'C', label: 'Category C · JavaScript 기초', desc: '페이지에 생명을 불어넣는다' },
        { key: 'D', label: 'Category D · DOM & 브라우저 API', desc: '화면을 조작하고 서버와 대화한다' },
      ] },
      { label: '심화 과정 (선택)', groups: [
        { key: 'E', label: 'Category E · JavaScript 심화', desc: '언어의 깊이를 파고든다' },
        { key: 'F', label: 'Category F · 웹 성능 & 최적화', desc: '빠른 페이지를 만든다' },
        { key: 'G', label: 'Category G · 웹 접근성 & 표준', desc: '모두를 위한 웹을 만든다' },
        { key: 'H', label: 'Category H · 고급 브라우저 API', desc: '브라우저의 숨겨진 힘을 쓴다' },
      ] },
    ],
  },
  'web-frontend-framework': {
    by: 'prefix',
    tiers: [
      { label: '필수 과정 (부트캠프 코어)', groups: [
        { key: 'A', label: 'Category A · TypeScript 기초', desc: 'JS에 가드레일을 붙인다' },
        { key: 'B', label: 'Category B · React.js 기초', desc: '선언적 렌더링으로 멘탈모델을 다시 짠다' },
        { key: 'C', label: 'Category C · React.js 심화', desc: 'SPA로 Spring Boot API를 소비한다' },
        { key: 'D', label: 'Category D · Next.js 16', desc: '서버 컴포넌트 · 서버 액션으로 풀스택을 잇는다' },
        { key: 'E', label: 'Category E · UI & 스타일링', desc: 'Tailwind v4 · Shadcn/UI 디자인 시스템' },
        { key: 'F', label: 'Category F · 테스팅', desc: '테스팅 트로피로 안전망을 짠다' },
        { key: 'G', label: 'Category G · 인증 & 보안', desc: 'Auth.js 로그인 · 프론트 보안' },
        { key: 'H', label: 'Category H · 프로덕션 & 운영', desc: '빠르고 · 관찰 가능하고 · 글로벌하게' },
      ] },
    ],
  },
  'database': {
    by: 'prefix',
    tiers: [
      { label: '필수 과정 (SQLD 대비)', groups: [
        { key: 'A', label: 'Category A · 도입', desc: '데이터베이스와 실습 환경 — 첫 SELECT까지' },
        { key: 'B', label: 'Category B · 데이터 모델링', desc: 'SQLD 1과목 — 정규화 · 식별자 · 관계' },
        { key: 'C', label: 'Category C · SQL 기본', desc: 'SELECT · 함수 · 집계 · 조인' },
        { key: 'D', label: 'Category D · SQL 활용', desc: '서브쿼리 · 계층형 · 윈도우 · 집합' },
        { key: 'E', label: 'Category E · SQLD 마무리', desc: '방언 대조 + 모의고사 실전' },
      ] },
      { label: '추가 · 선택 과정', groups: [
        { key: 'F', label: 'Category F · MySQL 마이그레이션', desc: '같은 일을 다른 방언으로 (스프링 부트 정합)' },
        { key: 'G', label: 'Category G · 모던 DB 동향', desc: 'SQL:2023 · 벡터 · JSON' },
      ] },
    ],
  },
  'java-basic': {
    by: 'day',
    tiers: [
      { label: '필수 과정', groups: [
        { key: 'p1', label: 'Phase 1 · 프로그래밍 첫걸음', desc: 'Hello World부터 메서드까지', range: [1, 7] },
        { key: 'p2', label: 'Phase 2 · 객체지향의 세계', desc: '클래스 · 상속 · 인터페이스', range: [8, 16] },
        { key: 'p3', label: 'Phase 3 · 자바 핵심 라이브러리', desc: 'String · 컬렉션 · 예외 처리', range: [17, 24] },
        { key: 'p4', label: 'Phase 4 · 모던 자바', desc: '람다 · 스트림 · Record · Gradle · 복습', range: [25, 32] },
      ] },
      { label: '심화 과정 (선택)', groups: [
        { key: 'p5', label: 'Phase 5 · 동시성과 I/O', desc: 'Thread · Virtual Thread · NIO', range: [33, 39] },
        { key: 'p6', label: 'Phase 6 · 설계와 깊이', desc: '디자인 패턴 · JVM · 테스트', range: [40, 45] },
      ] },
    ],
  },
  'spring-ai': {
    by: 'day',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'p1', label: 'Phase 1 · 기반 다지기', desc: '세팅 · 프로바이더 추상화', range: [1, 2] },
        { key: 'p2', label: 'Phase 2 · ChatClient 핵심', desc: '프롬프트 · 구조화 출력 · 스트리밍', range: [3, 6] },
        { key: 'p3', label: 'Phase 3 · 멀티모달', desc: '이미지 · Vision · 음성 · 비디오', range: [7, 10.9] },
        { key: 'p4', label: 'Phase 4 · 에이전트 개념 & 패턴', desc: 'Tool Calling · Agentic Patterns', range: [11, 14.4] },
        { key: 'p5', label: 'Phase 5 · RAG', desc: '임베딩 · 검색 증강 파이프라인', range: [14.5, 16] },
        { key: 'p6', label: 'Phase 6 · MCP & A2A', desc: 'MCP 클라이언트 · 서버 · A2A', range: [17, 18] },
        { key: 'p7', label: 'Phase 7 · Harness & 운영', desc: 'Cost Guardrail · Observability · LLM Ops', range: [19, 24] },
      ] },
    ],
  },
  'spring-boot': {
    by: 'day',
    tiers: [
      { label: 'Act 1 · 모놀리스 구축', groups: [
        { key: 'p1', label: 'Phase 1 · 첫 서버를 띄우다', desc: 'Docker Compose + Spring Boot 4 입문', range: [1, 5] },
        { key: 'p2', label: 'Phase 2 · 데이터를 다루다', desc: 'JPA · Hibernate 7 · QueryDSL', range: [6, 18] },
        { key: 'p3', label: 'Phase 3 · API를 설계하다', desc: 'REST · OpenAPI · API 버저닝', range: [19, 23] },
        { key: 'p4', label: 'Phase 4 · 문을 잠그다', desc: 'Spring Security 7 · JWT · OAuth2', range: [24, 31] },
        { key: 'p5', label: 'Phase 5 · 인스타그램을 만들다', desc: '소셜 기능 전체 구현', range: [32, 45] },
        { key: 'p6', label: 'Phase 6 · 품질을 지키다', desc: '테스트 전략 · Testcontainers', range: [46, 52] },
        { key: 'p7', label: 'Phase 7 · 속도를 올리다', desc: 'Valkey · 캐싱 · 동시성', range: [53, 62] },
        { key: 'p8', label: 'Phase 8 · 실시간으로 대화하다', desc: 'WebSocket · SSE · 알림', range: [63, 72] },
      ] },
      { label: 'Act 2 · 모듈러 모놀리스로 성숙', groups: [
        { key: 'p9', label: 'Phase 9 · 서비스를 관찰하다', desc: 'Observability · 운영 기초', range: [73, 80] },
        { key: 'p10', label: 'Phase 10 · 구조를 잡다', desc: 'Spring Modulith · 모듈러 모놀리스', range: [81, 95] },
      ] },
      { label: 'Act 3 · MSA로 진화', groups: [
        { key: 'p11', label: 'Phase 11 · 메시지를 흘리다', desc: 'Kafka · 이벤트 기반 아키텍처', range: [96, 107] },
        { key: 'p12', label: 'Phase 12 · 검색을 넣다', desc: 'Elasticsearch · CQRS', range: [108, 115] },
        { key: 'p13', label: 'Phase 13 · 서비스를 나누다', desc: 'gRPC · API Gateway · 분산 패턴', range: [116, 135] },
      ] },
      { label: 'Act 4 · 실무처럼 기능을 추가하다', groups: [
        { key: 'p14', label: 'Phase 14 · 스토리 기능 스프린트', desc: '150일 기술 종합 캡스톤', range: [136, 150] },
      ] },
    ],
  },
  // ── 준비중 신규 토픽 로드맵(0강 → 준비중 로드맵). 형제 폴더 curriculum.md '모듈 구조'(카테고리 A·B·C…) 기준.
  //    교안 파일이 모듈 ID('A1-lecture.md')라 by:'prefix'(첫 글자 = 카테고리 키). 강의대본/본문은 안 읽음(구조만, 불변식 #2).
  //    원본이 '시니어 심화/선택'으로 표기한 카테고리는 별도 tier 로 분리(코어 우선 노출).
  'python-data-analysis': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 데이터 도구 기초', desc: 'pandas · NumPy · Jupyter' },
        { key: 'B', label: 'Category B · 데이터 정제와 변환', desc: '결측치 · 이상치 · 가공' },
        { key: 'C', label: 'Category C · 시계열과 시각화', desc: 'matplotlib · seaborn' },
        { key: 'D', label: 'Category D · EDA와 머신러닝 다리', desc: '탐색적 분석 · scikit-learn 입문' },
      ] },
    ],
  },
  'ai-programming': {
    by: 'prefix',
    tiers: [
      { label: '코어 과정', groups: [
        { key: 'A', label: 'Category A · Python & AI 기초', desc: 'LLM 호출 · 프로바이더 추상화' },
        { key: 'B', label: 'Category B · LangChain', desc: '호출을 체인으로 조립' },
        { key: 'C', label: 'Category C · RAG & Vector DB', desc: '내 문서를 검색해 답하기' },
        { key: 'D', label: 'Category D · LangGraph & 에이전트', desc: 'AI가 스스로 도구를 쓴다' },
        { key: 'E', label: 'Category E · AI 서비스 통합', desc: 'FastAPI로 제품화' },
        { key: 'G', label: 'Category G · AI 보안 & 품질', desc: '프롬프트 보안 · 품질 평가' },
      ] },
      { label: '심화 과정 (시니어 · 선택)', groups: [
        { key: 'F', label: 'Category F · 파인튜닝 & 멀티모달', desc: 'LoRA · 이미지/음성' },
        { key: 'H', label: 'Category H · AI 프로덕션 운영', desc: '비용 · 관측 · LLMOps' },
      ] },
    ],
  },
  'kotlin-native-android': {
    by: 'prefix',
    tiers: [
      { label: '코어 과정', groups: [
        { key: 'A', label: 'Category A · Kotlin 언어', desc: '자바보다 짧고 안전한 문법' },
        { key: 'B', label: 'Category B · Compose & 안드로이드 기초', desc: '선언형 UI Jetpack Compose' },
        { key: 'C', label: 'Category C · 아키텍처 & 데이터', desc: 'spring-boot API 연동 · Room' },
        { key: 'D', label: 'Category D · 네이티브 기능', desc: '카메라 · 실시간 · 푸시' },
        { key: 'E', label: 'Category E · 빌드 & 배포', desc: 'R8 · 앱 서명 · Play 스토어' },
      ] },
      { label: '심화 과정 (선택)', groups: [
        { key: 'F', label: 'Category F · 품질', desc: '테스트 · 성능 · 접근성' },
        { key: 'G', label: 'Category G · Kotlin Multiplatform', desc: 'iOS까지 코드 공유 · 시니어 심화' },
      ] },
    ],
  },
  'polyglot-msa': {
    by: 'prefix',
    tiers: [
      { label: '코어 과정', groups: [
        { key: 'A', label: 'Category A · FastAPI (Python)', desc: '추천 서비스' },
        { key: 'B', label: 'Category B · NestJS (Node.js)', desc: 'GraphQL · 실시간 알림 서비스' },
        { key: 'C', label: 'Category C · Go 마이크로서비스', desc: '이미지 · 미디어 처리' },
        { key: 'D', label: 'Category D · 서비스 간 통신 & 통합', desc: 'gRPC · Kafka · API Gateway' },
        { key: 'F', label: 'Category F · 테스트 & 품질', desc: 'Pact · Testcontainers' },
      ] },
      { label: '심화 과정 (시니어 · 선택)', groups: [
        { key: 'E', label: 'Category E · Rust 마이크로서비스', desc: '이미지 메타데이터 서비스' },
        { key: 'G', label: 'Category G · 운영 & DevOps 통합', desc: '멀티 언어 CI/CD · 독립 배포' },
      ] },
    ],
  },
  'clean-code': {
    by: 'prefix',
    tiers: [
      { label: '전체 과정', groups: [
        { key: 'A', label: 'Category A · 클린 코드', desc: '이름 · 함수 · 주석' },
        { key: 'B', label: 'Category B · 객체지향 설계 원칙', desc: 'SOLID' },
        { key: 'C', label: 'Category C · 디자인 패턴', desc: '자주 쓰는 패턴' },
        { key: 'D', label: 'Category D · 리팩토링 & 실전', desc: '안전하게 다듬기' },
      ] },
    ],
  },
}

// 한 토픽의 강의를 커리큘럼 tier→group(Phase/Category)으로 묶는다. 빈 group 도 보존(준비중 로드맵).
// 커리큘럼 정의가 없으면 단일 그룹 평면 목록으로 graceful degrade.
export function topicGroups(dir) {
  const lectures = topicLectures(dir).map((l) => ({ ...l, tag: moduleTag(l.id) }))
  const cfg = TOPIC_CURRICULUM[dir]
  if (!cfg) return { tiers: [{ label: null, groups: [{ key: 'all', label: null, desc: null, lectures }] }], total: lectures.length }

  const keyOf = (l) => {
    if (cfg.by === 'prefix') return (String(l.id)[0] || '').toUpperCase()
    const d = dayFloat(l.id)
    for (const t of cfg.tiers) for (const g of t.groups) if (g.range && d >= g.range[0] && d <= g.range[1]) return g.key
    return null
  }
  const byKey = new Map()
  for (const l of lectures) {
    const k = keyOf(l)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(l)
  }
  const tiers = cfg.tiers.map((t) => ({
    label: t.label,
    groups: t.groups.map((g) => ({ key: g.key, label: g.label, desc: g.desc, range: g.range, lectures: byKey.get(g.key) || [] })),
  }))
  // 안전망: 정의된 어떤 group 키에도 안 잡힌 강의(원본이 커리큘럼 범위 밖으로 늘어난 경우 — 황금률상 원본은 외부에서 변함)는
  // 조용히 숨기지 말고 '추가' 그룹으로 항상 노출한다. (예: java-basic day44+, html-css-js I1 …)
  const knownKeys = new Set(cfg.tiers.flatMap((t) => t.groups.map((g) => g.key)))
  const leftover = []
  for (const [k, ls] of byKey) if (!knownKeys.has(k)) leftover.push(...ls)
  if (leftover.length) {
    leftover.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    tiers.push({ label: '추가 강의', groups: [{ key: '_extra', label: '추가 · 보너스 강의', desc: '커리큘럼에 새로 더해진 강의', lectures: leftover }] })
  }
  return { tiers, total: lectures.length }
}

// ── 정보처리기사 필기: 과목 / 강 (강의대본 본문은 안 읽음, 파일명만) ──
function findCpeDeck(subjectDir, num) {
  const d = CPE_DECK.get(`${subjectDir}#${num}`)
  return d ? deckUrl(d.slug) : null
}
export function cpeSubjects() {
  return CPE_SUBJECTS.map((s) => {
    const dir = path.join(CERT, '정보처리기사', '필기', 'outputs', s.dir)
    const seen = new Set()
    const lectures = ls(dir)
      .filter((f) => /^\d+강_.+_강의대본.*\.md$/.test(f))
      .map((f) => {
        const m = f.match(/^(\d+)강_(.+?)_강의대본/)
        const num = m ? parseInt(m[1], 10) : 0
        return { num, slug: String(num), topic: m ? m[2] : f, deck: findCpeDeck(s.dir, num) }
      })
      .filter((l) => (seen.has(l.num) ? false : seen.add(l.num)))
      .sort((a, b) => a.num - b.num)
    return { ...s, lectures }
  })
}
export function cpeSubject(slug) { return cpeSubjects().find((s) => s.slug === slug) || null }

// F29: 정처기 첫 deck-ready 강 딥링크 도출 — '필기→이론→과목'으로 살아있는 선택지가 1개뿐인 허브를
//   2~3단계 건너뛰게 한다(자격증 첫 강까지 5클릭 → 단축). 슬러그 변경에 견디게 cpeSubjects()에서 도출하고,
//   라우트는 theory [subject]/[lecture]( /cert/cpe/written/theory/<s.slug>/<l.slug>/ )와 동일 트레일링슬래시.
export function cpeFirstReady() {
  for (const s of cpeSubjects()) {
    const l = s.lectures.find((x) => x.deck)
    if (l) return { href: `/cert/cpe/written/theory/${s.slug}/${l.slug}/`, num: l.num, topic: l.topic, subjectLabel: s.label }
  }
  return null
}

// ── SQLD 벼락치기: 데크 manifest에서 발견(강의대본 본문 안 읽음) ──
// 라우트 슬러그는 부 번호(/cert/sqld/1/), 데크 폴더 슬러그는 sqld-1 로 분리 유지.
export function sqldParts() {
  return SQLD_DECKS.map((d) => ({ num: d.num, slug: String(d.num), topic: d.topic, deck: deckUrl(d.slug) }))
}
export function sqldPart(slug) { return sqldParts().find((p) => p.slug === slug) || null }

// ── about 통계: 사이트가 실제 공개한 강의 자료 수(코딩 강의 + 정처기 강 + SQLD 부) ──
// 강의대본 본문은 안 읽고, 이미 노출 중인 자료의 개수만 빌드타임에 합산한다.
export function materialCount() {
  const code = CODE_BUCKETS.reduce(
    (n, b) => n + b.topics.reduce((m, t) => m + (t.dir ? topicLectures(t.dir).length : 0), 0), 0)
  const cpe = cpeSubjects().reduce((n, s) => n + s.lectures.length, 0)
  const sqld = sqldParts().length
  return { code, cpe, sqld, total: code + cpe + sqld }
}
