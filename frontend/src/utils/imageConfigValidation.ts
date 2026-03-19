/**
 * Image config validation - aspect ratio and image size vs model capabilities.
 */

import type { ModelsByProvider } from '../types'

/** Ordered by width/height ascending (portrait to landscape) */
const DEFAULT_ASPECT_RATIOS = [
  '9:16',
  '2:3',
  '3:4',
  '4:5',
  '1:1',
  '5:4',
  '4:3',
  '3:2',
  '16:9',
  '21:9',
]
const DEFAULT_IMAGE_SIZES = ['1K', '2K']
/** Canonical order for UI; includes sizes that may appear in registry */
const IMAGE_SIZE_ORDER = ['1K', '2K', '4K', '0.5K']

function getModelById(modelId: string, modelsByProvider: ModelsByProvider) {
  for (const models of Object.values(modelsByProvider)) {
    const m = models.find(x => String(x.id) === modelId)
    if (m) return m
  }
  return null
}

export function getSupportedAspectRatios(
  modelId: string,
  modelsByProvider: ModelsByProvider
): string[] {
  const model = getModelById(modelId, modelsByProvider)
  if (!model?.supports_image_generation) return []
  return (model as { image_aspect_ratios?: string[] }).image_aspect_ratios ?? DEFAULT_ASPECT_RATIOS
}

export function getSupportedImageSizes(
  modelId: string,
  modelsByProvider: ModelsByProvider
): string[] {
  const model = getModelById(modelId, modelsByProvider)
  if (!model?.supports_image_generation) return []
  return (model as { image_sizes?: string[] }).image_sizes ?? DEFAULT_IMAGE_SIZES
}

export function getIncompatibleModelsForConfig(
  selectedModels: string[],
  aspectRatio: string,
  imageSize: string,
  modelsByProvider: ModelsByProvider
): string[] {
  return selectedModels.filter(
    mid =>
      modelSupportsImageGeneration(mid, modelsByProvider) &&
      !isModelCompatibleWithConfig(mid, aspectRatio, imageSize, modelsByProvider)
  )
}

export function isModelCompatibleWithConfig(
  modelId: string,
  aspectRatio: string,
  imageSize: string,
  modelsByProvider: ModelsByProvider
): boolean {
  const ratios = getSupportedAspectRatios(modelId, modelsByProvider)
  const sizes = getSupportedImageSizes(modelId, modelsByProvider)
  return ratios.includes(aspectRatio) && sizes.includes(imageSize)
}

function modelSupportsImageGeneration(
  modelId: string,
  modelsByProvider: ModelsByProvider
): boolean {
  const model = getModelById(modelId, modelsByProvider)
  return !!model?.supports_image_generation
}

/**
 * Returns the union of all aspect ratios supported by any image model.
 * Order follows DEFAULT_ASPECT_RATIOS; unknown values are appended.
 * Use for displaying the full set of options in the UI (registry updates auto-reflect).
 */
export function getAllKnownAspectRatios(modelsByProvider: ModelsByProvider): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const r of DEFAULT_ASPECT_RATIOS) {
    seen.add(r)
    result.push(r)
  }
  for (const models of Object.values(modelsByProvider)) {
    for (const m of models) {
      if (!m.supports_image_generation) continue
      const arr = (m as { image_aspect_ratios?: string[] }).image_aspect_ratios
      if (!arr) continue
      for (const r of arr) {
        if (!seen.has(r)) {
          seen.add(r)
          result.push(r)
        }
      }
    }
  }
  return result
}

/**
 * Returns the union of all image sizes supported by any image model.
 * Order follows DEFAULT_IMAGE_SIZES plus common extras; unknown values are appended.
 */
export function getAllKnownImageSizes(modelsByProvider: ModelsByProvider): string[] {
  const knownOrder = ['1K', '2K', '4K', '0.5K']
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of knownOrder) {
    seen.add(s)
    result.push(s)
  }
  for (const models of Object.values(modelsByProvider)) {
    for (const m of models) {
      if (!m.supports_image_generation) continue
      const arr = (m as { image_sizes?: string[] }).image_sizes
      if (!arr) continue
      for (const s of arr) {
        if (!seen.has(s)) {
          seen.add(s)
          result.push(s)
        }
      }
    }
  }
  return result
}

/**
 * Returns aspect ratios supported by ALL selected image-generation models (intersection).
 * When no image models are selected, returns the full default list so the UI remains usable.
 */
export function getSupportedAspectRatiosForModels(
  selectedModelIds: string[],
  modelsByProvider: ModelsByProvider
): string[] {
  const imageModelIds = selectedModelIds.filter(id =>
    modelSupportsImageGeneration(id, modelsByProvider)
  )
  if (imageModelIds.length === 0) return DEFAULT_ASPECT_RATIOS
  let intersection: Set<string> | null = null
  for (const id of imageModelIds) {
    const ratios = getSupportedAspectRatios(id, modelsByProvider)
    const set = new Set(ratios)
    if (intersection === null) {
      intersection = set
    } else {
      intersection = new Set<string>([...intersection].filter((x: string) => set.has(x)))
    }
  }
  if (!intersection || intersection.size === 0) return DEFAULT_ASPECT_RATIOS
  const ratioSet = intersection
  return DEFAULT_ASPECT_RATIOS.filter((r: string) => ratioSet.has(r))
}

/**
 * Returns image sizes supported by ALL selected image-generation models (intersection).
 * When no image models are selected, returns the full known list so all options are enabled
 * (matching aspect ratio behavior when no models selected).
 */
export function getSupportedImageSizesForModels(
  selectedModelIds: string[],
  modelsByProvider: ModelsByProvider
): string[] {
  const imageModelIds = selectedModelIds.filter(id =>
    modelSupportsImageGeneration(id, modelsByProvider)
  )
  if (imageModelIds.length === 0) return getAllKnownImageSizes(modelsByProvider)
  let intersection: Set<string> | null = null
  for (const id of imageModelIds) {
    const sizes = getSupportedImageSizes(id, modelsByProvider)
    const set = new Set(sizes)
    if (intersection === null) {
      intersection = set
    } else {
      intersection = new Set<string>([...intersection].filter((x: string) => set.has(x)))
    }
  }
  if (!intersection || intersection.size === 0) return DEFAULT_IMAGE_SIZES
  const sizeSet = intersection
  return IMAGE_SIZE_ORDER.filter((s: string) => sizeSet.has(s))
}

/**
 * Returns a compatible (aspectRatio, imageSize) for the given models.
 * Prefers 1:1 and 1K when available; otherwise first available in each category.
 */
export function getDefaultCompatibleConfig(
  selectedModelIds: string[],
  modelsByProvider: ModelsByProvider
): { aspectRatio: string; imageSize: string } {
  const ratios = getSupportedAspectRatiosForModels(selectedModelIds, modelsByProvider)
  const sizes = getSupportedImageSizesForModels(selectedModelIds, modelsByProvider)
  return {
    aspectRatio: ratios.includes('1:1') ? '1:1' : (ratios[0] ?? '1:1'),
    imageSize: sizes.includes('1K') ? '1K' : (sizes[0] ?? '1K'),
  }
}
