# Database Schema

Database schema documentation for CompareIntel.

## Overview

CompareIntel uses SQLAlchemy ORM with support for:
- **SQLite** (development)
- **PostgreSQL** (production)

## Entity Relationship Diagram

```
User
├── UserPreference (1:1)
├── Conversation (1:N)
├── UsageLog (1:N)
├── CreditTransaction (1:N)
├── SubscriptionHistory (1:N)
├── PaymentTransaction (1:N)
└── AdminActionLog (1:N) [as admin_user or target_user]

Conversation
├── ConversationMessage (1:N)
└── Conversation (self-reference for breakouts)

ProcessedStripeWebhook (standalone — Stripe webhook idempotency)
```

## Models

### User

Core user account model with authentication, subscription, and credit tracking.

**Table:** `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `email` | String(255) | Unique, indexed |
| `password_hash` | String(255) | Bcrypt hashed password |
| `is_verified` | Boolean | Email verification status |
| `is_active` | Boolean | Account active status |
| `verification_token` | String(255) | Email verification token |
| `verification_token_expires` | DateTime | Token expiration |
| `reset_token` | String(255) | Password reset token |
| `reset_token_expires` | DateTime | Reset token expiration |
| `subscription_tier` | String(50) | free/starter/starter_plus/pro/pro_plus |
| `subscription_status` | String(50) | active/cancelled/expired |
| `subscription_period` | String(20) | monthly/yearly |
| `subscription_start_date` | DateTime | Subscription start |
| `subscription_end_date` | DateTime | Subscription end |
| `role` | String(50) | user/moderator/admin/super_admin |
| `is_admin` | Boolean | Admin flag |
| `admin_permissions` | Text | JSON permissions |
| `mock_mode_enabled` | Boolean | Testing mode |
| `stripe_customer_id` | String(255) | Stripe customer ID |
| `stripe_subscription_id` | String(255) | Stripe subscription ID |
| `overage_enabled` | Boolean | User opted into pay-as-you-go overage for the current period |
| `overage_spend_limit_cents` | Integer | Optional overage dollar cap in cents (NULL = unlimited) |
| `overage_credits_used_this_period` | Integer | Overage credits consumed this billing period |
| `trial_ends_at` | DateTime | 7-day trial expiration (NULL = no trial) |
| `monthly_credits_allocated` | Integer | Credits for billing period |
| `credits_used_this_period` | Integer | Credits consumed |
| `total_credits_used` | Integer | Lifetime credits |
| `billing_period_start` | DateTime | Billing period start |
| `billing_period_end` | DateTime | Billing period end |
| `credits_reset_at` | DateTime | Next credit reset |
| `monthly_overage_count` | Integer | Overage model responses |
| `overage_reset_date` | Date | Overage reset date |
| `last_access` | DateTime | Last website access |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

**Computed Property:** `credits_remaining` = max(0, `monthly_credits_allocated` - `credits_used_this_period`)

---

### UserPreference

User preferences and settings.

**Table:** `user_preferences`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id (unique) |
| `preferred_models` | Text | JSON array of model IDs |
| `theme` | String(50) | light/dark |
| `email_notifications` | Boolean | Email notifications enabled |
| `usage_alerts` | Boolean | Usage alerts enabled |
| `timezone` | String(50) | IANA timezone (e.g., "America/Chicago") |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

---

### Conversation

Conversation/comparison history.

**Table:** `conversations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id |
| `title` | String(255) | Optional user-defined title |
| `input_data` | Text | The prompt/input text |
| `models_used` | Text | JSON array of model IDs |
| `conversation_type` | String(20) | comparison/breakout |
| `parent_conversation_id` | Integer | FK → conversations.id (for breakouts) |
| `breakout_model_id` | String(255) | Model ID for breakout conversations |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

---

### ConversationMessage

Individual messages within a conversation.

**Table:** `conversation_messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `conversation_id` | Integer | FK → conversations.id |
| `model_id` | String(255) | Model ID (null for user messages) |
| `role` | String(20) | user/assistant |
| `content` | Text | Message content |
| `input_tokens` | Integer | Input tokens (for user messages) |
| `output_tokens` | Integer | Output tokens (for assistant messages) |
| `success` | Boolean | Processing success |
| `processing_time_ms` | Integer | Processing time in ms |
| `created_at` | DateTime | Creation timestamp |

---

### UsageLog

Detailed usage tracking for analytics and billing.

**Table:** `usage_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id (nullable for anonymous) |
| `ip_address` | String(45) | IPv4 or IPv6 |
| `browser_fingerprint` | String(64) | SHA-256 hash |
| `models_used` | Text | JSON array of model IDs |
| `input_length` | Integer | Input text length |
| `models_requested` | Integer | Number of models requested |
| `models_successful` | Integer | Successful responses |
| `models_failed` | Integer | Failed responses |
| `processing_time_ms` | Integer | Total processing time |
| `input_tokens` | Integer | Total input tokens |
| `output_tokens` | Integer | Total output tokens |
| `total_tokens` | Integer | Combined tokens |
| `effective_tokens` | Integer | Legacy token tally (input + output×2.5); billing is cost-based |
| `credits_used` | DECIMAL(10,4) | Credits deducted |
| `actual_cost` | DECIMAL(10,4) | Actual API cost |
| `estimated_cost` | DECIMAL(10,4) | Estimated cost |
| `is_overage` | Boolean | Overage flag |
| `overage_charge` | DECIMAL(10,4) | Overage charge |
| `created_at` | DateTime | Creation timestamp |

---

### CreditTransaction

Audit trail for credit operations.

**Table:** `credit_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id |
| `transaction_type` | String(50) | allocation/usage/purchase/refund/expiration |
| `credits_amount` | Integer | Positive or negative amount |
| `description` | Text | Human-readable description |
| `related_usage_log_id` | Integer | FK → usage_logs.id (nullable) |
| `created_at` | DateTime | Creation timestamp |

---

### UsageLogMonthlyAggregate

Monthly aggregated usage statistics for data retention.

**Table:** `usage_log_monthly_aggregates`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `year` | Integer | Year |
| `month` | Integer | Month (1-12) |
| `total_comparisons` | Integer | Total comparisons |
| `total_models_requested` | Integer | Total models requested |
| `total_models_successful` | Integer | Successful responses |
| `total_models_failed` | Integer | Failed responses |
| `total_input_tokens` | BigInteger | Total input tokens |
| `total_output_tokens` | BigInteger | Total output tokens |
| `total_effective_tokens` | BigInteger | Sum of legacy effective-token tallies |
| `avg_input_tokens` | DECIMAL | Average input tokens |
| `avg_output_tokens` | DECIMAL | Average output tokens |
| `avg_output_ratio` | DECIMAL | Output/input ratio |
| `total_credits_used` | DECIMAL | Total credits |
| `avg_credits_per_comparison` | DECIMAL | Average credits |
| `total_actual_cost` | DECIMAL | Total API cost |
| `total_estimated_cost` | DECIMAL | Total estimated cost |
| `model_breakdown` | Text | JSON breakdown by model |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

**Constraints:** Unique on (year, month)

---

### SubscriptionHistory

Track subscription changes.

**Table:** `subscription_history`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id |
| `previous_tier` | String(50) | Previous tier |
| `new_tier` | String(50) | New tier |
| `period` | String(20) | monthly/yearly |
| `amount_paid` | DECIMAL(10,2) | Payment amount |
| `stripe_payment_id` | String(255) | Stripe ID |
| `reason` | String(100) | upgrade/downgrade/renewal/cancellation/initial |
| `created_at` | DateTime | Creation timestamp |

---

### PaymentTransaction

Payment transaction records.

**Table:** `payment_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `user_id` | Integer | FK → users.id |
| `stripe_payment_intent_id` | String(255) | Stripe payment intent |
| `amount` | DECIMAL(10,2) | Amount |
| `currency` | String(3) | Currency (USD) |
| `status` | String(50) | pending/succeeded/failed/refunded |
| `description` | Text | Description |
| `created_at` | DateTime | Creation timestamp |

---

### AdminActionLog

Audit log for admin actions.

**Table:** `admin_action_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `admin_user_id` | Integer | FK → users.id |
| `target_user_id` | Integer | FK → users.id |
| `action_type` | String(100) | Action type |
| `action_description` | Text | Description |
| `details` | Text | JSON details |
| `ip_address` | String(45) | IP address |
| `user_agent` | Text | User agent |
| `created_at` | DateTime | Creation timestamp |

---

### AppSettings

Global application settings (single row).

**Table:** `app_settings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key (always 1) |
| `anonymous_mock_mode_enabled` | Boolean | Mock mode for anonymous users |
| `active_search_provider` | String(50) | Search provider (brave/tavily) |
| `search_provider_config` | Text | JSON provider config |
| `web_search_enabled` | Boolean | Web search enabled |
| `created_at` | DateTime | Creation timestamp |
| `updated_at` | DateTime | Last update timestamp |

---

### ProcessedStripeWebhook

Idempotency table for Stripe webhook events — prevents duplicate processing.

**Table:** `processed_stripe_webhooks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `stripe_event_id` | String(255) | Unique Stripe event ID |
| `created_at` | DateTime | When the event was processed |

**Constraints:** Unique on `stripe_event_id`

---

## Cascading Deletes

- **User → Preferences:** Cascade delete
- **User → Conversations:** Cascade delete
- **User → CreditTransactions:** Cascade delete
- **User → SubscriptionHistory:** Cascade delete
- **User → PaymentTransactions:** Cascade delete
- **Conversation → Messages:** Cascade delete
- **Conversation → Breakouts:** Set NULL (preserve breakout conversations)
- **User → UsageLogs:** Set NULL (preserve anonymous logs)
- **User → AdminActionLogs:** Set NULL (preserve audit trail)
- **UsageLog → CreditTransactions:** Set NULL

---

## Schema Management

Tables are created automatically using SQLAlchemy's `Base.metadata.create_all()` in development. In production, tables should already exist.
