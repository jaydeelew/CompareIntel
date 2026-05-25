/**
 * Models Service
 *
 * Handles all model-related API endpoints including:
 * - Listing available models
 * - Getting models by provider
 */

import type { ModelsByProvider } from '../types'

import { apiClient } from './api/client'

/**
 * Available models response
 */
export interface AvailableModelsResponse {
  models: Array<{
    id: string
    name: string
    description: string
    category: string
    provider: string
    available?: boolean
    knowledge_cutoff?: string | null
  }>
  models_by_provider: ModelsByProvider
}

/**
 * Get list of available AI models
 *
 * Listed without client-side GET caching or request dedupe: the models payload can flip (trials/tiers),
 * and in-flight dedupe has caused orphaned rejections in edge cases after errors.
 *
 * @param _skipCache - Kept for call-site compatibility (`MainPage`, etc.).
 * @returns Promise resolving to available models
 * @throws {ApiError} If the request fails
 */
export async function getAvailableModels(_skipCache = false): Promise<AvailableModelsResponse> {
  const response = await apiClient.get<AvailableModelsResponse>('/models', {
    enableCache: false,
    retry: false,
  })
  return response.data
}

/**
 * Get models organized by provider
 *
 * @returns Promise resolving to models by provider
 * @throws {ApiError} If the request fails
 */
export async function getModelsByProvider(): Promise<ModelsByProvider> {
  const response = await getAvailableModels()
  return response.models_by_provider
}
