import { api, getCsrfToken } from '../../lib/api/client';

export interface MediaAsset {
  id: string;
  title: string;
  description?: string;
  machine_id?: string;
  version_id?: string;
  kind: string;
  file_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds?: number;
  uploaded_by: string;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  type: string;
  media_id: string;
  version_id?: string;
  status: 'queued' | 'processing' | 'needs_review' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error_safe?: string;
  attempts: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  transcript_id: string;
  idx: number;
  start_s: number;
  end_s: number;
  original_text: string;
  edited_text?: string;
  needs_review: boolean;
}

export interface Transcript {
  id: string;
  media_id: string;
  version_id?: string;
  language: string;
  provider: string;
  full_text: string;
  status: string;
  created_at: string;
  segments: TranscriptSegment[];
}

export interface StepDraft {
  title: string;
  instruction: string;
  tools: string[];
  safety_warning?: string;
  expected_result?: string;
  stop_condition?: string;
  source_segment_ids: number[];
  needs_review: boolean;
  note?: string;
}

export interface VectorSearchResultItem {
  id: string;
  source_type: string;
  source_id: string;
  chunk_text: string;
  similarity_score: number;
  media_id?: string;
  media_title?: string;
  file_path?: string;
  version_id?: string;
  machine_id?: string;
  start_s?: number;
  end_s?: number;
  metadata: Record<string, any>;
}

export interface VectorSearchResponse {
  query: string;
  total: number;
  results: VectorSearchResultItem[];
}

export interface VoiceUploadResponse {
  media: MediaAsset;
  job: ProcessingJob;
}

export async function uploadVoiceNarration(
  file: File | Blob,
  title?: string,
  machineId?: string,
  versionId?: string,
  filename: string = 'recording.webm'
): Promise<VoiceUploadResponse> {
  const formData = new FormData();
  formData.append('file', file, filename);
  if (title) formData.append('title', title);
  if (machineId) formData.append('machine_id', machineId);
  if (versionId) formData.append('version_id', versionId);

  const csrfToken = getCsrfToken();
  const headers: HeadersInit = {};
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch('/api/v1/voice/upload', {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Upload failed with status ${response.status}`);
  }

  return response.json();
}

export async function getProcessingJob(jobId: string): Promise<ProcessingJob> {
  return api.get<ProcessingJob>(`/processing-jobs/${jobId}`);
}

export async function retryProcessingJob(jobId: string): Promise<ProcessingJob> {
  return api.post<ProcessingJob>(`/processing-jobs/${jobId}/retry`);
}

export async function listVoiceAssets(machineId?: string): Promise<MediaAsset[]> {
  const query = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';
  return api.get<MediaAsset[]>(`/voice/assets${query}`);
}

export async function getVoiceAsset(mediaId: string): Promise<MediaAsset> {
  return api.get<MediaAsset>(`/voice/assets/${mediaId}`);
}

export async function getVersionTranscript(versionId: string): Promise<Transcript> {
  return api.get<Transcript>(`/voice/knowledge-versions/${versionId}/transcript`);
}

export async function patchSegment(
  transcriptId: string,
  segmentId: string,
  editedText?: string,
  needsReview?: boolean
): Promise<TranscriptSegment> {
  return api.patch<TranscriptSegment>(`/voice/transcripts/${transcriptId}/segments/${segmentId}`, {
    edited_text: editedText,
    needs_review: needsReview,
  });
}

export async function searchVectorKnowledge(
  query: string,
  topK: number = 5,
  machineId?: string
): Promise<VectorSearchResponse> {
  return api.post<VectorSearchResponse>('/voice/search', {
    query,
    top_k: topK,
    machine_id: machineId || undefined,
  });
}
