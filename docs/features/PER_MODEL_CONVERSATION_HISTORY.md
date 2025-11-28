# Per-Model Conversation History Filtering

**Date:** January 2025  
**Status:** ✅ Complete  
**Related Feature:** Multi-model comparison with follow-up conversations

---

## 🎯 Overview

Implemented independent conversation history filtering for each model in multi-model comparisons. Each model now receives only its own conversation history (all user messages + only its own assistant messages), ensuring fair, independent model comparisons.

---

## 🐛 The Problem

Previously, when multiple models were compared in follow-up conversations:

1. **Frontend** sent the first selected model's conversation history to all models
2. **Backend** sent the same conversation history to all models without filtering
3. **Result**: All models received the same history, including other models' responses

This created several issues:
- ❌ Models could see and be influenced by other models' responses
- ❌ Not a fair comparison - models weren't responding independently
- ❌ Models that weren't the first selected didn't see their own previous responses
- ❌ Follow-ups became about inter-model conversation rather than the original question

---

## ✅ The Solution

### Architecture

**Frontend:**
- Collects all messages from all selected model conversations
- Includes `model_id` tag for each assistant message
- Sends complete conversation history with model tags to backend

**Backend:**
- Filters conversation history per model before sending to OpenRouter
- Each model receives:
  - ✅ All user messages (shared context)
  - ✅ Only assistant messages where `model_id` matches the current model

### Implementation Details

#### Frontend Changes (`App.tsx`)

```typescript
// Build conversation history with model_id tags
const apiConversationHistory = isFollowUpMode && conversations.length > 0
  ? (() => {
      // Collect all messages from all selected conversations
      const allMessages = []
      
      selectedConversations.forEach(conv => {
        conv.messages.forEach(msg => {
          allMessages.push({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.content,
            model_id: msg.type === 'assistant' ? conv.modelId : undefined,
            timestamp: msg.timestamp,
          })
        })
      })
      
      // Deduplicate user messages, sort by timestamp
      // Return with model_id tags for backend filtering
      return deduplicatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
        model_id: msg.model_id, // Backend uses this to filter
      }))
    })()
  : []
```

#### Backend Changes (`api.py`)

```python
# Filter conversation history for this specific model
filtered_history = []
if req.conversation_history:
    for msg in req.conversation_history:
        # Always include user messages
        if msg.role == "user":
            filtered_history.append(msg)
        # Only include assistant messages from this model
        elif msg.role == "assistant":
            if msg.model_id is None or msg.model_id == model_id:
                filtered_history.append(msg)

# Send filtered history to this model
gen = call_openrouter_streaming(
    req.input_data,
    model_id,
    filtered_history,  # Filtered per model
    use_mock,
    max_tokens_override=effective_max_tokens,
)
```

#### API Schema Updates

**Backend (`ConversationMessage`):**
```python
class ConversationMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    model_id: Optional[str] = None  # Optional model ID for assistant messages
```

**Frontend (`CompareRequestPayload`):**
```typescript
interface CompareRequestPayload {
  conversation_history?: Array<{
    role: string
    content: string
    model_id?: string  // Optional model ID for filtering
  }>
}
```

---

## 📊 Example Flow

### Initial Comparison

**User asks:** "What is quantum computing?"

**Models respond:**
- GPT-4: "Quantum computing uses quantum mechanics..."
- Claude: "Quantum computing is a type of computing..."

**Database stores:**
```
User: "What is quantum computing?" (model_id: null)
Assistant: "Quantum computing uses..." (model_id: "openai/gpt-4")
Assistant: "Quantum computing is..." (model_id: "anthropic/claude-3-opus")
```

### Follow-up Comparison

**User asks:** "How does it relate to cryptography?"

**Frontend sends:**
```json
{
  "conversation_history": [
    {"role": "user", "content": "What is quantum computing?"},
    {"role": "assistant", "content": "Quantum computing uses...", "model_id": "openai/gpt-4"},
    {"role": "assistant", "content": "Quantum computing is...", "model_id": "anthropic/claude-3-opus"}
  ]
}
```

**Backend filters per model:**

**GPT-4 receives:**
```
User: "What is quantum computing?"
Assistant: "Quantum computing uses..." (its own response)
User: "How does it relate to cryptography?"
```

**Claude receives:**
```
User: "What is quantum computing?"
Assistant: "Quantum computing is..." (its own response)
User: "How does it relate to cryptography?"
```

**Result:**
- ✅ Each model continues its own conversation independently
- ✅ Fair comparison - models aren't influenced by each other
- ✅ True test of how each model handles follow-ups

---

## 🔑 Key Benefits

1. **Fair Comparisons**: Each model responds independently without seeing other models' responses
2. **True Quality Assessment**: Users can evaluate how each model handles follow-ups on its own
3. **Consistent Context**: Each model maintains its own conversation thread
4. **Better User Experience**: Follow-ups test the original question, not inter-model conversation

---

## 🔄 Backward Compatibility

- Messages without `model_id` are sent to all models (legacy support)
- Existing conversations continue to work
- New conversations automatically use per-model filtering

---

## 📝 Related Documentation

- [API Documentation](../architecture/API.md) - Request/response formats
- [Database Schema](../architecture/DATABASE.md) - Message storage structure
- [Token Tracking Fix](./TOKEN_TRACKING_FIX.md) - Token calculation for follow-ups

