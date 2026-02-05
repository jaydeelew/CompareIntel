/**
 * SkipLink - Accessibility component for keyboard navigation
 * Allows users to skip to main content, bypassing navigation and banners
 * Follows WCAG 2.4.1 (Bypass Blocks) best practices
 */

export function SkipLink() {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    // Find main content area
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.getElementById('main-content') ||
      document.querySelector('.app-main')

    if (mainContent) {
      // Make focusable if not already
      if (!(mainContent instanceof HTMLElement)) {
        return
      }

      const htmlMain = mainContent as HTMLElement
      if (!htmlMain.hasAttribute('tabindex')) {
        htmlMain.setAttribute('tabindex', '-1')
      }

      // Focus and scroll to main content
      htmlMain.focus()
      htmlMain.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Remove tabindex after blur to prevent it from being in tab order
      const handleBlur = () => {
        htmlMain.removeAttribute('tabindex')
        htmlMain.removeEventListener('blur', handleBlur)
      }
      htmlMain.addEventListener('blur', handleBlur, { once: true })
    }
  }

  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={handleClick}
      onKeyDown={e => {
        // Also handle Enter key
        if (e.key === 'Enter') {
          handleClick(e as unknown as React.MouseEvent<HTMLAnchorElement>)
        }
      }}
    >
      Skip to main content
    </a>
  )
}
