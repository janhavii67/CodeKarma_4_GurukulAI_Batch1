import type {
  InteractiveTreeAction, InteractiveTreeData, InteractiveTreeEdge, InteractiveTreeEdgeStatus,
  InteractiveTreeNode, InteractiveTreeNodeStatus, MediaRef, TechnicalTerm, WorkflowInfo,
} from '../decision-trees/types';

export type MissionDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type MissionStage = 'investigate' | 'diagnose' | 'correct' | 'verify' | 'complete';

export interface MissionSummary {
  id: string;
  mission_code: string;
  title: string;
  alert: string;
  briefing_preview: string;
  problem_category: string;
  difficulty: MissionDifficulty;
  estimated_minutes?: number | null;
  xp_reward: number;
  skills: string[];
  machine_id?: string | null;
  machine_name?: string | null;
  cover_media?: MediaRef | null;
  attempts: number;
  best_score: number | null;
  status: 'new' | 'in_progress' | 'completed';
  in_progress_attempt_id: string | null;
  locked: boolean;
  locked_reason: string | null;
  leaderboard: boolean;
}

export interface MissionBriefing extends MissionSummary {
  scenario: string;
  objective: string;
  symptoms: string[];
  equipment: string[];
  safety: string[];
  criteria: string[];
  zones: string[];
  version_id: string;
}

export interface Reading { label?: string; value?: string; unit?: string; normal?: string }

export interface Evidence {
  key: string;
  node_id: string;
  title: string;
  clue?: string | null;
  reading?: Reading | null;
  zone?: string | null;
  step: string;
  at: string;
}

export interface MissionEvent {
  type: 'inspect' | 'check' | 'repeat' | 'decision' | 'safety_ack' | 'hint' | 'fault_reached' | 'diagnosis' | 'corrective' | 'verification';
  at: string;
  node_id?: string;
  edge_id?: string;
  label?: string;
  title?: string;
  outcome?: string;
  feedback?: string;
  clue?: string;
  level?: number;
}

export type MissionAction = InteractiveTreeAction;
export type MissionTreeNodeStatus = InteractiveTreeNodeStatus;
export type MissionTreeEdgeStatus = InteractiveTreeEdgeStatus;
export type MissionTreeNode = InteractiveTreeNode;
export type MissionTreeEdge = InteractiveTreeEdge;
export type MissionTree = InteractiveTreeData & { stage: MissionStage };

export interface MissionScorePreview {
  total: number;
  breakdown: ScoreBreakdown;
  max: ScoreBreakdown;
  missed_checkpoints: string[];
  evidence_found: number;
  evidence_available: number;
  xp_projected: number;
}

export interface MissionNodeView {
  id: string;
  node_type: string;
  kind: string;
  kind_label: string;
  title: string;
  instructions: string;
  zone?: string | null;
  media: MediaRef[];
  safety: { warning?: string | null; ppe: string[]; precautions: string[]; restricted: string[] };
  needs_ack: boolean;
  has_inspection: boolean;
  inspected: boolean;
  min_checks: number;
  checks_done: number;
  critical: boolean;
  terms: TechnicalTerm[];
  workflow: WorkflowInfo | null;
  actions: MissionAction[];
}

export interface ScoreBreakdown {
  root_cause: number; decisions: number; safety: number; evidence: number; corrective: number; assistance: number; efficiency: number;
}

export interface MissionReport {
  score: {
    total: number;
    breakdown: ScoreBreakdown;
    max: ScoreBreakdown;
    missed_checkpoints: string[];
    evidence_found: number;
    evidence_available: number;
    xp_earned: number;
    xp_awarded: number;
    previous_best: number | null;
    is_personal_best: boolean;
  };
  stats: { wrong: number; acceptable: number; premature: number; unnecessary: number; violations: number; hints_smart: number; hints_expert: number; time_seconds: number };
  diagnosis: { chosen: string[]; correct: string[]; accuracy: number; reached_target: boolean } | null;
  corrective: { chosen: string[]; correct: string[]; accuracy: number; complete: boolean } | null;
  fault: { title: string; summary?: string } | null;
  replay: Array<{
    node_id: string; title: string; kind: string; kind_label: string; your_choice: string | null; approved_choice: string | null;
    matches: boolean; on_approved_path: boolean; checks: string[];
    missteps: Array<{ label: string; outcome: string; feedback?: string }>; explanation?: string | null;
  }>;
  did_well: string[];
  mistakes: Array<{ what: string; why?: string | null; approved?: string | null }>;
  resources: Array<{ type: 'knowledge' | 'workflow' | 'media'; title: string; item_id?: string; id?: string; url?: string }>;
  achievements: Array<{ code: string; title: string; description: string }>;
}

export interface MissionAttempt {
  id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  stage: MissionStage;
  paused: boolean;
  elapsed_seconds: number;
  mission: {
    id: string; code: string; title: string; difficulty: MissionDifficulty; objective: string; machine_name?: string | null;
    cover_media?: MediaRef | null; xp_reward: number; estimated_minutes?: number | null; equipment: string[]; zones: string[];
  };
  current: MissionNodeView | null;
  evidence: Evidence[];
  events: MissionEvent[];
  last_event: MissionEvent | null;
  hints: { used: Record<string, number>; current: Record<string, string> };
  safety: { violations: number; status: 'ok' | 'warning' };
  map: {
    stages: Array<{ node_id: string; kind: string; label?: string; title: string; status: 'done' | 'current' }>;
    branches: Array<{ label: string; locked: boolean }>;
    resolution: Array<{ key: string; label: string; status: 'done' | 'current' | 'locked' }>;
    progress: number;
  };
  tree: MissionTree;
  score_preview: MissionScorePreview;
  diagnosis: { options: string[] } | null;
  corrective: { options: string[]; fault: string; safety: string[]; tools: string[]; expected?: string | null; previous?: MissionReport['corrective']; retries: number } | null;
  verification: { conditions: string[]; fault: string } | null;
  report: MissionReport | null;
}

export interface MissionProfile {
  total_xp: number;
  level: number;
  next_level_xp: number;
  completed: number;
  achievements: Array<{ code: string; title: string; description: string; earned_at: string | null }>;
  skills: Array<{ skill: string; score: number; missions: number }>;
  history: Array<{ attempt_id: string; mission_id: string; title: string; status: string; stage: string; score: number | null; xp: number; started_at: string; completed_at?: string | null; time_seconds: number }>;
}
