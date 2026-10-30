import type { PageMetadata } from '../../config/pageMetadata'
import seoCatalogJson from '../generated/seoCatalog.json'

export interface SeoSpecRow {
  key: string
  label: string
  value: string
}

export interface SeoRelatedModel {
  id: string
  slug: string
  name: string
  provider: string
  path: string
}

export interface SeoModelPage {
  id: string
  slug: string
  name: string
  provider: string
  category: string | null
  summary: string
  path: string
  compareHref: string
  specRows: SeoSpecRow[]
  page: PageMetadata
  related: SeoRelatedModel[]
  source: {
    registry: boolean
    openrouterSnapshot: string | null
    openrouterUrl: string | null
  }
}

export interface SeoComparePair {
  a: string
  b: string
  path: string
  reason: string | null
}

export interface SeoCatalog {
  generatedAt: string
  sources: {
    registry: string
    snapshot: string
    snapshotDate: string | null
  }
  skipIds: string[]
  index: PageMetadata
  models: SeoModelPage[]
  comparePairs: SeoComparePair[]
  modelsBySlug: Record<string, string>
}

export const seoCatalog = seoCatalogJson as SeoCatalog

export function getSeoModelBySlug(slug: string): SeoModelPage | undefined {
  return seoCatalog.models.find(model => model.slug === slug)
}

export function getFeaturedModels(): SeoModelPage[] {
  return seoCatalog.models
}

export function getFeaturedModelsGroupedByProvider(): Array<{
  provider: string
  models: SeoModelPage[]
}> {
  const groups = new Map<string, SeoModelPage[]>()
  for (const model of seoCatalog.models) {
    const list = groups.get(model.provider) || []
    list.push(model)
    groups.set(model.provider, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, models]) => ({
      provider,
      models: [...models].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

export function isFeaturedModelSlug(slug: string): boolean {
  return Boolean(seoCatalog.modelsBySlug[slug])
}
