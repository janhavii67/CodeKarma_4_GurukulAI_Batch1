export type DecisionNodeType =
  | 'start' | 'question' | 'action' | 'safety' | 'media' | 'workflow' | 'result'
  // Legacy types older trees may still contain.
  | 'answer' | 'check' | 'stop' | 'escalation' | 'end';

export type VersionStatus = 'draft' | 'in_review' | 'published' | 'withdrawn' | 'superseded';
export type TreeStatus = 'draft' | 'pending_approval' | 'published' | 'archived';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type NodeOrigin = 'expert' | 'ai_draft' | 'ai_reviewed';

export interface MediaRef {
  id: string;
  title: string;
  kind: string;
  mime?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  duration_seconds?: number | null;
  machine_id: string | null;
  url: string;
}

export interface TechnicalTerm { term: string; definition: string }

export type InteractiveTreeNodeStatus = 'completed' | 'current' | 'available' | 'locked' | 'failed_attempt' | 'evidence_found';
export type InteractiveTreeEdgeStatus = 'completed' | 'available' | 'locked' | 'failed_attempt' | 'evidence_found';
export interface InteractiveTreeAction {
  edge_id: string;
  label: string;
  zone?: string | null;
  kind: 'check' | 'advance';
  done: boolean;
  attempted_wrong: boolean;
}
export interface InteractiveTreeFinding {
  key: string;
  node_id: string;
  title: string;
  clue?: string | null;
  reading?: { label?: string; value?: string; unit?: string; normal?: string } | null;
  zone?: string | null;
  step: string;
  at: string;
}
export interface InteractiveTreeNode {
  id: string;
  node_type: string;
  kind: string;
  kind_label: string;
  title: string;
  status: InteractiveTreeNodeStatus;
  is_start: boolean;
  is_final: boolean;
  critical: boolean;
  evidence_found: boolean;
  visit_order?: number | null;
  zone?: string | null;
  instructions: string;
  media: MediaRef[];
  safety?: { warning?: string | null; ppe: string[]; precautions: string[]; restricted: string[] } | null;
  terms: TechnicalTerm[];
  workflow: WorkflowInfo | null;
  findings: InteractiveTreeFinding[];
  actions: InteractiveTreeAction[];
  runtime_stage?: boolean;
}
export interface InteractiveTreeEdge {
  id: string;
  source: string;
  target?: string | null;
  label?: string | null;
  status: InteractiveTreeEdgeStatus;
  conditional: boolean;
  runtime_stage?: boolean;
}
export interface InteractiveTreeData {
  nodes: InteractiveTreeNode[];
  edges: InteractiveTreeEdge[];
  current_node_id?: string | null;
  stage?: string;
}

export interface NodeDetails {
  explanation?: string;
  technical_terms?: TechnicalTerm[];
  completion_condition?: string;
  corrective_actions?: string[];
  ppe?: string[];
  restricted_operations?: string[];
  precautions?: string[];
  possible_causes?: string[];
  recommended_actions?: string[];
  escalation?: string;
  unsourced?: boolean;
  source_titles?: string[];
  // Troubleshooting simulator scenario data.
  sim_clue?: string;
  sim_reading?: SimReading;
  sim_zone?: string;
  sim_critical?: boolean;
  sim_hint?: string;
  sim_min_checks?: number;
  verification?: string;
}

export interface SimReading { label?: string; value?: string; unit?: string; normal?: string }

/** Mission settings for the trainee simulator. */
export interface SimulationSettings {
  enabled?: boolean;
  leaderboard?: boolean;
  mission_code?: string;
  alert?: string;
  scenario?: string;
  objective?: string;
  symptoms?: string[];
  equipment?: string[];
  skills?: string[];
  criteria?: string[];
  xp_reward?: number;
}

export interface DecisionNode {
  id: string;
  node_type: DecisionNodeType;
  title: string;
  instructions: string;
  safety_warning?: string | null;
  help_text?: string | null;
  expected_observation?: string | null;
  input_type: string;
  input_rules?: string | null;
  is_start: boolean;
  position_x?: number | null;
  position_y?: number | null;
  linked_knowledge_version_id?: string | null;
  linked_workflow_version_id?: string | null;
  details: NodeDetails;
  origin: NodeOrigin;
  source_reference?: string | null;
  media: MediaRef[];
}

export interface DecisionEdge {
  id: string;
  from_node_id: string;
  /** Null while an answer exists but its next step has not been chosen. */
  to_node_id: string | null;
  label: string;
  condition?: string | null;
  sort_order: number;
}

export interface DecisionVersion {
  id: string;
  guide_id: string;
  version_number: number;
  status: VersionStatus;
  revision_reason?: string | null;
  author_id: string;
  author_name?: string | null;
  created_at: string;
  published_at?: string | null;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
}

export interface DecisionVersionSummary {
  id: string;
  version_number: number;
  status: VersionStatus;
  author_name?: string | null;
  revision_reason?: string | null;
  created_at: string;
  published_at?: string | null;
  step_count: number;
}

export interface DecisionGuide {
  id: string;
  title: string;
  description?: string | null;
  problem_category: string;
  machine_id?: string | null;
  machine_name?: string | null;
  machine_category?: string | null;
  severity: Severity;
  difficulty: Difficulty;
  tags: string[];
  estimated_minutes?: number | null;
  cover_media?: MediaRef | null;
  simulation?: SimulationSettings;
  is_archived: boolean;
  status: TreeStatus;
  owner_id: string;
  owner_name?: string | null;
  current_published_version_id?: string | null;
  draft_version_id?: string | null;
  in_review_version_id?: string | null;
  working_version_id?: string | null;
  stats: { steps: number; questions: number; results: number; versions: number; sessions: number };
  created_at: string;
  updated_at: string;
  versions?: DecisionVersionSummary[];
}

export interface GuideInput {
  title: string;
  problem_category: string;
  machine_id?: string | null;
  severity?: Severity;
  description?: string | null;
  difficulty?: Difficulty;
  tags?: string[];
  cover_media_id?: string | null;
  estimated_minutes?: number | null;
  simulation?: SimulationSettings;
}

export interface NodeInput {
  node_type?: DecisionNodeType;
  title?: string;
  instructions?: string;
  safety_warning?: string | null;
  help_text?: string | null;
  expected_observation?: string | null;
  input_type?: string;
  is_start?: boolean;
  position_x?: number;
  position_y?: number;
  linked_workflow_version_id?: string | null;
  linked_knowledge_version_id?: string | null;
  details?: NodeDetails;
  media_asset_ids?: string[];
  mark_reviewed?: boolean;
}

export interface ConnectFrom { node_id: string; edge_id?: string; label?: string }

export interface TreeIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  node_id?: string | null;
  edge_id?: string | null;
}

export interface AISuggestion {
  node_id?: string | null;
  type: string;
  source: 'ai' | 'rules';
  message: string;
  rationale?: string;
}

export interface AISource { id: string; title: string; section?: string | null; knowledge_version_id?: string | null; excerpt?: string }

export interface AIDraftResult {
  draft_id: string;
  summary: { steps: number; branches: number; sources_used: number; unsourced_steps: number };
  sources: AISource[];
  version: DecisionVersion;
}

export interface AIReviewResult { issues: TreeIssue[]; suggestions: AISuggestion[]; ai_available: boolean }

export interface AIAssistResult {
  answers: string[];
  follow_up_questions: string[];
  safety: string[];
  rationale: string;
  ai_available: boolean;
  knowledge: AISource[];
  media: MediaRef[];
  workflows: Array<{ id: string; title: string }>;
}

export type Point = { x: number; y: number };

// ---- Trainee ---------------------------------------------------------------

export interface WorkflowInfo { id: string; title: string; available: boolean }

export interface WalkNode extends DecisionNode { workflow: WorkflowInfo | null }

export interface WalkReport {
  machine_name?: string | null;
  problem: string;
  result_title: string;
  summary: string;
  observations: Array<{ question: string; answer: string }>;
  decision_path: Array<{ step: string; type: string; answer: string }>;
  possible_causes: string[];
  recommended_actions: string[];
  escalation?: string | null;
  safety: string[];
  media: MediaRef[];
  references: Array<{ type: string; id: string | null; item_id: string | null; title: string }>;
  workflow: WorkflowInfo | null;
  duration_seconds?: number | null;
}

export interface WalkState {
  session_id: string;
  guide: { id: string; title: string; description?: string | null; problem_category: string; difficulty: Difficulty; severity: Severity };
  version_id: string;
  version_is_current: boolean;
  machine_id?: string | null;
  machine_name?: string | null;
  status: 'in_progress' | 'resolved' | 'unresolved' | 'escalated';
  current_node: WalkNode | null;
  tree: InteractiveTreeData;
  answers: DecisionEdge[];
  path: Array<{ index: number; node_id: string; title: string; type: string; answer: string; answered_at: string }>;
  step_number: number;
  is_terminal: boolean;
  report: WalkReport | null;
  escalation: { status: string; requested_at: string } | null;
  started_at: string;
  ended_at?: string | null;
}

export interface WalkHistoryItem {
  session_id: string;
  guide_id: string;
  guide_title: string;
  machine_name?: string | null;
  status: WalkState['status'];
  steps_answered: number;
  path: string[];
  current_step?: string | null;
  result_title?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  is_latest_version: boolean;
}

export interface CatalogMachine {
  id: string | null;
  name: string;
  category?: string | null;
  cover_media?: MediaRef | null;
  tree_count: number;
  problem_categories: string[];
}

export interface Catalog { machines: CatalogMachine[]; trees: DecisionGuide[] }

export interface Explanation {
  answer: string;
  uncertain: boolean;
  escalate: boolean;
  sources: AISource[];
  notice?: string | null;
}
