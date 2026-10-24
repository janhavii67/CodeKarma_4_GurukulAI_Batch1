# System Architecture

**Status:** Planned

## 1. Full workflow diagram (a request through the system)

```mermaid
flowchart TD
  A["User action in browser"] --> B["React page calls typed API client"]
  B --> C["FastAPI router<br/>/api/v1/..."]
  C --> D{"Valid session cookie?"}
  D -- No --> X1["401"]
  D -- Yes --> E{"CSRF header ok<br/>(unsafe methods)?"}
  E -- No --> X2["403"]
  E -- Yes --> F{"Has permission?"}
  F -- No --> X3["403"]
  F -- Yes --> G["Service layer<br/>business rules + object-level checks"]
  G --> H["Repository / SQLAlchemy"]
  H --> I[("PostgreSQL")]
  G --> J["Integrations<br/>storage, LLM, STT"]
  G --> K["Audit service"]
  G --> L["JSON response"]
  L --> B
```

## 2. Required tech stack and technologies

| Concern | Choice |
|---|---|
| Container orchestration | Docker Compose: `db`, `backend`, `frontend` |
| Frontend dev server | Vite, with a proxy for `/api` to the backend (same origin, so cookies and CSRF stay simple) |
| Backend server | Uvicorn running FastAPI |
| Background work | FastAPI `BackgroundTasks` plus a `processing_jobs` table (**hackathon simplification**; Redis worker later) |
| Search | PostgreSQL `tsvector` full-text search (**pgvector later**) |
| Storage | `StorageService` interface with a local-disk implementation (S3-compatible later) |
| AI | `LLMProvider` and `SpeechProvider` interfaces with swappable implementations |

## 3. System architecture

```mermaid
flowchart TB
  subgraph Client
    UI["React + TypeScript<br/>features/*"]
  end
  subgraph Backend["FastAPI modular monolith"]
    RT["api/v1 routers"]
    CORE["core: config, security,<br/>permissions, errors, logging"]
    SVC["services (per module)"]
    REPO["repositories + models"]
    INT["integrations:<br/>storage / llm / speech"]
    JOB["job runner<br/>(BackgroundTasks)"]
  end
  subgraph Data
    PG[("PostgreSQL")]
    VOL[("media volume")]
  end
  subgraph External
    CL["Claude API"]
    WH["Whisper API<br/>or local faster-whisper"]
  end
  UI --> RT --> CORE --> SVC --> REPO --> PG
  SVC --> INT
  SVC --> JOB --> INT
  INT --> VOL
  INT --> CL
  INT --> WH
```

Rules: routers stay thin; business logic lives in services; only repositories touch SQLAlchemy; modules share `core/`, `db/`, `integrations/` and never import each other's repositories.

## 4. Tech flow: login and protected call

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as FastAPI
  participant D as PostgreSQL
  B->>A: POST /auth/login (email, password)
  A->>D: load user, verify Argon2id hash
  A->>D: insert session (hashed token, expiry)
  A-->>B: Set-Cookie session (HttpOnly) + csrf cookie
  B->>A: GET /auth/me (cookie)
  A->>D: find session, check idle + absolute expiry
  A-->>B: user + permissions
  B->>A: POST /knowledge (cookie + X-CSRF-Token)
  A->>A: permission check, then service
  A->>D: write + audit log
  A-->>B: 201
```

## 5. Steps
1. Compose file with 3 services and a Postgres volume.
2. Backend skeleton and `/health` (checks DB).
3. Alembic baseline migration.
4. Session auth and permission dependency.
5. Frontend shell with proxy and API client.
6. Add modules one at a time using the shared services.

## 6. Other information
- **Environment:** `.env` holds `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `STT_PROVIDER`, `OPENAI_API_KEY` (optional), `MEDIA_DIR`, `MAX_UPLOAD_MB`.
- **Production later:** nginx in front, HTTPS, `Secure` cookies, Redis workers, S3 storage, pgvector.
