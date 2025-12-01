/**
 * Unit tests for renderer architecture (registry and configuration validation).
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  registerModelConfig,
  getModelConfig,
  hasModelConfig,
  getRegisteredModelIds,
  clearRegistry,
  getRegistrySize,
  isRegistryInitialized,
  markRegistryInitialized,
  getDefaultConfig,
  validateConfig,
  RegistryValidationError,
} from '../config/modelRendererRegistry'
import type { ModelRendererConfig } from '../types/rendererConfig'

describe('rendererArchitecture', () => {
  beforeEach(() => {
    clearRegistry()
  })

  describe('registry functionality', () => {
    it('should register a valid configuration', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model-1',
        version: '1.0.0',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      expect(() => registerModelConfig(config)).not.toThrow()
      expect(hasModelConfig('test/model-1')).toBe(true)
    })

    it('should retrieve registered configuration', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model-2',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      registerModelConfig(config)
      const retrieved = getModelConfig('test/model-2')

      expect(retrieved.modelId).toBe('test/model-2')
      expect(retrieved.displayMathDelimiters).toEqual(config.displayMathDelimiters)
    })

    it('should return default configuration for unknown model', () => {
      const config = getModelConfig('unknown/model')

      expect(config.modelId).toBe('unknown/model')
      expect(config.displayMathDelimiters.length).toBeGreaterThan(0)
      expect(config.inlineMathDelimiters.length).toBeGreaterThan(0)
    })

    it('should return all registered model IDs', () => {
      const config1: ModelRendererConfig = {
        modelId: 'test/model-1',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      const config2: ModelRendererConfig = {
        modelId: 'test/model-2',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      registerModelConfig(config1)
      registerModelConfig(config2)

      const ids = getRegisteredModelIds()
      expect(ids).toContain('test/model-1')
      expect(ids).toContain('test/model-2')
      expect(ids.length).toBe(2)
    })

    it('should clear registry', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model-1',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      registerModelConfig(config)
      expect(getRegistrySize()).toBe(1)

      clearRegistry()
      expect(getRegistrySize()).toBe(0)
      expect(hasModelConfig('test/model-1')).toBe(false)
    })

    it('should track registry size', () => {
      expect(getRegistrySize()).toBe(0)

      const config: ModelRendererConfig = {
        modelId: 'test/model-1',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      registerModelConfig(config)
      expect(getRegistrySize()).toBe(1)
    })
  })

  describe('configuration validation', () => {
    it('should validate a valid configuration', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      expect(() => validateConfig(config)).not.toThrow()
    })

    it('should reject configuration without modelId', () => {
      const config = {
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration without displayMathDelimiters', () => {
      const config = {
        modelId: 'test/model',
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration without inlineMathDelimiters', () => {
      const config = {
        modelId: 'test/model',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration without codeBlockPreservation', () => {
      const config = {
        modelId: 'test/model',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration with disabled codeBlockPreservation', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: false, // Invalid!
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration with extractBeforeProcessing disabled', () => {
      const config: ModelRendererConfig = {
        modelId: 'test/model',
        displayMathDelimiters: [{ pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar' }],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: false, // Invalid!
          restoreAfterProcessing: true,
        },
      }

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration with invalid delimiter pattern', () => {
      const config = {
        modelId: 'test/model',
        displayMathDelimiters: [
          { pattern: 'not-a-regex' as unknown as RegExp, name: 'double-dollar' },
        ],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })

    it('should reject configuration with delimiter without name', () => {
      const config = {
        modelId: 'test/model',
        displayMathDelimiters: [
          { pattern: /\$\$([^$]+?)\$\$/gs } as unknown as { pattern: RegExp; name: string },
        ],
        inlineMathDelimiters: [{ pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar' }],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as unknown as ModelRendererConfig

      expect(() => validateConfig(config)).toThrow(RegistryValidationError)
    })
  })

  describe('default configuration', () => {
    it('should return default configuration', () => {
      const defaultConfig = getDefaultConfig()

      expect(defaultConfig.isDefault).toBe(true)
      expect(defaultConfig.displayMathDelimiters.length).toBeGreaterThan(0)
      expect(defaultConfig.inlineMathDelimiters.length).toBeGreaterThan(0)
      expect(defaultConfig.codeBlockPreservation.enabled).toBe(true)
    })

    it('should use default configuration for unknown models', () => {
      const config = getModelConfig('unknown/model')
      const defaultConfig = getDefaultConfig()

      expect(config.displayMathDelimiters).toEqual(defaultConfig.displayMathDelimiters)
      expect(config.inlineMathDelimiters).toEqual(defaultConfig.inlineMathDelimiters)
    })
  })

  describe('registry initialization', () => {
    it('should track initialization state', () => {
      clearRegistry()
      expect(isRegistryInitialized()).toBe(false)

      markRegistryInitialized()
      expect(isRegistryInitialized()).toBe(true)
    })
  })
})
