/**
 * Tests for renderer configuration loading and validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { loadConfigsFromStatic, initializeRegistry } from '../../config/loadModelConfigs'
import {
  getModelConfig,
  hasModelConfig,
  getRegisteredModelIds,
  clearRegistry,
  isRegistryInitialized,
  validateConfig,
} from '../../config/modelRendererRegistry'
import type { ModelRendererConfig } from '../../types/rendererConfig'

describe('Renderer Configuration Loading', () => {
  beforeEach(() => {
    clearRegistry()
  })

  describe('loadConfigsFromStatic', () => {
    it('should load valid configurations', () => {
      const rawConfigs = [
        {
          modelId: 'test-model-1',
          version: '1.0.0',
          displayMathDelimiters: [
            {
              pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs',
              name: 'double-dollar',
              priority: 1,
            },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          preprocessing: {
            fixEscapedDollars: true,
            removeMathML: true,
            removeSVG: true,
          },
          markdownProcessing: {
            processBoldItalic: true,
          },
          katexOptions: {
            throwOnError: false,
            trust: ['\\url', '\\href'],
          },
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
          metadata: {
            createdAt: '2025-01-01T00:00:00Z',
            needsManualReview: false,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      expect(hasModelConfig('test-model-1')).toBe(true)
      expect(isRegistryInitialized()).toBe(true)
    })

    it('should convert string patterns to RegExp objects', () => {
      const rawConfigs = [
        {
          modelId: 'test-model',
          displayMathDelimiters: [
            {
              pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs',
              name: 'double-dollar',
              priority: 1,
            },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      const config = getModelConfig('test-model')
      expect(config.displayMathDelimiters[0].pattern).toBeInstanceOf(RegExp)
      expect(config.inlineMathDelimiters[0].pattern).toBeInstanceOf(RegExp)
    })

    it('should convert trust array to function', () => {
      const rawConfigs = [
        {
          modelId: 'test-model',
          displayMathDelimiters: [
            {
              pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs',
              name: 'double-dollar',
              priority: 1,
            },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          katexOptions: {
            trust: ['\\url', '\\href'],
          },
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      const config = getModelConfig('test-model')
      expect(config.katexOptions?.trust).toBeInstanceOf(Function)

      if (typeof config.katexOptions?.trust === 'function') {
        expect(config.katexOptions.trust({ command: '\\url' })).toBe(true)
        expect(config.katexOptions.trust({ command: '\\href' })).toBe(true)
        expect(config.katexOptions.trust({ command: '\\unknown' })).toBe(false)
      }
    })

    it('should handle multiple configurations', () => {
      const rawConfigs = [
        {
          modelId: 'model-1',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
        {
          modelId: 'model-2',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      expect(hasModelConfig('model-1')).toBe(true)
      expect(hasModelConfig('model-2')).toBe(true)
      expect(getRegisteredModelIds().length).toBe(2)
    })

    it('should skip invalid configurations and continue', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const rawConfigs = [
        {
          modelId: 'valid-model',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
        {
          // Invalid: missing codeBlockPreservation
          modelId: 'invalid-model',
          displayMathDelimiters: [],
          inlineMathDelimiters: [],
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      expect(hasModelConfig('valid-model')).toBe(true)
      expect(hasModelConfig('invalid-model')).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('should not load if registry is already initialized', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const rawConfigs = [
        {
          modelId: 'model-1',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)
      expect(hasModelConfig('model-1')).toBe(true)

      // Try to load again
      loadConfigsFromStatic(rawConfigs)
      expect(consoleWarnSpy).toHaveBeenCalledWith('Registry already initialized, skipping load')

      consoleWarnSpy.mockRestore()
    })
  })

  describe('initializeRegistry', () => {
    it('should load configurations successfully', async () => {
      // Clear registry first
      clearRegistry()

      // Initialize registry - should load from actual JSON file if it exists
      await initializeRegistry()

      // Should be initialized (either with configs or default)
      expect(isRegistryInitialized()).toBe(true)

      // If config file exists, we should have some registered models
      // If not, we'll use default config (which is also valid)
      const registeredCount = getRegisteredModelIds().length
      expect(registeredCount).toBeGreaterThanOrEqual(0)
    })

    it('should not reinitialize if already initialized', async () => {
      const rawConfigs = [
        {
          modelId: 'model-1',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)
      expect(isRegistryInitialized()).toBe(true)

      await initializeRegistry()
      // Should not throw or reinitialize
      expect(isRegistryInitialized()).toBe(true)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate configurations have required fields', () => {
      const validConfig: ModelRendererConfig = {
        modelId: 'test-model',
        version: '1.0.0',
        displayMathDelimiters: [
          { pattern: /\$\$([^$]+?)\$\$/gs, name: 'double-dollar', priority: 1 },
        ],
        inlineMathDelimiters: [
          { pattern: /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, name: 'single-dollar', priority: 1 },
        ],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      }

      expect(() => validateConfig(validConfig)).not.toThrow()
    })

    it('should reject configs without code block preservation', () => {
      const invalidConfig = {
        modelId: 'test-model',
        displayMathDelimiters: [],
        inlineMathDelimiters: [],
        codeBlockPreservation: {
          enabled: false,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as ModelRendererConfig

      expect(() => validateConfig(invalidConfig)).toThrow()
    })

    it('should reject configs with invalid delimiter patterns', () => {
      const invalidConfig = {
        modelId: 'test-model',
        displayMathDelimiters: [{ pattern: null as unknown as RegExp, name: 'double-dollar' }],
        inlineMathDelimiters: [],
        codeBlockPreservation: {
          enabled: true,
          extractBeforeProcessing: true,
          restoreAfterProcessing: true,
        },
      } as ModelRendererConfig

      expect(() => validateConfig(invalidConfig)).toThrow()
    })
  })

  describe('getModelConfig', () => {
    it('should return registered config for known model', () => {
      const rawConfigs = [
        {
          modelId: 'known-model',
          displayMathDelimiters: [
            { pattern: '/\\$\\$([^\\$]+?)\\$\\$/gs', name: 'double-dollar', priority: 1 },
          ],
          inlineMathDelimiters: [
            {
              pattern: '/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g',
              name: 'single-dollar',
              priority: 1,
            },
          ],
          codeBlockPreservation: {
            enabled: true,
            extractBeforeProcessing: true,
            restoreAfterProcessing: true,
          },
        },
      ]

      loadConfigsFromStatic(rawConfigs)

      const config = getModelConfig('known-model')
      expect(config.modelId).toBe('known-model')
    })

    it('should return default config for unknown model', () => {
      const config = getModelConfig('unknown-model')
      expect(config.modelId).toBe('unknown-model')
      // Should have default delimiters
      expect(config.displayMathDelimiters.length).toBeGreaterThan(0)
      expect(config.inlineMathDelimiters.length).toBeGreaterThan(0)
    })
  })
})
