# Module 08 — Manufacturing Knowledge Graph

**Status:** Planned (placeholder in hackathon) · **Phase:** 5

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Existing records: machines, knowledge, guides, sounds"] --> B["Graph nodes (reference original records)"]
  C["Expert proposes relationship<br/>(controlled type + source)"] --> D["Review (M6) -> approved"]
  D --> E["User searches a node"]
  E --> F["Bounded neighbours returned<br/>(permission + status filtered)"]
  F --> G["Explorer: expand, open original record"]
  F --> H["Assistant uses relations to retrieve (M2)"]
```
## 2. Required tech stack and technologies
PostgreSQL tables + recursive queries (depth-limited), NetworkX for analysis later, Cytoscape.js for the explorer, FastAPI, React + TypeScript.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/knowledge-graph<br/>Explorer, Relationship editor"] --> API["graph endpoints"]
  API --> SV["graph_service (access filter)"]
  SV --> DB[("graph_nodes, graph_relationships,<br/>relationship_types, reviews")]
  SV --> SRC["original records"]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant U as User
  participant API as FastAPI
  U->>API: GET /knowledge-graph/nodes/{id}/neighbors
  API->>API: depth<=2, filter by approval status and user access
  API-->>U: nodes + labelled edges + provenance
```
## 5. Steps
1. Node and relationship model with controlled types. 2. Read-only explorer. 3. Search and filters. 4. Expert relationship editor with review. 5. Link to assistant retrieval.
## 6. Other information
A relationship is not proof of a fault cause (`POSSIBLE_CAUSE_OF` is shown as "possible"). Withdrawn or superseded targets are flagged. **Dependencies:** 00, 01, 06.
