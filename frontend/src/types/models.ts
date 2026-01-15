/**
 * Model-related types for CompareIntel
 *
 * These types define the structure of AI models and their organization
 * throughout the application.
 */

import type { ModelId } from './branded'

/**
 * AI Model information
 */
export interface Model {
  /** Unique identifier for the model */
  id: ModelId
  /** Display name of the model */
  name: string
  /** Description of the model's capabilities */
  description: string
  /** Category the model belongs to (e.g., 'gpt', 'claude', 'gemini') */
  category: string
  /** Provider of the model (e.g., 'OpenAI', 'Anthropic', 'Google') */
  provider: string
  /** Whether the model is currently available for selection */
  available?: boolean
  /** Tier access level: 'unregistered', 'free', or 'paid' */
  tier_access?: 'unregistered' | 'free' | 'paid'
  /** Maximum input tokens (accurate, from model tokenizer) */
  max_input_tokens?: number
  /** Maximum output tokens (accurate, from model tokenizer) */
  max_output_tokens?: number
  /** Whether the model supports web search via function calling */
  supports_web_search?: boolean
  /** Knowledge cutoff date for the model's training data (e.g., "March 2025") */
  knowledge_cutoff?: string
}

/**
 * Models organized by provider
 */
export interface ModelsByProvider {
  [provider: string]: Model[]
}
