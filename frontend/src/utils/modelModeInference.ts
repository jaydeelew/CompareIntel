import { isVoiceEnabled } from '../config/voiceFlag'
import type {
  ImageComposerAdvancedSettings,
  TextComposerAdvancedSettings,
  ModelsByProvider,
  ModelMode,
} from '../types'

import { modelSupportsImageGeneration } from './visionModels'

/**
 * Choose text vs image vs voice model-mode when restoring models from storage or history.
 * Uses saved composer snapshots when present, otherwise infers from model capabilities.
 */
export function inferModelModeForLoadedModels(
  modelIds: string[],
  modelsByProvider: ModelsByProvider,
  opts?: {
    composerMode?: ModelMode | string | null
    textComposerAdvanced?: TextComposerAdvancedSettings
    imageComposerAdvanced?: ImageComposerAdvancedSettings
  }
): ModelMode {
  const { composerMode, textComposerAdvanced, imageComposerAdvanced } = opts ?? {}
  if (composerMode === 'voice') {
    return isVoiceEnabled() ? 'voice' : 'text'
  }
  if (composerMode === 'image' || composerMode === 'text') {
    return composerMode
  }
  const hasText = textComposerAdvanced != null
  const hasImage = imageComposerAdvanced != null
  if (hasImage && !hasText) return 'image'
  if (hasText && !hasImage) return 'text'
  if (hasText && hasImage) {
    const allImage =
      modelIds.length > 0 &&
      modelIds.every(id => modelSupportsImageGeneration(id, modelsByProvider))
    return allImage ? 'image' : 'text'
  }

  const allImage =
    modelIds.length > 0 && modelIds.every(id => modelSupportsImageGeneration(id, modelsByProvider))
  if (allImage) return 'image'
  const allText =
    modelIds.length > 0 && modelIds.every(id => !modelSupportsImageGeneration(id, modelsByProvider))
  if (allText) return 'text'
  if (modelIds.some(id => modelSupportsImageGeneration(id, modelsByProvider))) return 'image'
  return 'text'
}
