# Module 09 — Interactive Failure Simulator

**Status:** Implemented · **Phase:** 4 · **Route:** `/app/failure-simulator`

## Purpose and safety boundary

The module provides a deterministic, revision-pinned learning simulation. It does not control or predict real equipment, create real troubleshooting cases, complete real workflow runs, or certify practical competency. No live LLM call is required to run a scenario.

## Scenario schema and branching

`SimulationScenarioRevision.content_json` stores an immutable reviewed snapshot: title, description, operation and machine context, difficulty, initial situation, objectives, prerequisites, safety notes, start decision ID, decision points, source knowledge version IDs, and optional published workflow/troubleshooting links. Each decision has an ID, situation, evidence observations, and choices. Each choice has a stable ID, documented consequence and explanation, optional simulated observation, source references, preferred-decision and safety-critical flags, and exactly one next decision or terminal outcome.

The API validates unique decision and choice IDs, a valid start node, existing transition targets, terminal/next-step consistency, citations to currently published knowledge versions, and complete reachability. Cycles are rejected. A choice response is accepted only for the session's current node and an available choice.

## Review and publication

Experts with `knowledge.create` author drafts and `knowledge.submit_review` submits the linked knowledge version into the existing review lifecycle. A different user with `knowledge.approve` approves or rejects through the existing `ApprovalRecord` workflow; self-review is rejected by that shared review endpoint. The simulator revision mirrors the knowledge version state and retains the reviewer identity/timestamp for snapshot queries. Drafts and in-review content are excluded from learner discovery. New published revisions supersede prior revisions for discovery; active attempts remain bound to their original revision ID and snapshot. Sessions stop accepting decisions if one of their supporting source knowledge revisions is no longer published.

## Sessions and feedback

The backend stores attempts in the existing `simulation_attempts` table with learner, scenario, pinned revision, current decision, ordered decision/feedback history, status, and timestamps. Only the learner or an authorized knowledge reviewer can read a session. Learners can resume active sessions; restarting creates a new attempt on the latest published revision, leaving the prior attempt unchanged. Reports are persisted in `simulation_scenario_reports` for reviewer triage.

There is no numeric score. Completion summarizes preferred choices and safety-critical errors visited on the selected path. The outcome is formative and does not establish operator qualification. Feedback shown after a choice contains that choice's authored consequence, explanation, observation, and supporting citations; the unreached tree and answer key are not sent to the learner.

## APIs

- `GET /api/v1/simulator/scenarios?q=`: published scenario search.
- `GET /api/v1/simulator/scenarios/{id}`: learner-visible description, objectives, safety notes, and citations.
- `POST /api/v1/simulator/scenarios/{id}/sessions`: start a revision-bound session.
- `GET /api/v1/simulator/sessions/my`, `GET /api/v1/simulator/sessions/{id}`: history and resume.
- `POST /api/v1/simulator/sessions/{id}/decisions`: deterministic choice transition.
- `POST /api/v1/simulator/sessions/{id}/restart`: create a fresh attempt on the same revision.
- `POST /api/v1/simulator/sessions/{id}/reports`: report confusing or incorrect content; reviewer queue is `GET /api/v1/simulator/reports`, disposition is `POST /api/v1/simulator/reports/{id}/disposition`.
- Expert authoring: `POST /drafts`, `PUT /drafts/{revision_id}`, `GET /drafts`, `GET /drafts/{revision_id}`, `POST /drafts/{revision_id}/submit`, `POST /drafts/{revision_id}/publish`, `POST /drafts/{revision_id}/review`.
- New revisions: `GET /scenarios/{id}/authoring`, `POST /scenarios/{id}/revisions`.

Learner operations use `simulation.attempt`; draft creation uses `knowledge.create`; approval and report triage use `knowledge.approve`. Mutations use the shared CSRF guard and audit service.

## Database and verification

Migration `010_failure_simulator` adds immutable scenario revisions, revision/session fields, JSON decision history, and the scenario content report queue. Migration `011_simulation_scenario_title_index` indexes legacy scenario titles. Migration `012_simulation_knowledge_review` links scenario revisions to their shared `KnowledgeVersion` approval records. Existing legacy scenarios have no approved revision and are not discoverable until experts create reviewed content.

Tests cover graph cycles and missing references, draft invisibility, independent review and publication, deterministic navigation, invalid choices, session revision binding, completion feedback, owner isolation, and author permission enforcement. No live AI dependency is involved in simulation sessions.

## Limitations

Authoring currently uses a structured JSON editor rather than a graphical branch canvas. Review queue feedback has a reviewer disposition but does not automatically modify or republish scenario content. Related workflows and troubleshooting topics are linked by IDs; scenario execution remains separate from those modules' sessions.
