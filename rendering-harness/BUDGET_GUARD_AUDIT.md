# Budget Guard

Production logic lives in `budget-guard.ts` and is imported by `run-harness.ts` and `budget-guard.test.ts`. Tests do not copy the formulas.

## Rules

1. **Unknown pricing is refused.** `estimateRequestCost` returns `null`; `preRequestBudgetDecision` returns `{ action: 'refuse' }`. There is no $1/1M fallback and no silent proceed.
2. **Unknowable actual cost throws.** `resolveActualCost` requires `usage.cost` or (`prompt_tokens` + `completion_tokens` and a pricing row). Missing usage or missing both cost and pricing throws, so spend is never guessed.
3. **A refused request does not increment spent**, so a later request cannot be charged against a fabricated remainder.
4. **Thinking models** reserve `maxTokens * 3` output tokens.

## Honest limits

This is still a best-effort pre-request estimate, not a provider hard cap:

- A model can emit more tokens than `max_tokens` in edge cases; the next request is blocked only after actual `usage.cost` is added.
- Sequential only. Parallel requests would race the remainder.
- Set an OpenRouter account limit for a true ceiling.

Paid catalog estimates for 83 text models × 6 prompts (not run in this PR): 512 / 1024 / 2048 billed output with ~500 input ≈ $3.43 / $6.34 / $12.18. Not approved spend.
