/**
 * After a follow-up, each result card should open on the user's latest prompt.
 * A card the user has already scrolled stays where they left it, including
 * when a mobile tab unmounts that card and mounts it again.
 */

const manualScrollRoundByModel = new Map<string, number>()

export function markManualCardScroll(modelId: string, round: number, content?: HTMLElement): void {
  manualScrollRoundByModel.set(modelId, round)
  content?.setAttribute('data-manual-scroll-round', String(round))
}

export function userManuallyScrolledCard(modelId: string, round: number): boolean {
  return manualScrollRoundByModel.get(modelId) === round
}

export function clearManualCardScroll(modelId: string): void {
  manualScrollRoundByModel.delete(modelId)
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
