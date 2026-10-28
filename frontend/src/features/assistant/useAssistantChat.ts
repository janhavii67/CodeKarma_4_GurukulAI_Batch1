import { useState, useRef, useCallback } from 'react';
import type {
  ChatRequest,
  ChatState,
  Conversation,
  Message,
  SourceRef,
  TutorHandoffSuggestion,
} from './types';
import { sendChat, streamChat } from './api';

export interface UseAssistantChatOptions {
  initialConversationId?: string;
  defaultMachineId?: string;
  onError?: (err: Error) => void;
  onFinish?: (assistantMessage: Message) => void;
}

export interface UseAssistantChatReturn {
  messages: Message[];
  state: ChatState;
  isStreaming: boolean;
  progressMessage: string;
  error: Error | null;
  conversationId: string | null;
  sources: SourceRef[];
  machineId: string | null;
  setMachineId: (id: string | null) => void;
  sendMessage: (question: string, sendOptions?: { machineId?: string; audioAnalysisJobId?: string }) => Promise<boolean>;
  cancel: () => void;
  clearMessages: () => void;
  loadConversation: (conv: Conversation) => void;
  setConversationId: (id: string | null) => void;
  appendLocalMessages: (items: Message[]) => void;
  updateLocalMessage: (id: string, updates: Partial<Message>) => void;
  removeLocalMessage: (id: string) => void;
}

/**
 * React hook for managing AI Assistant conversations and SSE streaming.
 * Keeps conversation state purely in-memory (no localStorage).
 * Supports cancellation via AbortController and automatic fallback to
 * non-streaming chat if SSE fails.
 */
export function useAssistantChat(
  options: UseAssistantChatOptions = {}
): UseAssistantChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ChatState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(
    options.initialConversationId || null
  );
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [machineId, setMachineId] = useState<string | null>(
    options.defaultMachineId || null
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState('idle');
  }, []);

  const clearMessages = useCallback(() => {
    cancel();
    setMessages([]);
    setState('idle');
    setError(null);
    setSources([]);
  }, [cancel]);

  const loadConversation = useCallback(
    (conv: Conversation) => {
      cancel();
      setConversationId(conv.id);
      setMachineId(conv.machine_id ?? null);
      setMessages(conv.messages || []);
      setState('idle');
      setError(null);
    },
    [cancel]
  );

  const appendLocalMessages = useCallback((items: Message[]) => {
    setMessages((prev) => [...prev, ...items]);
  }, []);

  const updateLocalMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((message) => message.id === id ? { ...message, ...updates } : message));
  }, []);

  const removeLocalMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  }, []);

  const sendMessage = useCallback(
    async (question: string, sendOptions?: { machineId?: string; audioAnalysisJobId?: string }): Promise<boolean> => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion || state === 'streaming') {
        return false;
      }

      setError(null);
      setState('streaming');
      setProgressMessage('Searching approved knowledge…');

      // 1. Prepare optimistic user message and placeholder assistant message
      const userMsgId = `user-${Date.now()}`;
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: cleanQuestion,
        created_at: new Date().toISOString(),
      };

      const assistantPlaceholderId = `asst-${Date.now()}`;
      const assistantPlaceholder: Message = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        is_ai_generated: true,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);

      // 2. Set up abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const targetMachineId = sendOptions?.machineId || machineId || undefined;
      const chatReq: ChatRequest = {
        message: cleanQuestion,
        conversation_id: conversationId || undefined,
        machine_id: targetMachineId,
        audio_analysis_job_id: sendOptions?.audioAnalysisJobId,
      };

      let accumulatedText = '';
      let receivedSources: SourceRef[] = [];
      let receivedHandoffs: TutorHandoffSuggestion[] = [];
      let isInsufficient = false;
      let finalConvId = conversationId;
      let finalMsgId = assistantPlaceholderId;

      try {
        // 3. Attempt Server-Sent Events stream
        const streamRes = await streamChat(chatReq, {
          signal: controller.signal,
          onToken: (tok) => {
            setProgressMessage('Writing your grounded answer…');
            accumulatedText += tok;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId ? { ...m, content: accumulatedText } : m
              )
            );
          },
          onFailure: (answer) => {
            accumulatedText = answer;
            setMessages((prev) => prev.map((m) => m.id === assistantPlaceholderId
              ? { ...m, content: answer, provider_unavailable: true, evidence_status: 'n_a', sources: [] }
              : m));
          },
          onStatus: setProgressMessage,
          onSources: (srcs, insufficient, cId, mId, providerUnavailable, audioAnalysis, handoffs) => {
            receivedSources = srcs;
            receivedHandoffs = handoffs || [];
            isInsufficient = insufficient;
            if (cId) finalConvId = cId;
            if (mId) finalMsgId = mId;
            setSources(srcs);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? {
                      ...m,
                      id: mId || m.id,
                      sources: srcs,
                      evidence_status: providerUnavailable || (audioAnalysis && audioAnalysis.status !== 'MATCHED')
                        ? 'n_a'
                        : insufficient ? 'insufficient' : 'sufficient',
                      provider_unavailable: providerUnavailable,
                      audio_analysis: audioAnalysis ?? null,
                      handoffs: receivedHandoffs,
                    }
                  : m
              )
            );
          },
        });

        if (streamRes.conversation_id) {
          setConversationId(streamRes.conversation_id);
        }
        if (streamRes.sources) {
          setSources(streamRes.sources);
        }

        const isInsufficientFinal = streamRes.insufficient_evidence ?? isInsufficient;
        const finalAssistantMsg: Message = {
          id: streamRes.message_id || finalMsgId,
          conversation_id: streamRes.conversation_id || finalConvId || undefined,
          role: 'assistant',
          content: streamRes.answer || accumulatedText,
          is_ai_generated: true,
          evidence_status: streamRes.provider_unavailable || (streamRes.audio_analysis && streamRes.audio_analysis.status !== 'MATCHED')
            ? 'n_a'
            : isInsufficientFinal ? 'insufficient' : 'sufficient',
          provider_unavailable: streamRes.provider_unavailable,
          sources: streamRes.provider_unavailable ? [] : streamRes.sources?.length ? streamRes.sources : receivedSources,
          audio_analysis: streamRes.audio_analysis ?? null,
          handoffs: streamRes.handoffs || receivedHandoffs,
          created_at: new Date().toISOString(),
        };

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantPlaceholderId ? finalAssistantMsg : m))
        );

        if (streamRes.provider_unavailable) {
          setState('idle');
        } else if (isInsufficientFinal) {
          setState('insufficient_evidence');
        } else {
          setState('idle');
        }

        options.onFinish?.(finalAssistantMsg);
        setProgressMessage('');
        return true;
      } catch (streamErr: any) {
        // If aborted by user, reset state and exit
        if (controller.signal.aborted || streamErr?.name === 'AbortError') {
          setState('idle');
          return false;
        }

        // 4. Fallback to non-streaming endpoint if streaming fails
        console.warn(
          '[useAssistantChat] Streaming failed, falling back to non-streaming endpoint...',
          streamErr
        );

        try {
          const fallbackRes = await sendChat(chatReq);
          if (fallbackRes.conversation_id) {
            setConversationId(fallbackRes.conversation_id);
          }
          setSources(fallbackRes.sources);

          const fallbackMsg: Message = {
            id: fallbackRes.message_id,
            conversation_id: fallbackRes.conversation_id,
            role: 'assistant',
            content: fallbackRes.answer,
            is_ai_generated: true,
            evidence_status: fallbackRes.provider_unavailable || (fallbackRes.audio_analysis && fallbackRes.audio_analysis.status !== 'MATCHED')
              ? 'n_a'
              : fallbackRes.insufficient_evidence ? 'insufficient' : 'sufficient',
            provider_unavailable: fallbackRes.provider_unavailable,
            sources: fallbackRes.sources,
            audio_analysis: fallbackRes.audio_analysis ?? null,
            handoffs: fallbackRes.handoffs || [],
            created_at: new Date().toISOString(),
          };

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantPlaceholderId ? fallbackMsg : m))
          );

          if (fallbackRes.provider_unavailable) {
            setState('idle');
          } else if (fallbackRes.insufficient_evidence) {
            setState('insufficient_evidence');
          } else {
            setState('idle');
          }

          options.onFinish?.(fallbackMsg);
          return true;
        } catch (fallbackErr: any) {
          const finalErr =
            fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
          setError(finalErr);
          setState('error');
          options.onError?.(finalErr);
          return false;
        }
      } finally {
        abortControllerRef.current = null;
        setProgressMessage('');
      }
    },
    [conversationId, machineId, state, options]
  );

  return {
    messages,
    state,
    isStreaming: state === 'streaming',
    progressMessage,
    error,
    conversationId,
    sources,
    machineId,
    setMachineId,
    sendMessage,
    cancel,
    clearMessages,
    loadConversation,
    setConversationId,
    appendLocalMessages,
    updateLocalMessage,
    removeLocalMessage,
  };
}
