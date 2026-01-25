# CompareIntel

<p align="center">
  <strong>Compare AI Models Side-by-Side in Real-Time</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

**CompareIntel** is a full-stack web application that enables users to compare responses from multiple AI language models simultaneously. Built with a modern React frontend and FastAPI backend, it provides real-time streaming responses, conversation history, and a credit-based usage system with tiered subscriptions.

The platform integrates with [OpenRouter](https://openrouter.ai/) to access models from OpenAI, Anthropic, Google, Meta, Mistral, Cohere, xAI, and more—all through a single, unified interface.

---

## Features

### Core
- Compare up to 12 models side-by-side with real-time SSE streaming
- Conversation history with follow-up questions (per-model context)
- Breakout conversations to continue with a single model
- Save/load model selection presets
- Export as PDF, Markdown, JSON, or HTML
- Web search for models that support it
- LaTeX (KaTeX), syntax highlighting (Prism.js), full Markdown support
- PDF and Word document parsing
- PWA support

### Users & Billing
- Email/password auth with JWT (HTTP-only cookies)
- Tiered subscriptions: Free, Starter, Starter+, Pro, Pro+
- Credit system (daily for free users, monthly for paid)
- Admin panel

### Security
- Rate limiting (per-user + anonymous via browser fingerprinting)
- Optional Redis for distributed rate limiting
- reCAPTCHA v3 on registration

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with hooks |
| **TypeScript** | Type safety |
| **Vite 6** | Build tool and dev server |
| **React Router 7** | Client-side routing |
| **KaTeX** | LaTeX math rendering |
| **Prism.js** | Syntax highlighting for code blocks |
| **Lucide React** | Icon library |
| **PDF.js** | PDF parsing |
| **Mammoth** | Word document parsing |
| **html2canvas & jsPDF** | PDF export functionality |
| **vite-plugin-pwa** | Progressive Web App support |

### Backend
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Python web framework |
| **Pydantic v2** | Data validation and settings |
| **SQLAlchemy 2** | ORM |
| **PostgreSQL 15** | Production database |
| **OpenAI SDK** | OpenRouter API client |
| **Tiktoken** | Token counting (OpenAI models) |
| **Anthropic SDK** | Claude tokenizer |
| **Transformers** | Tokenizers for Meta, Mistral, DeepSeek, Qwen |
| **BeautifulSoup4** | HTML parsing for web search |
| **Passlib + Bcrypt** | Password hashing |
| **python-jose** | JWT handling |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Docker & Docker Compose** | Containerization |
| **Nginx** | Reverse proxy and SSL termination |
| **Gunicorn + Uvicorn** | Production ASGI server |
| **Redis** | Distributed rate limiting (optional) |
| **Let's Encrypt** | SSL certificates |

### Testing
| Technology | Purpose |
|------------|---------|
| **Vitest** | Frontend unit testing |
| **Playwright** | End-to-end testing |
| **Pytest** | Backend testing |
| **Testing Library** | React component testing |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **Python** ≥ 3.11
- **Docker** & **Docker Compose** (recommended)
- **PostgreSQL 15** (for production, SQLite for development)

### Environment Variables

Create `backend/.env` with the following variables:

```bash
# Required
SECRET_KEY=your-secure-random-secret-key
OPENROUTER_API_KEY=your-openrouter-api-key

# Database (PostgreSQL for production)
DATABASE_URL=postgresql://compareintel:password@postgres:5432/compareintel

# Optional: Email (for verification emails)
MAIL_USERNAME=your-smtp-username
MAIL_PASSWORD=your-smtp-password
MAIL_FROM=noreply@yourdomain.com
MAIL_SERVER=smtp.yourdomain.com
MAIL_PORT=587

# Optional: reCAPTCHA v3 (for registration protection)
RECAPTCHA_SECRET_KEY=your-recaptcha-secret

# Environment
ENVIRONMENT=development  # or "production"
FRONTEND_URL=http://localhost:5173
```

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/your-username/CompareIntel.git
cd CompareIntel

# Start all services (PostgreSQL, backend, frontend, nginx)
docker compose up -d

# View logs
docker compose logs -f

# Access the application
open http://localhost:8080
```

### Local Development (Without Docker)

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173` and the API at `http://localhost:8000`.

---

## Architecture

### Project Structure

```
CompareIntel/
├── backend/
│   ├── app/
│   │   ├── config/           # Settings, constants, validation
│   │   ├── middleware/       # Profiling, CORS
│   │   ├── routers/          # API route handlers
│   │   │   ├── api.py        # Core comparison endpoints
│   │   │   ├── auth.py       # Authentication endpoints
│   │   │   └── admin.py      # Admin panel endpoints
│   │   ├── utils/            # Helper functions
│   │   ├── auth.py           # JWT and password utilities
│   │   ├── credit_manager.py # Credit allocation and tracking
│   │   ├── database.py       # SQLAlchemy setup
│   │   ├── models.py         # Database models
│   │   ├── model_runner.py   # OpenRouter API integration
│   │   ├── rate_limiting.py  # Usage limits
│   │   └── schemas.py        # Pydantic schemas
│   ├── tests/                # Backend tests
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── admin/        # Admin panel components
│   │   │   ├── auth/         # Authentication UI
│   │   │   ├── comparison/   # Core comparison UI
│   │   │   ├── conversation/ # Chat history
│   │   │   ├── credits/      # Credit display
│   │   │   ├── layout/       # Navigation, hero, banners
│   │   │   └── shared/       # Reusable components
│   │   ├── contexts/         # React Context providers
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API client and services
│   │   ├── styles/           # CSS modules
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   ├── e2e/                  # Playwright E2E tests
│   └── package.json
│
├── nginx/                    # Nginx configurations
├── docker-compose.yml        # Development setup
├── docker-compose.prod.yml   # Production setup
├── docker-compose.ssl.yml    # Production with SSL
└── deploy-production.sh      # Deployment script
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React + TypeScript + Vite                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ CompareForm │  │ ModelSelect │  │ ResultsDisplay     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬─────────┘  │
│         └────────────────┴───────────────────┬┘             │
│                                              │ SSE Stream   │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
┌──────────────────────────────────────────────┼──────────────┐
│                     Nginx (Reverse Proxy)    │              │
│                     SSL Termination          │              │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│  FastAPI + SQLAlchemy + Pydantic                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ Auth Router  │  │  API Router  │  │ Admin Router   │     │
│  └──────────────┘  └──────┬───────┘  └────────────────┘     │
│                          │                                   │
│                          ▼                                   │
│                  ┌───────────────┐                           │
│                  │ Model Runner  │ ─────► OpenRouter API     │
│                  └───────────────┘        (External)         │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL                         │   │
│  │  Users, Conversations, Credits, Usage Logs           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login and receive tokens |
| `/api/auth/logout` | POST | Clear authentication cookies |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/verify-email` | POST | Verify email with token |
| `/api/auth/resend-verification` | POST | Resend verification email |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password` | POST | Reset password with token |
| `/api/auth/me` | GET | Get current user info |

### Core API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/models` | GET | List available AI models |
| `/api/compare-stream` | POST | Stream model comparisons (SSE) |
| `/api/estimate-tokens` | POST | Estimate token usage before comparison |
| `/api/rate-limit-status` | GET | Get user's remaining credits |
| `/api/credit-balance` | GET | Get detailed credit balance |
| `/api/credits/balance` | GET | Get credit balance |
| `/api/credits/usage` | GET | Get credit usage statistics |
| `/api/model-stats` | GET | Get model performance statistics |
| `/api/conversations` | GET | List user's conversation history |
| `/api/conversations/{id}` | GET | Get conversation details |
| `/api/conversations/{id}` | DELETE | Delete a conversation |
| `/api/conversations/breakout` | POST | Create breakout conversation from comparison |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/users` | GET | List all users |
| `/api/admin/users/{id}` | PATCH | Update user (tier, admin status) |
| `/api/admin/users/{id}/mock-mode` | POST | Toggle mock mode for testing |
| `/api/admin/settings` | GET/PUT | Manage application settings |

---

## Subscription Tiers

| Tier | Price | Daily/Monthly Credits | Models per Comparison | Conversation History |
|------|-------|----------------------|----------------------|---------------------|
| **Anonymous** | Free | 50/day | 3 | 2 |
| **Free** | Free | 100/day | 3 | 3 |
| **Starter** | $9.95/mo | 1,200/month | 6 | 10 |
| **Starter+** | $19.95/mo | 2,500/month | 6 | 20 |
| **Pro** | $39.95/mo | 5,000/month | 9 | 40 |
| **Pro+** | $79.95/mo | 10,000/month | 12 | 80 |

### Credit System

Credits are calculated based on token usage:
- **1 credit = 1,000 effective tokens**
- **Effective tokens = input_tokens + (output_tokens × 2.5)**
- Average comparison: ~5 credits (mix of standard/extended/follow-ups)

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_auth.py

# Run tests matching pattern
pytest -k "test_login"
```

### Frontend Tests

```bash
cd frontend

# Run unit tests
npm run test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E with browser visible
npm run test:e2e:headed
```

---

## Deployment

### Production Deployment

The project includes a comprehensive deployment script for Ubuntu/PostgreSQL servers:

```bash
# Full deployment (git pull, migrations, build, restart)
./deploy-production.sh deploy

# Quick deploy (no git pull, for hotfixes)
./deploy-production.sh quick-deploy

# Check system status
./deploy-production.sh status

# View logs
./deploy-production.sh logs

# Rollback to previous version
./deploy-production.sh rollback
```

### Docker Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local development |
| `docker-compose.dev-ssl.yml` | Local development with SSL |
| `docker-compose.prod.yml` | Production without SSL |
| `docker-compose.ssl.yml` | Production with SSL (recommended) |

---

## Development

### Code Quality

The project uses several tools to maintain code quality:

**Backend:**
- **Ruff** — Fast Python linter
- **Black** — Code formatter
- **Mypy** — Static type checking
- **Pre-commit hooks** — Automated checks

**Frontend:**
- **ESLint** — JavaScript/TypeScript linting
- **Prettier** — Code formatting
- **TypeScript** — Static typing

### Running Linters

```bash
# Backend
cd backend
ruff check .
black --check .
mypy app

# Frontend
cd frontend
npm run lint
npm run format:check
npm run type-check
```

---

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Write tests for new features
- Follow existing code style and patterns
- Update documentation as needed
- Keep commits atomic and well-described
- Ensure all tests pass before submitting PR

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Jack Daniel Lewis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

---

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) — Unified access to AI models
- [FastAPI](https://fastapi.tiangolo.com/) — Modern Python web framework
- [Vite](https://vitejs.dev/) — Next-generation frontend tooling
- [KaTeX](https://katex.org/) — Fast math typesetting

---

<p align="center">
  <sub>Built with ❤️ by Jack Daniel Lewis</sub>
</p>

