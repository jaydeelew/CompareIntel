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

## Budget is per-batch, not global remaining

`--max-usd` / `SharedCostGuard.budget` is the **approved remaining budget for that batch ID only**. Gate remaining is `budget - batches[batchId].knownActualUsd`. It is not `budget - knownActualUsd` (lifetime). A new batch still requires an explicit approved remaining budget on the command line. Global `knownActualUsd` is verified accounting only; it does not refill or auto-approve the next run.

Unknown/pending records **are** global and block every batch ID until explicit resolve/approve.

## Durable unknown spend

Global state: `rendering-harness/guard-global-state.json` (not per-batch).

- Two historical unknowns remain `actualCost: null` and `resolution: null`: Grok 4.3 prompt 03 (502) and Tencent HY4 prompt 06 (timeout). They are not $0, not estimated, and not acknowledged.
- `observe` / `markUnknown` **persist that record before throw**. A caught error, restart, or new batch ID still fail-closed.
- `beginRequest` persists pending intent under an exclusive lock **before** any completion POST. An interrupted pending request blocks all batch IDs until explicitly reconciled.
- Atomic write: exclusive temp file, write, fsync(file), rename, fsync(directory).
- Lock policy: a **logical/pre-write** mutate callback throw (duplicate settlement, unmatched pending) releases `.lock` because the original file was not written. An **IO/atomic** failure keeps `.lock` so later paid calls fail closed. Missing/corrupt state still fail closed. No silent creation of fresh empty state.
- There is **no** reset/acknowledge helper. Resumption requires explicit Jack approval recorded on each unknown without falsifying `actualCost`, plus a separate narrowly scoped paid release.
- Known zero `usage.cost` is valid.
- `usage.cost` is the only billed figure. There is no `resolveActualCost` catalog-token guess helper.

## Other rules

1. Unknown catalog pricing is refused. No $1/1M fallback.
2. A refused or fail-closed request does not increment known spend.
3. Paid collection remains paused independently of this guard. This patch does not release 20c.
