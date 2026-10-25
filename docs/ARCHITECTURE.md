# Gurukul AI — System Architecture Specification

## 1. High-Level Architectural Pattern
Gurukul AI is designed as a **Modular Monolith** using **FastAPI** for backend API services and **React 18 + Vite** for the Single Page Application (SPA) frontend, with relational persistence in **PostgreSQL / SQLite**.

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|  React 18 SPA (TypeScript + Vite + Tailwind CSS + TanStack Query)       |
|  - Role-Based Dynamic Dashboards (Admin, Expert, Operator, Trainee)     |
|  - Real Knowledge Capture Forms & Peer Review Approval Queue            |
|  - Interactive Guided Procedure Runner & Verification Checklists        |
|  - Acoustic Signal Diagnostic Runner & Rejection Outcome Inspector     |
+-------------------------------------------------------------------------+
                                    |
                           HTTPS / HTTP-Only Cookies
                           Double-Submit CSRF Headers
                                    v
+-------------------------------------------------------------------------+
|                               API GATEWAY                               |
|  FastAPI Modular Router (/api/v1)                                       |
|  - Request ID & High-Precision Timing Middleware                        |
|  - Centralized Error Handling conforming to RFC 7807                    |
|  - CORS Security Policy & Pre-Flight Validation                         |
+-------------------------------------------------------------------------+
                                    |
                    RBAC Dependency (require_permission)
                                    v
+-------------------------------------------------------------------------+
|                           DOMAIN SERVICE TIER                           |
|  - AuthService: Argon2id Hashing, Session Lifecycle, Throttling         |
|  - KnowledgeService: Versioning, Revisions, Peer Governance Invariants  |
|  - AudioAnalysisService: Spectral Extraction, Calibrated Thresholds     |
|  - ProcedureService: Checklist Run Execution & Sign-off Tracking        |
|  - TroubleshootingEngine: Deterministic Decision Tree Traversal         |
+-------------------------------------------------------------------------+
                                    |
                          SQLAlchemy 2.0 ORM
                                    v
+-------------------------------------------------------------------------+
|                           PERSISTENCE LAYER                             |
|  Relational Database: SQLite (Dev) / PostgreSQL (Production & Docker)   |
|  - Normalized DDL Migrations via Alembic (001_foundation, 002_expanded) |
|  - Foreign Key Constraints, Unique Indices, Cascade Triggers            |
+-------------------------------------------------------------------------+
```

---

## 2. Architectural Invariants & Non-Negotiables

1. **AI Generates Drafts Only:** AI never automatically promotes or publishes content to authoritative status.
2. **Zero Hallucination of Tolerances:** Machine operating parameters, safety stops, and tool tolerances are strictly verified by human experts.
3. **Strict Peer Review Governance (Two-Person Rule):**
   Authors are strictly forbidden from approving their own submissions (`403 self_review_forbidden`). Enforced at both database model and API transaction boundaries.
4. **Immutable Published Versions:** Published SOP versions are frozen historical snapshots. Any modifications create a new revision.
5. **Air-Gapped from Machine Actuation:** The platform interfaces exclusively with humans for training and guidance; it has zero hardware actuation control lines.
6. **Calibrated Audio Rejection:** Low-energy audio (silence), high-frequency distortion (clipping/noise), and unknown sounds are safely rejected rather than forcing an inaccurate match.
