import type { ComponentType } from 'react'

type LatexRendererComponent = ComponentType<{
  children: string
  className?: string
  modelId?: string
}>

let loadedLatexRenderer: LatexRendererComponent | null = null

export function getLoadedLatexRenderer(): LatexRendererComponent | null {
  return loadedLatexRenderer
}

export function setLoadedLatexRenderer(component: LatexRendererComponent): void {
  loadedLatexRenderer = component
}
