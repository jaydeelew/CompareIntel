import type { ComponentType } from 'react'

type LatexRendererComponent = ComponentType<{
  children: string
  className?: string
  modelId?: string
  streaming?: boolean
}>

let loadedLatexRenderer: LatexRendererComponent | null = null
let inflight: Promise<LatexRendererComponent> | null = null

function defaultLoad(): Promise<LatexRendererComponent> {
  return import('../LatexRenderer').then(module => module.default)
}

let loadImpl: () => Promise<LatexRendererComponent> = defaultLoad

export function getLoadedLatexRenderer(): LatexRendererComponent | null {
  return loadedLatexRenderer
}

export function setLoadedLatexRenderer(component: LatexRendererComponent): void {
  loadedLatexRenderer = component
}

export function clearLoadedLatexRendererForTests(): void {
  loadedLatexRenderer = null
  inflight = null
}

/** Test seam. Pass null to restore the real dynamic import. */
export function setLatexRendererLoaderForTests(
  next: (() => Promise<LatexRendererComponent>) | null
): void {
  loadImpl = next ?? defaultLoad
  inflight = null
}

/**
 * Load the formatted-answer renderer once and share it. A rejected import
 * clears the in-flight promise so the next call can retry. Callers must
 * catch; a failure here must not surface as an unhandled rejection.
 */
export function loadLatexRenderer(): Promise<LatexRendererComponent> {
  if (loadedLatexRenderer) return Promise.resolve(loadedLatexRenderer)
  if (!inflight) {
    inflight = loadImpl()
      .then(component => {
        loadedLatexRenderer = component
        return component
      })
      .catch(error => {
        inflight = null
        throw error
      })
  }
  return inflight
}
