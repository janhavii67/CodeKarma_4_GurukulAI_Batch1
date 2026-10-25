# Gurukul AI — Database Schema & Migration Specification

## 1. Relational Entity Schema

The database schema is strictly version-controlled via Alembic migrations.

### Core Tables & Entities

#### 1. Identity, Roles & Sessions
- `roles`: `(id [PK], name, description)`
  - Seeded: `ADMIN`, `EXPERT`, `OPERATOR`, `TRAINEE`
- `permissions`: `(id [PK], description)`
  - 16 granular capabilities across knowledge, procedures, audio, and administration
- `role_permissions`: `(role_id [FK], permission_id [FK])`
- `users`: `(id [PK UUID], email [UNIQUE], name, password_hash, role_id [FK], is_active, created_at, updated_at)`
- `user_permissions`: Custom overrides per user
- `sessions`: `(id [PK UUID], user_id [FK], token_hash [INDEX], ip_address, user_agent, expires_at, last_seen_at, revoked_at)`
- `audit_logs`: `(id [PK UUID], actor_id [FK], action, entity_type, entity_id, ip_address, extra_metadata_json, created_at)`

#### 2. Machines & Tools
- `machine_categories`: `(id [PK], name [UNIQUE], description)`
- `machines`: `(id [PK UUID], name, model_number, serial_number [UNIQUE], manufacturer, category_id [FK], location, status, specifications, created_at, updated_at)`
- `tools`: `(id [PK UUID], name, tool_number [INDEX], machine_id [FK], description, specifications, created_at, updated_at)`

#### 3. Knowledge & Peer Review Governance (Module 06 Canonical & Snapshots)
- `knowledge_items` (legacy alias `knowledge_articles`): `(id [PK UUID], title [MIRROR], machine_id [FK MIRROR], category, tags, status, current_version, current_published_version_id [FK DEFERRABLE], author_id [FK], created_at, updated_at)`
- `knowledge_versions` (legacy alias `knowledge_revisions`): `(id [PK UUID], item_id [FK], version_no, title [SNAPSHOT], machine_id [FK SNAPSHOT], status [CHECK], origin [CHECK], summary, steps, content, operating_conditions, prerequisites, safety_warnings, common_mistakes, corrective_actions, created_by [FK], submitted_at, published_at [CHECK], revision_reason, created_at)`
- `knowledge_attachments`: `(id [PK UUID], item_id [FK], file_name, file_path, file_size_bytes, content_type, uploaded_by [FK], created_at)`
- `approval_records` (legacy alias `review_records`): `(id [PK UUID], item_id [FK], version_id [FK], reviewer_id [FK], decision [CHECK], comment [CHECK], created_at)`
- `review_comments`: `(id [PK UUID], version_id [FK], author_id [FK], body [CHECK 1..4000], step_order, created_at)`

**Database-Level Governance Constraints & Triggers:**
- **Partial Unique Indexes:**
  - `uq_versions_one_published_per_item`: At most one published version per item (`WHERE status = 'published'`).
  - `uq_versions_one_open_per_item`: At most one open version per item (`WHERE status IN ('draft', 'changes_requested', 'in_review')`).
  - `ix_versions_status_submitted`: Fast review queue ordering on `(status, submitted_at)`.
- **CHECK Constraints:**
  - `ck_versions_status`: Strict 8-state governance lifecycle (`draft`, `in_review`, `changes_requested`, `rejected`, `approved`, `published`, `superseded`, `withdrawn`).
  - `ck_versions_origin`: Origin tracking (`expert`, `ai_draft`, `ai_draft_edited`).
  - `ck_approval_decision`: Decisions (`approved`, `changes_requested`, `rejected`, `withdrawn`).
  - `ck_approval_comment_required`: Mandatory reviewer reasoning for non-approved decisions.
  - `ck_published_has_date`: Published items must have timestamp recorded.
- **Triggers:**
  - `fn_versions_freeze_content`: Immutable frozen content once outside editable status (`draft`, `changes_requested`).
  - `trg_approval_records_append_only`: Append-only audit log for review decisions (UPDATE and DELETE prohibited).
  - `trg_review_comments_append_only`: Append-only review discussion comments.

#### 4. Guided Procedures & Interactive Runners
- `procedures`: `(id [PK UUID], title, description, machine_id [FK], author_id [FK], status, version, prerequisites, required_tools, safety_warnings, created_at, updated_at)`
- `procedure_steps`: `(id [PK UUID], procedure_id [FK], step_order, title, instruction, expected_observation, safety_warning, is_critical)`
- `procedure_runs`: `(id [PK UUID], procedure_id [FK], operator_id [FK], status, started_at, completed_at)`
- `procedure_run_steps`: `(id [PK UUID], run_id [FK], step_id [FK], is_completed, operator_notes, verified_at)`

#### 5. Fault Diagnostics & Decision Trees
- `troubleshooting_cases`: `(id [PK UUID], title, machine_id [FK], symptom, severity, created_by [FK], is_published, created_at, updated_at)`
- `troubleshooting_nodes`: `(id [PK UUID], case_id [FK], node_type, title, description, safety_warning, is_root)`
- `troubleshooting_edges`: `(id [PK UUID], case_id [FK], from_node_id [FK], to_node_id [FK], label)`

#### 6. Acoustic Analysis & Reference Library
- `audio_references`: `(id [PK UUID], title, machine_id [FK], file_path, duration_seconds, sample_rate, fault_label, is_expert_verified, operating_conditions, features_json, uploaded_by [FK], created_at, updated_at)`
- `audio_analysis_jobs`: `(id [PK UUID], file_path, uploaded_by [FK], status, matched_reference_id [FK], machine_id [FK], similarity_score, reason_code, message, requires_expert_review, candidate_scores_json, created_at, completed_at)`

#### 7. Simulations & Learning Progression
- `simulation_scenarios`: `(id [PK UUID], title, description, machine_id [FK], difficulty, initial_state_json, scenario_tree_json, completion_criteria, created_by [FK], created_at, updated_at)`
- `simulation_attempts`: `(id [PK UUID], scenario_id [FK], user_id [FK], status, decisions_log_json, score, safety_violations_count, feedback, started_at, completed_at)`
- `learning_paths`: `(id [PK UUID], title, description, target_role, created_by [FK], created_at, updated_at)`
- `learning_items`: `(id [PK UUID], path_id [FK], item_type, reference_id, order_index, title)`
- `learning_assignments`: `(id [PK UUID], path_id [FK], user_id [FK], status, progress_percentage, assigned_at, due_at, completed_at)`
- `notifications`: `(id [PK UUID], user_id [FK], title, message, link, is_read, created_at)`

---

## 2. Migration History

1. `001_foundation.py`: Users, roles, permissions, sessions, and audit logs.
2. `002_expanded_schema.py`: Complete manufacturing domain tables (machines, tools, knowledge, reviews, procedures, decision trees, audio references, and simulations).
3. `003_governance_constraints.py`: Version snapshot architecture, freeze trigger, append-only review records/comments, partial unique indexes, and dialect-agnostic CHECK constraints.

