import React, { useEffect, useState, useRef } from 'react';
import {
  Send,
  Square,
  Bot,
  AlertCircle,
  Menu,
  ShieldCheck,
  AudioLines,
  Paperclip,
  LoaderCircle,
  Brain,
} from 'lucide-react';
import { ConversationList } from './components/ConversationList';
import { MessageList } from './components/MessageList';
import { MachineContextFilter, type MachineOption } from './components/MachineContextFilter';
import { SourceDetailDrawer } from './components/SourceDetailDrawer';
import { TutorMemoryPanel } from './components/TutorMemoryPanel';
import { useAssistantChat } from './useAssistantChat';
import { listConversations, getConversation, deleteConversation } from './api';
import { api } from '../../lib/api/client';
import type { ChatResponse, Conversation } from './types';

const MAX_MEDIA_UPLOAD_BYTES = 14 * 1024 * 1024;
const SYNTHETIC_DEMO_MARKER = 'SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION';

interface SyntheticDemoQuestion {
  id: string;
  question: string;
  expected_grounded_answer: string;
  expects_evidence: boolean;
}

const getMediaMime = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeByExtension: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/m4a',
    aac: 'audio/aac', aiff: 'audio/aiff', aif: 'audio/aiff', ogg: 'audio/ogg', opus: 'audio/opus', m4b: 'audio/mp4', m4p: 'audio/mp4',
    mp4: 'video/mp4', mov: 'video/mov', qt: 'video/quicktime', webm: 'video/webm', avi: 'video/avi', flv: 'video/x-flv', mpeg: 'video/mpeg', mpg: 'video/mpeg', wmv: 'video/wmv', '3gp': 'video/3gpp',
    pdf: 'application/pdf',
  };
  return (extension && mimeByExtension[extension]) || 'application/octet-stream';
};

export const AssistantPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
  const [tutorMemoryCount, setTutorMemoryCount] = useState(0);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isAudioAnalyzing, setIsAudioAnalyzing] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string>('');
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [syntheticQuestions, setSyntheticQuestions] = useState<SyntheticDemoQuestion[]>([]);
  const [syntheticQuestionsLoading, setSyntheticQuestionsLoading] = useState(false);
  const [syntheticQuestionsError, setSyntheticQuestionsError] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());

  const makeLocalAttachment = (file: File) => {
    let previewUrl: string | undefined;
    if (typeof URL.createObjectURL === 'function') {
      previewUrl = URL.createObjectURL(file);
      localPreviewUrlsRef.current.add(previewUrl);
    }
    return {
      filename: file.name,
      mime: getMediaMime(file),
      size_bytes: file.size,
      ...(previewUrl ? { preview_url: previewUrl } : {}),
    };
  };

  const releaseLocalPreview = (previewUrl?: string) => {
    if (!previewUrl || !localPreviewUrlsRef.current.delete(previewUrl)) return;
    URL.revokeObjectURL(previewUrl);
  };

  const releaseAllLocalPreviews = () => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  };

  const {
    messages,
    state,
    isStreaming,
    progressMessage,
    error,
    conversationId,
    machineId,
    setMachineId,
    sendMessage,
    cancel,
    clearMessages,
    loadConversation,
    setConversationId,
    appendLocalMessages,
    updateLocalMessage,
  } = useAssistantChat();

  const selectedMachine = machineOptions.find((machine) => machine.id === machineId);
  const syntheticDemoSelected = Boolean(
    selectedMachine?.is_demo && selectedMachine.code?.startsWith('SYNTH-DEMO-'),
  );

  const fetchHistory = async () => {
    setLoadingConversations(true);
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      console.warn('Failed to load conversation history:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => () => releaseAllLocalPreviews(), []);

  useEffect(() => {
    let isMounted = true;
    if (!syntheticDemoSelected || !machineId) {
      setSyntheticQuestions([]);
      setSyntheticQuestionsError('');
      return () => { isMounted = false; };
    }
    setSyntheticQuestionsLoading(true);
    setSyntheticQuestionsError('');
    api.get<{ label: string; questions: SyntheticDemoQuestion[] }>(
      `/assistant/synthetic-demo/questions?machine_id=${encodeURIComponent(machineId)}`,
    ).then((result) => {
      if (isMounted) setSyntheticQuestions(result.questions || []);
    }).catch((err) => {
      if (isMounted) setSyntheticQuestionsError(err instanceof Error ? err.message : 'Could not load synthetic sample questions.');
    }).finally(() => {
      if (isMounted) setSyntheticQuestionsLoading(false);
    });
    return () => { isMounted = false; };
  }, [machineId, syntheticDemoSelected]);

  // When conversation finishes or updates, refresh sidebar list
  useEffect(() => {
    if (state === 'idle' && messages.length > 0) {
      fetchHistory();
    }
  }, [state, messages.length]);

  const handleSelectConversation = async (id: string) => {
    setIsSidebarOpenMobile(false);
    setAudioError('');
    try {
      const fullConv = await getConversation(id);
      releaseAllLocalPreviews();
      loadConversation(fullConv);
    } catch (err) {
      console.warn('Failed to load conversation details:', err);
    }
  };

  const handleNewChat = () => {
    releaseAllLocalPreviews();
    clearMessages();
    setAudioError('');
    setIsSidebarOpenMobile(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversationId === id) {
      releaseAllLocalPreviews();
      clearMessages();
    }
  };

  const handleSend = async () => {
    const text = inputMessage.trim();
    if (!text || isStreaming || isAudioAnalyzing) return;

    setInputMessage('');
    await sendMessage(text);
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const isVoiceQuestionUpload = event.currentTarget === audioInputRef.current;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const isAudioFile = file.type.toLowerCase().startsWith('audio/') || /\.(wav|flac|mp3|m4a|aac|aiff|aif|ogg|opus|weba)$/i.test(file.name);
    const isSupportedVoiceFormat = /\.(wav|flac|mp3|m4a|aac|aiff|aif|ogg|opus|weba)$/i.test(file.name);
    const isSupportedMediaFormat = /\.(webm|mp4|mov|avi|flv|mpeg|mpg|wmv|3gp|bmp|png|jpe?g|webp|pdf|docx|pptx|xlsx|csv|txt|md)$/i.test(file.name);
    if (isVoiceQuestionUpload ? !isSupportedVoiceFormat : isAudioFile || !isSupportedMediaFormat) {
      setAudioError(isVoiceQuestionUpload
        ? 'Choose a supported audio file containing your spoken question.'
        : 'Choose a supported video, image, or document. Use Ask by voice for spoken questions.');
      return;
    }
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      setAudioError(isVoiceQuestionUpload
        ? 'Voice-question uploads must be 14 MB or smaller and no longer than 120 seconds.'
        : 'AI Tutor attachments must be 14 MB or smaller.');
      return;
    }
    if (isStreaming || isAudioAnalyzing) return;

    const question = inputMessage.trim();
    setInputMessage('');
    setAudioError('');
    setIsAudioAnalyzing(true);
    const timestamp = Date.now();
    const userMessageId = `media-user-${timestamp}`;
    const resultMessageId = `media-asst-${timestamp}`;
    const now = new Date().toISOString();
    const localAttachment = makeLocalAttachment(file);
    appendLocalMessages([
      {
        id: userMessageId,
        role: 'user',
        content: question || (isVoiceQuestionUpload ? 'Transcribing your spoken question…' : 'Please analyze this attachment in relation to approved knowledge.'),
        attachment: localAttachment,
        created_at: now,
      },
      {
        id: resultMessageId,
        role: 'assistant',
        content: 'Reading the attachment…',
        is_ai_generated: true,
        evidence_status: 'n_a',
        created_at: now,
      },
    ]);

    const progressSteps = isVoiceQuestionUpload
      ? ['Transcribing your spoken question…', 'Finding relevant expert knowledge…', 'Preparing a cited answer…']
      : ['Reading the attachment…', 'Finding related approved knowledge…', 'Preparing a cited answer…'];
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, progressSteps.length - 1);
      updateLocalMessage(resultMessageId, { content: progressSteps[progressIndex] });
    }, 2400);

    try {
      const form = new FormData();
      form.append('file', file);
      if (question) form.append('message', question);
      if (conversationId) form.append('conversation_id', conversationId);
      if (machineId) form.append('machine_id', machineId);
      const result = await api.postForm<ChatResponse>('/assistant/chat/media', form);
      setConversationId(result.conversation_id);
      if (result.attachment) releaseLocalPreview(localAttachment.preview_url);
      const userContent = result.audio_transcript
        ? question
          ? `Typed prompt: ${question}\n\nVoice transcript: ${result.audio_transcript}`
          : result.audio_transcript
        : question || (isVoiceQuestionUpload ? 'Spoken question attached.' : 'Please analyze this attachment in relation to approved knowledge.');
      updateLocalMessage(userMessageId, { content: userContent, attachment: result.attachment || localAttachment });
      updateLocalMessage(resultMessageId, {
        id: result.message_id,
        conversation_id: result.conversation_id,
        content: result.answer,
        evidence_status: result.provider_unavailable ? 'n_a' : result.insufficient_evidence ? 'insufficient' : 'sufficient',
        provider_unavailable: result.provider_unavailable,
        sources: result.sources,
        handoffs: result.handoffs || [],
        related_media: result.related_media || [],
      });
      fetchHistory();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'The attachment could not be analyzed.';
      updateLocalMessage(resultMessageId, {
        content: `I couldn't analyze ${file.name}: ${message}`,
        evidence_status: 'n_a',
      });
    } finally {
      window.clearInterval(progressTimer);
      setIsAudioAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectSuggestion = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className="h-[calc(100dvh-10.25rem)] overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50/50 to-slate-100 p-0 md:p-3">
      <div className="mx-auto flex h-full w-full max-w-[1800px] overflow-hidden border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 md:rounded-3xl">
      {/* Left Column: Conversation History Sidebar (Desktop) */}
      <aside className="hidden md:flex w-72 lg:w-80 h-full shrink-0 flex-col border-r border-slate-200 bg-white">
        <ConversationList
          conversations={conversations}
          activeConversationId={conversationId}
          loading={loadingConversations}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRefresh={fetchHistory}
        />
      </aside>

      {/* Mobile Drawer Sidebar Overlay */}
      {isSidebarOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setIsSidebarOpenMobile(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[84%] bg-white shadow-2xl">
            <ConversationList
              conversations={conversations}
              activeConversationId={conversationId}
              loading={loadingConversations}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
              onDeleteConversation={handleDeleteConversation}
              onRefresh={fetchHistory}
            />
          </div>
        </div>
      )}

      {/* Right Column: Chat Interface */}
      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#f7faff]">
        {/* Top Control Bar */}
        <header className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpenMobile(true)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 md:hidden"
              title="Open conversations history"
              aria-label="Open conversations history"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-900/15">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="truncate text-sm font-bold leading-tight text-slate-900 sm:text-base">
                    Gurukul AI Tutor
                  </h1>
                  <span className="hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
                    <ShieldCheck className="h-3 w-3" />
                    Evidence grounded
                  </span>
                  {syntheticDemoSelected && <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-extrabold text-amber-950">SYNTHETIC DEMO ONLY</span>}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span className="truncate">Ask about procedures, machines, and approved knowledge</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMemoryPanelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100"
              aria-label="Manage Tutor memory"
              title="Manage what the Tutor remembers across chats"
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Memory{tutorMemoryCount ? ` · ${tutorMemoryCount}` : ''}</span>
            </button>
            <MachineContextFilter
              selectedMachineId={machineId}
              onSelectMachine={setMachineId}
              onMachinesLoaded={setMachineOptions}
              disabled={isStreaming}
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
              >
                <span className="text-base leading-none">+</span>
                <span>New chat</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Error Notice if active */}
        {error && (
          <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:mx-5 lg:mx-7">
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error.message || 'An error occurred while communicating with the assistant.'}</span>
            </div>
            <button
              type="button"
              onClick={() => handleSend()}
              className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {syntheticDemoSelected && (
          <section aria-label="Synthetic Tutor demo" className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 sm:mx-5 lg:mx-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-extrabold tracking-wide text-amber-950">{SYNTHETIC_DEMO_MARKER}</p>
                <p className="mt-0.5 text-[10px] text-amber-900">Fictional source-review examples only. No machine operating or clinical guidance.</p>
              </div>
              {syntheticQuestionsLoading && <span className="text-[10px] text-amber-900">Loading sample questions…</span>}
            </div>
            {syntheticQuestionsError && <p role="alert" className="mt-2 text-xs text-rose-800">{syntheticQuestionsError}</p>}
            {syntheticQuestions.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {syntheticQuestions.map((sample) => (
                <div key={sample.id} className="min-w-0 rounded-lg border border-amber-200 bg-white p-2">
                  <button type="button" disabled={isStreaming} onClick={() => void sendMessage(sample.question)} className="w-full text-left text-[11px] font-semibold text-slate-800 hover:text-blue-700 disabled:opacity-50">
                    {sample.expects_evidence ? 'Try grounded example: ' : 'Try missing-evidence example: '}{sample.question}
                  </button>
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[10px] font-semibold text-amber-900">Expected demo behavior</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600">{sample.expected_grounded_answer}</p>
                  </details>
                </div>
              ))}
            </div>}
          </section>
        )}

        {/* Messages Scroll Area */}
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          progressMessage={progressMessage}
          onSelectSuggestion={handleSelectSuggestion}
          onSelectSource={(srcId) => setActiveSourceId(srcId)}
        />

        {/* Bottom Input Area */}
        <footer className="shrink-0 border-t border-slate-200/80 bg-white px-3 py-3 sm:px-5 lg:px-7">
          <div className="mx-auto max-w-5xl space-y-2">
            {audioError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{audioError}</p>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about SOPs, machines, and expert knowledge, or upload a voice question..."
                rows={2}
                disabled={isStreaming || isAudioAnalyzing}
                className="max-h-36 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-0 disabled:opacity-50"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-2">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept=".wav,.flac,.mp3,.m4a,.aac,.aiff,.aif,.ogg,.opus,.weba,audio/wav,audio/flac,audio/mpeg,audio/aac,audio/aiff,audio/ogg,audio/opus"
                  aria-label="Upload spoken question audio"
                  className="sr-only"
                  onChange={handleMediaUpload}
                />
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/avi,video/x-flv,video/mpeg,video/wmv,video/3gpp,video/webm,image/bmp,image/png,image/jpeg,image/webp,application/pdf,.mov,.avi,.flv,.mpeg,.mpg,.wmv,.3gp,.docx,.pptx,.xlsx,text/csv,text/plain,.md"
                  aria-label="Select media or document file"
                  className="sr-only"
                  onChange={handleMediaUpload}
                />
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isStreaming || isAudioAnalyzing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 sm:px-3"
                  title="Attach a video, image, or document (14 MB max)"
                  aria-label="Attach media or document"
                >
                  {isAudioAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  <span className="hidden sm:inline">Attach file</span>
                </button>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isStreaming || isAudioAnalyzing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 sm:px-3"
                  title="Upload a recording of your spoken question"
                  aria-label="Ask the AI Tutor by voice"
                >
                  {isAudioAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                  <span className="hidden sm:inline">Ask by voice</span>
                </button>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700"
                    title="Stop streaming response"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputMessage.trim() || isAudioAnalyzing}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/15 transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Send query (Enter)"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </div>
            </div>

            {/* Fixed Mandatory Regulatory & Safety Disclaimer */}
            <div className="flex items-center justify-between gap-3 px-1 text-[10px] text-slate-400 sm:text-[11px]">
              <span className="min-w-0 truncate">
                Answers use approved knowledge · Attachments up to 14 MB · Sound matching up to 100 MB
              </span>
              <span className="hidden shrink-0 text-slate-400 sm:inline-block">
                Enter to send · Shift+Enter for a new line
              </span>
            </div>
          </div>
        </footer>
      </main>

      {/* Source Detail Drawer */}
      <SourceDetailDrawer
        sourceId={activeSourceId}
        onClose={() => setActiveSourceId(null)}
      />
      {isMemoryPanelOpen && (
        <TutorMemoryPanel
          onClose={() => setIsMemoryPanelOpen(false)}
          onCountChange={setTutorMemoryCount}
        />
      )}
      </div>
    </div>
  );
};
