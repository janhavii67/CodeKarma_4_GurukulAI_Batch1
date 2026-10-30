import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play, RefreshCw, Repeat, RotateCcw, Sparkles, Undo2, X, XCircle } from 'lucide-react';
import { enumeratePaths, isTerminal, outgoing, startNodeOf, type TreePath } from '../graph';
import type { AISuggestion, DecisionEdge, DecisionNode, TreeIssue, WalkReport } from '../types';
import { ResultReport } from '../trainee/ResultReport';
import { StepStage } from '../trainee/StepStage';

export type TestTab = 'problems' | 'paths' | 'preview';

interface TestPanelProps {
  tab: TestTab;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  issues: TreeIssue[];
  issuesLoading: boolean;
  suggestions: AISuggestion[] | null;
  aiAvailable: boolean | null;
  reviewing: boolean;
  workflowTitle: (id: string) => string | undefined;
  reducedMotion: boolean;
  onTabChange: (tab: TestTab) => void;
  onRefresh: () => void;
  onAIReview: () => void;
  onFocusNode: (id: string) => void;
  onClose: () => void;
}

/** Validation report, every answer path, and a dry run of the draft exactly as a trainee sees it. */
export const TestPanel: React.FC<TestPanelProps> = (props) => {
  const { tab, nodes, edges, issues, onTabChange, onClose } = props;
  const [previewPath, setPreviewPath] = useState<TreePath | null>(null);
  const paths = useMemo(() => enumeratePaths(nodes, edges), [nodes, edges]);
  const errors = issues.filter((issue) => issue.level === 'error');
  const wide = tab === 'preview';

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/45 backdrop-blur-[2px]" onPointerDown={(event) => event.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label={{ problems: 'Test decision tree', paths: 'All answer paths', preview: 'Preview as trainee' }[tab]}
        className={`flex h-full w-full flex-col border-l border-white/10 shadow-2xl transition-[max-width] ${wide ? 'max-w-3xl bg-slate-100' : 'max-w-md bg-[#181c22]'}`}>
        <div className={`flex items-center gap-2 border-b p-3 ${wide ? 'border-slate-200 bg-white' : 'border-white/[0.06]'}`}>
          <div role="tablist" className={`flex rounded-lg p-1 ${wide ? 'bg-slate-100' : 'bg-black/30'}`}>
            {([['problems', `Problems${issues.length ? ` (${issues.length})` : ''}`], ['paths', `Paths (${paths.length})`], ['preview', 'Preview as trainee']] as const).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => { if (key === 'preview') setPreviewPath(null); onTabChange(key); }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-blue-600 text-white' : wide ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close test panel" className={`ml-auto rounded-lg p-1.5 ${wide ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'problems' && <ProblemsTab {...props} errorCount={errors.length} />}
          {tab === 'paths' && (
            <PathsTab paths={paths} onFocusNode={props.onFocusNode}
              onRun={(path) => { setPreviewPath(path); onTabChange('preview'); }} />
          )}
          {tab === 'preview' && <WalkPreview key={previewPath ? previewPath.steps.map((s) => s.edgeId).join() : 'free'} nodes={nodes} edges={edges}
            initial={previewPath} workflowTitle={props.workflowTitle} reducedMotion={props.reducedMotion} />}
        </div>
      </div>
    </div>
  );
};

const ProblemsTab: React.FC<TestPanelProps & { errorCount: number }> = ({
  issues, issuesLoading, errorCount, suggestions, aiAvailable, reviewing, onRefresh, onAIReview, onFocusNode, onTabChange,
}) => (
  <div className="space-y-5">
    <div className="flex items-center gap-2">
      <p className="flex-1 text-xs text-slate-400" aria-live="polite">
        {issuesLoading ? 'Checking the tree…'
          : errorCount ? `${errorCount} problem${errorCount > 1 ? 's' : ''} must be fixed before submitting.`
            : issues.length ? 'Only warnings remain — you can submit.' : 'No problems found.'}
      </p>
      <button type="button" onClick={onRefresh} aria-label="Run checks again" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><RefreshCw className={`h-3.5 w-3.5 ${issuesLoading ? 'animate-spin' : ''}`} /></button>
    </div>
    {!issuesLoading && issues.length === 0 ? (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
        <p className="mt-2 text-sm font-semibold text-emerald-200">Every path reaches a result</p>
        <button type="button" onClick={() => onTabChange('paths')} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500">Test every path</button>
      </div>
    ) : (
      <ul className="space-y-2" aria-label="Problems">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`}>
            <button type="button" disabled={!issue.node_id} onClick={() => issue.node_id && onFocusNode(issue.node_id)}
              className="flex w-full items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left text-[12.5px] leading-snug text-slate-200 transition enabled:hover:border-white/20">
              {issue.level === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
              <span>{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    )}

    <section className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-300" />
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-violet-200">AI review suggestions</h3>
        <button type="button" onClick={onAIReview} disabled={reviewing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
          {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}{suggestions ? 'Review again' : 'Review tree'}
        </button>
      </div>
      {aiAvailable === false && <p className="mt-2 text-[12px] text-amber-200">The AI model is unavailable; showing rule-based checks only.</p>}
      {suggestions && (suggestions.length ? (
        <ul className="mt-3 space-y-2" aria-label="AI suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={index}>
              <button type="button" disabled={!suggestion.node_id} onClick={() => suggestion.node_id && onFocusNode(suggestion.node_id)}
                className="w-full rounded-xl bg-black/20 p-3 text-left text-[12.5px] enabled:hover:bg-black/30">
                <span className="mr-1.5 rounded bg-violet-500/25 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-violet-200">{suggestion.type.replace('_', ' ')}</span>
                <span className="text-slate-100">{suggestion.message}</span>
                {suggestion.rationale && <span className="mt-1 block text-[11.5px] text-slate-400">{suggestion.rationale}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[12px] text-slate-400">No further suggestions.</p>)}
      {!suggestions && <p className="mt-2 text-[12px] text-slate-400">Finds missing branches, duplicate or contradictory questions and missing safety steps. Suggestions never change the tree by themselves.</p>}
    </section>
  </div>
);

const OUTCOME_STYLE: Record<TreePath['outcome'], { label: string; className: string; icon: React.ElementType }> = {
  result: { label: 'Reaches result', className: 'text-emerald-300', icon: CheckCircle2 },
  loop: { label: 'Loops back', className: 'text-amber-300', icon: Repeat },
  dead_end: { label: 'Dead end', className: 'text-rose-300', icon: XCircle },
  missing: { label: 'Missing next step', className: 'text-rose-300', icon: XCircle },
};

const PathsTab: React.FC<{ paths: TreePath[]; onRun: (path: TreePath) => void; onFocusNode: (id: string) => void }> = ({ paths, onRun, onFocusNode }) => (
  <div className="space-y-2">
    <p className="text-xs text-slate-400">Every possible answer combination from the start. Run any path to walk it as a trainee.</p>
    <ol className="space-y-2" aria-label="Answer paths">
      {paths.map((path, index) => {
        const style = OUTCOME_STYLE[path.outcome];
        const Icon = style.icon;
        return (
          <li key={index} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">#{index + 1}</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${style.className}`}><Icon className="h-3.5 w-3.5" />{style.label}</span>
              <button type="button" onClick={() => onRun(path)} aria-label={`Run path ${index + 1}`} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-blue-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500"><Play className="h-3 w-3" />Run</button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              {path.steps.filter((step) => step.answer && step.answer.toLowerCase() !== 'next').map((step) => (
                <button key={step.edgeId} type="button" onClick={() => onFocusNode(step.nodeId)} className="mr-1 hover:underline">
                  {step.title} → <strong className="text-blue-300">{step.answer}</strong>;
                </button>
              ))}
              <span className="text-slate-400"> {path.endTitle}</span>
            </p>
          </li>
        );
      })}
    </ol>
  </div>
);

function buildPreviewReport(nodes: DecisionNode[], trail: Array<{ nodeId: string; edgeId: string; label: string }>, result: DecisionNode,
  workflowTitle: (id: string) => string | undefined): WalkReport {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pathNodes = trail.map((step) => byId.get(step.nodeId)!).filter(Boolean);
  const all = [...pathNodes, result];
  const safety = Array.from(new Set(all.flatMap((node) => [node.safety_warning, ...(node.details.ppe || []), ...(node.details.precautions || [])]).filter(Boolean) as string[]));
  const workflowNode = [result, ...pathNodes.slice().reverse()].find((node) => node.linked_workflow_version_id);
  return {
    problem: startNodeOf(nodes)?.title || '',
    result_title: result.title,
    summary: result.instructions,
    observations: trail.filter((step) => byId.get(step.nodeId)?.node_type === 'question').map((step) => ({ question: byId.get(step.nodeId)!.title, answer: step.label })),
    decision_path: trail.map((step) => ({ step: byId.get(step.nodeId)?.title || '', type: byId.get(step.nodeId)?.node_type || '', answer: step.label })),
    possible_causes: result.details.possible_causes || [],
    recommended_actions: result.details.recommended_actions || [],
    escalation: result.details.escalation,
    safety,
    media: [...result.media, ...pathNodes.flatMap((node) => node.media)].filter((media, index, list) => list.findIndex((m) => m.id === media.id) === index),
    references: Array.from(new Set(all.flatMap((node) => node.details.source_titles || []))).map((title) => ({ type: 'source', id: null, item_id: null, title })),
    workflow: workflowNode ? { id: workflowNode.linked_workflow_version_id!, title: workflowTitle(workflowNode.linked_workflow_version_id!) || 'Linked workflow', available: true } : null,
  };
}

const WalkPreview: React.FC<{ nodes: DecisionNode[]; edges: DecisionEdge[]; initial: TreePath | null; workflowTitle: (id: string) => string | undefined; reducedMotion: boolean }> = ({
  nodes, edges, initial, workflowTitle, reducedMotion,
}) => {
  const start = startNodeOf(nodes);
  const [trail, setTrail] = useState<Array<{ nodeId: string; edgeId: string; label: string }>>(
    () => (initial?.steps || []).filter((step) => step.edgeId).map((step) => ({ nodeId: step.nodeId, edgeId: step.edgeId!, label: step.answer || '' })));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lastEdge = trail.length ? edges.find((edge) => edge.id === trail[trail.length - 1].edgeId) : undefined;
  const current = trail.length ? (lastEdge?.to_node_id ? byId.get(lastEdge.to_node_id) : undefined) : start;

  if (!start) return <p className="text-sm text-slate-500">Add a Start step to preview the tree.</p>;
  const controls = (
    <div className="mt-4 flex gap-2">
      <button type="button" disabled={!trail.length} onClick={() => setTrail(trail.slice(0, -1))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />Previous step</button>
      <button type="button" disabled={!trail.length} onClick={() => setTrail([])} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Restart</button>
    </div>
  );
  if (!current) {
    return <div><p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">This answer has no next step yet, so a trainee would be stuck here.</p>{controls}</div>;
  }
  const answers = outgoing(edges, current.id);
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Draft preview — answers are not recorded</p>
      {isTerminal(current)
        ? <ResultReport report={buildPreviewReport(nodes, trail, current, workflowTitle)} status="resolved" reducedMotion={reducedMotion} />
        : <StepStage node={{ ...current, workflow: current.linked_workflow_version_id ? { id: current.linked_workflow_version_id, title: workflowTitle(current.linked_workflow_version_id) || 'Linked workflow', available: false } : null }}
            answers={answers} stepNumber={trail.length + 1} reducedMotion={reducedMotion}
            onAnswer={(edge) => setTrail([...trail, { nodeId: current.id, edgeId: edge.id, label: edge.label }])} />}
      {controls}
    </div>
  );
};
