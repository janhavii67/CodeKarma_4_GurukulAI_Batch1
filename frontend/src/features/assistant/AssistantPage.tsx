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
} from 'lucide-react';
import { ConversationList } from './components/ConversationList';
import { MessageList } from './components/MessageList';
import { MachineContextFilter } from './components/MachineContextFilter';
import { SourceDetailDrawer } from './components/SourceDetailDrawer';
import { useAssistantChat } from './useAssistantChat';
import { listConversations, getConversation, deleteConversation } from './api';
import { api } from '../../lib/api/client';
import type { AudioAnalysisResult, ChatResponse, Conversation, Message } from './types';

const MAX_AUDIO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_MEDIA_UPLOAD_BYTES = 14 * 1024 * 1024;

export const AssistantPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isAudioAnalyzing, setIsAudioAnalyzing] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

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
    removeLocalMessage,
  } = useAssistantChat();

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
      loadConversation(fullConv);
    } catch (err) {
      console.warn('Failed to load conversation details:', err);
    }
  };

  const handleNewChat = () => {
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
      clearMessages();
    }
  };

  const handleSend = async () => {
    const text = inputMessage.trim();
    if (!text || isStreaming || isAudioAnalyzing) return;

    setInputMessage('');
    await sendMessage(text);
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (!/\.(wav|flac|mp3|m4a|m4b|m4p|aac|aiff|aif|ogg|opus|weba|webm|mp4|mov|avi|flv|mpeg|mpg|wmv|3gp|qt)$/i.test(file.name)) {
      setAudioError('Choose a supported audio file or a video with an audio track.');
      return;
    }
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      setAudioError('Audio files must be 100 MB or smaller.');
      return;
    }
    if (isStreaming || isAudioAnalyzing) return;

    setAudioError('');
    setIsAudioAnalyzing(true);
    const timestamp = Date.now();
    const userMessageId = `audio-user-${timestamp}`;
    const resultMessageId = `asst-audio-${timestamp}`;
    const now = new Date().toISOString();
    const uploadMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: `Uploaded machine sound: ${file.name}`,
      created_at: now,
    };
    const pendingMessage: Message = {
      id: resultMessageId,
      role: 'assistant',
      content: 'Comparing the recording with approved machine-sound references…',
      is_ai_generated: true,
      evidence_status: 'n_a',
      created_at: now,
    };
    appendLocalMessages([uploadMessage, pendingMessage]);

    try {
      const form = new FormData();
      form.append('file', file);
      if (machineId) form.append('machine_id', machineId);
      const result = await api.postForm<AudioAnalysisResult>('/audio/analyze', form);
      updateLocalMessage(resultMessageId, {
        content: result.status === 'MATCHED'
          ? 'This recording resembles a published expert-approved sound reference.'
          : 'The recording did not produce a reliable approved sound match.',
        audio_analysis: result,
      });

      if (result.status === 'MATCHED' && result.matched_reference) {
        const reference = result.matched_reference;
        const context = [reference.machine_name, reference.model_name, reference.component, reference.operation].filter(Boolean).join(', ');
        const answerMachineId = machineId || reference.machine_id || undefined;
        const sent = await sendMessage(
          `Explain the approved expert interpretation for the machine sound similar to "${reference.title}"${context ? ` (${context})` : ''}. State only observations and interpretations supported by published approved sources. Clearly distinguish acoustic similarity from a confirmed fault or safety status. Do not infer causes, additional faults, probabilities, corrective actions, settings, tolerances, or safety instructions. If sources do not explain the sound, say evidence is insufficient.`,
          {
            machineId: answerMachineId,
            audioAnalysisJobId: result.id,
          },
        );
        if (sent) removeLocalMessage(resultMessageId);
      } else {
        const sent = await sendMessage(
          'Save this machine audio comparison result. Do not diagnose a fault or suggest a procedure.',
          { machineId: machineId || undefined, audioAnalysisJobId: result.id },
        );
        if (sent) removeLocalMessage(resultMessageId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The audio could not be analyzed. Check that it is a supported recording.';
      updateLocalMessage(resultMessageId, {
        content: `I couldn't analyze this recording: ${message}`,
        evidence_status: 'n_a',
      });
    } finally {
      setIsAudioAnalyzing(false);
    }
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!/\.(wav|flac|mp3|m4a|aac|aiff|aif|ogg|opus|weba|webm|mp4|mov|avi|flv|mpeg|mpg|wmv|3gp|bmp|png|jpe?g|webp|pdf|docx|pptx|xlsx|csv|txt|md)$/i.test(file.name)) {
      setAudioError('Choose a supported audio, video, image, or document file.');
      return;
    }
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      setAudioError('Tutor attachments must be 14 MB or smaller. Use the sound-match button for audio recordings up to 100 MB.');
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
    appendLocalMessages([
      {
        id: userMessageId,
        role: 'user',
        content: `${question || 'Please analyze this attachment in relation to approved manufacturing knowledge.'}\nAttached: ${file.name}`,
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

    const progressSteps = [
      'Reading the attachment…',
      'Finding related approved knowledge…',
      'Preparing a cited answer…',
    ];
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
      updateLocalMessage(resultMessageId, {
        id: result.message_id,
        conversation_id: result.conversation_id,
        content: result.answer,
        evidence_status: result.provider_unavailable ? 'n_a' : result.insufficient_evidence ? 'insufficient' : 'sufficient',
        provider_unavailable: result.provider_unavailable,
        sources: result.sources,
        handoffs: result.handoffs || [],
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      {/* Left Column: Conversation History Sidebar (Desktop) */}
      <aside className="hidden md:flex w-72 lg:w-80 h-full shrink-0 flex-col shadow-xs">
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
          <div className="relative w-72 max-w-[80%] h-full bg-slate-50 shadow-2xl z-10">
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
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
        {/* Top Control Bar */}
        <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs z-10">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpenMobile(true)}
              className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              title="Open conversations history"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 leading-tight">
                  AI Technical Knowledge Assistant
                </h1>
                <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Strict SOP & XAI Grounding (M02)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <MachineContextFilter
              selectedMachineId={machineId}
              onSelectMachine={setMachineId}
              disabled={isStreaming}
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
              >
                New Chat
              </button>
            )}
          </div>
        </header>

        {/* Global Error Notice if active */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error.message || 'An error occurred while communicating with the assistant.'}</span>
            </div>
            <button
              type="button"
              onClick={() => handleSend()}
              className="px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 rounded transition-colors"
            >
              Retry
            </button>
          </div>
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
        <footer className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-2">
          <div className="max-w-4xl mx-auto space-y-2">
            {audioError && (
              <p className="text-xs text-red-700" role="alert">{audioError}</p>
            )}
            <div className="relative rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 shadow-xs transition-all flex items-end">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about SOPs, machines, procedures, or attach a file..."
                rows={2}
                disabled={isStreaming || isAudioAnalyzing}
                className="w-full text-sm p-3 pr-36 bg-transparent border-0 focus:outline-hidden focus:ring-0 resize-none text-slate-800 placeholder-slate-400 max-h-36 disabled:opacity-50"
              />

              <div className="absolute right-2.5 bottom-2.5 flex items-center space-x-1.5">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept=".wav,.flac,.mp3,.m4a,.m4b,.m4p,.aac,.aiff,.aif,.ogg,.opus,.weba,.webm,.mp4,.mov,.avi,.flv,.mpeg,.mpg,.wmv,.3gp,.qt,audio/wav,audio/flac,audio/mpeg,audio/aac,audio/aiff,audio/ogg,audio/opus,audio/webm,video/mp4,video/quicktime,video/avi,video/x-flv,video/mpeg,video/wmv,video/3gpp,video/webm"
                  aria-label="Upload machine audio"
                  className="sr-only"
                  onChange={handleAudioUpload}
                />
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="audio/wav,audio/flac,audio/mpeg,audio/m4a,audio/aac,audio/aiff,audio/ogg,audio/opus,audio/webm,video/mp4,video/quicktime,video/avi,video/x-flv,video/mpeg,video/wmv,video/3gpp,video/webm,image/bmp,image/png,image/jpeg,image/webp,application/pdf,.aiff,.aif,.aac,.opus,.weba,.mov,.avi,.flv,.mpeg,.mpg,.wmv,.3gp,.docx,.pptx,.xlsx,text/csv,text/plain,.md"
                  aria-label="Select media or document file"
                  className="sr-only"
                  onChange={handleMediaUpload}
                />
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isStreaming || isAudioAnalyzing}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                  title="Attach audio, video, image, or document (14 MB max)"
                  aria-label="Attach media or document"
                >
                  {isAudioAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isStreaming || isAudioAnalyzing}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                  title="Match a machine sound recording with approved references"
                  aria-label="Upload machine audio"
                >
                  {isAudioAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                </button>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={cancel}
                    className="p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shadow-2xs"
                    title="Stop streaming response"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputMessage.trim()}
                    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                    title="Send query (Enter)"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Fixed Mandatory Regulatory & Safety Disclaimer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span className="truncate">
                Answers use approved knowledge. Attach media or documents up to 14 MB; sound matching also accepts MP3 and other supported recordings up to 100 MB.
              </span>
              <span className="hidden sm:inline-block shrink-0 ml-2 font-mono text-[10px]">
                Enter: send | Shift+Enter: newline
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
    </div>
  );
};
