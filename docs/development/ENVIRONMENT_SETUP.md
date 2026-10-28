# Environment Setup Guide

This guide explains how to configure environment variables for CompareIntel, covering both backend and frontend setup.

**Quick Start:** Copy the example files and fill in your values:
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env and add your OPENROUTER_API_KEY and SECRET_KEY

# Frontend (optional - defaults work for local development)
cp frontend/.env.example frontend/.env
```

---

## 📋 Table of Contents

1. [Backend Configuration](#backend-configuration)
2. [Frontend Configuration](#frontend-configuration)
3. [Required vs Optional Variables](#required-vs-optional-variables)
4. [Environment-Specific Setup](#environment-specific-setup)
5. [Troubleshooting](#troubleshooting)

---

## 🔧 Backend Configuration

### Required Variables

These variables **must** be set for the backend to run:

#### `SECRET_KEY`
- **Purpose:** JWT token signing and encryption
- **Generate:** `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- **Example:** `SECRET_KEY=abc123xyz...`
- **⚠️ Security:** Use a strong, randomly generated key. Never commit this to version control!

#### `OPENROUTER_API_KEY`
- **Purpose:** Authentication for OpenRouter API (access to 50+ AI models)
- **Get it:** [https://openrouter.ai/keys](https://openrouter.ai/keys)
- **Format:** `sk-or-v1-...`
- **Example:** `OPENROUTER_API_KEY=sk-or-v1-abc123...`

### Optional Variables

#### Security Configuration

**`RECAPTCHA_SECRET_KEY`** (Backend)
- **Purpose:** reCAPTCHA v3 secret key for bot protection on registration
- **Get it:** [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
- **Note:** If not set, reCAPTCHA verification is skipped (useful for development)
- **Example:** `RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`

**`VITE_RECAPTCHA_SITE_KEY`** (Frontend)
- **Purpose:** reCAPTCHA v3 site key for frontend integration
- **Get it:** [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) (same account as secret key)
- **Note:** If not set, reCAPTCHA is skipped on frontend
- **Example:** `VITE_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`

#### Database Configuration

**`DATABASE_URL`**
- **Default:** `sqlite:///./data/compareintel.db` (SQLite in `backend/data/` directory)
- **Development:** SQLite is fine for local development. Database files are stored in `backend/data/` for clean project structure.
- **Production:** Use PostgreSQL for better performance and scalability
- **SQLite Example:** `DATABASE_URL=sqlite:///./data/compareintel.db` (stored in `backend/data/`)
- **PostgreSQL Example:** `DATABASE_URL=postgresql://user:password@localhost:5432/compareintel`
- **Docker Example:** `DATABASE_URL=postgresql://compareintel:compareintel@postgres:5432/compareintel`

#### Email Configuration (Optional)

Email is **optional** - if not configured, verification emails will be skipped in development.

**ZeptoMail / Zoho (Recommended):**
```bash
MAIL_USERNAME=emailapikey
MAIL_PASSWORD=your_zeptomail_smtp_password
MAIL_FROM=noreply@yourdomain.com
MAIL_SERVER=smtp.zeptomail.com
MAIL_PORT=587
```
Create a Mail Agent at [ZeptoMail](https://www.zoho.com/zeptomail/) → Setup Options → SMTP.

**SMTP (Alternative):**
```bash
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=your-email@gmail.com
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate an "App Password" at [Google Account Settings](https://myaccount.google.com/apppasswords)
3. Use the app password (not your regular password) in `MAIL_PASSWORD`

#### Frontend URL

**`FRONTEND_URL`**
- **Purpose:** Used in email verification and password reset links
- **Development:** `FRONTEND_URL=http://localhost:5173`
- **Production:** `FRONTEND_URL=https://compareintel.com`

#### Environment

**`ENVIRONMENT`**
- **Options:** `development`, `staging`, `production`
- **Effects:**
  - CORS settings (development allows all origins)
  - Error handling (more verbose in development)
  - Email sending behavior (synchronous in development for debugging)
- **Default:** `development`

### Backend Setup Steps

1. **Copy the example file:**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Generate a secret key:**
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   Copy the output to `SECRET_KEY` in your `.env` file.

3. **Add your OpenRouter API key:**
   - Get your key from [OpenRouter](https://openrouter.ai/keys)
   - Add it to `OPENROUTER_API_KEY` in your `.env` file

4. **Configure email (optional):**
   - Add ZeptoMail or SMTP credentials if you want email verification

5. **Verify your configuration:**
   ```bash
   # Check that variables are loaded
   python3 -c "from dotenv import load_dotenv; import os; load_dotenv(); print('SECRET_KEY:', 'SET' if os.getenv('SECRET_KEY') else 'MISSING'); print('OPENROUTER_API_KEY:', 'SET' if os.getenv('OPENROUTER_API_KEY') else 'MISSING')"
   ```

---

## 🎨 Frontend Configuration

### Required Variables

**None!** The frontend works with defaults for local development.

### Optional Variables

#### API Configuration

**`VITE_API_URL`**
- **Default:** `/api` (uses Vite proxy)
- **Development:** `/api` (recommended - uses proxy)
- **Production (same domain):** `/api`
- **Production (different domain):** `https://api.compareintel.com/api`
- **Direct connection:** `http://127.0.0.1:8000` (bypasses proxy)

**How it works:**
- Development: Vite dev server proxies `/api/*` → `http://127.0.0.1:8000/api/*`
- Production: Uses the full URL if set, or `/api` if relative

**`VITE_API_BASE_URL`** (Legacy)
- **Status:** Deprecated, kept for backward compatibility
- **Use:** `VITE_API_URL` instead

#### Performance Monitoring

**`VITE_PERFORMANCE_ENDPOINT`**
- **Purpose:** Send Web Vitals metrics to your analytics endpoint in production
- **Default:** Not set (metrics only logged to console in development)
- **Production:** Set to your endpoint URL to collect performance data
- **Example:** `VITE_PERFORMANCE_ENDPOINT=https://api.compareintel.com/api/performance`

**How it works:**
- Development: Metrics are logged to console only
- Production: If set, metrics are POSTed to your endpoint as JSON
- Metrics include LCP, CLS, FCP, TTFB, INP with ratings and timestamps
- Endpoint should accept POST requests and return 200 status

**Note:** Only active in production builds. The endpoint receives performance data automatically - no frontend code changes needed.

### Frontend Setup Steps

1. **Copy the example file (optional):**
   ```bash
   cd frontend
   cp .env.example .env
   ```

2. **Configure API URL (if needed):**
   - Default (`/api`) works for local development
   - Only change if you need to bypass the proxy or connect to a different backend

3. **Restart dev server:**
   ```bash
   # Changes to .env require restarting the dev server
   npm run dev
   ```

---

## ✅ Required vs Optional Variables

### Backend

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SECRET_KEY` | ✅ Yes | None | Must be set |
| `OPENROUTER_API_KEY` | ✅ Yes | None | Must be set |
| `DATABASE_URL` | ❌ No | `sqlite:///./data/compareintel.db` | SQLite for dev (stored in `backend/data/`) |
| `ENVIRONMENT` | ❌ No | `development` | Affects CORS/errors |
| `FRONTEND_URL` | ❌ No | `http://localhost:5173` | For email links |
| `MAIL_*` | ❌ No | None | Email optional |
| `RECAPTCHA_SECRET_KEY` | ❌ No | None | Bot protection (optional) |

### Frontend

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `VITE_API_URL` | ❌ No | `/api` | Works with proxy |
| `VITE_RECAPTCHA_SITE_KEY` | ❌ No | None | Bot protection (optional) |
| `VITE_PERFORMANCE_ENDPOINT` | ❌ No | None | Performance analytics (production only) |

---

## 🌍 Environment-Specific Setup

### Local Development

**Backend `.env`:**
```bash
DATABASE_URL=sqlite:///./data/compareintel.db
SECRET_KEY=<generate-with-python-secrets>
OPENROUTER_API_KEY=sk-or-v1-your-key
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
# Email optional - skip for local dev
```

**Frontend `.env`:**
```bash
VITE_API_URL=/api
```

### Docker Development

**Backend `.env`:**
```bash
DATABASE_URL=postgresql://compareintel:compareintel@postgres:5432/compareintel
SECRET_KEY=<generate-with-python-secrets>
OPENROUTER_API_KEY=sk-or-v1-your-key
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

**Frontend `.env`:**
```bash
VITE_API_URL=/api
```

Note: Docker Compose can also use environment variables directly or from `.env` files.

### Testing Production Build Locally (Preview Server)

To test the production build locally before deploying, use the preview server. It proxies `/api/*` to the backend (matching Vite dev server behavior).

1. **Start the backend:**
   ```bash
   cd backend && python3 -m uvicorn app.main:app --port 8000
   ```

2. **Build and run the preview server:**
   ```bash
   cd frontend && npm run build && npm run preview
   ```

3. **Open** `http://localhost:4173` in your browser.

**Environment variables:**
- `PORT` – Preview server port (default: 4173)
- `BACKEND_URL` – Backend URL for API proxy (default: `http://127.0.0.1:8000`)

Example with custom backend:
```bash
BACKEND_URL=http://192.168.1.100:8000 npm run preview
```

### Production

**Backend `.env`:**
```bash
DATABASE_URL=postgresql://user:password@db-host:5432/compareintel
SECRET_KEY=<strong-random-key-generated-once>
OPENROUTER_API_KEY=sk-or-v1-production-key
ENVIRONMENT=production
FRONTEND_URL=https://compareintel.com
MAIL_USERNAME=emailapikey
MAIL_PASSWORD=your_zeptomail_smtp_password
MAIL_FROM=noreply@compareintel.com
MAIL_SERVER=smtp.zeptomail.com
MAIL_PORT=587
```

**Frontend `.env`:**
```bash
VITE_API_URL=/api
# Or if backend is on different domain:
# VITE_API_URL=https://api.compareintel.com/api

# Optional: Send performance metrics to analytics
# VITE_PERFORMANCE_ENDPOINT=https://api.compareintel.com/api/performance
```

---

## 🔍 Troubleshooting

### Backend Issues

**"SECRET_KEY environment variable is not set"**
- ✅ Solution: Generate a key and add it to `backend/.env`
- Command: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`

**"OPENROUTER_API_KEY not found"**
- ✅ Solution: Get your key from [OpenRouter](https://openrouter.ai/keys) and add to `.env`

**Database connection errors**
- ✅ Check `DATABASE_URL` format
- ✅ For PostgreSQL: Verify credentials and that database exists
- ✅ For SQLite: Check file permissions

**Email not sending**
- ✅ Email is optional - check logs to see if it's configured
- ✅ Verify ZeptoMail SMTP credentials (Mail Agent → Setup → SMTP)
- ✅ Ensure `MAIL_FROM` is a verified/configured sender in ZeptoMail
- ✅ In development, emails are sent synchronously (check console)

### Frontend Issues

**"Failed to fetch models" / "Network error: Failed to fetch" / ERR_CONNECTION_REFUSED**
- ✅ **Development:** Ensure backend is running (`python3 -m uvicorn app.main:app --port 8000`)
- ✅ **Preview (production build):** Use `npm run preview` – it proxies `/api` to the backend. Start the backend first.
- ✅ **Deployed production:** Ensure the full stack is running (nginx + backend). Access via nginx (e.g. port 8080), not static files only.

**API calls failing with CORS errors**
- ✅ Make sure `VITE_API_URL=/api` (uses proxy)
- ✅ Or set to full backend URL with CORS configured
- ✅ Restart dev server after changing `.env`

**API calls going to wrong URL**
- ✅ Check `VITE_API_URL` value
- ✅ Restart dev server (Vite requires restart for env changes)
- ✅ Check browser console for actual URL being used

**Environment variables not working**
- ✅ All Vite variables must start with `VITE_`
- ✅ Restart dev server after changes
- ✅ Check `import.meta.env.VITE_API_URL` in browser console

### General Issues

**Changes to `.env` not taking effect**
- ✅ Backend: Restart the FastAPI server
- ✅ Frontend: Restart the Vite dev server
- ✅ Docker: Rebuild containers or restart services

**`.env` file not found**
- ✅ Make sure you copied `.env.example` to `.env`
- ✅ Check you're in the correct directory (`backend/` or `frontend/`)
- ✅ Verify file is named exactly `.env` (not `.env.local` or similar)

---

## 🔐 Security Best Practices

1. **Never commit `.env` files** - They're in `.gitignore` ✅
2. **Use different keys for dev/staging/production**
3. **Rotate keys periodically** (especially `SECRET_KEY`)
4. **Use strong, randomly generated `SECRET_KEY`**
5. **Restrict `OPENROUTER_API_KEY` usage** (rate limits, IP restrictions)
6. **Keep `.env.example` files updated** when adding new variables
7. **Don't share `.env` files** - use secrets management in production

---

## 📚 Additional Resources

- [OpenRouter API Keys](https://openrouter.ai/keys)
- [ZeptoMail SMTP](https://www.zoho.com/zeptomail/help/smtp-home.html)
- [Python secrets module](https://docs.python.org/3/library/secrets.html)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [FastAPI Configuration](https://fastapi.tiangolo.com/advanced/settings/)

---

## 📝 Notes

- Environment variables are loaded using `python-dotenv` (backend) and Vite (frontend)
- Backend loads from `backend/.env` (relative to backend directory)
- Frontend loads from `frontend/.env` (Vite automatically loads it)
- All Vite variables must be prefixed with `VITE_` to be exposed to client code
- Changes to `.env` require restarting the respective servers

---

**Last Updated:** January 2025  
**Related:** [Quick Start Guide](QUICKSTART.md) | [Development Workflow](WORKFLOW.md)

