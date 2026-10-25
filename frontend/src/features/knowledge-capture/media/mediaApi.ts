import { api } from '../../../lib/api/client';
import { MediaAsset, MediaConfig } from './types';
import { uploadWithProgress, UploadOptions } from './uploadWithProgress';

export const mediaApi = {
  /** Fetch media config with upload limits and allowed MIME types */
  getConfig(): Promise<MediaConfig> {
    return api.get<MediaConfig>('/media/config');
  },

  /** List media assets attached to a visible knowledge version */
  list(versionId: string): Promise<MediaAsset[]> {
    return api.get<MediaAsset[]>(`/knowledge-versions/${versionId}/media`);
  },

  /** Delete a media asset by ID */
  delete(id: string): Promise<void> {
    return api.delete<void>(`/media/${id}`);
  },

  /** Upload a media asset attached to an editable knowledge version with progress */
  upload(versionId: string, file: File, options?: UploadOptions): Promise<MediaAsset> {
    return uploadWithProgress(versionId, file, options);
  },
};
