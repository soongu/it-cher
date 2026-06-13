#!/usr/bin/env node
// 소스(형제 폴더) 코딩 교안의 레거시 '[이미지: …]' 플레이스홀더를 집계한다(비파괴 읽기 전용).
// 사이트는 이를 렌더에서 숨기지만(markdown.mjs), 남은 개수를 드러내 소스 측 ASCII 다이어그램 전환을 추적한다.
// 항상 exit 0 (정보용) — 빌드를 막지 않는다. 실행: `npm run lint:images`
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BACKEND = path.resolve(ROOT, '..', 'backend-lecture-project', 'lectures')
const RE = /\[이미지:/g

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (e.name.endsWith('-lecture.md')) out.push(full)
  }
  return out
}

const files = walk(BACKEND)
let total = 0
const rows = []
for (const f of files) {
  let n = 0
  try { n = (fs.readFileSync(f, 'utf8').match(RE) || []).length } catch { continue }
  if (n) { total += n; rows.push([n, path.relative(BACKEND, f)]) }
}
rows.sort((a, b) => b[0] - a[0])

console.log(`\x1b[1m■ [이미지:] 플레이스홀더 lint\x1b[0m`)
console.log(`  강의(-lecture.md) ${files.length}개 중 ${rows.length}개 파일에 총 \x1b[1m${total}건\x1b[0m`)
console.log(`  (사이트는 렌더에서 숨김 · 소스에서 ASCII 다이어그램으로 전환 권장)`)
if (!total) { console.log('  \x1b[32m✓ 남은 플레이스홀더 없음.\x1b[0m'); process.exit(0) }
console.log('')
for (const [n, rel] of rows) console.log(`  ${String(n).padStart(4)}  ${rel}`)
