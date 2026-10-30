/**
 * SEO slug helpers for model pages and (later) /compare/<a>-vs-<b> routes.
 *
 * Slug rule: model id without the provider prefix, `:free` dropped, then
 * `.` and `:` turned into `-`.
 */

export function stripProviderPrefix(modelId: string): string {
  const slash = modelId.indexOf('/')
  return slash === -1 ? modelId : modelId.slice(slash + 1)
}

export function modelIdToSlug(modelId: string): string {
  const withoutProvider = stripProviderPrefix(modelId)
  const withoutFree = withoutProvider.replace(/:free$/i, '')
  return withoutFree.replace(/[.:]/g, '-')
}

/**
 * Canonical vs-page path. Both slugs are sorted only by caller if a stable
 * pair identity is needed; this helper preserves a-then-b order so editorial
 * pair lists can keep a preferred left/right model.
 */
export function buildComparePath(slugA: string, slugB: string): string {
  return `/compare/${slugA}-vs-${slugB}`
}

export function buildComparePathFromIds(idA: string, idB: string): string {
  return buildComparePath(modelIdToSlug(idA), modelIdToSlug(idB))
}

export function buildModelPath(slug: string): string {
  return `/models/${slug}`
}

export function buildCompareAppHref(modelId: string): string {
  const params = new URLSearchParams()
  params.set('models', modelId)
  return `/?${params.toString()}`
}
