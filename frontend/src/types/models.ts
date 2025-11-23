/**
 * Model-related types for CompareIntel
 * 
 * These types define the structure of AI models and their organization
 * throughout the application.
 */

import type { ModelId } from './branded';

/**
 * AI Model information
 */
export interface Model {
  /** Unique identifier for the model */
  id: ModelId;
  /** Display name of the model */
  name: string;
  /** Description of the model's capabilities */
  description: string;
  /** Category the model belongs to (e.g., 'gpt', 'claude', 'gemini') */
  category: string;
  /** Provider of the model (e.g., 'OpenAI', 'Anthropic', 'Google') */
  provider: string;
  /** Whether the model is currently available for selection */
  available?: boolean;
  /** Tier access level: 'anonymous', 'free', or 'paid' */
  tier_access?: 'anonymous' | 'free' | 'paid';
  /** Maximum input length in characters (approximate) */
  max_input_chars?: number;
  /** Maximum output length in characters (approximate) */
  max_output_chars?: number;
}

/**
 * Models organized by provider
 */
export interface ModelsByProvider {
  [provider: string]: Model[];
}

