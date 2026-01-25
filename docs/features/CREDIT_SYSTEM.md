# Credit System

The credit system manages user quotas for AI model comparisons based on token usage.

## How Credits Work

**Formula:**
- 1 credit = 1,000 effective tokens
- Effective tokens = input tokens + (output tokens × 2.5)

The 2.5 multiplier accounts for the higher cost of output tokens relative to input tokens.

## Credit Allocations

| Tier | Price | Credits | Period | Model Access |
|------|-------|---------|--------|--------------|
| Anonymous | Free | 50/day | Daily | Free-tier models only |
| Free | Free | 100/day | Daily | Free-tier models only |
| Starter | $9.95/mo | 1,200/month | Monthly | All models |
| Starter+ | $19.95/mo | 2,500/month | Monthly | All models |
| Pro | $39.95/mo | 5,000/month | Monthly | All models |
| Pro+ | $79.95/mo | 10,000/month | Monthly | All models |

**Overage Pricing:** $12 per 1,000 credits ($0.012 per credit)

## Credit Reset Timing

- **Free/Anonymous:** Credits reset daily at midnight UTC
- **Paid Tiers:** Credits reset monthly based on billing period start date

## Model Access Restrictions

- **Unregistered users:** Only budget/efficient models (lowest cost models)
- **Free tier:** Budget models plus some mid-level models
- **Paid tiers:** All models available without restrictions

## Credit Flow

1. **Pre-request:** Frontend estimates required credits before submission
2. **Validation:** Backend validates user has sufficient credits (returns 402 if insufficient)
3. **Processing:** Request is processed and actual token usage is extracted from API response
4. **Deduction:** Credits are deducted atomically based on actual usage
5. **Recording:** Credit transaction is logged for audit trail

## Database Fields

**User model:**
- `monthly_credits_allocated` - Credits for current period
- `credits_used_this_period` - Credits consumed this period
- `credits_reset_at` - When credits reset next

**UsageLog model:**
- `input_tokens`, `output_tokens` - Token counts from API
- `effective_tokens` - Calculated billing tokens
- `credits_used` - Credits deducted for request

## API Endpoints

- `GET /api/credits/balance` - Get current credit balance
- `GET /api/credits/usage` - Get paginated usage history
- `POST /api/credits/estimate` - Estimate credits for a request

## Error Codes

- **402 Payment Required** - Insufficient credits for request
- **403 Forbidden** - Model not available for user's tier

## Configuration

Credit allocations are defined in:
- Backend: `backend/app/config/constants.py`
- Frontend: `frontend/src/config/constants.ts`

Both must be kept in sync when modifying allocations.
