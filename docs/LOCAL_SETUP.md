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

### Local audio transcription (Windows CPU)
Install the backend requirements, then set these values in `backend/.env` (the API loads `.env` relative to the `backend` working directory) and restart the backend:

```dotenv
STT_PROVIDER=local_whisper
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=cpu
LOCAL_WHISPER_COMPUTE_TYPE=int8
LOCAL_WHISPER_CPU_THREADS=4
LOCAL_WHISPER_LANGUAGE=en
```

`faster-whisper` runs inference locally with a single cached model and one inference worker to limit resource use on 8 GB machines. The default `en` language avoids false language detection on short English clips; set `LOCAL_WHISPER_LANGUAGE=auto` when recordings may contain different languages. The first transcription downloads the selected model into the local Hugging Face cache; after that, inference is local and does not call OpenAI or another speech API. Use short recordings and close other memory-heavy applications while the model is loading.

The backend requirements pin PyAV below version 19 because `faster-whisper` 1.2.1 passes an audio-decoder option removed in PyAV 19. After updating backend dependencies, run `python -m pip install -r requirements.txt` from `backend`, then restart FastAPI.

The optional paid OpenAI provider remains available only when explicitly selected with `STT_PROVIDER=whisper_api` (or `openai`) and `OPENAI_API_KEY` is set. The provider factory never falls back to OpenAI when another or unknown provider is selected. Keep any API key only in `backend/.env`; do not add it to frontend variables or commit the file.

### Gemini procedure structuring
Local Whisper transcribes the recording, but generating structured procedure steps uses the configured LLM provider. The default is Gemini. To enable it, put the following in `backend/.env` (replace the placeholder locally; never commit the real key), then restart FastAPI:

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
ALLOW_EXTERNAL_LLM=true
```

Only enable external LLM calls if your organization's data policy permits sending transcript text to Gemini. If structuring failed after the transcript was saved, open that failed job and choose **Resume structuring** after configuration is ready. The resume uses the existing saved transcript and does not re-record or re-transcribe the audio. If Gemini is unavailable or misconfigured, the job remains failed and the audio/transcript remain available for review.

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
