import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpen, ChevronDown, Eye, Layers, Lightbulb, Loader2, MessageCircleQuestion, ShieldAlert, Workflow } from 'lucide-react';
import { MediaShowcase } from '../../workflows/MediaShowcase';
import { nodeTypeConfig } from '../nodeTypes';
import type { DecisionEdge, DecisionNode, WorkflowInfo } from '../types';

export interface StepStageProps {
  node: DecisionNode & { workflow?: WorkflowInfo | null };
  answers: DecisionEdge[];
  stepNumber: number;
  busy?: boolean;
  reducedMotion: boolean;
  onAnswer: (edge: DecisionEdge) => void;
  onExplain?: () => void;
  onStartWorkflow?: (workflowId: string) => void;
  workflowBusy?: boolean;
}

const CONTINUE_LABEL: Record<string, string> = {
  start: 'Begin troubleshooting',
  safety: 'I understand — continue',
  action: "I've done this — continue",
  media: 'Continue',
  workflow: 'Continue troubleshooting',
};

/** One step of a decision tree, exactly as trainees see it (also used for the expert preview). */
export const StepStage: React.FC<StepStageProps> = ({
  node, answers, stepNumber, busy, reducedMotion, onAnswer, onExplain, onStartWorkflow, workflowBusy,
}) => {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [termsOpen, setTermsOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const config = nodeTypeConfig(node.node_type);
  const details = node.details || {};
  const isQuestion = node.node_type === 'question';
  const terms = details.technical_terms || [];
  const safetyItems = [...(details.ppe || []).map((item) => `PPE: ${item}`), ...(details.precautions || []), ...(details.restricted_operations || []).map((item) => `Do not: ${item}`)];
  const motionProps = reducedMotion
    ? {}
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } };

  const choose = (edge: DecisionEdge) => {
    if (busy) return;
    setChosen(edge.id);
    onAnswer(edge);
  };

  return (
    <AnimatePresence mode="wait">
      <motion.article key={node.id} {...motionProps} aria-labelledby={`step-title-${node.id}`}
        className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
        {(node.safety_warning || safetyItems.length > 0) && (
          <div role="alert" className="flex gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white px-5 py-4 sm:px-7">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><ShieldAlert className="h-5 w-5" /></span>
            <div className="text-sm text-rose-900">
              <p className="font-semibold">Safety first</p>
              {node.safety_warning && <p className="mt-0.5 whitespace-pre-wrap">{node.safety_warning}</p>}
              {safetyItems.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{safetyItems.map((item) => <li key={item}>{item}</li>)}</ul>}
            </div>
          </div>
        )}

        <div className="px-5 pb-6 pt-5 sm:px-8 sm:pt-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-white">Step {stepNumber}</span>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${config.accent}22`, color: '#0f172a' }}>{config.label}</span>
            {onExplain && (
              <button type="button" onClick={onExplain} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
                <MessageCircleQuestion className="h-3.5 w-3.5" />{isQuestion ? 'Explain this question' : 'Explain this step'}
              </button>
            )}
          </div>

          <h2 id={`step-title-${node.id}`} className="mt-4 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-[28px]">{node.title}</h2>
          {node.instructions && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-600">{node.instructions}</p>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {node.help_text && (
              <div className="rounded-2xl bg-blue-50/80 p-4 text-sm text-blue-950">
                <p className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-4 w-4 text-blue-600" />Why this matters</p>
                <p className="mt-1 leading-relaxed">{node.help_text}</p>
              </div>
            )}
            {node.expected_observation && (
              <div className="rounded-2xl bg-amber-50/80 p-4 text-sm text-amber-950">
                <p className="flex items-center gap-1.5 font-semibold"><Eye className="h-4 w-4 text-amber-600" />What to observe</p>
                <p className="mt-1 leading-relaxed">{node.expected_observation}</p>
              </div>
            )}
          </div>

          {(details.corrective_actions?.length || details.completion_condition) && (
            <div className="mt-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
              {details.corrective_actions?.length ? <ol className="list-decimal space-y-1 pl-5">{details.corrective_actions.map((step) => <li key={step}>{step}</li>)}</ol> : null}
              {details.completion_condition && <p className="mt-2 text-slate-500"><strong className="text-slate-700">Done when:</strong> {details.completion_condition}</p>}
            </div>
          )}

          {terms.length > 0 && (
            <div className="mt-3 rounded-2xl border border-slate-200">
              <button type="button" onClick={() => setTermsOpen(!termsOpen)} aria-expanded={termsOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                <BookOpen className="h-4 w-4 text-slate-500" />Technical terms ({terms.length})<ChevronDown className={`ml-auto h-4 w-4 transition ${termsOpen ? 'rotate-180' : ''}`} />
              </button>
              {termsOpen && (
                <dl className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
                  {terms.map((term) => <div key={term.term}><dt className="font-semibold text-slate-800">{term.term}</dt><dd className="text-slate-600">{term.definition}</dd></div>)}
                </dl>
              )}
            </div>
          )}

          {node.media.length > 0 && (
            <section aria-labelledby={`step-media-${node.id}`} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 id={`step-media-${node.id}`} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-200 text-slate-700"><Layers size={13} /></span>
                  Learning materials for this step
                </h3>
                <span className="font-mono text-[10px] font-semibold text-slate-500">{node.media.length} attached</span>
              </div>
              <MediaShowcase assets={node.media} failedIds={failedIds} reducedMotion={reducedMotion} showStatus={false}
                onMediaError={(id) => setFailedIds((current) => new Set(current).add(id))}
                onRetry={(id) => setFailedIds((current) => { const next = new Set(current); next.delete(id); return next; })} />
            </section>
          )}

          {node.workflow && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700"><Workflow className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Guided Workflow</p>
                <p className="truncate text-sm font-semibold text-slate-900">{node.workflow.title}</p>
              </div>
              {node.workflow.available && onStartWorkflow ? (
                <button type="button" disabled={workflowBusy} onClick={() => onStartWorkflow(node.workflow!.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">
                  {workflowBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Open workflow
                </button>
              ) : !node.workflow.available ? <p className="text-xs text-slate-500">This workflow is not currently published.</p> : null}
            </div>
          )}

          <div className={`mt-7 grid gap-3 ${isQuestion && answers.length > 1 ? 'sm:grid-cols-2' : ''} ${answers.length > 2 ? 'lg:grid-cols-3' : ''}`} role="group" aria-label={isQuestion ? 'Choose an answer' : 'Continue'}>
            {answers.map((edge, index) => {
              const label = isQuestion ? edge.label : CONTINUE_LABEL[node.node_type] || (edge.label.toLowerCase() === 'next' ? 'Continue' : edge.label);
              const selected = chosen === edge.id;
              return (
                <motion.button key={edge.id} type="button" disabled={busy} onClick={() => choose(edge)}
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  className={`group relative flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left text-base font-semibold transition disabled:cursor-wait ${
                    selected ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : isQuestion ? 'border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md'
                        : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                  }`}>
                  {isQuestion && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${selected ? 'bg-white/20' : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700'}`}>{String.fromCharCode(65 + index)}</span>}
                  <span className="flex-1">{label}</span>
                  {selected && busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className={`h-5 w-5 transition ${isQuestion ? 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-blue-500' : ''}`} />}
                </motion.button>
              );
            })}
          </div>
          {answers.length === 0 && <p className="mt-6 text-sm text-slate-500">This step has no next step yet.</p>}
        </div>
      </motion.article>
    </AnimatePresence>
  );
};
