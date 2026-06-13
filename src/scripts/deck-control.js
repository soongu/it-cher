// 데크 컨트롤(공용): fit-to-contain 스케일 + 동일 출처 <deck-stage> 제어.
// 사용처 ① DeckEmbed.astro(임베드 뷰어) ② pages/play/index.astro(풀뷰포트 새 탭 플레이어).
// 데크 엔진(public/decks/slides/deck-stage.js)은 비수정 — 동일 출처 공개 API 로만 제어한다:
//   ._advance(dir,'host') · .index · .length · 'slidechange' 이벤트 · postMessage({__omelette_preview_mode}).
// shell 은 .deck-frame / .deck-scaler>iframe / [data-deck-*] 를 가진 컨테이너(.deck-shell 또는 .player-shell).
// prev/next/counter/fsBtn/gesture 는 모두 선택적(있을 때만 바인딩) — 플레이어는 일부만 렌더해도 동작.
export function initDeck(shell) {
  const frame = shell.querySelector('.deck-frame')
  const iframe = shell.querySelector('.deck-scaler > iframe')
  const curEl = shell.querySelector('[data-deck-current]')
  const totEl = shell.querySelector('[data-deck-total]')
  const prevBtn = shell.querySelector('[data-deck-prev]')
  const nextBtn = shell.querySelector('[data-deck-next]')
  const fsBtn = shell.querySelector('[data-deck-fullscreen]')
  if (!frame) return
  // /play/ 풀뷰포트(프레젠테이션)는 페이지 스크롤이 없어 PageUp/Down 도 슬라이드 네비로 받는다(프레젠터 리모컨 호환).
  //   임베드(.deck-shell)에선 PageUp/Down 을 양보해 긴 강 문서를 스크롤할 수 있게 둔다(F36).
  const isPlayer = shell.classList.contains('player-shell')

  // fit-to-contain: 1024×768 데크를 frame 안에 가로·세로 모두 맞춰 축소(레터박스). 임베드(aspect-ratio
  // 1024/768)에선 폭 기준과 값이 같고, 풀스크린/풀뷰포트(frame 가 화면 가득=비율 다름)에선 높이 넘침을 막는다.
  const fit = () => frame.style.setProperty('--deck-scale', String(Math.min(frame.clientWidth / 1024, frame.clientHeight / 768) || 1))
  fit()
  if (window.ResizeObserver) new ResizeObserver(fit).observe(frame)
  window.addEventListener('resize', fit)

  if (!iframe) return
  let total = 0, current = 1
  const render = () => {
    if (curEl) curEl.textContent = String(current)
    if (totEl) totEl.textContent = total ? String(total) : '–'
    if (prevBtn) prevBtn.disabled = current <= 1
    if (nextBtn) nextBtn.disabled = total ? current >= total : false
  }
  render()

  const getDeck = () => {
    try { return iframe.contentWindow.document.querySelector('deck-stage') } catch (e) { return null }
  }
  // 컨트롤 클릭 후 항상 실제 데크 상태로 카운터/비활성 보정 (slidechange 구독이 경합에서 졌어도 자가복구)
  const syncFromDeck = () => {
    const ds = getDeck()
    if (ds && ds.length) { total = ds.length; current = (ds.index || 0) + 1; render() }
  }
  const nav = (dir) => {
    const ds = getDeck()
    if (ds && typeof ds._advance === 'function') {   // 데크 정식 네비(자체 버튼과 동일 경로) — 환경 비의존
      try { ds._advance(dir, 'host'); syncFromDeck(); return } catch (e) {}
    }
    try {                                            // 폴백: 데크 window 에 화살표 키 디스패치(공개 키보드 UX)
      const w = iframe.contentWindow
      w.dispatchEvent(new w.KeyboardEvent('keydown', { key: dir < 0 ? 'ArrowLeft' : 'ArrowRight', bubbles: true }))
    } catch (e) {}
    syncFromDeck()
  }
  // 호스트 키보드 네비(안내문 "클릭한 뒤 ← / →" 보강): 데크의 _onKey 는 iframe 자기
  // window 에만 바인딩돼 iframe 포커스 시에만 먹는다. 부모 document 에서도 화살표를 받아
  // 동일 출처 데크의 정식 네비(nav→_advance)로 위임한다. iframe 이 이미 포커스를 가지면
  // 부모는 keydown 을 받지 않아 자연히 분리됨(중복 advance 없음).
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
  // 활성 데크 판정: 화면(뷰포트)에 보이는 shell 만 반응 → 한 페이지 다중 데크에서 오작동 방지.
  const isOnScreen = () => {
    const r = shell.getBoundingClientRect()
    return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight)
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return     // 단축키/검색(Cmd-K)·수식어 조합은 양보
    if (isTyping(e.target) || isTyping(document.activeElement)) return // 입력 중이면 무시
    if (document.activeElement === iframe) return                    // iframe 이 포커스면 데크 자체 _onKey 가 처리
    if (!isOnScreen()) return
    const fwd = e.key === 'ArrowRight' || (isPlayer && e.key === 'PageDown')   // F36: PageUp/Down 은 /play/ 에서만
    const back = e.key === 'ArrowLeft' || (isPlayer && e.key === 'PageUp')
    if (fwd) { nav(1); e.preventDefault() }
    else if (back) { nav(-1); e.preventDefault() }
  })

  // 모바일 제스처(탭·스와이프): 임베드 데크 iframe 은 CSS transform:scale 로 축소돼 터치/클릭이
  // iframe 안까지 닿지 않는다(스케일된 iframe 히트테스트 한계 — 데크 자체 탭도 임베드에선 안 먹음).
  // 그래서 호스트의 투명 오버레이(.deck-gesture)에서 직접 받아 정식 네비(nav→_advance, 데크 260ms
  // 크로스페이드 그대로)로 위임한다. 오버레이는 터치기기에서만 활성(데스크톱은 pointer-events:none →
  // 마우스/키보드/데크 UI 그대로). fsBtn 이 frame(오버레이 포함)을 풀스크린화하므로 풀스크린에서도 동작.
  const gesture = shell.querySelector('[data-deck-gesture]')
  if (gesture) {
    let gx = 0, gy = 0, gactive = false
    gesture.addEventListener('pointerdown', (e) => { gx = e.clientX; gy = e.clientY; gactive = true })
    gesture.addEventListener('pointercancel', () => { gactive = false })   // 세로 스크롤(pan-y) 시작 시 취소 → 오탐 방지
    gesture.addEventListener('pointerup', (e) => {
      if (!gactive) return
      gactive = false
      const dx = e.clientX - gx, dy = e.clientY - gy
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) nav(dx < 0 ? 1 : -1)   // 왼쪽으로 밀기 = 다음
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {                            // 탭: 좌측 절반=이전 / 우측 절반=다음
        const r = gesture.getBoundingClientRect()
        nav((e.clientX - r.left) < r.width / 2 ? -1 : 1)
      }
    })
  }
  if (prevBtn) prevBtn.addEventListener('click', () => nav(-1))
  if (nextBtn) nextBtn.addEventListener('click', () => nav(1))
  if (fsBtn) fsBtn.addEventListener('click', () => {
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); return }
      // iframe 이 아니라 frame(제스처 오버레이 포함)을 풀스크린화 → 스와이프·탭이 풀스크린에서도 동작.
      if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {})
      else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen()
      else if (iframe.requestFullscreen) iframe.requestFullscreen().catch(() => {})   // 폴백(구형)
    } catch (e) {}
  })
  // 풀스크린 진입/해제 시 frame 크기가 급변 → 컨테인 스케일 재계산.
  document.addEventListener('fullscreenchange', fit)
  document.addEventListener('webkitfullscreenchange', fit)

  // 동일 출처 데크 연결: (1) 임베드(학생 뷰어)에선 편집용 썸네일 레일 숨김 → 슬라이드가 프레임을 꽉 채움.
  //   __omelette_preview_mode 는 _railVisible 설정/localStorage 를 건드리지 않아 '새 탭 전체화면'엔 영향 없음.
  // (2) 초기 상태 읽기 + slidechange 구독(네이티브 탭/키보드 이동까지 카운터 반영). 업그레이드/로드 대기 폴링.
  let bound = false, tries = 0
  const bind = () => {
    if (bound) return
    const ds = getDeck()
    if (!ds || !ds.length) { if (tries++ < 40) setTimeout(bind, 150); return }
    bound = true
    const loadingEl = shell.querySelector('[data-deck-loading]')   // F19: 데크 준비 완료 → 로딩 인디케이터 숨김
    if (loadingEl) loadingEl.hidden = true
    try { iframe.contentWindow.postMessage({ __omelette_preview_mode: true }, '*') } catch (e) {}
    // F35: 터치 기기에선 데크 내부 네비 풋터(‹n/N› Reset pill)도 숨긴다 — 스케일된 iframe 히트테스트 한계로
    //   탭이 안 닿는 '가짜 버튼'이라 호스트 컨트롤·제스처와 3중 중복만 된다. 엔진 공개 프로토콜(__omelette_presenting →
    //   _overlay 풋터 억제, side-effect 는 메뉴닫기·refit 뿐), 엔진 비수정·동일 출처. 데스크톱은 pill 클릭이 실제 동작 → 현행 유지.
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) {
      try { iframe.contentWindow.postMessage({ __omelette_presenting: true }, '*') } catch (e) {}
    }
    syncFromDeck()
    ds.addEventListener('slidechange', (e) => {
      if (!e.detail) return
      current = (e.detail.index || 0) + 1
      if (typeof e.detail.total === 'number') total = e.detail.total
      render()
    })
  }
  iframe.addEventListener('load', () => { tries = 0; bind() })   // 로드 후 폴링 예산 리셋(경합 방지)
  bind()
}
