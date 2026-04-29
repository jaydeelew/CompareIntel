import { useEffect } from 'react'

/**
 * Cleanup on tutorial unmount. Controller unmounts overlay on complete,
 * so step=null never arrives - cleanup must run here.
 */
export function useTutorialCleanup() {
  useEffect(() => {
    return () => {
      const hero = document.querySelector('.hero-section') as HTMLElement
      if (hero) {
        hero.classList.remove('tutorial-height-locked', 'tutorial-dropdown-hero-active')
        hero.style.removeProperty('height')
        hero.style.removeProperty('max-height')
        hero.style.removeProperty('min-height')
        hero.style.removeProperty('padding-top')
        hero.style.removeProperty('padding-bottom')
        hero.style.removeProperty('overflow')
      }
      document.documentElement.style.removeProperty('--hero-locked-height')

      const composer = document.querySelector('.composer.tutorial-textarea-active') as HTMLElement
      if (composer) composer.classList.remove('tutorial-textarea-active')

      document.querySelectorAll('.composer.tutorial-highlight').forEach(el => {
        const el_ = el as HTMLElement
        el_.classList.remove('tutorial-highlight')
        el_.style.removeProperty('pointer-events')
        el_.style.removeProperty('position')
      })

      const dropdownContainer = document.querySelector(
        '.composer.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (dropdownContainer)
        dropdownContainer.classList.remove('tutorial-dropdown-container-active')

      document.querySelectorAll('.tutorial-highlight').forEach(el => {
        const el_ = el as HTMLElement
        el_.classList.remove('tutorial-highlight')
        el_.style.removeProperty('pointer-events')
        el_.style.removeProperty('position')
      })

      const history = document.querySelector(
        '.history-inline-list.tutorial-dropdown-active'
      ) as HTMLElement
      if (history) history.classList.remove('tutorial-dropdown-active')

      const saved = document.querySelector(
        '.saved-selections-dropdown.tutorial-dropdown-active'
      ) as HTMLElement
      if (saved) saved.classList.remove('tutorial-dropdown-active')
    }
  }, [])
}
