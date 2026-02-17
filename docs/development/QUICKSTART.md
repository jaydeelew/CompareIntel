# Quick Start Guide

Minimal "clone → install → run → first comparison" guide for CompareIntel.

**For detailed configuration (env vars, email, reCAPTCHA), see [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md).**

---

## Prerequisites

- **Node.js** ≥ 18.x
- **Python** ≥ 3.11

---

## 1. Clone and Install

```bash
git clone https://github.com/your-username/CompareIntel.git
cd CompareIntel

# Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt

# Frontend
cd ../frontend
npm install
```

---

## 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set:

| Variable | Required | Get it |
|----------|----------|--------|
| `SECRET_KEY` | Yes | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `OPENROUTER_API_KEY` | Yes | [openrouter.ai/keys](https://openrouter.ai/keys) |

For local development, SQLite is used by default. No database setup needed.

---

## 3. Run

**Terminal 1 — Backend:**
```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend && npm run dev
```

Open **http://localhost:5173**

---

## 4. First Comparison

1. Enter a prompt (e.g. "Explain recursion in three sentences")
2. Select one or more models from the provider dropdowns
3. Click **Compare**
4. View streaming results side-by-side

You can use the app as an anonymous user. Create an account for conversation history, saved selections, and more credits.

---

## Optional: Docker

```bash
docker compose up -d
```

Access at **http://localhost:8080** (via Nginx). Ensure `backend/.env` is configured.

---

## Next Steps

- [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) — Full env variable reference
- [WORKFLOW.md](WORKFLOW.md) — Dev environments, deployment
- [ARCHITECTURE.md](../ARCHITECTURE.md) — Codebase structure
