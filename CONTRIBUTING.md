# Contributing to CompareIntel

Thank you for your interest in contributing to CompareIntel. This document covers how to get started, our workflow, and what we expect from contributors.

> **Quick Start:** For the fastest "clone → install → run" path, see [docs/development/QUICKSTART.md](docs/development/QUICKSTART.md).

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Git Workflow](#git-workflow)
4. [Code Style](#code-style)
5. [Testing](#testing)
6. [Pull Request Guidelines](#pull-request-guidelines)
7. [Additional Resources](#additional-resources)

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **Python** ≥ 3.11
- **Git**
- **Docker** (optional, for containerized development)

### First-Time Setup

1. **Fork and clone** the repository (clone your fork, not the upstream repo)
2. **Enable pre-commit hooks** (run from repo root):
   ```bash
   npm install
   ```
   This installs Husky, which runs lint/format checks on `git commit`.
3. **Set up the backend:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   cp .env.example .env
   # Add SECRET_KEY and OPENROUTER_API_KEY to .env
   pip install -r requirements-dev.txt
   ```
4. **Set up the frontend:**
   ```bash
   cd frontend
   npm install
   ```
5. **Verify everything works:**
   ```bash
   # Terminal 1
   cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

   # Terminal 2
   cd frontend && npm run dev
   ```
6. **Run tests:**
   ```bash
   cd backend && pytest
   cd frontend && npm run test:run
   ```

**Optional:** Add the upstream remote to sync with the main repo:
```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/CompareIntel.git
git fetch upstream
```

See [docs/development/ENVIRONMENT_SETUP.md](docs/development/ENVIRONMENT_SETUP.md) for detailed environment configuration.

---

## Development Setup

### Local Development (HTTP)

```bash
# Terminal 1 - Backend (Windows: use venv\Scripts\activate)
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 - Frontend
cd frontend && npm run dev
```

**Access:** http://localhost:5173

### Pre-commit Hooks

Husky runs automatically on `git commit`:

- **Backend** (when `.py` files are staged): `ruff check`, `ruff format --check`, `mypy`
- **Frontend**: ESLint (with fix) and Prettier on staged files

Ensure hooks pass before pushing. Run manually:

```bash
# Backend
cd backend && ruff check . && ruff format --check . && mypy app --ignore-missing-imports

# Frontend
cd frontend && npm run lint && npm run format:check && npm run type-check
```

---

## Git Workflow

### Branch Naming

Use descriptive prefixes:

| Prefix | Use case |
|--------|----------|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring |
| `docs/` | Documentation only |
| `test/` | Test additions or changes |

**Examples:** `feature/add-export-html`, `fix/credit-calculation`, `docs/update-readme`

### Workflow Steps

1. Create a branch from `master`: `git checkout -b feature/my-feature`
2. Make changes; keep commits atomic and well-described
3. Run tests locally before pushing
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request on GitHub
6. Address review feedback; CI must pass
7. Merge when approved

### Skip CI (Sparingly)

For documentation-only commits: `git commit -m "Update README [skip ci]"`

---

## Code Style

### Backend (Python)

- **Ruff** for linting and formatting (Black-compatible)
- **Mypy** for type checking
- Config: `backend/pyproject.toml`
- Run: `ruff check .`, `ruff format .`, `mypy app`

### Frontend (TypeScript/React)

- **ESLint** for linting
- **Prettier** for formatting
- **TypeScript** strict mode
- Config: `frontend/eslint.config.js`, `frontend/.prettierrc` (if present)

### Database Migrations

When adding or changing database models:

```bash
cd backend
alembic revision --autogenerate -m "description of changes"
alembic upgrade head
```

See [backend/migrations/README.md](backend/migrations/README.md) for details.

### General Guidelines

- Follow existing patterns and structure
- Write clear, purposeful code
- Prefer small, focused functions and components
- Add tests for new features
- Update documentation as needed

---

## Testing

### Backend

```bash
cd backend
pytest                    # All tests
pytest tests/unit/        # Unit tests only
pytest tests/integration/ # Integration tests
pytest --cov=app         # With coverage
```

See [docs/testing/BACKEND_TESTING.md](docs/testing/BACKEND_TESTING.md).

### Frontend

```bash
cd frontend
npm run test:run          # Unit tests
npm run test:coverage     # With coverage
npm run test:e2e          # E2E (Playwright)
```

**E2E tests:** Before running `npm run test:e2e`, install Playwright browsers:
```bash
npx playwright install
```

See [docs/testing/FRONTEND_TESTING.md](docs/testing/FRONTEND_TESTING.md).

### Coverage Goals

- Target: **70%+** for both frontend and backend
- Critical paths must have tests

---

## Pull Request Guidelines

### Before Submitting

- [ ] All tests pass locally
- [ ] Linting and type checking pass
- [ ] Pre-commit hooks pass
- [ ] New code has tests where appropriate
- [ ] Documentation updated if needed

### PR Description

- Describe the change clearly
- Reference any related issues (e.g., "Fixes #123")
- Note any breaking changes

### CI Requirements

- Frontend: lint, type-check, unit tests, build, bundle size
- Backend: ruff, mypy, unit tests, integration tests, E2E
- E2E: critical user flows, accessibility
- Security scan

All must pass before merge.

---

## Additional Resources

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview, quick start, API reference |
| [docs/development/QUICKSTART.md](docs/development/QUICKSTART.md) | Minimal clone → install → run guide |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, data flow, key files |
| [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) | Dev environments, deployment |
| [docs/development/ENVIRONMENT_SETUP.md](docs/development/ENVIRONMENT_SETUP.md) | Environment variables |
| [docs/development/ONBOARDING.md](docs/development/ONBOARDING.md) | First-day checklist: key files, common tasks, where to look |
| [docs/development/ADDING_NEW_MODELS.md](docs/development/ADDING_NEW_MODELS.md) | Adding AI models |

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
