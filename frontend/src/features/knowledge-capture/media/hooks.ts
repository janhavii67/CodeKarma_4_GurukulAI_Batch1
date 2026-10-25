import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaApi } from './mediaApi';
import { MediaAsset, MediaConfig } from './types';
import { UploadOptions } from './uploadWithProgress';
import { knowledgeKeys } from '../hooks';
import { ApiClientError } from '../../../lib/api/client';

export const mediaKeys = {
  all: ['media'] as const,
  config: ['media', 'config'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (versionId: string) => [...mediaKeys.lists(), versionId] as const,
};

/** Query hook to retrieve media configuration (upload limits, allowed MIME types) */
export function useMediaConfig() {
  return useQuery<MediaConfig>({
    queryKey: mediaKeys.config,
    queryFn: () => mediaApi.getConfig(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

/** Query hook to retrieve list of media assets for a given version */
export function useMediaList(versionId: string) {
  return useQuery<MediaAsset[]>({
    queryKey: mediaKeys.list(versionId),
    queryFn: () => mediaApi.list(versionId),
    enabled: Boolean(versionId),
  });
}

/** Mutation hook to upload a media asset */
export function useUploadMedia(
  versionId: string,
  onUploaded?: (media: MediaAsset) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      options,
    }: {
      file: File;
      options?: UploadOptions;
    }) => mediaApi.upload(versionId, file, options),
    onSuccess: (newAsset: MediaAsset) => {
      // Invalidate media list query
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(versionId) });
      onUploaded?.(newAsset);
    },
    onError: (error: unknown) => {
      // On 409 (version frozen / no longer editable), invalidate version details
      if (error instanceof ApiClientError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey: knowledgeKeys.details() });
      }
    },
  });
}

/** Mutation hook to delete a media asset */
export function useDeleteMedia(versionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mediaId: string) => mediaApi.delete(mediaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.list(versionId) });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiClientError) {
        if (error.status === 404) {
          // If already gone, silently refresh the list
          queryClient.invalidateQueries({ queryKey: mediaKeys.list(versionId) });
        } else if (error.status === 409) {
          // Frozen version: invalidate editor version detail
          queryClient.invalidateQueries({ queryKey: knowledgeKeys.details() });
        }
      }
    },
  });
}
