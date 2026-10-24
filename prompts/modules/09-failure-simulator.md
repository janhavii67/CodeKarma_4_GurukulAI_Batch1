# Module 09 — Interactive Failure Simulator

**Status:** Planned (placeholder in hackathon) · **Phase:** 4

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Expert builds scenario (nodes, choices, scoring)"] --> B["Validate graph (no dead ends)"]
  B --> C["Review + publish version (M6)"]
  C --> D["Trainee starts attempt (Learning or Assessment mode)"]
  D --> E["Show situation + evidence"]
  E --> F["Trainee picks a choice"]
  F --> G["Deterministic engine: next state, score, feedback"]
  G --> H{"Terminal?"}
  H -- no --> E
  H -- yes --> I["Report: score, safety-critical errors, recommended material"]
```
## 2. Required tech stack and technologies
FastAPI rule engine and scoring (backend only), PostgreSQL, React Flow (builder), React player UI. LLM only for optional explanations from approved sources.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/failure-simulator<br/>Library, Player, Builder, Report"] --> API["scenario endpoints"]
  API --> ENG["scenario_engine + scoring"]
  ENG --> DB[("scenarios, versions, nodes, choices,<br/>transitions, attempts, responses, scores")]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant T as Trainee
  participant API as FastAPI
  T->>API: POST /scenario-attempts/{id}/responses {choice_id}
  API->>API: validate choice belongs to current node
  API->>API: transition + score (server side)
  API-->>T: next node, feedback, hint (if learning mode)
```
## 5. Steps
1. Models + validator. 2. Engine and scoring tests. 3. Player. 4. Builder. 5. Reports. 6. Optional AI explanation.
## 6. Other information
Safety-critical mistakes are reported separately from the numeric score. Simulated data is always labelled. Never connected to real machine controls. **Dependencies:** 00, 06 (03 and 05 helpful).
