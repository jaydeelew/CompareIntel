# Tooling Setup

CompareIntel uses modern development tooling for code quality and consistency.

## Frontend

### ESLint
- Configuration: `frontend/eslint.config.js` (flat config format)
- TypeScript support via `typescript-eslint`
- React hooks linting
- Import ordering

Commands:
```bash
npm run lint          # Check for errors
npm run lint:fix      # Auto-fix errors
```

### Prettier
- Configuration: `frontend/.prettierrc.json`
- Format-on-save enabled in VS Code

Commands:
```bash
npm run format        # Format all files
npm run format:check  # Check formatting
```

### TypeScript
- Strict mode enabled
- Configuration: `frontend/tsconfig.app.json`

Commands:
```bash
npm run type-check    # Type check without building
```

### Husky & lint-staged
Pre-commit hooks automatically run linting and formatting on staged files.

## Backend

### Ruff
Fast Python linter (replaces flake8, isort).
- Configuration: `backend/pyproject.toml`

Commands:
```bash
ruff check .          # Check for errors
ruff check --fix .    # Auto-fix errors
ruff format .         # Format code
```

### Black
Code formatter compatible with Ruff.
- Configuration: `backend/pyproject.toml`

Commands:
```bash
black .               # Format files
black --check .       # Check formatting
```

### mypy
Static type checker.
- Configuration: `backend/pyproject.toml`

Commands:
```bash
mypy app/             # Type check
```

### pre-commit
Runs all checks before commits.

Setup:
```bash
pip install pre-commit
pre-commit install
```

## Initial Setup

Frontend:
```bash
cd frontend && npm install
```

Backend:
```bash
cd backend
pip install -r requirements.txt
pre-commit install
```

## VS Code Integration

Format-on-save is configured in `frontend/.vscode/settings.json` for automatic formatting of TypeScript and JSON files.
