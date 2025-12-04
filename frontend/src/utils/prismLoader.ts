/**
 * Prism.js Lazy Loader
 *
 * Dynamically loads Prism.js syntax highlighting libraries only when needed.
 * This prevents render-blocking resources and improves initial page load performance.
 */

interface PrismLoaderOptions {
  languages?: string[]
  onLoad?: () => void
  onError?: (error: Error) => void
}

// Type definition for Prism.js global object
interface PrismGlobal {
  manual?: boolean
  highlight: (code: string, grammar: unknown, language: string) => string
  highlightAllUnder: (container: Element | Document, async?: boolean, callback?: () => void) => void
  highlightElement: (element: Element, async?: boolean, callback?: () => void) => void
  languages: Record<string, unknown>
}

// Extend Window interface to include Prism
declare global {
  interface Window {
    Prism?: PrismGlobal
  }
}

// Cache to track loaded scripts and stylesheets
const loadedScripts = new Set<string>()
const loadedStylesheets = new Set<string>()

// Language dependencies map (some languages depend on others)
const languageDependencies: Record<string, string[]> = {
  cpp: ['c'],
  csharp: ['clike'],
  java: ['clike'],
  javascript: ['clike'],
  typescript: ['javascript', 'clike'],
  php: ['markup-templating', 'clike'],
  'markup-templating': ['markup'],
}

// Core Prism files that must be loaded first
const PRISM_CORE = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js'
const PRISM_CSS =
  'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css'

/**
 * Load a script dynamically
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (loadedScripts.has(src)) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => {
      loadedScripts.add(src)
      resolve()
    }
    script.onerror = () => {
      reject(new Error(`Failed to load script: ${src}`))
    }
    document.head.appendChild(script)
  })
}

/**
 * Load a stylesheet dynamically
 */
function loadStylesheet(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (loadedStylesheets.has(href)) {
      resolve()
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => {
      loadedStylesheets.add(href)
      resolve()
    }
    link.onerror = () => {
      reject(new Error(`Failed to load stylesheet: ${href}`))
    }
    document.head.appendChild(link)
  })
}

/**
 * Get all required language files including dependencies
 */
function getRequiredLanguages(languages: string[]): string[] {
  const required = new Set<string>()

  // Add base languages
  languages.forEach(lang => {
    required.add(lang)

    // Add dependencies recursively
    const deps = languageDependencies[lang] || []
    deps.forEach(dep => required.add(dep))
  })

  // Always include core languages
  required.add('markup')
  required.add('clike')

  return Array.from(required)
}

/**
 * Load Prism.js core and required language components
 */
export async function loadPrism(options: PrismLoaderOptions = {}): Promise<void> {
  const { languages = [], onLoad, onError } = options

  try {
    // Load CSS first (non-blocking)
    await loadStylesheet(PRISM_CSS)

    // Load Prism core
    await loadScript(PRISM_CORE)

    // Ensure Prism is initialized
    if (typeof window !== 'undefined' && window.Prism) {
      window.Prism.manual = true
    }

    // Load required language components
    const requiredLanguages = getRequiredLanguages(languages)
    const languagePromises = requiredLanguages.map(lang => {
      const langFile = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`
      return loadScript(langFile).catch(err => {
        // Some languages might not exist, that's okay
        console.warn(`Failed to load Prism language: ${lang}`, err)
      })
    })

    await Promise.all(languagePromises)

    // Verify Prism is ready
    if (typeof window !== 'undefined' && window.Prism) {
      onLoad?.()
    } else {
      throw new Error('Prism.js failed to initialize')
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    throw err
  }
}

/**
 * Check if Prism.js is already loaded
 */
export function isPrismLoaded(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Prism !== 'undefined' &&
    loadedScripts.has(PRISM_CORE)
  )
}

/**
 * Get Prism instance (will be undefined if not loaded)
 */
export function getPrism(): PrismGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return window.Prism
}
