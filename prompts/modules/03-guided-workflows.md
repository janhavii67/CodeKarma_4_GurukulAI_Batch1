# Module 03 — Step-by-Step Guided Workflows

**Status:** Planned (placeholder page only in hackathon) · **Phase:** 3

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Published knowledge version (M6)"] --> B["Expert converts to workflow<br/>adds checkpoints, safety stops"]
  B --> C["Workflow version reviewed + published"]
  C --> D["Trainee starts run (bound to exact version)"]
  D --> E["Step: instruction, media, warning, expected result"]
  E --> F{"Checkpoint passed?"}
  F -- yes --> G["Next step"]
  F -- no --> H["Blocked: stop + escalate"]
  G --> I{"Last step?"}
  I -- no --> E
  I -- yes --> J["Completion summary (not a competency claim)"]
```
## 2. Required tech stack and technologies
React + TypeScript (stepper UI), FastAPI, PostgreSQL, SQLAlchemy/Alembic, server-side timestamps. Reuses M6 versioning.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/guided-workflows<br/>Builder, Player, History"] --> API["workflow endpoints"]
  API --> SV["workflow_service + run_service"]
  SV --> DB[("workflow_definitions, workflow_versions,<br/>workflow_steps, workflow_runs,<br/>workflow_step_results")]
  SV --> M6["M6 approval"]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant T as Trainee
  participant API as FastAPI
  participant DB as PostgreSQL
  T->>API: POST /workflows/{id}/runs
  API->>DB: run bound to published version_id
  T->>API: POST /workflow-runs/{rid}/steps/{sid}/complete
  API->>API: enforce order + mandatory checkpoints
  API->>DB: step_result with server timestamp
  API-->>T: next step or blocked
```
## 5. Steps
1. Tables and migration. 2. Builder from a published knowledge version. 3. Review via M6. 4. Player with progress. 5. Run history and expert view.
## 6. Other information
Backend enforces order and mandatory checkpoints. A step click is not proof of competency. Runs keep their original version when a new one is published. **Dependencies:** 00, 01, 06. **Hackathon:** labelled placeholder page.
