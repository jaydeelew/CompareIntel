/**
 * Image config validation - aspect ratio and image size vs model capabilities.
 */

import type { ModelsByProvider } from '../types'

/**
 * All image-generation models with validated capabilities from image_config_test_results.json.
 * Ensures the Advanced dropdown correctly disables invalid aspect ratios and image sizes
 * regardless of potentially stale API/cache data. Update when adding new image models or
 * re-running test_image_config_aspect_ratio.py.
 */
const KNOWN_MODEL_IMAGE_CAPABILITIES: Record<
  string,
  { image_aspect_ratios?: string[]; image_sizes?: string[] }
> = {
  // Black Forest Labs - Flux 2 family: 2K only (1K/4K RES_MISMATCH)
  'black-forest-labs/flux.2-flex': { image_sizes: ['2K'] },
  'black-forest-labs/flux.2-pro': { image_sizes: ['2K'] },
  'black-forest-labs/flux.2-klein-4b': { image_sizes: ['2K'] },
  'black-forest-labs/flux.2-max': { image_sizes: ['2K'] },

  // ByteDance Seed - 2K/4K only; excludes 4:5, 5:4
  'bytedance-seed/seedream-4.5': {
    image_aspect_ratios: ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['2K', '4K'],
  },

  // Google - Gemini image models
  'google/gemini-2.5-flash-image': {
    image_aspect_ratios: ['9:16', '2:3', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '21:9'],
    image_sizes: ['1K'],
  },
  'google/gemini-3-pro-image-preview': { image_sizes: ['1K'] },
  'google/gemini-3.1-flash-image-preview': { image_sizes: ['1K', '2K', '4K'] },

  // OpenAI - 1:1 @ 1K only
  'openai/gpt-5-image': { image_aspect_ratios: ['1:1'], image_sizes: ['1K'] },
  'openai/gpt-5-image-mini': { image_aspect_ratios: ['1:1'], image_sizes: ['1K'] },

  // Sourceful - Riverflow V2
  'sourceful/riverflow-v2-fast': { image_sizes: ['1K', '2K'] },
  'sourceful/riverflow-v2-fast-preview': {
    image_aspect_ratios: ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['1K'],
  },
  'sourceful/riverflow-v2-max-preview': {
    image_aspect_ratios: ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['1K'],
  },
  'sourceful/riverflow-v2-pro': { image_sizes: ['1K', '2K', '4K'] },
  'sourceful/riverflow-v2-standard-preview': {
    image_aspect_ratios: ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9'],
    image_sizes: ['1K'],
  },
}

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
  const known = KNOWN_MODEL_IMAGE_CAPABILITIES[modelId]?.image_aspect_ratios
  if (known && known.length > 0) return known
  const model = getModelById(modelId, modelsByProvider)
  if (!model?.supports_image_generation) return []
  return (model as { image_aspect_ratios?: string[] }).image_aspect_ratios ?? DEFAULT_ASPECT_RATIOS
}

export function getSupportedImageSizes(
  modelId: string,
  modelsByProvider: ModelsByProvider
): string[] {
  const known = KNOWN_MODEL_IMAGE_CAPABILITIES[modelId]?.image_sizes
  if (known && known.length > 0) return known
  const model = getModelById(modelId, modelsByProvider)
  if (!model?.supports_image_generation) return []
  return (model as { image_sizes?: string[] }).image_sizes ?? DEFAULT_IMAGE_SIZES
}

/** Same ordering as Advanced Settings aspect-ratio select (portrait → landscape, then any extras). */
export function orderAspectRatiosLikeAdvanced(ratios: string[]): string[] {
  if (ratios.length === 0) return []
  const set = new Set(ratios)
  const out: string[] = []
  for (const r of DEFAULT_ASPECT_RATIOS) {
    if (set.has(r)) out.push(r)
  }
  for (const r of ratios) {
    if (!out.includes(r)) out.push(r)
  }
  return out
}

/** Same ordering as Advanced Settings image-size select (see IMAGE_SIZE_ORDER). */
export function orderImageSizesLikeAdvanced(sizes: string[]): string[] {
  if (sizes.length === 0) return []
  const set = new Set(sizes)
  const out: string[] = []
  for (const s of IMAGE_SIZE_ORDER) {
    if (set.has(s)) out.push(s)
  }
  for (const s of sizes) {
    if (!out.includes(s)) out.push(s)
  }
  return out
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
  if (modelId in KNOWN_MODEL_IMAGE_CAPABILITIES) return true
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
  if (!intersection || intersection.size === 0) return []
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
  if (!intersection || intersection.size === 0) return []
  const sizeSet = intersection
  return IMAGE_SIZE_ORDER.filter((s: string) => sizeSet.has(s))
}

/**
 * True when every selected image model shares at least one common aspect ratio and image size.
 * When false, no single Advanced combination can satisfy the full selection.
 */
export function hasCommonImageConfig(
  selectedModelIds: string[],
  modelsByProvider: ModelsByProvider
): boolean {
  const imageModelIds = selectedModelIds.filter(id =>
    modelSupportsImageGeneration(id, modelsByProvider)
  )
  if (imageModelIds.length === 0) return true
  const ratios = getSupportedAspectRatiosForModels(selectedModelIds, modelsByProvider)
  const sizes = getSupportedImageSizesForModels(selectedModelIds, modelsByProvider)
  return ratios.length > 0 && sizes.length > 0
}

/**
 * Returns a compatible (aspectRatio, imageSize) for the given models.
 * Prefers 1:1 and 1K when available; otherwise first available in each category.
 * If there is no common aspect ratio or size across image models, returns a neutral placeholder;
 * callers must use hasCommonImageConfig() before treating the pair as valid.
 */
export function getDefaultCompatibleConfig(
  selectedModelIds: string[],
  modelsByProvider: ModelsByProvider
): { aspectRatio: string; imageSize: string } {
  const ratios = getSupportedAspectRatiosForModels(selectedModelIds, modelsByProvider)
  const sizes = getSupportedImageSizesForModels(selectedModelIds, modelsByProvider)
  if (ratios.length === 0 || sizes.length === 0) {
    return { aspectRatio: '1:1', imageSize: '1K' }
  }
  return {
    aspectRatio: ratios.includes('1:1') ? '1:1' : (ratios[0] ?? '1:1'),
    imageSize: sizes.includes('1K') ? '1K' : (sizes[0] ?? '1K'),
  }
}
