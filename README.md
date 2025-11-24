# CompareIntel

Compare responses from 50+ AI models side-by-side. Production-ready platform with authentication, tiered subscriptions, and comprehensive LaTeX/Markdown rendering.

**Live:** [https://compareintel.com](https://compareintel.com)

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** FastAPI (Python) + PostgreSQL/SQLite + JWT Authentication
- **AI Integration:** OpenRouter API (unified access to 50+ models)
- **Infrastructure:** Docker + Nginx + Let's Encrypt SSL
- **Deployment:** AWS EC2

## Key Features

- 50+ models from Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, Cohere, Qwen, xAI
- User authentication with email verification
- Tiered subscriptions (Free: 10/day, Starter: 25/day, Pro: 50/day + overages)
- Rate limiting (IP + browser fingerprint for anonymous, subscription-based for authenticated)
- LaTeX/KaTeX rendering for mathematical content
- Multi-turn conversations with context preservation
- Concurrent model processing (up to 12 models simultaneously)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- [OpenRouter API Key](https://openrouter.ai/) (free)

### Setup

```bash
git clone https://github.com/jaydeelew/CompareIntel.git
cd CompareIntel

# Configure backend environment
cd backend
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY and SECRET_KEY
# Generate SECRET_KEY: python -c "import secrets; print(secrets.token_urlsafe(32))"

# Configure frontend environment (optional - defaults work for local dev)
cd ../frontend
cp .env.example .env

# Start development environment
cd ..
docker compose up --build
```

**Access:** http://localhost:8080 (frontend) | http://localhost:8000 (API)

### Environment Variables

See **[Environment Setup Guide](docs/getting-started/ENVIRONMENT_SETUP.md)** for detailed configuration.

**Quick Reference:**
- **Backend:** Copy `backend/.env.example` to `backend/.env` and fill in:
  - `SECRET_KEY` (required) - Generate with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
  - `OPENROUTER_API_KEY` (required) - Get from [openrouter.ai](https://openrouter.ai/keys)
  - `DATABASE_URL` (optional) - Defaults to SQLite for development
  - Email configuration (optional) - For user verification emails

- **Frontend:** Copy `frontend/.env.example` to `frontend/.env` (optional - defaults work)
  - `VITE_API_URL` - Defaults to `/api` (uses Vite proxy)

## Production Deployment

```bash
# Manual deployment
docker compose -f docker-compose.ssl.yml up -d --build

# Or use deployment scripts
./deploy-production.sh
```

**Deploy Options:**

- `docker-compose.yml` - Development (HTTP)
- `docker-compose.dev-ssl.yml` - Development (HTTPS, self-signed)
- `docker-compose.prod.yml` - Production (HTTP)
- `docker-compose.ssl.yml` - Production (HTTPS, Let's Encrypt)

See [DEV_WORKFLOW.md](DEV_WORKFLOW.md) for detailed deployment workflows.

## Architecture

**Authentication Flow:**

- JWT tokens (30min access, 7-day refresh)
- Email verification via SendGrid/SMTP
- Password reset with secure tokens
- Optional anonymous usage (IP/fingerprint tracking)

**Rate Limiting (Model-Based):**

- Anonymous (unregistered): 10 model responses/day (IP + browser fingerprint)
- Free (registered): 20 model responses/day
- Starter: 50 model responses/day + overage options (pricing TBD)
- Starter+: 100 model responses/day + overage options (pricing TBD)
- Pro: 200 model responses/day + overage options (pricing TBD)
- Pro+: 400 model responses/day + overage options (pricing TBD)

**Model Limits per Comparison:**

- Anonymous: 3 models max
- Free: 3 models max
- Starter/Starter+: 6 models max
- Pro: 9 models max
- Pro+: 12 models max

**Support & Features:**

- Starter/Starter+: 48-hour email support, 10-20 conversations saved
- Pro/Pro+: 24-hour priority email support, 40-80 conversations saved

## Key API Endpoints

All endpoints are prefixed with `/api`:

**Authentication:**
```
POST /api/auth/register              # Create account
POST /api/auth/login                  # Get JWT tokens  
POST /api/auth/refresh                # Refresh access token
POST /api/auth/verify-email           # Verify email with token
POST /api/auth/resend-verification    # Resend verification email
POST /api/auth/forgot-password        # Request password reset
POST /api/auth/reset-password         # Reset password with token
POST /api/auth/logout                 # Logout (invalidate tokens)
GET  /api/auth/me                     # Get current user info
DELETE /api/auth/delete-account       # Delete user account
```

**Core AI Comparison:**
```
POST /api/compare-stream              # Streaming comparison (SSE)
GET  /api/models                      # List all available models
GET  /api/rate-limit-status           # Check usage status
GET  /api/model-stats                 # Performance metrics
GET  /api/anonymous-mock-mode-status  # Check anonymous mock mode (dev only)
POST /api/dev/reset-rate-limit        # Reset limits (dev only)
GET  /api/conversations               # List user conversations
GET  /api/conversations/{id}          # Get conversation details
DELETE /api/conversations/{id}        # Delete conversation
```

**Admin (requires admin privileges):**
```
GET    /api/admin/stats                        # System statistics
GET    /api/admin/users                        # List all users
GET    /api/admin/users/{user_id}              # Get user details
POST   /api/admin/users                        # Create new user
PUT    /api/admin/users/{user_id}              # Update user
DELETE /api/admin/users/{user_id}              # Delete user
POST   /api/admin/users/{user_id}/toggle-active        # Toggle user active status
POST   /api/admin/users/{user_id}/reset-usage          # Reset user usage
POST   /api/admin/users/{user_id}/toggle-mock-mode     # Toggle mock mode
POST   /api/admin/users/{user_id}/change-tier          # Change subscription tier
POST   /api/admin/users/{user_id}/send-verification    # Resend verification
POST   /api/admin/users/{user_id}/reset-password       # Admin password reset
GET    /api/admin/action-logs                   # View admin action logs
GET    /api/admin/settings                      # Get app settings (dev only)
POST   /api/admin/settings/toggle-anonymous-mock-mode # Toggle anonymous mock mode (dev only)
POST   /api/admin/settings/zero-anonymous-usage        # Reset anonymous usage (dev only)
```

## Configuration

**Performance Tuning** (`backend/app/config/settings.py`):

- `INDIVIDUAL_MODEL_TIMEOUT = 120` - Seconds per model timeout (used in streaming endpoint)

**Subscription Tiers** (`backend/app/rate_limiting.py`):

```python
# MODEL-BASED PRICING: daily_limit = model responses per day
SUBSCRIPTION_CONFIG = {
    "free": {"daily_limit": 20, "model_limit": 3, "overage_allowed": False},  # Registered users
    "starter": {"daily_limit": 50, "model_limit": 6, "overage_allowed": True},
    "starter_plus": {"daily_limit": 100, "model_limit": 6, "overage_allowed": True},
    "pro": {"daily_limit": 200, "model_limit": 9, "overage_allowed": True},
    "pro_plus": {"daily_limit": 400, "model_limit": 12, "overage_allowed": True}
}
# Anonymous (unregistered): 10 model responses/day, 3 models max
```

**Note:** Usage is now tracked by individual model responses, not comparisons. Each model in a comparison counts as one response toward the daily limit.

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, endpoints, CORS
│   ├── model_runner.py      # OpenRouter integration
│   ├── auth.py              # JWT, password hashing
│   ├── database.py          # SQLAlchemy setup
│   ├── models.py            # Database models
│   ├── schemas.py           # Pydantic schemas
│   ├── dependencies.py      # Auth dependencies
│   ├── rate_limiting.py     # Rate limit logic
│   ├── email_service.py     # Email sending
│   ├── mock_responses.py    # Mock responses for testing
│   └── routers/
│       ├── auth.py          # Auth endpoints
│       ├── admin.py         # Admin endpoints
│       └── api.py           # Core API endpoints (compare, models, etc.)
├── alembic/                 # Database migrations
├── create_admin_user.py    # Admin user creation script
├── requirements.txt
└── openrouter_models.json  # Model definitions

frontend/
├── src/
│   ├── App.tsx              # Main component
│   ├── main.tsx            # Entry point
│   ├── components/
│   │   ├── LatexRenderer.tsx       # LaTeX/Markdown renderer
│   │   ├── TermsOfService.tsx      # Terms of service component
│   │   ├── Footer.tsx              # Footer component
│   │   ├── auth/                   # Auth components
│   │   ├── admin/                  # Admin panel components
│   │   └── index.ts                # Component exports
│   ├── contexts/
│   │   └── AuthContext.tsx  # Auth state management
│   ├── types/
│   │   └── auth.ts          # TypeScript types
│   └── styles/              # CSS styles
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   App.tsx    │  │  Components  │  │   Services   │         │
│  │  (Main UI)   │  │  (Modular)   │  │  (API Layer) │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         └─────────────────┴─────────────────┘                  │
│                            │                                    │
│                            ▼                                    │
│                   ┌─────────────────┐                          │
│                   │  Auth Context   │                          │
│                   │  (JWT Tokens)    │                          │
│                   └────────┬─────────┘                          │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP/HTTPS
                             │ REST API + SSE
┌────────────────────────────┼────────────────────────────────────┐
│                            ▼                                    │
│                   ┌─────────────────┐                          │
│                   │   FastAPI App   │                          │
│                   │   (Python)      │                          │
│                   └────────┬─────────┘                          │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Auth      │  │   API       │  │   Admin     │            │
│  │   Router    │  │   Router    │  │   Router    │            │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘            │
│         │               │                 │                     │
│         └───────────────┴─────────────────┘                     │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────────┐                    │
│              │   Rate Limiting & Config    │                    │
│              └──────────────┬──────────────┘                    │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐                │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │  Database   │   │ OpenRouter  │   │  Email       │          │
│  │ (SQLite/    │   │    API      │   │  Service     │          │
│  │ PostgreSQL) │   │             │   │ (SendGrid)   │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Frontend (React + TypeScript)**
   - Modular component architecture
   - Service layer for API calls
   - Context API for authentication state
   - Server-Sent Events (SSE) for streaming

2. **Backend (FastAPI + Python)**
   - RESTful API with OpenAPI/Swagger docs
   - JWT-based authentication
   - Rate limiting per subscription tier
   - Background tasks for email sending

3. **Database (SQLite/PostgreSQL)**
   - User management and authentication
   - Conversation history
   - Usage tracking and analytics
   - Admin action logs

4. **External Services**
   - OpenRouter API (50+ AI models)
   - SendGrid/SMTP (email verification)
   - Stripe (payment processing - planned)

## Documentation

**📚 [Complete Documentation Index](docs/README.md)** - Start here for all documentation

**Getting Started:**
- [Environment Setup Guide](docs/getting-started/ENVIRONMENT_SETUP.md) - Complete environment configuration guide
- [Tooling Setup](docs/getting-started/TOOLING_SETUP.md) - Development tools configuration
- [Development Workflow](docs/DEV_WORKFLOW.md) - Development & deployment guide

**Architecture:**
- [API Documentation](docs/architecture/API.md) - Complete API reference with examples
- [Authentication Guide](docs/architecture/AUTHENTICATION.md) - JWT authentication & authorization
- [Database Schema](docs/architecture/DATABASE.md) - Database models and relationships

**Features:**
- [Rate Limiting](docs/RATE_LIMITING_IMPLEMENTATION.md) - Rate limiting implementation details
- [Context Management](docs/CONTEXT_MANAGEMENT_IMPLEMENTATION.md) - Conversation context handling
- [Streaming](docs/STREAMING_SUMMARY.md) - Server-Sent Events (SSE) streaming
- [Image Optimization](docs/features/IMAGE_OPTIMIZATION.md) - Image optimization and lazy loading
- [Performance Monitoring](docs/development/PERFORMANCE_MONITORING.md) - Performance tracking

**Planning:**
- [Implementation Plan 2025](docs/getting-started/IMPLEMENTATION_PLAN_2025.md) - Comprehensive refactoring plan
- [Feature Recommendations](docs/planning/FEATURE_RECOMMENDATIONS.md) - Future feature suggestions
- [Future Optimizations](docs/planning/FUTURE_OPTIMIZATIONS.md) - Optimization opportunities
- [Overage Pricing Analysis](docs/planning/OVERAGE_PRICING_ANALYSIS.md) - Pricing model analysis

## Contributing

We welcome contributions! Please follow these guidelines:

### Getting Started

1. **Fork the repository** and clone your fork
2. **Set up your development environment** following the [Environment Setup Guide](docs/getting-started/ENVIRONMENT_SETUP.md)
3. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Development Guidelines

**Code Style:**
- **Frontend:** Follow TypeScript best practices, use ESLint/Prettier
- **Backend:** Follow PEP 8, use type hints, add docstrings
- **Commits:** Use conventional commits (feat:, fix:, docs:, etc.)

**Testing:**
- Write tests for new features
- Ensure all tests pass before submitting PR
- Test with multiple AI models when applicable

**Documentation:**
- Update relevant documentation files
- Add JSDoc/docstrings for new functions
- Update API documentation if endpoints change

### Pull Request Process

1. **Update your branch** with latest changes from `main`
2. **Write clear commit messages** describing your changes
3. **Test thoroughly** - ensure no regressions
4. **Update documentation** if needed
5. **Submit PR** with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots (for UI changes)

### Code Review

- PRs require at least one approval
- Address review feedback promptly
- Keep PRs focused and under 500 lines when possible

### Reporting Issues

When reporting bugs or requesting features:
- Use the issue templates
- Provide clear reproduction steps
- Include environment details
- Add screenshots/logs when relevant

## Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check environment variables
cd backend
cat .env  # Ensure SECRET_KEY and OPENROUTER_API_KEY are set

# Check database
python -c "from app.database import engine; engine.connect()"

# Check logs
tail -f backend.log
```

**Frontend build errors:**
```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run type-check
```

**Database migration issues:**
```bash
cd backend
# Check current migration status
alembic current

# Create new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head
```

**Rate limiting issues:**
- Check user's subscription tier in database
- Verify rate limit configuration in `backend/app/config.py`
- Check usage reset dates are correct

**Email not sending:**
- Verify email configuration in `.env`
- Check SendGrid API key (if using SendGrid)
- Check SMTP settings (if using SMTP)
- Email sending is optional in development mode

**CORS errors:**
- Verify `allowed_origins` in `backend/app/main.py`
- Check frontend URL matches allowed origins
- Ensure credentials are included in requests

**OpenRouter API errors:**
- Verify `OPENROUTER_API_KEY` is set correctly
- Check API key has sufficient credits
- Verify model IDs are correct (check `/api/models`)

### Getting Help

- **Documentation:** Check [docs/README.md](docs/README.md) for comprehensive guides
- **API Docs:** Visit `http://localhost:8000/docs` for interactive API documentation
- **Issues:** Search existing issues or create a new one
- **Discussions:** Use GitHub Discussions for questions

## License

MIT License - see [LICENSE](LICENSE) file.
