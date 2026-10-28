import React from 'react';
import { Bot, User, CheckCircle2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { SafeMarkdown } from './SafeMarkdown';
import { SourceCitations } from './SourceCitations';
import { InsufficientEvidenceNotice } from './InsufficientEvidenceNotice';
import { FeedbackButtons } from './FeedbackButtons';
import { AudioTutorResult } from './AudioTutorResult';
import { TutorHandoffActions } from './TutorHandoffActions';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSelectSource?: (sourceId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming = false,
  onSelectSource,
}) => {
  const isUser = message.role === 'user';
  const isInsufficient = message.evidence_status === 'insufficient';
  const isProviderUnavailable = Boolean(message.provider_unavailable);

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 animate-in fade-in duration-150">
        <div className="max-w-2xl flex items-start space-x-2.5 flex-row-reverse space-x-reverse">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <User className="w-4 h-4" />
          </div>
          <div className="rounded-2xl rounded-tr-xs bg-blue-600 text-white px-4 py-2.5 shadow-xs text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.created_at && (
              <span className="block text-[10px] text-blue-200 mt-1 text-right">
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl flex items-start space-x-3">
        {/* Assistant Avatar */}
        <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
          <Bot className="w-4 h-4 text-blue-400" />
        </div>

        {/* Assistant Bubble Content */}
        <div className="flex-1 space-y-2">
          <div className="bg-white rounded-2xl rounded-tl-xs border border-slate-200 p-4 shadow-2xs space-y-2">
            {/* Header info */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-800">Gurukul AI Assistant</span>
                {isProviderUnavailable ? (
                  <Badge variant="warning" size="sm">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Assistant unavailable
                  </Badge>
                ) : message.evidence_status && message.evidence_status !== 'n_a' && (
                  <Badge
                    variant={isInsufficient ? 'warning' : 'success'}
                    size="sm"
                  >
                    {isInsufficient ? (
                      <>
                        <ShieldAlert className="w-3 h-3 mr-1" />
                        Insufficient Evidence
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Grounded in SOP
                      </>
                    )}
                  </Badge>
                )}
              </div>
              {message.created_at && (
                <span className="text-[11px] text-slate-400">
                  {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Content text / streaming */}
            <div className="text-slate-800 text-sm leading-relaxed font-sans">
              <SafeMarkdown
                content={message.content}
                sources={message.sources}
                onSelectSource={onSelectSource}
              />
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-blue-600 animate-pulse" />
              )}
            </div>

            {message.audio_analysis && <AudioTutorResult result={message.audio_analysis} />}

            {/* Insufficient Evidence Notice */}
            {isInsufficient && !isProviderUnavailable && <InsufficientEvidenceNotice />}

            {/* Source Citations */}
            {message.sources && message.sources.length > 0 && (
              <SourceCitations sources={message.sources} onSelectSource={onSelectSource} />
            )}

            {!isStreaming && !isInsufficient && !isProviderUnavailable && !message.audio_analysis && (
              <TutorHandoffActions message={message} />
            )}
          </div>

          {/* Feedback buttons for finalized responses */}
          {!isStreaming && !message.audio_analysis && message.id && !message.id.startsWith('asst-') && (
            <FeedbackButtons messageId={message.id} />
          )}
        </div>
      </div>
    </div>
  );
};
