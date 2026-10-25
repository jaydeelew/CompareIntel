# Agent Context for CompareIntel

This document provides essential context for AI coding agents (Cursor IDE, Cursor Cloud Agents, and Grok Bots) working on CompareIntel. Always review this file and `.cursor/rules/workflow.mdc` before making changes.

## Tech Stack Overview

### Frontend
- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **State:** React Context
- **Routing:** React Router v6
- **Testing:** Vitest + React Testing Library + Playwright
- **PWA:** Vite PWA plugin

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Testing:** pytest
- **Auth:** JWT tokens
- **Payment:** Stripe (test mode only in development)

### Infrastructure
- **API Gateway:** OpenRouter for LLM models
- **Error Tracking:** Sentry
- **CI/CD:** GitHub Actions
- **Hosting:** Single server (no staging environment)

## Critical Guardrails

### Database Migrations
- **Always use Alembic** for schema changes: `alembic revision --autogenerate -m "description"`
- **Test migrations in CI** before merging (CI runs `alembic upgrade head` on throwaway Postgres)
- **Never modify production database directly**
- Rollback plan: Atlas bot keeps pre-migration backups

### Stripe Integration
- **Use test mode keys only** in development (`.env`: `STRIPE_API_KEY=sk_test_...`)
- **Never touch production Stripe** unless explicitly authorized by Jack
- Test webhooks locally with Stripe CLI: `stripe listen --forward-to localhost:8000/api/webhook/stripe`

### OpenRouter
- **Mock API calls in tests** to avoid spend (see `tests/unit/test_compare.py` for examples)
- **Respect rate limits** in production
- Model catalog updates: coordinate with Curator bot

### Security
- **Never commit secrets** (`.env` is gitignored)
- **Sentinel bot reviews** auth, Stripe, and CORS changes
- Run `pip-audit` (backend) and `npm audit` (frontend) before PR

## Development Workflow

### Local Setup
See [CONTRIBUTING.md](CONTRIBUTING.md#development-setup) for first-time setup. Quick reference:

```bash
# Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd frontend && npm run dev
```

### Before Opening a PR
Run the pre-push check script:

```bash
./check-ci.sh
```

This runs:
- Backend: `ruff check`, `ruff format`, `mypy`, `pytest`
- Frontend: ESLint, TypeScript check, build, Vitest tests

All checks must pass before requesting review. See [CONTRIBUTING.md](CONTRIBUTING.md#pull-request-guidelines) for details.

### Playwright E2E Tests
- **Gate for merge:** Playwright in GitHub Actions (required)
- **Advisory only:** Grok Bot visual testing on PR previews
- Run locally: `cd frontend && npm run test:e2e`

## Bot Ownership (from workflow plan)

| Bot | Responsibilities |
|-----|-----------------|
| **Chief** | Backlog triage, specs, weekly priorities, product PRs |
| **Spotlight** | SEO pages, analytics, launch drafts, growth report |
| **Curator** | Model catalog freshness, new-model alerts |
| **Arena** | Ranking methodology, model pages data |
| **Pulse** | Playwright suite, uptime monitoring, visual QA (advisory) |
| **Sentinel** | Dependency audits, security review, secrets hygiene |
| **Atlas** | Backups, rollback, caching, cost guardrails |

## Common Patterns

### Adding a New Model
See [docs/development/ADDING_NEW_MODELS.md](docs/development/ADDING_NEW_MODELS.md)

### API Endpoints
- Backend routes: `backend/app/api/` (organized by resource)
- CORS: configured in `backend/app/main.py`
- Auth: `backend/app/core/security.py`

### Frontend Components
- Reusable UI: `frontend/src/components/`
- Pages: `frontend/src/pages/`
- API client: `frontend/src/services/api.ts`

### Testing
- Backend unit tests: `backend/tests/unit/`
- Backend integration: `backend/tests/integration/`
- Frontend unit: `frontend/src/**/*.test.tsx`
- E2E: `frontend/tests/e2e/`

## Deployment

**Agents never deploy.** Jack reviews, merges, and approves deployments.

### Deployment Checklist (for Jack)
1. CI checks green
2. Preview tested (Cloudflare Pages for frontend)
3. Database migration ready (if applicable)
4. Backup taken (Atlas)
5. Deploy script run
6. Rollback tested

See [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) for full deployment process.

## Troubleshooting

### Common Issues

**CI failing on pip-audit?**
- Sentinel bot should fix this first (currently red)
- Check `backend/requirements.txt` for vulnerable packages

**Frontend build fails?**
- Check bundle size: `npm run build` in `frontend/`
- Bundle size check: `frontend/scripts/check-bundle-size.js`

**Alembic migration conflicts?**
- Rebase on latest master
- Regenerate migration: `alembic revision --autogenerate`

**CORS errors?**
- Check `CORS_ORIGINS` in `backend/.env`
- Default dev: `http://localhost:5173`

## Resources

- [CONTRIBUTING.md](CONTRIBUTING.md) - Full contributor guide
- [README.md](README.md) - Project overview and API reference
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [docs/development/QUICKSTART.md](docs/development/QUICKSTART.md) - Minimal setup guide

## Contact

Questions? File a GitHub issue labeled `agent-question`. Jack triages weekly.
