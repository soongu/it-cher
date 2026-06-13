#!/usr/bin/env node
// 완성 슬라이드 데크 + 공유 엔진/토큰/폰트를 형제 폴더에서 public/decks/ 로 복사한다.
// 핵심: 데크 폴더명을 한글에서 ASCII 슬러그로 개명(deckMeta)하여 배포 URL을 안정화한다.
//  - deck-stage 엔진은 '../../colors_and_type.css', '../../slides/*', 같은 폴더 'NN-*.html' 등
//    전부 상대경로에 의존하므로 부모(시각자료→decks)·리프(한글→슬러그) 개명이 모두 안전하다.
//  - content.mjs 와 동일한 slug.mjs 를 import 하므로 생성 URL과 디스크 폴더명이 어긋나지 않는다.
//  - manifest.json 을 남겨 content.mjs 가 (한글 폴더 스캔 없이) 데크 슬러그·메타를 조회한다.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { deckMeta } from '../src/lib/slug.mjs'

const ROOT = process.cwd()
const SRC = path.resolve(ROOT, '..', '정보처리기사 강의교안 작업', '시각자료')
const DST = path.join(ROOT, 'public', 'decks')

// 학생 사이트에 노출하지 않을 잡파일: 갤러리/시스템파일/OMC 상태 캐시(소스에 섞여 있음).
const SKIP_NAME = new Set(['gallery.html', '.DS_Store', '.omc'])
const filter = (src) => !src.split(path.sep).some((seg) => SKIP_NAME.has(seg))

// 데크 무결성: index.html 의 같은-폴더 슬라이드 참조(src="NN-*.html") 중 디스크에 없는 것을 반환.
//   공유 자산('../..') · 절대경로('/') · 스킴(http:/data:)은 검사 대상 아님 — 슬라이드 참조만 본다.
function deckMissingRefs(dir, html) {
  const missing = []
  const SRC = /src\s*=\s*"([^"]+)"/g
  let m
  while ((m = SRC.exec(html)) !== null) {
    const ref = m[1].split('#')[0].split('?')[0]
    if (!ref || ref.startsWith('../') || ref.startsWith('/') || /^[a-z]+:/i.test(ref)) continue
    if (!fs.existsSync(path.join(dir, ref))) missing.push(ref)
  }
  return missing
}

// F31: @import 룰을 파일 최상단으로 끌어올린다. CSS 규약상 @import 는 @font-face 등 다른 룰보다 앞이어야 유효한데,
//   소스 colors_and_type.css 는 @font-face 뒤에 @import(JetBrains Mono·Noto Serif KR)를 둬 무효였다(데크 모노/세리프 미로드).
//   url('...') 안의 ';'(google fonts wght@400;500…)에 안 걸리게 url(...) 통째로 매칭.
function hoistImports(css) {
  const imports = []
  const body = css.replace(/@import\s+url\([^)]*\)[^;]*;/g, (m) => { imports.push(m.trim()); return '' })
  if (!imports.length) return css
  return imports.join('\n') + '\n' + body.replace(/^\s*\n/, '')
}

// H7(woff2 재작성): 미사용 Light(300) @font-face 제거 + 나머지 3웨이트 TTF 참조를 woff2 로 교체.
function woff2FontFaces(css) {
  return css
    .replace(/@font-face\s*\{[^}]*NanumGothicLight[^}]*\}\s*/g, '')
    .replace(/url\('fonts\/(NanumGothic(?:Bold|ExtraBold)?)\.ttf'\)\s*format\('truetype'\)/g, "url('fonts/$1.woff2') format('woff2')")
}

// H7(글리프 수집): 데크가 '실제 쓰는' 문자만 모은다(public/decks 의 .html/.js/.css). ASCII 는 안전망으로 항상 포함.
//   → 서브셋이 정확히 사용 글리프만 담아 tofu(빈 네모) 0 + 최소 용량(subfont/glyphhanger 와 동일 전략).
function collectDeckGlyphs(root) {
  const set = new Set()
  for (let c = 0x20; c <= 0x7e; c++) set.add(String.fromCodePoint(c))
  const exts = new Set(['.html', '.js', '.css'])
  const walk = (d) => {
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (exts.has(path.extname(e.name))) { try { for (const ch of fs.readFileSync(p, 'utf8')) set.add(ch) } catch {} }
    }
  }
  walk(root)
  return [...set].join('')
}

// H7(서브셋): NanumGothic 3웨이트(Light 제외)를 사용 글리프만 woff2 로. python3 -m fontTools.subset 사용.
//   도구/변환 실패 시 false 반환 → 호출부가 TTF 원본 복사로 폴백(빌드 안 깨짐). all-or-nothing(부분 혼용 방지).
function subsetDeckFonts(srcFontDir, dstFontDir, glyphText) {
  const targets = ['NanumGothic.ttf', 'NanumGothicBold.ttf', 'NanumGothicExtraBold.ttf']
  const glyphFile = path.join(dstFontDir, '_glyphs.txt')
  const woff2Of = (ttf) => path.join(dstFontDir, ttf.replace(/\.ttf$/, '.woff2'))
  try {
    fs.writeFileSync(glyphFile, glyphText)
    for (const ttf of targets) {
      const src = path.join(srcFontDir, ttf)
      if (!fs.existsSync(src)) throw new Error(`소스 폰트 없음: ${ttf}`)
      execFileSync('python3', ['-m', 'fontTools.subset', src,
        `--text-file=${glyphFile}`, '--flavor=woff2', `--output-file=${woff2Of(ttf)}`,
        '--no-hinting', '--desubroutinize'], { stdio: 'pipe' })
    }
    fs.rmSync(glyphFile, { force: true })
    return true
  } catch (e) {
    fs.rmSync(glyphFile, { force: true })
    for (const ttf of targets) fs.rmSync(woff2Of(ttf), { force: true })   // 부분 생성물 정리
    console.warn(`⚠ 데크 폰트 woff2 서브셋 실패(${String(e.message || e).split('\n')[0]}) — TTF 원본 복사로 폴백(용량 절감 보류).`)
    return false
  }
}

fs.rmSync(DST, { recursive: true, force: true })
fs.mkdirSync(path.join(DST, 'lectures'), { recursive: true })

// 공유 자산: 슬라이드 엔진(_slide.css/_slide.js/deck-stage.js)만 먼저 복사.
//   토큰 CSS(F31 @import 호이스트)·폰트(H7 woff2 서브셋)는 데크 복사 후 처리 — 데크 글리프를 모아 서브셋하려고.
fs.cpSync(path.join(SRC, 'slides'), path.join(DST, 'slides'), { recursive: true, filter })

// 데크 폴더(한글) → ASCII 슬러그로 개명 복사 + manifest 누적
const srcLectures = path.join(SRC, 'lectures')
const manifest = []
const skipped = []
const noEntry = []
const brokenRefs = []
for (const raw of fs.readdirSync(srcLectures)) {
  if (SKIP_NAME.has(raw)) continue
  const full = path.join(srcLectures, raw) // 디스크 읽기는 원본(NFD 가능) 이름으로
  if (!fs.statSync(full).isDirectory()) continue
  const meta = deckMeta(raw)               // 슬러그/메타는 NFC 정규화 후 파싱
  if (!meta) { skipped.push(raw.normalize('NFC')); continue }
  // 진입점(index.html) = <deck-stage> 래퍼. 이게 없으면 슬라이드 파일이 있어도 iframe 이 빈 화면이 된다.
  //   manifest 에서 제외 → content.mjs 가 '준비중'(비활성 행)으로 처리해 빈/깨진 데크 헛걸음을 막는다.
  //   소스에 index.html 이 추가되면 자동으로 다시 ready (비파괴·자가복구). 폴더 복사도 생략.
  if (!fs.existsSync(path.join(full, 'index.html'))) { noEntry.push(meta.slug); continue }
  // 빌드 중 형제 소스가 외부 파이프라인에 교체되면 '옛 index.html + 새 슬라이드'로 섞여(참조 404)
  //   조용히 깨진 데크가 배포될 수 있다(2026-06-11 cpe-s5-58 실증: 참조 38/39 404).
  //   참조 슬라이드가 하나라도 빠지면 manifest 제외 → content.mjs 가 '준비중'(비활성 행)으로 처리한다.
  const missingRefs = deckMissingRefs(full, fs.readFileSync(path.join(full, 'index.html'), 'utf8'))
  if (missingRefs.length) {
    brokenRefs.push(`${meta.slug} (참조 ${missingRefs.length}건 누락: ${missingRefs.slice(0, 3).join(', ')}${missingRefs.length > 3 ? '…' : ''})`)
    continue
  }
  fs.cpSync(full, path.join(DST, 'lectures', meta.slug), { recursive: true, filter })
  manifest.push(meta)
}

// ── 공유 CSS(F31) + 데크 폰트(H7) — 데크 복사 후 처리 ───────────────
fs.mkdirSync(path.join(DST, 'fonts'), { recursive: true })
let outCss = hoistImports(fs.readFileSync(path.join(SRC, 'colors_and_type.css'), 'utf8'))   // F31: @import 항상 호이스트
const glyphs = collectDeckGlyphs(DST)                                                        // 데크 실제 사용 글리프
const fontOk = subsetDeckFonts(path.join(SRC, 'fonts'), path.join(DST, 'fonts'), glyphs)     // H7: woff2 서브셋(실패=폴백)
if (fontOk) outCss = woff2FontFaces(outCss)                                                  // 성공 → CSS 도 woff2 로
else fs.cpSync(path.join(SRC, 'fonts'), path.join(DST, 'fonts'), { recursive: true, filter })// 폴백 → TTF 원본 복사
fs.writeFileSync(path.join(DST, 'colors_and_type.css'), outCss)

manifest.sort((a, b) => (a.kind === b.kind ? a.num - b.num : a.kind.localeCompare(b.kind)))
fs.writeFileSync(path.join(DST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

if (skipped.length) console.warn(`⚠ 파싱 불가로 스킵된 데크 ${skipped.length}개:`, skipped.join(', '))
if (noEntry.length) console.warn(`⚠ index.html(진입점) 없어 '준비중' 처리된 데크 ${noEntry.length}개:`, noEntry.join(', '))
if (brokenRefs.length) console.warn(`⚠ 슬라이드 참조 깨져 '준비중' 처리된 데크 ${brokenRefs.length}개:`, brokenRefs.join('; '))
const fontMB = (fs.readdirSync(path.join(DST, 'fonts')).reduce((n, f) => n + fs.statSync(path.join(DST, 'fonts', f)).size, 0) / 1048576).toFixed(2)
console.log(`✓ deck sync 완료 → public/decks/ (데크 ${manifest.length}개, ASCII URL · 폰트 ${fontOk ? 'woff2 서브셋' : 'TTF 원본'} ${fontMB}MB)`)
