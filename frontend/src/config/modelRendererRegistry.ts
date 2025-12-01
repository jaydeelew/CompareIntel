/**
 * Model Renderer Registry
 *
 * Central registry for model-specific renderer configurations.
 * Maps model IDs to their specific rendering configurations.
 */

import type { ModelRendererConfig, DefaultRendererConfig } from '../types/rendererConfig'

/**
 * Registry validation error
 */
export class RegistryValidationError extends Error {
  constructor(
    message: string,
    public readonly config?: ModelRendererConfig
  ) {
    super(message)
    this.name = 'RegistryValidationError'
  }
}

/**
 * Default renderer configuration
 * Matches the current unified renderer behavior
 */
const DEFAULT_CONFIG: DefaultRendererConfig = {
  isDefault: true,
  version: '1.0.0',

  displayMathDelimiters: [
    { pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar', priority: 1 },
    { pattern: /\\\[\s*([\s\S]*?)\s*\\\]/g, name: 'bracket', priority: 2 },
  ],

  inlineMathDelimiters: [
    { pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar', priority: 1 },
    { pattern: /\\\(\s*([\s\S]*?)\s*\\\)/g, name: 'paren', priority: 2 },
  ],

  preprocessing: {
    removeHtmlFromMath: true,
    fixEscapedDollars: true,
    removeMathML: true,
    removeSVG: true,
  },

  markdownProcessing: {
    processLinks: true,
    fixBrokenLinks: false,
    processTables: true,
    processBlockquotes: true,
    processHorizontalRules: true,
    processHeaders: true,
    processBoldItalic: true,
    processLists: true,
    processInlineCode: true,
  },

  katexOptions: {
    throwOnError: false,
    strict: false,
    trust: (context: { command?: string }) =>
      ['\\url', '\\href', '\\includegraphics'].includes(context.command || ''),
    macros: {
      '\\eqref': '\\href{###1}{(\\text{#1})}',
    },
    maxSize: 500,
    maxExpand: 1000,
  },

  codeBlockPreservation: {
    enabled: true,
    extractBeforeProcessing: true,
    restoreAfterProcessing: true,
  },
}

/**
 * Registry storage
 * Maps model ID -> configuration
 */
const registry = new Map<string, ModelRendererConfig>()

/**
 * Registry state
 */
let isInitialized = false

/**
 * Validate a renderer configuration
 *
 * @param config - Configuration to validate
 * @throws RegistryValidationError if validation fails
 */
export function validateConfig(config: ModelRendererConfig): void {
  // Required fields
  if (!config.modelId || typeof config.modelId !== 'string') {
    throw new RegistryValidationError('Configuration must have a valid modelId', config)
  }

  // Math delimiters
  if (!config.displayMathDelimiters || !Array.isArray(config.displayMathDelimiters)) {
    throw new RegistryValidationError('Configuration must have displayMathDelimiters array', config)
  }

  if (!config.inlineMathDelimiters || !Array.isArray(config.inlineMathDelimiters)) {
    throw new RegistryValidationError('Configuration must have inlineMathDelimiters array', config)
  }

  // Code block preservation (must always be enabled)
  if (!config.codeBlockPreservation) {
    throw new RegistryValidationError(
      'Configuration must have codeBlockPreservation settings',
      config
    )
  }

  if (!config.codeBlockPreservation.enabled) {
    throw new RegistryValidationError('Code block preservation must be enabled', config)
  }

  if (!config.codeBlockPreservation.extractBeforeProcessing) {
    throw new RegistryValidationError('Code blocks must be extracted before processing', config)
  }

  if (!config.codeBlockPreservation.restoreAfterProcessing) {
    throw new RegistryValidationError('Code blocks must be restored after processing', config)
  }

  // Validate delimiter patterns
  const allDelimiters = [...config.displayMathDelimiters, ...config.inlineMathDelimiters]

  for (const delimiter of allDelimiters) {
    if (!delimiter.pattern || !(delimiter.pattern instanceof RegExp)) {
      throw new RegistryValidationError(
        `Delimiter pattern must be a RegExp: ${delimiter.name}`,
        config
      )
    }

    if (!delimiter.name) {
      throw new RegistryValidationError('Delimiter must have a name', config)
    }
  }
}

/**
 * Register a model-specific renderer configuration
 *
 * @param config - Configuration to register
 * @throws RegistryValidationError if validation fails
 */
export function registerModelConfig(config: ModelRendererConfig): void {
  validateConfig(config)
  registry.set(config.modelId, config)
}

/**
 * Get configuration for a model
 *
 * @param modelId - Model identifier
 * @returns Model-specific configuration or default configuration
 */
export function getModelConfig(modelId: string): ModelRendererConfig {
  const config = registry.get(modelId)

  if (config) {
    return config
  }

  // Return default configuration
  // We need to create a ModelRendererConfig from DefaultRendererConfig
  return {
    modelId,
    version: DEFAULT_CONFIG.version,
    displayMathDelimiters: DEFAULT_CONFIG.displayMathDelimiters,
    inlineMathDelimiters: DEFAULT_CONFIG.inlineMathDelimiters,
    preprocessing: DEFAULT_CONFIG.preprocessing,
    markdownProcessing: DEFAULT_CONFIG.markdownProcessing,
    katexOptions: DEFAULT_CONFIG.katexOptions,
    codeBlockPreservation: DEFAULT_CONFIG.codeBlockPreservation,
  }
}

/**
 * Check if a model has a specific configuration
 *
 * @param modelId - Model identifier
 * @returns True if model has a specific configuration
 */
export function hasModelConfig(modelId: string): boolean {
  return registry.has(modelId)
}

/**
 * Get all registered model IDs
 *
 * @returns Array of model IDs that have specific configurations
 */
export function getRegisteredModelIds(): string[] {
  return Array.from(registry.keys())
}

/**
 * Clear all registered configurations (useful for testing)
 */
export function clearRegistry(): void {
  registry.clear()
  isInitialized = false
}

/**
 * Get registry size
 *
 * @returns Number of registered configurations
 */
export function getRegistrySize(): number {
  return registry.size
}

/**
 * Check if registry is initialized
 *
 * @returns True if registry has been initialized
 */
export function isRegistryInitialized(): boolean {
  return isInitialized
}

/**
 * Mark registry as initialized
 */
export function markRegistryInitialized(): void {
  isInitialized = true
}

/**
 * Get default configuration
 *
 * @returns Default renderer configuration
 */
export function getDefaultConfig(): DefaultRendererConfig {
  return DEFAULT_CONFIG
}
