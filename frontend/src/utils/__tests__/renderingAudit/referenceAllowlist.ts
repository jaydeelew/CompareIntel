/**
 * Saved replies that intentionally differ from the markdown-it + KaTeX
 * reference. Each entry names the exact signature fields that may differ
 * and one reason. A cell with any other difference fails. An entry whose
 * cell now matches, or whose field set no longer matches, fails too.
 * There is no blanket skip.
 */
export interface ReferenceAllowlistEntry {
  modelId: string
  promptName: string
  /** Sorted signature fields that are allowed to differ for this cell. */
  fields: string[]
  reason: string
}

export const REFERENCE_ALLOWLIST: ReferenceAllowlistEntry[] = [
  {
    modelId: 'anthropic/claude-opus-4.6',
    promptName: '06-edge-cases-boundaries',
    fields: ['blockCodeCount', 'fencedCode'],
    reason:
      'The reference fence scanner treats the indented prose line "And it evaluates to 0.5" as a second code block. That line is list text; the python fence is the only code block.',
  },
  {
    modelId: 'deepseek/deepseek-v3.2',
    promptName: '04-mixed-markdown-latex',
    fields: [
      'displayMathCount',
      'dollarRuns.$$',
      'headings',
      'listItems',
      'texSources',
      'visibleText',
    ],
    reason:
      'A `$$` matrix is an ATX heading and literal text in the reference. We render that display math, so the heading, the leftover `$$`, and the list text that still contains the source all differ.',
  },
  {
    modelId: 'meta-llama/llama-3.3-70b-instruct',
    promptName: '06-edge-cases-boundaries',
    fields: [
      'fencedCode',
      'headings',
      'inlineMathCount',
      'listItemCount',
      'listItems',
      'listTags',
      'strayBackticks',
      'strongTexts',
      'texSources',
      'visibleText',
    ],
    reason:
      'The fence opens mid-sentence (`The code block ```python`) and the closer is at column 0. We keep that python block, including `price = $50`. The reference only treats a line-start fence as code, so the rest of the reply falls into a bogus fence and loses the following headings, lists, and table math.',
  },
  {
    modelId: 'z-ai/glm-5',
    promptName: '04-mixed-markdown-latex',
    fields: ['inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'Cost table cells use `$\\$100$` currency math beside GFM pipes. Product currency handling and table parsing diverge from markdown-it on those rows.',
  },
  {
    modelId: 'xiaomi/mimo-v2.5',
    promptName: '04-mixed-markdown-latex',
    fields: ['inlineMathCount', 'strongTexts', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'Economics table mixes bold currency cells with `$\\$100$` markers. Product table and emphasis extraction differ from the reference on a few cells.',
  },
  {
    modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    promptName: '05-complex-scenarios',
    fields: [
      'codeSpans',
      'inlineMathCount',
      'strayBackticks',
      'strongTexts',
      'tableCells',
      'texSources',
      'visibleText',
    ],
    reason:
      'The “Currency vs Math $” summary table mixes bold, backticks, and `$` tokens. Product context-aware currency and custom tables diverge from markdown-it on that row.',
  },
  {
    modelId: 'google/gemini-3.8-flash',
    promptName: '04-mixed-markdown-latex',
    fields: ['tableCells', 'texSources', 'visibleText'],
    reason:
      'Budget tables mix `$` currency markers with `|`-heavy rows. The product GFM table pass and currency protection disagree with markdown-it table parsing on a few pipe-split cells.',
  },
  {
    modelId: 'minimax/minimax-m3.1-flash',
    promptName: '05-complex-scenarios',
    fields: ['codeSpans', 'displayMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'Delimiter-examples table puts `$$` inside cells. The product renders those rows as a GFM table with display-math placeholders; markdown-it splits and wraps cells differently.',
  },
  {
    modelId: 'qwen/qwen3-coder-next',
    promptName: '06-edge-cases-boundaries',
    fields: ['codeSpans', 'emTexts', 'inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'Delimiter matrix uses currency `$100` beside `|` cells. Product currency protection and custom tables diverge from the reference on a few table cells and code-span pipes.',
  },
  {
    modelId: 'openai/gpt-4o-mini',
    promptName: '05-complex-scenarios',
    fields: ['inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      "The pipe-split table fragment `|r|<1` and `1/(1-r)` is math we render. The reference drops both, so the product row's visible text and TeX differ.",
  },
  {
    modelId: 'openai/gpt-5.1-codex-max',
    promptName: '06-edge-cases-boundaries',
    fields: ['listItems', 'listTags', 'tableCells', 'visibleText'],
    reason:
      'The reply embeds `<span class="math-display">`. markdown-it leaves the tags as text (html is off). We render the math and drop the wrapper, which also pulls the following bullet into its own list.',
  },
  {
    modelId: 'openai/gpt-5.5',
    promptName: '04-mixed-markdown-latex',
    fields: ['displayMathCount', 'headings', 'listItems', 'texSources', 'visibleText'],
    reason:
      'A backslash-bracket matrix is an ATX heading and literal text in the reference. We render that display math, so the heading and the list item that still contains the source differ.',
  },
  {
    modelId: 'openai/gpt-5.6-luna',
    promptName: '04-mixed-markdown-latex',
    fields: ['displayMathCount', 'headings', 'listItems', 'texSources', 'visibleText'],
    reason:
      'A backslash-bracket matrix is an ATX heading and literal text in the reference. We render that display math, so the heading and the list item that still contains the source differ.',
  },
  {
    modelId: 'openai/o3',
    promptName: '04-mixed-markdown-latex',
    fields: ['listItemCount', 'listItems', 'listTags', 'visibleText'],
    reason:
      'Unicode `•` bullets become a real `<ul>`. The reference leaves the bullets as characters in the paragraph.',
  },
  {
    modelId: 'openai/o3',
    promptName: '05-complex-scenarios',
    fields: ['blockCodeCount', 'fencedCode', 'listItems', 'strayBackticks', 'visibleText'],
    reason:
      'An indented `---` inside a list item stays as the characters `---`. The reference treats that line as a thematic break, and it splits the code fence differently.',
  },
  {
    modelId: 'qwen/qwen3-coder-next',
    promptName: '05-complex-scenarios',
    fields: [
      'blockCodeCount',
      'displayMathCount',
      'fencedCode',
      'headings',
      'listItems',
      'listTags',
      'strayBackticks',
      'texSources',
      'visibleText',
    ],
    reason:
      'An HTML `<div>` wrapped around display math is rendered math plus a heading. The reference leaves the tags inside one fence, so the fence text and the heading differ.',
  },
  {
    modelId: 'qwen/qwen3-next-80b-a3b-instruct',
    promptName: '05-complex-scenarios',
    fields: [
      'blockCodeCount',
      'fencedCode',
      'headings',
      'listItems',
      'strayBackticks',
      'visibleText',
    ],
    reason:
      'A formula table written as a pipe row is a real table. The reference swallows the following python fence, so the fence text and the heading around it differ.',
  },
  {
    modelId: 'qwen/qwen3.8-max-0902',
    promptName: '04-mixed-markdown-latex',
    fields: ['displayMathCount', 'headings', 'texSources', 'visibleText'],
    reason:
      'Two backslash-bracket integrals and the inverse matrix are ATX headings and literal text in the reference. We render all three as display math.',
  },
  {
    modelId: 'stepfun/step-5-preview',
    promptName: '05-complex-scenarios',
    fields: ['emTexts', 'strongTexts', 'visibleText'],
    reason:
      'One extra strong and one extra italic around a formula in task-list prose. The reference emphasis lists differ slightly from the product span extraction.',
  },
  {
    modelId: 'z-ai/glm-5',
    promptName: '05-complex-scenarios',
    fields: [
      'displayMathCount',
      'dollarRuns.$$',
      'headings',
      'listItems',
      'strongTexts',
      'texSources',
      'visibleText',
    ],
    reason:
      'A `$$` bmatrix is an ATX heading and literal `$$` in the reference. We render that display math, which also pulls "Taylor expansion" into its own strong span.',
  },
]

export function allowlistKey(modelId: string, promptName: string): string {
  return `${modelId}\u0000${promptName}`
}
