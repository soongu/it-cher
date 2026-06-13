#!/usr/bin/env node
// 빌드 무결성 게이트 — `npm run build` 후 dist/ 를 검사한다.
// 목적: 계약 위반이 '빌드 에러 없이' 통과해 콘텐츠가 조용히 누락/유출되는 것을 잡는다.
// 의존성 없음(node:fs/path만). 하드 실패 시 process.exitCode=1 → CI/스크립트에서 감지 가능.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { GA_MEASUREMENT_ID } from '../src/lib/analytics.mjs'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')

// 페이지 수 하한(콘텐츠가 늘면 올려도 됨). 이보다 적으면 '콘텐츠 누락' 의심 → FAIL.
const EXPECTED_PAGES_MIN = 120
// 정상 기준치(참고용). 여기서 ±40 넘게 벗어나면 WARN.
// 자격증 IA 깊은 재구조화(필기/실기·이론/문제풀이 허브 + 준비중 페이지)·코딩 토픽 로드맵으로 페이지 증가.
// 2026-06-11: 데크 64강·코딩 토픽 확장으로 실측 238p → 기준치 상향(상시 WARN 제거, 밴드 [175,255]).
// 2026-06-12: 코딩 IA 분야 9분류 재편 — 신규 분야/토픽 로드맵 페이지(준비중 포함) 다수 추가로 실측 272p → 기준치 상향(밴드 [230,310]).
const EXPECTED_PAGES_REF = 270

let fails = 0
let warns = 0
let passes = 0
const PASS = (m) => { passes++; console.log(`  \x1b[32mPASS\x1b[0m  ${m}`) }
const WARN = (m) => { warns++; console.log(`  \x1b[33mWARN\x1b[0m  ${m}`) }
const FAIL = (m) => { fails++; console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) }
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`)

// dist 전체 파일 경로(상대) 수집
function walk(dir, base = dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, base, out)
    else out.push(path.relative(base, full))
  }
  return out
}

console.log('\x1b[1m■ verify-build — dist 무결성 게이트\x1b[0m')

// ── 0) dist 존재 ──────────────────────────────────────────────
if (!fs.existsSync(DIST) || !fs.statSync(DIST).isDirectory()) {
  console.error('\n\x1b[31mFAIL\x1b[0m  dist/ 가 없습니다. 먼저 `npm run build` 를 실행하세요.')
  process.exitCode = 1
  process.exit()
}
const allFiles = walk(DIST)
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'))

// ── 1) 페이지 수 ─────────────────────────────────────────────
head('1) 페이지 수')
const indexPages = htmlFiles.filter((f) => path.basename(f) === 'index.html')
const pageCount = indexPages.length
if (pageCount === 0) FAIL('생성된 index.html 이 0개 — 빌드가 사실상 실패했습니다.')
else if (pageCount < EXPECTED_PAGES_MIN) FAIL(`index.html ${pageCount}개 < 하한 ${EXPECTED_PAGES_MIN} — 콘텐츠 누락 의심(파일명 계약 위반?).`)
else if (Math.abs(pageCount - EXPECTED_PAGES_REF) > 40) WARN(`index.html ${pageCount}개 — 기준치(${EXPECTED_PAGES_REF})와 차이 큼. 의도된 변화인지 확인.`)
else PASS(`index.html ${pageCount}개 (기준치 ~${EXPECTED_PAGES_REF}).`)

// ── 2) 한글/비ASCII 내부 URL 0건 ─────────────────────────────
head('2) 한글/비ASCII 내부 URL')
const ATTR = /(?:href|src)\s*=\s*"([^"]*)"/g
const EXTERNAL = /^(https?:|mailto:|tel:|data:|#)/
const badUrls = []
for (const rel of htmlFiles) {
  let txt
  try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
  let m
  while ((m = ATTR.exec(txt)) !== null) {
    const v = m[1]
    if (!v || EXTERNAL.test(v)) continue            // 외부/앵커/데이터 URI 제외
    if (/[^\x00-\x7F]/.test(v)) badUrls.push(`${rel} → ${v.slice(0, 80)}`)
  }
}
if (badUrls.length) {
  FAIL(`내부 URL에 비ASCII 문자 ${badUrls.length}건(한글 URL 회귀):`)
  badUrls.slice(0, 10).forEach((u) => console.log(`         · ${u}`))
  if (badUrls.length > 10) console.log(`         · …외 ${badUrls.length - 10}건`)
} else PASS('내부 href/src 전부 ASCII.')

// ── 3) 비배포 자산 유출 0건 ──────────────────────────────────
head('3) 비배포 자산 유출')
const LEAK_SEG = ['_design_handoff', '.omc']
const leaks = allFiles.filter((f) => {
  const segs = f.split(path.sep)
  return segs.some((s) => LEAK_SEG.includes(s)) || path.basename(f) === '.DS_Store'
})
if (leaks.length) {
  FAIL(`배포 대상이 아닌 파일 ${leaks.length}건이 dist 에 포함됨:`)
  leaks.slice(0, 10).forEach((f) => console.log(`         · ${f}`))
} else PASS('_design_handoff · .omc · .DS_Store 유출 없음.')

// ── 4) 데크 manifest + ASCII 슬러그 ──────────────────────────
head('4) 데크 manifest / ASCII 슬러그')
const manifestPath = path.join(DIST, 'decks', 'manifest.json')
if (!fs.existsSync(manifestPath)) {
  WARN('dist/decks/manifest.json 없음 — 데크 sync 안 됨(데크 콘텐츠가 없으면 정상일 수 있음).')
} else {
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { manifest = null }
  if (!Array.isArray(manifest)) FAIL('manifest.json 이 JSON 배열이 아님.')
  else {
    const ASCII_SLUG = /^[a-z0-9-]+$/
    const badSlug = manifest.filter((d) => !d || !ASCII_SLUG.test(String(d.slug)))
    const missingDir = manifest.filter((d) => d && d.slug && !fs.existsSync(path.join(DIST, 'decks', 'lectures', d.slug)))
    if (badSlug.length) FAIL(`비ASCII 데크 슬러그 ${badSlug.length}건: ${badSlug.map((d) => d && d.slug).join(', ')}`)
    if (missingDir.length) FAIL(`manifest에 있으나 폴더 없는 데크 ${missingDir.length}건: ${missingDir.map((d) => d.slug).join(', ')}`)
    if (!badSlug.length && !missingDir.length) PASS(`데크 ${manifest.length}개 — 전부 ASCII 슬러그 + 폴더 존재.`)
  }
}

// ── 4b) 데크 내부 참조 무결성 ────────────────────────────────
head('4b) 데크 내부 참조 무결성')
// 빌드 레이스(형제 소스 교체)로 '옛 index.html + 새 슬라이드'가 섞이면 iframe src 가 404 가 된다(2026-06-11 cpe-s5-58 실증: 참조 38/39 404).
// 각 데크 index.html 이 참조하는 같은-폴더 슬라이드가 dist 에 전부 실재하는지 확인(sync-decks 게이트의 산출물 측 짝).
const deckLecDir = path.join(DIST, 'decks', 'lectures')
if (!fs.existsSync(deckLecDir)) {
  WARN('dist/decks/lectures/ 없음 — 데크 콘텐츠가 없으면 정상일 수 있음.')
} else {
  const SRC_RE = /src\s*=\s*"([^"]+)"/g
  const brokenDecks = []
  let checkedDecks = 0, checkedRefs = 0
  for (const slug of fs.readdirSync(deckLecDir)) {
    const dir = path.join(deckLecDir, slug)
    let st
    try { st = fs.statSync(dir) } catch { continue }
    const idx = path.join(dir, 'index.html')
    if (!st.isDirectory() || !fs.existsSync(idx)) continue
    checkedDecks++
    const html = fs.readFileSync(idx, 'utf8')
    let m
    while ((m = SRC_RE.exec(html)) !== null) {
      const ref = m[1].split('#')[0].split('?')[0]
      if (!ref || ref.startsWith('../') || ref.startsWith('/') || /^[a-z]+:/i.test(ref)) continue  // 공유자산/절대/스킴 제외
      checkedRefs++
      if (!fs.existsSync(path.join(dir, ref))) brokenDecks.push(`${slug} → ${ref}`)
    }
  }
  if (brokenDecks.length) {
    FAIL(`데크 index.html 의 슬라이드 참조 ${brokenDecks.length}건이 404(빌드 레이스로 옛 index+새 슬라이드 혼합 의심):`)
    brokenDecks.slice(0, 8).forEach((b) => console.log(`         · ${b}`))
  } else PASS(`데크 ${checkedDecks}개 · 슬라이드 참조 ${checkedRefs}건 — 전부 실재(혼합 빌드 없음).`)
}

// ── 5) 강의대본 본문 누출 스모크(한계 있음) ──────────────────
head('5) 강의대본 본문 누출 스모크')
// 한계: 완벽 탐지는 불가. 강의대본 본문이 렌더되면 나타날 신호를 가볍게 검사한다.
//  - 정처기 대본 본문 정규화 산물 'SLIDE NN' 칩(markdown.mjs:57)은 cert 라우트엔 없어야 한다(대본 본문 비렌더).
//  - 파일명에서 추출되는 topic 은 '_강의대본' 앞부분이라 '강의대본' 단어 자체는 노출되지 않아야 한다.
const certHtml = htmlFiles.filter((f) => f.split(path.sep).includes('cert'))
let scriptSignals = 0
const SIGNAL = /강의대본/
for (const rel of certHtml) {
  let txt
  try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
  if (SIGNAL.test(txt)) scriptSignals++
}
if (scriptSignals) WARN(`cert 페이지 ${scriptSignals}건에서 '강의대본' 문자열 발견 — 본문 누출 여부 수동 확인 권장(라벨이면 오탐).`)
else PASS(`cert 페이지에서 강의대본 누출 신호 없음 (${certHtml.length}개 검사). [스모크: 완벽 탐지 아님]`)

// ── 6) Pagefind 검색 색인 무결성 ─────────────────────────────
head('6) Pagefind 검색 색인')
// 검색 산출물(dist/pagefind/)은 index.html 이 아니라 위 1)·3) 검사에 잡히지 않는다(화이트리스트 불필요).
// 여기서는 색인 fragment 를 직접 풀어 (a) 데크(슬라이드) URL 비색인 (b) '강의대본' 본문 비색인(불변식 #2)을 보증한다.
// fragment 는 gzip → 'pagefind_dcd' 매직 프리픽스 + JSON. 첫 '{' 부터 파싱한다.
function readFragment(buf) {
  let s
  try { s = zlib.gunzipSync(buf).toString('utf8') } catch { s = buf.toString('utf8') }
  const i = s.indexOf('{')
  if (i < 0) return null
  try { return JSON.parse(s.slice(i)) } catch { return null }
}
const PF_DIR = path.join(DIST, 'pagefind')
const PF_FRAG = path.join(PF_DIR, 'fragment')
if (!fs.existsSync(PF_DIR)) {
  WARN('dist/pagefind/ 없음 — 검색 색인 미생성(astro build 만 실행했거나 pagefind 실패). `npm run build` 는 pagefind 까지 실행함.')
} else if (!fs.existsSync(PF_FRAG)) {
  WARN('dist/pagefind/fragment 없음 — 색인된 페이지가 0개일 수 있음.')
} else {
  const fragFiles = fs.readdirSync(PF_FRAG).filter((f) => f.endsWith('.pf_fragment'))
  let parsed = 0
  const deckLeaks = []
  const scriptLeaks = []
  for (const f of fragFiles) {
    const d = readFragment(fs.readFileSync(path.join(PF_FRAG, f)))
    if (!d) continue
    parsed++
    const url = String(d.url || '')
    const content = String(d.content || '')
    const title = String((d.meta && d.meta.title) || '')   // Pagefind 은 <title>/h1 을 meta.title 로 색인 → 함께 검사
    if (/\/decks\//.test(url)) deckLeaks.push(url)
    if (/강의대본/.test(url) || /강의대본/.test(content) || /강의대본/.test(title)) scriptLeaks.push(url || f)
  }
  if (deckLeaks.length) {
    FAIL(`데크(슬라이드) URL 이 검색 색인에 포함됨 ${deckLeaks.length}건 — data-pagefind-body 게이트 회귀:`)
    deckLeaks.slice(0, 5).forEach((u) => console.log(`         · ${u}`))
  }
  if (scriptLeaks.length) {
    FAIL(`검색 색인에 '강의대본' 신호 ${scriptLeaks.length}건 — 강의대본 본문 색인(불변식 #2) 위반:`)
    scriptLeaks.slice(0, 5).forEach((u) => console.log(`         · ${u}`))
  }
  if (!parsed) FAIL(`색인된 fragment 0개 — data-pagefind-body 게이트가 깨졌거나 색인이 비었음(검색 회귀).`)
  else if (!deckLeaks.length && !scriptLeaks.length) {
    PASS(`검색 색인 ${parsed}개 — 데크 URL 0건 · 강의대본 누출 0건 (코딩 본문 + 자격증 제목/메타만 색인).`)
  }
}

// ── 7) 이미지 플레이스홀더 누출 ──────────────────────────────
head('7) 이미지 플레이스홀더')
// 레거시 '[이미지: …]' 는 그림 없는 빈 캡션 박스로 떠 본문이 미완성처럼 보였다 → markdown.mjs 가 렌더에서 숨긴다.
// 산출물에 '[이미지:' 원문이나 옛 img-ph 박스가 새지 않았는지 확인(숨김 회귀 방지).
let imgLeaks = 0
const imgPages = []
for (const rel of htmlFiles) {
  let txt
  try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
  if (txt.includes('[이미지:') || /class="img-ph"/.test(txt)) { imgLeaks++; if (imgPages.length < 10) imgPages.push(rel) }
}
if (imgLeaks) {
  FAIL(`이미지 플레이스홀더가 산출물에 노출됨 ${imgLeaks}건 — markdown.mjs 숨김 회귀:`)
  imgPages.forEach((p) => console.log(`         · ${p}`))
} else PASS('본문 이미지 플레이스홀더([이미지:]·img-ph) 노출 0건.')

// ── 7b) <summary> 내 위험 raw 태그(C2/F01) ───────────────────
head('7b) <summary> 내 위험 태그')
// 원본 교안이 details/summary 를 raw HTML 로 쓰면 markdown-it(html:true)이 내부 인라인 마크다운을 파싱 안 해,
// summary 안 `<script>` 백틱 코드가 '진짜' 시작 태그로 잡혀 이후 본문을 통째로 삼켰다(c1 36,731자 누락).
// markdown.mjs normalize()가 summary 내부를 renderInline 으로 변환(꺾쇠 이스케이프)해 막는다 — 그 회귀를 잡는다.
// '위험 태그' = text 문맥을 깨는 raw script/style/textarea/title (F01 전수 스캔이 지목한 부류).
const SUMMARY_RE = /<summary\b[^>]*>([\s\S]*?)<\/summary>/gi
const DANGER_TAG = /<\s*(script|style|textarea|title)\b/i
let summaryChecked = 0
const summaryLeaks = []
for (const rel of htmlFiles) {
  let txt
  try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
  let m
  while ((m = SUMMARY_RE.exec(txt)) !== null) {
    summaryChecked++
    if (DANGER_TAG.test(m[1])) summaryLeaks.push(`${rel} → ${m[1].slice(0, 70).replace(/\s+/g, ' ')}`)
  }
}
if (summaryLeaks.length) {
  FAIL(`<summary> 내부에 raw script/style/textarea/title ${summaryLeaks.length}건 — summary 본문 삼킴 회귀:`)
  summaryLeaks.slice(0, 8).forEach((s) => console.log(`         · ${s}`))
} else PASS(`<summary> ${summaryChecked}개 — 위험 raw 태그 0건(본문 삼킴 없음).`)

// ── 8) SEO 산출물 무결성 ─────────────────────────────────────
head('8) SEO (sitemap · robots · canonical · OG)')
// (a) sitemap 존재 + 데크/강의대본 URL 비포함(불변식 #2 — 색인 게이트의 SEO 짝).
const sitemapFiles = allFiles.filter((f) => /^sitemap.*\.xml$/.test(path.basename(f)))
if (!sitemapFiles.length) {
  FAIL('dist/sitemap-*.xml 없음 — @astrojs/sitemap 통합이 빠졌거나 site= 미설정.')
} else {
  let urlCount = 0
  const deckInMap = []
  const scriptInMap = []
  const nonAsciiInMap = []
  for (const rel of sitemapFiles) {
    let xml
    try { xml = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
    const locs = xml.match(/<loc>([^<]*)<\/loc>/g) || []
    for (const raw of locs) {
      const u = raw.replace(/<\/?loc>/g, '')
      if (rel.includes('index')) continue        // sitemap-index 의 loc 는 하위 sitemap 파일 → URL 카운트 제외
      urlCount++
      if (/\/decks\//.test(u)) deckInMap.push(u)
      if (/강의대본/.test(u)) scriptInMap.push(u)
      // sitemap loc 는 절대 URL(https://it-cher.com/...) — 경로부에 비ASCII가 있으면 한글 URL 회귀.
      try { if (/[^\x00-\x7F]/.test(decodeURI(new URL(u).pathname))) nonAsciiInMap.push(u) } catch {}
    }
  }
  if (deckInMap.length) { FAIL(`sitemap 에 데크 URL ${deckInMap.length}건 — 데크는 색인/사이트맵 비대상:`); deckInMap.slice(0, 5).forEach((u) => console.log(`         · ${u}`)) }
  if (scriptInMap.length) { FAIL(`sitemap 에 '강의대본' URL ${scriptInMap.length}건 — 불변식 #2 위반:`); scriptInMap.slice(0, 5).forEach((u) => console.log(`         · ${u}`)) }
  if (nonAsciiInMap.length) { FAIL(`sitemap 에 비ASCII 경로 URL ${nonAsciiInMap.length}건 — 한글 URL 회귀:`); nonAsciiInMap.slice(0, 5).forEach((u) => console.log(`         · ${u}`)) }
  if (!deckInMap.length && !scriptInMap.length && !nonAsciiInMap.length) PASS(`sitemap ${sitemapFiles.length}개 · URL ${urlCount}건 — 데크 0 · 강의대본 0 · 전부 ASCII 경로.`)
}

// (b) robots.txt 존재 + sitemap 참조.
const robotsPath = path.join(DIST, 'robots.txt')
if (!fs.existsSync(robotsPath)) FAIL('dist/robots.txt 없음 — public/robots.txt 가 복사되지 않음.')
else {
  const robots = fs.readFileSync(robotsPath, 'utf8')
  if (/Sitemap:\s*https?:\/\//i.test(robots)) PASS('robots.txt 존재 · Sitemap 디렉티브 포함.')
  else WARN('robots.txt 에 Sitemap: 디렉티브가 없음 — 크롤러가 사이트맵을 못 찾을 수 있음.')
}

// (c) OG 이미지 산출물 존재.
const ogPath = path.join(DIST, 'og', 'og-default.png')
if (fs.existsSync(ogPath)) PASS('og/og-default.png 산출물 존재(공유 카드).')
else FAIL('dist/og/og-default.png 없음 — OG 메타가 깨진 이미지를 가리킴.')

// (d) 홈 페이지 head 무결성 — canonical · og:image · JSON-LD 존재.
const homePath = path.join(DIST, 'index.html')
if (!fs.existsSync(homePath)) FAIL('dist/index.html(홈) 없음.')
else {
  const home = fs.readFileSync(homePath, 'utf8')
  const checks = [
    ['<link rel="canonical"', 'canonical 링크'],
    ['property="og:image"', 'og:image'],
    ['name="twitter:card"', 'twitter:card'],
    ['application/ld+json', 'JSON-LD(구조화데이터)'],
  ]
  const missing = checks.filter(([sig]) => !home.includes(sig)).map(([, name]) => name)
  if (missing.length) FAIL(`홈 head 누락: ${missing.join(' · ')}.`)
  else PASS('홈 head — canonical · og:image · twitter:card · JSON-LD 전부 존재.')
}

// (e) JSON-LD 내용 검증 — 전 페이지 ld+json 을 실제로 파싱 + Course 필드/표식/대본 누출 검사.
//     섹션 8(d)는 '존재'만 봤다. 여기서는 내용을 본다: 무효 JSON, Course 필수필드 누락,
//     제목에 마크다운 표식(** · `) 잔존, 그리고 불변식 #2(강의대본 본문이 Course 설명으로 새는 것)를 잡는다.
let ldParsed = 0
const ldBad = []
const courseMdLeak = []
const ldScriptLeak = []
const LD_RE = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
for (const rel of htmlFiles) {
  let txt
  try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
  let m
  while ((m = LD_RE.exec(txt)) !== null) {
    let data
    try { data = JSON.parse(m[1]) } catch { ldBad.push(`${rel} (JSON 파싱 실패)`); continue }
    ldParsed++
    const nodes = Array.isArray(data) ? data : [data]
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue
      if (/강의대본/.test(JSON.stringify(n))) ldScriptLeak.push(rel)
      if (n['@type'] === 'Course') {
        const nm = String(n.name || ''), ds = String(n.description || '')
        if (!n.name || !n.provider) ldBad.push(`${rel} (Course name/provider 누락)`)
        if (/\*\*|`/.test(nm) || /\*\*|`/.test(ds)) courseMdLeak.push(`${rel} → ${nm.slice(0, 44)}`)
        if (n.timeRequired && !/^PT\d+M$/.test(String(n.timeRequired))) ldBad.push(`${rel} (timeRequired 형식 ${n.timeRequired})`)
        if (typeof n.isAccessibleForFree !== 'boolean') ldBad.push(`${rel} (isAccessibleForFree 비불리언)`)
      }
    }
  }
}
if (!ldParsed) FAIL('JSON-LD 블록을 하나도 파싱하지 못함 — 구조화데이터 누락/깨짐.')
if (ldBad.length) { FAIL(`JSON-LD 결함 ${ldBad.length}건:`); ldBad.slice(0, 5).forEach((x) => console.log(`         · ${x}`)) }
if (courseMdLeak.length) { FAIL(`Course name/description 에 마크다운 표식(** · \`) ${courseMdLeak.length}건 — stripInlineMd 회귀:`); courseMdLeak.slice(0, 5).forEach((x) => console.log(`         · ${x}`)) }
if (ldScriptLeak.length) { FAIL(`JSON-LD 에 '강의대본' 신호 ${ldScriptLeak.length}건 — 불변식 #2 위반:`); ldScriptLeak.slice(0, 5).forEach((x) => console.log(`         · ${x}`)) }
if (ldParsed && !ldBad.length && !courseMdLeak.length && !ldScriptLeak.length) PASS(`JSON-LD ${ldParsed}블록 파싱 OK — Course 필드 정상 · 마크다운/강의대본 누출 0.`)

// ── 9) Analytics (GA4) ───────────────────────────────────────
// gtag 로더가 측정 ID와 함께 dist HTML 에 박혔는지 — prod 빌드에서만 주입되므로(Base.astro),
// 누락되면 '빌드는 통과하는데 측정이 0' 인 조용한 함정. Base 렌더 페이지(전역 JSON-LD 표식)만 대상.
head('9) Analytics (GA4)')
if (!GA_MEASUREMENT_ID || !/^G-[A-Z0-9]{4,}$/.test(GA_MEASUREMENT_ID)) {
  FAIL(`GA 측정 ID 형식 이상('${GA_MEASUREMENT_ID}') — src/lib/analytics.mjs 의 'G-' 접두어 측정 ID 확인.`)
} else {
  const gaLoaderSig = `googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  const gaMissing = []
  let baseRenderedCount = 0
  for (const rel of htmlFiles) {
    let txt
    try { txt = fs.readFileSync(path.join(DIST, rel), 'utf8') } catch { continue }
    if (!txt.includes('application/ld+json')) continue   // Base.astro 미경유(데크 등 패스스루) → GA 비대상
    baseRenderedCount++
    if (!txt.includes(gaLoaderSig)) gaMissing.push(rel)
  }
  if (!baseRenderedCount) FAIL('Base.astro 렌더 페이지를 찾지 못함 — GA4 검증 불가(JSON-LD 표식 부재).')
  else if (gaMissing.length) {
    FAIL(`GA4 태그 누락 ${gaMissing.length}/${baseRenderedCount} 페이지 — gtag 주입 회귀(Base.astro prod 게이트 확인):`)
    gaMissing.slice(0, 5).forEach((x) => console.log(`         · ${x}`))
  } else PASS(`GA4(${GA_MEASUREMENT_ID}) 로더가 Base 렌더 ${baseRenderedCount}페이지 전부의 head 에 존재.`)
}

// ── 요약 ─────────────────────────────────────────────────────
head('요약')
console.log(`  PASS ${passes} · WARN ${warns} · FAIL ${fails}`)
if (fails) {
  console.log('\n\x1b[31m■ 검증 실패 — 위 FAIL 항목을 해결하세요.\x1b[0m')
  process.exitCode = 1
} else if (warns) {
  console.log('\n\x1b[33m■ 통과(경고 있음) — WARN 항목을 확인하세요.\x1b[0m')
} else {
  console.log('\n\x1b[32m■ 전부 통과.\x1b[0m')
}
