/**
 * Shared slug helpers for build-time SEO scripts.
 * Keep in sync with frontend/src/data/seo/modelSlug.ts (covered by unit tests).
 */

export function stripProviderPrefix(modelId) {
  const slash = modelId.indexOf('/')
  return slash === -1 ? modelId : modelId.slice(slash + 1)
}

export function modelIdToSlug(modelId) {
  const withoutProvider = stripProviderPrefix(modelId)
  const withoutFree = withoutProvider.replace(/:free$/i, '')
  return withoutFree.replace(/[.:]/g, '-')
}

export function buildComparePath(slugA, slugB) {
  return `/compare/${slugA}-vs-${slugB}`
}

export function buildComparePathFromIds(idA, idB) {
  return buildComparePath(modelIdToSlug(idA), modelIdToSlug(idB))
}

export function buildModelPath(slug) {
  return `/models/${slug}`
}

export function buildCompareAppHref(modelId) {
  const params = new URLSearchParams()
  params.set('models', modelId)
  return `/?${params.toString()}`
}
