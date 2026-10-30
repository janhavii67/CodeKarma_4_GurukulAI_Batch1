import { api } from '../../lib/api/client';
import type {
  AIAssistResult, AIDraftResult, AIReviewResult, Catalog, ConnectFrom, DecisionEdge, DecisionGuide, DecisionNode,
  DecisionVersion, Explanation, GuideInput, MediaRef, NodeInput, TreeIssue, WalkHistoryItem, WalkState,
} from './types';

const BASE = '/decision-trees';
type StatusAction = 'submit_review' | 'withdraw_submission' | 'approve' | 'reject' | 'withdraw';

export const decisionTreeApi = {
  // Trees
  listGuides: (params: { machineId?: string; includeArchived?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.machineId) qs.set('machine_id', params.machineId);
    if (params.includeArchived) qs.set('include_archived', 'true');
    return api.get<DecisionGuide[]>(qs.toString() ? `${BASE}?${qs}` : BASE);
  },
  createGuide: (body: GuideInput) => api.post<DecisionGuide>(BASE, body),
  getGuide: (guideId: string) => api.get<DecisionGuide>(`${BASE}/${guideId}`),
  updateGuide: (guideId: string, body: Partial<GuideInput>) => api.patch<DecisionGuide>(`${BASE}/${guideId}`, body),
  deleteGuide: (guideId: string) => api.delete<void>(`${BASE}/${guideId}`),
  archiveGuide: (guideId: string) => api.post<DecisionGuide>(`${BASE}/${guideId}/archive`),
  restoreGuide: (guideId: string) => api.post<DecisionGuide>(`${BASE}/${guideId}/restore`),
  duplicateGuide: (guideId: string) => api.post<DecisionGuide>(`${BASE}/${guideId}/duplicate`),

  // Versions
  getVersion: (versionId: string) => api.get<DecisionVersion>(`${BASE}/versions/${versionId}`),
  validateVersion: (versionId: string) => api.get<{ issues: TreeIssue[] }>(`${BASE}/versions/${versionId}/validation`),
  createVersion: (guideId: string, revisionReason?: string) =>
    api.post<DecisionVersion>(`${BASE}/${guideId}/versions`, { revision_reason: revisionReason || null }),
  changeStatus: (versionId: string, action: StatusAction, reason?: string) =>
    api.post<DecisionVersion>(`${BASE}/versions/${versionId}/status`, { action, reason: reason || null }),
  replaceGraph: (versionId: string, snapshot: { nodes: DecisionNode[]; edges: DecisionEdge[] }) =>
    api.put<DecisionVersion>(`${BASE}/versions/${versionId}/graph`, snapshot),
  savePositions: (versionId: string, positions: Array<{ id: string; position_x: number; position_y: number }>) =>
    api.patch<{ ok: boolean }>(`${BASE}/versions/${versionId}/positions`, { positions }),

  // Steps
  addNode: (versionId: string, body: NodeInput & { connect_from?: ConnectFrom }) =>
    api.post<{ node: DecisionNode; version: DecisionVersion }>(`${BASE}/versions/${versionId}/nodes`, body),
  updateNode: (nodeId: string, body: NodeInput) => api.patch<DecisionNode>(`${BASE}/nodes/${nodeId}`, body),
  duplicateNode: (nodeId: string) => api.post<{ node: DecisionNode; version: DecisionVersion }>(`${BASE}/nodes/${nodeId}/duplicate`),
  deleteNode: (nodeId: string) => api.delete<DecisionVersion>(`${BASE}/nodes/${nodeId}`),
  reorderAnswers: (nodeId: string, edgeIds: string[]) => api.put<DecisionVersion>(`${BASE}/nodes/${nodeId}/answer-order`, { edge_ids: edgeIds }),

  // Answers / branches
  addEdge: (versionId: string, body: { from_node_id: string; to_node_id?: string | null; label?: string }) =>
    api.post<DecisionEdge>(`${BASE}/versions/${versionId}/edges`, body),
  updateEdge: (edgeId: string, body: { label?: string; to_node_id?: string | null; condition?: string | null }) =>
    api.patch<DecisionEdge>(`${BASE}/edges/${edgeId}`, body),
  deleteEdge: (edgeId: string) => api.delete<void>(`${BASE}/edges/${edgeId}`),

  // AI
  aiDraft: (versionId: string, prompt: string, replace: boolean) =>
    api.post<AIDraftResult>(`${BASE}/versions/${versionId}/ai/draft`, { prompt, replace }),
  aiReview: (versionId: string) => api.post<AIReviewResult>(`${BASE}/versions/${versionId}/ai/review`),
  aiAssist: (nodeId: string) => api.post<AIAssistResult>(`${BASE}/nodes/${nodeId}/assist`),

  // Supporting data
  listWorkflows: () => api.get<Array<{ id: string; title: string; machine_id?: string | null; status: string }>>('/procedures'),
  listMachineMedia: (machineId: string) => api.get<MediaRef[]>(`/machine-knowledge/${machineId}/media`),
  uploadMachineMedia: (machineId: string, file: File, title?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    return api.postForm<MediaRef>(`/machine-knowledge/${machineId}/media`, form);
  },
};

export const walkApi = {
  catalog: (machineId?: string) => api.get<Catalog>(machineId ? `${BASE}/catalog?machine_id=${encodeURIComponent(machineId)}` : `${BASE}/catalog`),
  history: () => api.get<WalkHistoryItem[]>(`${BASE}/walk/my`),
  start: (guideId: string) => api.post<WalkState>(`${BASE}/walk`, { guide_id: guideId }),
  get: (sessionId: string) => api.get<WalkState>(`${BASE}/walk/${sessionId}`),
  answer: (sessionId: string, edgeId: string) => api.post<WalkState>(`${BASE}/walk/${sessionId}/answer`, { edge_id: edgeId }),
  back: (sessionId: string, stepIndex: number) => api.post<WalkState>(`${BASE}/walk/${sessionId}/back`, { step_index: stepIndex }),
  restart: (sessionId: string) => api.post<WalkState>(`${BASE}/walk/${sessionId}/restart`),
  escalate: (sessionId: string, reason: string) => api.post<WalkState>(`${BASE}/walk/${sessionId}/escalate`, { reason }),
  explain: (sessionId: string, question: string) => api.post<Explanation>(`${BASE}/walk/${sessionId}/explain`, { question }),
  startWorkflow: (workflowId: string) => api.post<{ id: string }>(`/procedures/${workflowId}/start`, {}),
};
