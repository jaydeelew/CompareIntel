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
  }>
  models_by_provider: ModelsByProvider
}

/**
 * Get list of available AI models
 *
 * Uses caching with longer TTL since models list is relatively static.
 *
 * @returns Promise resolving to available models
 * @throws {ApiError} If the request fails
 */
export async function getAvailableModels(): Promise<AvailableModelsResponse> {
  const response = await apiClient.get<AvailableModelsResponse>('/models', {
    // Cache models for 10 minutes (they're relatively static)
    cacheTTL: 10 * 60 * 1000,
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
