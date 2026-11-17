# Development & Git Workflow

## Development Environments

### 1. Local (HTTP) - Daily Development

```bash
# Terminal 1 - Backend
lsof -ti:8000 && echo "Backend already running!" || (cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000)

# Terminal 2 - Frontend
lsof -ti:5173 && echo "Frontend already running!" || (cd frontend && npm run dev)
```

**Access:** http://localhost:5173  
**Stop:** `lsof -ti:8000 | xargs -r kill -9` and `lsof -ti:5173 | xargs -r kill -9`

#### Accessing the dev server from another device (phone) over Tailscale

The default commands bind the backend to `127.0.0.1` and Vite to localhost only, so other devices cannot connect. To test on a phone over [Tailscale](https://tailscale.com/), stop any running dev servers, then restart with remote-friendly binds:

```bash
kill $(lsof -ti:8000) $(lsof -ti:5173)

# Terminal 1 - Backend (remote access)
lsof -ti:8000 && echo "Backend already running!" || (cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000)

# Terminal 2 - Frontend (remote access)
lsof -ti:5173 && echo "Frontend already running!" || (cd frontend && npm run dev -- --host)
```

**Tailscale on WSL2:** Install inside WSL with `curl -fsSL https://tailscale.com/install.sh | sh`, run `sudo tailscale up`, note the address with `tailscale ip -4`, install the Tailscale app on the phone with the same account, then open `http://<100.x address>:5173`.

**Security:** Binding to `0.0.0.0` exposes the dev server on the local LAN as well as Tailscale. Use only on trusted networks or over Tailscale.

**API calls from the phone:** By default the app uses relative `/api` (`VITE_API_URL` unset); Vite proxies `/api` → `http://127.0.0.1:8000` (see `frontend/vite.config.ts`). Requests from the phone go to the Vite dev server on port 5173, so the **backend can stay on `127.0.0.1`** and you only need `npm run dev -- --host`. If API calls fail, check that `VITE_API_URL` is not set to `http://127.0.0.1:8000` or `http://localhost:8000` (the phone cannot reach the dev machine’s loopback). Only bind the backend to `0.0.0.0` if you deliberately point the frontend at a direct backend URL; cross-origin calls then require an allowed CORS origin in `backend/app/cors.py`.

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

### 4. Cloudflare Pages PR previews (frontend only)

PR preview URLs are hosted on Cloudflare Pages (free plan). Jack connects the project in the dashboard. Repo-side preview safety (noindex, mock API, no analytics) is documented in [CLOUDFLARE_PAGES_PREVIEWS.md](../deployment/CLOUDFLARE_PAGES_PREVIEWS.md).

```bash
cd frontend && npm run build:preview && npm run check:preview-dist
```

Do not point previews at production. Live production remains on EC2 (below).

### 5. AWS Production

Prefer `./deploy-production.sh deploy` (backup, `.env` key check, `nginx -t`, build, `/health` retry, auto-rollback to `:previous` on verify failure, then prune dangling images/build cache). Manual equivalent:

```bash
ssh -i CompareIntel.pem ubuntu@<ec2-ip>
cd CompareIntel && git pull origin master
docker compose -f docker-compose.ssl.yml down
docker compose -f docker-compose.ssl.yml up -d --build
```

The 2 GB production host runs 2 Gunicorn workers by default (`WEB_CONCURRENCY`, overridable; `GUNICORN_WORKERS` still works). Compose sets container memory limits/reservations, Redis `maxmemory 64mb` with `volatile-lru`, and json-file log rotation (`max-size` 10m × 3 files) so logs and Redis cannot starve the host. `./deploy-production.sh check` and `status` warn above 80% disk use or when swap is heavily used.

SSL via Let's Encrypt; initial setup: `./setup-compareintel-ssl.sh` from home dir.

**SSL auto-renewal:** Uses webroot so certbot can renew while nginx runs. `certbot.timer` runs twice daily. If renewal fails (e.g. certs from older standalone setup), run:
```bash
sudo ./setup-compareintel-ssl.sh renewal
```
Then `sudo certbot renew --dry-run` to verify. Deployment status (`./deploy-production.sh status`) shows certbot timer/cron state.

**Nginx "Permission denied" on certs:** If nginx fails to start with SSL certificate permission errors, run:
```bash
sudo ./setup-compareintel-ssl.sh fix-permissions
```
Then `docker compose -f docker-compose.ssl.yml restart nginx`. A deploy hook ensures permissions stay correct after future renewals.

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
