import { api } from '../../lib/api/client';
import type {
  KnowledgeItemDetail,
  KnowledgeListResponse,
  KnowledgeVersion,
  KnowledgeVersionSummary,
  KnowledgeVersionComparison,
  KnowledgeCreateRequest,
  KnowledgeUpdateRequest,
  KnowledgeListParams,
  MachineListResponse,
  RevisionCreateRequest,
} from './types';

// ─── Machines ─────────────────────────────────────────────────────────────────

export async function fetchMachines(params?: {
  page?: number;
  page_size?: number;
  q?: string;
  category?: string;
}): Promise<MachineListResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.q) qs.set('q', params.q);
  if (params?.category) qs.set('category', params.category);
  const query = qs.toString() ? `?${qs}` : '';
  return api.get<MachineListResponse>(`/machines${query}`);
}

// ─── Knowledge Items ──────────────────────────────────────────────────────────

export async function fetchKnowledgeList(
  params?: KnowledgeListParams
): Promise<KnowledgeListResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.q) qs.set('q', params.q);
  if (params?.machine_id) qs.set('machine_id', params.machine_id);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs}` : '';
  return api.get<KnowledgeListResponse>(`/knowledge${query}`);
}

export async function fetchKnowledgeDetail(
  itemId: string,
  versionId?: string
): Promise<KnowledgeItemDetail> {
  const qs = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';
  return api.get<KnowledgeItemDetail>(`/knowledge/${itemId}${qs}`);
}

export async function createKnowledge(
  payload: KnowledgeCreateRequest
): Promise<KnowledgeItemDetail> {
  return api.post<KnowledgeItemDetail>('/knowledge', payload);
}

export async function updateKnowledge(
  itemId: string,
  payload: KnowledgeUpdateRequest
): Promise<KnowledgeVersion> {
  return api.patch<KnowledgeVersion>(`/knowledge/${itemId}`, payload);
}

export async function submitKnowledgeForReview(itemId: string): Promise<KnowledgeItemDetail> {
  return api.post<KnowledgeItemDetail>(`/knowledge/${itemId}/submit`);
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export async function fetchVersionList(
  itemId: string
): Promise<KnowledgeVersionSummary[]> {
  return api.get<KnowledgeVersionSummary[]>(`/knowledge/${itemId}/versions`);
}

export async function fetchVersionComparison(
  itemId: string,
  baseVersion: number,
  targetVersion: number
): Promise<KnowledgeVersionComparison> {
  const query = new URLSearchParams({ base_version: String(baseVersion), target_version: String(targetVersion) });
  return api.get<KnowledgeVersionComparison>(`/knowledge/${itemId}/compare?${query}`);
}

export async function createRevision(
  itemId: string,
  payload: RevisionCreateRequest
): Promise<KnowledgeVersion> {
  return api.post<KnowledgeVersion>(`/knowledge/${itemId}/versions`, payload);
}
