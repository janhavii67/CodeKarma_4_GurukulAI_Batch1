# Gurukul AI — Manufacturing Knowledge & Training Platform

Gurukul AI is a specialized industrial tribal knowledge capture, peer-reviewed Standard Operating Procedure (SOP) governance, and grounded training simulation platform.

---

## 1. System Invariants & Non-Negotiables
1. **AI Generates Drafts Only:** AI can never publish or promote content to authoritative status (`origin: ai_draft` requires expert review).
2. **Zero Hallucination of Tolerances:** Machine parameters, tools, and safety limits are never invented; gaps are explicitly marked `needs_review: true`.
3. **Strict Peer Review Governance:** Authors are strictly forbidden from approving their own revisions (`403 self_review_forbidden`), enforced at service and database transaction boundaries.
4. **Immutable Published Versions:** Published SOP versions are frozen historical snapshots. Any edit creates a new draft version.
5. **Air-Gapped from Machine Actuation:** The platform interfaces exclusively with humans for training and training guidance; it has zero hardware control interfaces.

---

## 2. Project Architecture & Layout

```
GurukulAI/
├── docker-compose.yml           # Multi-container orchestration (db, backend, frontend)
├── .env.example                 # Environment configuration template
├── README.md                    # Project reference & setup guide
├── infrastructure/
│   └── scripts/
│       └── seed.py              # Idempotent database seeder (roles, permissions, demo users)
├── gurukul-docs/docs/           # Architectural, database, and API specifications
├── backend/                     # FastAPI Modular Monolith
│   ├── pyproject.toml           # Python build & dependency metadata
│   ├── requirements.txt         # Pinned backend dependencies
│   ├── Dockerfile               # Production container image
│   ├── alembic.ini              # Database migration configuration
│   ├── alembic/
│   │   ├── env.py               # Migration environment runner
│   │   └── versions/
│   │       └── 001_foundation.py# Foundation DDL migration
│   └── app/
│       ├── main.py              # FastAPI entrypoint, middlewares, error handlers
│       ├── core/                # Config, security, permissions (RBAC), exceptions, logging
│       ├── db/                  # Base declarative models, session dependency
│       ├── models/              # SQLAlchemy 2.0 typed models (User, Role, Session, Audit)
│       ├── schemas/             # Pydantic v2 validation schemas
│       ├── repositories/        # Data access layer
│       ├── services/            # Business logic (Auth, Audit)
│       ├── api/v1/              # Versioned API routers & endpoints
│       └── tests/               # Pytest suite (health, auth, RBAC, CSRF)
└── frontend/                    # React 18 + TypeScript + Vite SPA
    ├── package.json             # Frontend dependencies & scripts
    ├── vite.config.ts           # Vite bundler, proxy (/api -> :8000), Vitest setup
    ├── tailwind.config.js       # Industrial steel & amber design tokens
    └── src/
        ├── context/             # AuthContext (server-cookie session management)
        ├── lib/api/client.ts    # Fetch wrapper with CSRF injection & credentials
        ├── components/ui/       # Industrial reusable UI components
        ├── layouts/             # AppLayout with role-based navigation sidebar
        ├── routes/              # ProtectedRoute with RBAC checks
        ├── features/auth/       # Login and Trainee Registration
        ├── features/dashboard/  # Expert & Trainee dynamic dashboards
        ├── features/placeholders/# Honest specification previews for all 11 modules
        └── tests/               # Vitest suite (Auth, Placeholders, RBAC UI)
```

---

## 3. Quickstart & Local Development

### Prerequisites
- **Node.js**: v18+ (tested on Node v20/v26)
- **Python**: 3.11+ (Python 3.12/3.13)
- **Docker & Docker Compose** (optional, recommended for production simulation)

---

### Option A: Running via Docker Compose

```bash
# 1. Clone repository and prepare environment
cp .env.example .env

# 2. Build and start PostgreSQL, Backend, and Frontend containers
docker compose up --build -d

# 3. Apply baseline database migrations
docker compose exec backend alembic upgrade head

# 4. Seed demo roles, permissions, and accounts
docker compose exec backend python -m infrastructure.scripts.seed

# 5. Access the applications
# Frontend: http://localhost:5173
# Backend API Documentation: http://localhost:8000/docs
# Health Check: http://localhost:8000/api/v1/health
```

---

### Option B: Running Locally (Without Docker)

#### 1. Backend Setup

```bash
# From workspace root:
cd backend

# Create and activate virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (uses SQLite locally or PostgreSQL if configured in .env)
alembic upgrade head

# Seed database
cd ..
python -m infrastructure.scripts.seed

# Start FastAPI development server
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup

```bash
# From workspace root:
cd frontend

# Install npm packages
npm install

# Start Vite development server (proxies /api to http://localhost:8000)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 4. Pre-Configured Demo Seed Accounts

| Account | Email | Password | Role | Permissions / Privileges |
|---|---|---|---|---|
| **Expert Author** | `expert.a@demo.local` | `ExpertA@Gurukul2026!` | `EXPERT` | `knowledge.create`, `knowledge.edit_own_draft`, `knowledge.submit_review`, `machine.manage`, `knowledge.view_published`, `assistant.use` |
| **Lead Reviewer** | `expert.b@demo.local` | `ExpertB@Gurukul2026!` | `EXPERT` | All Expert permissions **plus** `knowledge.approve` and `audit.view` |
| **Trainee Operator** | `trainee@demo.local` | `Trainee@Gurukul2026!` | `TRAINEE` | `knowledge.view_published`, `assistant.use` |

> *Note: Pre-configured quick-login shortcuts are available directly on the `/login` screen.*

---

## 5. Security & Authentication Architecture

- **No Tokens in LocalStorage:** Authentication utilizes an opaque, cryptographically secure 32-byte token transmitted in an `HttpOnly`, `SameSite=Lax` cookie (`gk_session`).
- **Database-Backed Session Revocation:** Only SHA-256 hashes of session tokens are stored in the database. Logouts immediately revoke sessions server-side.
- **CSRF Protection:** State-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header matching the `gk_csrf` cookie (Double-Submit Cookie Pattern).
- **Argon2id Password Hashing:** Implemented via `argon2-cffi` adhering to memory and time cost parameters.
- **Role & Permission Enforced:** Backend API endpoints use FastAPI dependency injection (`require_permission`, `require_role`, `get_current_user`) to guarantee unauthorized callers receive `401 Unauthenticated` or `403 Forbidden`.

---

## 6. Running Tests

### Backend Test Suite (Pytest)
```bash
cd backend
python -m pytest app/tests -v
```
*Executes 12 test cases verifying database health check, valid login, invalid credential protection (no user enumeration), session revocation on logout, trainee self-registration invariance, deactivated account lockouts, Double-Submit CSRF header verification, and RBAC endpoint gating.*

### Frontend Test Suite (Vitest)
```bash
cd frontend
npm test
```
*Executes 7 test cases verifying authentication UI components, accessible form attributes, trainee registration disclaimer, 403 Forbidden screens, and module placeholder governance cards.*

### Frontend Production Build
```bash
cd frontend
npm run build
```
*Validates strict TypeScript types and compiles optimized production assets.*

---

## 7. Current Status & Next Steps

- **Phase 1: Foundation (Module 00)** — **COMPLETE & VERIFIED**
  - Database schema & Alembic migration `001_foundation`
  - FastAPI modular monolith with session authentication & CSRF protection
  - RBAC enforcement (`EXPERT`, `TRAINEE`)
  - React 18 + Vite frontend with Tailwind CSS industrial design system
  - Honest, navigable placeholder pages for all 11 planned modules
  - 100% passing test suites on backend (12/12) and frontend (7/7)
- **Phase 2: Next Implementation Step** — **Module 01: Expert Knowledge Capture & Module 06: Knowledge Validation & Versioning**