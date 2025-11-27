# Token Tracking Fix: Accurate Input Token Calculation for Follow-ups

**Date:** January 2025  
**Status:** ✅ Complete  
**Related Issue:** Token count saved for follow-up messages was incorrect

---

## 🎯 Overview

Fixed a bug where the input token count saved to the database for follow-up messages was incorrect. Previously, only an estimated token count for the current prompt was saved, but OpenRouter's `prompt_tokens` includes the entire conversation history. This fix calculates the actual tokens for just the current prompt by subtracting previous conversation tokens from OpenRouter's total.

---

## 🐛 The Problem

### Background

The system tracks token usage from OpenRouter API responses:
- **Input tokens** are saved with each user prompt
- **Output tokens** are saved with each model response
- The frontend uses these saved tokens to estimate total conversation tokens without sending history to the backend

### The Bug

When OpenRouter returns `prompt_tokens` for a follow-up request, it includes:
- All previous user messages
- All previous assistant messages (sent back as conversation history)
- The current user prompt

However, the code was only saving an **estimated** token count for `req.input_data` (the current prompt), not the actual tokens from OpenRouter. This meant:

- **First message**: ✅ Correct (saved tokens ≈ actual tokens, both are just the first prompt)
- **Follow-ups**: ❌ Incorrect (saved tokens < actual tokens, because saved was just current prompt but OpenRouter's `prompt_tokens` included entire conversation)

### Impact

- Frontend token estimation was inaccurate for follow-up messages
- Token counts in the database didn't match actual usage
- Could lead to incorrect context window calculations

---

## ✅ The Solution

### Approach

Calculate the actual tokens for the current prompt by:
1. Getting `prompt_tokens` from OpenRouter's response (total for entire conversation)
2. Querying previous messages from the database
3. Summing all previous user messages' `input_tokens`
4. Summing all previous assistant messages' `output_tokens` (they count as input when sent back)
5. Subtracting: `current_prompt_tokens = prompt_tokens - sum_previous_tokens`

### Implementation

**Location:** `backend/app/routers/api.py` (lines ~1151-1205)

**Key Changes:**

```python
# For follow-up messages with actual usage data:
if actual_prompt_tokens is not None and existing_conversation:
    # Query previous messages
    previous_user_messages = query previous user messages
    previous_assistant_messages = query previous assistant messages
    
    # Sum previous tokens
    sum_previous_user_tokens = sum(user_msg.input_tokens)
    sum_previous_assistant_tokens = sum(assistant_msg.output_tokens)
    sum_previous_tokens = sum_previous_user_tokens + sum_previous_assistant_tokens
    
    # Calculate current prompt tokens
    user_input_tokens = actual_prompt_tokens - sum_previous_tokens
```

**Fallback Logic:**
- New conversations: Use estimate (system message tokens aren't tracked separately)
- No usage data: Use estimate
- Missing previous token data: Use estimate
- Invalid calculation (negative/unreasonable): Use estimate

---

## 📊 Example: Token Calculation Flow

### Scenario: User has a conversation with 2 follow-ups

---

### **Message 1: First User Prompt (New Conversation)**

**User sends:** "What is machine learning?"

**What happens:**
1. OpenRouter receives:
   - System message: "Provide complete responses..." (~15 tokens)
   - User message: "What is machine learning?" (~5 tokens)
   - **Total messages sent:** 2

2. OpenRouter responds with:
   - `prompt_tokens = 20` (system + user message)
   - `completion_tokens = 150` (assistant response)

3. Database saves:
   - User message: `input_tokens = 5` ✅ (estimated, since it's a new conversation)
   - Assistant message: `output_tokens = 150` ✅ (from OpenRouter)

**Database state:**
```
Conversation Messages:
- User: "What is machine learning?" → input_tokens: 5
- Assistant: "Machine learning is..." → output_tokens: 150
```

---

### **Message 2: First Follow-up**

**User sends:** "Can you give me an example?"

**What happens:**
1. OpenRouter receives:
   - Previous user message: "What is machine learning?" (~5 tokens)
   - Previous assistant message: "Machine learning is..." (~150 tokens)
   - Current user message: "Can you give me an example?" (~7 tokens)
   - **Total messages sent:** 3

2. OpenRouter responds with:
   - `prompt_tokens = 162` (5 + 150 + 7)
   - `completion_tokens = 200` (assistant response)

3. **Calculation:**
   ```python
   # Query previous messages from database
   previous_user_tokens = 5  # From Message 1
   previous_assistant_tokens = 150  # From Message 1
   sum_previous_tokens = 5 + 150 = 155
   
   # Calculate current prompt tokens
   actual_prompt_tokens = 162  # From OpenRouter
   current_prompt_tokens = 162 - 155 = 7 ✅
   ```

4. Database saves:
   - User message: `input_tokens = 7` ✅ (calculated from OpenRouter)
   - Assistant message: `output_tokens = 200` ✅ (from OpenRouter)

**Database state:**
```
Conversation Messages:
- User: "What is machine learning?" → input_tokens: 5
- Assistant: "Machine learning is..." → output_tokens: 150
- User: "Can you give me an example?" → input_tokens: 7  ← Calculated!
- Assistant: "Sure! Here's an example..." → output_tokens: 200
```

---

### **Message 3: Second Follow-up**

**User sends:** "How does it differ from deep learning?"

**What happens:**
1. OpenRouter receives:
   - Previous user message 1: "What is machine learning?" (~5 tokens)
   - Previous assistant message 1: "Machine learning is..." (~150 tokens)
   - Previous user message 2: "Can you give me an example?" (~7 tokens)
   - Previous assistant message 2: "Sure! Here's an example..." (~200 tokens)
   - Current user message: "How does it differ from deep learning?" (~9 tokens)
   - **Total messages sent:** 5

2. OpenRouter responds with:
   - `prompt_tokens = 371` (5 + 150 + 7 + 200 + 9)
   - `completion_tokens = 180` (assistant response)

3. **Calculation:**
   ```python
   # Query previous messages from database
   previous_user_tokens = 5 + 7 = 12  # Sum of all previous user messages
   previous_assistant_tokens = 150 + 200 = 350  # Sum of all previous assistant messages
   sum_previous_tokens = 12 + 350 = 362
   
   # Calculate current prompt tokens
   actual_prompt_tokens = 371  # From OpenRouter
   current_prompt_tokens = 371 - 362 = 9 ✅
   ```

4. Database saves:
   - User message: `input_tokens = 9` ✅ (calculated from OpenRouter)
   - Assistant message: `output_tokens = 180` ✅ (from OpenRouter)

**Database state:**
```
Conversation Messages:
- User: "What is machine learning?" → input_tokens: 5
- Assistant: "Machine learning is..." → output_tokens: 150
- User: "Can you give me an example?" → input_tokens: 7
- Assistant: "Sure! Here's an example..." → output_tokens: 200
- User: "How does it differ from deep learning?" → input_tokens: 9  ← Calculated!
- Assistant: "The main difference is..." → output_tokens: 180
```

---

### **Frontend Token Estimation (For Message 4)**

When the user starts typing a 4th message, the frontend:

1. **Sums tokens from database** (no API call needed):
   ```javascript
   conversationHistoryTokens = 5 + 150 + 7 + 200 + 9 + 180 = 551 tokens
   ```

2. **Estimates current input being typed:**
   ```javascript
   currentInputTokens = estimate_token_count("What about neural networks?") = 4 tokens
   ```

3. **Shows total:**
   ```javascript
   totalInputTokens = 551 + 4 = 555 tokens
   ```

This avoids sending the entire conversation history to the backend for estimation.

---

## 🔑 Key Points

### What Gets Calculated

The equation: `current_prompt_tokens = prompt_tokens - sum_previous_tokens`

Where `sum_previous_tokens` includes:
- ✅ All previous user messages' `input_tokens`
- ✅ All previous assistant messages' `output_tokens` (they count as input when sent back to OpenRouter)

### When Calculation Happens

- **Follow-up messages**: Calculates actual tokens from OpenRouter response
- **New conversations**: Uses estimate (system message tokens aren't tracked separately)
- **Missing data**: Falls back to estimate if previous tokens aren't available

### Benefits

1. **Accurate token tracking**: Database reflects actual token usage from OpenRouter
2. **Efficient frontend estimation**: Frontend can sum tokens from database without API calls
3. **Correct context management**: Token counts match actual usage for context window calculations
4. **Backward compatible**: Handles cases where previous messages don't have token data

---

## 🧪 Testing Considerations

### Test Cases

1. **New conversation**: Verify estimate is used
2. **First follow-up**: Verify calculation is correct
3. **Multiple follow-ups**: Verify cumulative calculation works
4. **Missing token data**: Verify fallback to estimate
5. **Edge cases**: Negative results, zero previous tokens, etc.

### Verification

- Check database `input_tokens` values match expected calculations
- Verify frontend token estimation works correctly
- Ensure no regression in existing functionality

---

## 📝 Related Files

- `backend/app/routers/api.py` - Main implementation (lines ~1151-1205)
- `backend/app/models.py` - Database schema (`ConversationMessage` model)
- `backend/app/model_runner.py` - OpenRouter API calls and token extraction

---

## 🔄 Migration Notes

- Existing conversations without token data will fall back to estimates
- New conversations will have accurate token tracking from the start
- No database migration required (uses existing `input_tokens` and `output_tokens` columns)

