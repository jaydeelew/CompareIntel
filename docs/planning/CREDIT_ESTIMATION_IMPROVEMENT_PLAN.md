# Credit Estimation Improvement Plan

**Date:** January 2025  
**Status:** 🟡 In Progress  
**Version:** 1.0

---

## 🎯 Executive Summary

This document outlines the plan to improve credit estimation accuracy by transitioning from fixed estimates to dynamic, data-driven estimates based on historical token usage patterns.

---

## 📊 Current State

### Current Estimation Method
- **Fixed estimate:** 2,000 output tokens per model (conservative, but often inaccurate)
- **Input tokens:** Calculated using tiktoken (accurate)
- **Formula:** `credits = (input_tokens + (2000 × 2.5)) / 1000 × num_models`

### Problems with Current Approach
1. **Over-estimation:** Short prompts get charged for 2000 tokens even if response is 500 tokens
2. **Under-estimation:** Long prompts might generate 3000+ tokens but only estimated at 2000
3. **No learning:** System doesn't improve over time
4. **One-size-fits-all:** Doesn't account for different model behaviors or prompt types

---

## ✅ Phase 1: Dynamic Input-Based Estimation (COMPLETED)

### Implementation
- **Multiplier:** 1.5x input tokens (balanced estimate)
- **Bounds:** Minimum 500 tokens, maximum 4000 tokens
- **Formula:** `estimated_output_tokens = max(500, min(4000, int(input_tokens × 1.5)))`

### Benefits
- ✅ Adapts to input length (longer prompts → longer estimates)
- ✅ More accurate than fixed 2000 tokens
- ✅ Simple to implement and maintain
- ✅ No historical data required

### Code Location
- `backend/app/model_runner.py::estimate_credits_before_request()`

---

## 🔄 Phase 2: Token Usage Recording (COMPLETED)

### Implementation
- **Streaming endpoint:** Now captures `TokenUsage` return value from generator
- **Database storage:** `UsageLog` records `input_tokens` and `output_tokens` for each model call
- **Accumulation:** Token usage aggregated across all models in a comparison

### Technical Details
- Generator return value captured using `StopIteration` exception handling
- Token usage stored per model in `usage_data_dict`
- Total tokens accumulated: `total_input_tokens`, `total_output_tokens`, `total_effective_tokens`
- Credits calculated from actual usage when available, falls back to estimate if missing

### Code Locations
- `backend/app/routers/api.py::compare_stream()` - Streaming endpoint
- `backend/app/model_runner.py::call_openrouter_streaming()` - Generator that returns TokenUsage
- `backend/app/models.py::UsageLog` - Database model with token fields

---

## 📈 Phase 3: Historical Ratio-Based Estimation (PLANNED)

### Goal
Use historical data to predict output tokens based on input token ranges and model-specific patterns.

### Approach

#### Step 1: Collect Historical Data
- **Timeframe:** Last 30 days of usage logs
- **Filtering:** Only successful model calls with actual token data
- **Grouping:** By model ID and input token ranges (±20% tolerance)

#### Step 2: Calculate Ratios
```python
# For each model and input token range:
avg_output_tokens = AVG(output_tokens / models_successful)
output_ratio = avg_output_tokens / avg_input_tokens

# Store ratios in cache or database for quick lookup
```

#### Step 3: Implement Estimation Function
```python
def estimate_output_tokens_from_history(
    model_id: str,
    input_tokens: int,
    db: Session,
    lookback_days: int = 30
) -> int:
    """
    Estimate output tokens using historical ratios.
    Falls back to input-based estimate if no historical data available.
    """
    # Query historical data for similar input token ranges
    # Calculate average output/input ratio
    # Return estimated output tokens
```

#### Step 4: Integration
- Update `estimate_credits_before_request()` to use historical ratios when available
- Fall back to input-based estimate (1.5x) if no historical data
- Cache ratios for performance (refresh daily)

### Benefits
- 🎯 **More accurate:** Based on actual usage patterns
- 📊 **Model-specific:** Different models have different verbosity patterns
- 🔄 **Self-improving:** Gets better as more data accumulates
- 💰 **Better UX:** Users see estimates closer to actual costs

---

## 🔮 Phase 4: Advanced Enhancements (FUTURE)

### Model-Specific Multipliers
- Track average output/input ratios per model
- Apply model-specific multipliers when historical data is insufficient
- Example: GPT-4 might average 2.0x, Llama might average 1.2x

### Prompt Type Detection
- Detect prompt characteristics (code generation, analysis, simple Q&A)
- Adjust estimates based on prompt type
- Example: Code generation prompts → higher multiplier

### User-Specific Patterns
- Track individual user patterns (some users ask longer questions)
- Personalize estimates per user
- Optional: User can opt-in for personalized estimates

### Real-Time Learning
- Continuously update ratios as new data comes in
- Use exponential moving average for recent trends
- Detect and adapt to model behavior changes

---

## 📋 Implementation Checklist

### Phase 1: Dynamic Input-Based Estimation ✅
- [x] Update `estimate_credits_before_request()` to use 1.5x multiplier
- [x] Add bounds checking (min 500, max 4000 tokens)
- [x] Test with various input lengths

### Phase 2: Token Usage Recording ✅
- [x] Fix generator return value capture in streaming endpoint
- [x] Accumulate token usage from all models
- [x] Store `input_tokens` and `output_tokens` in `UsageLog`
- [x] Calculate credits from actual usage when available
- [x] Fall back to estimate if usage data missing

### Phase 3: Historical Ratio-Based Estimation 🔄
- [ ] Create function to query historical token ratios
- [ ] Implement caching mechanism for ratios
- [ ] Update estimation function to use historical data
- [ ] Add fallback to input-based estimate
- [ ] Test with various models and input sizes
- [ ] Monitor accuracy improvements

### Phase 4: Advanced Enhancements 📅
- [ ] Research model-specific verbosity patterns
- [ ] Implement prompt type detection
- [ ] Add user-specific pattern tracking (optional)
- [ ] Build real-time learning system

---

## 📊 Success Metrics

### Accuracy Metrics
- **Estimate vs Actual Ratio:** Target 0.9-1.1 (within 10% accuracy)
- **Over-estimation Rate:** Track how often estimates are too high
- **Under-estimation Rate:** Track how often estimates are too low
- **Model-specific Accuracy:** Track accuracy per model

### User Experience Metrics
- **Credit Rejection Rate:** Should decrease as estimates improve
- **User Satisfaction:** Monitor feedback on estimate accuracy
- **Credit Balance Surprises:** Track unexpected credit depletion

### Data Quality Metrics
- **Token Data Coverage:** % of requests with actual token data
- **Historical Data Volume:** Number of records available for ratios
- **Data Freshness:** Age of data used for ratios

---

## 🔧 Technical Considerations

### Performance
- **Caching:** Cache historical ratios to avoid database queries on every estimate
- **Query Optimization:** Index `UsageLog` on `created_at`, `models_used`, `input_tokens`
- **Batch Updates:** Update ratios periodically (e.g., daily) rather than real-time

### Data Quality
- **Filtering:** Only use successful model calls with valid token data
- **Outliers:** Consider filtering extreme outliers (e.g., >10x input tokens)
- **Minimum Sample Size:** Require at least N samples before using historical ratio

### Fallback Strategy
1. Try historical ratio (if available)
2. Fall back to input-based estimate (1.5x multiplier)
3. Fall back to fixed estimate (2000 tokens) if input tokens unavailable

---

## 📝 Notes

### Why 1.5x Multiplier?
- Based on general observation that responses are typically 0.5x to 2x input length
- 1.5x provides a balanced estimate (not too conservative, not too aggressive)
- Can be adjusted based on actual data once historical ratios are available

### Why 500-4000 Token Bounds?
- **Minimum 500:** Prevents underestimation for very short prompts
- **Maximum 4000:** Prevents overestimation for very long prompts
- Bounds can be adjusted based on actual usage patterns

### Database Schema
The `UsageLog` table already has the necessary fields:
- `input_tokens` (Integer)
- `output_tokens` (Integer)
- `total_tokens` (Integer)
- `effective_tokens` (Integer)
- `credits_used` (Decimal)

---

## 🎓 Lessons Learned

1. **Generator Return Values:** Python generators return values via `StopIteration.value`, not through normal iteration
2. **Streaming Complexity:** Capturing token usage in streaming requires careful generator handling
3. **Fallback Strategy:** Always have multiple fallback levels for robustness
4. **Data Collection First:** Can't improve estimates without historical data

---

## 📚 References

- [Python Generator Return Values](https://docs.python.org/3/reference/expressions.html#yield-expressions)
- [OpenRouter API Documentation](https://openrouter.ai/docs)
- Credit System Implementation: `docs/planning/CREDITS_SYSTEM_IMPLEMENTATION.md`

---

**Last Updated:** January 2025  
**Next Review:** After Phase 3 implementation

