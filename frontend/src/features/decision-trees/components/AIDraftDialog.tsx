import React, { useState } from 'react';
import { Bot, Loader2, X } from 'lucide-react';
import type { AIDraftResult } from '../types';

interface AIDraftDialogProps {
  hasSteps: boolean;
  defaultPrompt: string;
  onGenerate: (prompt: string, replace: boolean) => Promise<AIDraftResult>;
  onClose: () => void;
}

export const AIDraftDialog: React.FC<AIDraftDialogProps> = ({ hasSteps, defaultPrompt, onGenerate, onClose }) => {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [replace, setReplace] = useState(false);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: AIDraftResult }>({ loading: false });

  const generate = async () => {
    setState({ loading: true });
    try {
      setState({ loading: false, result: await onGenerate(prompt.trim(), replace) });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'The AI assistant could not create a draft.' });
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(event) => event.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label="Generate draft with AI" className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1b1f26] p-5 text-slate-100 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300"><Bot className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold">Draft this tree with AI</h2>
            <p className="text-[12px] text-slate-400">Uses approved knowledge for this machine. Output stays a draft for your review.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>

        {state.result ? (
          <div className="mt-5 space-y-3 text-[13px]">
            <p className="rounded-xl bg-emerald-500/10 p-3 text-emerald-200">
              Added {state.result.summary.steps} steps and {state.result.summary.branches} branches. Each one is marked <strong>Review</strong> until you check it.
            </p>
            {state.result.summary.unsourced_steps > 0 && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-amber-200">{state.result.summary.unsourced_steps} action or result steps had no approved source. Fill in the machine-specific details yourself.</p>
            )}
            {state.result.sources.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Approved sources used</p>
                <ul className="mt-1 space-y-0.5 text-slate-300">{state.result.sources.map((source) => <li key={source.id}>{source.title}{source.section ? ` — ${source.section}` : ''}</li>)}</ul>
              </div>
            )}
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Review the draft</button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">Describe the problem and what the tree should cover</span>
              <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Create a troubleshooting tree for unusual vibration in a CT Scan machine."
                className="w-full rounded-xl border border-white/10 bg-[#14171c] p-3 text-[13px] focus:border-violet-500 focus:outline-none" />
            </label>
            {hasSteps && (
              <label className="flex items-start gap-2 text-[12px] text-amber-200">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 accent-amber-500" />
                Replace the current steps (everything except Start). You can undo this.
              </label>
            )}
            {state.error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-[12px] text-rose-200">{state.error}</p>}
            <button type="button" disabled={state.loading || prompt.trim().length < 5 || (hasSteps && !replace)} onClick={() => void generate()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
              {state.loading ? <><Loader2 className="h-4 w-4 animate-spin" />Drafting from approved knowledge…</> : 'Generate draft'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
