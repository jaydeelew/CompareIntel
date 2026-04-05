import type { Model } from '../types'

/**
 * Whether to show the thinking-model (T) indicator.
 * The API sets ``is_thinking_model`` only for models that stream separable reasoning text
 * (``delta.reasoning`` / ``reasoning_content``); do not infer from name or description.
 */
export function isThinkingModel(
  model: Pick<Model, 'id' | 'name' | 'category' | 'description' | 'is_thinking_model'>
): boolean {
  return model.is_thinking_model === true
}
