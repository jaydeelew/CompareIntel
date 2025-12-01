/**
 * Renderer Configuration Schema
 *
 * Defines the structure for model-specific rendering configurations.
 * Each model can have its own configuration to handle formatting variations.
 */

/**
 * Math delimiter pattern types
 */
export type MathDelimiterType =
  | 'double-dollar' // $$...$$
  | 'single-dollar' // $...$
  | 'bracket' // \[...\]
  | 'paren' // \(...\)
  | 'align-env' // \begin{align}...\end{align}
  | 'equation-env' // \begin{equation}...\end{equation}

/**
 * Math delimiter pattern definition
 */
export interface MathDelimiterPattern {
  /** Regex pattern to match the delimiter */
  pattern: RegExp
  /** Name/type of the delimiter */
  name: MathDelimiterType
  /** Optional priority (lower numbers processed first) */
  priority?: number
}

/**
 * Preprocessing function type
 * Takes raw text and returns processed text
 */
export type PreprocessingFunction = (text: string) => string

/**
 * Post-processing function type
 * Takes rendered HTML and returns final HTML
 */
export type PostProcessingFunction = (html: string) => string

/**
 * Preprocessing pipeline options
 */
export interface PreprocessingOptions {
  /** Remove HTML tags from math expressions */
  removeHtmlFromMath?: boolean
  /** Fix escaped dollar signs (e.g., \$ -> $) */
  fixEscapedDollars?: boolean
  /** Remove MathML artifacts */
  removeMathML?: boolean
  /** Remove SVG artifacts */
  removeSVG?: boolean
  /** Custom preprocessing functions (applied in order) */
  customPreprocessors?: PreprocessingFunction[]
}

/**
 * Markdown processing rules
 */
export interface MarkdownProcessingRules {
  /** Process markdown links */
  processLinks?: boolean
  /** Fix broken markdown links */
  fixBrokenLinks?: boolean
  /** Process markdown tables */
  processTables?: boolean
  /** Process blockquotes */
  processBlockquotes?: boolean
  /** Process horizontal rules */
  processHorizontalRules?: boolean
  /** Process headers */
  processHeaders?: boolean
  /** Process bold/italic */
  processBoldItalic?: boolean
  /** Process lists */
  processLists?: boolean
  /** Process inline code */
  processInlineCode?: boolean
}

/**
 * KaTeX rendering options
 */
export interface KatexOptions {
  /** Throw error on KaTeX parse errors (default: false) */
  throwOnError?: boolean
  /** Strict mode (default: false) */
  strict?: boolean | 'warn' | 'ignore'
  /** Trust certain commands (function or array) */
  trust?: boolean | ((context: { command?: string }) => boolean) | string[]
  /** Custom macros */
  macros?: Record<string, string>
  /** Maximum size for KaTeX expressions */
  maxSize?: number
  /** Maximum expansion limit */
  maxExpand?: number
  /** Error color for failed renders */
  errorColor?: string
}

/**
 * Code block preservation settings
 * Code blocks must ALWAYS be preserved exactly as received
 */
export interface CodeBlockPreservationSettings {
  /** Always preserve code blocks (must be true) */
  enabled: true
  /** Extract code blocks before processing */
  extractBeforeProcessing: true
  /** Restore code blocks after processing */
  restoreAfterProcessing: true
}

/**
 * Model-specific renderer configuration
 */
export interface ModelRendererConfig {
  /** Model identifier (e.g., "anthropic/claude-sonnet-4.5") */
  modelId: string
  /** Model version (optional, for tracking changes) */
  version?: string

  /** Math delimiter patterns for display math */
  displayMathDelimiters: MathDelimiterPattern[]
  /** Math delimiter patterns for inline math */
  inlineMathDelimiters: MathDelimiterPattern[]

  /** Preprocessing pipeline options */
  preprocessing?: PreprocessingOptions

  /** Markdown processing rules */
  markdownProcessing?: MarkdownProcessingRules

  /** KaTeX rendering options */
  katexOptions?: KatexOptions

  /** Post-processing pipeline (applied after all rendering) */
  postProcessing?: PostProcessingFunction[]

  /** Code block preservation settings (must always preserve) */
  codeBlockPreservation: CodeBlockPreservationSettings

  /** Optional metadata */
  metadata?: {
    /** When this config was created */
    createdAt?: string
    /** When this config was last updated */
    updatedAt?: string
    /** Notes about this configuration */
    notes?: string
    /** Whether this needs manual review */
    needsManualReview?: boolean
  }
}

/**
 * Default renderer configuration
 * Matches the current unified renderer behavior
 */
export interface DefaultRendererConfig extends Omit<ModelRendererConfig, 'modelId'> {
  /** This is the default configuration */
  isDefault: true
}
