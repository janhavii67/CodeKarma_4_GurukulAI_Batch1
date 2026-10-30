import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Loader2, Send, Siren, X } from 'lucide-react';
import { walkApi } from '../api';
import type { Explanation, WalkNode } from '../types';

interface Message { id: number; role: 'trainee' | 'tutor'; text: string; step: string; explanation?: Explanation; error?: boolean }

interface AssistantDrawerProps {
  sessionId: string;
  node: WalkNode | null;
  open: boolean;
  initialQuestion?: string | null;
  onClose: () => void;
  onEscalate: () => void;
}

/** SUJANA AI Tutor scoped to the current step. It explains; it never changes the approved path. */
export const AssistantDrawer: React.FC<AssistantDrawerProps> = ({ sessionId, node, open, initialQuestion, onClose, onEscalate }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const counter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastInitial = useRef<string | null>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || loading || !node) return;
    const step = node.title;
    setMessages((current) => [...current, { id: ++counter.current, role: 'trainee', text, step }]);
    setInput('');
    setLoading(true);
    try {
      const explanation = await walkApi.explain(sessionId, text);
      setMessages((current) => [...current, { id: ++counter.current, role: 'tutor', text: explanation.answer, step, explanation }]);
    } catch (error) {
      setMessages((current) => [...current, { id: ++counter.current, role: 'tutor', step, error: true,
        text: error instanceof Error ? error.message : 'The AI Tutor is unavailable right now. Follow the approved instructions on screen.' }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && initialQuestion && initialQuestion !== lastInitial.current) {
      lastInitial.current = initialQuestion;
      void ask(initialQuestion);
    }
  }, [open, initialQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  if (!open) return null;
  const terms = node?.details?.technical_terms || [];
  const quickPrompts = node ? [
    node.node_type === 'question' ? 'Explain this question in simple words' : 'Explain this step in simple words',
    'What exactly should I observe?',
    ...terms.slice(0, 2).map((term) => `What does “${term.term}” mean?`),
  ] : [];

  return (
    <aside role="dialog" aria-label="AI Tutor" className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[600px] sm:max-h-[calc(100vh-2rem)] sm:w-[400px] sm:rounded-3xl">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white"><Bot className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">AI Tutor</p>
          <p className="truncate text-xs text-slate-500">About: {node?.title || 'this session'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close AI Tutor" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">
            Ask about terms, what to look for, or what an answer means. I explain using approved knowledge — I won’t choose answers for you or change the expert’s steps.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'trainee' ? 'flex justify-end' : ''}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${message.role === 'trainee' ? 'bg-blue-600 text-white' : message.error ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-800'}`}>
              <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
              {message.explanation?.notice && (
                <p className="mt-2 flex gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message.explanation.notice}</p>
              )}
              {message.explanation?.sources.length ? (
                <p className="mt-2 text-[11px] text-slate-500">Sources: {message.explanation.sources.map((source) => source.title).join(' · ')}</p>
              ) : null}
              {message.explanation?.escalate && (
                <button type="button" onClick={onEscalate} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500">
                  <Siren className="h-3.5 w-3.5" />Contact an expert
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking approved knowledge…</p>}
      </div>
      {quickPrompts.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          {quickPrompts.map((prompt) => (
            <button key={prompt} type="button" disabled={loading} onClick={() => void ask(prompt)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{prompt}</button>
          ))}
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void ask(input); }} className="flex gap-2 border-t border-slate-100 p-3">
        <label className="sr-only" htmlFor="tutor-question">Ask the AI Tutor</label>
        <input id="tutor-question" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question about this step…" maxLength={1000}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Send question" className="rounded-xl bg-violet-600 px-3 text-white hover:bg-violet-500 disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>
    </aside>
  );
};
