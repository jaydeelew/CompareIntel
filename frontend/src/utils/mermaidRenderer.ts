/**
 * Lazy Mermaid renderer. The library is loaded on the first diagram so it stays
 * out of the initial bundle. `securityLevel: 'strict'` sanitizes labels.
 * A parse or render failure rejects; the caller shows the fence as a code block.
 */

export type MermaidThemeName = 'default' | 'dark'

interface MermaidApi {
  initialize: (config: {
    startOnLoad: boolean
    securityLevel: 'strict'
    theme: MermaidThemeName
    suppressErrorRendering?: boolean
    fontFamily?: string
  }) => void
  parse: (text: string, options?: { suppressErrors?: boolean }) => Promise<unknown>
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let renderQueue: Promise<void> = Promise.resolve()
let sequence = 0

export function mermaidThemeFromDocument(): MermaidThemeName {
  if (typeof document === 'undefined') return 'default'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default'
}

/**
 * Vitest renders hundreds of saved cells in jsdom, which cannot lay out diagrams.
 * The app, the production build, and Playwright leave this unset and render for real.
 * A test that wants the upgrade sets `window.__CI_RENDER_MERMAID__ = true`.
 */
export function shouldUpgradeMermaidDiagrams(): boolean {
  if (typeof window === 'undefined') return false
  const flag = (window as Window & { __CI_RENDER_MERMAID__?: boolean }).__CI_RENDER_MERMAID__
  if (flag === false) return false
  if (flag === true) return true
  if (import.meta.env.VITEST || import.meta.env.MODE === 'test') return false
  return true
}

async function loadMermaid(): Promise<MermaidApi> {
  const mod = await import('mermaid')
  return (mod.default ?? mod) as MermaidApi
}

async function renderOne(source: string, theme: MermaidThemeName): Promise<string> {
  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    suppressErrorRendering: true,
    fontFamily: 'inherit',
  })
  const parsed = await mermaid.parse(source, { suppressErrors: true })
  if (parsed === false) {
    throw new Error('Mermaid parse error')
  }
  sequence += 1
  const id = `mmd${sequence}${Math.random().toString(36).slice(2, 8)}`
  try {
    const { svg } = await mermaid.render(id, source)
    if (!svg || !/<svg[\s>]/i.test(svg)) {
      throw new Error('Mermaid did not return an SVG')
    }
    return svg
  } finally {
    if (typeof document !== 'undefined') {
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  }
}

export function renderMermaidSvg(source: string, theme: MermaidThemeName): Promise<string> {
  const run = renderQueue.then(() => renderOne(source, theme))
  renderQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
