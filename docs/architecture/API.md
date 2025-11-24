# CompareIntel API Documentation

Complete API reference for CompareIntel endpoints, including request/response schemas, authentication, and error handling.

## Base URL

- **Development:** `http://localhost:8000/api`
- **Production:** `https://compareintel.com/api`

## Authentication

CompareIntel uses JWT (JSON Web Tokens) for authentication. Most endpoints require authentication, except for:
- `/api/auth/*` endpoints (registration, login)
- `/api/models` (public model list)
- `/api/anonymous-mock-mode-status` (development only)

### Authentication Flow

1. **Register** or **Login** to get access and refresh tokens
2. Include the access token in the `Authorization` header: `Bearer <access_token>`
3. Refresh tokens when they expire (access tokens expire in 30 minutes)

### Example Authentication Request

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### Example Authenticated Request

```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data or parameters |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 422 | Unprocessable Entity | Validation error (e.g., invalid email format) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

Some errors may include additional fields:

```json
{
  "detail": "Validation error",
  "code": "VALIDATION_ERROR",
  "field": "email"
}
```

---

## Authentication Endpoints

### POST `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one digit
- At least one uppercase letter
- At least one lowercase letter
- At least one special character: `!@#$%^&*()_+-=[]{};':"\\|,.<>/?`

**Response:** `201 Created`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "is_verified": false,
    "is_active": true,
    "role": "user",
    "is_admin": false,
    "subscription_tier": "free",
    "subscription_status": "active",
    "subscription_period": "monthly",
    "daily_usage_count": 0,
    "monthly_overage_count": 0,
    "created_at": "2025-01-15T10:00:00Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Email already registered
- `422 Unprocessable Entity`: Invalid email format or password doesn't meet requirements

---

### POST `/api/auth/login`

Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "is_verified": true,
    "is_active": true,
    "role": "user",
    "subscription_tier": "pro",
    "subscription_status": "active",
    "daily_usage_count": 5,
    "monthly_overage_count": 0
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid email or password
- `403 Forbidden`: Account is inactive

---

### POST `/api/auth/refresh`

Refresh an expired access token using a refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired refresh token

---

### POST `/api/auth/verify-email`

Verify email address with verification token.

**Request Body:**
```json
{
  "token": "verification-token-from-email"
}
```

**Response:** `200 OK`
```json
{
  "message": "Email verified successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or expired verification token
- `400 Bad Request`: Email already verified

---

### POST `/api/auth/resend-verification`

Resend verification email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "Verification email sent"
}
```

---

### POST `/api/auth/forgot-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset email sent"
}
```

---

### POST `/api/auth/reset-password`

Reset password with reset token.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "new_password": "NewSecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or expired reset token
- `422 Unprocessable Entity`: Password doesn't meet requirements

---

### POST `/api/auth/logout`

Logout and invalidate refresh token.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

### GET `/api/auth/me`

Get current authenticated user information.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_verified": true,
  "is_active": true,
  "role": "user",
  "is_admin": false,
  "subscription_tier": "pro",
  "subscription_status": "active",
  "subscription_period": "monthly",
  "daily_usage_count": 5,
  "monthly_overage_count": 0,
  "created_at": "2025-01-15T10:00:00Z"
}
```

---

### DELETE `/api/auth/delete-account`

Delete user account permanently.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Account deleted successfully"
}
```

---

## Core AI Comparison Endpoints

### POST `/api/compare-stream`

Compare multiple AI models with a single prompt using Server-Sent Events (SSE) streaming.

**Authentication:** Optional

**Request Body:** Same as `/api/compare`

**Response:** `200 OK` (Streaming)

The response is a stream of Server-Sent Events:

```
data: {"model": "openai/gpt-4", "type": "start"}

data: {"model": "openai/gpt-4", "type": "chunk", "content": "Quantum"}

data: {"model": "openai/gpt-4", "type": "chunk", "content": " computing"}

data: {"model": "openai/gpt-4", "type": "done"}

data: {"model": "anthropic/claude-3-opus", "type": "start"}

data: {"model": "anthropic/claude-3-opus", "type": "chunk", "content": "Quantum"}

data: {"type": "complete", "metadata": {"processing_time_ms": 3500, "models_successful": 3}}
```

**Event Types:**
- `start`: Model started processing
- `chunk`: Token chunk received
- `done`: Model finished processing
- `complete`: All models finished
- `error`: Error occurred

**Example JavaScript Client:**
```javascript
const eventSource = new EventSource('/api/compare-stream', {
  method: 'POST',
  body: JSON.stringify({
    input_data: "Explain quantum computing",
    models: ["openai/gpt-4"]
  })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'chunk') {
    console.log(`Model ${data.model}: ${data.content}`);
  }
};
```

---

### GET `/api/models`

Get list of all available AI models.

**Authentication:** Not required

**Response:** `200 OK`
```json
{
  "models": {
    "openai/gpt-4": {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "provider": "OpenAI",
      "context_length": 8192,
      "pricing": {
        "prompt": "0.03",
        "completion": "0.06"
      }
    },
    ...
  },
  "models_by_provider": {
    "OpenAI": ["openai/gpt-4", "openai/gpt-3.5-turbo", ...],
    "Anthropic": ["anthropic/claude-3-opus", ...],
    ...
  }
}
```

---

### GET `/api/rate-limit-status`

Get current rate limit status.

**Authentication:** Optional

**Query Parameters:**
- `fingerprint` (string, optional): Browser fingerprint for anonymous users

**Response (Authenticated User):** `200 OK`
```json
{
  "daily_usage": 5,
  "daily_limit": 200,
  "remaining_usage": 195,
  "subscription_tier": "pro",
  "usage_reset_date": "2025-01-16",
  "authenticated": true,
  "email": "user@example.com",
  "subscription_status": "active"
}
```

**Response (Anonymous User):** `200 OK`
```json
{
  "daily_usage": 3,
  "daily_limit": 10,
  "remaining_usage": 7,
  "authenticated": false,
  "ip_address": "192.168.1.1",
  "fingerprint_usage": 2,
  "fingerprint_remaining": 8
}
```

---

### GET `/api/model-stats`

Get performance statistics for models.

**Authentication:** Not required

**Response:** `200 OK`
```json
{
  "openai/gpt-4": {
    "success": 150,
    "failure": 2,
    "last_error": null,
    "last_success": "2025-01-15T10:00:00Z"
  },
  ...
}
```

---

### GET `/api/conversations`

List user's conversations.

**Authentication:** Required

**Query Parameters:**
- `page` (integer, optional): Page number (default: 1)
- `per_page` (integer, optional): Items per page (default: 20)

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "title": "Quantum Computing Discussion",
    "input_data": "Explain quantum computing",
    "models_used": ["openai/gpt-4", "anthropic/claude-3-opus"],
    "created_at": "2025-01-15T10:00:00Z",
    "message_count": 4
  },
  ...
]
```

---

### GET `/api/conversations/{id}`

Get detailed conversation with messages.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": 1,
  "title": "Quantum Computing Discussion",
  "input_data": "Explain quantum computing",
  "models_used": ["openai/gpt-4", "anthropic/claude-3-opus"],
  "created_at": "2025-01-15T10:00:00Z",
  "messages": [
    {
      "id": 1,
      "model_id": null,
      "role": "user",
      "content": "Explain quantum computing",
      "success": true,
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": 2,
      "model_id": "openai/gpt-4",
      "role": "assistant",
      "content": "Quantum computing is...",
      "success": true,
      "processing_time_ms": 1200,
      "created_at": "2025-01-15T10:00:01Z"
    }
  ]
}
```

**Error Responses:**
- `404 Not Found`: Conversation not found or doesn't belong to user

---

### DELETE `/api/conversations/{id}`

Delete a conversation.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Conversation deleted successfully"
}
```

**Error Responses:**
- `404 Not Found`: Conversation not found or doesn't belong to user

---

## Admin Endpoints

All admin endpoints require admin privileges (`is_admin: true`).

### GET `/api/admin/stats`

Get admin dashboard statistics.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "total_users": 150,
  "active_users": 120,
  "verified_users": 100,
  "users_by_tier": {
    "free": 50,
    "starter": 30,
    "pro": 20
  },
  "users_by_role": {
    "user": 145,
    "admin": 5
  },
  "recent_registrations": 10,
  "total_usage_today": 500,
  "admin_actions_today": 5
}
```

---

### GET `/api/admin/users`

List all users with pagination.

**Authentication:** Required (Admin)

**Query Parameters:**
- `page` (integer, optional): Page number (default: 1)
- `per_page` (integer, optional): Items per page (default: 20)
- `search` (string, optional): Search by email
- `tier` (string, optional): Filter by subscription tier
- `role` (string, optional): Filter by role

**Response:** `200 OK`
```json
{
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "is_verified": true,
      "is_active": true,
      "role": "user",
      "subscription_tier": "pro",
      "daily_usage_count": 5,
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

---

### GET `/api/admin/users/{user_id}`

Get user details.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_verified": true,
  "is_active": true,
  "role": "user",
  "subscription_tier": "pro",
  "subscription_status": "active",
  "daily_usage_count": 5,
  "monthly_overage_count": 0,
  "created_at": "2025-01-15T10:00:00Z"
}
```

---

### POST `/api/admin/users`

Create a new user.

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "role": "user",
  "subscription_tier": "pro",
  "subscription_period": "monthly",
  "is_active": true,
  "is_verified": false
}
```

**Response:** `201 Created`
```json
{
  "id": 151,
  "email": "newuser@example.com",
  "is_verified": false,
  "is_active": true,
  "role": "user",
  "subscription_tier": "pro",
  "created_at": "2025-01-15T10:00:00Z"
}
```

---

### PUT `/api/admin/users/{user_id}`

Update user information.

**Authentication:** Required (Admin)

**Request Body:** (all fields optional)
```json
{
  "email": "updated@example.com",
  "role": "moderator",
  "subscription_tier": "pro_plus",
  "subscription_status": "active",
  "is_active": true,
  "is_verified": true
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "updated@example.com",
  "role": "moderator",
  "subscription_tier": "pro_plus",
  "subscription_status": "active",
  "is_active": true,
  "is_verified": true
}
```

---

### DELETE `/api/admin/users/{user_id}`

Delete a user.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "message": "User deleted successfully"
}
```

---

### POST `/api/admin/users/{user_id}/toggle-active`

Toggle user active status.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "id": 1,
  "is_active": false,
  "message": "User deactivated"
}
```

---

### POST `/api/admin/users/{user_id}/reset-usage`

Reset user's daily usage count.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "message": "Usage reset successfully",
  "user_id": 1
}
```

---

### POST `/api/admin/users/{user_id}/toggle-mock-mode`

Toggle mock mode for testing (bypasses rate limits).

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "message": "Mock mode toggled",
  "user_id": 1,
  "mock_mode_enabled": true
}
```

---

### POST `/api/admin/users/{user_id}/change-tier`

Change user's subscription tier.

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "tier": "pro_plus",
  "period": "yearly"
}
```

**Response:** `200 OK`
```json
{
  "message": "Tier updated successfully",
  "user_id": 1,
  "new_tier": "pro_plus",
  "new_period": "yearly"
}
```

---

### POST `/api/admin/users/{user_id}/send-verification`

Resend verification email to user.

**Authentication:** Required (Admin)

**Response:** `200 OK`
```json
{
  "message": "Verification email sent"
}
```

---

### POST `/api/admin/users/{user_id}/reset-password`

Admin-initiated password reset.

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "new_password": "NewSecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

---

### GET `/api/admin/action-logs`

View admin action logs.

**Authentication:** Required (Admin)

**Query Parameters:**
- `page` (integer, optional): Page number
- `per_page` (integer, optional): Items per page
- `admin_user_id` (integer, optional): Filter by admin user
- `action_type` (string, optional): Filter by action type

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "admin_user_id": 5,
    "admin_user_email": "admin@example.com",
    "target_user_id": 1,
    "target_user_email": "user@example.com",
    "action_type": "change_tier",
    "action_description": "Changed subscription tier to pro_plus",
    "details": "{\"old_tier\": \"pro\", \"new_tier\": \"pro_plus\"}",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "created_at": "2025-01-15T10:00:00Z"
  }
]
```

---

## Rate Limiting

Rate limits are enforced per subscription tier:

| Tier | Daily Limit | Model Limit per Comparison |
|------|-------------|----------------------------|
| Anonymous | 10 | 3 |
| Free | 20 | 3 |
| Starter | 50 | 6 |
| Starter+ | 100 | 6 |
| Pro | 200 | 9 |
| Pro+ | 400 | 12 |

**Note:** Usage is tracked by individual model responses, not comparisons. Each model in a comparison counts as one response toward the daily limit.

When rate limit is exceeded, the API returns `429 Too Many Requests`:

```json
{
  "detail": "Rate limit exceeded. Daily limit: 20, Used: 20, Remaining: 0"
}
```

---

## WebSocket / SSE Streaming

The `/api/compare-stream` endpoint uses Server-Sent Events (SSE) for real-time streaming of model responses.

### Client Implementation Example

**JavaScript:**
```javascript
async function streamComparison(inputData, models) {
  const response = await fetch('/api/compare-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      input_data: inputData,
      models: models,
      tier: 'standard'
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        handleStreamEvent(data);
      }
    }
  }
}

function handleStreamEvent(data) {
  switch (data.type) {
    case 'start':
      console.log(`Model ${data.model} started`);
      break;
    case 'chunk':
      appendToModelOutput(data.model, data.content);
      break;
    case 'done':
      console.log(`Model ${data.model} finished`);
      break;
    case 'complete':
      console.log('All models complete', data.metadata);
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
  }
}
```

---

## Best Practices

1. **Always handle errors**: Check status codes and parse error responses
2. **Use refresh tokens**: Implement automatic token refresh before expiration
3. **Respect rate limits**: Check `/api/rate-limit-status` before making requests
4. **Use streaming**: For better UX, use `/api/compare-stream` for real-time responses
5. **Cache model list**: The `/api/models` endpoint is cached, but cache locally too
6. **Handle network errors**: Implement retry logic for transient failures
7. **Validate input**: Check tier limits before sending requests

---

## OpenAPI / Swagger Documentation

Interactive API documentation is available at:
- **Development:** `http://localhost:8000/docs`
- **Production:** `https://compareintel.com/docs`

The Swagger UI provides:
- Interactive API testing
- Request/response schemas
- Authentication testing
- Example requests

---

**Last Updated:** January 2025  
**API Version:** 1.0.0

