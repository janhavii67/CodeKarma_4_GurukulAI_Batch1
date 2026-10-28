import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { SuggestedQuestions } from './SuggestedQuestions';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  progressMessage?: string;
  onSelectSuggestion: (question: string) => void;
  onSelectSource: (sourceId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming = false,
  progressMessage = '',
  onSelectSuggestion,
  onSelectSource,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or incoming streaming tokens
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <SuggestedQuestions onSelectQuestion={onSelectSuggestion} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map((msg, index) => {
        const isLatest = index === messages.length - 1;
        return (
          <MessageBubble
            key={msg.id || `msg-${index}`}
            message={msg}
            isStreaming={isStreaming && isLatest && msg.role === 'assistant'}
            onSelectSource={onSelectSource}
          />
        );
      })}
      {isStreaming && progressMessage && (
        <div className="flex items-center gap-2 pl-11 text-xs text-slate-500" role="status" aria-live="polite">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {progressMessage}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};
