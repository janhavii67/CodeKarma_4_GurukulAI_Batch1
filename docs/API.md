# Gurukul AI — API Endpoints & Contract Specification

Base Prefix: `/api/v1`  
Protocol: HTTPS (Production) / HTTP (Local Dev)  
Authentication: Server-Side HttpOnly Session Cookie (`gk_session`)  
CSRF Protection: Double-Submit Header (`X-CSRF-Token` matching `gk_csrf` cookie) on write requests (POST, PUT, PATCH, DELETE)

---

## 1. Authentication (`/api/v1/auth`)
- `POST /auth/register` — Trainee self-registration with safety disclaimer.
- `POST /auth/login` — Authenticate email/password; generates Argon2id verified session.
- `POST /auth/logout` — Revokes session and clears cookies.
- `GET /auth/me` — Fetches current user profile and permission list.
- `GET /auth/csrf` — Fetches or refreshes Double-Submit CSRF token.

## 2. Health & Readiness (`/api/v1/health`)
- `GET /health` — Liveness & Readiness check verifying database ping and engine status.

## 3. Operational Dashboard (`/api/v1/dashboard`)
- `GET /dashboard/stats` — Real database-backed metrics (total machines, approved articles, procedures, pending reviews, audio references, and latest activity stream).

## 4. Machines & Assets (`/api/v1/machines`)
- `GET /machines` — List all machines with joined categories and tools.
- `GET /machines/categories` — List machine categories.
- `GET /machines/{id}` — Detailed machine view.
- `POST /machines` — Register a new machine (`machine.manage`).

## 5. Knowledge Library (`/api/v1/knowledge`)
- `GET /knowledge` — Search and filter approved standard operating procedures.
- `GET /knowledge/{id}` — Complete SOP detail with latest revision and reviews.
- `POST /knowledge` — Author a new knowledge article draft (`knowledge.create`).
- `PUT /knowledge/{id}` — Edit author's own draft (`knowledge.edit_own_draft`).
- `POST /knowledge/{id}/submit` — Submit draft for peer review (`knowledge.submit_review`).

## 6. Peer Review Governance (`/api/v1/reviews`)
- `GET /reviews/queue` — List pending drafts awaiting peer review (`knowledge.approve`).
- `POST /reviews/{article_id}/decision` — Approve or reject a draft (`knowledge.approve`).
  - *Invariant Enforcement*: Strictly raises `403 self_review_forbidden` if `author_id == reviewer_id`.

## 7. Guided Workflows (`/api/v1/procedures`)
- `GET /procedures` — List approved step-by-step procedures.
- `GET /procedures/{id}` — Detailed procedure with ordered checklist steps.
- `POST /procedures/{id}/start` — Start a guided execution run (`procedure.execute`).
- `GET /procedures/runs/{run_id}` — Get status and completed checkpoints of an active run.
- `POST /procedures/runs/{run_id}/step/{step_id}` — Check off a step with operator verification notes.

## 8. Fault Troubleshooting (`/api/v1/troubleshooting`)
- `GET /troubleshooting` — List published troubleshooting symptoms.
- `GET /troubleshooting/{id}` — Detailed decision tree with symptom nodes, checks, and branching conditions.

## 9. Machine Acoustic Sound Analysis (`/api/v1/audio`)
- `GET /audio/references` — List baseline reference audio recordings with verified acoustic fault labels.
- `POST /audio/analyze` — Evaluates acoustic signal against reference baselines.
  - Returns: `status` (`MATCHED`, `NO_RELIABLE_MATCH`, `AMBIGUOUS_MATCH`, `UNSUITABLE_AUDIO`, `INVALID_FILE`), `similarity_score`, `reason_code`, and top 5 ranked candidates.
