/**
 * Services Index
 *
 * Central export point for all service modules.
 * Import services from this module for consistency.
 *
 * @example
 * ```typescript
 * import { compareService, authService } from '@/services';
 * ```
 */

// API client (re-exported for convenience)
export { apiClient, createApiClient, ApiClient } from './api/client'

// Comparison service
export * from './compareService'

// Authentication service
export * from './authService'

// Admin service
export * from './adminService'

// Conversation service
export * from './conversationService'

// Models service
export * from './modelsService'

// Config service
export * from './configService'
