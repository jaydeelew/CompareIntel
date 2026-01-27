/**
 * Utility functions for CompareIntel frontend.
 *
 * This module re-exports all utility functions for convenient importing.
 * Import from here to get all utilities, or import from individual modules
 * for tree-shaking benefits.
 *
 * @example
 * ```typescript
 * // Import individual utilities
 * import { formatDate, truncatePrompt } from '@/utils/format';
 *
 * // Or import from index (convenient but less tree-shakeable)
 * import { formatDate, truncatePrompt } from '@/utils';
 * ```
 */

// Hash utilities
export { simpleHash } from './hash'
export type {} from './hash'

// Fingerprint utilities
export { generateBrowserFingerprint } from './fingerprint'
export type { BrowserFingerprintData } from './fingerprint'

// Formatting utilities
export {
  formatDate,
  formatTime,
  formatNumber,
  truncatePrompt,
  formatConversationMessage,
} from './format'

// Validation utilities
export {
  getSafeId,
  validateEmail,
  validateInputLength,
  isEmpty,
  validateNotEmpty,
} from './validation'

// Error handling utilities
export { showNotification, formatError, isErrorMessage } from './error'
export type { NotificationType } from './error'

// Date utilities
export {
  parseDate,
  isToday,
  getTodayStart,
  getCurrentISODate,
  getDateDiff,
  formatLocaleDate,
} from './date'

// Performance utilities
export {
  initWebVitals,
  PerformanceMarker,
  measureApiRequest,
  measureRender,
  getPerformanceSummary,
  checkPerformanceBudgets,
  PERFORMANCE_BUDGETS,
} from './performance'
export type { PerformanceMetric, PerformanceCallback } from './performance'

// Image optimization utilities
export {
  isExternalImage,
  supportsWebP,
  supportsAVIF,
  optimizeImageUrl,
  generateSrcSet,
  generateSizes,
  createOptimizedImageAttrs,
  imageAttrsToHtml,
} from './image'
export type { ImageOptimizationOptions } from './image'

// Export utilities
export {
  exportToMarkdown,
  exportToJSON,
  exportToHTML,
  exportToPDF,
  downloadMarkdown,
  downloadJSON,
  downloadHTML,
  downloadFile,
} from './export'
export type { ComparisonExportData } from './export'

// Session state persistence utilities
export {
  saveSessionState,
  loadSessionState,
  clearSessionState,
  dispatchSaveStateEvent,
  onSaveStateEvent,
} from './sessionState'
export type { PersistedSessionState } from './sessionState'
