# Changelog

All notable changes to the Gurukul AI platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added - AI Tutor handoffs to Guided Workflows and Troubleshooting (Chunk 10)
- Tutor JSON and SSE answers now include deterministic handoff suggestions only when an operational-step or real-problem request matches current, cited, published evidence and the user can launch the target module.
- Added `POST /api/v1/assistant/handoffs/{kind}/{target_id}/start`; it verifies conversation ownership, cited-source eligibility, target association/current publication, and module permission at acceptance time.
- Reused the existing workflow run and troubleshooting session services. An active workflow run for the same operator/procedure resumes; an active troubleshooting session resumes for the same published source and symptom. New troubleshooting session context records the Tutor conversation/message and source revision.
- Chat history reconstructs eligible actions from prior user messages and current citations. Withdrawing/superseding a source removes suggestions and blocks start. Opening a workflow does not mark a physical task complete.
- No database migration. `ProcedureRun` has no suitable Tutor-origin reference field, so workflow sessions retain their existing procedure and source-revision provenance only.
- Verification: focused handoff tests passed (backend 3, frontend 1); full backend suite 609 passed with 17 existing warnings; full frontend suite 87 passed; TypeScript/production build, Python compile, and `git diff --check` passed. The build retains Vite's existing >500 kB chunk advisory. No migration was required.

### Added - Machine-audio questions in AI Tutor
- Added a WAV/FLAC upload control to the trainee chat and connected it to Module 07's approved-reference matcher.
- Matched recordings show the approved expert interpretation and source titles, then ask the existing grounded RAG chat to explain the possible documented match. No-match and ambiguous results do not trigger a diagnosis response.
- Audio similarity remains explicitly non-diagnostic; query audio is not retained unless separately submitted for expert review.
- Follow-up retrieval is constrained to the matched reference's current published knowledge item. Assistant messages store only the analysis-job ID; conversation history reconstructs the card after revalidating ownership, permission, and current approval status.
- Added migration `014_chat_audio_analysis_link`. If the source is no longer current or viewable, history suppresses the old answer and citations. Unmatched results are page-local and are not stored as chat turns.

### Added - Module 07 Machine Sound Matching (Chunk 8)
- Replaced the scenario simulator with decoded WAV/FLAC uploads and browser microphone recording, versioned 48-band log-mel profiles, and similarity ranking against only published expert references.
- Added knowledge-linked reference authoring, peer-review publication, private unmatched-sample review, secure audio streaming/deletion, RAG source citations, and reference feature reprocessing.
- Added migration `013_machine_sound_matching`; quarantined prior synthetic seed baselines and stopped creating synthetic audio references.
- Added NumPy, SciPy, and SoundFile for signal processing. Default score screening values are documented as uncalibrated heuristics; no pretrained audio model or production audio evaluation was used.
- Verification: backend 596 passed; frontend 83 passed; production TypeScript/Vite build succeeded; Python compile check passed; a fresh SQLite database migrated through revision 013. `alembic check` still reports existing model/schema drift in unrelated legacy tables; it reports no Module 07 operations. `git diff --check` passed.

### Added - Module 09 Failure Simulator (Chunk 7)
- Added revisioned, expert-authored scenarios with deterministic choices, cited consequences, graph validation, independent review, and publication.
- Added learner scenario discovery, one-decision-at-a-time simulation, private resumable attempts, decision history, formative completion summaries, restart, and expert-reviewed content reports.
- Added migrations `010_failure_simulator`, `011_simulation_scenario_title_index`, and `012_simulation_knowledge_review` for scenario revisions, pinned attempt state/history, the report queue, scenario discovery, and links into the shared knowledge review lifecycle.
- The simulator does not call an LLM, control machinery, create real troubleshooting cases/workflow runs, or certify practical competency.
- Verification: backend suite 590 passed; frontend 82 passed; production build succeeded; migrations 001–012 applied successfully on a fresh SQLite database and migrations 010–012 were applied locally. `alembic check` still reports existing drift in unrelated legacy tables/indexes; it reported no simulator-specific drift after the simulator indexes were aligned.

### Added - Module 03 Guided Workflows (Chunk 5)
- Workflow drafts can be started from published, step-based knowledge; editing and approval reuse the existing knowledge editor and peer review lifecycle.
- Approved revisions create immutable, source-linked workflow snapshots. Superseded snapshots are archived while existing sessions keep their original revision.
- Added workflow source search, published workflow search, one-step operator execution, explicit completion recording, session progress, issue reports, and published RAG troubleshooting citations.
- Added migration `008_guided_workflow_publication` for source/revision links, step details, and workflow session progress/issues.
- Verification: full backend suite 582 passed; frontend 82 passed; production build completed. Live Gemini was not required for workflow execution tests.

### Added - Module 05 Troubleshooting and Decision Trees (Chunk 6)
- Replaced the troubleshooting demo switcher with an operator investigation flow for problem description, machine/process context, published topic search, one-check-at-a-time review, explicit outcome recording, source citations, escalation, and saved-session resume.
- Sessions use the shared RAG eligibility/retrieval service, freeze source references and authored steps, and do not ask an LLM to invent causes, branches, or corrective instructions.
- Linked workflow issue launch and return navigation preserve run/revision/step context without marking workflow steps complete.
- Added expert escalation queue, claim/disposition, and case-to-knowledge-draft handoff using the existing knowledge review pipeline.
- Filtered unlinked legacy troubleshooting demo trees out of operator discovery.
- Added migration `009_troubleshooting_sessions` for snapshots, outcomes, process/workflow links, and RAG-backed sessions.
- Verification: focused workflow/session, legacy filtering, tree engine/validator, migration, frontend tests, and production build results are recorded after final verification.

### Added - Module 02 Gemini and Knowledge-Base Ingestion (M02-E)
- Configurable Gemini generation and embedding providers (`gemini-3.5-flash`, `gemini-embedding-001`), grounded prompt rules, citation validation, and streamed responses.
- Expanded technical knowledge base with 29 files (377 chunks) covering complete portfolios of Ethosh Digital and Biorad Medisys (Orthovasive, Indovasive, Neurovasive, Cleanroom & QMS).
- Idempotent folder ingestion CLI (`python -m app.modules.assistant.ingest --path <folder>`) and Expert-only ingestion endpoint (`POST /api/v1/assistant/ingest`).
- Verified: backend 74/74 tests passed; frontend 82/82 tests passed and production build completed; live smoke tests passed (2 in-domain questions grounded with real citations, 1 out-of-domain bread recipe rejected with `insufficient_evidence=True`).

### Added - Module 04 Expert Knowledge Capture (Chunk 4)
- Timestamped transcript structuring now calls the shared AI orchestrator and reports provider or malformed-output failures without generating fallback procedures.
- Structured draft summaries, key points, process entities, explicit parameters, safety notes, and transcript/media references are saved in existing knowledge-version fields.
- Audio/video uploads enforce extension, MIME, byte, and existing duration limits; temporary normalized audio is removed after processing.
- Transcript chunks remain inactive for operational assistant retrieval until their knowledge version is published, and are activated/deactivated with the existing approval lifecycle.
- Media streams, transcripts, job status, retries, and review access are permission-checked; reviewer access includes recordings attached to submissions in review.
- Verification: full backend suite 579 passed; frontend 82 passed; production build completed.

### Planned
- **Module 09:** Controlled failure simulator.

---

## [0.3.0] - 2026-10-27

### Added - Module 02: AI Knowledge Assistant (Full RAG System)

#### TASK M02-A: Backend Assistant API
- **Endpoints:**
  - `POST /api/v1/assistant/chat`: Non-streaming JSON assistant turn returning answer, cited sources, `insufficient_evidence` boolean, and conversation/message IDs.
  - `POST /api/v1/assistant/chat/stream`: Server-Sent Events endpoint emitting `token` events, `sources` payload, and `done`.
  - `GET /api/v1/assistant/conversations`: Lists current user's active conversations sorted by `updated_at DESC`.
  - `GET /api/v1/assistant/conversations/{id}`: Detailed conversation history and chunk citations; returns 404 for other users' chats.
  - `DELETE /api/v1/assistant/conversations/{id}`: Soft-delete for conversation owner.
  - `POST /api/v1/assistant/feedback`: Submits feedback with rating (1-5), comments, and reason enums (`incorrect`, `missing_source`, `outdated`, `irrelevant`, `conflicting`, `insufficient`, `helpful`).
  - `GET /api/v1/assistant/sources/{id}`: Inspects published source details and text chunks.
- **Security & Reliability:**
  - Strict user ownership verification preventing cross-user conversation enumeration.
  - In-memory per-user rate limiting (20 requests per minute).
  - CSRF validation on all state-mutating assistant routes.
  - Audit logging for all chat turns, deletions, and feedback submissions.

#### TASK M02-B: Frontend API Client, Types, and Streaming Hook
- **TypeScript Types (`features/assistant/types.ts`):** Complete models for `Conversation`, `Message`, `SourceRef`, `Feedback`, `FeedbackReason`, and `ChatState`.
- **API Client (`features/assistant/api.ts`):** Client routines with cookie-based credentials and CSRF header propagation.
- **Custom Hook (`features/assistant/useAssistantChat.ts`):**
  - Consumes SSE stream via `fetch` and `ReadableStream`.
  - Emits streaming tokens, auto-appends sources, and handles cancellation via `AbortController`.
  - Automatic fallback to non-streaming `/chat` if streaming encounters network/SSE disconnects.
  - Pure React state with zero `localStorage` retention.

#### TASK M02-C: Interactive Chat UI at `/app/assistant`
- **Two-Column Layout (`AssistantPage.tsx`):**
  - Left Sidebar (`ConversationList.tsx`): Conversation history list, "New Chat" button, and confirmation modal for conversation deletion.
  - Main Chat Panel (`MessageList.tsx`, `MessageBubble.tsx`): Conversational message history, streaming cursor indicator, auto-scroll, and metadata badges.
- **Source Inspection Drawer (`SourceCitations.tsx`, `SourceDetailDrawer.tsx`):** Clickable citation chips under answers opening a slide-over drawer detailing approved source metadata and chunk text.
- **Shopfloor Context Filter (`MachineContextFilter.tsx`):** Dropdown allowing operators to contextualize questions to specific shopfloor machinery.
- **Empty State & Safety Notices (`SuggestedQuestions.tsx`, `InsufficientEvidenceNotice.tsx`):** Starter technical questions and amber warnings when no verified SOP exists.
- **Message Feedback Modal (`FeedbackButtons.tsx`):** One-click helpful upvote and structured modal for reporting inaccuracies with 6 category enums.
- **Security Formatter (`SafeMarkdown.tsx`):** Escapes and securely renders markdown content without raw HTML injection.

#### TASK M02-D: End-to-End Verification & Documentation
- **Integration Test (`backend/app/tests/test_assistant_e2e.py`):**
  - `test_trainee_e2e_published_then_withdrawn_sop`: Confirms a trainee asking a question on a published SOP receives citations, and withdrawing the SOP immediately revokes citation visibility and returns `insufficient_evidence=True`.
  - `test_trainee_cannot_open_other_users_conversation`: Confirms changing the URL ID to another user's conversation returns HTTP 404 (preventing enumeration attacks).
- **Test Pass Counts:**
  - Backend: 512 tests passed in `app/tests`, 49 tests passed in `app/modules/assistant/tests` (Total: 561 tests passing).
  - Frontend: 81 unit/UI tests passed across 9 test files; production build clean (0 errors).
- **Documentation:** Updated `docs/modules/02-ai-assistant.md`, `docs/MODULE_REGISTRY.md`, `docs/roadmap.md`, and `docs/CHANGELOG.md`.

---

## [0.2.0] - 2026-10-26

### Added - Module 01: Expert Knowledge Capture
- Authoring tools for Standard Operating Procedures (SOPs).
- Step sequencing, media attachment handling, and version drafting.
- Approval workflow transitions (Draft -> In Review -> Published / Rejected).

---

## [0.1.0] - 2026-10-26

### Added - Module 00: Foundation & Core Infrastructure
- FastAPI application scaffolding and PostgreSQL / SQLite dual support.
- User authentication with secure HttpOnly cookies, sessions, and CSRF token protection.
- Role-Based Access Control (RBAC) with seeded roles (`ADMIN`, `EXPERT`, `OPERATOR`, `TRAINEE`).
- Audit logging service tracking security-critical events.
- React + TypeScript frontend shell with routing, authentication providers, and navigation.
