import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, Check, CircleHelp, ClipboardList, Flag, GitBranch, Layers, Paperclip, ShieldAlert, Target } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { MediaShowcase } from '../../workflows/MediaShowcase';
import type { InteractiveTreeData, InteractiveTreeEdge, InteractiveTreeNode, WalkState } from '../types';

const NODE_WIDTH = 236;
const NODE_HEIGHT = 126;
const HORIZONTAL_GAP = 76;
const VERTICAL_GAP = 116;
const TOP = 34;
const SIDE = 42;

const statusLabel: Record<InteractiveTreeNode['status'], string> = {
  completed: 'Visited', current: 'Current step', available: 'Up next', locked: 'Later in tree',
  failed_attempt: 'Review needed', evidence_found: 'Evidence found',
};

const statusStyle: Record<InteractiveTreeNode['status'], string> = {
  completed: 'border-teal-300 bg-teal-50 text-slate-800',
  current: 'border-blue-500 bg-white text-slate-900 shadow-[0_8px_24px_rgba(37,99,235,0.16)] ring-2 ring-blue-100',
  available: 'border-sky-300 bg-sky-50 text-slate-800',
  locked: 'border-slate-200 bg-white text-slate-700',
  failed_attempt: 'border-rose-300 bg-rose-50 text-slate-800',
  evidence_found: 'border-cyan-300 bg-cyan-50 text-slate-800',
};

const edgeColor: Record<InteractiveTreeEdge['status'], string> = {
  completed: '#28a99c', available: '#1677bd', locked: '#9aaabd',
  failed_attempt: '#dc6471', evidence_found: '#11a4ae',
};

interface Position { x: number; y: number }
interface Layout { positions: Map<string, Position>; width: number; height: number }

function layoutTree(tree: InteractiveTreeData): Layout {
  const ids = tree.nodes.map((node) => node.id);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  const incoming = new Map(ids.map((id) => [id, [] as string[]]));
  const pending = new Map(ids.map((id) => [id, 0]));
  tree.edges.forEach((edge) => {
    if (!edge.target || !outgoing.has(edge.source) || !incoming.has(edge.target)) return;
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
    pending.set(edge.target, (pending.get(edge.target) || 0) + 1);
  });

  const queue = tree.nodes.filter((node) => node.is_start).map((node) => node.id);
  tree.nodes.forEach((node) => { if (!queue.includes(node.id) && pending.get(node.id) === 0) queue.push(node.id); });
  const ranks = new Map(ids.map((id) => [id, 0]));
  const processed = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const source = queue[cursor];
    if (processed.has(source)) continue;
    processed.add(source);
    for (const target of outgoing.get(source) || []) {
      ranks.set(target, Math.max(ranks.get(target) || 0, (ranks.get(source) || 0) + 1));
      pending.set(target, Math.max(0, (pending.get(target) || 0) - 1));
      if (pending.get(target) === 0) queue.push(target);
    }
  }

  // Keep malformed imported cycles visible at the end instead of crashing the diagram.
  const lastRank = Math.max(0, ...ranks.values());
  let cycleRank = lastRank + 1;
  tree.nodes.forEach((node) => { if (!processed.has(node.id)) ranks.set(node.id, cycleRank++); });

  const layers = new Map<number, InteractiveTreeNode[]>();
  tree.nodes.forEach((node) => {
    const rank = ranks.get(node.id) || 0;
    layers.set(rank, [...(layers.get(rank) || []), node]);
  });
  const orderedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);
  const positions = new Map<string, Position>();
  const maxLayerSize = Math.max(1, ...orderedLayers.map(([, nodes]) => nodes.length));

  orderedLayers.forEach(([rank, nodes]) => {
    if (rank > 0) {
      const previous = positions;
      nodes.sort((a, b) => {
        const parentCenter = (node: InteractiveTreeNode) => {
          const parents = incoming.get(node.id) || [];
          if (!parents.length) return Number.MAX_SAFE_INTEGER;
          return parents.reduce((total, parent) => total + (previous.get(parent)?.x ?? 0) + NODE_WIDTH / 2, 0) / parents.length;
        };
        return parentCenter(a) - parentCenter(b);
      });
    }
    const rowWidth = nodes.length * NODE_WIDTH + Math.max(0, nodes.length - 1) * HORIZONTAL_GAP;
    const left = SIDE + Math.max(0, (maxLayerSize * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP - rowWidth) / 2);
    nodes.forEach((node, index) => positions.set(node.id, {
      x: left + index * (NODE_WIDTH + HORIZONTAL_GAP),
      y: TOP + rank * (NODE_HEIGHT + VERTICAL_GAP),
    }));
  });

  return {
    positions,
    width: SIDE * 2 + maxLayerSize * NODE_WIDTH + Math.max(0, maxLayerSize - 1) * HORIZONTAL_GAP,
    height: TOP * 2 + Math.max(1, ...ranks.values()) * (NODE_HEIGHT + VERTICAL_GAP) + NODE_HEIGHT,
  };
}

const NodeIcon: React.FC<{ node: InteractiveTreeNode }> = ({ node }) => {
  if (node.is_start) return <Flag className="h-4 w-4" />;
  if (node.status === 'completed') return <Check className="h-4 w-4" />;
  if (node.node_type === 'safety') return <ShieldAlert className="h-4 w-4" />;
  if (node.node_type === 'question') return <CircleHelp className="h-4 w-4" />;
  if (node.node_type === 'result' || node.node_type === 'end') return <Target className="h-4 w-4" />;
  if (node.node_type === 'workflow') return <ClipboardList className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
};

interface Props {
  tree: InteractiveTreeData;
  path: WalkState['path'];
  busy: boolean;
  workflowBusy?: boolean;
  onChooseEdge: (edgeId: string) => void;
  onChangeAnswer: (pathIndex: number) => void;
  onStartWorkflow: (workflowId: string) => void;
}

/** A trainee friendly, top-down view of the complete published troubleshooting graph. */
export const TraineeTroubleshootingTree: React.FC<Props> = ({
  tree, path, busy, workflowBusy = false, onChooseEdge, onChangeAnswer, onStartWorkflow,
}) => {
  const canvas = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(tree.current_node_id || null);
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set());
  const reducedMotion = Boolean(useReducedMotion());
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const selected = tree.nodes.find((node) => node.id === selectedId)
    || tree.nodes.find((node) => node.id === tree.current_node_id)
    || tree.nodes.find((node) => node.is_start);

  useEffect(() => setSelectedId(tree.current_node_id || null), [tree.current_node_id]);
  useEffect(() => {
    const current = layout.positions.get(tree.current_node_id || '');
    if (current && viewport.current) viewport.current.scrollTop = Math.max(0, current.y - 42);
  }, [tree.current_node_id, layout.positions]);

  const selectNode = (node: InteractiveTreeNode) => {
    setSelectedId(node.id);
    if (!viewport.current || !canvas.current) return;
    const top = node.status === 'current' ? Math.max(0, (layout.positions.get(node.id)?.y || 0) - 42) : viewport.current.scrollTop;
    if (node.status === 'current') viewport.current.scrollTop = top;
  };

  const availableAnswer = (edge: InteractiveTreeEdge) => edge.status === 'available' && edge.source === tree.current_node_id;
  const nodeCard = (node: InteractiveTreeNode) => {
    const position = layout.positions.get(node.id)!;
    const chosen = selected?.id === node.id;
    return (
      <button key={node.id} type="button" onClick={() => selectNode(node)}
        aria-label={`${node.title}, ${statusLabel[node.status]}${node.media.length ? `, ${node.media.length} media ${node.media.length === 1 ? 'item' : 'items'}` : ''}`} aria-current={node.status === 'current' ? 'step' : undefined}
        className={`absolute flex flex-col rounded-2xl border-2 px-3.5 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${statusStyle[node.status]} ${chosen ? 'ring-2 ring-blue-100' : ''}`}
        style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}>
        <span className="flex w-full items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${node.status === 'completed' ? 'bg-teal-500 text-white' : node.status === 'current' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}><NodeIcon node={node} /></span>
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{node.kind_label}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            {node.media.length > 0 && <span title={`${node.media.length} media item${node.media.length === 1 ? '' : 's'} for this step`} className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-1.5 py-1 text-[10px] font-bold text-pink-700"><Paperclip className="h-3 w-3" />{node.media.length}</span>}
            {node.critical && <ShieldAlert className="h-4 w-4 text-rose-600" aria-label="Safety checkpoint" />}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">{node.title}</span>
        {node.instructions && <span className="mt-1 line-clamp-1 text-[10px] leading-snug text-slate-600">{node.instructions}</span>}
        <span className={`mt-auto text-[9px] font-bold uppercase tracking-[0.1em] ${node.status === 'current' ? 'text-blue-700' : node.status === 'completed' ? 'text-teal-700' : 'text-slate-400'}`}>{statusLabel[node.status]}</span>
      </button>
    );
  };

  return (
    <section aria-label="Troubleshooting decision tree" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><GitBranch className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">Troubleshooting tree</h2>
          <p className="mt-0.5 text-xs text-slate-500">Follow the highlighted route. Choose an answer on an available branch.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"><span className="h-2 w-2 rounded-full bg-blue-600" />Current step</span>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div ref={viewport} className="max-h-[70vh] min-h-[420px] min-w-0 overflow-auto scroll-smooth bg-slate-50/80 lg:border-r lg:border-slate-100" tabIndex={0} aria-label="Scrollable troubleshooting flowchart">
          <div ref={canvas} className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
            <defs><marker id="trainee-tree-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8fa0b4" /></marker></defs>
            {tree.edges.map((edge) => {
              const source = layout.positions.get(edge.source);
              const target = edge.target ? layout.positions.get(edge.target) : undefined;
              if (!source || !target) return null;
              const sx = source.x + NODE_WIDTH / 2;
              const sy = source.y + NODE_HEIGHT;
              const tx = target.x + NODE_WIDTH / 2;
              const ty = target.y;
              const curve = Math.max(42, (ty - sy) * 0.42);
              const color = edgeColor[edge.status];
              return <path key={edge.id} d={`M ${sx} ${sy} C ${sx} ${sy + curve}, ${tx} ${ty - curve}, ${tx} ${ty}`}
                fill="none" stroke={color} strokeWidth={edge.status === 'locked' ? 2 : 3} strokeOpacity={edge.status === 'locked' ? 0.65 : 0.9}
                strokeDasharray={edge.status === 'locked' ? '5 7' : undefined} markerEnd="url(#trainee-tree-arrow)" />;
            })}
          </svg>

          {tree.edges.map((edge) => {
            const source = layout.positions.get(edge.source);
            const target = edge.target ? layout.positions.get(edge.target) : undefined;
            if (!source || !target || !edge.label) return null;
            const left = (source.x + NODE_WIDTH / 2 + target.x + NODE_WIDTH / 2) / 2;
            const top = (source.y + NODE_HEIGHT + target.y) / 2;
            const common = 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-[10px] font-bold shadow-sm';
            return availableAnswer(edge)
              ? <button key={edge.id} type="button" disabled={busy} onClick={() => onChooseEdge(edge.id)} aria-label={`Choose branch ${edge.label}`}
                  className={`${common} z-10 border-blue-300 bg-white text-blue-800 transition hover:border-blue-600 hover:bg-blue-600 hover:text-white disabled:cursor-wait disabled:opacity-60`}
                  style={{ left, top }}>{edge.label}<ArrowDown className="ml-1 inline h-3 w-3" /></button>
              : <span key={edge.id} className={`${common} z-[1] border-slate-200 bg-white text-slate-600`} style={{ left, top }}>{edge.label}</span>;
          })}

            {tree.nodes.map(nodeCard)}
          </div>
        </div>

        {selected && (
        <aside className="min-w-0 border-t border-slate-100 bg-white px-4 py-4 sm:px-5 lg:sticky lg:top-4 lg:max-h-[70vh] lg:overflow-y-auto lg:border-t-0 lg:px-5" aria-label={`Selected tree step: ${selected.title}`} tabIndex={0}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">{selected.kind_label} · {statusLabel[selected.status]}</p>
              <h3 className="mt-1 text-base font-bold text-slate-900">{selected.title}</h3>
              {selected.instructions && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.instructions}</p>}
            </div>
            {(() => {
              const answered = path.find((step) => step.node_id === selected.id && step.type === 'question');
              return answered && <button type="button" disabled={busy} onClick={() => onChangeAnswer(answered.index)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Change answer: {answered.answer}</button>;
            })()}
          </div>

          {selected.safety && (selected.safety.warning || selected.safety.ppe.length || selected.safety.precautions.length || selected.safety.restricted.length) && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-900">
              {selected.safety.warning && <p className="font-semibold">{selected.safety.warning}</p>}
              {[...selected.safety.ppe.map((item) => `PPE: ${item}`), ...selected.safety.precautions, ...selected.safety.restricted.map((item) => `Do not: ${item}`)].map((item) => <p key={item} className="mt-1">{item}</p>)}
            </div>
          )}
          {selected.terms.length > 0 && <details className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold text-slate-700">Technical terms ({selected.terms.length})</summary><dl className="mt-2 space-y-1.5">{selected.terms.map((term) => <div key={term.term}><dt className="font-semibold text-slate-900">{term.term}</dt><dd className="text-slate-600">{term.definition}</dd></div>)}</dl></details>}
          {selected.workflow?.available && <button type="button" disabled={workflowBusy} onClick={() => onStartWorkflow(selected.workflow!.id)} className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50">{workflowBusy ? 'Opening procedure…' : `Open approved procedure: ${selected.workflow.title}`}</button>}
          {selected.media.length > 0 && <section aria-labelledby={`selected-step-media-${selected.id}`} className="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 id={`selected-step-media-${selected.id}`} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-200 text-slate-700"><Layers className="h-3.5 w-3.5" /></span>
                Learning materials for this step
              </h4>
              <span className="font-mono text-[10px] font-semibold text-slate-500">{selected.media.length} attached</span>
            </div>
              <MediaShowcase assets={selected.media} failedIds={failedMedia} reducedMotion={reducedMotion} showStatus={false} compact
              onMediaError={(id) => setFailedMedia((old) => new Set(old).add(id))} onRetry={(id) => setFailedMedia((old) => { const next = new Set(old); next.delete(id); return next; })} />
          </section>}
        </aside>
        )}
      </div>
    </section>
  );
};
