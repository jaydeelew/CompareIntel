# Development & Git Workflow

## Development Environments

### 1. Local (HTTP) - Daily Development

```bash
# Terminal 1 - Backend
cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 - Frontend
cd frontend && npm run dev
```

**Access:** http://localhost:5173  
**Stop:** `lsof -ti:8000 | xargs -r kill -9` and `lsof -ti:5173 | xargs -r kill -9`

### 2. Local (Docker + Nginx)

```bash
docker compose up
```

**Access:** http://localhost:8080

### 3. Local Production Build

```bash
cd frontend && npm run build && npm run preview
```

**Access:** http://localhost:4173  
Use before deploy and for Lighthouse/PWA testing.

### 4. AWS Production

```bash
ssh -i CompareIntel.pem ubuntu@<ec2-ip>
cd CompareIntel && git pull origin master
docker compose -f docker-compose.ssl.yml down
docker compose -f docker-compose.ssl.yml up -d --build
```

SSL via Let's Encrypt; initial setup: `./setup-compareintel-ssl.sh` from home dir.

---

## Git Workflow (Feature Branches + PRs)

1. **Create branch:** `git checkout -b feature/my-feature`
2. **Commit:** `git add . && git commit -m "Description"`
3. **Push:** `git push origin feature/my-feature`
4. **Create PR** on GitHub (tests run automatically)
5. **Merge** when tests pass; optionally delete branch

**Why PRs:** Failed tests block merge; keeps master stable.

**Branch naming:** `feature/`, `fix/`, `refactor/`, `docs/`, `test/`

**Skip CI (sparingly):** `git commit -m "Update README [skip ci]"`

**Branch protection:** Require PR, require status checks, require up-to-date. Use 0 approvals for solo dev.
