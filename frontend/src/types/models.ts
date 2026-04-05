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
  /** Whether this paid model is unlocked during the 7-day trial */
  trial_unlocked?: boolean
  /** Maximum input tokens (accurate, from model tokenizer) */
  max_input_tokens?: number
  /** Maximum output tokens (accurate, from model tokenizer) */
  max_output_tokens?: number
  /** Whether the model supports web search via function calling */
  supports_web_search?: boolean
  /** Whether the model supports image/vision inputs (can interpret attached images) */
  supports_vision?: boolean
  /** Whether the model can generate images from text prompts */
  supports_image_generation?: boolean
  /** Whether the model supports the temperature parameter (false = fixed/deterministic) */
  supports_temperature?: boolean
  /**
   * When set by the API: from OpenRouter `supported_parameters` (`reasoning` / `include_reasoning`).
   * Omitted if the model id is missing from the local OpenRouter snapshot — use client heuristics then.
   */
  is_thinking_model?: boolean
  /** Supported aspect ratios for image generation (e.g. ["1:1", "16:9"]) */
  image_aspect_ratios?: string[]
  /** Supported image sizes (e.g. ["1K", "2K", "4K"]) */
  image_sizes?: string[]
  /** Knowledge cutoff date for the model's training data (e.g., "March 2025") */
  knowledge_cutoff?: string
}

/**
 * Models organized by provider
 */
export interface ModelsByProvider {
  [provider: string]: Model[]
}
