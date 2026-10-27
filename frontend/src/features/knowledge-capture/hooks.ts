import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../lib/api/client';
import type {
  KnowledgeCreateRequest,
  KnowledgeListParams,
  KnowledgeUpdateRequest,
  RevisionCreateRequest,
} from './types';
import {
  createKnowledge,
  createRevision,
  fetchKnowledgeDetail,
  fetchKnowledgeList,
  fetchMachines,
  fetchVersionList,
  updateKnowledge,
  submitKnowledgeForReview,
} from './knowledgeApi';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  lists: () => [...knowledgeKeys.all, 'list'] as const,
  list: (params: KnowledgeListParams) => [...knowledgeKeys.lists(), params] as const,
  details: () => [...knowledgeKeys.all, 'detail'] as const,
  detail: (id: string, versionId?: string) =>
    [...knowledgeKeys.details(), id, versionId ?? null] as const,
  versions: (id: string) => [...knowledgeKeys.all, 'versions', id] as const,
};

export const machineKeys = {
  all: ['machines'] as const,
  lists: () => [...machineKeys.all, 'list'] as const,
  list: (q?: string) => [...machineKeys.lists(), q ?? ''] as const,
};

// ─── Machine Hooks ────────────────────────────────────────────────────────────

export function useMachines(q?: string) {
  return useQuery({
    queryKey: machineKeys.list(q),
    queryFn: () => fetchMachines({ q, page_size: 100 }),
    staleTime: 60_000 * 5, // 5 min — machines change rarely
  });
}

// ─── Knowledge List Hooks ─────────────────────────────────────────────────────

export function useKnowledgeList(params: KnowledgeListParams) {
  return useQuery({
    queryKey: knowledgeKeys.list(params),
    queryFn: () => fetchKnowledgeList(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ─── Knowledge Detail Hook ────────────────────────────────────────────────────

export function useKnowledgeDetail(itemId: string, versionId?: string) {
  return useQuery({
    queryKey: knowledgeKeys.detail(itemId, versionId),
    queryFn: () => fetchKnowledgeDetail(itemId, versionId),
    enabled: !!itemId,
    retry: (failureCount, error) => {
      // Never retry 404 — another expert's draft or truly missing
      if (error instanceof ApiClientError && error.status === 404) return false;
      return failureCount < 2;
    },
  });
}

// ─── Version List Hook ────────────────────────────────────────────────────────

export function useVersionList(itemId: string) {
  return useQuery({
    queryKey: knowledgeKeys.versions(itemId),
    queryFn: () => fetchVersionList(itemId),
    enabled: !!itemId,
  });
}

// ─── Create Knowledge Mutation ────────────────────────────────────────────────

export function useCreateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: KnowledgeCreateRequest) => createKnowledge(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
    },
  });
}

// ─── Update Knowledge Mutation ────────────────────────────────────────────────

export function useUpdateKnowledge(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: KnowledgeUpdateRequest) => updateKnowledge(itemId, payload),
    onSuccess: (updatedVersion) => {
      // Invalidate list and detail caches for this item
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      qc.invalidateQueries({ queryKey: knowledgeKeys.details() });
      // Also optimistically refresh the versions list
      qc.invalidateQueries({ queryKey: knowledgeKeys.versions(updatedVersion.item_id) });
    },
  });
}

// ─── Create Revision Mutation ─────────────────────────────────────────────────

export function useCreateRevision(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RevisionCreateRequest) => createRevision(itemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      qc.invalidateQueries({ queryKey: knowledgeKeys.detail(itemId) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.versions(itemId) });
    },
  });
}

export function useSubmitKnowledgeForReview(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitKnowledgeForReview(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.lists() });
      qc.invalidateQueries({ queryKey: knowledgeKeys.details() });
    },
  });
}
