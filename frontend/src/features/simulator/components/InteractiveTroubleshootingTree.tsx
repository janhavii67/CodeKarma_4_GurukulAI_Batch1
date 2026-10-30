import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity, AlertTriangle, AudioLines, BookOpen, Check, CheckCircle2, CircleDot, ClipboardCheck, FileText, Flag, GitBranch,
  LockKeyhole, Maximize2, Minus, Plus, ShieldAlert, ShieldCheck, Sparkles, Target, Wrench,
} from 'lucide-react';
import { MediaShowcase } from '../../workflows/MediaShowcase';
import type { InteractiveTreeData, InteractiveTreeNode, InteractiveTreeNodeStatus } from '../../decision-trees/types';

const NODE_W = 236;
const NODE_H = 112;
const X_GAP = 112;
const Y_GAP = 34;

const NODE_STYLE: Record<InteractiveTreeNodeStatus, { label: string; classes: string; dot: string }> = {
  completed: { label: 'Completed', classes: 'border-emerald-400/45 bg-emerald-500/[0.10] text-emerald-50', dot: 'bg-emerald-400' },
  current: { label: 'Current stage', classes: 'border-amber-300 bg-amber-400/[0.13] text-white shadow-[0_0_28px_rgba(251,191,36,0.18)]', dot: 'bg-amber-300' },
  available: { label: 'Available', classes: 'border-sky-400/45 bg-sky-500/[0.09] text-sky-50', dot: 'bg-sky-400' },
  locked: { label: 'Locked', classes: 'border-slate-700/80 bg-slate-900/80 text-slate-500', dot: 'bg-slate-600' },
  failed_attempt: { label: 'Failed attempt', classes: 'border-rose-400/50 bg-rose-500/[0.10] text-rose-100', dot: 'bg-rose-400' },
  evidence_found: { label: 'Evidence found', classes: 'border-cyan-300/50 bg-cyan-500/[0.11] text-cyan-50', dot: 'bg-cyan-300' },
};

const NODE_ICON: Record<string, React.ElementType> = {
  start: Flag, inspection: Activity, diagnostic_test: Target, evidence: FileText, decision: GitBranch,
  multi_action: ClipboardCheck, safety_checkpoint: ShieldAlert, procedure: ClipboardCheck,
  explanation: AudioLines, fault_identification: Sparkles, corrective_action: Wrench,
  verification: ShieldCheck, mission_complete: CheckCircle2,
};

const EDGE_COLOR = {
  completed: '#34d399', available: '#fbbf24', evidence_found: '#22d3ee', failed_attempt: '#fb7185', locked: '#334155',
} as const;

interface Point { x: number; y: number; column: number; row: number }

function layoutTree(tree: InteractiveTreeData) {
  const ids = tree.nodes.map((node) => node.id);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  tree.edges.forEach((edge) => {
    if (edge.target && outgoing.has(edge.source) && indegree.has(edge.target)) {
      outgoing.get(edge.source)!.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    }
  });

  const queue = tree.nodes.filter((node) => node.is_start).map((node) => node.id);
  tree.nodes.forEach((node) => { if (!queue.includes(node.id) && indegree.get(node.id) === 0) queue.push(node.id); });
  const rank = new Map(ids.map((id) => [id, 0]));
  const pending = new Map(indegree);
  const processed = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (processed.has(id)) continue;
    processed.add(id);
    for (const target of outgoing.get(id) || []) {
      rank.set(target, Math.max(rank.get(target) || 0, (rank.get(id) || 0) + 1));
      pending.set(target, Math.max(0, (pending.get(target) || 0) - 1));
      if (pending.get(target) === 0) queue.push(target);
    }
  }
  // Cyclic or malformed imported trees still render deterministically instead of disappearing.
  tree.nodes.forEach((node, index) => {
    if (!processed.has(node.id)) rank.set(node.id, Math.max(rank.get(node.id) || 0, index));
  });

  const columns = new Map<number, InteractiveTreeNode[]>();
  tree.nodes.forEach((node) => {
    const column = rank.get(node.id) || 0;
    columns.set(column, [...(columns.get(column) || []), node]);
  });
  const positions = new Map<string, Point>();
  [...columns.entries()].sort((a, b) => a[0] - b[0]).forEach(([column, nodes]) => {
    nodes.forEach((node, row) => positions.set(node.id, { x: 32 + column * (NODE_W + X_GAP), y: 32 + row * (NODE_H + Y_GAP), column, row }));
  });
  const maxColumn = Math.max(0, ...[...positions.values()].map((point) => point.column));
  const maxRow = Math.max(0, ...[...columns.values()].map((nodes) => nodes.length - 1));
  return { positions, width: Math.max(900, 64 + (maxColumn + 1) * (NODE_W + X_GAP)), height: Math.max(370, 64 + (maxRow + 1) * (NODE_H + Y_GAP)) };
}

interface Props {
  tree: InteractiveTreeData;
  selectedNodeId?: string | null;
  onSelectNode: (node: InteractiveTreeNode) => void;
  onCenterCurrent?: () => void;
}

/** A disclosure-safe map of the exact published expert tree. Actions remain controlled by the attempt API. */
export const InteractiveTroubleshootingTree: React.FC<Props> = ({ tree, selectedNodeId, onSelectNode, onCenterCurrent }) => {
  const reducedMotion = Boolean(useReducedMotion());
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(0.78);
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const selected = tree.nodes.find((node) => node.id === selectedNodeId) || tree.nodes.find((node) => node.id === tree.current_node_id);

  useEffect(() => {
    const bounds = viewport.current;
    if (!bounds) return;
    const fit = Math.min(bounds.clientWidth / layout.width, bounds.clientHeight / layout.height);
    if (Number.isFinite(fit) && fit > 0) setZoom(Math.max(0.3, Math.min(1.05, fit * 0.94)));
  }, [layout.height, layout.width]);

  const centerCurrent = () => {
    const point = layout.positions.get(tree.current_node_id || '');
    if (point && viewport.current) {
      viewport.current.scrollTo({ left: Math.max(0, (point.x + NODE_W / 2) * zoom - viewport.current.clientWidth / 2),
        top: Math.max(0, (point.y + NODE_H / 2) * zoom - viewport.current.clientHeight / 2), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    onCenterCurrent?.();
  };
  const fitTree = () => {
    const bounds = viewport.current;
    const nextZoom = bounds ? Math.max(0.3, Math.min(1.15, (Math.min(bounds.clientWidth / layout.width, bounds.clientHeight / layout.height)) * 0.94)) : 0.78;
    setZoom(nextZoom);
    bounds?.scrollTo({ left: 0, top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button')) return;
    drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  };

  return (
    <section aria-label="Complete troubleshooting tree" className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111923]">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-white"><GitBranch className="h-4 w-4 text-amber-300" />Expert troubleshooting tree</p>
          <p className="mt-0.5 text-xs text-slate-500">Full published structure · locked outcomes stay concealed until reached</p>
        </div>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))} aria-label="Zoom out" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><Minus className="h-4 w-4" /></button>
        <span className="w-12 text-center font-mono text-xs text-slate-400" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.15, value + 0.1))} aria-label="Zoom in" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={centerCurrent} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 px-2.5 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"><Target className="h-3.5 w-3.5" />Center current</button>
        <button type="button" onClick={fitTree} aria-label="Fit tree" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><Maximize2 className="h-4 w-4" /></button>
      </header>

      <div ref={viewport} className="relative max-h-[590px] cursor-grab overflow-auto overscroll-contain active:cursor-grabbing" tabIndex={0} aria-label="Scrollable troubleshooting tree canvas"
        onPointerDown={beginPan} onPointerMove={pan} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div style={{ width: layout.width * zoom, height: layout.height * zoom, minWidth: '100%' }}>
          <div className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible" width={layout.width} height={layout.height}>
              <defs><marker id="tree-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
              {tree.edges.map((edge) => {
                const source = layout.positions.get(edge.source);
                const target = edge.target ? layout.positions.get(edge.target) : undefined;
                if (!source || !target) return null;
                const sx = source.x + NODE_W;
                const sy = source.y + NODE_H / 2;
                const tx = target.x;
                const ty = target.y + NODE_H / 2;
                const curve = Math.max(50, Math.abs(tx - sx) * 0.44);
                const path = `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
                const active = edge.status !== 'locked';
                return <g key={edge.id}>
                  <path d={path} fill="none" stroke={EDGE_COLOR[edge.status]} strokeWidth={active ? 2.5 : 1.5} strokeOpacity={active ? 0.88 : 0.38} strokeDasharray={active ? '7 6' : '4 8'} markerEnd="url(#tree-arrowhead)">
                    {active && !reducedMotion && <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.5s" repeatCount="indefinite" />}
                  </path>
                  {edge.label && <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 7} fill={EDGE_COLOR[edge.status]} fontSize="11" textAnchor="middle">{edge.label.length > 28 ? `${edge.label.slice(0, 25)}…` : edge.label}</text>}
                </g>;
              })}
            </svg>

            {tree.nodes.map((node) => {
              const point = layout.positions.get(node.id)!;
              const style = NODE_STYLE[node.status];
              const Icon = NODE_ICON[node.kind] || CircleDot;
              const canReview = node.status !== 'locked' && node.status !== 'failed_attempt';
              const isSelected = selected?.id === node.id;
              return (
                <button key={node.id} type="button" disabled={!canReview} onClick={() => onSelectNode(node)}
                  aria-label={`${node.title}, ${style.label}${node.critical ? ', critical checkpoint' : ''}${node.evidence_found ? ', evidence found' : ''}`}
                  aria-current={node.status === 'current' ? 'step' : undefined}
                  className={`absolute flex flex-col justify-between overflow-hidden rounded-2xl border p-3 text-left transition ${style.classes} ${node.is_final ? 'rounded-[26px]' : ''} ${isSelected ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#111923]' : ''} ${canReview ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-not-allowed'}`}
                  style={{ left: point.x, top: point.y, width: NODE_W, height: NODE_H }}>
                  <span className="flex w-full items-start gap-2">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${node.evidence_found ? 'bg-cyan-300/15 text-cyan-200' : node.status === 'locked' ? 'bg-white/[0.04] text-slate-600' : 'bg-white/[0.07] text-current'}`}>
                      {node.status === 'locked' ? <LockKeyhole className="h-4 w-4" /> : node.status === 'failed_attempt' ? <AlertTriangle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">{node.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wider opacity-65">{node.kind_label}</span>
                    </span>
                    {node.critical && <ShieldAlert className="h-4 w-4 shrink-0 text-rose-300" aria-label="Critical checkpoint" />}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{style.label}</span>
                    {node.visit_order && <span className="font-mono opacity-65">STEP {node.visit_order}</span>}
                    {node.is_final && node.status === 'completed' && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                  </span>
                  {node.status === 'current' && !reducedMotion && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl border border-amber-200/60" animate={{ opacity: [0.2, 0.75, 0.2] }} transition={{ duration: 2.2, repeat: Infinity }} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 z-10 hidden w-36 rounded-xl border border-white/10 bg-slate-950/85 p-2 shadow-lg sm:block" aria-label="Tree minimap">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Tree overview</p>
          <div className="relative h-16 overflow-hidden rounded-md bg-white/[0.03]">
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-full w-full">
              {tree.edges.map((edge) => {
                const from = layout.positions.get(edge.source);
                const to = edge.target ? layout.positions.get(edge.target) : undefined;
                return from && to ? <line key={edge.id} x1={from.x + NODE_W / 2} y1={from.y + NODE_H / 2} x2={to.x + NODE_W / 2} y2={to.y + NODE_H / 2} stroke={EDGE_COLOR[edge.status]} strokeWidth={Math.max(4, layout.width / 240)} opacity="0.75" /> : null;
              })}
              {tree.nodes.map((node) => {
                const point = layout.positions.get(node.id)!;
                return <rect key={node.id} x={point.x} y={point.y} width={NODE_W} height={NODE_H} rx="12" fill={EDGE_COLOR[node.status === 'current' ? 'available' : node.status === 'completed' ? 'completed' : node.status === 'evidence_found' ? 'evidence_found' : node.status === 'failed_attempt' ? 'failed_attempt' : 'locked']} />;
              })}
            </svg>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.06] px-4 py-2.5" aria-label="Tree state legend">
        {(['completed', 'current', 'available', 'locked', 'failed_attempt', 'evidence_found'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className={`h-2 w-2 rounded-full ${NODE_STYLE[status].dot}`} />{NODE_STYLE[status].label}</span>
        ))}
      </footer>

      {selected && (
        <section className="border-t border-white/[0.07] bg-[#151f2b] p-4 sm:p-5" aria-label={`Selected node details: ${selected.title}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/[0.07] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{selected.kind_label}</span>
            {selected.zone && <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-slate-400">{selected.zone}</span>}
            {selected.critical && <span className="rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase text-rose-200">Critical checkpoint</span>}
            {selected.status === 'available' && <span className="ml-auto text-[11px] text-sky-200">Choose this branch from the current task panel to continue.</span>}
          </div>
          <h3 className="mt-2 text-base font-bold text-white">{selected.title}</h3>
          {selected.instructions && <p className="mt-1 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{selected.instructions}</p>}
          {selected.safety && (selected.safety.warning || selected.safety.ppe.length || selected.safety.precautions.length || selected.safety.restricted.length) && (
            <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-3 text-xs text-rose-100">
              {selected.safety.warning && <p className="font-semibold">{selected.safety.warning}</p>}
              {[...selected.safety.ppe.map((item) => `PPE: ${item}`), ...selected.safety.precautions, ...selected.safety.restricted.map((item) => `Do not: ${item}`)].map((item) => <p key={item} className="mt-1">{item}</p>)}
            </div>
          )}
          {selected.findings.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Findings from this tree stage">
              {selected.findings.map((finding) => (
                <li key={finding.key} className="rounded-xl border border-cyan-300/20 bg-cyan-500/[0.07] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Evidence found · {finding.title}</p>
                  {finding.clue && <p className="mt-1 text-sm leading-relaxed text-slate-200">{finding.clue}</p>}
                  {finding.reading && <p className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs"><span className="text-slate-400">{finding.reading.label || 'Reading'}</span><span className="font-mono font-bold text-white">{finding.reading.value} {finding.reading.unit}<span className="ml-2 font-normal text-slate-500">ref {finding.reading.normal || '—'}</span></span></p>}
                  {finding.zone && <p className="mt-1 text-[10px] text-slate-500">{finding.zone}</p>}
                </li>
              ))}
            </ul>
          )}
          {selected.terms.length > 0 && <details className="mt-3 rounded-xl border border-white/[0.07] px-3 py-2 text-sm"><summary className="cursor-pointer text-slate-300">Technical terms ({selected.terms.length})</summary><dl className="mt-2 space-y-1.5">{selected.terms.map((term) => <div key={term.term}><dt className="font-semibold text-white">{term.term}</dt><dd className="text-slate-400">{term.definition}</dd></div>)}</dl></details>}
          {selected.workflow?.available && <p className="mt-3 flex items-center gap-2 rounded-xl border border-sky-300/15 bg-sky-500/[0.06] p-3 text-xs text-sky-100"><BookOpen className="h-4 w-4 shrink-0 text-sky-300" /><span><strong>Approved reference procedure</strong><br />{selected.workflow.title}</span></p>}
          {selected.media.length > 0 && <div className="mt-3"><MediaShowcase assets={selected.media} failedIds={new Set()} reducedMotion={reducedMotion} showStatus={false} onMediaError={() => undefined} onRetry={() => undefined} /></div>}
          {selected.status === 'current' && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-200"><Target className="h-3.5 w-3.5" />Use the task panel below to inspect evidence and make a validated choice.</p>}
        </section>
      )}
    </section>
  );
};
