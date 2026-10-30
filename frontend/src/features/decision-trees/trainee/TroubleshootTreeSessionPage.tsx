import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { ArrowLeft, Bot, Loader2, RotateCcw, Siren } from 'lucide-react';
import { ApiClientError } from '../../../lib/api/client';
import { TraineeTroubleshootingTree } from './TraineeTroubleshootingTree';
import type { WalkState } from '../types';
import { walkApi } from '../api';
import { AssistantDrawer } from './AssistantDrawer';
import { ResultReport } from './ResultReport';

/** Trainee session view: keep the published branch diagram as the primary interface. */
export const TroubleshootTreeSessionPage: React.FC = () => {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = Boolean(useReducedMotion());
  const key = ['decision-tree-walk', sessionId];
  const query = useQuery({ queryKey: key, queryFn: () => walkApi.get(sessionId), enabled: Boolean(sessionId) });
  const state = query.data;
  const [busy, setBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (action: () => Promise<WalkState>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      queryClient.setQueryData(key, next);
      void queryClient.invalidateQueries({ queryKey: ['decision-tree-walk-history'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      void query.refetch();
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    if (state?.path.length && !window.confirm('Restart this troubleshooting tree from the beginning? Your current answers will be cleared.')) return;
    void apply(() => walkApi.restart(sessionId));
  };
  const goBackTo = (index: number) => {
    if (!state) return;
    const later = state.path.length - index - 1;
    if (later > 0 && !window.confirm(`Changing this answer clears the ${later} answer${later > 1 ? 's' : ''} after it. Continue?`)) return;
    void apply(() => walkApi.back(sessionId, index));
  };
  const escalate = async (reason: string) => {
    const next = await walkApi.escalate(sessionId, reason);
    queryClient.setQueryData(key, next);
  };
  const requestExpert = () => {
    const reason = window.prompt('Describe what you are seeing so an expert can help:');
    if (reason?.trim() && reason.trim().length >= 3) void apply(() => walkApi.escalate(sessionId, reason.trim()));
  };
  const startWorkflow = async (workflowId: string) => {
    setWorkflowBusy(true);
    setError(null);
    try {
      const run = await walkApi.startWorkflow(workflowId);
      navigate(`/app/guided-workflows?run_id=${encodeURIComponent(run.id)}`);
    } catch (err) {
      setError(err instanceof ApiClientError && err.status === 403
        ? 'You do not have access to run Guided Workflows. Ask your supervisor or an expert.'
        : err instanceof Error ? err.message : 'The approved procedure could not be opened.');
    } finally {
      setWorkflowBusy(false);
    }
  };

  if (query.isLoading) return <div className="flex h-[60vh] items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading troubleshooting tree" /></div>;
  if (query.isError || !state) return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm text-slate-600">This troubleshooting tree could not be loaded.</p>
      <Link to="/app/troubleshooting" className="mt-4 inline-block text-sm font-semibold text-blue-600">Choose a troubleshooting tree</Link>
    </div>
  );

  const current = state.current_node;
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/app/troubleshooting" aria-label="Back to troubleshooting trees" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{state.machine_name || 'Expert troubleshooting tree'}</p>
          <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{state.guide.title}</h1>
        </div>
        {state.status !== 'escalated' && <button type="button" onClick={restart} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Restart tree</button>}
      </header>

      {!state.version_is_current && <p className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-900">Experts updated this tree after this session began. This session follows the published version it started with.</p>}
      {state.status === 'escalated' && !state.is_terminal && <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-900"><Siren className="h-4 w-4" />This session was sent to an expert. Wait for their guidance before continuing.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p>}

      {state.tree.nodes.length ? (
        <TraineeTroubleshootingTree tree={state.tree} path={state.path} busy={busy} workflowBusy={workflowBusy}
          onChooseEdge={(edgeId) => void apply(() => walkApi.answer(sessionId, edgeId))}
          onChangeAnswer={goBackTo} onStartWorkflow={(id) => void startWorkflow(id)} />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">The published troubleshooting tree has no nodes to display. Please contact an expert.</section>
      )}

      {current && state.is_terminal && state.report && (
        <ResultReport report={state.report} status={state.status} reducedMotion={reducedMotion} escalated={Boolean(state.escalation)}
          onRestart={restart} onChangeAnswer={goBackTo} onEscalate={escalate}
          onStartWorkflow={(id) => void startWorkflow(id)} workflowBusy={workflowBusy} />
      )}

      {current && !state.is_terminal && state.status !== 'escalated' && <div className="flex justify-end"><button type="button" onClick={requestExpert} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Siren className="h-4 w-4" />Contact an expert</button></div>}

      {current && <>
        {!assistantOpen && <button type="button" onClick={() => setAssistantOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:brightness-110"><Bot className="h-5 w-5" />Ask AI Tutor</button>}
        <AssistantDrawer sessionId={sessionId} node={current} open={assistantOpen} onClose={() => setAssistantOpen(false)} onEscalate={requestExpert} />
      </>}
    </div>
  );
};
