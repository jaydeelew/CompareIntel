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
    modelId: 'anthropic/claude-fable-5.1',
    promptName: '05-complex-scenarios',
    fields: ['listItems', 'listTags'],
    reason:
      'The calculation steps under "For a right triangle" stay one nested list in the reference and become a sibling `<ul>` after the display formula here.',
  },
  {
    modelId: 'anthropic/claude-fable-5',
    promptName: '02-markdown-formatting',
    fields: ['listItems', 'listTags', 'visibleText'],
    reason:
      'GFM task lists. We render `[x]`/`[ ]` as checkboxes and drop the markers from the text; markdown-it leaves `[x]` and `[ ]` in the item text and does not open those extra lists.',
  },
  {
    modelId: 'anthropic/claude-opus-4.6',
    promptName: '02-markdown-formatting',
    fields: ['listItems', 'listTags', 'visibleText'],
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
    fields: ['listItems', 'listTags', 'visibleText'],
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
    fields: ['listItems', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'Strikethrough markers stay visible (`~~E=mc3~~`) and the double-bar command stays ∥. The reference strips the tildes and collapses that bar to a single |.',
  },
  {
    modelId: 'google/gemini-4-argon',
    promptName: '06-edge-cases-boundaries',
    fields: ['listItems', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'KaTeX keeps the double-bar command as ∥ in the absolute-value cell. The reference collapses that bar to a single | (∣).',
  },
  {
    modelId: 'google/gemma-3-27b-it',
    promptName: '06-edge-cases-boundaries',
    fields: ['emTexts'],
    reason:
      'One italic span closes on a different word of an "(Expect: …)" note. Visible text, lists, tables, code, and TeX match.',
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
    modelId: 'meta-llama/llama-4-maverick',
    promptName: '05-complex-scenarios',
    fields: ['listItems', 'listTags', 'tableCells', 'visibleText'],
    reason:
      'A list item that continues into a table stays one item in the reference and splits into an extra list plus a different table-cell grouping here.',
  },
  {
    modelId: 'meta-llama/llama-4-maverick',
    promptName: '06-edge-cases-boundaries',
    fields: ['listItems', 'listTags', 'tableCells'],
    reason:
      'A list item that continues into a table stays one item in the reference and splits into an extra list plus a different table-cell grouping here.',
  },
  {
    modelId: 'meta-llama/llama-4-scout',
    promptName: '04-mixed-markdown-latex',
    fields: ['listItems', 'listTags'],
    reason:
      'The inverse-matrix steps stay inside the parent bullet in the reference and become a sibling `<ul>` after the display formula here.',
  },
  {
    modelId: 'microsoft/phi-4',
    promptName: '05-complex-scenarios',
    fields: ['inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'The parenthetical label "(Product)" is rendered as the word Product. The reference leaves the parentheses and the word as table text, so that row\'s TeX and visible text differ.',
  },
  {
    modelId: 'minimax/minimax-m3.1-flash',
    promptName: '05-complex-scenarios',
    fields: ['codeSpans', 'listItems', 'listTags', 'strayBackticks', 'tableCells', 'visibleText'],
    reason:
      'A table cell written as `` ` ` `` is a code span in the reference. We treat the inner pipe as a table break, so the cell text, the stray backticks, and the following lists differ.',
  },
  {
    modelId: 'mistralai/codestral-2508',
    promptName: '06-edge-cases-boundaries',
    fields: ['tableCells'],
    reason:
      'One table cell keeps a trailing caption the reference folds into the cell above it. The TeX in the table is the same.',
  },
  {
    modelId: 'mistralai/mistral-medium-3.1',
    promptName: '06-edge-cases-boundaries',
    fields: ['tableCells'],
    reason:
      'One table cell keeps a trailing caption the reference folds into the cell above it. The TeX in the table is the same.',
  },
  {
    modelId: 'mistralai/mistral-small-3.2-24b-instruct',
    promptName: '05-complex-scenarios',
    fields: ['headings', 'linkHrefs', 'listItems', 'listTags', 'tableCells', 'visibleText'],
    reason:
      'A pipe-delimited formula row is a real table in the reference and stays as pipe text plus an extra ordered list here, which also moves the following heading and link.',
  },
  {
    modelId: 'openai/gpt-4o-mini',
    promptName: '05-complex-scenarios',
    fields: ['inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      "The pipe-split table fragment `|r|<1` and `1/(1-r)` is math we render. The reference drops both, so the product row's visible text and TeX differ.",
  },
  {
    modelId: 'openai/gpt-5-nano',
    promptName: '01-math-basics',
    fields: ['listItems', 'listTags', 'visibleText'],
    reason:
      'A literal pm command outside delimiters stays as the command, and the `1)` steps are three ordered lists. The reference turns that command into ± and keeps one ordered list.',
  },
  {
    modelId: 'openai/gpt-5-nano',
    promptName: '05-complex-scenarios',
    fields: [
      'inlineMathCount',
      'listItemCount',
      'listItems',
      'listTags',
      'texSources',
      'visibleText',
    ],
    reason:
      'Literal cdot and pm commands outside delimiters are rendered as math. The reference leaves them as text and keeps two extra bullets around that sentence.',
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
    modelId: 'openai/gpt-oss-120b',
    promptName: '05-complex-scenarios',
    fields: ['listItems', 'visibleText'],
    reason:
      'Escaped currency (a backslash before $1,200) is kept as a literal dollar with the escape still visible. The reference collapses one escape layer.',
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
    fields: [
      'blockCodeCount',
      'fencedCode',
      'inlineMathCount',
      'leftoverDelimiters',
      'listItems',
      'listTags',
      'strayBackticks',
      'tableCells',
      'texSources',
      'visibleText',
    ],
    reason:
      'A bare `\frac` outside delimiters stays visible text, an indented `---` inside a list item stays text, and the pipe-split `|r|<1` cell is math we keep. The reference drops the fraction, treats the dashes as a break, and splits the code fence differently.',
  },
  {
    modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
    promptName: '01-math-basics',
    fields: ['listItems', 'listTags'],
    reason:
      'Each numbered step is its own ordered list because a display formula sits between the items. The reference keeps one `<ol>`.',
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
      'strongTexts',
      'texSources',
      'visibleText',
    ],
    reason:
      'An HTML `<div>` wrapped around display math is rendered math plus a heading. The reference leaves the tags inside one fence, so the fence text, the heading, and the emphasis around it differ.',
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
      'strongTexts',
      'tableCells',
      'visibleText',
    ],
    reason:
      'A formula table written as a pipe row is a real table. The reference swallows that row into a fence, so the fence text, the table, and the heading around it differ.',
  },
  {
    modelId: 'qwen/qwen3-next-80b-a3b-instruct',
    promptName: '06-edge-cases-boundaries',
    fields: ['inlineMathCount', 'tableCells', 'texSources', 'visibleText'],
    reason:
      'The table label "rendered" is math we keep. The reference leaves the parentheses and the word as cell text.',
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
    promptName: '02-markdown-formatting',
    fields: ['linkHrefs', 'visibleText'],
    reason:
      'The markdown image becomes a link to `https://via.placeholder.com/150` with visible alt text. The reference leaves the image syntax unlinked.',
  },
  {
    modelId: 'stepfun/step-5-preview',
    promptName: '05-complex-scenarios',
    fields: [
      'emTexts',
      'headings',
      'listItemCount',
      'listItems',
      'listTags',
      'strongTexts',
      'visibleText',
    ],
    reason:
      'GFM task lists plus one extra strong and one extra italic around a formula. We drop `[x]`/`[ ]` and render the checkbox items; the reference leaves the markers and keeps those spans out of the emphasis lists.',
  },
  {
    modelId: 'xiaomi/mimo-v2.5',
    promptName: '04-mixed-markdown-latex',
    fields: ['listItems', 'listTags'],
    reason:
      'The singular-matrix warning stays inside the determinant item in the reference and becomes its own bullet after the display formula here.',
  },
  {
    modelId: 'z-ai/glm-5.3-flash',
    promptName: '06-edge-cases-boundaries',
    fields: ['listItems', 'strongTexts', 'visibleText'],
    reason:
      'CommonMark does not close `**` on ` **$` (that run is left-flanking). The strong span is `$x^2$ inside bold` and the opening `**` stays literal. Our bold pass closes at the first `**`, so the closing `**` is the one left in the text.',
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
