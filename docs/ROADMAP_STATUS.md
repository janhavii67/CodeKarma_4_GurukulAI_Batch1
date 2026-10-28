# Roadmap implementation audit — 2026-10-28

This audit compares the module specifications with current backend routes, frontend routes, models, and test coverage. “Partial” means real code exists but the complete documented workflow is not yet available; it must not be presented as complete.

| Module | Current status | Evidence and remaining work | Dependency order |
|---|---|---|---|
| 00 Foundation | Tested | Auth, roles, app shell, machine routes, and automated auth coverage are present. | Complete |
| 01 Expert Knowledge Capture | Implemented and tested | Knowledge editor/reviewable drafts and machine knowledge assets exist; current backend and frontend suites exercise capture, media, and associations. Virus scanning and resumable uploads remain out of scope in the spec. | Complete |
| 06 Validation and Versioning | Implemented and tested | Knowledge submission/review, history, version detail, permission-filtered snapshot comparison, field-level change labels, and regression coverage are present. Remaining gap: the compare UI identifies changed fields rather than rendering granular added/removed/changed step diffs. | Complete before dependent modules |
| 04 Voice-to-Knowledge | Partial | Recording, saved machine audio, transcript jobs, transcript review/editing, and AI structuring pipeline are present. Real speech transcription requires backend `OPENAI_API_KEY`; provider output and structured steps still require expert review. AI provider failure/timeout and the full voice-to-draft UI need continued end-to-end coverage. | After 01/06 |
| 03 Guided Workflows | Partial | Procedure authoring, existing-asset references, run start/status, and step completion exist. Procedure runs are not yet clearly bound to reviewed immutable workflow versions with mandatory checkpoint enforcement as specified. | After 06 |
| 02 AI Knowledge Assistant | Partial | Vector search exists in the voice API; `/app/assistant` remains a placeholder, so there is no complete user-facing cited-answer workflow. | After 06 |
| 05 Troubleshooting | Partial | Troubleshooting case/node/edge read APIs and models exist; `/app/troubleshooting` remains a placeholder and a guided, server-enforced diagnostic flow is incomplete. | After 06 |
| 07 Machine Sound Analysis | Partial | Audio references, analysis job API, and a frontend analysis page exist. Real signal-analysis provider/pipeline and review evidence need completion. | After 06 |
| 08 Knowledge Graph | Not implemented | No dedicated graph feature route/page or end-to-end relationship browsing workflow was found; `/app/knowledge-graph` is a placeholder. | After 06 |
| 09 Failure Simulator | Partial | Simulation models and learning API references exist, but `/app/failure-simulator` is a placeholder and a validated simulation experience is incomplete. | After 03/05 |
| 10 Practical Skill Verification | Partial | Learning assignments and procedure execution data exist; `/app/skill-verification` remains a placeholder and the documented assessment/evidence workflow is incomplete. | After 03 |
| 11 Synchronized Training Simulation | Not implemented | `/app/synchronized-simulation` is a placeholder; no synchronized multi-user workflow was found. | After 03/04 |

## Recommended implementation order

1. Complete Module 04 expert-reviewed transcript-to-draft flow and provider failure handling.
2. Complete Module 03 version-bound runs and checkpoint enforcement.
3. Implement Module 02’s assistant UI and citation/no-source behavior, then Module 05’s guided troubleshooting flow.
4. Complete Module 07 analysis; then implement Modules 08–11 in dependency order.

The existing [Module Registry](MODULE_REGISTRY.md) is updated to distinguish tested, partial, and not implemented work. The older `docs/TASKS.md` is the historical hackathon task plan and does not fully represent the current module architecture.

The 2026-10-28 follow-up added version-number lookup and saved-snapshot comparison for Module 06. No schema migration is required. The next prioritized implementation phase is Module 04's expert-reviewed transcript-to-draft flow; provider-backed transcription still requires `OPENAI_API_KEY` (and any selected LLM provider configuration).
