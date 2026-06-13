#!/usr/bin/env node
// it-cher 정적 사이트 배포 — dist/ 를 S3에 동기화하고 CloudFront를 무효화한다.
//
// 사용: npm run deploy   (= npm run check && node scripts/deploy.mjs)
//   · 빌드+verify 게이트(npm run check)가 먼저 통과해야 호출된다(package.json).
//   · 배포 대상(버킷·배포ID)은 infra/ 의 `terraform output` 에서 읽고, 없으면 환경변수로 폴백:
//       ITCHER_S3_BUCKET, ITCHER_CF_DISTRIBUTION_ID
//   · AWS 자격증명은 표준 방식(AWS_PROFILE / 환경변수 / SSO)으로 제공한다.
//
// 캐시 전략(F30): 변하는 것과 안 변하는 것을 분리한다.
//   · 가변(HTML·sitemap·robots·검색색인·데크 HTML)        = max-age=0,must-revalidate (브라우저가 매 방문 재검증 → 배포 즉시 반영), --delete 로 구버전 정리
//   · 불변 대용량(데크 폰트 4.7MB·로고·OG 카드 — 파일명 고정) = max-age=31536000 (cp 로 헤더 확정 반영)
//   · _astro/ 해시 자산                                    = 1년 immutable, 삭제 안 함
//   무효화도 가변 표면(HTML·검색·sitemap)만 → 불변 폰트/이미지/_astro 엣지 캐시 보존(매 배포 전면 재요청 방지).
//   ※ 왜 HTML을 max-age=0 으로? CloudFront 무효화는 'CDN 엣지'만 비우고 '방문자 브라우저 캐시'는 못 비운다.
//     HTML에 긴 max-age 를 주면 재방문자는 배포가 끝나도 옛 페이지를 그 시간만큼 본다(과거 1h 트랩).
//     max-age=0,must-revalidate 면 브라우저가 매번 ETag 로 재검증(변경 없으면 304, 비용 거의 0) → 항상 최신.
//     해시 파일명인 _astro 만 길게 캐시하면 되므로 콘텐츠 신선도와 캐시 효율을 동시에 잡는다.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = resolve(ROOT, 'dist')
const INFRA = resolve(ROOT, 'infra')

function die(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}
function toolOk(cmd) {
  return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
}

// 0) 사전 점검 ---------------------------------------------------------------
if (!existsSync(DIST) || readdirSync(DIST).length === 0)
  die('dist/ 가 비어 있습니다. 먼저 `npm run build`(또는 npm run deploy) 를 실행하세요.')
if (!toolOk('aws'))
  die('AWS CLI v2 가 필요합니다 → https://docs.aws.amazon.com/cli/')

// 1) 배포 대상 식별 — terraform output 우선, 환경변수 폴백 ---------------------
function fromTerraform() {
  if (!toolOk('terraform') || !existsSync(resolve(INFRA, '.terraform'))) return {}
  try {
    const raw = execFileSync('terraform', [`-chdir=${INFRA}`, 'output', '-json'], { encoding: 'utf8' })
    const o = JSON.parse(raw)
    return {
      bucket: o.s3_bucket_name?.value,
      dist: o.cloudfront_distribution_id?.value,
      url: o.site_url?.value,
    }
  } catch {
    return {}
  }
}
const tf = fromTerraform()
const BUCKET = process.env.ITCHER_S3_BUCKET || tf.bucket
const DISTID = process.env.ITCHER_CF_DISTRIBUTION_ID || tf.dist
const SITE_URL = tf.url || 'https://it-cher.com'
if (!BUCKET || !DISTID)
  die(
    '배포 대상을 찾지 못했습니다.\n' +
    '  · infra/ 에서 `terraform apply` 후 다시 시도하거나\n' +
    '  · ITCHER_S3_BUCKET / ITCHER_CF_DISTRIBUTION_ID 환경변수를 설정하세요.'
  )

// 2) 자격증명 확인 -----------------------------------------------------------
const who = spawnSync('aws', ['sts', 'get-caller-identity'], { encoding: 'utf8' })
if (who.status !== 0)
  die('AWS 자격증명이 유효하지 않습니다. `aws configure` 또는 AWS_PROFILE 설정 후 재시도.\n' + (who.stderr || ''))

// 3) 동기화 + 무효화 ---------------------------------------------------------
const S3 = `s3://${BUCKET}`
function run(label, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync('aws', args, { stdio: 'inherit' })
  if (r.status !== 0) die(`실패: ${label}`)
}

console.log(`\n=== it-cher 배포 → ${S3}  (CloudFront ${DISTID}) ===`)

// 1) 가변 자산: HTML·sitemap·robots·검색색인·데크 HTML — 매 방문 재검증(배포 즉시 반영). 불변 대용량 자산은 제외하고 2) 에서 따로.
run('업로드: HTML·검색색인·데크 (재검증 캐시, 누락분 --delete)', [
  's3', 'sync', `${DIST}/`, S3,
  '--delete',
  '--exclude', '_astro/*',
  '--exclude', 'decks/fonts/*',
  '--exclude', 'fonts/*',
  '--exclude', 'img/*',
  '--exclude', 'og/*',
  '--cache-control', 'public,max-age=0,must-revalidate',
])

// 2) 불변 대용량 자산(데크 폰트·코드 폰트·로고·OG): 파일명이 고정이라 sync 는 헤더(메타데이터)만 바뀐 갱신을 건너뛴다
//    → cp --recursive 로 매번 1년 캐시 헤더를 확정 반영(파일 작고 배포 드물어 비용 무시 가능). 디렉터리 없으면 건너뜀.
//    ※ 운영자 메모: 이 자산은 무효화 대상이 아니므로 로고/OG/코드폰트(/fonts/)를 교체하면 1회성 `aws cloudfront create-invalidation --paths '/img/*' '/og/*' '/fonts/*'` 필요.
for (const dir of ['decks/fonts', 'fonts', 'img', 'og']) {
  if (!existsSync(resolve(DIST, dir))) continue
  run(`업로드: 불변 자산 ${dir}/ (1년 캐시)`, [
    's3', 'cp', `${DIST}/${dir}/`, `${S3}/${dir}/`,
    '--recursive',
    '--cache-control', 'public,max-age=31536000,immutable',
  ])
}

// 3) _astro 자산은 콘텐츠 해시 파일명이라 --delete 하지 않는다(누적은 무해).
//   이유: 무효화 전파(1~2분) 동안 옛 HTML(브라우저/엣지 캐시)을 보는 방문자가 옛 CSS/JS를 요청할 수 있다.
//   곧바로 지우면 그 방문자에게 403→404(스타일 깨짐). 해시 파일은 충돌이 없으니 그냥 쌓아둔다.
//   (나이 기반 lifecycle은 안 변하는 해시 자산을 오삭제할 수 있어 금물. 필요 시 빌드매니페스트 대조로 정리.)
run('업로드: _astro 해시 자산 (1년 immutable, 삭제 안 함)', [
  's3', 'sync', `${DIST}/_astro/`, `${S3}/_astro/`,
  '--cache-control', 'public,max-age=31536000,immutable',
])

// 4) 무효화: 전체(/*) — 페이지 신선도를 무조건 보장한다.
//    ⚠️ 과거엔 가변 표면만 선별 무효화('/' '/*/' '/*.html' …)해 폰트/이미지/_astro 엣지 캐시를 아꼈지만,
//       '/*/' 가 중첩 디렉터리 페이지('/code/web/')를 실제 엣지에서 비우지 못하는 사례를 확인했다
//       (서울 POP ICN57-P4 가 배포 후에도 옛 객체를 1h TTL 끝까지 서빙 → '서버 카드엔 CTA, 웹 카드엔 없음' 증상).
//    → canonical '/*' 로 전환. 신선도(콘텐츠가 즉시 반영) > 미세 비용.
//    _astro·폰트·로고·OG 는 해시/고정 파일명이라 무효화돼도 다음 요청 때 1회성 엣지 미스로 끝난다(비용 무시 가능,
//    브라우저는 여전히 immutable 캐시 사용). '/*' 는 무효화 1건이라 요금 영향도 없음.
run('CloudFront 무효화 (전체 /* — 페이지 신선도 보장)', [
  'cloudfront', 'create-invalidation',
  '--distribution-id', DISTID,
  '--paths', '/*',
])

console.log(`\n✓ 배포 완료. 무효화 전파(보통 1~2분) 후 ${SITE_URL} 에 반영됩니다.`)
