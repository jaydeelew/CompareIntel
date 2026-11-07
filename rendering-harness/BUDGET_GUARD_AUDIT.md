# Budget Guard Implementation Audit

## Current Implementation

### Pre-Request Reservation (lines 940-975 in run-harness.ts)

```typescript
// Pre-request budget guard: Estimate cost and check against remaining budget
const estimatedPromptTokens = estimateTokens(promptText);
const estimatedOutputTokens = maxTokens * (model.is_thinking_model ? THINKING_MODEL_OUTPUT_MULTIPLIER : 1);
const modelPricing = pricing.get(model.id);

let estimatedRequestCost = 0;
if (modelPricing) {
  estimatedRequestCost = 
    (estimatedPromptTokens * modelPricing.inputCostPerToken) +
    (estimatedOutputTokens * modelPricing.outputCostPerToken);
} else {
  // Conservative fallback when pricing unavailable (assume $1 per 1M tokens)
  estimatedRequestCost = ((estimatedPromptTokens + estimatedOutputTokens) / 1_000_000);
  console.log(`⚠ No pricing data for ${model.id}, using conservative estimate`);
}

const remainingBudget = maxUsd - actualTotalCost;

if (estimatedRequestCost > remainingBudget) {
  console.log(`⚠ Skipping: Estimated cost $${estimatedRequestCost.toFixed(4)} exceeds remaining budget $${remainingBudget.toFixed(4)}`);
  // Skip request and continue
  continue;
}
```

## Actual Accounting (lines 975-980)

```typescript
const { response, usage, cost } = await callOpenRouter(model.id, promptText, maxTokens, pricing);
actualTotalCost += cost;
config.cumulativeCostUsd = actualTotalCost;
```

Where `cost` comes from:
```typescript
// Use OpenRouter's actual cost if provided, otherwise estimate from pricing
let cost = 0;
if (usage?.cost) {
  cost = usage.cost; // Actual billed cost from OpenRouter
} else if (usage && usage.prompt_tokens && usage.completion_tokens) {
  // Estimate from pricing map when cost not provided
  const modelPricing = pricing.get(modelId);
  if (modelPricing) {
    cost = (usage.prompt_tokens * modelPricing.inputCostPerToken) +
           (usage.completion_tokens * modelPricing.outputCostPerToken);
  }
}
```

## Analysis

### ✅ What Works

1. **Conservative fallback**: Uses $1/1M tokens when pricing unavailable (safe high-side estimate)
2. **Actual cost tracking**: Uses `usage.cost` from OpenRouter when available
3. **Per-request guard**: Checks budget before EACH request
4. **Cumulative tracking**: Updates `actualTotalCost` after each request
5. **Thinking model multiplier**: Accounts for 4x output token multiplier

### ⚠️ Limitations & Assumptions

#### 1. **NOT a Hard Billing Ceiling**
- **Assumption**: Pre-request estimates are accurate
- **Reality**: Actual cost can exceed estimate if:
  - Model returns more tokens than `maxTokens` requested
  - Pricing changes between fetch and request
  - Cached prompt tokens billed differently
  - Model-specific billing quirks

**Verdict**: This is a **best-effort guard**, NOT a hard billing limit.

#### 2. **No Concurrency Handling**
- **Issue**: Sequential execution only (loop with `await`)
- **Safe**: No race conditions because requests are serialized
- **Not safe for**: Parallel/concurrent execution (would need atomic reservations)

**Current code:**
```typescript
for (const model of selectedModels) {
  for (const [promptName, promptText] of prompts) {
    // Sequential - safe
    await callOpenRouter(...);
  }
}
```

#### 3. **Missing Price = Underestimate Risk**
- **Current**: Uses $1/1M tokens fallback
- **Risk**: Some models (e.g., expensive reasoning models) may exceed this
- **Example**: Claude Opus 5.5 is ~$15/$75 per 1M tokens
- **Mitigation**: Conservative estimate catches MOST models, but not all

#### 4. **Token Estimation Accuracy**
- **Method**: `Math.ceil(text.length / 4)` (rough heuristic)
- **Accuracy**: Within ~20-30% for most text
- **Risk**: Can underestimate for non-ASCII text (Chinese, emoji, etc.)

#### 5. **No Provider-Side Billing Cap**
- **OpenRouter**: No API-level hard cap enforcement
- **Result**: If estimate wrong, actual charge goes through
- **Recommendation**: Set OpenRouter account-level spending limits separately

### 🔍 Edge Cases

#### Case 1: Pricing Fetch Fails
**Scenario**: `fetchOpenRouterPricing()` throws error  
**Current behavior**: Harness crashes (no try/catch)  
**Fix needed**: Wrap in try/catch, fall back to all-conservative estimates

#### Case 2: Model Removed Mid-Run
**Scenario**: Model ID in registry but removed from OpenRouter  
**Current behavior**: API returns 404, harness logs error and continues  
**Budget impact**: None (request not charged)

#### Case 3: Actual Cost Exceeds Estimate by >50%
**Scenario**: Model returns 2x tokens vs requested  
**Current behavior**: Overspend undetected until next request  
**Impact**: Could exceed total budget by one request worth

#### Case 4: Thinking Model with No Multiplier
**Scenario**: `is_thinking_model` flag missing in registry  
**Current behavior**: Estimates 1x tokens instead of 4x  
**Impact**: Severe underestimate for o1/o3 models

## Recommendations

### Immediate (Low Effort)

1. **Wrap pricing fetch** in try/catch with all-conservative fallback:
```typescript
try {
  pricing = await fetchOpenRouterPricing();
} catch (error) {
  console.error('Failed to fetch pricing, using conservative estimates');
  // Use $10/1M token fallback for all models
}
```

2. **Add post-request overspend warning**:
```typescript
if (cost > estimatedRequestCost * 1.5) {
  console.warn(`⚠ Actual cost $${cost.toFixed(4)} exceeded estimate by ${((cost/estimatedRequestCost - 1) * 100).toFixed(0)}%`);
}
```

3. **Document assumption** in README and CLI help

### Medium (Moderate Effort)

4. **Pre-run total estimate** with abort before any requests:
```typescript
const totalEstimate = models.length * prompts.length * avgCostPerRequest;
if (totalEstimate > maxUsd) {
  throw new Error(`Estimated total $${totalEstimate} exceeds cap $${maxUsd}`);
}
```

5. **Add --dry-run-with-pricing** that fetches pricing and estimates without calling APIs

### Advanced (High Effort)

6. **Atomic reservations** for concurrent execution:
```typescript
const budgetLock = new Mutex();
await budgetLock.runExclusive(async () => {
  if (estimatedCost > remainingBudget) throw new Error('Budget exceeded');
  reserved += estimatedCost;
});
```

7. **Provider-side limits**: Document OpenRouter account-level spending limits as **required** for true hard cap

## Conclusion

### Is it a true bound?
**NO** - it's an assumption-based best-effort guard.

### Is it safe?
**YES, with caveats**:
- ✅ Safe for sequential execution with conservative estimates
- ✅ Prevents most overspend scenarios (estimated buffer works)
- ⚠️ Can exceed budget by up to 1 request worth (~$0.05-$0.50 typically)
- ❌ Not safe for parallel execution without locking
- ❌ No guarantee if pricing is stale/wrong

### Honest description:
"Pre-request budget reservation with conservative token estimation and actual cost tracking. Provides best-effort spending control but NOT a hard billing ceiling. Actual charges may exceed cap by one request due to estimation variance. Use OpenRouter account limits for true hard caps."

## Test Coverage Gaps

Current tests do NOT verify:
- [ ] Budget guard actually stops requests when limit approached
- [ ] Fallback pricing when fetch fails
- [ ] Overspend warning when actual > estimate
- [ ] Thinking model multiplier calculation

Recommended test:
```typescript
test('budget guard stops before exceeding limit', async () => {
  const config = { maxUsd: 0.10, actualCost: 0.08 };
  const estimate = 0.05; // Would exceed
  // Verify request is skipped
});
```
