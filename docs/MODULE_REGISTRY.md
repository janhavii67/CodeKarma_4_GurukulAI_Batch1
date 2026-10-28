# Module Registry

**Status:** Current implementation registry. See [roadmap.md](roadmap.md) for milestone detail and [ROADMAP_STATUS.md](ROADMAP_STATUS.md) for the repository audit.

## 1. Full workflow diagram (module dependencies)

```mermaid
flowchart TD
  F["00 Foundation<br/>auth, roles, layout"] --> M1["01 Knowledge Capture"]
  M1 --> M6["06 Validation + Versioning"]
  M1 --> M4["04 Voice-to-Knowledge"]
  M4 --> M6
  M6 --> M2["02 AI Assistant"]
  M6 --> M3["03 Guided Workflows"]
  M6 --> M5["05 Troubleshooting"]
  M3 --> M9["09 Failure Simulator"]
  M5 --> M9
  M6 --> M7["07 Sound Analysis"]
  M6 --> M8["08 Knowledge Graph"]
  M4 --> M11["11 Synchronized Simulation"]
  M3 --> M11
  M3 --> M10["10 Skill Verification"]
  classDef h fill:#d1fae5,stroke:#059669;
  class F,M1,M6,M4,M2 h;
```

## 2. Required tech stack
See each module file. Shared stack: React/TS, FastAPI, PostgreSQL, SQLAlchemy/Alembic, Docker.

## 3. System architecture
Modular monolith. Each module owns routers, schemas, services, models and a frontend feature folder. Shared: auth, permissions, audit, storage, jobs, AI adapters.

## 4. Tech flow
Modules talk through services and database foreign keys, never by importing another module's repository.

## 5. Registry

| # | Module | Doc | Phase | Hackathon | Status |
|---|---|---|---|---|---|
| 00 | Foundation | modules/00-foundation.md | 1 | Build | Tested |
| 01 | Expert Knowledge Capture | modules/01-expert-knowledge-capture.md | 2 | Build | Implemented and tested |
| 06 | Knowledge Validation and Versioning | modules/06-knowledge-validation.md | 2 | Build | Implemented and tested; field-level comparison is available, granular step diff remains |
| 04 | Voice-to-Knowledge | modules/04-voice-to-knowledge.md | 3 | Build ("wow") | Implemented; real transcription requires a configured provider and expert review |
| 02 | AI Knowledge Assistant | modules/02-ai-assistant.md | 3 | Build + Chunk 10 handoffs | Implemented; full live RAG/stream verification remains |
| 03 | Guided Workflows | modules/03-guided-workflows.md | 3 | Chunk 5 implemented | Implemented; published revisions, execution sessions, and cited issue guidance |
| 05 | Troubleshooting | modules/05-troubleshooting.md | 4 | Chunk 6 implemented | Implemented; evidence-grounded sessions and safe escalation |
| 09 | Failure Simulator | modules/09-failure-simulator.md | 4 | Chunk 7 implemented | Implemented; deterministic, revision-pinned scenarios |
| 07 | Machine Sound Matching | modules/07-machine-sound-analysis.md | 5 | Chunk 8 implemented | Implemented; WAV/FLAC matching against approved, version-linked references |
| 08 | Knowledge Graph | modules/08-manufacturing-knowledge-graph.md | 5 | Planned | Not implemented |
| 11 | Synchronized Simulation | modules/11-synchronized-training-simulation.md | 6 | Planned | Not implemented |
| 10 | Practical Skill Verification | modules/10-practical-skill-verification.md | 6 | Planned | Not implemented |

## 6. Other information
Update this table and `ROADMAP_STATUS.md` after completed work. A module is "Implemented" only when its real frontend-to-backend flow works, and "Tested" only when tests were actually run. `TASKS.md` records the original hackathon plan and is historical.
