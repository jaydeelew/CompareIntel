/**
 * KaTeX CSS Loader - Dynamically loads KaTeX CSS to prevent render-blocking
 * Similar to prismLoader.ts, this ensures KaTeX styles are only loaded when needed
 */

let katexCssLoaded = false
let katexCssLoading = false

/**
 * Dynamically loads KaTeX CSS if not already loaded
 * @returns Promise that resolves when CSS is loaded
 */
export async function loadKatexCss(): Promise<void> {
  if (katexCssLoaded) {
    return Promise.resolve()
  }

  if (katexCssLoading) {
    // Wait for ongoing load
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (katexCssLoaded) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 50)
    })
  }

  katexCssLoading = true

  return new Promise<void>((resolve, reject) => {
    // Check if already in DOM
    const existingLink = document.querySelector('link[href*="katex"]')
    if (existingLink) {
      katexCssLoaded = true
      katexCssLoading = false
      resolve()
      return
    }

    // Try importing CSS directly (Vite will handle it)
    import('katex/dist/katex.min.css')
      .then(() => {
        katexCssLoaded = true
        katexCssLoading = false
        resolve()
      })
      .catch((error) => {
        // Fallback: create link element
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
        link.onload = () => {
          katexCssLoaded = true
          katexCssLoading = false
          resolve()
        }
        link.onerror = () => {
          katexCssLoading = false
          console.warn('Failed to load KaTeX CSS from CDN:', error)
          reject(new Error('Failed to load KaTeX CSS'))
        }
        document.head.appendChild(link)
      })
  })
}

/**
 * Check if KaTeX CSS is already loaded
 */
export function isKatexCssLoaded(): boolean {
  return katexCssLoaded
}
