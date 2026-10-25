export type MediaKind = 'audio' | 'video' | 'image' | 'document';

export interface MediaAsset {
  id: string;
  version_id: string;
  kind: MediaKind | string;
  original_name: string;
  mime: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  url?: string | null;
}

export interface MediaConfig {
  max_upload_bytes: number;
  allowed_mime_types: Record<string, string[]>;
  max_media_per_version: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  isProcessing: boolean;
}

export type QueueItemStatus = 'queued' | 'uploading' | 'processing' | 'failed' | 'done';

export interface QueueItem {
  id: string;
  file: File;
  status: QueueItemStatus;
  progress: number; // 0 - 100
  isProcessing: boolean;
  error?: string | null;
  abortController?: AbortController;
}
