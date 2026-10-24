export type ModuleStatus =
  | 'Not started'
  | 'Planned'
  | 'In progress'
  | 'Implemented'
  | 'Tested'
  | 'Integrated'
  | 'Blocked';

export interface ModuleConfig {
  id: string; // e.g. "01"
  name: string; // e.g. "Expert Knowledge Capture"
  shortName: string;
  route: string; // e.g. "/app/knowledge"
  phase: number;
  hackathonRole: 'Build' | 'Build ("wow")' | 'Placeholder';
  status: ModuleStatus;
  summary: string;
  requiredPermission?: string;
  requiredRole?: 'EXPERT' | 'TRAINEE';
  workflowDiagram: string;
  featuresPlanned: string[];
  invariants: string[];
}
