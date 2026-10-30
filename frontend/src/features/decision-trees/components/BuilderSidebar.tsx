import React, { useMemo, useState } from 'react';
import { CornerDownRight, GitBranchPlus, ListTree, Search, Shapes } from 'lucide-react';
import { isBranching, isTerminal, outgoing, startNodeOf } from '../graph';
import { PALETTE, nodeTypeConfig } from '../nodeTypes';
import type { DecisionEdge, DecisionNode, DecisionNodeType } from '../types';
import { PALETTE_DRAG_TYPE, type Selection } from './BuilderCanvas';

interface BuilderSidebarProps {
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  selection: Selection;
  readOnly: boolean;
  search: string;
  matchCount: number;
  flaggedIds: Set<string>;
  onSearch: (value: string) => void;
  onQuickAdd: (type: DecisionNodeType) => void;
  onAddAnswer: () => void;
  onFocusNode: (id: string) => void;
}

/** Steps in reading order: breadth-first from the start, then anything unreachable. */
function outlineOrder(nodes: DecisionNode[], edges: DecisionEdge[]): Array<{ node: DecisionNode; depth: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const order: Array<{ node: DecisionNode; depth: number }> = [];
  const start = startNodeOf(nodes);
  const queue: Array<{ id: string; depth: number }> = start ? [{ id: start.id, depth: 0 }] : [];
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    const node = byId.get(id);
    if (!node || seen.has(id)) continue;
    seen.add(id);
    order.push({ node, depth });
    outgoing(edges, id).forEach((edge) => edge.to_node_id && queue.push({ id: edge.to_node_id, depth: depth + 1 }));
  }
  nodes.forEach((node) => { if (!seen.has(node.id)) order.push({ node, depth: 0 }); });
  return order;
}

export const BuilderSidebar: React.FC<BuilderSidebarProps> = ({
  nodes, edges, selection, readOnly, search, matchCount, flaggedIds, onSearch, onQuickAdd, onAddAnswer, onFocusNode,
}) => {
  const [tab, setTab] = useState<'library' | 'outline'>('library');
  const outline = useMemo(() => outlineOrder(nodes, edges), [nodes, edges]);
  const selectedNode = selection?.kind === 'node' ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? edges.find((edge) => edge.id === selection.id) : undefined;
  const anchor = selectedEdge
    ? `answer “${selectedEdge.label}”`
    : selectedNode && !isTerminal(selectedNode) ? `“${selectedNode.title}”` : null;

  return (
    <aside aria-label="Builder sidebar" className="flex shrink-0 flex-col border-b border-white/[0.06] bg-[#181c22] lg:w-[248px] lg:border-b-0 lg:border-r">
      <div role="tablist" aria-label="Sidebar sections" className="flex gap-1 border-b border-white/[0.06] p-2">
        {([['library', 'Node library', Shapes], ['outline', 'Tree outline', ListTree]] as const).map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${tab === key ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <div className="flex gap-2 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          <p className="hidden text-[11px] leading-relaxed text-slate-400 lg:block">
            {readOnly ? 'This version is read-only.'
              : anchor ? <>New steps connect after {anchor}.</>
                : 'Select a step first to connect new steps automatically, or drag a step onto the canvas.'}
          </p>
          <button type="button" disabled={readOnly || !selectedNode || !isBranching(selectedNode)} onClick={onAddAnswer}
            title={selectedNode && isBranching(selectedNode) ? 'Add an answer to the selected question' : 'Select a question to add answers'}
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-left text-[12px] font-semibold text-blue-100 transition hover:border-blue-400/60 disabled:cursor-not-allowed disabled:opacity-40">
            <GitBranchPlus className="h-4 w-4 text-blue-300" />Add Answer
          </button>
          {PALETTE.map(({ type, addLabel, hint, icon: Icon, accent }) => (
            <button key={type} type="button" draggable={!readOnly} disabled={readOnly}
              onDragStart={(event) => { event.dataTransfer.setData(PALETTE_DRAG_TYPE, type); event.dataTransfer.effectAllowed = 'copy'; }}
              onClick={() => onQuickAdd(type)} title={hint} aria-label={addLabel}
              className="group flex shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#1f242c] px-3 py-2 text-left transition hover:-translate-y-px hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-grab">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}22`, color: accent }}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[12px] font-semibold text-slate-100">{addLabel}</span>
                <span className="hidden truncate text-[10.5px] text-slate-500 lg:block">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="relative m-3 block">
            <span className="sr-only">Search steps</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search steps and answers"
              className="w-full rounded-lg border border-white/[0.08] bg-[#14171c] py-2 pl-8 pr-2 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
          </label>
          {search && <p className="px-3 pb-2 text-[11px] text-slate-400" aria-live="polite">{matchCount} matching step{matchCount === 1 ? '' : 's'}</p>}
          <ul className="max-h-48 flex-1 overflow-y-auto px-2 pb-3 lg:max-h-none" aria-label="Steps">
            {outline.map(({ node, depth }) => {
              const config = nodeTypeConfig(node.node_type);
              const Icon = config.icon;
              const selected = selection?.kind === 'node' && selection.id === node.id;
              return (
                <li key={node.id}>
                  <button type="button" onClick={() => onFocusNode(node.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition ${selected ? 'bg-blue-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.04]'}`}
                    style={{ paddingLeft: 8 + Math.min(depth, 6) * 10 }}>
                    {depth > 0 && <CornerDownRight className="h-3 w-3 shrink-0 text-slate-600" />}
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.accent }} />
                    <span className="truncate">{node.title}</span>
                    {flaggedIds.has(node.id) && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="Has problems" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
};
