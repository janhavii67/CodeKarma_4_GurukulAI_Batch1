export interface ProcedureStep {
  id: string;
  step_order: number;
  title: string;
  instruction: string;
  expected_observation?: string | null;
  safety_warning?: string | null;
  is_critical: boolean;
  details?: Record<string, unknown>;
}

export interface ProcedureSourceReference {
  title: string;
  publisher?: string | null;
  url: string;
}

export interface Procedure {
  id: string;
  title: string;
  description: string;
  machine_id: string | null;
  machine_name?: string | null;
  author_id?: string;
  /** Workflow category, stored in the procedure's `operation` column. */
  operation?: string | null;
  status: string;
  version: number;
  prerequisites?: string | null;
  required_tools?: string | null;
  safety_warnings?: string | null;
  operating_conditions?: string | null;
  source_refs?: ProcedureSourceReference[];
  steps: ProcedureStep[];
  updated_at: string;
}

export interface RunStep {
  id: string;
  step_id: string;
  is_completed: boolean;
  operator_notes?: string | null;
  verified_at?: string | null;
}

export interface ProcedureRun {
  id: string;
  procedure_id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | string;
  started_at: string;
  completed_at?: string | null;
  /** The step the server will accept a completion for; set via PATCH /runs/{id}/current-step. */
  current_step_order?: number;
  step_executions: RunStep[];
}

export interface ProcedureReference {
  id: string;
  title: string;
  kind: string;
  machine_id: string | null;
  url?: string | null;
  verification_status?: string | null;
  mime?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  duration_seconds?: number | null;
}

export type ReferenceLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function isVerifiedReference(asset: ProcedureReference): boolean {
  return ['verified', 'approved', 'published'].includes((asset.verification_status || '').toLowerCase());
}

/** Uploads default to "Untitled Media"; the original filename is more useful to a trainee. */
export function referenceTitle(asset: ProcedureReference): string {
  const title = asset.title?.trim();
  return title && title !== 'Untitled Media' ? title : asset.filename?.trim() || title || 'Attachment';
}

export function formatFileSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
