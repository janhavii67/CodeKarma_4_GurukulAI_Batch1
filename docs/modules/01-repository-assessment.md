# Gurukul AI Module 01 | Repository Assessment and Readiness

## 1. Summary

- **Readiness Verdict:** **READY WITH CAVEATS**
- Foundation (Module 00) architectural patterns, database models, session management, RBAC, CSRF validation, and audit logging are implemented cleanly and strictly adhere to the industrial governance specifications.
- The repository has a clean Alembic migration head (`001_foundation`) and a well-structured FastAPI backend layout ready to receive Module 01 models and APIs.
- Pre-existing environment caveats: Docker Desktop daemon is not running on the host system, and backend Python dependencies are not installed in the host's global Python 3.14 environment, preventing live test execution without environment setup.
- Pre-existing codebase defect: `frontend/src/lib/api/client.ts` is imported by `AuthContext.tsx` but was omitted from the repository commit, causing frontend type checks to fail until the client is restored.
- With Docker started or dependencies installed and the missing client file implemented, the repository provides a rock-solid foundation for Module 01 (T2.1–T2.4).

---

## 2. Prerequisite Status Table

| Prerequisite Item | Status | Repository Evidence & Verification |
|---|---|---|
| **Authentication & Sessions** | IMPLEMENTED AND WORKING | Opaque 32-byte token in HttpOnly `gk_session` cookie; SHA-256 hashed in `sessions` table. Verified in [backend/app/models/session.py:11-52](file:///e:/GURUKUL_AI/backend/app/models/session.py#L11-L52), [backend/app/services/auth_service.py:113-183](file:///e:/GURUKUL_AI/backend/app/services/auth_service.py#L113-L183), [backend/app/api/v1/endpoints/auth.py:70-95](file:///e:/GURUKUL_AI/backend/app/api/v1/endpoints/auth.py#L70-L95). |
| **CSRF Protection** | IMPLEMENTED AND WORKING | Double-Submit Cookie pattern (`gk_csrf` cookie + `X-CSRF-Token` header) checked on state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`). Verified in [backend/app/core/permissions.py:107-126](file:///e:/GURUKUL_AI/backend/app/core/permissions.py#L107-L126) and [backend/app/api/v1/endpoints/protected_demo.py:25-33](file:///e:/GURUKUL_AI/backend/app/api/v1/endpoints/protected_demo.py#L25-L33). |
| **Role & Permission System** | IMPLEMENTED AND WORKING | Roles: `EXPERT`, `TRAINEE`. Exact permission constants defined in [backend/app/core/permissions.py:19-28](file:///e:/GURUKUL_AI/backend/app/core/permissions.py#L19-L28): `knowledge.create`, `knowledge.edit_own_draft`, `knowledge.submit_review`, `knowledge.approve`, `machine.manage`, `knowledge.view_published`, `assistant.use`, `audit.view`. Enforced via `require_permission` dependency ([permissions.py:127-140](file:///e:/GURUKUL_AI/backend/app/core/permissions.py#L127-L140)). Seeded in [infrastructure/scripts/seed.py:47-88](file:///e:/GURUKUL_AI/infrastructure/scripts/seed.py#L47-L88). |
| **Audit Service** | IMPLEMENTED AND WORKING | Append-only `audit_logs` table with automated redaction of sensitive keys. Verified in [backend/app/models/audit.py:8-37](file:///e:/GURUKUL_AI/backend/app/models/audit.py#L8-L37), [backend/app/repositories/audit_repo.py:7-31](file:///e:/GURUKUL_AI/backend/app/repositories/audit_repo.py#L7-L31), [backend/app/services/audit_service.py:7-44](file:///e:/GURUKUL_AI/backend/app/services/audit_service.py#L7-L44). |
| **DB Session & Transactions** | IMPLEMENTED AND WORKING | SQLAlchemy 2.0 `SessionLocal` with `get_db` generator dependency in [backend/app/db/session.py:16-30](file:///e:/GURUKUL_AI/backend/app/db/session.py#L16-L30). Supports SQLite fallback with `check_same_thread: False`. |
| **Alembic Setup** | IMPLEMENTED AND WORKING | `alembic.ini` and `alembic/env.py` configured with `Base.metadata`. Verified in [backend/alembic.ini:1-43](file:///e:/GURUKUL_AI/backend/alembic.ini#L1-L43), [backend/alembic/env.py:1-67](file:///e:/GURUKUL_AI/backend/alembic/env.py#L1-L67). Linear history with head `001_foundation`. |
| **StorageService Abstraction** | MISSING | No `StorageService` interface or disk implementation exists in `backend/app/`. Configuration settings exist: `MEDIA_DIR: str = "./data/media"` and `MAX_UPLOAD_MB: int = 100` in [backend/app/core/config.py:54-56](file:///e:/GURUKUL_AI/backend/app/core/config.py#L54-L56), and `/data/media` volume in [docker-compose.yml:19](file:///e:/GURUKUL_AI/docker-compose.yml#L19). Must be built in T2.2. |
| **Frontend Auth State** | IMPLEMENTED AND WORKING | React Context `AuthProvider` and `useAuth` hook tracking `user`, `permissions`, `isAuthenticated`, `login`, `register`, `logout`, `refreshUser`. Verified in [frontend/src/context/AuthContext.tsx:1-144](file:///e:/GURUKUL_AI/frontend/src/context/AuthContext.tsx#L1-L144). |
| **Typed API Client** | MISSING (Code Defect) | `frontend/src/lib/api/client.ts` is imported by `AuthContext.tsx:3` (`import { api, ApiClientError } from '../lib/api/client'`) but file does not exist in the repository. In `frontend/src/tests/auth.test.tsx:10-19`, it is mocked. Needs to be implemented prior to T2.3. Types exist in [frontend/src/types/api.ts:1-18](file:///e:/GURUKUL_AI/frontend/src/types/api.ts#L1-L18). |
| **Frontend Router** | IMPLEMENTED AND WORKING | React Router v6 configured in [frontend/src/App.tsx:23-104](file:///e:/GURUKUL_AI/frontend/src/App.tsx#L23-L104) with `ProtectedRoute` gating, `AppLayout` sidebar/header, public auth routes, and placeholder routes for all modules including `/app/knowledge`. |
| **Shared UI Components** | IMPLEMENTED AND WORKING | Industrial steel & amber design system components in [frontend/src/components/ui/](file:///e:/GURUKUL_AI/frontend/src/components/ui/): `Alert.tsx`, `Badge.tsx`, `Button.tsx`, `Card.tsx`, `EmptyState.tsx`, `Input.tsx`, `LoadingSpinner.tsx`. |
| **Test Setup (Backend)** | IMPLEMENTED (UNVERIFIED RUNTIME) | Pytest suite in [backend/app/tests/conftest.py](file:///e:/GURUKUL_AI/backend/app/tests/conftest.py) with in-memory SQLite and seeded data fixtures. 12 test cases in `test_health.py` and `test_auth_and_permissions.py`. Runtime execution was blocked because `sqlalchemy` is not installed on host Python 3.14. |
| **Test Setup (Frontend)** | IMPLEMENTED (UNVERIFIED RUNTIME) | Vitest + Testing Library in [frontend/vite.config.ts](file:///e:/GURUKUL_AI/frontend/vite.config.ts) and [frontend/src/tests/setupTests.ts](file:///e:/GURUKUL_AI/frontend/src/tests/setupTests.ts). 7 test cases in `auth.test.tsx` and `placeholders.test.tsx`. Runtime execution was blocked because `node_modules` is not installed on the host. |

---

## 3. Repository Conventions

- **Naming Conventions:**
  - Database tables: Lowercase snake_case plural (`roles`, `permissions`, `users`, `sessions`, `audit_logs`).
  - Columns: Lowercase snake_case (`id`, `user_id`, `token_hash`, `is_active`, `created_at`).
  - API URLs: `/api/v1/{plural-noun}`, kebab-case for actions (`/api/v1/auth/login`, `/api/v1/protected/state-change`).
  - Python symbols: PascalCase for models and classes (`User`, `AuditLog`, `AuthService`, `SessionRepository`), snake_case for functions and variables.
  - TypeScript symbols: PascalCase for React components and interfaces (`Button`, `AuthResponse`), camelCase for hooks and utilities (`useAuth`, `hasPermission`).
- **Layering Architecture:**
  - `app/models/`: SQLAlchemy 2.0 declarative models inheriting from `Base` and `TimestampMixin` ([app/db/base.py:15-31](file:///e:/GURUKUL_AI/backend/app/db/base.py#L15-L31)).
  - `app/schemas/`: Pydantic v2 schemas (`BaseModel`, `ConfigDict(from_attributes=True)`).
  - `app/repositories/`: Data access layer with static methods receiving `db: Session`.
  - `app/services/`: Business logic, domain invariants, audit logging, and security rate limiting.
  - `app/api/v1/endpoints/`: Thin FastAPI controllers injecting dependencies (`get_db`, `get_current_user`, `require_permission`, `csrf_protect`).
- **Error Response Shape:**
  Strictly standard JSON structure defined in [gurukul-docs/docs/API_CONVENTIONS.md:36](file:///e:/GURUKUL_AI/gurukul-docs/docs/API_CONVENTIONS.md#L36) and handled globally in [backend/app/main.py:63-115](file:///e:/GURUKUL_AI/backend/app/main.py#L63-L115):
  ```json
  {
    "error": {
      "code": "forbidden",
      "message": "Access denied: missing permission 'knowledge.create'.",
      "details": null,
      "request_id": "req_1a2b3c4d5e6f"
    }
  }
  ```
- **Pagination Shape:**
  Query parameters: `?page=1&page_size=20`. Response payload: `{"items": [...], "total": int, "page": int, "page_size": int}`.
- **ID Types:**
  UUID v4 strings (`String(36)`) generated via `generate_uuid()` helper in [backend/app/db/base.py:11-12](file:///e:/GURUKUL_AI/backend/app/db/base.py#L11-L12). Roles use `String(32)` (`"EXPERT"`, `"TRAINEE"`). Permissions use `String(64)` (`"knowledge.create"`).
- **Timestamp Handling:**
  UTC timezone-aware timestamps stored as `DateTime(timezone=True)` using helper `utc_now()` (`datetime.now(timezone.utc)`) in [backend/app/db/base.py:7-8](file:///e:/GURUKUL_AI/backend/app/db/base.py#L7-L8).
- **Enum Representation:**
  String columns (`sa.String(32)` / `sa.String(64)`) with application/Pydantic validation, rather than native PostgreSQL ENUM types. This maintains cross-database compatibility (PostgreSQL in production/Docker and SQLite in Pytest).
- **Role-to-Permission Mapping:**
  Evaluated dynamically in [backend/app/repositories/user_repo.py:38-51](file:///e:/GURUKUL_AI/backend/app/repositories/user_repo.py#L38-L51) as the union of `role_permissions` (from `user.role_id`) and individual `user_permissions` (direct overrides on `user.id`).
- **Current-User Ownership Derivation:**
  Derived exclusively from HttpOnly `gk_session` cookie -> SHA-256 token hash lookup in `sessions` table -> `session.user_id` -> authenticated `User` object ([backend/app/core/permissions.py:41-104](file:///e:/GURUKUL_AI/backend/app/core/permissions.py#L41-L104)). Client request payloads are never trusted for user identity.

---

## 4. Reusable Assets and Conflicts

- **Reusable Backend Models & Tables:**
  - `User`, `Role`, `Permission`, `RolePermission`, `UserPermission` ([backend/app/models/user.py](file:///e:/GURUKUL_AI/backend/app/models/user.py)).
  - `SessionModel` ([backend/app/models/session.py](file:///e:/GURUKUL_AI/backend/app/models/session.py)).
  - `AuditLog` ([backend/app/models/audit.py](file:///e:/GURUKUL_AI/backend/app/models/audit.py)).
- **Reusable Backend Services & Helpers:**
  - `AuditService.log(db, action, entity_type, entity_id, actor_id, detail, ip_address)` ([backend/app/services/audit_service.py:7-44](file:///e:/GURUKUL_AI/backend/app/services/audit_service.py#L7-L44)).
  - `get_current_user`, `require_permission`, `require_role`, `csrf_protect` ([backend/app/core/permissions.py:41-156](file:///e:/GURUKUL_AI/backend/app/core/permissions.py#L41-L156)).
  - `utc_now()`, `generate_uuid()`, `Base`, `TimestampMixin` ([backend/app/db/base.py:7-31](file:///e:/GURUKUL_AI/backend/app/db/base.py#L7-L31)).
- **Reusable Frontend Assets:**
  - `AuthProvider` and `useAuth` hook ([frontend/src/context/AuthContext.tsx](file:///e:/GURUKUL_AI/frontend/src/context/AuthContext.tsx)).
  - Complete industrial UI component library: `Button`, `Input`, `Badge`, `Card`, `Alert`, `EmptyState`, `LoadingSpinner` ([frontend/src/components/ui/](file:///e:/GURUKUL_AI/frontend/src/components/ui/)).
  - `AppLayout` with navigation links already configured for `/app/knowledge`, `/app/machines`, `/app/reviews` ([frontend/src/layouts/AppLayout.tsx:78-104](file:///e:/GURUKUL_AI/frontend/src/layouts/AppLayout.tsx#L78-L104)).
  - `MODULE_CONFIGS.knowledge` in [frontend/src/features/placeholders/moduleConfigs.ts:30-55](file:///e:/GURUKUL_AI/frontend/src/features/placeholders/moduleConfigs.ts#L30-L55).
- **Pre-existing Code Conflict Assessment:**
  - There is **NO** pre-existing `Machine`, `KnowledgeItem`, `KnowledgeVersion`, or `MediaAsset` code in the backend. There are no duplicate or conflicting tables, models, or schemas in application code. Module 01 will cleanly introduce these.
  - Caveat on `AuditRepository.create_log`: The existing method executes `db.commit()` on lines 28–29 ([backend/app/repositories/audit_repo.py:28-29](file:///e:/GURUKUL_AI/backend/app/repositories/audit_repo.py#L28-L29)). When logging audit events inside complex multi-table transactions (e.g. creating an item and its draft version 1 atomically), committing inside the audit helper commits the transaction prematurely. A non-committing flush or transaction-aware logging helper must be used.

---

## 5. Migration Chain and Next Revision

- **Alembic History:**
  - `001_foundation` (in [backend/alembic/versions/001_foundation.py](file:///e:/GURUKUL_AI/backend/alembic/versions/001_foundation.py))
    - `revision: str = "001_foundation"`
    - `down_revision: Union[str, None] = None`
    - Creates tables: `roles`, `permissions`, `role_permissions`, `users`, `user_permissions`, `sessions`, `audit_logs`.
- **Current Head:** `001_foundation`.
- **Next Migration Identification:**
  - Target filename: `backend/alembic/versions/002_knowledge.py`.
  - Target `revision`: `"002_knowledge"`.
  - Target `down_revision`: `"001_foundation"`.
- **Branch / Drift Status:**
  - Single head. No multiple heads. No branch labels.
  - Models match `001_foundation` DDL exactly.

---

## 6. Baseline Test Results

All commands were run from the repository root or respective subdirectories. Results are recorded exactly as executed:

| Test / Check Suite | Exact Command Executed | Outcome | Fail / Pass Counts | Detail / Pre-existing Failure Root Cause |
|---|---|---|---|---|
| **Git Status** | `git status` | Exit code 0 | Clean | Working tree clean on branch `master`. Latest commit: `50e7eb6`. |
| **Git Commit Log** | `git log --oneline -n 20` | Exit code 0 | 3 commits | `50e7eb6 Adding all the foundation files`, `5a0a445 Adding info`, `c3dba45 Initial commit`. |
| **Backend Test Suite** | `python -m pytest app/tests -v` (in `backend/`) | Exit code 1 (FAILED) | 0 passed, 0 failed, 1 collection error | `ModuleNotFoundError: No module named 'sqlalchemy'` (in `app/tests/conftest.py:6`). Host global Python 3.14 does not have virtualenv packages installed. |
| **Backend Type / Lint** | Pyright / Flake8 | NOT CONFIGURED | N/A | `pyproject.toml` defines `[tool.pyright] venv = ".venv"` but `.venv` was not created on host. No lint scripts configured. |
| **Frontend Test Suite** | `npm test` (in `frontend/`) | Exit code 1 (FAILED) | 0 run | `'vitest' is not recognized as an internal or external command`. `frontend/node_modules` is not installed on the host. |
| **Frontend Build** | `npm run build` (in `frontend/`) | Exit code 1 (FAILED) | 0 run | `'tsc' is not recognized as an internal or external command`. `typescript` not installed on host. |
| **Docker Compose Config** | `docker compose config` | Exit code 0 (PASSED) | Valid compose spec | Syntactically valid compose configuration defining `db`, `backend`, `frontend`, networks, and volumes (`media_volume`, `postgres_data`). |
| **Docker Compose Runtime** | `docker ps; docker compose ps` | Exit code 1 (FAILED) | 0 containers | Docker daemon not running: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`. |

*Note: Per Prompt instructions, pre-existing failures were verified and recorded without modifying application code or installing unprompted dependencies.*

---

## 7. Spec-Versus-Repo Conflicts

1. **Documentation Directory Path:**
   - Spec references files at `docs/DATABASE_DESIGN.md`, `docs/API_CONVENTIONS.md`, `docs/TASKS.md`, `docs/modules/01-expert-knowledge-capture.md`.
   - In the repository, all documentation is located under `gurukul-docs/docs/*` (and replicated under `prompts/*`).
2. **Missing Frontend API Client:**
   - Spec, README ([README.md:52](file:///e:/GURUKUL_AI/README.md#L52)), and [frontend/src/context/AuthContext.tsx:3](file:///e:/GURUKUL_AI/frontend/src/context/AuthContext.tsx#L3) state that a typed API client exists at `frontend/src/lib/api/client.ts`.
   - In the repository, `frontend/src/lib/` does not exist. The file was omitted in the initial commit.
3. **Step JSON Schema Extra Fields:**
   - Spec Section 0 defines: `order, title, instruction, tools[], safety_warning?, expected_result?, stop_condition?, needs_review, source_segment_ids[], ai_generated`.
   - [gurukul-docs/docs/modules/04-voice-to-knowledge.md:98](file:///e:/GURUKUL_AI/gurukul-docs/docs/modules/04-voice-to-knowledge.md#L98) includes an additional optional `note` field in step objects.
4. **Audit Transaction Isolation:**
   - Spec Section 0 requires atomic audit logging within business transactions.
   - [backend/app/repositories/audit_repo.py:28](file:///e:/GURUKUL_AI/backend/app/repositories/audit_repo.py#L28) unconditionally executes `db.commit()`, which would break transaction atomicity if invoked within an open transaction block.

---

## 8. Ambiguities with Proposed Decisions

### 1. `POST /knowledge` accepts `description`, but domain model has no description column
- **Observation:** `POST /knowledge` payload mentions `description` ([gurukul-docs/docs/modules/01-expert-knowledge-capture.md:9](file:///e:/GURUKUL_AI/gurukul-docs/docs/modules/01-expert-knowledge-capture.md#L9)), while `KnowledgeItem` has only `title`, and `KnowledgeVersion` has `summary`.
- **Proposed Decision:** Store `description` in `KnowledgeVersion.summary`. In the Pydantic schema for `POST /knowledge`, accept `description: Optional[str] = None` and `summary: Optional[str] = None`, mapping either into `KnowledgeVersion.summary`. Do not create a separate redundant column on `KnowledgeItem`.
- **Needs Human Confirmation:** **YES**

### 2. Ownership field for "author of the version" check
- **Observation:** `KnowledgeItem` has `author_id`, and `KnowledgeVersion` has `created_by`.
- **Proposed Decision:** Use `KnowledgeVersion.created_by` as the authoritative ownership field for draft editing, deletion, and media attachment checks. `KnowledgeItem.author_id` represents the historical creator of the root item. When Expert B creates revision v2 of Expert A's published v1, `KnowledgeVersion.created_by = Expert B.id`, and only Expert B may edit v2.
- **Needs Human Confirmation:** **NO**

### 3. Definition of an "open draft" for the 409 duplicate-draft rule
- **Observation:** Spec states 409 is returned if an open draft already exists for the item.
- **Proposed Decision:** An "open draft" is defined as any `KnowledgeVersion` with `status IN ('draft', 'changes_requested')` for that `item_id`. Once a draft transitions to `in_review`, it is frozen under review. While a version is `in_review`, new revision creation is also prohibited (409) until the review is resolved. Thus, at most one non-terminal version (`status NOT IN ('published', 'superseded', 'rejected', 'withdrawn')`) may exist per item.
- **Needs Human Confirmation:** **YES**

### 4. Concurrency enforcement of "one open draft per item"
- **Observation:** Concurrent POST requests could race to create multiple drafts.
- **Proposed Decision:** Enforce at both layers:
  1. Database layer: Partial unique index on PostgreSQL:
     `CREATE UNIQUE INDEX uq_open_draft_per_item ON knowledge_versions (item_id) WHERE status IN ('draft', 'changes_requested');`
  2. Transaction layer: `SELECT id FROM knowledge_items WHERE id = :item_id FOR UPDATE` before inspecting existing drafts and inserting the new draft version.
- **Needs Human Confirmation:** **NO**

### 5. `machine_id` nullability and modification via PATCH
- **Observation:** Some procedures may apply to general factory safety, and machines might be reassigned.
- **Proposed Decision:** `machine_id` on `KnowledgeItem` is nullable (`Optional[str] = None`). `machine_id` belongs to `KnowledgeItem`, not `KnowledgeVersion`. `PATCH /knowledge/{id}` can update `machine_id` only if caller is the author and the item has no published revisions (or item author updates it).
- **Needs Human Confirmation:** **YES**

### 6. Machine listing permissions
- **Observation:** Spec asks whether all authenticated users may list machines.
- **Proposed Decision:** Any authenticated user (`EXPERT` or `TRAINEE`) may execute `GET /machines` to populate dropdowns and filters. Only users with `machine.manage` permission may create or modify machines (`POST /machines`). This aligns with [gurukul-docs/docs/API_CONVENTIONS.md:48](file:///e:/GURUKUL_AI/gurukul-docs/docs/API_CONVENTIONS.md#L48).
- **Needs Human Confirmation:** **NO**

### 7. Exact 403 versus 404 matrix
- **Observation:** Gating unauthorized access vs concealing resource existence.
- **Proposed Decision:**
  - Expert accessing another expert's non-published draft -> **404 Not Found** (prevents enumeration and hides unapproved work).
  - Trainee attempting write operations (`POST /knowledge`, `PATCH /knowledge/{id}`, `POST media`) -> **403 Forbidden** (caught immediately by `require_permission(PERM_KNOWLEDGE_CREATE)`).
  - Trainee requesting an unpublished version or item with no published version -> **404 Not Found**.
  - User lacking `knowledge.create` attempting `POST /knowledge` -> **403 Forbidden**.
- **Needs Human Confirmation:** **NO**

### 8. Setting `current_published_version_id` without Module 06
- **Observation:** Module 06 (validation & publishing) is not implemented in Phase 2.
- **Proposed Decision:** In `seed.py` and Pytest test fixtures, seed 1 demo `KnowledgeItem` and 1 `KnowledgeVersion` with `status = 'published'`, setting `knowledge_items.current_published_version_id = version.id`. This provides an immediate fixture for Trainee published-view tests and for testing `POST /knowledge/{id}/versions` without stubbing or faking Module 06 review endpoints.
- **Needs Human Confirmation:** **NO**

### 9. Handling of `submitted_at`, `published_at`, and review statuses in Module 01
- **Observation:** Module 01 is author-only capture; review transitions belong to Module 06.
- **Proposed Decision:** In Module 01, `submitted_at`, `published_at`, and status transitions to `in_review`, `approved`, `published`, `superseded`, `withdrawn`, `rejected` are read-only. Module 01 writes only `status = 'draft'`. If an author attempts to `PATCH` a version in `in_review` or `published`, the API returns `409 invalid_state`. In the UI, the "Submit for Review" button will be rendered in a disabled state with a tooltip explaining that Module 06 handles review submission.
- **Needs Human Confirmation:** **NO**

### 10. Media asset behavior during revision creation
- **Observation:** When Expert creates revision v2 from published v1, how do media assets behave?
- **Proposed Decision:** Media assets attach to `KnowledgeVersion` (`media_assets.version_id`). When creating a new draft revision from a published version, the smallest safe hackathon solution is: **shallow copy `media_assets` records** pointing to the same immutable `storage_key` on disk for the new `version_id`. New uploads or deletes in v2 do not affect v1's media records or files.
- **Needs Human Confirmation:** **YES**

### 11. Audit service event schema compatibility
- **Observation:** Verify if the audit service supports the 5 required event types.
- **Proposed Decision:** Yes. The 5 events:
  1. `knowledge.create` (`entity_type="knowledge_item"`, `entity_id=item.id`)
  2. `knowledge.update` (`entity_type="knowledge_version"`, `entity_id=version.id`)
  3. `knowledge.new_revision` (`entity_type="knowledge_version"`, `entity_id=version.id`)
  4. `media.upload` (`entity_type="media_asset"`, `entity_id=media.id`)
  5. `media.delete` (`entity_type="media_asset"`, `entity_id=media.id`)
  All map directly into existing `action`, `entity_type`, `entity_id`, and `detail` JSONB columns. A transaction-safe logging helper will be used to avoid premature commits.
- **Needs Human Confirmation:** **NO**

---

## 9. Dependency Map and Recommended Implementation Order

### Task Dependency Breakdown

1. **T2.1: Knowledge Models, Migration 002 & Core APIs (Owner A)**
   - *Needs from Repo:* `Base`, `get_db`, `get_current_user`, `require_permission`, `AuditService`, `001_foundation`.
   - *Already Present:* Foundation models, RBAC constants, session cookies, exception handlers.
   - *Missing:* `Machine`, `KnowledgeItem`, `KnowledgeVersion`, and `MediaAsset` models; repositories; schemas; endpoints; migration `002_knowledge.py`.
   - *Smallest Compatible Addition:* Create `002_knowledge.py`, add models, repositories, schemas, and routes for `/machines` and `/knowledge`.

2. **T2.2: Media Storage Service & Upload Endpoints (Owner A)**
   - *Needs from Repo:* `MEDIA_DIR`, `MAX_UPLOAD_MB`, `MediaAsset` model, streaming file handling, range responses.
   - *Already Present:* Configuration tokens in `app/core/config.py`, docker-compose volume `/data/media`.
   - *Missing:* `StorageService` interface (`backend/app/integrations/storage/`), `MediaService`, `endpoints/media.py`.
   - *Smallest Compatible Addition:* Implement local disk `StorageService`, MIME sniffer/validator, range-supporting media streaming endpoint `GET /media/{id}`.

3. **Frontend Infrastructure Prerequisite: Implement Typed API Client**
   - *Needs from Repo:* Fetch wrapper with credentials and double-submit CSRF header.
   - *Already Present:* Types in `frontend/src/types/api.ts`, usage in `AuthContext.tsx`.
   - *Missing:* `frontend/src/lib/api/client.ts`.
   - *Smallest Compatible Addition:* Create `frontend/src/lib/api/client.ts` with CSRF injection, cookie handling, and typed error responses.

4. **T2.3: Knowledge Library, Editor & Step Editor UI (Owner B)**
   - *Needs from Repo:* `frontend/src/lib/api/client.ts`, T2.1 endpoints, UI components.
   - *Already Present:* Industrial UI components (`Button`, `Card`, `Input`, `Badge`, `Alert`), route shell.
   - *Missing:* `LibraryPage.tsx`, `KnowledgeEditorPage.tsx`, `StepEditor.tsx`, query hooks.
   - *Smallest Compatible Addition:* Build screens in `frontend/src/features/knowledge-capture/`, wire to `/app/knowledge` routes.

5. **T2.4: Media Uploader & Browser Audio Recording UI (Owner B)**
   - *Needs from Repo:* T2.2 media endpoints, T2.3 KnowledgeEditorPage, browser `MediaRecorder` API.
   - *Already Present:* UI primitives, editor shell.
   - *Missing:* `MediaUploader.tsx`, `AudioRecorder.tsx`, `MediaList.tsx`, `useMediaRecorder.ts`.
   - *Smallest Compatible Addition:* Build audio recording and drag-and-drop uploader components.

6. **Final Integration & Security Verification**
   - End-to-end integration verifying Expert A draft isolation, Trainee 404/403 boundaries, and audit trail generation.

### Recommended Sequence
$$\text{T2.1 (Backend Data)} \longrightarrow \text{T2.2 (Media Storage)} \longrightarrow \text{Restore API Client} \longrightarrow \text{T2.3 (Library & Editor UI)} \longrightarrow \text{T2.4 (Upload/Record UI)} \longrightarrow \text{Integration}$$

---

## 10. Integration Risks for Module 04 and Module 06

- **Module 04 (Voice-to-Knowledge):**
  - *Step Schema Compatibility:* Module 04 LLM structuring produces `{order, title, instruction, tools, safety_warning, expected_result, stop_condition, needs_review, source_segment_ids, ai_generated}`. Module 01 JSONB step schema must match this specification exactly so voice-structured candidate steps drop directly into `KnowledgeVersion.steps`.
  - *Media Reuse:* Module 04 captures audio through the media storage service. Storage keys and MIME validation must support `audio/webm;codecs=opus` and `audio/wav` for ffmpeg normalization.
- **Module 06 (Validation and Versioning):**
  - *Status Transition Boundary:* Module 06 strictly owns `in_review -> published / changes_requested / rejected` and anti-self-approval checks. Module 01 must never permit publishing directly or simulate approval.
  - *UI Behavior Without Module 06:* The "Submit for Review" action in Module 01 must render disabled with a tooltip explaining that Module 06 governs the review queue. It must not execute fake approvals.

---

## 11. Environment and Test-Account Readiness

- **Application & Docker Compose:**
  - `docker-compose.yml` is syntactically valid and properly maps ports `8000` (backend), `5173` (frontend), `5432` (db) and volume `media_volume:/data/media`.
  - Docker Desktop engine was not running at assessment time (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`).
- **Media Directory Configuration:**
  - Configured via environment variable `MEDIA_DIR` in [backend/app/core/config.py:55](file:///e:/GURUKUL_AI/backend/app/core/config.py#L55) (default `./data/media` locally, `/data/media` in Docker).
  - Configured upload size limit: `MAX_UPLOAD_MB=100` in `.env.example` and `config.py:56`.
- **Pre-Configured Seed Accounts (in `infrastructure/scripts/seed.py`):**
  - **Expert A (Author):** `expert.a@demo.local` / `ExpertA@Gurukul2026!` (Role: `EXPERT`, has `knowledge.create`).
  - **Expert B (Reviewer):** `expert.b@demo.local` / `ExpertB@Gurukul2026!` (Role: `EXPERT`, has extra permission `knowledge.approve`).
  - **Trainee (Operator):** `trainee@demo.local` / `Trainee@Gurukul2026!` (Role: `TRAINEE`, restricted to `knowledge.view_published`).

---

## 12. Security Observations

1. **CSRF on Multipart Uploads:**
   State-changing requests (`POST /knowledge-versions/{vid}/media`) require `X-CSRF-Token` header. When using browser `fetch` or `XMLHttpRequest` with `FormData`, browsers do not automatically set custom headers, so the API client must explicitly append `X-CSRF-Token` read from the `gk_csrf` cookie.
2. **File Handling & Storage Keys:**
   Uploaded files must never be written to disk using caller-supplied filenames. Storage keys must be cryptographically generated UUIDs with sanitized, allow-listed extensions.
3. **MIME Sniffing:**
   Relying solely on the `Content-Type` header sent by the client is insecure. The backend must inspect initial magic bytes to verify audio/video/image/PDF headers.
4. **Range Request Authentication:**
   Media streaming via `GET /media/{id}` must enforce version-level visibility checks on every chunk/range request, ensuring unauthorized trainees cannot bypass 404 checks via direct asset links.

---

## 13. Blockers and UNVERIFIED Items

- **BLOCKER (for local host testing):** Host Python environment lacks packages listed in `backend/requirements.txt` (`sqlalchemy`, `alembic`, `pydantic-settings`), and Docker Desktop is currently stopped. Either starting Docker Desktop (`docker compose up`) or activating a virtual environment with `pip install -r requirements.txt` is required before test suites can execute.
- **BLOCKER (for frontend compilation):** Missing file `frontend/src/lib/api/client.ts` causes TypeScript compilation to fail (`AuthContext.tsx:3:38 - error TS2307: Cannot find module '../lib/api/client'`). Must be implemented before frontend builds can pass.
- **UNVERIFIED Items:**
  - Live runtime pass count of the 12 backend Pytest tests (due to missing host packages / stopped Docker).
  - Live runtime pass count of the 7 frontend Vitest tests (due to missing `node_modules` on host).

---

## 14. `git diff --stat` Output

```text
 docs/modules/01-repository-assessment.md | 240 +++++++++++++++++++++++++++++++
 1 file changed, 240 insertions(+)
```
