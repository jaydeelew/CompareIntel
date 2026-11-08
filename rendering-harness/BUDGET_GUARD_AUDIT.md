# Budget Guard

Production logic lives in `budget-guard.ts`, `durable-spend.ts`, and `paid-call.ts`. Tests import those modules and do not copy the formulas.

## Reserve (dry-run and live)

Same formula for preflight and runtime:

`1.25 * ((UTF-8 prompt bytes + 32) * maxInputRate + completionCap * maxOutputRate)`

- Max rates are max(catalog, applicable overrides, exact-model historical/new observations).
- The completion cap includes **visible + reasoning once**. OpenRouter Chat `max_tokens` / `max_completion_tokens` share that combined budget on most providers ([reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)).
- `THINKING_MODEL_OUTPUT_MULTIPLIER = 3` is an optional contingency only. It is **not** applied to dry-run or live reserves and is **not** additional reasoning billing. Do not multiply `usage.cost` or `completion_tokens` by 3.
- This is an estimate, not a provider hard billing cap (`BUDGET_GUARD_IS_HARD_CAP = false`).

Dry-run previously used a token estimate × 3 for thinking models (~$0.012788 on 500 in / 2048 cap at 1e-6/2e-6). Live `SharedCostGuard.reserve` used cap-once + 25% (~$0.00766 on 2000 UTF-8 chars + 32 pad). Those paths now share the live formula.

## Durable unknown spend

Global state: `rendering-harness/guard-global-state.json` (not per-batch).

- Two historical unknowns remain `actualCost: null` and `resolution: null`: Grok 4.3 prompt 03 (502) and Tencent HY4 prompt 06 (timeout). They are not $0, not estimated, and not acknowledged.
- `observe` / `markUnknown` **persist that record before throw**. A caught error, restart, or new batch ID still fail-closed.
- `beginRequest` persists pending intent under an exclusive lock **before** any completion POST. An interrupted pending request blocks all batch IDs until explicitly reconciled.
- Atomic write: exclusive temp file, write, fsync(file), rename, fsync(directory). A failed transaction keeps the `.lock` directory. Constructor/gate fail closed on lock, missing, or corrupt state. No silent creation of fresh empty state.
- There is **no** reset/acknowledge helper. Resumption requires explicit Jack approval recorded on each unknown without falsifying `actualCost`, plus a separate narrowly scoped paid release.
- Known zero `usage.cost` is valid.

## Other rules

1. Unknown catalog pricing is refused. No $1/1M fallback.
2. A refused or fail-closed request does not increment known spend.
3. Paid collection remains paused independently of this guard. This patch does not release 20c.
