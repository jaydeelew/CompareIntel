import type { Model } from '../types'

function categoryHasReasoningSegment(category: string): boolean {
  return category.split('/').some(s => s.trim().toLowerCase() === 'reasoning')
}

/** OpenAI o-series (o1, o3, o4, …) are extended-reasoning models in the registry. */
function isOpenAiOSeriesModelId(id: string): boolean {
  return /^openai\/o\d/i.test(id)
}

function thinkingModelHeuristic(
  model: Pick<Model, 'id' | 'name' | 'category' | 'description'>
): boolean {
  const id = model.id.toLowerCase()
  const name = model.name.toLowerCase()
  const desc = (model.description || '').toLowerCase()

  if (id.includes('thinking') || id.includes(':thinking')) return true
  if (/\bthinking\b/.test(name)) return true
  if (categoryHasReasoningSegment(model.category || '')) return true
  if (isOpenAiOSeriesModelId(model.id)) return true

  if (
    /\bthinking model\b/.test(desc) ||
    /\bextended thinking\b/.test(desc) ||
    /\bbuilt-in thinking\b/.test(desc) ||
    /\bfrontier reasoning model\b/.test(desc)
  ) {
    return true
  }

  return false
}

/**
 * Whether to show the thinking-model (T) indicator.
 * Prefer `is_thinking_model` from `/api/models` (OpenRouter `supported_parameters`); otherwise heuristics.
 */
export function isThinkingModel(
  model: Pick<Model, 'id' | 'name' | 'category' | 'description' | 'is_thinking_model'>
): boolean {
  if (typeof model.is_thinking_model === 'boolean') {
    return model.is_thinking_model
  }
  return thinkingModelHeuristic(model)
}
