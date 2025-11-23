/**
 * Comparison-related types for CompareIntel
 * 
 * These types define the structure of comparison requests, responses,
 * and metadata throughout the application.
 */

import type { ModelId } from './branded';

/**
 * Metadata included with comparison responses
 */
export interface ComparisonMetadata {
  /** Length of the input data in characters */
  input_length: number;
  /** Number of models requested for comparison */
  models_requested: number;
  /** Number of models that successfully responded */
  models_successful: number;
  /** Number of models that failed */
  models_failed: number;
  /** ISO timestamp when the comparison was processed */
  timestamp: string;
  /** Optional processing time in milliseconds */
  processing_time_ms?: number;
  /** Credits used for this comparison */
  credits_used?: number;
  /** Credits remaining after this comparison */
  credits_remaining?: number;
  /** Estimated credits (before comparison) */
  estimated_credits?: number;
  /** Total input tokens used */
  total_input_tokens?: number;
  /** Total output tokens used */
  total_output_tokens?: number;
  /** Total effective tokens used */
  total_effective_tokens?: number;
}

/**
 * Full comparison response from the API
 */
export interface CompareResponse {
  /** Results keyed by model ID */
  results: Record<ModelId, string>;
  /** Metadata about the comparison */
  metadata: ComparisonMetadata;
}

/**
 * Result tab type for displaying comparison results
 */
export const RESULT_TAB = {
  FORMATTED: 'formatted',
  RAW: 'raw',
} as const;

export type ResultTab = typeof RESULT_TAB[keyof typeof RESULT_TAB];

/**
 * Mapping of model IDs to their active result tab
 */
export type ActiveResultTabs = Record<ModelId, ResultTab>;

