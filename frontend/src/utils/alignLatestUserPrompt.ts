/**
 * After a follow-up, each result card should open on the user's latest prompt.
 * That jump happens once per model per round. Switching away and back — swipe,
 * tab, or button — restores the scroll position that card had when it left,
 * including after a mobile tab unmounts it.
 */

const manualScrollRoundByModel = new Map<string, number>()

export type CardScrollSnapshot = {
  round: number
  scrollTop: number
  pad: number
  basePad: number
  opened: boolean
}

const scrollSnapshotByModel = new Map<string, CardScrollSnapshot>()

export function readCardScrollSnapshot(modelId: string, round: number): CardScrollSnapshot | null {
  const snap = scrollSnapshotByModel.get(modelId)
  if (!snap || snap.round !== round) return null
  return snap
}

export function writeCardScrollSnapshot(
  modelId: string,
  round: number,
  content: HTMLElement,
  options?: { opened?: boolean }
): void {
  const prev = scrollSnapshotByModel.get(modelId)
  const sameRound = prev?.round === round
  const datasetPad = content.dataset.promptAlignPad
  const datasetBase = content.dataset.promptAlignBasePad
  const pad =
    datasetPad == null || datasetPad === ''
      ? sameRound
        ? prev.pad
        : 0
      : Number.parseFloat(datasetPad) || 0
  const basePad =
    datasetBase == null || datasetBase === ''
      ? sameRound
        ? prev.basePad
        : 0
      : Number.parseFloat(datasetBase) || 0
  let scrollTop = content.scrollTop
  // A remount can report scrollTop 0 before the card has a scroll range.
  // Keep the position captured when the card was still on screen.
  if (
    sameRound &&
    scrollTop < 1 &&
    prev.scrollTop > 1 &&
    content.scrollHeight <= content.clientHeight + 1
  ) {
    scrollTop = prev.scrollTop
  }
  scrollSnapshotByModel.set(modelId, {
    round,
    scrollTop,
    pad,
    basePad,
    opened: Boolean(options?.opened) || (sameRound && prev.opened),
  })
}

export function applyCardScrollSnapshot(content: HTMLElement, snap: CardScrollSnapshot): void {
  if (snap.pad > 0 || snap.basePad > 0) {
    content.dataset.promptAlignPad = String(snap.pad)
    content.dataset.promptAlignBasePad = String(snap.basePad)
    content.style.paddingBottom = `${snap.basePad + snap.pad}px`
  }
  const max = Math.max(0, content.scrollHeight - content.clientHeight)
  const next = Math.max(0, Math.min(snap.scrollTop, max))
  if (Math.abs(content.scrollTop - next) < 1) return
  content.scrollTop = next
}

export function clearCardScrollSnapshot(modelId: string): void {
  scrollSnapshotByModel.delete(modelId)
}

/** A model-tab swipe is sideways. Only a vertical drag scrolls inside the card. */
export function isVerticalCardScroll(dx: number, dy: number): boolean {
  return dy >= 12 && dy > dx
}

export function markManualCardScroll(modelId: string, round: number, content?: HTMLElement): void {
  manualScrollRoundByModel.set(modelId, round)
  content?.setAttribute('data-manual-scroll-round', String(round))
}

export function userManuallyScrolledCard(modelId: string, round: number): boolean {
  return manualScrollRoundByModel.get(modelId) === round
}

export function clearManualCardScroll(modelId: string): void {
  manualScrollRoundByModel.delete(modelId)
  clearCardScrollSnapshot(modelId)
}

/** Scroll offset that puts the latest user prompt at the top of the card's scrollport. */
export function latestUserPromptScrollTop(content: HTMLElement): number | null {
  const prompts = content.querySelectorAll('.conversation-message.user')
  const last = prompts[prompts.length - 1]
  if (!(last instanceof HTMLElement) || prompts.length < 2) return null
  const messageRect = last.getBoundingClientRect()
  const containerRect = content.getBoundingClientRect()
  if (containerRect.height < 2 || messageRect.height < 2) return null
  const padTop = Number.parseFloat(getComputedStyle(content).paddingTop) || 0
  return messageRect.top - containerRect.top - padTop + content.scrollTop
}

/**
 * A short follow-up answer cannot scroll to the top of a max-height card.
 * Extra bottom padding gives the prompt enough room without moving the answer.
 */
function ensurePromptCanReachTop(content: HTMLElement, promptOffset: number): void {
  const padBottom = Number.parseFloat(getComputedStyle(content).paddingBottom) || 0
  if (!content.dataset.promptAlignBasePad) {
    const applied = Number.parseFloat(content.dataset.promptAlignPad || '0') || 0
    content.dataset.promptAlignBasePad = String(Math.max(0, padBottom - applied))
  }
  const applied = Number.parseFloat(content.dataset.promptAlignPad || '0') || 0
  const basePad = Number.parseFloat(content.dataset.promptAlignBasePad || '0') || 0
  const baseScrollHeight = content.scrollHeight - applied
  const needed = Math.max(0, promptOffset + content.clientHeight - baseScrollHeight)
  if (Math.abs(applied - needed) < 2) return
  content.dataset.promptAlignPad = String(Math.round(needed))
  content.style.paddingBottom = `${basePad + needed}px`
}

export function clearPromptAlignPadding(content: HTMLElement): void {
  content.style.paddingBottom = ''
  delete content.dataset.promptAlignPad
  delete content.dataset.promptAlignBasePad
}

export function scrollContentToLatestUserPrompt(content: HTMLElement): boolean {
  const top = latestUserPromptScrollTop(content)
  if (top == null) return false
  ensurePromptCanReachTop(content, top)
  const max = Math.max(0, content.scrollHeight - content.clientHeight)
  const next = Math.max(0, Math.min(top, max))
  if (Math.abs(content.scrollTop - next) < 2) return true
  content.scrollTop = next
  return true
}

export function contentSkipsPromptAlign(content: HTMLElement, round: number): boolean {
  if (content.dataset.manualScrollRound === String(round)) return true
  const modelId = content.dataset.modelId
  return Boolean(modelId && userManuallyScrolledCard(modelId, round))
}
