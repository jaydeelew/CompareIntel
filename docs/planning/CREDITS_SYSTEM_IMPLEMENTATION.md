# Credits-Based System Implementation

**Date:** January 2025  
**Status:** ✅ **FULLY IMPLEMENTED**  
**Version:** 1.0

---

## 🎯 Executive Summary

The credits-based system has been **fully implemented** and is operational. The system transitions from model-response-based daily limits to a credit-based monthly allocation system that:

- Uses **credits** as the primary billing unit (1 credit = 1,000 effective tokens)
- Calculates effective tokens as: `input_tokens + (output_tokens × 2.5)`
- Provides **monthly credit allocations** for paid tiers
- Maintains **daily credit limits** for anonymous and free tiers
- Tracks actual token usage from OpenRouter API responses
- Supports overage billing for paid tiers

---

## 📊 Credit System Formula

```
1 credit = 1,000 effective tokens
Effective tokens = input_tokens + (output_tokens × 2.5)
```

**Rationale:**
- Output tokens typically cost 2-3x more than input tokens
- The 2.5 multiplier accounts for average cost difference
- Simplifies user experience (one unit instead of tracking input/output separately)

**Example Calculations:**
- **Standard Response:** 500 input + 1,500 output tokens = 4,250 effective tokens = **4.25 credits**
- **Extended Response:** 1,500 input + 3,000 output tokens = 9,000 effective tokens = **9 credits**
- **Follow-up with History:** 2,000 input + 2,000 output tokens = 7,000 effective tokens = **7 credits**

---

## 💰 Credit Allocations by Tier

| Tier | Monthly Price | Credits | Period | Monthly Exchanges | Daily Avg | Model Access |
|------|---------------|---------|--------|-------------------|-----------|--------------|
| **Anonymous** | $0 | 50 credits | Per day | ~300/month* | ~10/day | Free-tier only |
| **Free** | $0 | 100 credits | Per day | ~600/month* | ~20/day | Free-tier only |
| **Starter** | $9.95 | 1,200 credits | Per month | ~240/month | ~8/day | All models |
| **Starter+** | $19.95 | 2,500 credits | Per month | ~500/month | ~17/day | All models |
| **Pro** | $39.95 | 5,000 credits | Per month | ~1,000/month | ~33/day | All models |
| **Pro+** | $79.95 | 10,000 credits | Per month | ~2,000/month | ~67/day | All models |

*Monthly exchanges = daily credits × 30 days ÷ 5 credits per exchange

### Overage Pricing
- **Rate:** $12 per 1,000 credits ($0.012 per credit)
- **Rationale:** Based on 200% markup (3x cost), maintains profitability

---

## ✅ Implementation Status

### Backend - **COMPLETE** ✅

#### 1. Model Classification System ✅
- **Location:** `backend/app/model_runner.py`
- `UNREGISTERED_TIER_MODELS` set (budget models for unregistered users)
- `FREE_TIER_MODELS` set (includes unregistered + mid-level models for registered free users)
- `is_model_available_for_tier()` function
- `filter_models_by_tier()` function
- `/models` endpoint filters by tier
- Model access validation in `/compare` and `/compare-stream` endpoints

#### 2. Database Schema ✅
- **Location:** `backend/app/models.py`
- **User Model:** All credit fields implemented
  - `monthly_credits_allocated` (Integer)
  - `credits_used_this_period` (Integer)
  - `total_credits_used` (Integer)
  - `billing_period_start` (DateTime)
  - `billing_period_end` (DateTime)
  - `credits_reset_at` (DateTime)
  - `credits_remaining` (property)
- **UsageLog Model:** Token/credit tracking fields
  - `input_tokens` (Integer)
  - `output_tokens` (Integer)
  - `total_tokens` (Integer)
  - `effective_tokens` (Integer)
  - `credits_used` (Decimal)
  - `actual_cost` (Decimal)
- **CreditTransaction Model:** Audit trail for all credit operations
  - `transaction_type` (allocation, usage, purchase, refund, expiration)
  - `credits_amount` (Integer)
  - `description` (Text)
  - Links to `UsageLog` records

#### 3. Credit Allocation Constants ✅
- **Location:** `backend/app/config/constants.py`
- `DAILY_CREDIT_LIMITS`: anonymous=50, free=100
- `MONTHLY_CREDIT_ALLOCATIONS`: starter=1,200, starter+=2,500, pro=5,000, pro+=10,000
- `TIER_PRICING`: All tier prices defined
- `OVERAGE_PRICE_PER_1000_CREDITS`: $12.00

#### 4. Credit Management Module ✅
- **Location:** `backend/app/credit_manager.py`
- **Core Functions:**
  - `get_user_credits()` - Get current balance
  - `check_credits_sufficient()` - Pre-request validation
  - `deduct_credits()` - Atomic credit deduction with row-level locking
  - `allocate_monthly_credits()` - Monthly allocation for paid tiers
  - `reset_daily_credits()` - Daily reset for free/anonymous
  - `get_credit_usage_stats()` - Usage statistics
  - `ensure_credits_allocated()` - First-time setup
  - `check_and_reset_credits_if_needed()` - Auto-reset logic

#### 5. Token Usage Extraction ✅
- **Location:** `backend/app/model_runner.py`
- `calculate_credits()` - Calculate credits from token counts
- `calculate_token_usage()` - Calculate all token metrics
- `estimate_credits_before_request()` - Pre-request estimation
- `call_openrouter()` - Extracts usage from OpenRouter responses
- `call_openrouter_streaming()` - Extracts usage from streaming responses
- `run_models()` - Returns usage data along with results

#### 6. Rate Limiting Refactoring ✅
- **Location:** `backend/app/rate_limiting.py`
- `check_user_credits()` - Credit-based validation for authenticated users
- `deduct_user_credits()` - Credit deduction for authenticated users
- `check_anonymous_credits()` - Credit-based validation for unregistered users
- `deduct_anonymous_credits()` - Credit deduction for unregistered users
- Updated `get_user_usage_stats()` - Includes credit fields
- Updated `get_anonymous_usage_stats()` - Includes credit fields
- Legacy functions maintained for backward compatibility

#### 7. API Endpoint Updates ✅
- **Location:** `backend/app/routers/api.py`
- **`/compare` endpoint:**
  - Credit estimation before request
  - Credit validation (402 Payment Required if insufficient)
  - Token usage extraction from OpenRouter responses
  - Credit deduction after successful requests
  - Updated UsageLog with token/credit data
  - Updated response metadata with credit information
- **`/compare-stream` endpoint:**
  - Same credit validation and deduction
  - Handles streaming-specific usage tracking
- **New Credit Endpoints:**
  - `GET /api/credits/balance` - Current credit balance and stats
  - `GET /api/credits/usage` - Paginated usage history
  - `POST /api/credits/estimate` - Estimate credits for request

### Frontend - **COMPLETE** ✅

#### 1. Credit Service ✅
- **Location:** `frontend/src/services/creditService.ts`
- `getCreditBalance()` - Fetch credit balance
- `getCreditUsage()` - Fetch usage history
- `estimateCredits()` - Estimate credits for request
- TypeScript interfaces for all credit-related types

#### 2. Credit Components ✅
- **CreditBalance Component:** `frontend/src/components/credits/CreditBalance.tsx`
  - Displays credit balance with progress bar
  - Shows reset date
  - Color-coded based on remaining credits
- **LowCreditWarningBanner Component:** `frontend/src/components/credits/LowCreditWarningBanner.tsx`
  - Shows warnings at 20%, 10%, and 0% remaining
  - Provides upgrade prompts

#### 3. User Interface Updates ✅
- **UserMenu:** `frontend/src/components/auth/UserMenu.tsx`
  - Displays credits instead of model responses
  - Shows credit usage bar
  - Displays reset date
  - Updated upgrade modal to show credit allocations
- **App.tsx:** `frontend/src/App.tsx`
  - Credit estimation before submission (calls `/api/credits/estimate`)
  - Validates credits before allowing submission
  - Shows error messages with credit amounts
  - Updates credit balance after successful comparisons
  - Displays estimated credits in usage preview
  - Low credit warning banner integration

#### 4. Error Handling ✅
- **PaymentRequiredError:** `frontend/src/services/api/errors.ts`
  - Custom error class for 402 Payment Required responses
- **Error Messages:** Updated throughout frontend
  - Replaced "model responses" with "credits"
  - Include specific credit amounts
  - Provide upgrade/purchase options

#### 5. Constants ✅
- **Location:** `frontend/src/config/constants.ts`
- `DAILY_CREDIT_LIMITS`
- `MONTHLY_CREDIT_ALLOCATIONS`
- `TIER_PRICING`
- `OVERAGE_PRICE_PER_1000_CREDITS`
- Helper functions for credit calculations

---

## 🔑 Key Implementation Details

### Credit Calculation Flow

1. **Pre-Request:**
   - Frontend calls `/api/credits/estimate` with request details
   - Backend estimates credits using `estimate_credits_before_request()`
   - Frontend validates user has sufficient credits
   - Frontend blocks submission if insufficient

2. **During Request:**
   - Backend validates credits again before processing
   - Returns 402 Payment Required if insufficient
   - Processes request and extracts actual token usage from OpenRouter

3. **Post-Request:**
   - Backend calculates actual credits used from token counts
   - Deducts credits atomically using row-level locking
   - Creates CreditTransaction record for audit trail
   - Updates UsageLog with token/credit data
   - Returns credit information in response metadata

4. **Frontend Update:**
   - Extracts credit information from response
   - Updates credit balance display
   - Shows credit usage in results

### Model Access Restrictions

- **Unregistered/Free Tiers:** Only free-tier models (budget/efficient models)
- **Paid Tiers:** All models available (no restrictions)
- **Classification:** Models classified in `model_runner.py` via `FREE_TIER_MODELS` and `UNREGISTERED_TIER_MODELS` sets
- **Validation:** Backend validates model access in `/compare` and `/compare-stream` endpoints
- **Error Handling:** Returns 403 Forbidden with upgrade message for restricted models

### Credit Reset Logic

- **Free/Unregistered Tiers:** Daily reset at midnight UTC
- **Paid Tiers:** Monthly reset based on `billing_period_start`
- **Auto-Reset:** `check_and_reset_credits_if_needed()` automatically resets credits when period expires
- **Allocation:** Credits automatically allocated when user tier changes or period resets

### Atomic Operations

- **Row-Level Locking:** Credit deductions use `with_for_update()` to prevent race conditions
- **Transactions:** All credit operations wrapped in database transactions
- **Audit Trail:** Every credit operation creates a `CreditTransaction` record
- **Error Handling:** Graceful handling of concurrent requests and edge cases

---

## 📝 Notes

1. **Model Classification:** When adding new models, classify them in `FREE_TIER_MODELS` or `UNREGISTERED_TIER_MODELS` based on OpenRouter pricing. Premium models (>$1/M tokens) remain paid-only.

2. **Credit Allocations:** Current allocations are conservative (100% profit margin). Monitor usage and adjust if needed.

3. **Free Tier Restrictions:** Free/unregistered users can only access free-tier models. This creates clear upgrade incentive.

4. **Paid Tiers:** All paid tiers (Starter, Starter+, Pro, Pro+) have access to ALL models - no restrictions.

5. **Overage Pricing:** $12 per 1,000 credits ($0.012 per credit) - based on 200% markup.

6. **Backward Compatibility:** Legacy model-response-based functions are maintained during transition period but are no longer used.

---

## 🚀 Usage Examples

### Backend: Check Credits
```python
from ..credit_manager import check_credits_sufficient, deduct_credits
from ..rate_limiting import check_user_credits

# Check if user has sufficient credits
is_sufficient, remaining, allocated = check_user_credits(user, required_credits, db)

# Deduct credits after successful request
deduct_user_credits(user, credits_used, usage_log_id, db)
```

### Frontend: Estimate Credits
```typescript
import { estimateCredits } from './services/creditService'

// Before submission
const estimate = await estimateCredits({
  input_data: prompt,
  models: selectedModels,
  tier: 'standard',
  conversation_history: history,
})

if (!estimate.is_sufficient) {
  // Show error message
}
```

### Frontend: Display Credit Balance
```typescript
import { CreditBalance } from './components/credits/CreditBalance'
import { getCreditBalance } from './services/creditService'

const balance = await getCreditBalance()

<CreditBalance 
  balance={balance}
  variant="full"
  showResetDate={true}
/>
```

---

## 📚 Related Files

### Backend
- `backend/app/models.py` - Database models
- `backend/app/credit_manager.py` - Credit management functions
- `backend/app/rate_limiting.py` - Rate limiting with credits
- `backend/app/model_runner.py` - Token extraction and credit calculation
- `backend/app/routers/api.py` - API endpoints
- `backend/app/config/constants.py` - Credit allocations and pricing

### Frontend
- `frontend/src/services/creditService.ts` - Credit API service
- `frontend/src/components/credits/CreditBalance.tsx` - Credit display component
- `frontend/src/components/credits/LowCreditWarningBanner.tsx` - Warning banner
- `frontend/src/components/auth/UserMenu.tsx` - User menu with credits
- `frontend/src/App.tsx` - Main app with credit integration
- `frontend/src/config/constants.ts` - Frontend constants

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Status:** ✅ Fully Implemented and Operational

