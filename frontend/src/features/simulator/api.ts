import { api } from '../../lib/api/client';
import type { Explanation } from '../decision-trees/types';
import type { MissionAttempt, MissionBriefing, MissionProfile, MissionSummary } from './types';

const BASE = '/simulator';

export const simulatorApi = {
  missions: () => api.get<MissionSummary[]>(`${BASE}/missions`),
  profile: () => api.get<MissionProfile>(`${BASE}/profile`),
  briefing: (missionId: string) => api.get<MissionBriefing>(`${BASE}/missions/${missionId}`),
  leaderboard: (missionId: string) => api.get<Array<{ rank: number; name: string; score: number; time_seconds: number }>>(`${BASE}/missions/${missionId}/leaderboard`),
  start: (missionId: string, restart = false) => api.post<MissionAttempt>(`${BASE}/missions/${missionId}/attempts`, { restart }),
  attempt: (attemptId: string) => api.get<MissionAttempt>(`${BASE}/attempts/${attemptId}`),
  inspect: (attemptId: string) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/inspect`),
  act: (attemptId: string, edgeId: string, acknowledged = false) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/act`, { edge_id: edgeId, acknowledged }),
  hint: (attemptId: string, level: 2 | 3) => api.post<{ hint: string; attempt: MissionAttempt }>(`${BASE}/attempts/${attemptId}/hint`, { level }),
  diagnose: (attemptId: string, causes: string[]) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/diagnose`, { causes }),
  correct: (attemptId: string, actions: string[]) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/correct`, { actions }),
  verify: (attemptId: string) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/verify`),
  pause: (attemptId: string) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/pause`),
  resume: (attemptId: string) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/resume`),
  abandon: (attemptId: string) => api.post<MissionAttempt>(`${BASE}/attempts/${attemptId}/abandon`),
  explain: (attemptId: string, question: string) => api.post<Explanation>(`${BASE}/attempts/${attemptId}/explain`, { question }),
};
