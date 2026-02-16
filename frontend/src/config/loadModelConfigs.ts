/**
 * Model Configuration Loader
 *
 * Loads model-specific renderer configurations from analysis data or static configs.
 * This module will be populated in Phase 3 with generated configurations.
 */

import type { ModelRendererConfig, MathDelimiterPattern } from '../types/rendererConfig'
import logger from '../utils/logger'

import {
  registerModelConfig,
  markRegistryInitialized,
  isRegistryInitialized,
} from './modelRendererRegistry'

/**
 * Analysis data structure (from Phase 1)
 */
interface AnalysisData {
  analyses: Record<
    string,
    {
      model_id: string
      delimiters?: {
        display?: string[]
        inline?: string[]
      }
      issues?: string[]
      markdown_elements?: Record<string, boolean>
      code_block_analysis?: {
        total_blocks?: number
        languages_found?: string[]
        contains_math_like_content?: boolean
        contains_dollar_signs?: boolean
        contains_latex_commands?: boolean
      }
      needs_manual_review?: boolean
    }
  >
}

/**
 * Create math delimiter patterns from delimiter type names
 *
 * @param delimiterTypes - Array of delimiter type names
 * @param isDisplay - Whether these are display math delimiters
 * @returns Array of delimiter patterns
 */
function createDelimiterPatterns(
  delimiterTypes: string[],
  _isDisplay: boolean
): MathDelimiterPattern[] {
  const patterns: MathDelimiterPattern[] = []
  let priority = 1

  for (const type of delimiterTypes) {
    let pattern: RegExp
    let name: MathDelimiterPattern['name']

    switch (type) {
      case 'double-dollar':
        pattern = /\$\$([^$]+?)\$\$/gs
        name = 'double-dollar'
        break
      case 'single-dollar':
        pattern = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g
        name = 'single-dollar'
        break
      case 'bracket':
        pattern = /\\\[\s*([\s\S]*?)\s*\\\]/g
        name = 'bracket'
        break
      case 'paren':
        pattern = /\\\(\s*([\s\S]*?)\s*\\\)/g
        name = 'paren'
        break
      case 'align-env':
        pattern = /\\begin\{align\}([\s\S]*?)\\end\{align\}/g
        name = 'align-env'
        break
      case 'equation-env':
        pattern = /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g
        name = 'equation-env'
        break
      default:
        logger.warn(`Unknown delimiter type: ${type}`)
        continue
    }

    patterns.push({ pattern, name, priority })
    priority++
  }

  return patterns
}

/**
 * Generate a model configuration from analysis data
 *
 * @param modelId - Model identifier
 * @param analysis - Analysis data for the model
 * @returns Generated configuration
 */
function generateConfigFromAnalysis(
  modelId: string,
  analysis: AnalysisData['analyses'][string]
): ModelRendererConfig {
  const displayDelimiters = analysis.delimiters?.display || ['double-dollar']
  const inlineDelimiters = analysis.delimiters?.inline || ['single-dollar']

  const hasEscapedDollars = analysis.issues?.includes('escaped_dollar_signs') || false
  const hasHtmlInMath = analysis.issues?.includes('html_in_math') || false
  const hasBrokenLinks = analysis.issues?.includes('broken_markdown_links') || false

  const config: ModelRendererConfig = {
    modelId,
    version: '1.0.0',

    displayMathDelimiters: createDelimiterPatterns(displayDelimiters, true),
    inlineMathDelimiters: createDelimiterPatterns(inlineDelimiters, false),

    preprocessing: {
      removeHtmlFromMath: hasHtmlInMath,
      fixEscapedDollars: hasEscapedDollars,
      removeMathML: true, // Always remove MathML artifacts
      removeSVG: true, // Always remove SVG artifacts
    },

    markdownProcessing: {
      processLinks: analysis.markdown_elements?.links !== false,
      fixBrokenLinks: hasBrokenLinks,
      processTables: analysis.markdown_elements?.tables !== false,
      processBlockquotes: analysis.markdown_elements?.blockquotes !== false,
      processHorizontalRules: analysis.markdown_elements?.horizontal_rules !== false,
      processHeaders: analysis.markdown_elements?.headers !== false,
      processBoldItalic: true, // Always process
      processLists: analysis.markdown_elements?.lists !== false,
      processInlineCode: analysis.markdown_elements?.inline_code !== false,
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

    metadata: {
      createdAt: new Date().toISOString(),
      needsManualReview: analysis.needs_manual_review || false,
    },
  }

  return config
}

/**
 * Load configurations from analysis data
 *
 * @param analysisData - Analysis data from Phase 1
 */
export function loadConfigsFromAnalysis(analysisData: AnalysisData): void {
  if (isRegistryInitialized()) {
    logger.warn('Registry already initialized, skipping load')
    return
  }

  const analyses = analysisData.analyses || {}
  let loadedCount = 0

  for (const [modelId, analysis] of Object.entries(analyses)) {
    try {
      const config = generateConfigFromAnalysis(modelId, analysis)
      registerModelConfig(config)
      loadedCount++
    } catch (error) {
      logger.error(`Failed to load config for ${modelId}:`, error)
    }
  }

  logger.debug(`Loaded ${loadedCount} model configurations from analysis data`)
  markRegistryInitialized()
}

/**
 * Raw configuration from JSON (patterns are strings)
 */
interface RawConfig {
  modelId: string
  version?: string
  displayMathDelimiters: Array<{
    pattern: string // Regex pattern as string
    name: string
    priority?: number
  }>
  inlineMathDelimiters: Array<{
    pattern: string // Regex pattern as string
    name: string
    priority?: number
  }>
  preprocessing?: {
    fixEscapedDollars?: boolean
    removeHtmlFromMath?: boolean
    removeMathML?: boolean
    removeSVG?: boolean
  }
  markdownProcessing?: {
    processLinks?: boolean
    fixBrokenLinks?: boolean
    processTables?: boolean
    processBlockquotes?: boolean
    processHorizontalRules?: boolean
    processHeaders?: boolean
    processBoldItalic?: boolean
    processLists?: boolean
    processInlineCode?: boolean
  }
  katexOptions?: {
    throwOnError?: boolean
    strict?: boolean | 'warn' | 'ignore'
    trust?: string[] // Array of command strings
    macros?: Record<string, string>
    maxSize?: number
    maxExpand?: number
    errorColor?: string
  }
  codeBlockPreservation: {
    enabled: boolean
    extractBeforeProcessing: boolean
    restoreAfterProcessing: boolean
  }
  metadata?: {
    createdAt?: string
    updatedAt?: string
    notes?: string
    needsManualReview?: boolean
  }
}

/**
 * Convert string regex pattern to RegExp object
 * Handles patterns like "/pattern/flags" or just "pattern"
 */
function parseRegexPattern(patternStr: string): RegExp {
  // Pattern format: "/pattern/flags" or just "pattern"
  const match = patternStr.match(/^\/(.+)\/([gimsuvy]*)$/)
  if (match) {
    const [, pattern, flags] = match
    try {
      return new RegExp(pattern, flags)
    } catch (e) {
      logger.warn(`Invalid regex pattern: ${patternStr}`, e)
      // Fallback: try without flags
      return new RegExp(pattern)
    }
  }

  // If no match, assume it's just the pattern
  return new RegExp(patternStr)
}

/**
 * Convert raw config from JSON to ModelRendererConfig
 * Converts string patterns to RegExp objects
 */
function convertRawConfig(raw: RawConfig): ModelRendererConfig {
  const config: ModelRendererConfig = {
    modelId: raw.modelId,
    version: raw.version,

    displayMathDelimiters: raw.displayMathDelimiters.map(d => ({
      pattern: parseRegexPattern(d.pattern),
      name: d.name as MathDelimiterPattern['name'],
      priority: d.priority,
    })),

    inlineMathDelimiters: raw.inlineMathDelimiters.map(d => ({
      pattern: parseRegexPattern(d.pattern),
      name: d.name as MathDelimiterPattern['name'],
      priority: d.priority,
    })),

    preprocessing: raw.preprocessing,

    markdownProcessing: raw.markdownProcessing,

    katexOptions: raw.katexOptions
      ? {
          ...raw.katexOptions,
          // Convert trust array to function if present
          trust: raw.katexOptions.trust
            ? (context: { command?: string }) =>
                raw.katexOptions!.trust!.includes(context.command || '')
            : undefined,
        }
      : undefined,

    codeBlockPreservation: {
      enabled: raw.codeBlockPreservation.enabled as true,
      extractBeforeProcessing: raw.codeBlockPreservation.extractBeforeProcessing as true,
      restoreAfterProcessing: raw.codeBlockPreservation.restoreAfterProcessing as true,
    },

    metadata: raw.metadata,
  }

  return config
}

/**
 * Load configurations from static JSON file
 * This will be used in Phase 3 when configurations are generated
 *
 * @param rawConfigs - Array of raw configurations from JSON
 */
export function loadConfigsFromStatic(rawConfigs: RawConfig[]): void {
  if (isRegistryInitialized()) {
    logger.warn('Registry already initialized, skipping load')
    return
  }

  let loadedCount = 0

  for (const rawConfig of rawConfigs) {
    try {
      const config = convertRawConfig(rawConfig)
      registerModelConfig(config)
      loadedCount++
    } catch (error) {
      logger.error(`Failed to load config for ${rawConfig.modelId}:`, error)
    }
  }

  logger.debug(`Loaded ${loadedCount} model configurations from static configs`)
  markRegistryInitialized()
}

/**
 * Initialize the registry
 * This function will be called at app startup
 *
 * Loads configurations from the generated JSON file
 */
export async function initializeRegistry(): Promise<void> {
  if (isRegistryInitialized()) {
    return
  }

  try {
    // Import the generated configurations
    // Vite handles JSON imports directly - the import returns the JSON object
    const configsModule = await import('./model_renderer_configs.json')
    // Vite JSON imports return the object directly (not wrapped in default)
    const rawConfigs = (configsModule.default || configsModule) as RawConfig[]

    if (Array.isArray(rawConfigs) && rawConfigs.length > 0) {
      loadConfigsFromStatic(rawConfigs)
      logger.debug(`Model renderer registry initialized with ${rawConfigs.length} configurations`)
    } else {
      logger.warn('No configurations found in config file, using default config for all models')
      markRegistryInitialized()
    }
  } catch (error) {
    logger.error('Failed to load model configurations:', error)
    logger.warn('Falling back to default configuration for all models')
    markRegistryInitialized()
  }
}
