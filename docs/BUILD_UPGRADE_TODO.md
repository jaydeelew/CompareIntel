# CompareIntel Build Process Upgrade — Implementation Guide

**Purpose:** This document instructs AI chat sessions to implement build/deployment improvements for CompareIntel. Use it across multiple chat sessions to make incremental progress. Update this document after each completed upgrade.

---

## Instructions for the AI Model

1. **Read this document first** before making changes.
2. **Implement one or more items** from the checklist below, depending on context limits.
3. **After each completed change**, update this document:
   - Mark completed items with `[x]` and add the commit hash/date.
   - Add brief notes on what was done.
   - Leave remaining items unchecked.
4. **Provide a concise git commit message** (under ~72 characters) for each set of changes.
5. **Stop after completing the current session's work** and leave remaining items for future sessions.

---

## Checklist

### 1. Frontend `.dockerignore`
- [x] Create `frontend/.dockerignore` with entries for: `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `.vite`, `*.log`, `.env*`, `*.md`, `.git`, etc.
- [x] Ensure build context excludes dev artifacts and large directories.

**Notes when complete:** Created frontend/.dockerignore excluding node_modules, dist, coverage, test artifacts, cache, env files, and docs.

---

### 2. Use `npm ci` in Frontend Dockerfile
- [x] In `frontend/Dockerfile`, change `RUN npm install` to `RUN npm ci` in the build stage.
- [x] Ensure `package-lock.json` is copied (via `COPY package*.json ./`).

**Notes when complete:** Build stage now uses `npm ci` for reproducible builds. package-lock.json included via package*.json.

---

### 3. Run Containers as Non-Root
- [x] **Frontend (prod stage):** Add `USER nginx` (or appropriate user) before CMD in `frontend/Dockerfile` prod stage. Verify nginx:alpine has an nginx user.
- [x] **Backend:** Create a non-root user in `backend/Dockerfile`, switch to it before CMD, ensure entrypoint.sh and app dirs are readable.

**Notes when complete:** Backend runs as `appuser` (uid 1000). Frontend prod stage now runs as `USER nginx`; nginx listens on 8080 (non-privileged port), pid/logs use /tmp and /dev/stdout.

---

### 4. Pin Python Dependencies for Production
- [x] In `backend/requirements.txt`, replace `>=` with exact versions (e.g., `==`) for production-critical packages.
- [x] Consider using `pip-compile` (from pip-tools) to generate a locked `requirements.txt` from a `requirements.in`.

**Notes when complete:** Created `requirements.in` with original constraints; pip-compile generates pinned `requirements.txt`. Run `pip-compile requirements.in -o requirements.txt` to update.

---

### 5. Add Security Headers to nginx.prod.conf
- [x] Add to `nginx/nginx.prod.conf` (HTTP config): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`.
- [x] Use `add_header` directives at the `server` or `location /` level so they apply to responses.

**Notes when complete:** Added X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy at server level.

---

### 6. Fail CI on Security Vulnerabilities
- [x] In `.github/workflows/ci.yml`, remove `|| true` from `safety check` and `npm audit` so failures block the pipeline.
- [x] Optionally use `--audit-level=high` for npm and configure safety to fail on high/critical.

**Notes when complete:** Removed `|| true` from safety check and npm audit. npm uses `--audit-level=high` so high/critical vulnerabilities fail the pipeline.

---

### 7. Backend Healthcheck in docker-compose.prod.yml
- [x] Add a `healthcheck` block for the backend service (e.g., `curl` or `wget` to `/health`).
- [x] Use `condition: service_healthy` for any services that depend on the backend.

**Notes when complete:** Python urllib-based healthcheck. nginx depends_on uses service_healthy for backend.

---

### 8. Backend Restart Policy in docker-compose.prod.yml
- [x] Add `restart: unless-stopped` (or `on-failure`) to backend and frontend services in `docker-compose.prod.yml`.

**Notes when complete:** backend and nginx have restart: unless-stopped. Frontend omitted (build-only, no long-running process).

---

### 9. Production Source Maps
- [x] In `frontend/vite.config.ts`, set `sourcemap: false` for production, OR configure Sentry (or similar) to upload source maps and avoid serving them publicly.
- [x] If using Sentry, verify source map upload works and maps are not served to clients.

**Notes when complete:** Set sourcemap: false in vite build config.

---

### 10. Clarify Frontend Service Role in docker-compose.prod.yml
- [x] Remove redundant frontend service if nginx prod stage already builds and serves static files, OR document and fix its role (e.g., single-run build step).
- [x] Ensure the production stack (backend + nginx) runs without a permanently running frontend container if it is redundant.

**Notes when complete:** Removed redundant frontend service. Nginx prod stage builds frontend via multi-stage Dockerfile and serves static files. Prod stack: redis, backend, nginx.

---

## Commit Message Template

After each change set, provide a commit message like:

```
fix(build): [short description of changes]
```

Examples:
- `fix(docker): add frontend .dockerignore and use npm ci`
- `fix(nginx): add security headers to prod config`
- `fix(ci): fail on high/critical security vulnerabilities`
- `fix(docker): run containers as non-root user`

---

## Progress Log

| Date | Items Completed | Commit |
|------|-----------------|--------|
| 2025-02-19 | 1, 2, 3 (backend+frontend), 5, 7, 8, 9 | (pending) |
| 2026-02-19 | 4, 6, 10 | (pending) |

---

## References

- Backend requirements: `backend/requirements.txt` (pinned), `backend/requirements.in` (source for pip-compile)
- Frontend Dockerfile: `frontend/Dockerfile`
- Backend Dockerfile: `backend/Dockerfile`
- Backend .dockerignore: `backend/.dockerignore`
- Production compose: `docker-compose.prod.yml`
- Nginx prod config: `nginx/nginx.prod.conf`
- CI workflow: `.github/workflows/ci.yml`
- Vite config: `frontend/vite.config.ts`
