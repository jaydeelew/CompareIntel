/** Full-section audit catalog for previously fixed renderer bugs 01–29. */

export interface BugCase {
  bug: number
  id: string
  title: string
  modelId: string
  promptName: string
  sourceJson?: string
  inlineContent?: string
  startRe: string
  /** @deprecated Heading-aware extraction ignores this; kept so older call sites typecheck. */
  stopRe?: string
  /** Stop at the next heading of this level or higher. Default: the start heading's level. */
  stopHeadingLevel?: number
}

export const BUG_CASES: BugCase[] = [
  {
    bug: 1,
    id: '01-currency',
    title: 'currency dollar signs are not inline math',
    modelId: 'anthropic/claude-sonnet-4.6',
    promptName: '01-math-basics',
    sourceJson: 'rendering-harness/runs/2026-11-04/anthropic_claude-sonnet-4.6_01-math-basics.json',
    startRe: 'Plain Currency',
  },
  {
    bug: 2,
    id: '02-table-currency',
    title: '$ in table cells does not merge cells',
    modelId: 'google/gemini-2.5-flash',
    promptName: '02-markdown-formatting',
    sourceJson:
      'rendering-harness/runs/2026-11-04/google_gemini-2.5-flash_02-markdown-formatting.json',
    startRe: '^## Tables',
    stopRe: '^## Blockquotes',
  },
  {
    bug: 3,
    id: '03-escaped-dollar',
    title: 'escaped \\$ is a literal dollar',
    modelId: 'openai/gpt-4o-mini',
    promptName: '04-mixed-markdown-latex',
    sourceJson: 'rendering-harness/runs/2026-11-04/openai_gpt-4o-mini_04-mixed-markdown-latex.json',
    startRe: '^## Real World Context',
  },
  {
    bug: 4,
    id: '04-blockquotes',
    title: 'blockquotes',
    modelId: 'google/gemini-2.5-flash',
    promptName: '02-markdown-formatting',
    sourceJson:
      'rendering-harness/runs/2026-11-04/google_gemini-2.5-flash_02-markdown-formatting.json',
    startRe: '^## Blockquotes',
  },
  {
    bug: 5,
    id: '05-nested-lists',
    title: 'nested ordered lists',
    modelId: 'google/gemini-2.5-flash',
    promptName: '02-markdown-formatting',
    sourceJson:
      'rendering-harness/runs/2026-11-04/google_gemini-2.5-flash_02-markdown-formatting.json',
    startRe: '^## Lists',
    stopRe: '^## Tables',
  },
  {
    bug: 6,
    id: '06-headings',
    title: 'headings never show a literal #',
    modelId: 'google/gemini-2.5-flash',
    promptName: '02-markdown-formatting',
    sourceJson:
      'rendering-harness/runs/2026-11-04/google_gemini-2.5-flash_02-markdown-formatting.json',
    startRe: '^## Headers',
    stopRe: '^## Text formatting',
  },
  {
    bug: 7,
    id: '07-fenced-code',
    title: 'fenced code blocks are fully protected',
    modelId: 'anthropic/claude-sonnet-4.6',
    promptName: '03-code-blocks',
    sourceJson: 'rendering-harness/runs/2026-11-04/anthropic_claude-sonnet-4.6_03-code-blocks.json',
    startRe: '^## Python code',
  },
  {
    bug: 8,
    id: '08-inline-code',
    title: 'inline code is never math',
    modelId: 'anthropic/claude-sonnet-4.6',
    promptName: '03-code-blocks',
    sourceJson: 'rendering-harness/runs/2026-11-04/anthropic_claude-sonnet-4.6_03-code-blocks.json',
    startRe: 'Inline code',
    stopRe: '^## |^```',
  },
  {
    bug: 9,
    id: '09-dollar-in-display',
    title: '\\$ inside $$ display math',
    modelId: 'anthropic/claude-sonnet-4.6',
    promptName: '04-mixed-markdown-latex',
    sourceJson:
      'rendering-harness/runs/2026-11-04/anthropic_claude-sonnet-4.6_04-mixed-markdown-latex.json',
    startRe: '^# Mathematical Analysis',
  },
  {
    bug: 10,
    id: '10-unicode-times',
    title: 'Unicode × in prose stays literal',
    modelId: 'anthropic/claude-sonnet-4.6',
    promptName: '01-math-basics',
    sourceJson: 'rendering-harness/runs/2026-11-04/anthropic_claude-sonnet-4.6_01-math-basics.json',
    startRe: '^## 3\\. Matrices',
  },
  {
    bug: 11,
    id: '11-list-display-math',
    title: 'display math at a bullet indent stays inside the list',
    modelId: 'openai/gpt-4o-mini',
    promptName: '05-complex-scenarios',
    sourceJson: 'rendering-harness/runs/2026-11-04/openai_gpt-4o-mini_05-complex-scenarios.json',
    startRe: 'Scenario 1: Math in Lists',
    stopRe: 'Scenario 2:',
  },
  {
    bug: 12,
    id: '12-home-dollar',
    title: '$HOME must not pair with a later currency dollar',
    modelId: 'anthropic/claude-haiku-5.5',
    promptName: '06-edge-cases-boundaries',
    sourceJson:
      'rendering-harness/runs/2026-11-08-01/anthropic_claude-haiku-5.5_06-edge-cases-boundaries.json',
    startRe: 'Raw Dollar Signs',
    stopRe: 'Additional Stress|Summary|^## [^R]',
  },
  {
    bug: 13,
    id: '13-bracket-display',
    title: '\\[...\\] display math is recognized',
    modelId: 'qwen/qwen3-coder-flash',
    promptName: '06-edge-cases-boundaries',
    sourceJson:
      'rendering-harness/runs/2026-11-08-01/qwen_qwen3-coder-flash_06-edge-cases-boundaries.json',
    startRe: 'Delimiter Variants',
    stopRe: 'Nested Structures',
  },
  {
    bug: 14,
    id: '14-table-swallow',
    title: 'consecutive tables stay separate',
    modelId: 'z-ai/glm-5.3-flash',
    promptName: '05-complex-scenarios',
    sourceJson:
      'rendering-harness/runs/2026-11-08-02/reruns/z-ai_glm-5.3-flash_05-complex-scenarios.json',
    startRe: 'Scenario 2: Tables',
    stopRe: 'Scenario 3',
  },
  {
    bug: 15,
    id: '15-list-link',
    title: 'markdown links inside list items become <a href>',
    modelId: 'microsoft/phi-4',
    promptName: '01-math-basics',
    sourceJson: 'rendering-harness/runs/2026-11-08-03/microsoft_phi-4_01-math-basics.json',
    startRe: '.',
  },
  {
    bug: 16,
    id: '16-placeholder-leak',
    title: '$...$ / $$...$$ delimiter examples are not math',
    modelId: 'microsoft/phi-4',
    promptName: '05-complex-scenarios',
    sourceJson: 'rendering-harness/runs/2026-11-08-03/microsoft_phi-4_05-complex-scenarios.json',
    startRe: 'Key Considerations',
  },
  {
    bug: 17,
    id: '17-heading-after-table',
    title: '## after a markdown table becomes a heading',
    modelId: 'xiaomi/mimo-v2.6-flash',
    promptName: '02-markdown-formatting',
    sourceJson:
      'rendering-harness/runs/2026-11-08-03/xiaomi_mimo-v2.6-flash_02-markdown-formatting.json',
    startRe: '^## Tables',
    stopHeadingLevel: 1,
  },
  {
    bug: 18,
    id: '18-bold-math',
    title: '**$x = 0$** in a list continuation is bold math',
    modelId: 'google/gemini-3.1-flash-lite-preview',
    promptName: '04-mixed-markdown-latex',
    sourceJson:
      'rendering-harness/runs/2026-11-08-03/google_gemini-3.1-flash-lite-preview_04-mixed-markdown-latex.json',
    startRe: 'Further Calculus',
    stopRe: 'Linear Algebra',
  },
  {
    bug: 19,
    id: '19-unicode-codepoint',
    title: '(U+00B2) code-point notes are not implicit math',
    modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
    promptName: '05-complex-scenarios',
    sourceJson:
      'rendering-harness/runs/2026-11-08-04/reruns/qwen_qwen3-30b-a3b-instruct-2507_05-complex-scenarios.json',
    startRe: 'Scenario 3: Code and Math Mixed',
  },
  {
    bug: 20,
    id: '20-list-prefixed-closer',
    title: 'list-prefixed \\[ display math in a list (real Phi-4 05 reply)',
    modelId: 'microsoft/phi-4',
    promptName: '05-complex-scenarios',
    sourceJson: 'rendering-harness/runs/2026-11-08-03/microsoft_phi-4_05-complex-scenarios.json',
    startRe: '^#### 1\\. Math in Lists',
  },
  {
    bug: 21,
    id: '21-padded-dollar',
    title: "padded $ f'(x) $ is inline math",
    modelId: 'qwen/qwen3-next-80b-a3b-instruct',
    promptName: '04-mixed-markdown-latex',
    sourceJson:
      'rendering-harness/runs/2026-11-08-05/qwen_qwen3-next-80b-a3b-instruct_04-mixed-markdown-latex.json',
    startRe: 'Exercise 1: Calculus',
    stopRe: 'Linear Algebra',
  },
  {
    bug: 22,
    id: '22-hyphen-nonmath',
    title: 'hyphenated (Non-Math) is not implicit math',
    modelId: 'mistralai/mistral-medium-3.1',
    promptName: '01-math-basics',
    sourceJson:
      'rendering-harness/runs/2026-11-08-06/mistralai_mistral-medium-3.1_01-math-basics.json',
    startRe: 'Math Basics Demonstration',
  },
  {
    bug: 23,
    id: '23-align-placeholder',
    title: '$$\\begin{align}$$ is not a leaked placeholder; tags at right edge',
    modelId: 'qwen/qwen3-coder',
    promptName: '01-math-basics',
    sourceJson: 'rendering-harness/runs/2026-11-08-07/qwen_qwen3-coder_01-math-basics.json',
    startRe: 'Aligned Equations',
    stopRe: '^## [^A]',
  },
  {
    bug: 24,
    id: '24-double-backtick',
    title: 'double-backtick `` `$x$` `` is inline code',
    modelId: 'z-ai/glm-5',
    promptName: '05-complex-scenarios',
    sourceJson: 'rendering-harness/runs/2026-11-08-07/reruns/z-ai_glm-5_05-complex-scenarios.json',
    startRe: 'Scenario C: Emphasis',
    stopRe: 'Scenario D',
  },
  {
    bug: 25,
    id: '25-escaped-currency-code',
    title: 'CommonMark `$`100 code-span pairing',
    modelId: 'stepfun/step-5-preview',
    promptName: '05-complex-scenarios',
    sourceJson:
      'rendering-harness/runs/2026-11-08-10/stepfun_step-5-preview_05-complex-scenarios.json',
    startRe: 'Escaped Delimiters',
    stopRe: 'Blockquotes',
  },
  {
    bug: 26,
    id: '26-multiline-cases',
    title: 'multiline `$ \\begin{cases} $` is display math',
    modelId: 'openai/gpt-5',
    promptName: '05-complex-scenarios',
    sourceJson: 'rendering-harness/runs/2026-11-08-12/openai_gpt-5_05-complex-scenarios.json',
    startRe: '^## Scenario 4: Horizontal Rules',
  },
  {
    bug: 27,
    id: '27-indented-align',
    title: 'indented align continuation is not a leaked __CODE_BLOCK__',
    modelId: 'z-ai/glm-5.3',
    promptName: '06-edge-cases-boundaries',
    sourceJson: 'rendering-harness/runs/2026-11-08-13/z-ai_glm-5.3_06-edge-cases-boundaries.json',
    startRe: '^## 7\\. Additional Stress Cases',
  },
  {
    bug: 28,
    id: '28-row-skip',
    title: 'array row-skip \\[6pt] is not a display-math delimiter',
    modelId: 'openai/o3',
    promptName: '01-math-basics',
    sourceJson: 'rendering-harness/runs/2026-11-08-15/openai_o3_01-math-basics.json',
    startRe: '.',
  },
  {
    bug: 29,
    id: '29-empty-delimiter-labels',
    title: 'parenthesized ($$) labels are not math',
    modelId: 'x-ai/grok-4.3',
    promptName: '06-edge-cases-boundaries',
    sourceJson:
      'rendering-harness/runs/2026-11-08-21-incomplete/x-ai_grok-4.3_06-edge-cases-boundaries.json',
    startRe: 'Math Delimiters',
    stopRe: 'Nested Structures',
  },
]
