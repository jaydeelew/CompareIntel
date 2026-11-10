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
    modelId: 'anthropic/claude-fable-5',
    promptName: '02-markdown-formatting',
    fields: ['listItems', 'visibleText'],
    reason:
      'GFM task lists. We render `[x]`/`[ ]` as checkboxes and drop the markers from the text; markdown-it leaves `[x]` and `[ ]` in the item text.',
  },
  {
    modelId: 'anthropic/claude-opus-4.6',
    promptName: '02-markdown-formatting',
    fields: ['listItems', 'visibleText'],
    reason:
      'GFM task lists. We render `[x]`/`[ ]` as checkboxes and drop the markers; markdown-it leaves `[x]` and `[ ]` in the item text.',
  },
  {
    modelId: 'anthropic/claude-opus-4.6',
    promptName: '06-edge-cases-boundaries',
    fields: ['blockCodeCount', 'fencedCode'],
    reason:
      'The reference fence scanner treats the indented prose line "And it evaluates to 0.5" as a second code block. That line is list text; the python fence is the only code block.',
  },
  {
    modelId: 'anthropic/claude-opus-5',
    promptName: '02-markdown-formatting',
    fields: ['listItems', 'visibleText'],
    reason:
      'GFM task lists. We render `[x]`/`[ ]` as checkboxes and drop the markers; markdown-it leaves `[x]` and `[ ]` in the item text.',
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
    modelId: 'google/gemini-3.6-flash',
    promptName: '04-mixed-markdown-latex',
    fields: ['tableCells', 'texSources', 'visibleText'],
    reason:
      'KaTeX keeps the double-bar command as ∥. The reference runs the same TeX through markdown escaping first, so the bar collapses to a single | (∣).',
  },
  {
    modelId: 'google/gemini-3.8-flash',
    promptName: '05-complex-scenarios',
    fields: ['tableCells', 'texSources', 'visibleText'],
    reason:
      'KaTeX keeps the double-bar command as ∥. The reference runs the same TeX through markdown escaping first, so the bar collapses to a single | (∣).',
  },
  {
    modelId: 'google/gemini-4-argon',
    promptName: '05-complex-scenarios',
    fields: ['tableCells', 'texSources', 'visibleText'],
    reason:
      'KaTeX keeps the double-bar command as ∥. The reference runs the same TeX through markdown escaping first, so the bar collapses to a single | (∣). The strikethrough around that formula is a real `<del>`.',
  },
  {
    modelId: 'google/gemini-4-argon',
    promptName: '06-edge-cases-boundaries',
    fields: ['tableCells', 'texSources', 'visibleText'],
    reason:
      'KaTeX keeps the double-bar command as ∥ in the absolute-value cell. The reference collapses that bar to a single | (∣).',
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
    modelId: 'minimax/minimax-m3.1-flash',
    promptName: '05-complex-scenarios',
    fields: ['listItems', 'visibleText'],
    reason:
      'GFM task lists. We render `[x]` as a checkbox and drop the marker; markdown-it leaves `[x]` in the item text. The pipe inside the code span is a cell break, matching the reference.',
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
    fields: ['emTexts', 'listItemCount', 'listItems', 'listTags', 'strongTexts', 'visibleText'],
    reason:
      'GFM task lists plus one extra strong and one extra italic around a formula. We drop `[x]`/`[ ]` and render the checkbox items; the reference leaves the markers and keeps those spans out of the emphasis lists.',
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
