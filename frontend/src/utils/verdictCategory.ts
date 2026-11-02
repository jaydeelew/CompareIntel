/**
 * Map a comparison prompt to a Help Me Choose category with keyword matching.
 * No LLM. Unmatched prompts fall back to the generic Help Me Choose panel.
 */

import {
  HELP_ME_CHOOSE_CATEGORIES,
  type HelpMeChooseCategory,
} from '../data/helpMeChooseRecommendations'

export interface VerdictCategoryMatch {
  /** Category id when keywords match; null means the generic fallback */
  categoryId: string | null
  category: HelpMeChooseCategory | null
}

interface CategoryKeywordRule {
  id: string
  keywords: string[]
}

/**
 * More specific categories are listed first so equal hit counts prefer them.
 * Multi-word phrases are matched as substrings; single words use boundaries.
 */
const CATEGORY_KEYWORD_RULES: CategoryKeywordRule[] = [
  {
    id: 'coding',
    keywords: [
      'code',
      'coding',
      'programmer',
      'programming',
      'function',
      'python',
      'javascript',
      'typescript',
      'bug',
      'debug',
      'refactor',
      'compile',
      'regex',
      'algorithm',
      'leetcode',
      'sql',
    ],
  },
  {
    id: 'math',
    keywords: [
      'math',
      'calculate',
      'equation',
      'algebra',
      'integral',
      'derivative',
      'arithmetic',
      'geometry',
      'theorem',
    ],
  },
  {
    id: 'legal',
    keywords: ['legal', 'lawyer', 'contract', 'statute', 'clause', 'lawsuit', 'attorney', 'court'],
  },
  {
    id: 'medical',
    keywords: ['medical', 'clinical', 'diagnosis', 'symptom', 'patient', 'disease', 'treatment'],
  },
  {
    id: 'image-generation',
    keywords: [
      'generate an image',
      'generate image',
      'text-to-image',
      'draw a',
      'picture of',
      'create an image',
    ],
  },
  {
    id: 'images',
    keywords: ['photo', 'screenshot', 'diagram', 'chart', 'vision', 'image understanding'],
  },
  {
    id: 'writing',
    keywords: ['write', 'essay', 'story', 'poem', 'rewrite', 'prose', 'blog post', 'narrative'],
  },
  {
    id: 'multilingual',
    keywords: [
      'translate',
      'translation',
      'spanish',
      'french',
      'german',
      'chinese',
      'japanese',
      'multilingual',
    ],
  },
  {
    id: 'long-context',
    keywords: ['summarize this', 'long document', 'transcript', 'entire book', 'long context'],
  },
  {
    id: 'reasoning',
    keywords: ['reason through', 'logic puzzle', 'step by step', 'riddle'],
  },
  {
    id: 'fast',
    keywords: ['fastest', 'low latency', 'quick response'],
  },
  {
    id: 'cost-effective',
    keywords: ['cheap', 'cheapest', 'budget', 'cost effective', 'lowest cost'],
  },
]

function keywordHits(haystack: string, keyword: string): number {
  const needle = keyword.toLowerCase()
  if (needle.includes(' ')) {
    return haystack.includes(needle) ? 1 : 0
  }
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  return haystack.match(pattern)?.length ?? 0
}

export function mapPromptToHelpMeChooseCategory(prompt: string): VerdictCategoryMatch {
  const haystack = prompt.toLowerCase()
  if (!haystack.trim()) {
    return { categoryId: null, category: null }
  }

  let bestId: string | null = null
  let bestScore = 0
  for (const rule of CATEGORY_KEYWORD_RULES) {
    const score = rule.keywords.reduce((sum, keyword) => sum + keywordHits(haystack, keyword), 0)
    if (score > bestScore) {
      bestScore = score
      bestId = rule.id
    }
  }

  if (!bestId || bestScore === 0) {
    return { categoryId: null, category: null }
  }

  const category = HELP_ME_CHOOSE_CATEGORIES.find(item => item.id === bestId) ?? null
  if (!category) {
    return { categoryId: null, category: null }
  }
  return { categoryId: category.id, category }
}
