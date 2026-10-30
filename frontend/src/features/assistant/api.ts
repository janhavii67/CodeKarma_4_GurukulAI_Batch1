import { api, getApiUrl, getCsrfToken, ApiClientError } from '../../lib/api/client';
import type {
  ChatRequest,
  ChatResponse,
  Conversation,
  Feedback,
  SourceDetail,
  SourceRef,
  TutorHandoffSuggestion,
  TutorHandoffStartResponse,
  TutorMemory,
  TutorMemoryCategory,
  TutorMemoryList,
} from './types';
import { normalizeSourceRef } from './types';

export interface StreamChatCallbacks {
  onToken?: (token: string) => void;
  onStatus?: (message: string) => void;
  onSources?: (
    sources: SourceRef[],
    insufficientEvidence: boolean,
    conversationId: string,
    messageId: string,
    providerUnavailable?: boolean,
    audioAnalysis?: import('./types').AudioAnalysisResult | null,
    handoffs?: TutorHandoffSuggestion[],
    relatedMedia?: import('./types').RelatedMedia[]
  ) => void;
  onFailure?: (answer: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  conversation_id: string;
  message_id: string;
  answer: string;
  sources: SourceRef[];
  insufficient_evidence: boolean;
  provider_unavailable?: boolean;
  audio_analysis?: import('./types').AudioAnalysisResult | null;
  handoffs: TutorHandoffSuggestion[];
  related_media: import('./types').RelatedMedia[];
}

/**
 * Sends a non-streaming chat query to the AI Assistant.
 */
export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const raw = await api.post<any>('/assistant/chat', req);
  return {
    answer: raw.answer || '',
    sources: (raw.sources || []).map(normalizeSourceRef),
    insufficient_evidence: Boolean(raw.insufficient_evidence),
    provider_unavailable: Boolean(raw.provider_unavailable),
    conversation_id: raw.conversation_id,
    message_id: raw.message_id,
    audio_analysis: raw.audio_analysis ?? null,
    handoffs: raw.handoffs || [],
    related_media: Array.isArray(raw.related_media) ? raw.related_media : [],
  };
}

/**
 * Sends a streaming chat query using fetch + ReadableStream (Server-Sent Events).
 * Dispatches onToken and onSources events.
 */
export async function streamChat(
  req: ChatRequest,
  callbacks?: StreamChatCallbacks
): Promise<StreamChatResult> {
  const url = getApiUrl('/assistant/chat/stream');
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'text/event-stream');

  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(req),
    signal: callbacks?.signal,
  });

  if (!response.ok) {
    let errData: any = null;
    try {
      errData = await response.json();
    } catch {
      errData = null;
    }
    const code = errData?.error?.code || 'stream_request_failed';
    const message = errData?.error?.message || `HTTP ${response.status}: Failed to stream assistant response.`;
    throw new ApiClientError(code, message, response.status, errData?.error?.details);
  }

  if (!response.body) {
    throw new ApiClientError('no_response_body', 'ReadableStream is not supported or response body is empty.', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let accumulatedAnswer = '';
  let finalSources: SourceRef[] = [];
  let isInsufficient = false;
  let providerUnavailable = false;
  let finalConversationId = req.conversation_id || '';
  let finalMessageId = '';
  let finalAudioAnalysis: StreamChatResult['audio_analysis'] = null;
  let finalHandoffs: TutorHandoffSuggestion[] = [];
  let finalRelatedMedia: import('./types').RelatedMedia[] = [];

  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep remainder for next chunk

      let currentEvent = 'message';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = 'message';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim();

          if (currentEvent === 'token') {
            let tokenStr = rawData;
            try {
              const parsed = JSON.parse(rawData);
              tokenStr = parsed.token ?? rawData;
              if (parsed.conversation_id && !finalConversationId) {
                finalConversationId = parsed.conversation_id;
              }
              if (parsed.message_id && !finalMessageId) {
                finalMessageId = parsed.message_id;
              }
            } catch {
              tokenStr = rawData;
            }
            accumulatedAnswer += tokenStr;
            callbacks?.onToken?.(tokenStr);
          } else if (currentEvent === 'failure') {
            try {
              const parsed = JSON.parse(rawData);
              accumulatedAnswer = parsed.answer || 'The AI assistant is temporarily unavailable. Please try again shortly.';
              providerUnavailable = true;
              if (parsed.conversation_id) finalConversationId = parsed.conversation_id;
              if (parsed.message_id) finalMessageId = parsed.message_id;
              callbacks?.onFailure?.(accumulatedAnswer);
            } catch {
              accumulatedAnswer = 'The AI assistant is temporarily unavailable. Please try again shortly.';
              providerUnavailable = true;
              callbacks?.onFailure?.(accumulatedAnswer);
            }
          } else if (currentEvent === 'status') {
            try {
              callbacks?.onStatus?.(JSON.parse(rawData).message || 'Working on your answer…');
            } catch {
              callbacks?.onStatus?.('Working on your answer…');
            }
          } else if (currentEvent === 'sources') {
            try {
              const parsed = JSON.parse(rawData);
              const normalized = (parsed.sources || []).map(normalizeSourceRef);
              finalSources = normalized;
              isInsufficient = Boolean(parsed.insufficient_evidence);
              providerUnavailable = Boolean(parsed.provider_unavailable) || providerUnavailable;
              if (parsed.conversation_id) {
                finalConversationId = parsed.conversation_id;
              }
              if (parsed.message_id) {
                finalMessageId = parsed.message_id;
              }
              finalAudioAnalysis = parsed.audio_analysis ?? null;
              finalHandoffs = Array.isArray(parsed.handoffs) ? parsed.handoffs : [];
              finalRelatedMedia = Array.isArray(parsed.related_media) ? parsed.related_media : [];
              callbacks?.onSources?.(normalized, isInsufficient, finalConversationId, finalMessageId, providerUnavailable, finalAudioAnalysis, finalHandoffs, finalRelatedMedia);
            } catch (err) {
              console.warn('[streamChat] Failed to parse sources payload:', err);
            }
          } else if (currentEvent === 'done') {
            // End of stream signal
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    conversation_id: finalConversationId,
    message_id: finalMessageId,
    answer: accumulatedAnswer,
    sources: finalSources,
    insufficient_evidence: isInsufficient,
    provider_unavailable: providerUnavailable,
    audio_analysis: finalAudioAnalysis,
    handoffs: finalHandoffs,
    related_media: finalRelatedMedia,
  };
}

/**
 * Lists conversations owned by the authenticated user.
 */
export async function listConversations(): Promise<Conversation[]> {
  return api.get<Conversation[]>('/assistant/conversations');
}

/**
 * Retrieves a conversation and its turn-by-turn messages.
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
  const raw = await api.get<any>(`/assistant/conversations/${conversationId}`);
  return {
    ...raw,
    messages: (raw.messages || []).map((m: any) => ({
      ...m,
      sources: (m.sources || []).map(normalizeSourceRef),
      handoffs: Array.isArray(m.handoffs) ? m.handoffs : [],
      related_media: Array.isArray(m.related_media) ? m.related_media : [],
    })),
  };
}

/**
 * Deletes a conversation owned by the authenticated user.
 */
export async function deleteConversation(conversationId: string): Promise<{ status: string; id: string }> {
  return api.delete<{ status: string; id: string }>(`/assistant/conversations/${conversationId}`);
}

export async function listTutorMemories(): Promise<TutorMemoryList> {
  return api.get<TutorMemoryList>('/assistant/memories');
}

export async function createTutorMemory(category: TutorMemoryCategory, content: string): Promise<TutorMemory> {
  return api.post<TutorMemory>('/assistant/memories', { category, content });
}

export async function updateTutorMemory(
  id: string,
  updates: { category?: TutorMemoryCategory; content?: string },
): Promise<TutorMemory> {
  return api.patch<TutorMemory>(`/assistant/memories/${encodeURIComponent(id)}`, updates);
}

export async function deleteTutorMemory(id: string): Promise<{ status: string; id: string }> {
  return api.delete<{ status: string; id: string }>(`/assistant/memories/${encodeURIComponent(id)}`);
}

export async function clearTutorMemories(): Promise<{ status: string; deleted_count: number }> {
  return api.delete<{ status: string; deleted_count: number }>('/assistant/memories');
}

/**
 * Submits triage feedback on an assistant message.
 */
export async function submitFeedback(feedback: Feedback): Promise<Feedback> {
  return api.post<Feedback>('/assistant/feedback', feedback);
}

/**
 * Inspects published knowledge source details and active chunks.
 */
export async function getSource(sourceId: string): Promise<SourceDetail> {
  return api.get<SourceDetail>(`/assistant/sources/${sourceId}`);
}

export async function startTutorHandoff(
  handoff: TutorHandoffSuggestion,
  conversationId: string,
  messageId: string,
): Promise<TutorHandoffStartResponse> {
  return api.post<TutorHandoffStartResponse>(
    `/assistant/handoffs/${handoff.kind}/${encodeURIComponent(handoff.target_id)}/start`,
    { conversation_id: conversationId, message_id: messageId },
  );
}
