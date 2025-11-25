# Credit System Blocking Update

**Date:** January 2025  
**Status:** ✅ **FULLY IMPLEMENTED**  
**Version:** 2.0

---

## 🎯 Overview

This update modifies the credit system to remove pre-submission credit estimation and blocking, allowing comparisons to proceed regardless of credit balance. Credits are capped at the allocated amount (zeroed out instead of going negative), and users are blocked only after credits reach zero.

---

## 📋 Problem Statement

### Previous Behavior

- System estimated credits before submission
- Blocked submissions if estimated credits exceeded remaining credits
- Showed warnings and prevented comparisons when credits were insufficient
- Required complex estimation logic and frontend/backend coordination

### Issues with Previous Approach

- Estimation could be inaccurate, blocking valid comparisons
- Poor user experience with warnings and blocking
- Complex codebase with estimation endpoints and warning logic
- Users couldn't complete comparisons even if they had partial credits

### New Behavior

- **No pre-submission blocking** - comparisons proceed regardless of credit balance
- **Credit capping** - credits are zeroed out (capped at allocated amount) instead of going negative
- **Post-deduction blocking** - users are blocked only after credits reach zero
- **Simplified codebase** - removed estimation endpoint and all estimation logic
- **Partial failure handling** - if some models fail and others succeed, only successful models deduct credits based on actual token usage
- **Intelligent max_tokens reduction** - when credits per model are low (< 2 credits/model), reduces max_tokens proportionally while ensuring minimum usable response (300 tokens)

---

## 🔄 How It Works

### Flow Diagram

```
1. User submits comparison
   ↓
2. Backend processes comparison (NO credit check)
   ↓
3. Comparison completes successfully
   ↓
4. Credits are deducted:
   - If credits_remaining >= credits_needed: Normal deduction
   - If credits_remaining < credits_needed: Cap at allocated (zero out)
   ↓
5. Next request:
   - If credits_remaining == 0: BLOCKED with error message
   - If credits_remaining > 0: Allowed to proceed
```

### Example Scenarios

#### Scenario 1: Sufficient Credits

- **Allocated:** 100 credits
- **Used:** 30 credits
- **Remaining:** 70 credits
- **Comparison costs:** 5 credits
- **Result:** Normal deduction → 65 credits remaining

#### Scenario 2: Partial Credits (First Overage)

- **Allocated:** 100 credits
- **Used:** 98 credits
- **Remaining:** 2 credits
- **Comparison costs:** 5 credits
- **Result:** Credits capped at 100 → 0 credits remaining
- **Next request:** BLOCKED until reset

#### Scenario 3: Zero Credits (Subsequent Requests)

- **Allocated:** 100 credits
- **Used:** 100 credits (capped)
- **Remaining:** 0 credits
- **Comparison costs:** 5 credits
- **Result:** BLOCKED immediately with error message

---

## 🛠️ Implementation Details

### Backend Changes

#### 1. Modified Blocking Logic (`backend/app/routers/api.py`)

**Before:**

```python
# Block submission if credits are 0 or insufficient
if credits_remaining <= 0:
    raise HTTPException(status_code=402, detail="Insufficient credits")
```

**After:**

```python
# Block submission ONLY if credits are already at 0
# This allows one final comparison that zeros out credits
if credits_remaining == 0:
    raise HTTPException(status_code=402, detail="You've run out of credits...")
```

#### 2. Modified Credit Deduction (`backend/app/credit_manager.py`)

**Before:**

```python
if remaining < credits_int:
    raise ValueError("Insufficient credits")
user.credits_used_this_period += credits_int
```

**After:**

```python
new_used = used + credits_int
if new_used > allocated:
    # Cap at allocated amount (zero out, don't go negative)
    user.credits_used_this_period = allocated
    # Still track actual usage for analytics
    user.total_credits_used += credits_int
else:
    # Normal deduction
    user.credits_used_this_period = new_used
    user.total_credits_used += credits_int
```

#### 3. Modified Anonymous Credit Deduction (`backend/app/rate_limiting.py`)

**Before:**

```python
user_data["count"] += credits_int  # Could exceed allocated
```

**After:**

```python
allocated = DAILY_CREDIT_LIMITS.get("anonymous", 50)
new_count = user_data["count"] + credits_int
user_data["count"] = min(new_count, allocated)  # Cap at allocated
```

#### 3a. Credit Deduction for Multi-Model Comparisons (`backend/app/routers/api.py`)

**Key Behavior:**

- Only successful models contribute to credit deduction
- Credits calculated from actual token usage: `effective_tokens / 1000`
- If token usage data unavailable, charges minimum 1 credit per successful model
- Failed models never deduct credits

**Implementation:**

```python
# Calculate credits used - only for successful models
if successful_models > 0:
    if total_effective_tokens > 0:
        # Use actual token usage data from successful models
        total_credits_used = Decimal(total_effective_tokens) / Decimal(1000)
    else:
        # Fallback: charge minimum 1 credit per successful model
        total_credits_used = Decimal(successful_models)
```

#### 4. Removed Estimation Endpoint and All Estimation Logic

- Removed `/api/credits/estimate` endpoint
- Removed `CreditEstimateRequest` model
- Removed `estimate_credits_before_request` import and all estimation calculations
- Credit checking now uses direct credit balance queries without estimates
- Max tokens reduction now based on credits per model (`credits_per_model < 2`) instead of total credits
  - Calculates `credits_per_model = credits_remaining / num_models`
  - Reduces max_tokens proportionally to available credits per model
  - Enforces minimum usable response threshold (300 output tokens)
  - If minimum threshold enforced, comparison proceeds but credits capped to 0 after deduction
- Credit deduction uses only actual token usage from successful models, with minimum charge fallback (1 credit per successful model) if usage data unavailable

### Frontend Changes

#### 1. Removed Credit Estimation

**Removed:**

- `estimateCredits()` API calls
- `backendCreditEstimate` state
- `isEstimatingCredits` state
- `estimateDebounceTimeoutRef` and debounced estimation useEffect

#### 2. Removed Credit Warnings

**Removed:**

- useEffect that set credit warnings based on estimates
- Pre-submission credit blocking check
- "Insufficient credits" warnings
- "Low credits" warnings

#### 3. Simplified UI

**Before:**

```
3 models selected • Estimated: ~15 credits • 25 credits remaining
```

**After:**

```
3 models selected • 25 credits remaining
```

---

## 📊 Benefits

### User Experience

- ✅ **Better UX** - Users can always attempt comparisons
- ✅ **No false blocks** - No inaccurate estimation blocking valid comparisons
- ✅ **Graceful degradation** - One final comparison allowed when credits are low

### Code Quality

- ✅ **Simpler codebase** - Removed ~200 lines of estimation/warning logic
- ✅ **Less complexity** - No frontend/backend estimation coordination
- ✅ **Easier maintenance** - Fewer moving parts

### Business Logic

- ✅ **No negative credits** - Credits capped at allocated amount
- ✅ **Cost control** - Blocks after credits hit zero
- ✅ **Analytics preserved** - `total_credits_used` still tracks actual usage

---

## 🔒 Security & Abuse Prevention

### Protection Mechanisms

1. **Credit Capping** - Credits cannot go negative, preventing abuse
2. **Post-Deduction Blocking** - Users blocked immediately after credits reach zero
3. **Reset-Based Access** - Credits reset based on tier (daily/monthly)
4. **Analytics Tracking** - Actual usage tracked in `total_credits_used` for monitoring

### Potential Concerns & Mitigations

| Concern                                             | Mitigation                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Users could spam comparisons at 0 credits           | Blocked immediately after credits hit zero                       |
| Multiple simultaneous requests when credits are low | Row-level locking in `deduct_credits()` prevents race conditions |
| Users could exploit the "final comparison"          | Only one comparison allowed before blocking                      |

---

## 📝 API Changes

### Removed Endpoints

- `POST /api/credits/estimate` - Credit estimation endpoint removed

### Modified Behavior

- `POST /api/compare-stream` - No longer uses credit estimates at all
  - Blocks only if `credits_remaining == 0` (after previous comparison zeroed credits)
  - Credits deducted based only on actual token usage from successful models
  - If some models fail and others succeed, only successful models deduct credits
  - Max tokens reduction based on credits per model (`credits_per_model < 2`)
    - Calculates `credits_per_model = credits_remaining / num_models`
    - If credits per model is low, reduces max_tokens to fit available credits
    - Enforces minimum usable response threshold (300 output tokens)
    - If minimum threshold enforced, comparison proceeds but credits will be capped to 0 after deduction
  - Response metadata no longer includes `estimated_credits` field

### Unchanged Endpoints

- `GET /api/credits/balance` - Still returns current credit balance
- `GET /api/credits/usage` - Still returns usage history

---

## 🧪 Testing Considerations

### Test Cases

1. **Sufficient Credits**

   - User has 70 credits, comparison costs 5 credits
   - Expected: Normal deduction, 65 credits remaining

2. **Partial Credits (Overage)**

   - User has 2 credits, comparison costs 5 credits
   - Expected: Credits capped at 100, 0 remaining, comparison succeeds

3. **Zero Credits (Blocked)**

   - User has 0 credits, attempts comparison
   - Expected: HTTP 402 error, comparison blocked

4. **Anonymous User**

   - Anonymous user has 2 credits, comparison costs 5 credits
   - Expected: Credits capped at 50, 0 remaining, comparison succeeds

5. **Concurrent Requests**
   - Multiple requests when credits are low
   - Expected: Row-level locking prevents double deduction

---

## 🔄 Migration Notes

### Database Changes

- **None required** - All changes are logic-only

### Backward Compatibility

- ✅ Fully backward compatible
- Existing credit balances work as expected
- No data migration needed

### Rollback Plan

If needed, revert:

1. Restore blocking logic (`credits_remaining <= 0`)
2. Restore error in `deduct_credits()` for insufficient credits
3. Restore estimation endpoint (if needed)
4. Restore frontend estimation/warning logic

---

## 📚 Related Documentation

- [Credits System Implementation](../planning/CREDITS_SYSTEM_IMPLEMENTATION.md) - Original implementation
- [Credits System Reference](../planning/CREDITS_SYSTEM_REFERENCE.md) - API reference
- [Rate Limiting Implementation](./RATE_LIMITING_IMPLEMENTATION.md) - Related rate limiting

---

## ✅ Checklist

- [x] Modified backend blocking logic (`credits_remaining == 0`)
- [x] Modified credit deduction to cap at allocated amount
- [x] Modified anonymous credit deduction to cap at allocated amount
- [x] Removed `/api/credits/estimate` endpoint
- [x] Removed frontend estimation logic
- [x] Removed frontend credit warnings
- [x] Simplified usage preview UI
- [x] Updated documentation

---

## 🎯 Summary

This update simplifies the credit system by removing pre-submission estimation and blocking, allowing comparisons to proceed regardless of credit balance. Credits are capped at the allocated amount (zeroed out instead of going negative), and users are blocked only after credits reach zero. This provides a better user experience while maintaining cost control and preventing abuse.
