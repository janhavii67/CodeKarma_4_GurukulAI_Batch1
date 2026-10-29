// ─── Machine ──────────────────────────────────────────────────────────────────

export interface Machine {
  id: string;
  name: string;
  code: string;
  model_number?: string | null;
  serial_number?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  location?: string | null;
  status?: string | null;
  is_active?: boolean;
  specifications?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MachineCategory {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface MachineListResponse {
  items: Machine[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Step ─────────────────────────────────────────────────────────────────────

export interface Step {
  order: number;
  title: string;
  instruction: string;
  tools: string[];
  safety_warning: string | null;
  expected_result: string | null;
  stop_condition: string | null;
  needs_review: boolean;
  source_segment_ids: number[];
  ai_generated: boolean;
  note: string | null;
}

export type VersionStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'rejected'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'withdrawn';

export type VersionOrigin = 'expert' | 'ai_draft' | 'ai_refined';

export interface KnowledgeSourceReference {
  type?: string;
  source_title?: string;
  title?: string;
  publisher?: string;
  revision?: string;
  manual_number?: string;
  pdf_page?: number | string;
  pdf_pages?: Array<number | string>;
  printed_page?: number | string;
  printed_pages?: Array<number | string>;
  section?: string;
  source_import_key?: string;
  synthetic_demo?: boolean;
  verification?: KnowledgeSourceVerification;
  [key: string]: unknown;
}

export interface KnowledgeSourceVerification {
  status: 'unverified' | 'verified';
  audience_clearance: 'unknown' | 'trainee_authorized' | 'expert_only' | 'restricted' | 'demo_only';
  source_provenance?: string;
  source_manufacturer?: string;
  source_model?: string;
  machine_manufacturer?: string;
  machine_model?: string;
  machine_identity_basis?: 'asset_plate' | 'trusted_registry';
  machine_identity_reference?: string;
  verified_machine_id?: string;
  verified_by_user_id?: string;
  verified_by_name?: string;
  verified_at?: string;
}

// ─── Knowledge Version ────────────────────────────────────────────────────────

export interface KnowledgeVersion {
  id: string;
  item_id: string;
  version_no: number;
  title?: string | null;
  machine_id?: string | null;
  status: VersionStatus;
  summary: string | null;
  description: string | null;
  content?: string | null;
  source_refs?: KnowledgeSourceReference[] | null;
  operating_conditions?: string | null;
  prerequisites?: string | null;
  safety_warnings?: string | null;
  common_mistakes?: string | null;
  corrective_actions?: string | null;
  steps: Step[];
  origin: VersionOrigin;
  revision_reason: string | null;
  created_by: string;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeVersionSummary {
  id: string;
  item_id: string;
  version_no: number;
  status: VersionStatus;
  summary: string | null;
  origin: VersionOrigin;
  revision_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeVersionComparison {
  base: KnowledgeVersion;
  target: KnowledgeVersion;
  changed_fields: string[];
}

// ─── Knowledge Item ───────────────────────────────────────────────────────────

export interface KnowledgeItemDetail {
  id: string;
  title: string;
  machine_id: string | null;
  author_id: string;
  current_published_version_id: string | null;
  is_demo: boolean;
  status?: string;
  rag_indexed?: boolean;
  rag_chunks_count?: number;
  created_at: string;
  updated_at: string;
  version: KnowledgeVersion;
  machine: Machine | null;
}

export interface KnowledgeListItem {
  id: string;
  title: string;
  machine_id: string | null;
  author_id: string;
  current_published_version_id: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  version_id: string;
  version_no: number;
  version_status: VersionStatus;
  version_summary: string | null;
  version_updated_at: string;
  machine: Machine | null;
}

export interface KnowledgeListResponse {
  items: KnowledgeListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Request Payloads ─────────────────────────────────────────────────────────

export interface KnowledgeCreateRequest {
  title: string;
  machine_id?: string | null;
  description?: string | null;
  summary?: string | null;
  category?: string | null;
  tags?: string | null;
  content?: string | null;
  source_refs?: KnowledgeSourceReference[] | null;
  operating_conditions?: string | null;
  prerequisites?: string | null;
  safety_warnings?: string | null;
  common_mistakes?: string | null;
  corrective_actions?: string | null;
}

export interface KnowledgeUpdateRequest {
  title?: string | null;
  machine_id?: string | null;
  summary?: string | null;
  description?: string | null;
  steps?: Step[] | null;
  revision_reason?: string | null;
  version_id?: string | null;
  category?: string | null;
  tags?: string | null;
  content?: string | null;
  source_refs?: KnowledgeSourceReference[] | null;
  operating_conditions?: string | null;
  prerequisites?: string | null;
  safety_warnings?: string | null;
  common_mistakes?: string | null;
  corrective_actions?: string | null;
}

export interface RevisionCreateRequest {
  revision_reason: string;
}

// ─── Library Query Params ─────────────────────────────────────────────────────

export interface KnowledgeListParams {
  page?: number;
  page_size?: number;
  q?: string;
  machine_id?: string;
  status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A version is editable when its status allows writes. Author check is done separately. */
export function isEditableStatus(status: VersionStatus): boolean {
  return status === 'draft' || status === 'changes_requested';
}
