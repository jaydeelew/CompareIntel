import { useEffect } from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'

/** Box-shadow-only attention ring on the comparison submit control. */
export const TUTORIAL_SUBMIT_ATTENTION_CLASS = 'tutorial-submit-attention'

const SUBMIT_BUTTON = '[data-testid="comparison-submit-button"]'

/** Add or remove the ring without toggling it back off and on (that restarts the animation). */
export function syncTutorialSubmitAttention(active: boolean, root: ParentNode = document): void {
  root.querySelectorAll(SUBMIT_BUTTON).forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const has = node.classList.contains(TUTORIAL_SUBMIT_ATTENTION_CLASS)
    if (active && !has) node.classList.add(TUTORIAL_SUBMIT_ATTENTION_CLASS)
    if (!active && has) node.classList.remove(TUTORIAL_SUBMIT_ATTENTION_CLASS)
  })
}

/** Step 6 only. Clears on step change and on the first press. */
export function useTutorialSubmitAttention(step: TutorialStep | null): void {
  useEffect(() => {
    if (step !== 'submit-comparison') {
      syncTutorialSubmitAttention(false)
      return
    }
    let dismissed = false
    const apply = () => syncTutorialSubmitAttention(!dismissed)
    apply()
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest(SUBMIT_BUTTON)) return
      dismissed = true
      apply()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    const id = window.setInterval(apply, 200)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.clearInterval(id)
      syncTutorialSubmitAttention(false)
    }
  }, [step])
}
