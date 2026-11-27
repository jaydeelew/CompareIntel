/**
 * Help Me Choose - Model recommendations by use case
 *
 * Categories are displayed horizontally. Each category lists models ordered
 * ranked by benchmark score based on published benchmarks. Models may appear in multiple
 * categories; users select individual models.
 *
 * Inclusion rule: Only models with numeric benchmark scores from well-respected,
 * publicly available sources (LMArena leaderboards, VALS LegalBench, SWE-Bench Pro
 * public as a coding fallback, OpenRouter prices, LMSpeed) are included.
 * Models without benchmark scores are not added. Ranked model IDs
 * must exist in the active lineup (models_registry.json models_by_provider).
 *
 * Evidence format: Each entry includes the source (benchmark/reference) and
 * score. See /help-me-choose-methodology for full methodology.
 */

export interface HelpMeChooseModelEntry {
  /** Model ID matching backend models registry */
  modelId: string
  /** Evidence/citation for tooltip (benchmark name, score, source URL) */
  evidence: string
}

export interface HelpMeChooseCategory {
  id: string
  label: string
  description: string
  /** Models ordered best-first based on benchmarks */
  models: HelpMeChooseModelEntry[]
  /** Optional tooltip for category-level info icon (e.g. how cost-effective or fast differs) */
  categoryInfoTooltip?: string
}

/**
 * Categories displayed left-to-right. Order within each category: best model
 * first, descending by benchmark score. Only models with numeric benchmark
 * evidence are included.
 */
/**
 * EDITING: When adding or updating models, edit ONLY the array below (after "= [").
 * The declaration must stay as: HelpMeChooseCategory[] = [
 * Do NOT add a duplicate block or put content between the type and "= [".
 */
export const HELP_ME_CHOOSE_CATEGORIES: HelpMeChooseCategory[] = [
  {
    id: 'cost-effective',
    label: 'Best value',
    description: 'Lowest cost per 1M tokens for high-volume use (under $1/1M)',
    categoryInfoTooltip:
      'Ranked by average OpenRouter price per 1M tokens (prompt and completion). Only models under $1/1M are listed. Lower is better.',
    models: [
      { modelId: 'tencent/hy4-flash', evidence: 'Avg. $0.09/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'microsoft/phi-4', evidence: 'Avg. $0.11/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence: 'Avg. $0.14/1M tokens. Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-small-3.2-24b-instruct',
        evidence: 'Avg. $0.14/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'openai/gpt-oss-120b', evidence: 'Avg. $0.15/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'google/gemma-4-26b-a4b-it',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-4-scout',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence: 'Avg. $0.20/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'xiaomi/mimo-v2.6-flash', evidence: 'Avg. $0.21/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'openai/gpt-5-nano', evidence: 'Avg. $0.22/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'google/gemma-4-31b-it', evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'openai/gpt-6-luna', evidence: 'Avg. $0.30/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'deepseek/deepseek-v3.2', evidence: 'Avg. $0.32/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'z-ai/glm-5.3-flash', evidence: 'Avg. $0.33/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'minimax/minimax-m3.1-flash',
        evidence: 'Avg. $0.38/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'openai/gpt-4o-mini', evidence: 'Avg. $0.38/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'qwen/qwen3-coder-next', evidence: 'Avg. $0.46/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'qwen/qwen3-coder-flash', evidence: 'Avg. $0.58/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'mistralai/codestral-2508',
        evidence: 'Avg. $0.60/1M tokens. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence: 'Avg. $0.60/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'qwen/qwen3-coder', evidence: 'Avg. $0.65/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'xiaomi/mimo-v2.6-pro', evidence: 'Avg. $0.65/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence: 'Avg. $0.68/1M tokens. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence: 'Avg. $0.69/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'z-ai/glm-5.3', evidence: 'Avg. $0.73/1M tokens. Fetched 2026-11-27.' },
      {
        modelId: 'deepseek/deepseek-v4.1-flash-1017',
        evidence: 'Avg. $0.75/1M tokens. Fetched 2026-11-27.',
      },
      { modelId: 'minimax/minimax-m2.5', evidence: 'Avg. $0.75/1M tokens. Fetched 2026-11-27.' },
      { modelId: 'tencent/hy4', evidence: 'Avg. $0.83/1M tokens. Fetched 2026-11-27.' },
    ],
  },
  {
    id: 'fast',
    label: 'Fastest responses',
    description: 'Highest throughput (tokens per second)',
    categoryInfoTooltip:
      'Ranked by output tokens per second from LMSpeed (lmspeed.net/leaderboard/model-speed). Higher is faster. Speed varies by provider and load.',
    models: [
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence: 'LMSpeed (lmspeed.net): 235 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence: 'LMSpeed (lmspeed.net): 223 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence: 'LMSpeed (lmspeed.net): 176 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence: 'LMSpeed (lmspeed.net): 165 t/s. Fetched 2026-11-27.',
      },
      { modelId: 'openai/o3', evidence: 'LMSpeed (lmspeed.net): 136 t/s. Fetched 2026-11-27.' },
      {
        modelId: 'stepfun/step-5-preview',
        evidence: 'LMSpeed (lmspeed.net): 134 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence: 'LMSpeed (lmspeed.net): 133 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence: 'LMSpeed (lmspeed.net): 129 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence: 'LMSpeed (lmspeed.net): 120 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence: 'LMSpeed (lmspeed.net): 115 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence: 'LMSpeed (lmspeed.net): 96 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-4-scout',
        evidence: 'LMSpeed (lmspeed.net): 91 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-carbon',
        evidence: 'LMSpeed (lmspeed.net): 89 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.3-codex',
        evidence: 'LMSpeed (lmspeed.net): 85 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence: 'LMSpeed (lmspeed.net): 83 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence: 'LMSpeed (lmspeed.net): 82 t/s. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder-next',
        evidence: 'LMSpeed (lmspeed.net): 80 t/s. Fetched 2026-11-27.',
      },
      { modelId: 'z-ai/glm-5.3', evidence: 'LMSpeed (lmspeed.net): 73 t/s. Fetched 2026-11-27.' },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence: 'LMSpeed (lmspeed.net): 63 t/s. Fetched 2026-11-27.',
      },
      { modelId: 'x-ai/grok-4.7', evidence: 'LMSpeed (lmspeed.net): 62 t/s. Fetched 2026-11-27.' },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence: 'LMSpeed (lmspeed.net): 58 t/s. Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'coding',
    label: 'Best for coding',
    description: 'Code generation, debugging, refactoring',
    categoryInfoTooltip:
      'Ranked by percentile within each board so scores from different benchmarks are not compared directly. Primary: LMArena Code Arena (webdev, human preference, arena.ai). Fallback for models missing there: SWE-Bench Pro public (Scale Labs). The note names the board the score came from.',
    models: [
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Percentile 100.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1822 (published 2026-11-23, 2159 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Percentile 99.4% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1820 (published 2026-11-23, 5121 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Percentile 98.8% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1773 (published 2026-11-23, 6973 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Percentile 98.1% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1769 (published 2026-11-23, 2091 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Percentile 97.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1765 (published 2026-11-23, 2308 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Percentile 96.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1761 (published 2026-11-23, 2170 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Percentile 95.7% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1755 (published 2026-11-23, 2336 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen4-max',
        evidence:
          'Percentile 95.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1752 (published 2026-11-23, 1794 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Percentile 91.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1701 (published 2026-11-23, 2012 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Percentile 91.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1692 (published 2026-11-23, 19435 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Percentile 90.7% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1686 (published 2026-11-23, 5462 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Percentile 90.1% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1683 (published 2026-11-23, 6207 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Percentile 89.4% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1682 (published 2026-11-23, 6227 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.8-max-0902',
        evidence:
          'Percentile 88.2% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1673 (published 2026-11-23, 26061 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4.1-flash-1017',
        evidence:
          'Percentile 87.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1659 (published 2026-11-23, 18638 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Percentile 86.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1658 (published 2026-11-23, 23561 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Percentile 85.1% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1652 (published 2026-11-23, 13627 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'tencent/hy4',
        evidence:
          'Percentile 84.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1650 (published 2026-11-23, 2909 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Percentile 82.6% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1639 (published 2026-11-23, 9526 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Percentile 82.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1637 (published 2026-11-23, 10215 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Percentile 79.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1623 (published 2026-11-23, 13948 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Percentile 78.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1622 (published 2026-11-23, 10521 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Percentile 75.8% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1611 (published 2026-11-23, 25005 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Percentile 73.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1607 (published 2026-11-23, 17818 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Percentile 73.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1595 (published 2026-11-23, 8776 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Percentile 71.4% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1584 (published 2026-11-23, 15356 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Percentile 70.8% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1582 (published 2026-11-23, 4798 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m3.1-flash',
        evidence:
          'Percentile 70.2% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1582 (published 2026-11-23, 6187 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Percentile 69.6% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1581 (published 2026-11-23, 4592 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Percentile 68.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1579 (published 2026-11-23, 32623 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Percentile 68.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1572 (published 2026-11-23, 2950 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Percentile 67.7% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1570 (published 2026-11-23, 8315 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Percentile 66.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1557 (published 2026-11-23, 17544 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Percentile 65.2% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1556 (published 2026-11-23, 17912 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Percentile 64.6% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1552 (published 2026-11-23, 10737 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Percentile 64.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1546 (published 2026-11-23, 19016 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Percentile 62.1% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1538 (published 2026-11-23, 8454 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Percentile 59.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1522 (published 2026-11-23, 22515 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Percentile 55.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1513 (published 2026-11-23, 15339 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Percentile 55.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1509 (published 2026-11-23, 9993 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Percentile 46.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1462 (published 2026-11-23, 1336 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Percentile 38.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1435 (published 2026-11-23, 7429 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Percentile 36.6% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1419 (published 2026-11-23, 1074 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Percentile 36.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1418 (published 2026-11-23, 3076 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.3-codex',
        evidence:
          'Percentile 34.2% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1406 (published 2026-11-23, 2630 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Percentile 32.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1400 (published 2026-11-23, 20805 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Percentile 28.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1386 (published 2026-11-23, 7588 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Percentile 26.3% within this board. SWE-Bench Pro public (Scale Labs): 16.20%. Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Percentile 23.0% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1363 (published 2026-11-23, 6870 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Percentile 20.5% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1357 (published 2026-11-23, 14652 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Percentile 14.9% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1330 (published 2026-11-23, 28706 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Percentile 11.2% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1274 (published 2026-11-23, 12630 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.1-codex-mini',
        evidence:
          'Percentile 6.8% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1243 (published 2026-11-23, 1135 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence:
          'Percentile 5.3% within this board. SWE-Bench Pro public (Scale Labs): 5.24%. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Percentile 4.3% within this board. Code Arena (LMArena webdev overall, arena.ai): Arena Score 1226 (published 2026-11-23, 2705 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Best for writing',
    description: 'Prose, tone, character consistency',
    categoryInfoTooltip:
      'Ranked by LMArena Creative Writing Arena Score (style-controlled text, human preference). Higher is better.',
    models: [
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1525 (published 2026-11-22, 1254 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1521 (published 2026-11-22, 6772 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 4561 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 1006 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1504 (published 2026-11-22, 1226 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 15560 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1492 (published 2026-11-22, 1025 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1490 (published 2026-11-22, 17288 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1489 (published 2026-11-22, 11536 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1473 (published 2026-11-22, 8113 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1471 (published 2026-11-22, 7341 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1471 (published 2026-11-22, 963 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1470 (published 2026-11-22, 12498 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1470 (published 2026-11-22, 7006 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 4128 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 9370 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1455 (published 2026-11-22, 8069 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1454 (published 2026-11-22, 4270 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 802 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 8042 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 10821 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 1613 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1450 (published 2026-11-22, 1991 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1449 (published 2026-11-22, 12116 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1447 (published 2026-11-22, 4799 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1446 (published 2026-11-22, 9540 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1443 (published 2026-11-22, 17552 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1440 (published 2026-11-22, 10926 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1437 (published 2026-11-22, 12384 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1436 (published 2026-11-22, 1117 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 6188 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 5549 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1422 (published 2026-11-22, 12901 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1421 (published 2026-11-22, 6068 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1415 (published 2026-11-22, 2633 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1411 (published 2026-11-22, 8493 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1409 (published 2026-11-22, 27215 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1408 (published 2026-11-22, 1657 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1406 (published 2026-11-22, 17400 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1395 (published 2026-11-22, 6478 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Creative Writing (LMArena text, arena.ai): Arena Score 1394 (published 2026-11-22, 17516 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'images',
    label: 'Best for vision',
    description: 'Image understanding — photos, diagrams, screenshots, charts',
    categoryInfoTooltip:
      'Ranked by LMArena Vision Arena Score (style-controlled, human preference on image and text prompts). Higher is better.',
    models: [
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Vision Arena (lmarena.ai): 1302 (published 2026-11-25, 1776 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Vision Arena (lmarena.ai): 1299 (published 2026-11-25, 25450 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Vision Arena (lmarena.ai): 1298 (published 2026-11-25, 22041 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Vision Arena (lmarena.ai): 1292 (published 2026-11-25, 6457 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Vision Arena (lmarena.ai): 1292 (published 2026-11-25, 10812 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Vision Arena (lmarena.ai): 1290 (published 2026-11-25, 10812 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Vision Arena (lmarena.ai): 1285 (published 2026-11-25, 18104 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Vision Arena (lmarena.ai): 1285 (published 2026-11-25, 19202 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Vision Arena (lmarena.ai): 1285 (published 2026-11-25, 29897 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Vision Arena (lmarena.ai): 1282 (published 2026-11-25, 31848 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Vision Arena (lmarena.ai): 1280 (published 2026-11-25, 13896 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Vision Arena (lmarena.ai): 1280 (published 2026-11-25, 10268 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Vision Arena (lmarena.ai): 1278 (published 2026-11-25, 16329 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Vision Arena (lmarena.ai): 1275 (published 2026-11-25, 27102 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Vision Arena (lmarena.ai): 1274 (published 2026-11-25, 38935 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Vision Arena (lmarena.ai): 1266 (published 2026-11-25, 3463 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Vision Arena (lmarena.ai): 1265 (published 2026-11-25, 16226 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Vision Arena (lmarena.ai): 1264 (published 2026-11-25, 5903 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Vision Arena (lmarena.ai): 1249 (published 2026-11-25, 8429 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Vision Arena (lmarena.ai): 1247 (published 2026-11-25, 88442 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Vision Arena (lmarena.ai): 1247 (published 2026-11-25, 1802 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Vision Arena (lmarena.ai): 1247 (published 2026-11-25, 4439 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Vision Arena (lmarena.ai): 1246 (published 2026-11-25, 10865 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Vision Arena (lmarena.ai): 1245 (published 2026-11-25, 33444 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Vision Arena (lmarena.ai): 1241 (published 2026-11-25, 29056 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Vision Arena (lmarena.ai): 1235 (published 2026-11-25, 8456 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Vision Arena (lmarena.ai): 1232 (published 2026-11-25, 4410 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Vision Arena (lmarena.ai): 1226 (published 2026-11-25, 39811 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Vision Arena (lmarena.ai): 1216 (published 2026-11-25, 59832 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Vision Arena (lmarena.ai): 1186 (published 2026-11-25, 28874 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Vision Arena (lmarena.ai): 1148 (published 2026-11-25, 3921 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'image-generation',
    label: 'Best for image generation',
    description: 'Text-to-image — create images from prompts',
    categoryInfoTooltip:
      'Ranked by LMArena Text-to-Image Arena Score (human preference). Higher is better.',
    models: [
      {
        modelId: 'openai/gpt-image-2.6-sunburst',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1412 (published 2026-11-20, 7168 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/mai-image-2.7',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1385 (published 2026-11-20, 4485 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-image-2.6-flare',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1376 (published 2026-11-20, 7042 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-nano-banana-2.1',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1305 (published 2026-11-20, 45471 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.1-flash-image',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1256 (published 2026-11-20, 87077 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3-pro-image',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1246 (published 2026-11-20, 184539 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'black-forest-labs/flux.2-max',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1161 (published 2026-11-20, 120318 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'black-forest-labs/flux.2-flex',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1156 (published 2026-11-20, 152760 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'black-forest-labs/flux.2-pro',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1153 (published 2026-11-20, 218735 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash-image',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1148 (published 2026-11-20, 893402 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'black-forest-labs/flux.2-klein-4b',
        evidence:
          'Text-to-Image Arena (lmarena.ai): 1070 (published 2026-11-20, 146946 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'math',
    label: 'Best for math',
    description: 'Arithmetic, algebra, competition math, multi-step problem solving',
    categoryInfoTooltip:
      'Ranked by LMArena math-prompt Arena Score (style-controlled text, human preference). This is not a contest-math exam. Higher is better.',
    models: [
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1537 (published 2026-11-22, 1486 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1530 (published 2026-11-22, 216 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1521 (published 2026-11-22, 3486 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 936 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 3832 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1516 (published 2026-11-22, 4304 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1509 (published 2026-11-22, 286 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1508 (published 2026-11-22, 2837 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1507 (published 2026-11-22, 246 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1504 (published 2026-11-22, 230 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1504 (published 2026-11-22, 3234 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1503 (published 2026-11-22, 1517 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 1701 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 2062 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1499 (published 2026-11-22, 3430 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 1497 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 810 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1493 (published 2026-11-22, 2920 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1491 (published 2026-11-22, 3346 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 2408 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1485 (published 2026-11-22, 330 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1483 (published 2026-11-22, 212 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1483 (published 2026-11-22, 244 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1479 (published 2026-11-22, 2045 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1475 (published 2026-11-22, 603 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1474 (published 2026-11-22, 424 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1470 (published 2026-11-22, 1733 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1465 (published 2026-11-22, 2683 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 3728 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1460 (published 2026-11-22, 1466 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1456 (published 2026-11-22, 3096 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 5336 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1450 (published 2026-11-22, 920 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1450 (published 2026-11-22, 6358 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1447 (published 2026-11-22, 531 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1443 (published 2026-11-22, 1271 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1443 (published 2026-11-22, 1676 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1441 (published 2026-11-22, 2590 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1439 (published 2026-11-22, 7755 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1435 (published 2026-11-22, 1853 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1429 (published 2026-11-22, 2608 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1419 (published 2026-11-22, 3343 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1416 (published 2026-11-22, 6015 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1413 (published 2026-11-22, 1197 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1407 (published 2026-11-22, 1445 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1405 (published 2026-11-22, 7953 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1402 (published 2026-11-22, 8535 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1392 (published 2026-11-22, 2517 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1381 (published 2026-11-22, 1776 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1375 (published 2026-11-22, 1605 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1348 (published 2026-11-22, 492 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1296 (published 2026-11-22, 5774 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1265 (published 2026-11-22, 2764 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'cohere/command-a',
        evidence:
          'Math (LMArena text, arena.ai): Arena Score 1215 (published 2026-11-22, 9769 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'reasoning',
    label: 'Best for reasoning',
    description: 'Math, logic, multi-step problem solving',
    categoryInfoTooltip:
      'Ranked by LMArena hard-prompts Arena Score (style-controlled text, human preference). Higher is better.',
    models: [
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1547 (published 2026-11-22, 2658 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1545 (published 2026-11-22, 18346 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1541 (published 2026-11-22, 3545 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1530 (published 2026-11-22, 11906 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1530 (published 2026-11-22, 53449 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1525 (published 2026-11-22, 42887 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 49069 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 20077 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1516 (published 2026-11-22, 3462 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1516 (published 2026-11-22, 28692 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1515 (published 2026-11-22, 47639 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1513 (published 2026-11-22, 41695 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1512 (published 2026-11-22, 3006 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1506 (published 2026-11-22, 22178 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1506 (published 2026-11-22, 2611 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1503 (published 2026-11-22, 45420 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 36417 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 44586 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 23525 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1500 (published 2026-11-22, 4545 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 5499 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1497 (published 2026-11-22, 22570 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1496 (published 2026-11-22, 34903 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1496 (published 2026-11-22, 41507 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1496 (published 2026-11-22, 11014 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 25998 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1486 (published 2026-11-22, 25636 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1481 (published 2026-11-22, 6339 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1479 (published 2026-11-22, 3419 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1478 (published 2026-11-22, 3184 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1478 (published 2026-11-22, 17977 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1478 (published 2026-11-22, 7726 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1472 (published 2026-11-22, 18680 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1465 (published 2026-11-22, 16277 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1465 (published 2026-11-22, 75066 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1463 (published 2026-11-22, 64043 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1459 (published 2026-11-22, 34171 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1458 (published 2026-11-22, 65483 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1456 (published 2026-11-22, 46673 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1456 (published 2026-11-22, 6882 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1448 (published 2026-11-22, 15144 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1447 (published 2026-11-22, 26852 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1447 (published 2026-11-22, 53157 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1447 (published 2026-11-22, 11759 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1441 (published 2026-11-22, 94741 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1420 (published 2026-11-22, 11946 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1419 (published 2026-11-22, 64719 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1418 (published 2026-11-22, 26559 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1413 (published 2026-11-22, 11505 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1404 (published 2026-11-22, 12807 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1362 (published 2026-11-22, 14633 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1356 (published 2026-11-22, 3772 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1321 (published 2026-11-22, 16956 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1278 (published 2026-11-22, 5747 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'cohere/command-a',
        evidence:
          'Hard prompts (LMArena text, arena.ai): Arena Score 1252 (published 2026-11-22, 22394 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'long-context',
    label: 'Best for long context',
    description: 'Large context windows (128K–1M+ tokens)',
    categoryInfoTooltip:
      'Ranked by percentile within each board. Primary: LMArena Document Arena. Models missing from that snapshot are filled from the LMArena longer-query category. These are human preference scores, not a 1M-token recall exam. The note names the board.',
    models: [
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Percentile 100.0% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1541 (published 2026-11-22, 12722 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Percentile 99.8% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1538 (published 2026-11-22, 1852 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Percentile 99.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1522 (published 2026-11-22, 2397 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Percentile 98.8% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1521 (published 2026-11-22, 8252 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Percentile 98.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1516 (published 2026-11-22, 2283 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Percentile 97.8% within this board. Document Arena (LMArena, arena.ai): Arena Score 1509 (published 2026-11-09, 16189 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Percentile 97.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1511 (published 2026-11-22, 2067 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Percentile 95.6% within this board. Document Arena (LMArena, arena.ai): Arena Score 1508 (published 2026-11-09, 29456 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Percentile 95.5% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1500 (published 2026-11-22, 19334 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Percentile 94.8% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 1639 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Percentile 92.1% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1489 (published 2026-11-22, 15767 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Percentile 91.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1486 (published 2026-11-22, 7609 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Percentile 91.1% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1486 (published 2026-11-22, 24334 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Percentile 89.6% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1484 (published 2026-11-22, 3032 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Percentile 89.4% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1483 (published 2026-11-22, 3814 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Percentile 88.9% within this board. Document Arena (LMArena, arena.ai): Arena Score 1496 (published 2026-11-09, 23327 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Percentile 88.6% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1482 (published 2026-11-22, 25015 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Percentile 85.9% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1477 (published 2026-11-22, 2207 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Percentile 84.7% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1474 (published 2026-11-22, 4415 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Percentile 84.4% within this board. Document Arena (LMArena, arena.ai): Arena Score 1484 (published 2026-11-09, 27324 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Percentile 82.9% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1468 (published 2026-11-22, 10944 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Percentile 82.2% within this board. Document Arena (LMArena, arena.ai): Arena Score 1482 (published 2026-11-09, 6950 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Percentile 82.2% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1466 (published 2026-11-22, 2386 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Percentile 80.0% within this board. Document Arena (LMArena, arena.ai): Arena Score 1482 (published 2026-11-09, 61055 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Percentile 80.0% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1462 (published 2026-11-22, 5195 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Percentile 78.7% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1457 (published 2026-11-22, 12468 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Percentile 78.0% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1456 (published 2026-11-22, 11134 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Percentile 77.5% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1453 (published 2026-11-22, 42650 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Percentile 76.0% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1450 (published 2026-11-22, 51987 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Percentile 75.7% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1449 (published 2026-11-22, 22976 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Percentile 73.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1443 (published 2026-11-22, 32331 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Percentile 71.5% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1442 (published 2026-11-22, 11602 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Percentile 71.1% within this board. Document Arena (LMArena, arena.ai): Arena Score 1475 (published 2026-11-09, 12069 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Percentile 69.1% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1435 (published 2026-11-22, 6806 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Percentile 68.9% within this board. Document Arena (LMArena, arena.ai): Arena Score 1473 (published 2026-11-09, 35183 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Percentile 67.6% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1433 (published 2026-11-22, 26857 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Percentile 66.7% within this board. Document Arena (LMArena, arena.ai): Arena Score 1473 (published 2026-11-09, 7205 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Percentile 65.6% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1428 (published 2026-11-22, 4786 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Percentile 61.4% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1417 (published 2026-11-22, 33007 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Percentile 60.9% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1416 (published 2026-11-22, 8337 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Percentile 58.2% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1408 (published 2026-11-22, 4920 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Percentile 57.2% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1406 (published 2026-11-22, 16034 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Percentile 52.5% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1389 (published 2026-11-22, 5368 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Percentile 48.3% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1371 (published 2026-11-22, 5871 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Percentile 46.7% within this board. Document Arena (LMArena, arena.ai): Arena Score 1456 (published 2026-11-09, 3031 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Percentile 42.2% within this board. Document Arena (LMArena, arena.ai): Arena Score 1451 (published 2026-11-09, 7447 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Percentile 40.0% within this board. Document Arena (LMArena, arena.ai): Arena Score 1450 (published 2026-11-09, 11809 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Percentile 35.9% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1333 (published 2026-11-22, 1623 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Percentile 32.4% within this board. Longer queries (LMArena text, arena.ai): Arena Score 1324 (published 2026-11-22, 6533 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'multilingual',
    label: 'Best for multilingual',
    description: 'Non-English languages, translation, cross-lingual understanding',
    categoryInfoTooltip:
      'Ranked by LMArena non-English Arena Score (style-controlled text, human preference across non-English prompts). Higher is better.',
    models: [
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1518 (published 2026-11-22, 2764 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1512 (published 2026-11-22, 18277 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1509 (published 2026-11-22, 3740 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1496 (published 2026-11-22, 3893 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1496 (published 2026-11-22, 12075 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1490 (published 2026-11-22, 34335 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1489 (published 2026-11-22, 47444 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 47399 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1487 (published 2026-11-22, 19398 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1480 (published 2026-11-22, 3108 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1480 (published 2026-11-22, 43781 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1477 (published 2026-11-22, 28506 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1473 (published 2026-11-22, 37087 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1472 (published 2026-11-22, 20378 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1470 (published 2026-11-22, 35323 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1468 (published 2026-11-22, 21695 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1467 (published 2026-11-22, 34972 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1467 (published 2026-11-22, 5074 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1464 (published 2026-11-22, 37088 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1463 (published 2026-11-22, 19845 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1463 (published 2026-11-22, 2550 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1462 (published 2026-11-22, 32007 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 5924 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1457 (published 2026-11-22, 11258 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1457 (published 2026-11-22, 38324 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1455 (published 2026-11-22, 23082 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1454 (published 2026-11-22, 3476 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 3684 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1449 (published 2026-11-22, 21500 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1446 (published 2026-11-22, 5853 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1439 (published 2026-11-22, 16167 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1437 (published 2026-11-22, 70831 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 16415 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 54780 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 75649 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1432 (published 2026-11-22, 7917 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1428 (published 2026-11-22, 19810 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1428 (published 2026-11-22, 37736 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1425 (published 2026-11-22, 18042 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1424 (published 2026-11-22, 28311 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1410 (published 2026-11-22, 56674 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1409 (published 2026-11-22, 6988 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1408 (published 2026-11-22, 28257 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1406 (published 2026-11-22, 11675 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1399 (published 2026-11-22, 70362 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1394 (published 2026-11-22, 87378 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1385 (published 2026-11-22, 12929 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1378 (published 2026-11-22, 15242 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1371 (published 2026-11-22, 14175 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1369 (published 2026-11-22, 23796 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1337 (published 2026-11-22, 17082 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1328 (published 2026-11-22, 4540 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1284 (published 2026-11-22, 25225 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'cohere/command-a',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1246 (published 2026-11-22, 35178 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence:
          'Non-English (LMArena text, arena.ai): Arena Score 1233 (published 2026-11-22, 10025 votes). Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'legal',
    label: 'Best for legal',
    description: 'Legal reasoning, contract analysis, statutory interpretation',
    categoryInfoTooltip:
      'Ranked by percentile within each board. Primary: VALS LegalBench (legal tasks). Models missing there are filled from LMArena legal and government prompts. The note names the board and the raw score.',
    models: [
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Percentile 99.7% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1525 (published 2026-11-22, 281 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Percentile 99.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1513 (published 2026-11-22, 1518 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Percentile 98.7% within this board. LegalBench (vals.ai): 88.3%. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Percentile 97.7% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1506 (published 2026-11-22, 380 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Percentile 97.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1504 (published 2026-11-22, 473 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Percentile 95.3% within this board. LegalBench (vals.ai): 86.99%. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Percentile 95.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1499 (published 2026-11-22, 2525 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Percentile 94.0% within this board. LegalBench (vals.ai): 86.97%. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Percentile 93.7% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1497 (published 2026-11-22, 448 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Percentile 92.7% within this board. LegalBench (vals.ai): 86.7%. Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Percentile 92.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1491 (published 2026-11-22, 524 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Percentile 92.0% within this board. LegalBench (vals.ai): 86.52%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Percentile 91.9% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1491 (published 2026-11-22, 669 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Percentile 90.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1483 (published 2026-11-22, 372 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Percentile 90.0% within this board. LegalBench (vals.ai): 86.21%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Percentile 89.3% within this board. LegalBench (vals.ai): 86.04%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Percentile 88.7% within this board. LegalBench (vals.ai): 86.02%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Percentile 88.7% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1481 (published 2026-11-22, 386 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Percentile 88.0% within this board. LegalBench (vals.ai): 85.97%. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Percentile 87.4% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1478 (published 2026-11-22, 1389 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Percentile 86.0% within this board. LegalBench (vals.ai): 85.3%. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Percentile 84.7% within this board. LegalBench (vals.ai): 85.25%. Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Percentile 83.4% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1469 (published 2026-11-22, 324 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Percentile 81.3% within this board. LegalBench (vals.ai): 84.84%. Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Percentile 80.7% within this board. LegalBench (vals.ai): 84.74%. Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Percentile 79.3% within this board. LegalBench (vals.ai): 84.46%. Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Percentile 78.0% within this board. LegalBench (vals.ai): 84.39%. Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Percentile 77.6% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1458 (published 2026-11-22, 4014 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Percentile 77.3% within this board. LegalBench (vals.ai): 84.32%. Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Percentile 73.3% within this board. LegalBench (vals.ai): 84.07%. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Percentile 73.3% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1448 (published 2026-11-22, 7446 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Percentile 72.7% within this board. LegalBench (vals.ai): 84.06%. Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Percentile 72.3% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1445 (published 2026-11-22, 987 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Percentile 72.0% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1445 (published 2026-11-22, 9617 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Percentile 71.8% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1444 (published 2026-11-22, 744 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Percentile 70.8% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1443 (published 2026-11-22, 2363 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Percentile 70.7% within this board. LegalBench (vals.ai): 83.93%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/o3',
        evidence:
          'Percentile 67.3% within this board. LegalBench (vals.ai): 83.76%. Fetched 2026-11-27.',
      },
      {
        modelId: 'tencent/hy4',
        evidence:
          'Percentile 67.3% within this board. LegalBench (vals.ai): 83.76%. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Percentile 67.3% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1433 (published 2026-11-22, 6574 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Percentile 65.3% within this board. LegalBench (vals.ai): 83.57%. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Percentile 60.5% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1416 (published 2026-11-22, 1436 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Percentile 58.4% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1408 (published 2026-11-22, 1411 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Percentile 56.7% within this board. LegalBench (vals.ai): 82.76%. Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Percentile 56.0% within this board. LegalBench (vals.ai): 82.63%. Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Percentile 55.7% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1400 (published 2026-11-22, 1558 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Percentile 50.7% within this board. LegalBench (vals.ai): 82.12%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Percentile 46.7% within this board. LegalBench (vals.ai): 81.77%. Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Percentile 45.3% within this board. LegalBench (vals.ai): 81.24%. Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Percentile 41.3% within this board. LegalBench (vals.ai): 80.32%. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence:
          'Percentile 38.3% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1343 (published 2026-11-22, 3154 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Percentile 38.0% within this board. LegalBench (vals.ai): 79.96%. Fetched 2026-11-27.',
      },
      {
        modelId: 'cohere/command-a',
        evidence:
          'Percentile 37.3% within this board. LegalBench (vals.ai): 79.7%. Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-4-maverick',
        evidence:
          'Percentile 28.7% within this board. LegalBench (vals.ai): 77.81%. Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.20',
        evidence:
          'Percentile 28.0% within this board. LegalBench (vals.ai): 77.74%. Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Percentile 24.7% within this board. LegalBench (vals.ai): 76.08%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Percentile 24.0% within this board. LegalBench (vals.ai): 75.94%. Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence:
          'Percentile 23.2% within this board. Legal and government prompts (LMArena text, arena.ai): Arena Score 1298 (published 2026-11-22, 1341 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-4-scout',
        evidence:
          'Percentile 20.7% within this board. LegalBench (vals.ai): 72.04%. Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Percentile 1.3% within this board. LegalBench (vals.ai): 50.13%. Fetched 2026-11-27.',
      },
    ],
  },
  {
    id: 'medical',
    label: 'Best for medical',
    description: 'Clinical knowledge, health information, medical reasoning',
    categoryInfoTooltip:
      'Ranked by LMArena medicine and healthcare prompt Arena Score (human preference). This is not a physician-graded HealthBench score. Higher is better.',
    models: [
      {
        modelId: 'google/gemini-4-argon',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1535 (published 2026-11-22, 1926 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-carbon',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1526 (published 2026-11-22, 270 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1517 (published 2026-11-22, 1267 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-neon',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1517 (published 2026-11-22, 341 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.7',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1517 (published 2026-11-22, 4853 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.6',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1516 (published 2026-11-22, 6272 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1513 (published 2026-11-22, 2668 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1512 (published 2026-11-22, 2993 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.8-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1506 (published 2026-11-22, 5283 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-fable-5.2',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1505 (published 2026-11-22, 403 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-opus-4.8',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1501 (published 2026-11-22, 4680 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1498 (published 2026-11-22, 2612 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta/muse-spark-1.3',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1497 (published 2026-11-22, 2064 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.2',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1497 (published 2026-11-22, 2569 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.2',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1493 (published 2026-11-22, 3941 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5.3-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1490 (published 2026-11-22, 3816 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-pro',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 252 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 2027 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-4.6',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1488 (published 2026-11-22, 5343 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-pro',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1485 (published 2026-11-22, 3786 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-3.6-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1481 (published 2026-11-22, 2484 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'z-ai/glm-5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1478 (published 2026-11-22, 2111 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.1-terra',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1476 (published 2026-11-22, 571 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-sonnet-5.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1475 (published 2026-11-22, 1222 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5.4',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1474 (published 2026-11-22, 4774 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v3.2',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1474 (published 2026-11-22, 441 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k2.6',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1472 (published 2026-11-22, 2884 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-pro',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1469 (published 2026-11-22, 7926 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-4-hydrogen',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1469 (published 2026-11-22, 301 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3.5-397b-a17b',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1467 (published 2026-11-22, 7230 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-sol',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1465 (published 2026-11-22, 306 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1462 (published 2026-11-22, 2848 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6.2-astra',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1462 (published 2026-11-22, 344 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'deepseek/deepseek-v4-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 3689 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'moonshotai/kimi-k3.1-pro',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 427 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.7',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1461 (published 2026-11-22, 1808 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'stepfun/step-5-preview',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1460 (published 2026-11-22, 851 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1460 (published 2026-11-22, 1777 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'xiaomi/mimo-v2.6-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1457 (published 2026-11-22, 1924 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-30b-a3b-instruct-2507',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1457 (published 2026-11-22, 5870 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'x-ai/grok-4.3',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1451 (published 2026-11-22, 5204 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-next-80b-a3b-instruct',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1440 (published 2026-11-22, 1179 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-6-luna',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1433 (published 2026-11-22, 8383 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'google/gemini-2.5-flash',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1428 (published 2026-11-22, 7835 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'mistralai/mistral-large-4-0',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1425 (published 2026-11-22, 679 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-4.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1425 (published 2026-11-22, 10355 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'anthropic/claude-haiku-5.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1418 (published 2026-11-22, 1214 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'qwen/qwen3-coder',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1409 (published 2026-11-22, 1483 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-mini',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1408 (published 2026-11-22, 1433 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'minimax/minimax-m2.5',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1407 (published 2026-11-22, 3190 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-oss-120b',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1367 (published 2026-11-22, 1623 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'openai/gpt-5-nano',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1366 (published 2026-11-22, 468 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'meta-llama/llama-3.3-70b-instruct',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1343 (published 2026-11-22, 2727 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'cohere/command-a',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1287 (published 2026-11-22, 4198 votes). Fetched 2026-11-27.',
      },
      {
        modelId: 'microsoft/phi-4',
        evidence:
          'Medicine and healthcare prompts (LMArena text, arena.ai): Arena Score 1273 (published 2026-11-22, 1037 votes). Fetched 2026-11-27.',
      },
    ],
  },
]

/** Stable `id` for the "Best for vision" column (scroll Help me choose horizontally to this category). */
export const HELP_ME_CHOOSE_CATEGORY_IMAGES_ID = 'images' as const

/** Stable `id` for the "Best for image generation" (text-to-image) column. */
export const HELP_ME_CHOOSE_CATEGORY_IMAGE_GENERATION_ID = 'image-generation' as const

/** @deprecated Use HELP_ME_CHOOSE_CATEGORIES. Flattened for backwards compatibility during migration. */
export interface HelpMeChooseRecommendation {
  id: string
  label: string
  description: string
  modelIds: string[]
}

/** @deprecated Flatten categories to legacy format for any code still using it. */
export const HELP_ME_CHOOSE_RECOMMENDATIONS: HelpMeChooseRecommendation[] =
  HELP_ME_CHOOSE_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.label,
    description: cat.description,
    modelIds: cat.models.map(m => m.modelId),
  }))
