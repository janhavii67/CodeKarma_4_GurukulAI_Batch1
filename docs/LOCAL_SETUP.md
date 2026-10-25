# Gurukul AI — Local Setup & Execution Guide

## Prerequisites
- **Python**: 3.11+ (Python 3.12 or 3.13 recommended)
- **Node.js**: v18+ (tested with v20/v26)
- **PowerShell / Bash**

---

## 1. Quickstart (Dual Server Execution)

### Step 1: Backend Setup
```powershell
# From project root:
cd backend

# Virtual environment is already configured in .venv
# Activate virtual environment:
.\.venv\Scripts\Activate.ps1

# Run database migrations:
python -m alembic upgrade head

# Return to root and run database seeder:
cd ..
.\backend\.venv\Scripts\python.exe -m infrastructure.scripts.seed

# Start FastAPI backend server (Port 8000):
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Step 2: Frontend Setup
In a new terminal window:
```powershell
# From project root:
cd frontend
# Install dependencies (if not already installed):
npm install

# Start Vite development server:
npm run dev
```

Open your browser to:
- **Frontend SPA**: `http://localhost:5173` (or `http://localhost:5174` if 5173 is busy)
- **Backend Swagger Docs**: `http://127.0.0.1:8000/docs`
- **Backend Health Check**: `http://127.0.0.1:8000/api/v1/health`

---

## 2. Pre-Configured Seed Demo Credentials

| Role | Email | Password | Allowed Capabilities |
|---|---|---|---|
| **Administrator** | `admin@demo.local` | `Admin@Gurukul2026!` | Full system management, user provisioning, audit inspection |
| **Expert Author** | `expert.a@demo.local` | `ExpertA@Gurukul2026!` | Author articles, draft procedures, submit for review, register machines |
| **Lead Reviewer** | `expert.b@demo.local` | `ExpertB@Gurukul2026!` | Review and approve peer articles (self-review strictly forbidden) |
| **Operator** | `operator@demo.local` | `Operator@Gurukul2026!` | Access approved operational procedures and troubleshooting |
| **Workshop Trainee** | `trainee@demo.local` | `Trainee@Gurukul2026!` | Access approved SOPs, execute guided procedures, attempt simulations |

---

## 3. Running Automated Tests

### Backend Tests:
```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend
```

### Frontend Tests:
```powershell
cd frontend
npm test
```
