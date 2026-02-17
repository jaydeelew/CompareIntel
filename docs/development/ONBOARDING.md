# First-Day Developer Checklist

**Purpose:** A first-day guide for new developers. Use this to orient yourself, find key files, and know where to look for common tasks. For setup, see [QUICKSTART.md](QUICKSTART.md). For workflow and PRs, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Day One Checklist

- [ ] Read this document
- [ ] Follow [QUICKSTART.md](QUICKSTART.md) to run the app locally
- [ ] Run your first comparison (prompt + models → Compare)
- [ ] Skim [ARCHITECTURE.md](../ARCHITECTURE.md) for data flow and component hierarchy
- [ ] Run tests: `cd backend && pytest tests/unit/` and `cd frontend && npm run test:run`
- [ ] Confirm pre-commit hooks: stage a file and `git commit` to see lint/format run

---

## Key Files to Know

### Frontend (React + TypeScript)

| File | Purpose |
|------|---------|
| `frontend/src/pages/MainPage.tsx` | Main comparison page. Entry point for comparison flow; delegates to ComparisonPageContent. |
| `frontend/src/components/main-page/ComparisonPageContent.tsx` | Form, models, results layout. Composes Hero, ComparisonForm, ModelsArea, ResultsArea. |
| `frontend/src/hooks/useComparisonStreaming.ts` | Core streaming logic: SSE connection, per-model state, timeouts. Large (~1,400 lines). |
| `frontend/src/hooks/useMainPageEffects.ts` | Effects for scroll, focus, history sync, error handling, etc. |
| `frontend/src/services/sseProcessor.ts` | SSE event parsing and dispatch. |
| `frontend/src/App.tsx` | App shell, routing, AuthProvider. |
| `frontend/src/contexts/AuthContext.tsx` | Auth state and login/logout. |

### Backend (FastAPI + Python)

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, router includes, CORS, middleware. |
| `backend/app/routers/api/api.py` | Core API: `/compare-stream`, `/models`, `/conversations`, etc. |
| `backend/app/routers/auth.py` | Auth endpoints: login, register, refresh, verify-email, etc. |
| `backend/app/model_runner.py` | OpenRouter shim; orchestrates streaming calls. |
| `backend/app/llm/` | LLM integration: registry, tokenizers, streaming. |
| `backend/app/models.py` | SQLAlchemy ORM models. |
| `backend/app/schemas.py` | Pydantic request/response schemas. |
| `backend/app/credit_manager.py` | Credit allocation and tier logic. |

---

## Common Tasks: Where to Look

| Task | Where to Look |
|------|----------------|
| Add or change an API endpoint | `backend/app/routers/` — group by feature (api, auth, admin). |
| Change model selection behavior | `useModelManagement.ts`, `ModelsSection.tsx`, tier config in backend. |
| Adjust streaming behavior | `useComparisonStreaming.ts`, `sseProcessor.ts`, `model_runner.py`. |
| Change auth flow | `AuthContext.tsx`, `backend/app/routers/auth.py`, `backend/app/auth.py`. |
| Add or modify DB schema | `backend/app/models.py`, then `alembic revision --autogenerate`. |
| Add a new AI model | `backend/app/llm/` registry, [ADDING_NEW_MODELS.md](ADDING_NEW_MODELS.md). |
| Fix or add tests | `backend/tests/`, `frontend/src/**/*.test.ts(x)`, `frontend/e2e/`. |
| Update env variables | `backend/.env.example`, [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md). |
| Deploy or CI | `deploy-production.sh`, `.github/workflows/`, [WORKFLOW.md](WORKFLOW.md). |

---

## Doc Map

| Doc | When to Use |
|-----|-------------|
| [QUICKSTART.md](QUICKSTART.md) | First-time setup: clone → install → run. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Understand structure, data flow, hooks. |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Branch naming, PR guidelines, code style. |
| [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) | All env vars (mail, reCAPTCHA, Redis, etc.). |
| [ADDING_NEW_MODELS.md](ADDING_NEW_MODELS.md) | Add or update AI models. |
| [FRONTEND_TESTING.md](../testing/FRONTEND_TESTING.md) | Frontend unit/E2E test guide. |
| [BACKEND_TESTING.md](../testing/BACKEND_TESTING.md) | Backend unit/integration tests. |
| [WORKFLOW.md](WORKFLOW.md) | Dev environments, deployment. |

---

## Known Gotchas

- **SQLite vs PostgreSQL:** Dev uses SQLite by default; production uses PostgreSQL. `DATABASE_URL` in `.env` controls this.
- **CORS / FRONTEND_URL:** Backend expects `FRONTEND_URL` for CORS. Local dev: `http://localhost:5173`.
- **OpenRouter key:** Required for comparisons. Get one at [openrouter.ai/keys](https://openrouter.ai/keys).
- **Pre-commit:** Backend Python runs ruff + mypy; frontend runs ESLint + Prettier. Fix issues before pushing.

---

## Quick Commands

```bash
# Run backend
cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Run frontend
cd frontend && npm run dev

# Backend tests
cd backend && pytest tests/unit/

# Frontend tests
cd frontend && npm run test:run

# Lint/type-check
cd backend && ruff check . && mypy app --ignore-missing-imports
cd frontend && npm run lint && npm run type-check
```
