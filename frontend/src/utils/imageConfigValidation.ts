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
