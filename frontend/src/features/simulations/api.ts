import { api } from '../../lib/api/client';

export const simulationApi = {
  scenarios: (q = '') => api.get<any[]>(`/simulator/scenarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  knowledgeSources: (q = '') => api.get<any[]>(`/simulator/knowledge-sources${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  scenario: (id: string) => api.get<any>(`/simulator/scenarios/${id}`),
  scenarioForAuthoring: (id: string) => api.get<any>(`/simulator/scenarios/${id}/authoring`),
  sessions: () => api.get<any[]>('/simulator/sessions/my'),
  start: (scenarioId: string) => api.post<any>(`/simulator/scenarios/${scenarioId}/sessions`, {}),
  session: (id: string) => api.get<any>(`/simulator/sessions/${id}`),
  decide: (id: string, choice_id: string) => api.post<any>(`/simulator/sessions/${id}/decisions`, { choice_id }),
  restart: (id: string) => api.post<any>(`/simulator/sessions/${id}/restart`, {}),
  report: (id: string, reason: string, decision_id?: string) => api.post<any>(`/simulator/sessions/${id}/reports`, { reason, decision_id }),
  drafts: () => api.get<any[]>('/simulator/drafts'),
  draft: (id: string) => api.get<any>(`/simulator/drafts/${id}`),
  createDraft: (content: any) => api.post<any>('/simulator/drafts', { content }),
  createRevision: (id: string, content: any) => api.post<any>(`/simulator/scenarios/${id}/revisions`, { content }),
  updateDraft: (id: string, content: any) => api.put<any>(`/simulator/drafts/${id}`, { content }),
  submitDraft: (id: string) => api.post<any>(`/simulator/drafts/${id}/submit`, {}),
  publishDraft: (id: string) => api.post<any>(`/simulator/drafts/${id}/publish`, {}),
  reviewDraft: (id: string, decision: string, comments: string) => api.post<any>(`/simulator/drafts/${id}/review`, { decision, comments }),
};
