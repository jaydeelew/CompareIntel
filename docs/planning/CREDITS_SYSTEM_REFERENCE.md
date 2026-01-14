# Credits System Reference Guide

**Date:** January 2025  
**Purpose:** Quick reference guide for the credits-based system

---

## 📊 Credit System Overview

### Formula
```
1 credit = 1,000 effective tokens
Effective tokens = input_tokens + (output_tokens × 2.5)
```

### Credit Allocations

| Tier | Price | Credits | Period | Model Access |
|------|-------|---------|--------|--------------|
| Anonymous | $0 | 50/day | Daily | Free-tier only |
| Free | $0 | 100/day | Daily | Free-tier only |
| Starter | $9.95 | 1,200/month | Monthly | All models |
| Starter+ | $19.95 | 2,500/month | Monthly | All models |
| Pro | $39.95 | 5,000/month | Monthly | All models |
| Pro+ | $79.95 | 10,000/month | Monthly | All models |

### Overage Pricing
- **$12 per 1,000 credits** ($0.012 per credit)

---

## 🔧 Backend Functions

### Credit Manager (`backend/app/credit_manager.py`)

```python
# Get current credit balance
get_user_credits(user_id: int, db: Session) -> int

# Check if user has sufficient credits
check_credits_sufficient(user_id: int, required_credits: Decimal, db: Session) -> bool

# Deduct credits atomically
deduct_credits(user_id: int, credits: Decimal, usage_log_id: Optional[int], db: Session) -> None

# Allocate monthly credits for paid tier
allocate_monthly_credits(user_id: int, tier: str, db: Session) -> None

# Reset daily credits for free/unregistered tier
reset_daily_credits(user_id: int, tier: str, db: Session) -> None

# Get credit usage statistics
get_credit_usage_stats(user_id: int, db: Session) -> Dict[str, Any]

# Ensure credits are allocated (first-time setup)
ensure_credits_allocated(user_id: int, db: Session) -> None

# Check and reset credits if period expired
check_and_reset_credits_if_needed(user_id: int, db: Session) -> None
```

### Rate Limiting (`backend/app/rate_limiting.py`)

```python
# Check authenticated user credits
check_user_credits(user: User, required_credits: Decimal, db: Session) -> Tuple[bool, int, int]
# Returns: (is_sufficient, credits_remaining, credits_allocated)

# Deduct authenticated user credits
deduct_user_credits(user: User, credits: Decimal, usage_log_id: Optional[int], db: Session) -> None

# Check unregistered user credits
check_anonymous_credits(ip_identifier: str, required_credits: Decimal) -> Tuple[bool, int, int]

# Deduct unregistered user credits
deduct_anonymous_credits(ip_identifier: str, credits: Decimal) -> None
```

### Token Usage (`backend/app/model_runner.py`)

```python
# Calculate credits from token counts
calculate_credits(prompt_tokens: int, completion_tokens: int) -> Decimal

# Calculate full token usage metrics
calculate_token_usage(prompt_tokens: int, completion_tokens: int) -> TokenUsage

# Estimate credits before request
estimate_credits_before_request(
    prompt: str, 
    tier: str = "standard", 
    num_models: int = 1, 
    conversation_history: Optional[List[Any]] = None
) -> Decimal

# Check if model is available for tier
is_model_available_for_tier(model_id: str, tier_name: str) -> bool

# Filter models by tier
filter_models_by_tier(models: List[str], tier_name: str) -> List[str]
```

---

## 🌐 API Endpoints

### Credit Management

```http
# Get credit balance
GET /api/credits/balance
Response: {
  credits_allocated: int
  credits_used_this_period: int
  credits_remaining: int
  total_credits_used: int
  credits_reset_at: string (ISO timestamp)
  billing_period_start: string (ISO timestamp, paid tiers)
  billing_period_end: string (ISO timestamp, paid tiers)
  period_type: "daily" | "monthly"
  subscription_tier: string
}

# Get usage history
GET /api/credits/usage?page=1&per_page=50
Response: {
  total: int
  page: int
  per_page: int
  total_pages: int
  results: [
    {
      id: int
      created_at: string
      models_used: string[]
      credits_used: number
      input_tokens: number
      output_tokens: number
      ...
    }
  ]
}

# Estimate credits for request
POST /api/credits/estimate
Body: {
  input_data: string
  models: string[]
  tier: "standard" | "extended"
  conversation_history?: Array<{role: string, content: string}>
}
Response: {
  estimated_credits: number
  credits_remaining: number
  credits_allocated: number
  is_sufficient: boolean
  breakdown: {...}
}
```

### Compare Endpoint

```http
# Compare (streaming)
POST /api/compare-stream
# Includes credit validation and deduction
# Returns metadata with credits_used and credits_remaining
```

---

## 💻 Frontend Usage

### Credit Service (`frontend/src/services/creditService.ts`)

```typescript
// Get credit balance
const balance = await getCreditBalance()

// Get usage history
const usage = await getCreditUsage(page: number, perPage: number)

// Estimate credits
const estimate = await estimateCredits({
  input_data: string
  models: string[]
  tier: 'standard' | 'extended'
  conversation_history?: Array<{role: string, content: string}>
})
```

### Components

```typescript
// CreditBalance component
import { CreditBalance } from './components/credits/CreditBalance'

<CreditBalance 
  balance={creditBalance}
  variant="full" | "compact"
  showResetDate={true}
  onUpgradeClick={() => {}}
/>

// LowCreditWarningBanner component
import { LowCreditWarningBanner } from './components/credits/LowCreditWarningBanner'

<LowCreditWarningBanner
  balance={creditBalance}
  onUpgradeClick={() => {}}
  onDismiss={() => {}}
/>
```

---

## 🗄️ Database Schema

### User Model Credit Fields

```python
monthly_credits_allocated: Integer  # Credits allocated for current period
credits_used_this_period: Integer    # Credits used in current period
total_credits_used: Integer           # Lifetime total credits used
billing_period_start: DateTime        # Start of billing period (paid tiers)
billing_period_end: DateTime          # End of billing period (paid tiers)
credits_reset_at: DateTime            # When credits reset

# Computed property
credits_remaining: int  # = monthly_credits_allocated - credits_used_this_period
```

### UsageLog Model Token/Credit Fields

```python
input_tokens: Integer         # Input tokens from OpenRouter
output_tokens: Integer        # Output tokens from OpenRouter
total_tokens: Integer         # Total tokens (input + output)
effective_tokens: Integer     # Effective tokens = input + (output × 2.5)
credits_used: Decimal         # Credits used = effective_tokens / 1000
actual_cost: Decimal          # Actual cost from OpenRouter
```

### CreditTransaction Model

```python
user_id: Integer              # Foreign key to User
transaction_type: String      # 'allocation', 'usage', 'purchase', 'refund', 'expiration'
credits_amount: Integer       # Positive for allocation/purchase, negative for usage
description: Text             # Human-readable description
related_usage_log_id: Integer # Foreign key to UsageLog (nullable)
created_at: DateTime          # Transaction timestamp
```

---

## 🔐 Model Access Rules

### Unregistered Tier
- **Access:** Only `UNREGISTERED_TIER_MODELS` (budget models)
- **Location:** `backend/app/model_runner.py`
- **Validation:** Backend returns 403 Forbidden for restricted models

### Free Tier
- **Access:** `FREE_TIER_MODELS` (includes unregistered + mid-level models)
- **Location:** `backend/app/model_runner.py`
- **Validation:** Backend returns 403 Forbidden for restricted models

### Paid Tiers (Starter, Starter+, Pro, Pro+)
- **Access:** ALL models (no restrictions)
- **Validation:** No restrictions

---

## 📍 Constants Location

### Backend Constants (`backend/app/config/constants.py`)

```python
DAILY_CREDIT_LIMITS = {
    "anonymous": 50,
    "free": 100,
}

MONTHLY_CREDIT_ALLOCATIONS = {
    "starter": 1,200,
    "starter_plus": 2,500,
    "pro": 5,000,
    "pro_plus": 10,000,
}

TIER_PRICING = {
    "anonymous": 0.0,
    "free": 0.0,
    "starter": 9.95,
    "starter_plus": 19.95,
    "pro": 39.95,
    "pro_plus": 79.95,
}

OVERAGE_PRICE_PER_1000_CREDITS = 12.0
```

### Frontend Constants (`frontend/src/config/constants.ts`)

Same structure as backend constants, plus helper functions:
- `getDailyCreditLimit(tier: string): number`
- `getMonthlyCreditAllocation(tier: string): number`
- `getCreditAllocation(tier: string, period: 'daily' | 'monthly'): number`

---

## ⚠️ Error Codes

### 402 Payment Required
- **When:** User has insufficient credits for request
- **Response:** `{"detail": "Insufficient credits: X remaining, Y required"}`
- **Frontend:** Shows error message with upgrade prompt

### 403 Forbidden
- **When:** User tries to access restricted model
- **Response:** `{"detail": "Model 'X' is not available for your tier. Upgrade to access premium models."}`
- **Frontend:** Shows upgrade prompt

---

## 🔄 Credit Reset Logic

### Free/Unregistered Tiers
- **Reset:** Daily at midnight UTC
- **Function:** `reset_daily_credits()`
- **Trigger:** Automatic via `check_and_reset_credits_if_needed()`

### Paid Tiers
- **Reset:** Monthly based on `billing_period_start`
- **Function:** `allocate_monthly_credits()`
- **Trigger:** Automatic via `check_and_reset_credits_if_needed()`

---

## 📝 Common Tasks

### Adding a New Model
1. Add model to `MODELS_BY_PROVIDER` in `model_runner.py`
2. Classify model:
   - If cost < $0.50/M tokens → Add to `UNREGISTERED_TIER_MODELS`
   - If cost < $1/M tokens → Add to `FREE_TIER_MODELS`
   - If cost >= $1/M tokens → Paid-only (no action needed)

### Adjusting Credit Allocations
1. Update `MONTHLY_CREDIT_ALLOCATIONS` in `backend/app/config/constants.py`
2. Update same constants in `frontend/src/config/constants.ts`
3. Existing users will get new allocation on next reset

### Changing Overage Pricing
1. Update `OVERAGE_PRICE_PER_1000_CREDITS` in both backend and frontend constants
2. Update pricing display in frontend components

---

## 🐛 Troubleshooting

### Credits Not Deducting
- Check `UsageLog` records have `credits_used` populated
- Check `CreditTransaction` records are being created
- Verify `deduct_credits()` is being called after successful requests

### Credits Not Resetting
- Check `credits_reset_at` timestamp in User model
- Verify `check_and_reset_credits_if_needed()` is being called
- Check timezone handling (should use UTC)

### Model Access Issues
- Verify model is in correct tier set (`FREE_TIER_MODELS` or `UNREGISTERED_TIER_MODELS`)
- Check `is_model_available_for_tier()` function
- Verify tier name matches exactly (case-sensitive)

---

**Document Version:** 1.0  
**Last Updated:** January 2025

