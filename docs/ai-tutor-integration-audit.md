# AI Tutor Integration Audit and Gap Closure

**Audit date:** 2026-10-28  
**Scope:** Central Tutor, approved-knowledge retrieval, history, audio result restoration, and links to existing learning modules.

## Summary

The Tutor already had the core RAG, answer validation, source citations, role checks, and audio matching paths. The audit found integration defects around streamed AI orchestration, short follow-up retrieval, current-revision eligibility, stale history, retrieval outages, and saved unmatched audio results. Those paths now use the existing orchestration, retrieval, publication, permission, and chat contracts.

At the start of this audit, Guided Workflows, Troubleshooting, and Failure Simulator were separate protected modules and the Tutor had no contextual handoff. Chunk 10 later added user-initiated handoffs into the first two, while Failure Simulator remains separate. Knowledge Graph remains a planned placeholder. A synthetic Gemini generation initially took 180 seconds and exposed that the SDK was not honoring the app's 30-second timeout. The provider now passes a bounded HTTP timeout, disables nested SDK retries, and caps model/key fallback within the request deadline. After the fix, a live synthetic connectivity request returned in 6.11 seconds. The full live RAG and streaming paths were not exercised.

## Gap matrix

| Capability | Existing path and evidence | Gap and impact | Severity | Fix and regression coverage |
|---|---|---|---|---|
| Ordinary manufacturing questions | `/api/v1/assistant/chat` uses `RetrievalService`, `PromptBuilder`, `AIOrchestrator`, and `AnswerValidator`; source citations are persisted with assistant messages. | The streamed route selected the provider directly, so it could behave differently from non-streaming chat. | High | Stream generation now enters through `AIOrchestrator.stream`; synchronous recovery uses `AIOrchestrator.execute`. Orchestrator stream dispatch has a unit test; streamed provider failure has an API test. |
| Follow-up questions | Conversation history is sent to the prompt builder. | Retrieval searched only the newest text, so anaphoric follow-ups such as “what is it called?” could miss relevant approved sources. | High | Retrieval adds the last two operator questions to the current retrieval query. It never expands retrieval using prior AI text. Tested with a synthetic follow-up. |
| Published evidence and citations | `KnowledgeEligibilityService` filters inactive chunks and non-published sources; user permissions are checked. | A version marked published could remain retrievable when it was no longer the knowledge item’s current published revision. | High | Eligibility now requires the item’s current published version pointer to match. Tests cover pointer mismatch, withdrawal, citation masking, and ordinary retrieval. |
| Restored history | `/api/v1/assistant/conversations/{id}` returns owner-scoped messages and source references. | Previously generated answers and citations could remain visible or enter prompt context after source withdrawal, supersession, or access loss. | High | History rechecks every cited chunk/source; stale answers are replaced with a safe notice and citations are removed. Stale answers are excluded from future prompt history. Tested after withdrawal. |
| No evidence and provider failures | Empty retrieval has a fixed insufficient-evidence response; provider failures are represented separately. | Retrieval exceptions were not normalized, and streaming committed a user-only turn before retrieval finished. | High | Both chat endpoints return a safe `503 retrieval_unavailable`; the transaction is rolled back before it can leave an orphan conversation. Provider details are not returned. Both paths are tested. |
| Machine-audio match | `/api/v1/audio/analyze` compares audio locally against current approved references. Matched results are explained through RAG constrained to the linked knowledge item. | Matched results restored from a minimal job link, but unmatched/ambiguous cards stayed local to the page. | Medium | The existing `audio_analysis_job_id` link now also persists approved unmatched/ambiguous outcomes. They restore through the owner/permission-checked audio response and never call the LLM or produce a diagnosis. No audio bytes are added to chat history. Backend and UI regression tests cover this. |
| Expert-captured knowledge | Draft capture is indexed as unavailable; approval/publication activates retrieval through the shared knowledge index. | No duplicate service or separate index was needed. | Implemented | Existing capture-to-RAG tests cover draft exclusion and published retrieval. Current-version eligibility is covered by the audit regression tests. |
| Guided workflows, troubleshooting, simulator | Separate protected routes and backend services exist; workflow/troubleshooting use published knowledge and the simulator uses published scenario revisions. | The central Tutor needed a context-aware, user-initiated handoff into existing workflow/troubleshooting sessions. | Implemented (Chunk 10) | Current cited source revisions plus deterministic intent checks produce suggestions. Starting a card rechecks conversation ownership, citation eligibility, target publication, and module permission, then reuses the existing session services. Simulator remains separate. |
| Manufacturing Knowledge Graph | `/app/knowledge-graph` renders the module placeholder; roadmap marks it planned. | There is no graph service for Tutor retrieval or multi-hop reasoning. | Missing / planned | Kept out of the Tutor answer path; no simulated graph capability is claimed. |
| Live model readiness | `/api/v1/health` checks application/database health; Tutor displays a safe unavailable message on provider failure. | There is no live-provider readiness check/status indicator. A live generation previously exceeded the configured timeout. | Partial / not monitored | A pre-fix synthetic generation eventually cited both fabricated chunks after 180 seconds. The provider now applies the configured HTTP timeout and a single SDK attempt; automated tests check this behavior. A post-fix live synthetic request returned in 6.11 seconds. Live RAG through the database, streaming, and availability monitoring remain unverified. |

## Updated Tutor contract

- Both streaming and non-streaming answers use the shared AI orchestrator.
- Retrieval stays inside current published knowledge and user permissions. Follow-up retrieval may use recent operator wording, while previously generated answers do not influence the retrieval query.
- The answer validator continues to remove unsupported citations and reject unsupported numerical parameters. Empty retrieval does not call the model.
- A source that is withdrawn, superseded, no longer current, or no longer viewable cannot support a displayed or future-context answer. Old history keeps the turn but masks the stale answer and hides its citations.
- Audio is compared locally against approved references. A matched audio explanation is grounded only in its linked current knowledge item. A non-match/ambiguous result is saved as a static comparison result, without LLM generation or fault diagnosis.
- Retrieval/provider errors produce a safe failure response and do not expose internal error details.

## Capability connections

| Capability | Central Tutor connection |
|---|---|
| Published manufacturing knowledge | Direct RAG retrieval with source citations. |
| Expert-captured knowledge | Available through the shared index only after review/publication. |
| Machine sound matching | Direct upload and local matching; matched results can request RAG explanation. Similarity is not a diagnosis. |
| Guided Workflows | Separate protected route; Chunk 10 adds a user-initiated, current-citation-based handoff that opens/resumes the existing run. |
| Troubleshooting | Separate protected route; Chunk 10 adds a user-initiated, current-citation-based handoff that opens/resumes an evidence-first session. |
| Failure Simulator | Separate route; no automatic Tutor handoff and no competency claim. |
| Knowledge Graph | Planned placeholder; unavailable to Tutor retrieval. |

## Verification results

- Backend full suite: **606 passed**, with 17 deprecation/transaction warnings.
- Frontend full suite: **86 passed**.
- Frontend TypeScript check and production build: **passed**. Vite reported its existing >500 kB bundle chunk advisory.
- Fresh SQLite migration: **passed through revision 014**.
- Python compile check: **passed**.
- `git diff --check`: **passed**; Git printed line-ending conversion notices for existing working-tree files.
- Lint: no lint script or configured lint executable is present in the repository environment.
- Live Gemini: configured provider/key were detected without printing the key. A pre-fix synthetic request through the configured provider succeeded in 180,020 ms; the answer validator accepted citations to both fabricated chunks with no unsupported numbers. That slow call exposed an SDK timeout gap. After adding the bounded HTTP timeout, disabled nested SDK retries, and one overall provider deadline, a synthetic live request returned `synthetic check` in 6.11 seconds. No private/company knowledge or uploaded audio was sent. Live RAG through the database, streaming, multi-turn provider behavior, and availability monitoring remain unverified.
- **Post-Chunk 10 regression:** backend full suite **609 passed**, 17 warnings; frontend full suite **87 passed**; frontend TypeScript/production build, Python compile, and diff check passed. Handoff-focused tests cover citation matching, SSE, permission changes, resume behavior, cross-user/tampered IDs, and withdrawn sources. No migration was necessary.

## Manual acceptance checklist

Use a non-production test environment with a currently published, explicitly approved test revision and a test trainee account. Keep all provider prompts synthetic unless the organization has approved the data for external processing. A post-fix synthetic provider request returned successfully in 6.11 seconds; run the complete API-to-published-index acceptance checklist below before live rollout.

1. Ask a question whose answer is present in one approved source. Confirm the answer is concise and the citation identifies the source, without printing chunk IDs or full retrieved chunks.
2. Ask a question requiring two approved sources. Confirm both relevant sources are cited and unsupported details are omitted.
3. Ask an unrelated question. Confirm the Tutor reports insufficient evidence and does not fabricate an answer.
4. Ask a follow-up using “it/that/what else” in the same conversation. Confirm retrieval uses the prior operator question and only current published sources.
5. Withdraw or supersede the supporting revision, then reopen history. Confirm the old answer and citations are masked and a follow-up no longer uses them.
6. Temporarily make the configured provider unavailable. Confirm the Tutor reports unavailability without exposing provider details, and the conversation does not contain a user-only orphan turn when retrieval fails.
7. Upload a known test WAV/FLAC with a matching published expert reference. Confirm the UI describes a possible acoustic match, shows approved source names, and does not claim a confirmed fault.
8. Upload a synthetic unmatched or ambiguous recording. Confirm the comparison card survives reload, says no reliable result, and does not invoke the model or suggest a procedure.
9. Sign in as a different user and attempt to restore the audio result and conversation. Confirm both remain owner/permission scoped.
10. Confirm Tutor handoff cards are explicit actions, restore only for current eligible sources, open/resume the correct module session, and never mark a workflow step complete on open. Failure Simulator remains separate.

## Chunk 10 handoff contract

- `/api/v1/assistant/chat` and the SSE `sources` event return a `handoffs` array. Recommendations come only from answer citations that still resolve to currently published, user-viewable revisions. Deterministic intent cues plus procedure-to-source revision links or `TROUBLESHOOTING` source category decide availability; the model never supplies target IDs or permissions.
- `GET /api/v1/assistant/conversations/{id}` recomputes actions from the previous operator question and current citations. Withdrawn, superseded, stale, or inaccessible sources suppress the answer's handoffs.
- `POST /api/v1/assistant/handoffs/{workflow|troubleshooting}/{target_id}/start` requires the owned conversation and assistant message IDs. The backend recomputes eligibility and permissions at acceptance, so changed publication or access blocks the start.
- Workflow handoffs use the existing procedure session service and reuse an active run for the same operator/procedure. Troubleshooting handoffs use the existing evidence-first service restricted to the cited source item; an active same-source, same-symptom session resumes. Tutor origin IDs and source revision are stored in the existing troubleshooting context JSON.
- No migration was added. `ProcedureRun` has no appropriate Tutor-origin field, so workflow sessions retain their procedure/source revision provenance only. Starting or navigating a workflow does not record physical completion.

## Next recommended milestone

Implement the separately planned Module 08 Knowledge Graph with publication- and permission-aware links to existing machine, failure, and SOP records. Keep Failure Simulator practice clearly separate from real machine operation and skill certification.
