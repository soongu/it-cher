import MarkdownIt from 'markdown-it'
import { slugify } from './slug.mjs'

// 한글 인접 볼드 복구 플러그인
// CommonMark flanking 규칙은 '**용어(English)**조사' 처럼 닫는 ** 앞이 문장부호 ) " ! 이고
// 바로 뒤가 한글일 때 강조 닫기를 인정하지 않아 ** 가 text 토큰에 그대로 남는다.
// inline 파싱 후 남은 모든 text 토큰의 ** 마커를 '문서 순서'로 모아 여닫기 짝을 지어 strong 으로 복구한다.
//   · 같은 토큰 안에서 여닫는 경우      : '**용어(English)**조사'                  (기존 동작 — 보존)
//   · 토큰 경계를 넘는 경우(H10/F11 확장): '**`z-index`**예요' → text('**')+code_inline+text('**예요')
//     처럼 markdown-it 이 인라인코드 등으로 쪼개 한 토큰 정규식으론 영원히 미발동하던 패턴까지 같이 복구.
// 단일 패스로 처리하는 이유: '**`a`**와 **`b`**' 의 중간 토큰('**와 **')은 'a 의 닫기 + b 의 열기'인데
//   토큰별로 따로 처리하면 이를 자체 볼드('와 ')로 오인한다 → 전 토큰의 ** 를 한 줄로 세워 짝지어야 정확.
// (** 마커는 text 토큰에서만 찾는다 — 코드는 code_inline/fence 로 분리돼 손대지 않으므로 안전.
//  줄바꿈(soft/hardbreak)에서는 미완 여는 마커를 리셋해 strong 이 줄을 넘지 않게 한다.)
function cjkBold(md) {
  md.core.ruler.after('inline', 'cjk_bold', (state) => {
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue
      blk.children = recoverBold(state, blk.children)
    }
  })
}

function recoverBold(state, kids) {
  // 1) 전 text 토큰의 ** 위치를 문서 순서로 수집(줄바꿈은 리셋 신호).
  const markers = []
  for (let ki = 0; ki < kids.length; ki++) {
    const t = kids[ki]
    if (t.type === 'softbreak' || t.type === 'hardbreak') { markers.push({ brk: true }); continue }
    if (t.type !== 'text' || t.content.indexOf('**') === -1) continue
    let from = 0, mi
    while ((mi = t.content.indexOf('**', from)) !== -1) { markers.push({ ki, ci: mi }); from = mi + 2 }
  }
  // 2) 여(open)·닫(close) 짝짓기 — 줄바꿈에서 미완 여는 마커 폐기, 끝까지 안 닫힌 여는 마커는 리터럴로 둠.
  const pairs = []
  let open = null
  for (const mk of markers) {
    if (mk.brk) { open = null; continue }
    if (!open) open = mk
    else { pairs.push([open, mk]); open = null }
  }
  if (!pairs.length) return kids
  // 3) 토큰별 절단점(여기서 ** 제거 + strong_open/close 삽입)으로 children 재구성.
  const cutsByKi = new Map()
  const addCut = (ki, ci, kind) => { if (!cutsByKi.has(ki)) cutsByKi.set(ki, []); cutsByKi.get(ki).push({ ci, kind }) }
  for (const [o, c] of pairs) { addCut(o.ki, o.ci, 'open'); addCut(c.ki, c.ci, 'close') }
  const out = []
  for (let ki = 0; ki < kids.length; ki++) {
    const t = kids[ki]
    const cuts = cutsByKi.get(ki)
    if (!cuts) { out.push(t); continue }
    cuts.sort((a, b) => a.ci - b.ci)
    let pos = 0
    for (const cut of cuts) {
      const seg = t.content.slice(pos, cut.ci)
      if (seg) { const x = new state.Token('text', '', 0); x.content = seg; out.push(x) }
      if (cut.kind === 'open') { const o = new state.Token('strong_open', 'strong', 1); o.markup = '**'; out.push(o) }
      else { const c = new state.Token('strong_close', 'strong', -1); c.markup = '**'; out.push(c) }
      pos = cut.ci + 2 // ** 두 글자 건너뜀
    }
    const tail = t.content.slice(pos)
    if (tail) { const x = new state.Token('text', '', 0); x.content = tail; out.push(x) }
  }
  return out
}

const md = new MarkdownIt({ html: true, linkify: true, breaks: false })
// V4: linkify 는 스킴(http/https) 있는 URL 만 자동링크. fuzzyLink 를 끄지 않으면 'aria-profile.md'(→.md=몰도바),
// 'system-v1.st'(→.st=상투메) 같은 파일명/약어를 죽은 외부링크로 변환해 클릭 시 DNS 에러가 난다.
md.linkify.set({ fuzzyLink: false })
md.use(cjkBold)

// H9/F10: 표를 가로 스크롤 래퍼로 감싼다(5열+ 표가 모바일에서 세로 1자씩 쌓이거나 details 안에서 잘리는 것 방지).
//  래퍼(.table-scroll)가 overflow-x 를 맡고, 표는 width:max-content 로 자연폭을 가진다(doc.css).
md.renderer.rules.table_open = () => '<div class="table-scroll">\n<table>\n'
md.renderer.rules.table_close = () => '</table>\n</div>\n'

// 코드블록 카드 — 펜스(```)를 <figure.code-figure> 로 감싸 ①언어 라벨 ②복사 버튼 ③언어별 식별색(data-lang)을 붙인다.
//  · Prism(클라이언트)이 하이라이트하는 `pre>code.language-*` 구조는 그대로 보존 → 토큰 색·autoloader 무영향.
//  · 복사 버튼 동작 JS 는 Base.astro(.code-copy 있는 페이지에서만 로드). 본문 텍스트는 런타임에 <code>.textContent 로 읽는다.
//  · data-lang(=key) 가 doc.css 의 언어별 --lang 색을 고른다. <code class="language-*"> 의 *(=prism) 은 autoloader 문법 id.
//  · 라벨/복사칩은 검색 잡음이라 figcaption 에 data-pagefind-ignore — 코드 본문(pre)은 그대로 색인 유지.
// 표기: [표시이름, data-lang(색 key), prism 문법 id(없으면 하이라이트 생략)]
const LANGS = {
  java:       ['Java', 'java', 'java'],
  javascript: ['JavaScript', 'js', 'javascript'],
  js:         ['JavaScript', 'js', 'javascript'],
  typescript: ['TypeScript', 'ts', 'typescript'],
  ts:         ['TypeScript', 'ts', 'typescript'],
  html:       ['HTML', 'html', 'html'],
  xml:        ['XML', 'xml', 'xml'],
  css:        ['CSS', 'css', 'css'],
  scss:       ['SCSS', 'css', 'scss'],
  json:       ['JSON', 'json', 'json'],
  yaml:       ['YAML', 'yaml', 'yaml'],
  yml:        ['YAML', 'yaml', 'yaml'],
  bash:       ['Bash', 'bash', 'bash'],
  sh:         ['Shell', 'bash', 'bash'],
  shell:      ['Shell', 'bash', 'bash'],
  zsh:        ['Shell', 'bash', 'bash'],
  sql:        ['SQL', 'sql', 'sql'],
  groovy:     ['Groovy', 'groovy', 'groovy'],
  gradle:     ['Gradle', 'groovy', 'groovy'],
  markdown:   ['Markdown', 'md', 'markdown'],
  md:         ['Markdown', 'md', 'markdown'],
  python:     ['Python', 'python', 'python'],
  py:         ['Python', 'python', 'python'],
  promql:     ['PromQL', 'promql', 'promql'],
  env:        ['env', 'env', 'bash'],
  gitignore:  ['gitignore', 'git', 'gitignore'],
  git:        ['git', 'git', 'git'],
  csv:        ['CSV', 'csv', 'csv'],
  text:       ['텍스트', 'text', null],
  plaintext:  ['텍스트', 'text', null],
  txt:        ['텍스트', 'text', null],
}
function langMeta(raw) {
  const k = (raw || '').toLowerCase()
  if (LANGS[k]) { const [name, key, prism] = LANGS[k]; return { name, key, prism } }
  if (!k) return { name: '텍스트', key: 'text', prism: null }       // 언어 미지정 펜스
  const safe = k.replace(/[^a-z0-9+#._-]/g, '')                      // 미등록 언어: prism 에 그대로 위임(autoloader)
  return { name: raw, key: safe || 'text', prism: safe || null }
}
const COPY_ICONS =
  '<svg class="cc-ico cc-copy" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
  '<svg class="cc-ico cc-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
// 세로 화살표(↑↓↕…)는 Sarasa Mono K 서브셋에서 잉크 폭 ≈ 1칸이라 1칸 박스에 그대로 맞는다(폭 보정 불필요).
//  가로/대각/회전(→←↔↗…)만 잉크 ≈ 1.8칸이라, '글자에 붙은' 경우에 한해 .aww 로 가로 압축한다(아래 fence 주석 참조).
const ARROW_NARROW = /[↑↓↕↥↧↨↾↿⇂⇃⇅⇑⇓⇕⇡⇣]/
// 화살표 옆 글자가 '잉크 텍스트'인가 — 즉 글리프가 화살표 넘침과 겹칠 수 있는 일반 문자인가.
//  공백·박스드로잉/블록(U+2500–259F)·기하도형(U+25A0–25FF)·화살표(U+2190–21FF)는 제외:
//   · 공백 → 넘쳐도 무해   · 박스드로잉(예: '──→') → 넘침이 도리어 선과 화살촉을 잇는다(겹쳐야 자연스러움)
//  escapeHtml 뒤라 이웃이 엔티티 조각(';' '&')일 수 있으나, 그건 실제로 '>' '"' 같은 텍스트 글자라 잉크 텍스트가 맞다.
const isInkText = (c) => {
  if (c === undefined || c === ' ' || c === '\t' || c === '\n' || c === '\r') return false
  const o = c.charCodeAt(0)
  return !(o >= 0x2190 && o <= 0x21FF) && !(o >= 0x2500 && o <= 0x259F) && !(o >= 0x25A0 && o <= 0x25FF)
}
// 줄에 '세로획 있는' 박스드로잉(│├┐└┼…)이 있는가 — 즉 칸(셀)을 이루는 표/박스인가.
//  순수 가로선(─━ 및 점선 변형)은 칸 경계가 아니라 연결선이므로 제외. 세로획 박스가 있으면 열 정렬이 걸려 있어
//  글자에 붙은 화살표라도 칸을 넓히면 닫는 │ 가 어긋난다 → 1칸 유지(.aww). 없으면 본문이라 넓혀도 안전(.awg).
const BOX_HORIZONTAL = '─━┄┅┈┉╌╍'
const hasVertBox = (line) => {
  for (const c of line) {
    const o = c.charCodeAt(0)
    if (o >= 0x2500 && o <= 0x257F && BOX_HORIZONTAL.indexOf(c) === -1) return true
  }
  return false
}
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
  const meta = langMeta(info.split(/\s+/g)[0])
  let code = md.utils.escapeHtml(token.content)
  // ASCII 다이어그램 정렬·겹침 복구: 자체호스팅 Sarasa Mono K 서브셋은 화살표 블록(U+2190–21FF)을 전부 advance
  //  1em(2칸)으로 그린다 → 박스드로잉(0.5em·1칸)으로 짠 그림에서 '화살표가 든 줄'만 반 칸씩 밀려 닫는 │ 가 어긋난다.
  //  하이라이트 없는(텍스트) 코드블록의 화살표를 .awn 스팬(width:1ch)으로 감싸 advance 를 1칸으로 되돌린다(doc.css).
  //  화살표는 잉크 폭에 따라 처리가 갈린다:
  //   · 세로(↑↓↕…) 잉크≈494(1칸) — 1칸 박스에 그대로 맞아 .awn 만(추가 처리 불필요).
  //   · 가로/대각/회전(→←↔↗…) 잉크≈900(1.8칸) — 1칸 박스에서 양옆 0.4칸씩 삐져나간다. 다만:
  //       - 양옆이 공백/박스드로잉이면 넘침이 무해(공백)하거나 외려 선을 잇는다('──→') → .awn 으로 큼직하게 둔다.
  //       - 한쪽이라도 일반 글자에 붙으면(예: 'A→L2'·'│HTML→DOM│') 그 글자와 겹친다 → 칸에 가둔다. 이때 두 갈래:
  //           · 본문(자유 흐름) — 칸을 넓혀 화살표 양옆 숨통을 틔운다(.awg). 'A→L2' 가 'A → L2' 처럼 보이게.
  //           · 표/박스(세로획 박스드로잉) 또는 같은 줄 뒤에 공백열이 있으면 — 칸을 넓히면 열이 어긋나므로
  //             1칸 유지하며 글리프만 가로 압축(.aww). 예: F1 '│HTML→DOM│', day12 3열 표 '"분류→초안→…"'.
  //   · textContent 는 스팬에 투명 → 복사 버튼·Pagefind 색인은 원문 화살표 그대로 유지.
  //   · 언어 지정(Prism 대상) 블록은 클라이언트 재토큰화로 스팬이 지워지고 화살표도 드무니 제외.
  //   · 원본 MD 는 불변(황금률) — 렌더 출력에서만 표현을 교정.
  if (!meta.prism) code = code.replace(/[←-⇿]/g, (ch, off, str) => {
    const tight = !ARROW_NARROW.test(ch) && (isInkText(str[off - 1]) || isInkText(str[off + 1]))
    if (!tight) return `<span class="awn">${ch}</span>`
    const ls = str.lastIndexOf('\n', off - 1) + 1
    let le = str.indexOf('\n', off); if (le < 0) le = str.length
    // 칸을 넓혀도 안전(.awg) ⟺ 세로획 박스도 없고, 화살표 뒤(같은 줄)에 3칸+ 공백열도 없을 때.
    const widen = !hasVertBox(str.slice(ls, le)) && !/ {3,}/.test(str.slice(off + 1, le))
    return `<span class="awn ${widen ? 'awg' : 'aww'}">${ch}</span>`
  })
  const cls = meta.prism ? ` class="language-${meta.prism}"` : ''
  return (
    `<figure class="code-figure" data-lang="${meta.key}">` +
      `<figcaption class="code-cap" data-pagefind-ignore>` +
        `<span class="code-lang"><span class="code-dot" aria-hidden="true"></span>${md.utils.escapeHtml(meta.name)}</span>` +
        `<button class="code-copy" type="button" aria-label="코드 복사">${COPY_ICONS}<span class="code-copy-txt">복사</span></button>` +
      `</figcaption>` +
      `<pre${cls}><code${cls}>${code}</code></pre>` +
    `</figure>\n`
  )
}

// F33: 답안 렌더 시 헤딩 레벨 다운시프트(env.shiftHeadings). *-answers.md 의 h1(과제 예시답안 제목)이
//  강 페이지 <h1>(강 제목)과 동급으로 떠 스크린리더 헤딩 아웃라인이 왜곡되던 것 보정 — 답안만 h1→h2, h2→h3… (h6 상한).
//  원본 MD 비수정(황금률): 렌더 토큰의 tag 만 바꾼다. heading_open/close 가 같은 함수라 여닫기 레벨이 항상 일치.
//  본문(render(body, {base})) 은 shiftHeadings 미지정이라 무변경 — TOC 추출(h2/h3)·기존 동작 보존.
function headingShift(tokens, idx, options, env, self) {
  const shift = (env && env.shiftHeadings) | 0
  if (shift > 0) {
    const tok = tokens[idx]
    tok.tag = 'h' + Math.min(6, parseInt(tok.tag.slice(1), 10) + shift)
  }
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.heading_open = headingShift
md.renderer.rules.heading_close = headingShift

// 링크 렌더 룰 — V3(상호참조 .md 재작성) + V5(외부링크 새 탭).
const SITE_HOST = /^https?:\/\/(www\.)?it-cher\.com(\/|$)/i
const defaultLinkOpen = md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const tok = tokens[idx]
  const hi = tok.attrIndex('href')
  if (hi >= 0) {
    let href = tok.attrs[hi][1]
    // V3: 같은 토픽 내 './dayNN(-N)?-lecture.md' 상호참조 → 사이트 경로로 빌드타임 재작성(404 방지).
    //     env.base = 현재 토픽 URL 프리픽스('/code/{bucket}/{topic}/'). 같은 폴더 참조만(슬래시 없는 파일명) 대상.
    const base = env && env.base
    if (base) {
      const m = href.match(/^(?:\.\/)?([^/?#]+?)-lecture\.md(#[^?\s]*)?$/)
      if (m) { href = base + slugify(m[1]) + '/' + (m[2] || ''); tok.attrs[hi][1] = href }
    }
    // V5: 본문 외부링크는 새 탭(rel=noopener; 유입 귀속 위해 noreferrer 금지). 내부(사이트 경로·앵커·상대)는 같은 탭.
    if (/^https?:\/\//i.test(href) && !SITE_HOST.test(href)) {
      if (tok.attrIndex('target') < 0) tok.attrPush(['target', '_blank'])
      if (tok.attrIndex('rel') < 0) tok.attrPush(['rel', 'noopener'])
    }
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// 렌더 직전 메모리 상에서만 비표준 패턴 정규화 (원본 파일 불변)
//  1) 정처기 대본의 '## ## Slide NN:' 이중 해시 → 슬라이드 칩 + 깔끔한 H2
//  2) 백엔드 교안의 레거시 '[이미지: 설명]' 플레이스홀더 → 숨김(렌더에서 제거)
//  3) <summary> 내부 인라인 마크다운 변환(C2/F01·F32) — 아래 normalize() 주석 참조
function normalize(src) {
  let s = src.replace(
    /^##\s+##\s+Slide\s+(\d+)\s*:\s*(.*)$/gm,
    (_m, n, t) => {
      const title = t.replace(/^[\[\("']+|[\]\)"']+$/g, '').trim()
      return '\n<p class="slide-tag">SLIDE ' + n + '</p>\n\n## ' + title
    }
  )
  // '[이미지: …]' 는 그림 없는 빈 캡션 박스로 떠 본문이 미완성처럼 보였다. 원본 정책상 폐기(→ASCII 다이어그램)된
  // 레거시 잔존분이라 렌더에서 블록 통째로 숨긴다. 닫는 구분자는 '줄 끝의 ]'(\][ \t]*$)로 잡는다 —
  //  · 캡션 속 ']'(예: Media[])는 줄 중간이라 닫기로 오인하지 않음
  //  · [\s\S]*? 로 여러 줄에 걸친 블록(day09·day11 등)도 포함, lazy 라 인접 블록끼리 합쳐지지 않음
  // 남은 개수 추적은 `npm run lint:images`, 산출물 누출 방지는 verify-build 섹션 7.
  s = s.replace(/^[ \t]*\[이미지:[\s\S]*?\][ \t]*$/gm, '')
  // V7: 내용 없는 단독 'N.' 줄(저자가 번호만 쓰고 본문은 다음 문단에 둔 흔적)이 빈 <ol><li></li> 로 렌더되던 것
  //  방지 — 점을 이스케이프(N\.)해 리터럴 'N.' 텍스트로 떨군다. 코드펜스(```/~~~) 내부는 건드리지 않는다
  //  (펜스 안에선 백슬래시가 그대로 보임). 내용이 있는 정상 순서리스트('1. 항목')는 줄 끝이 공백만이 아니라 미대상.
  {
    const lines = s.split('\n')
    let inFence = false, fenceCh = ''
    for (let i = 0; i < lines.length; i++) {
      const fm = lines[i].match(/^[ \t]*(```+|~~~+)/)
      if (fm) {
        if (!inFence) { inFence = true; fenceCh = fm[1][0] }
        else if (lines[i].trimStart().startsWith(fenceCh)) { inFence = false }
        continue
      }
      if (inFence) continue
      const m = lines[i].match(/^([ \t]*)(\d+)\.([ \t]*)$/)
      if (m) lines[i] = `${m[1]}${m[2]}\\.${m[3]}`
    }
    s = lines.join('\n')
  }
  // C2/F01·F32: 원본 교안이 details/summary 를 raw HTML 로 쓰면 markdown-it(html:true)이 그 내부 인라인
  // 마크다운을 파싱하지 않는다 → (a) summary 안 `<script>` 백틱 코드가 '진짜' <script> 시작 태그로 잡혀
  // 이후 본문 전체를 삼키고(c1 36,731자 누락), (b) 백틱이 리터럴로 노출됐다(100건/18페이지).
  // summary 내부만 md.renderInline 으로 미리 변환 → 백틱은 <code> 칩, `<script>` 같은 꺾쇠는 &lt;…&gt; 이스케이프.
  // (renderInline 은 core 룰 미적용이라 cjkBold 는 안 돌지만, summary 의 ** 한글볼드는 사실상 부재라 무해.)
  s = s.replace(/<summary\b([^>]*)>([\s\S]*?)<\/summary>/gi,
    (_m, attrs, inner) => `<summary${attrs}>${md.renderInline(inner.trim())}</summary>`)
  return s
}

// render(body, env) — env.base 를 주면 V3(.md 상호참조 재작성)가 활성화된다(코딩 강 상세에서 토픽 URL 프리픽스 전달).
export function render(body, env = {}) {
  return md.render(normalize(body), env)
}

// 제목(H1) 같은 '한 줄 텍스트'에서 인라인 마크다운 표식만 벗긴다 — 본문 렌더와 무관.
// 코딩 교안 H1 에는 `code 스팬`·**볼드** 가 섞여 있는데, 이 문자열은 항상 plain text 로만 쓰인다
// (<h1>·<title>·og·JSON-LD Course name·페이저/목록 라벨). 표식이 그대로 새면 탭/공유카드/구조화데이터에 노출된다.
// 본문(render)은 손대지 않으므로 볼드/코드 강조는 본문에서 정상 렌더됨.
export function stripInlineMd(s) {
  return String(s)
    .replace(/`+/g, '')                     // 인라인 코드 백틱 제거 (`String` → String)
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')   // **볼드** → 볼드
    .replace(/__([\s\S]+?)__/g, '$1')       // __볼드__ → 볼드
    .replace(/\s+/g, ' ')
    .trim()
}

// V6: <title>·og:title 용 짧은 제목 — 긴 H1(부제·인용 포함)이 80자+로 탭/검색결과/공유카드에서 절단되던 것 방지.
// '제목 — 부제' 형태에서 대시(em — / en –) 첫 분절만 취한다. 대시가 없으면 원문 그대로(무해).
// 본문 <h1>·JSON-LD Course name·브레드크럼·페이저는 전체 제목을 그대로 쓰므로 이 함수를 적용하지 않는다.
export function titleShort(s) {
  return String(s).split(/\s+[—–]\s+/)[0].trim()
}
