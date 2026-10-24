# Project Overview — Gurukul AI

**Status:** Planned (nothing implemented yet)

## 1. Full workflow diagram

```mermaid
flowchart LR
  A["1 CAPTURE<br/>M1 Knowledge Capture<br/>M4 Voice-to-Knowledge"] --> B["2 STRUCTURE<br/>AI draft steps<br/>(M4)"]
  B --> C["3 VALIDATE<br/>M6 Review, Approve,<br/>Version"]
  C --> D["4 TEACH<br/>M2 AI Assistant<br/>M3 Guided Workflows"]
  D --> E["5 PRACTICE<br/>M5 Troubleshooting<br/>M9 Failure Simulator"]
  E --> F["6 VERIFY<br/>M10 Skill Verification<br/>M7 Sound / M11 Sync Sim"]
  F --> G["7 IMPROVE<br/>Feedback creates<br/>a new draft"]
  G --> A
  classDef built fill:#d1fae5,stroke:#059669,color:#064e3b;
  classDef later fill:#f3f4f6,stroke:#9ca3af,color:#374151;
  class A,B,C built;
  class D built;
  class E,F,G later;
```

Green = in hackathon scope (M1, M4, M6, M2). Grey = planned after the hackathon (shown as labelled placeholders).

## 2. Required tech stack and technologies (whole product)

| Layer | Technology | Hackathon? |
|---|---|---|
| Frontend | React, TypeScript, Vite, React Router, Tailwind CSS, TanStack Query | Yes |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | Yes |
| Database | PostgreSQL 16 (full-text search) | Yes |
| Auth | Server-side sessions, HTTP-only cookie, Argon2id (argon2-cffi) | Yes |
| LLM | Claude API behind a provider adapter | Yes |
| Speech-to-text | Adapter: OpenAI Whisper API or local faster-whisper | Yes |
| Media | ffmpeg, browser MediaRecorder, local disk behind a storage interface | Yes |
| Containers | Docker + Docker Compose | Yes |
| Vector search (pgvector), Redis workers | — | Later |
| OpenCV, MediaPipe, librosa, NetworkX, React Flow, Cytoscape.js | — | Later (M5, M7–M11) |

## 3. System architecture (summary)

```mermaid
flowchart TB
  U["Browser<br/>React + TS"] -->|"HTTPS /api/v1<br/>session cookie"| API["FastAPI backend"]
  API --> DB[("PostgreSQL")]
  API --> FS[("Media storage<br/>local volume")]
  API --> LLM["Claude API<br/>(adapter)"]
  API --> STT["Speech-to-text<br/>(adapter)"]
```
Details: `SYSTEM_ARCHITECTURE.md`.

## 4. Tech flow (hackathon demo story, end to end)

```mermaid
sequenceDiagram
  participant E as Expert A
  participant R as Expert B (reviewer)
  participant T as Trainee
  participant S as Gurukul AI
  E->>S: Record or upload narration (M1/M4)
  S->>S: Transcribe, then AI-structure into draft steps (M4)
  E->>S: Correct transcript and steps, submit (M1/M6)
  R->>S: Review, approve (M6)
  S->>S: Publish version, build search chunks
  T->>S: Ask a question (M2)
  S->>T: Answer with citations to the approved version
  T->>S: Ask something not covered
  S->>T: "No approved source found" + escalate
```

## 5. Steps
1. Build the foundation (auth, roles, layout).
2. Build M1 (capture) and M6 (review) as one connected flow.
3. Add M4 (voice) as the "wow" feature.
4. Add M2 (assistant) on top of published knowledge only.
5. Add labelled placeholders for the other modules.
6. Seed clearly labelled demo data, test, record, present.

## 6. Other information
- **Core rules:** AI creates drafts only. Only expert-approved, versioned content is shown as authoritative. Nothing can control a real machine.
- **Naming:** the product is **Gurukul AI**. Old documents say "SUJANA AI"; ignore that name.
- **Roles:** two roles, Expert and Trainee. "Reviewer" is a permission (`knowledge.approve`) given to selected Experts.
- **Limits:** see `HACKATHON_PLAN.md` for what is deliberately skipped.
