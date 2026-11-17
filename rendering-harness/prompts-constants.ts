export const PROMPTS = [
  '01-math-basics',
  '02-markdown-formatting',
  '03-code-blocks',
  '04-mixed-markdown-latex',
  '05-complex-scenarios',
  '06-edge-cases-boundaries',
  '07-rare-formats',
  '08-casual-prose',
] as const

export type PromptName = (typeof PROMPTS)[number]

/** Prompts with no saved grid yet; `not-covered` without a reply is allowed. */
export const COLLECTION_OPTIONAL_PROMPTS = new Set<PromptName>([
  '07-rare-formats',
  '08-casual-prose',
])