# Database Schema

Complete database schema documentation for CompareIntel.

## Overview

CompareIntel uses SQLAlchemy ORM with support for:
- **SQLite** (development)
- **PostgreSQL** (production)

All models use SQLAlchemy declarative base and include proper relationships, indexes, and constraints.

## Entity Relationship Diagram

```
User
├── UserPreference (1:1)
├── Conversation (1:N)
├── UsageLog (1:N)
├── SubscriptionHistory (1:N)
├── PaymentTransaction (1:N)
└── AdminActionLog (1:N) [as admin_user or target_user]
```

## Models

### User

Core user account model with authentication and subscription details.

**Table:** `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `email` | String(255) | Unique, Not Null, Index | User email address |
| `password_hash` | String(255) | Not Null | Bcrypt hashed password |
| `is_verified` | Boolean | Default: False | Email verification status |
| `is_active` | Boolean | Default: True | Account active status |
| `verification_token` | String(255) | Index | Email verification token |
| `verification_token_expires` | DateTime | | Token expiration |
| `reset_token` | String(255) | Index | Password reset token |
| `reset_token_expires` | DateTime | | Reset token expiration |
| `subscription_tier` | String(50) | Default: "free" | Tier: free/starter/starter_plus/pro/pro_plus |
| `subscription_status` | String(50) | Default: "active" | Status: active/cancelled/expired |
| `subscription_period` | String(20) | Default: "monthly" | Period: monthly/yearly |
| `subscription_start_date` | DateTime | | Subscription start |
| `subscription_end_date` | DateTime | | Subscription end |
| `role` | String(50) | Default: "user" | Role: user/moderator/admin/super_admin |
| `is_admin` | Boolean | Default: False | Admin flag |
| `admin_permissions` | Text | | JSON permissions |
| `mock_mode_enabled` | Boolean | Default: False | Testing mode |
| `stripe_customer_id` | String(255) | Index | Stripe customer ID |
| `daily_usage_count` | Integer | Default: 0 | Model responses used today |
| `usage_reset_date` | Date | Default: current_date | Last usage reset |
| `monthly_overage_count` | Integer | Default: 0 | Monthly overage count |
| `overage_reset_date` | Date | Default: current_date | Last overage reset |
| `daily_extended_usage` | Integer | Default: 0 | Extended tier usage today |
| `extended_usage_reset_date` | Date | Default: current_date | Last extended reset |
| `created_at` | DateTime | Default: now() | Creation timestamp |
| `updated_at` | DateTime | Default: now(), OnUpdate | Last update timestamp |

**Relationships:**
- `preferences`: One-to-one with `UserPreference`
- `conversations`: One-to-many with `Conversation`
- `usage_logs`: One-to-many with `UsageLog`
- `subscription_history`: One-to-many with `SubscriptionHistory`
- `payment_transactions`: One-to-many with `PaymentTransaction`

**Indexes:**
- `id` (primary key)
- `email` (unique)
- `verification_token`
- `reset_token`
- `stripe_customer_id`

---

### UserPreference

User preferences and settings.

**Table:** `user_preferences`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `user_id` | Integer | FK → users.id, Unique, Not Null | User reference |
| `preferred_models` | Text | | JSON array of model IDs |
| `theme` | String(50) | Default: "light" | UI theme: light/dark |
| `email_notifications` | Boolean | Default: True | Email notifications enabled |
| `usage_alerts` | Boolean | Default: True | Usage alerts enabled |
| `created_at` | DateTime | Default: now() | Creation timestamp |
| `updated_at` | DateTime | Default: now(), OnUpdate | Last update timestamp |

**Relationships:**
- `user`: Many-to-one with `User`

**Constraints:**
- `user_id` is unique (one preference per user)
- Cascade delete on user deletion

---

### Conversation

Conversation/comparison history.

**Table:** `conversations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `user_id` | Integer | FK → users.id, Not Null, Index | User reference |
| `title` | String(255) | | Optional user-defined title |
| `input_data` | Text | Not Null | The prompt/input text |
| `models_used` | Text | Not Null | JSON array of model IDs |
| `created_at` | DateTime | Default: now(), Index | Creation timestamp |
| `updated_at` | DateTime | Default: now(), OnUpdate | Last update timestamp |

**Relationships:**
- `user`: Many-to-one with `User`
- `messages`: One-to-many with `ConversationMessage`

**Indexes:**
- `id` (primary key)
- `user_id`
- `created_at`

---

### ConversationMessage

Individual messages within a conversation.

**Table:** `conversation_messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `conversation_id` | Integer | FK → conversations.id, Not Null, Index | Conversation reference |
| `model_id` | String(255) | | Model ID (null for user messages) |
| `role` | String(20) | Not Null | Message role: user/assistant |
| `content` | Text | Not Null | Message content |
| `success` | Boolean | Default: True | Processing success |
| `processing_time_ms` | Integer | | Processing time in milliseconds |
| `created_at` | DateTime | Default: now() | Creation timestamp |

**Relationships:**
- `conversation`: Many-to-one with `Conversation`

**Indexes:**
- `id` (primary key)
- `conversation_id`

---

### UsageLog

Detailed usage tracking for analytics and cost analysis.

**Table:** `usage_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `user_id` | Integer | FK → users.id, Nullable, Index | User reference (null for anonymous) |
| `ip_address` | String(45) | | IPv4 or IPv6 address |
| `browser_fingerprint` | String(64) | | SHA-256 hash of fingerprint |
| `models_used` | Text | | JSON array of model IDs |
| `input_length` | Integer | | Input text length |
| `models_requested` | Integer | | Number of models requested |
| `models_successful` | Integer | | Number of successful responses |
| `models_failed` | Integer | | Number of failed responses |
| `processing_time_ms` | Integer | | Total processing time |
| `estimated_cost` | DECIMAL(10,4) | | Estimated cost in USD |
| `is_overage` | Boolean | Default: False | Overage flag |
| `overage_charge` | DECIMAL(10,4) | Default: 0 | Overage charge |
| `created_at` | DateTime | Default: now(), Index | Creation timestamp |

**Relationships:**
- `user`: Many-to-one with `User` (nullable for anonymous users)

**Indexes:**
- `id` (primary key)
- `user_id`
- `created_at`

---

### SubscriptionHistory

Track subscription changes (upgrades, downgrades, renewals).

**Table:** `subscription_history`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `user_id` | Integer | FK → users.id, Not Null, Index | User reference |
| `previous_tier` | String(50) | | Previous tier (null for initial) |
| `new_tier` | String(50) | Not Null | New tier |
| `period` | String(20) | | Period: monthly/yearly |
| `amount_paid` | DECIMAL(10,2) | | Payment amount |
| `stripe_payment_id` | String(255) | | Stripe payment ID |
| `reason` | String(100) | | Reason: upgrade/downgrade/renewal/cancellation/initial |
| `created_at` | DateTime | Default: now(), Index | Creation timestamp |

**Relationships:**
- `user`: Many-to-one with `User`

**Indexes:**
- `id` (primary key)
- `user_id`
- `created_at`

---

### PaymentTransaction

Track all payment transactions for audit and support.

**Table:** `payment_transactions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `user_id` | Integer | FK → users.id, Not Null, Index | User reference |
| `stripe_payment_intent_id` | String(255) | Index | Stripe payment intent ID |
| `amount` | DECIMAL(10,2) | Not Null | Transaction amount |
| `currency` | String(3) | Default: "USD" | Currency code |
| `status` | String(50) | | Status: pending/succeeded/failed/refunded |
| `description` | Text | | Transaction description |
| `created_at` | DateTime | Default: now() | Creation timestamp |

**Relationships:**
- `user`: Many-to-one with `User`

**Indexes:**
- `id` (primary key)
- `user_id`
- `stripe_payment_intent_id`

---

### AdminActionLog

Audit log for all admin actions.

**Table:** `admin_action_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Index | Primary key |
| `admin_user_id` | Integer | FK → users.id, Nullable, Index | Admin user reference |
| `target_user_id` | Integer | FK → users.id, Nullable, Index | Target user reference |
| `action_type` | String(100) | Not Null | Action type: user_create/user_update/etc |
| `action_description` | Text | Not Null | Human-readable description |
| `details` | Text | | JSON string with action-specific data |
| `ip_address` | String(45) | | IPv4 or IPv6 address |
| `user_agent` | Text | | User agent string |
| `created_at` | DateTime | Default: now(), Index | Creation timestamp |

**Relationships:**
- `admin_user`: Many-to-one with `User` (admin who performed action)
- `target_user`: Many-to-one with `User` (user affected by action)

**Indexes:**
- `id` (primary key)
- `admin_user_id`
- `target_user_id`
- `created_at`

---

### AppSettings

Global application settings (single row table).

**Table:** `app_settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Integer | PK, Default: 1 | Primary key (always 1) |
| `anonymous_mock_mode_enabled` | Boolean | Default: False | Mock mode for anonymous users |
| `created_at` | DateTime | Default: now() | Creation timestamp |
| `updated_at` | DateTime | Default: now(), OnUpdate | Last update timestamp |

**Note:** This table should only have one row (id=1).

---

## Database Schema Management

Database tables are created automatically using SQLAlchemy's `Base.metadata.create_all()` in development mode. In production, tables should already exist or be created manually.

---

## Query Examples

### Get User with Preferences

```python
user = db.query(User).options(
    joinedload(User.preferences)
).filter(User.id == user_id).first()
```

### Get User Conversations with Messages

```python
conversations = db.query(Conversation).options(
    joinedload(Conversation.messages)
).filter(Conversation.user_id == user_id).all()
```

### Get Usage Statistics

```python
from sqlalchemy import func

stats = db.query(
    func.count(UsageLog.id).label('total_requests'),
    func.sum(UsageLog.models_successful).label('total_successful'),
    func.sum(UsageLog.estimated_cost).label('total_cost')
).filter(
    UsageLog.user_id == user_id,
    UsageLog.created_at >= start_date
).first()
```

### Get Admin Action Logs

```python
logs = db.query(AdminActionLog).options(
    joinedload(AdminActionLog.admin_user),
    joinedload(AdminActionLog.target_user)
).filter(
    AdminActionLog.created_at >= start_date
).order_by(AdminActionLog.created_at.desc()).all()
```

---

## Performance Considerations

### Indexes

All foreign keys and frequently queried columns are indexed:
- User email (unique lookup)
- User tokens (verification/reset)
- Conversation user_id and created_at
- UsageLog user_id and created_at
- AdminActionLog timestamps

### Query Optimization

1. **Use joinedload for relationships:**
   ```python
   user = db.query(User).options(joinedload(User.preferences)).first()
   ```

2. **Filter before joining:**
   ```python
   conversations = db.query(Conversation).filter(
       Conversation.user_id == user_id
   ).options(joinedload(Conversation.messages)).all()
   ```

3. **Use select_related for single relationships:**
   ```python
   message = db.query(ConversationMessage).options(
       joinedload(ConversationMessage.conversation)
   ).first()
   ```

### Caching

- Model list is cached (static data)
- AppSettings are cached (rarely changes)
- User data can be cached (with TTL)

---

## Data Integrity

### Cascading Deletes

- **User → Preferences:** Cascade delete
- **User → Conversations:** Cascade delete
- **User → SubscriptionHistory:** Cascade delete
- **User → PaymentTransactions:** Cascade delete
- **Conversation → Messages:** Cascade delete
- **User → UsageLogs:** Set NULL (preserve anonymous logs)
- **User → AdminActionLogs:** Set NULL (preserve audit trail)

### Constraints

- Email uniqueness enforced at database level
- Foreign key constraints ensure referential integrity
- Check constraints on enum-like fields (via application layer)

---

**Last Updated:** January 2025  
**Schema Version:** 1.0

