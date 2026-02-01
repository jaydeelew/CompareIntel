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
 * Uses caching with longer TTL since models list is relatively static.
 *
 * @param skipCache - If true, bypasses AND invalidates cache to get fresh data (e.g., after registration or verification)
 * @returns Promise resolving to available models
 * @throws {ApiError} If the request fails
 */
export async function getAvailableModels(skipCache = false): Promise<AvailableModelsResponse> {
  // When skipCache is requested, delete the existing cache entry first
  // This prevents stale data from being returned by subsequent non-skipCache calls
  if (skipCache) {
    apiClient.deleteCache('GET:/models')
  }

  const response = await apiClient.get<AvailableModelsResponse>('/models', {
    // Cache models for 10 minutes (they're relatively static)
    // But allow bypassing cache when user status changes (registration, verification)
    cacheTTL: skipCache ? 0 : 10 * 60 * 1000,
    enableCache: !skipCache,
    _cacheKey: 'GET:/models',
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
