/**
 * Type definitions for AI Knowledge Assistant (Module 02)
 */

export interface SourceRef {
  title: string;
  type: string;
  version?: string | number;
  section?: string;
  timestamp?: string;
  url?: string;
  chunk_id?: string;
  source_id?: string;
  snippet?: string;
  score?: number;
  rank?: number;
  machine_id?: string | null;
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  is_ai_generated?: boolean;
  provider_unavailable?: boolean;
  evidence_status?: 'sufficient' | 'insufficient' | 'conflict' | 'clarification_needed' | 'n_a';
  sources?: SourceRef[];
  audio_analysis?: AudioAnalysisResult | null;
  attachment?: TutorAttachment | null;
  handoffs?: TutorHandoffSuggestion[];
  related_media?: RelatedMedia[];
  created_at?: string;
}

export interface TutorAttachment {
  media_id?: string;
  filename: string;
  mime: string;
  size_bytes?: number;
  url?: string;
  /** Temporary object URL used only while an upload is in the current browser session. */
  preview_url?: string;
}

export interface TutorHandoffSuggestion {
  kind: 'workflow' | 'troubleshooting';
  target_id: string;
  title: string;
  reason: string;
}

export interface AudioKnowledgeCitation {
  knowledge_item_id: string;
  knowledge_version_id: string;
  title: string;
  version_no?: number;
  source_type?: string;
}

export interface AudioMatchCandidate {
  reference_id: string;
  title: string;
  machine_id?: string | null;
  machine_name?: string | null;
  model_name?: string | null;
  component?: string | null;
  operation?: string | null;
  operating_conditions?: string | null;
  interpretation: string;
  similarity_score: number;
  knowledge_version_id: string;
  knowledge_item_id?: string | null;
  knowledge_sources: AudioKnowledgeCitation[];
}

export interface AudioAnalysisResult {
  id: string;
  status: string;
  matched_reference?: AudioMatchCandidate | null;
  similarity_score?: number | null;
  reason_code: string;
  message: string;
  limitation: string;
  requires_expert_review: boolean;
  candidate_matches: AudioMatchCandidate[];
  review_status?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  status: string;
  machine_id?: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  messages?: Message[];
}

export type FeedbackReason =
  | 'incorrect'
  | 'missing_source'
  | 'outdated'
  | 'irrelevant'
  | 'conflicting'
  | 'insufficient';

export interface Feedback {
  id?: string;
  message_id: string;
  user_id?: string;
  rating?: number;
  reason: FeedbackReason;
  comment?: string;
  status?: string;
  created_at?: string;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  machine_id?: string;
  audio_analysis_job_id?: string;
}

export interface RawBackendSourceItem {
  chunk_id: string;
  source_id: string;
  title: string;
  section_label?: string | null;
  snippet: string;
  score: number;
  rank: number;
  source_type: string;
  machine_id?: string | null;
}

export interface ChatResponse {
  answer: string;
  sources: SourceRef[];
  insufficient_evidence: boolean;
  provider_unavailable?: boolean;
  conversation_id: string;
  message_id: string;
  audio_analysis?: AudioAnalysisResult | null;
  attachment?: TutorAttachment | null;
  handoffs?: TutorHandoffSuggestion[];
  related_media?: RelatedMedia[];
}

export interface TutorHandoffStartResponse {
  kind: 'workflow' | 'troubleshooting';
  session_id: string;
  title: string;
  resumed: boolean;
}

export interface SourceChunkItem {
  id: string;
  chunk_index: number;
  text: string;
  section_label?: string | null;
  timestamp_start?: number | null;
  timestamp_end?: number | null;
}

export interface SourceDetail {
  id: string;
  title: string;
  source_type: string;
  source_ref_id: string;
  status: string;
  machine_id?: string | null;
  indexed_at: string;
  chunks: SourceChunkItem[];
}

export type ChatState = 'idle' | 'streaming' | 'error' | 'insufficient_evidence';

export function normalizeSourceRef(raw: any): SourceRef {
  const sourceId = raw.source_id || raw.id;
  const timestamp =
    raw.timestamp ||
    (raw.timestamp_start !== undefined && raw.timestamp_end !== undefined
      ? `${Number(raw.timestamp_start).toFixed(1)}s - ${Number(raw.timestamp_end).toFixed(1)}s`
      : undefined);

  return {
    chunk_id: raw.chunk_id || raw.id,
    source_id: sourceId,
    title: raw.title || 'Knowledge Reference',
    type: raw.type || raw.source_type || 'knowledge_version',
    version: raw.version || 'v1',
    section: raw.section || raw.section_label || undefined,
    timestamp,
    url: raw.url || (sourceId ? `/app/knowledge/${sourceId}` : undefined),
    snippet: raw.snippet || raw.text || '',
    score: typeof raw.score === 'number' ? raw.score : undefined,
    rank: typeof raw.rank === 'number' ? raw.rank : undefined,
    machine_id: raw.machine_id ?? null,
  };
}

/** A file attached to the knowledge an answer cites; never generated by the tutor. */
export interface RelatedMedia {
  id: string;
  title: string;
  kind: string;
  mime?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  url: string;
  source_id: string;
  source_title: string;
}
