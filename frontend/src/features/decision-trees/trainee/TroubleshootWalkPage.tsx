import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Bot, ChevronLeft, CircleDot, Info, Loader2, RotateCcw, Siren } from 'lucide-react';
import { ApiClientError } from '../../../lib/api/client';
import { walkApi } from '../api';
import { nodeTypeConfig } from '../nodeTypes';
import type { DecisionEdge, WalkState } from '../types';
import { AssistantDrawer } from './AssistantDrawer';
import { ResultReport } from './ResultReport';
import { StepStage } from './StepStage';

/** One-question-at-a-time troubleshooting session over a published decision tree. */
export const TroubleshootWalkPage: React.FC = () => {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = Boolean(useReducedMotion());
  const key = ['decision-tree-walk', sessionId];
  const walkQuery = useQuery({ queryKey: key, queryFn: () => walkApi.get(sessionId), enabled: Boolean(sessionId) });
  const state = walkQuery.data;
  const [busy, setBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<{ open: boolean; question: string | null }>({ open: false, question: null });

  const apply = async (action: () => Promise<WalkState>) => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(key, await action());
      void queryClient.invalidateQueries({ queryKey: ['decision-tree-walk-history'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      void walkQuery.refetch();
    } finally {
      setBusy(false);
    }
  };

  const answer = (edge: DecisionEdge) => apply(() => walkApi.answer(sessionId, edge.id));
  const goBackTo = (index: number) => {
    if (!state) return;
    const later = state.path.length - index - 1;
    if (later > 0 && !window.confirm(`Changing this answer clears the ${later} answer${later > 1 ? 's' : ''} you gave after it. Continue?`)) return;
    void apply(() => walkApi.back(sessionId, index));
  };
  const restart = () => {
    if (state?.path.length && !window.confirm('Restart from the first step? Your current answers will be cleared.')) return;
    void apply(() => walkApi.restart(sessionId));
  };
  const escalate = async (reason: string) => {
    const next = await walkApi.escalate(sessionId, reason);
    queryClient.setQueryData(key, next);
  };
  const escalateFromStep = () => {
    const reason = window.prompt('Describe what you are seeing so an expert can help:');
    if (reason && reason.trim().length >= 3) void apply(() => walkApi.escalate(sessionId, reason.trim()));
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
        : err instanceof Error ? err.message : 'The workflow could not be opened.');
    } finally {
      setWorkflowBusy(false);
    }
  };

  if (walkQuery.isLoading) return <div className="flex h-[60vh] items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading session" /></div>;
  if (walkQuery.isError || !state) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-slate-600">This troubleshooting session could not be loaded.</p>
        <Link to="/app/troubleshooting/guided" className="mt-4 inline-block text-sm font-semibold text-blue-600">Choose a problem</Link>
      </div>
    );
  }

  const node = state.current_node;
  const canGoBack = state.path.length > 0 && state.status !== 'escalated';

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/app/troubleshooting/guided" aria-label="Back to problems" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{state.machine_name || 'Guided troubleshooting'}</p>
          <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{state.guide.title}</h1>
        </div>
        {state.status !== 'escalated' && (
          <button type="button" onClick={restart} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">Restart</span>
          </button>
        )}
      </header>

      {!state.version_is_current && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-2.5 text-sm text-blue-900"><Info className="h-4 w-4" />Experts have updated this tree since you started. This session keeps the version you began with.</p>
      )}
      {state.status === 'escalated' && !state.is_terminal && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-900"><Siren className="h-4 w-4" />This session was sent to an expert. Wait for their guidance before continuing.</p>
      )}
      {error && <p role="alert" className="mb-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Your answers so far" className="order-2 lg:order-1">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Your path</p>
            <ol className="relative mt-3 space-y-1">
              {state.path.map((step) => {
                const config = nodeTypeConfig(step.type as never);
                return (
                  <li key={step.index} className="group relative flex gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: config.accent }} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="line-clamp-2 text-slate-600">{step.title}</span>
                      {step.type === 'question' && <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">{step.answer}</span>}
                    </span>
                    {step.type === 'question' && state.status !== 'escalated' && (
                      <button type="button" onClick={() => goBackTo(step.index)} disabled={busy} aria-label={`Change answer to ${step.title}`}
                        className="self-start rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 opacity-100 hover:bg-blue-50 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100">Change</button>
                    )}
                  </li>
                );
              })}
              {node && (
                <li className="flex gap-3 rounded-xl bg-blue-50 px-2 py-2" aria-current="step">
                  <motion.span animate={reducedMotion ? undefined : { scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="mt-1 text-blue-600"><CircleDot className="h-3.5 w-3.5" /></motion.span>
                  <span className="text-sm font-semibold text-blue-900">{state.is_terminal ? 'Result' : `Step ${state.step_number}`}<span className="block font-normal text-blue-800/80 line-clamp-2">{node.title}</span></span>
                </li>
              )}
            </ol>
            {/* No percentage: the remaining length depends on answers not given yet. */}
            <p className="mt-3 text-xs text-slate-400" aria-live="polite">
              {state.is_terminal ? `Completed in ${state.path.length} steps.` : `${state.path.length} step${state.path.length === 1 ? '' : 's'} answered · the next steps depend on your answers.`}
            </p>
          </div>
        </nav>

        <main className="order-1 min-w-0 lg:order-2">
          {node && (state.is_terminal && state.report ? (
            <ResultReport report={state.report} status={state.status} reducedMotion={reducedMotion} escalated={Boolean(state.escalation)}
              onRestart={restart} onChangeAnswer={goBackTo} onEscalate={escalate} onStartWorkflow={(id) => void startWorkflow(id)} workflowBusy={workflowBusy} />
          ) : (
            <StepStage node={node} answers={state.status === 'escalated' ? [] : state.answers} stepNumber={state.step_number} busy={busy}
              reducedMotion={reducedMotion} onAnswer={(edge) => void answer(edge)}
              onExplain={() => setAssistant({ open: true, question: node.node_type === 'question' ? 'Explain this question in simple words' : 'Explain this step in simple words' })}
              onStartWorkflow={(id) => void startWorkflow(id)} workflowBusy={workflowBusy} />
          ))}

          {!state.is_terminal && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!canGoBack || busy} onClick={() => goBackTo(state.path.length - 1)}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />Previous step
              </button>
              {state.status !== 'escalated' && (
                <button type="button" onClick={escalateFromStep} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                  <Siren className="h-4 w-4" />Unsafe or unsure? Contact an expert
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {!assistant.open && (
        <button type="button" onClick={() => setAssistant({ open: true, question: null })}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-600/30 hover:brightness-110">
          <Bot className="h-5 w-5" />Ask AI Tutor
        </button>
      )}
      <AssistantDrawer sessionId={sessionId} node={node} open={assistant.open} initialQuestion={assistant.question}
        onClose={() => setAssistant({ open: false, question: null })} onEscalate={escalateFromStep} />
    </div>
  );
};
