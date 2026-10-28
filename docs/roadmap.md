# Gurukul AI Platform Roadmap

This document outlines the strategic implementation roadmap, completed milestones, upcoming phases, and deferred architectural enhancements for Gurukul AI.

---

## 1. Milestone Status Overview

| Phase | Module | Scope | Status | Verification Summary |
|---|---|---|---|---|
| **Phase 1** | **00 Foundation** | Auth, RBAC, Sessions, CSRF, Audit Logging, Navigation Shell | **Completed** | Full suite passed (roles, permissions, rate limits) |
| **Phase 2** | **01 Expert Knowledge Capture** | SOP authoring, step sequences, media attachments, revision drafts | **Completed** | Endpoints and database models tested |
| **Phase 2** | **06 Validation & Versioning** | Approval lifecycle, status constraints, withdrawal invariants | **Completed (Core)** | Enforced via `KnowledgeEligibilityPort` |
| **Phase 3** | **02 AI Knowledge Assistant** | Gemini RAG, SSE streaming, chat UI, grounding validator, folder ingestion, contextual workflow/troubleshooting handoffs | **Completed; Chunk 10 handoffs implemented** | After Chunk 10: 609 backend passed (17 warnings), 87 frontend passed, and TypeScript/build, Python compile, and diff check passed. Audit's synthetic live Gemini connectivity succeeded in 6.11 seconds; full live RAG/stream verification remains. |
| **Phase 3** | **04 Voice-to-Knowledge** | Audio capture, timestamped transcription, orchestrated structuring, review queue | **Chunk 4 complete** | Shared AI orchestration, bounded uploads, private media access, and draft-only RAG indexing; covered by the full suite |
| **Phase 3** | **03 Guided Workflows** | Interactive shopfloor execution, step validation, deviation tracking | **Chunk 5 complete** | Published knowledge drafts flow through peer approval into immutable workflow revisions; operator sessions track navigation, explicit completion, and cited issue guidance |
| **Phase 4** | **05 Troubleshooting** | Evidence-grounded investigations, persisted outcomes, workflow issue integration | **Chunk 6 complete** | Published RAG sources only; unresolved sessions escalate and can seed a normal-review knowledge draft |
| **Phase 4** | **09 Failure Simulator** | Revisioned decision scenarios, deterministic branching, session review | **Chunk 7 implemented** | Scenario authoring/review, published-source citations, persisted private attempts, and formative outcome summaries |
| **Phase 5** | **07 Machine Sound Matching** | Compare machine sounds to approved reference recordings | **Chunk 8 implemented** | Real WAV/FLAC decoding, versioned log-mel profile matching, private review submission, shared knowledge approval |
| **Phase 5** | **08 Knowledge Graph** | Neo4j / Graph relationships across machines, failure modes, and SOPs | **Planned** | Ontology spec defined |
| **Phase 6** | **10 Practical Skill Verification** | Trainee evaluation checklists, digital signatures, certification | **Planned** | Spec defined |
| **Phase 6** | **11 Synchronized Simulation** | Multi-operator synchronous scenario training | **Planned** | Spec defined |

---

## 2. Completed in Module 02 (AI Knowledge Assistant)

- **M02-A (Backend API):**
  - Exposed `/api/v1/assistant/chat` (non-streaming JSON) and `/api/v1/assistant/chat/stream` (Server-Sent Events).
  - Conversation management with strict user-level ownership isolation (`GET`, `GET /{id}`, `DELETE /{id}`).
  - Feedback triage endpoint (`POST /feedback`) capturing 6 issue reason categories.
  - Source inspection endpoint (`GET /sources/{id}`) restricted to published content.
  - Per-user rate limiting (20 req/min) and audit logging.
- **M02-B (Frontend Client & Streaming Hook):**
  - Comprehensive TypeScript schemas for conversations, messages, sources, and feedback.
  - Custom React hook `useAssistantChat` consuming SSE streams via `ReadableStream` with `AbortController` cancellation and fallback.
  - Zero `localStorage` footprint: conversation states kept exclusively in memory.
- **M02-C (Interactive Chat Interface):**
  - Two-column responsive interface at `/app/assistant`.
  - Conversation list sidebar with creation and deletion modal.
  - Message bubble stream rendering with pulsing cursor, timestamps, and metadata tags.
  - Clickable source pills with slide-over drawer detailing active chunks.
  - Shopfloor machine context filter linked to `/machines`.
  - Empty conversation starter questions and "Insufficient Evidence" notification banner.
- **M02-D (E2E Verification & Hardening):**
  - Automated integration test verifying published SOP retrieval followed by immediate retraction on withdrawal.
  - Automated security test verifying ID enumeration returns 404 for non-owned conversations.
- **M02-E (Gemini and folder ingestion):**
  - Added configurable Gemini generation and embedding providers, an idempotent knowledge-base folder ingestion CLI and Expert endpoint, source labeling, and setup instructions.
  - The integration audit routed streaming through the shared AI orchestrator, added question-context retrieval for follow-ups, enforced current published revisions, masked stale history, and normalized retrieval failures.
  - Unmatched and ambiguous audio result cards now restore from the existing owner-checked analysis job link without persisting uploaded bytes or invoking model diagnosis.
  - Latest full verification: 606 backend tests and 86 frontend tests passed; TypeScript/build, Python compile, fresh SQLite migration through revision 014, and `git diff --check` passed.
  - A synthetic live Gemini request returned a concise answer with citations to two fabricated chunks after 180 seconds, exposing a provider timeout gap. The provider now applies the configured HTTP timeout, disables nested SDK retries, and uses an overall request deadline. A post-fix synthetic connectivity request succeeded in 6.11 seconds; full live RAG/stream verification remains.

---

## 3. Explicitly Deferred Items

### Module 07 Machine Sound Matching — Chunk 8
- Operators compare decoded WAV/FLAC recordings with current published expert references using a versioned 48-band log-mel profile; scores are similarity ranking values, not calibrated probabilities.
- Reference drafts link to current approved knowledge revisions and use the shared peer-review/publication lifecycle. Unmatched recordings remain private and never become references automatically.
- Query audio is processed in memory unless an operator submits it for expert review. There is no production recording corpus, pretrained audio model, or threshold calibration yet.

### Module 03 (Guided Workflows) — Chunk 5
- Workflow drafts are created from approved, published step-based knowledge and then edited through the existing knowledge editor and peer review pipeline.
- Approved revisions create traceable procedure snapshots. Superseded snapshots are archived while existing runs retain their original revision.
- Operators get one-step-at-a-time execution, explicit step completion, session progress, issue reporting, and retrieval of published troubleshooting citations.
- Images/media remain linked through the existing knowledge media records. External live Gemini explanations are not part of this workflow chunk; instructions are presented from approved content.

### Module 05 (Troubleshooting) — Chunk 6
- Operator investigations retrieve only eligible published knowledge through the existing RAG service and snapshot source revisions and ordered authored steps into persistent sessions.
- Recorded pass/fail/unknown/persistent/resolved outcomes advance through source-authored checks only; a failed check does not infer a root cause. Unsupported or missing checks lead to expert escalation.
- Workflow issue reports can launch linked sessions with run, revision, and step context; troubleshooting does not complete workflow steps.
- Escalated cases can be claimed by an authorized reviewer and copied into a knowledge draft for the existing review/publication lifecycle.
- Legacy demo trees without published source links are hidden from operator discovery.

The following items are deliberately deferred to future development cycles:

### 1. Dense Vector Embeddings & Vector Reranking
- **Scope:** Upgrading from keyword full-text search to hybrid dense vector retrieval (`pgvector` + HNSW indexing) paired with a Cross-Encoder / ColBERT reranking model.
- **Rationale:** The SQL keyword retrieval engine with token overlap, phrase matching, and machine context bonus provides deterministic sub-50ms latency on the local SQLite / PostgreSQL footprint during the initial hackathon phases without external embedding dependency overhead.

### 2. Automated Conversation Retention Worker
- **Scope:** Scheduled background job (e.g., Celery / APScheduler worker) to automatically purge or archive conversations exceeding `CHAT_RETENTION_DAYS` (365 days).
- **Rationale:** Soft-deletion (`status='deleted'`) is implemented and enforced across all endpoints. Hard deletion cleanup runs efficiently as a batch script without needing continuous worker resources during Phase 3.

### 3. Graph-Based Retrieval & Multi-Hop Reasoning
- **Scope:** Expanding retrieved candidate chunks using knowledge graph traversal across machines, sub-assemblies, tool models, and historical failure modes.
- **Dependency:** Blocked on **Module 08 (Manufacturing Knowledge Graph)**. Once the graph ontology and Neo4j / Graph store are implemented, graph traversal hooks will feed into `RetrievalService`.

---

## 4. Recommended Next Milestone

### **Next: Module 08 Knowledge Graph**
- Implement the separately planned machine/component/failure-mode/SOP graph, with published-source validation before any graph result can augment Tutor evidence.
- Keep simulator practice separate from real machine operation and skill certification. Machine sound similarity still does not establish equipment diagnosis or operator competency.
- Machine sound similarity remains separate from Failure Simulator and does not establish equipment diagnosis or operator competency.
