# Module 05 — Troubleshooting and Decision Trees

**Status:** In Progress (Task A1 Placeholder + Task B1 Models + Task B2 Engine/Validator Implemented & Tested) · **Phase:** 4 · **Implementation:** B2 COMPLETED

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Trainee selects machine + symptom"] --> B["Find published guide"]
  B -- none --> X["No approved guide: escalate"]
  B -- found --> C["Start session (bound to guide version)"]
  C --> D["Show check node"]
  D --> E["Trainee records observation"]
  E --> F["Deterministic engine picks next node"]
  F --> G{"Node type"}
  G -- check --> D
  G -- stop --> H["Stop + escalate"]
  G -- action --> I["Approved corrective action"]
  G -- end --> J["Resolved / unresolved / escalated"]
```
## 2. Required tech stack and technologies
FastAPI deterministic rule engine (no LLM in branching), PostgreSQL (nodes, edges), React Flow for the expert tree editor, React stepper for trainees. LLM (optional) only explains the current approved node.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/troubleshooting<br/>Editor (React Flow), Session UI"] --> API["troubleshooting endpoints"]
  API --> ENG["tree_engine (pure functions)"]
  API --> VAL["tree_validator<br/>(dead ends, loops, unreachable)"]
  ENG --> DB[("troubleshooting_guides/versions/<br/>nodes/edges/sessions/responses")]
  API -. "explain only" .-> LLM["LLMProvider"]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant T as Trainee
  participant API as FastAPI
  participant E as tree_engine
  T->>API: POST /sessions/{id}/responses {answer}
  API->>E: next_node(current, answer) using stored edges
  E-->>API: node id (server decides)
  API-->>T: next check / stop / action
```
## 5. Steps
1. Models + validator. 2. Engine with unit tests. 3. Expert editor. 4. Trainee session UI. 5. Escalation records. 6. Optional explanation via M2 sources.
## 6. Other information
The server rejects any attempt to jump to an arbitrary node. Suspected causes are never shown as confirmed. **Dependencies:** 00, 01, 06 (03 optional). **Hackathon:** labelled placeholder.
