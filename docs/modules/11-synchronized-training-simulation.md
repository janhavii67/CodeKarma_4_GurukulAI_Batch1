# Module 11 — Synchronized Narration and Simulation

**Status:** Planned (placeholder in hackathon) · **Phase:** 6

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Approved transcript segments (M4)"] --> B["Expert maps each segment to a<br/>workflow step / simulation action"]
  B --> C["Timeline reviewed + approved (M6)"]
  C --> D["Trainee plays narration"]
  D --> E["Player clock drives timeline"]
  E --> F["Highlight transcript segment"]
  E --> G["Run mapped simulation action"]
  D --> H["Pause / resume / replay segment / jump"]
```
## 2. Required tech stack and technologies
HTML5 audio/video element as the master clock, React timeline component, SVG or Canvas for a simple 2D step simulation (Three.js only if justified), FastAPI + PostgreSQL for the mapping table.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/synchronized-simulation<br/>Mapper, Player"] --> API["sync endpoints"]
  API --> DB[("timeline_maps: segment_id, start, end,<br/>workflow_step_id, action_type")]
  FE --> CLK["media element currentTime"]
  CLK --> SIMV["simulation view"]
  CLK --> TXT["transcript view"]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant P as Player
  participant API as FastAPI
  P->>API: GET /sync/{id} (approved timeline)
  loop every 100 ms
    P->>P: currentTime -> active segment
    P->>P: highlight text + trigger mapped action
  end
```
## 5. Steps
1. Mapping model. 2. Mapper UI. 3. Player with seek, pause, replay. 4. Simple simulation actions. 5. Review and versioning.
## 6. Other information
Pre-recorded audio only; no live sync. Low-confidence segments require expert correction first. Simulation actions come from an allow-list; speech or LLM output can never trigger real machine operations. **Dependencies:** 00, 03, 04, 06.
