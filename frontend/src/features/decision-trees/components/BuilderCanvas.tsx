import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Crosshair, Film, Maximize2, Minus, Plus, ShieldAlert, Workflow } from 'lucide-react';
import { edgeAnchor, edgePath, isBranching, isTerminal, NODE_HEIGHT, NODE_WIDTH, outgoing } from '../graph';
import { nodeTypeConfig } from '../nodeTypes';
import type { DecisionEdge, DecisionNode, DecisionNodeType, Point } from '../types';
import { parseEdgeSim } from './SimulationFields';

/** Simulator checks and wrong/unsafe choices never navigate, so they need no destination. */
const simOnly = (edge: DecisionEdge) => ['reveal', 'wrong', 'unsafe'].includes(parseEdgeSim(edge.condition).outcome || '');
const SIM_LABEL: Record<string, string> = { reveal: 'check', wrong: 'wrong', unsafe: 'unsafe' };

export type Selection = { kind: 'node' | 'edge'; id: string } | null;
export interface Viewport { x: number; y: number; zoom: number }

export const PALETTE_DRAG_TYPE = 'application/x-decision-node';
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const MINIMAP_W = 184;
const MINIMAP_H = 120;

interface BuilderCanvasProps {
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  positions: Record<string, Point>;
  selection: Selection;
  readOnly: boolean;
  /** Changing this value fits the whole tree into view. */
  fitRequest: number;
  /** Changing ``seq`` centres the given step. */
  focusRequest?: { nodeId: string; seq: number } | null;
  /** Steps with validation problems. */
  flaggedIds?: Set<string>;
  /** Steps matching the current search. */
  matchIds?: Set<string>;
  onSelect: (selection: Selection) => void;
  onMoveStart?: (id: string) => void;
  onMoveNode: (id: string, point: Point) => void;
  onMoveEnd: (id: string) => void;
  /** ``edgeId`` is set when an existing answer was dragged to a new destination. */
  onConnect: (fromId: string, toId: string, edgeId?: string) => void;
  onDropNode: (type: DecisionNodeType, point: Point) => void;
  onViewportCenter?: (getCenter: () => Point) => void;
}

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; origin: Viewport; moved: boolean }
  | { kind: 'node'; id: string; offset: Point; moved: boolean }
  | { kind: 'connect'; fromId: string; edgeId?: string; anchor: Point; pointer: Point };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
const nodeAt = (clientX: number, clientY: number) =>
  (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest('[data-node-id]')?.getAttribute('data-node-id') || null;

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({
  nodes, edges, positions, selection, readOnly, fitRequest, focusRequest, flaggedIds, matchIds,
  onSelect, onMoveStart, onMoveNode, onMoveEnd, onConnect, onDropNode, onViewportCenter,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  gestureRef.current = gesture;
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    return { x: (clientX - (rect?.left || 0) - vp.x) / vp.zoom, y: (clientY - (rect?.top || 0) - vp.y) / vp.zoom };
  }, []);

  const bounds = useMemo(() => {
    const points = nodes.map((node) => positions[node.id]).filter(Boolean);
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x + NODE_WIDTH)), maxY: Math.max(...points.map((p) => p.y + NODE_HEIGHT)),
    };
  }, [nodes, positions]);

  const fit = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    if (!bounds) {
      setViewport({ x: rect.width / 2 - NODE_WIDTH / 2, y: 80, zoom: 1 });
      return;
    }
    const padding = 80;
    const zoom = clampZoom(Math.min((rect.width - padding * 2) / (bounds.maxX - bounds.minX || 1), (rect.height - padding * 2) / (bounds.maxY - bounds.minY || 1), 1.1));
    setViewport({ zoom, x: rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom, y: rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom });
  }, [bounds]);

  const fittedOnce = useRef(false);
  useLayoutEffect(() => {
    if (!fittedOnce.current && Object.keys(positions).length >= nodes.length) {
      fittedOnce.current = true;
      fit();
    }
  }, [fit, nodes.length, positions]);
  useEffect(() => { if (fitRequest) fit(); }, [fitRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const centreOn = useCallback((point: Point) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewport((vp) => ({ ...vp, x: rect.width / 2 - point.x * vp.zoom, y: rect.height / 2 - point.y * vp.zoom }));
  }, []);

  useEffect(() => {
    const point = focusRequest ? positions[focusRequest.nodeId] : undefined;
    if (point) centreOn({ x: point.x + NODE_WIDTH / 2, y: point.y + NODE_HEIGHT / 2 });
  }, [focusRequest?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onViewportCenter?.(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      return toWorld((rect?.left || 0) + (rect?.width || 0) / 2 - NODE_WIDTH / 2, (rect?.top || 0) + (rect?.height || 0) / 2 - NODE_HEIGHT / 2);
    });
  }, [onViewportCenter, toWorld]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;
    setViewport((vp) => {
      const zoom = clampZoom(vp.zoom * factor);
      const scale = zoom / vp.zoom;
      return { zoom, x: cx - (cx - vp.x) * scale, y: cy - (cy - vp.y) * scale };
    });
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
      } else {
        setViewport((vp) => ({ ...vp, x: vp.x - event.deltaX }));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Window-level listeners keep drags alive when the pointer leaves a node.
  useEffect(() => {
    if (!gesture) return;
    const onMove = (event: PointerEvent) => {
      const current = gestureRef.current;
      if (!current) return;
      if (current.kind === 'pan') {
        const dx = event.clientX - current.startX;
        const dy = event.clientY - current.startY;
        setViewport({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
        if (!current.moved && Math.hypot(dx, dy) > 3) setGesture({ ...current, moved: true });
      } else if (current.kind === 'node') {
        const world = toWorld(event.clientX, event.clientY);
        if (!current.moved) {
          onMoveStart?.(current.id);
          setGesture({ ...current, moved: true });
        }
        onMoveNode(current.id, { x: Math.round(world.x - current.offset.x), y: Math.round(world.y - current.offset.y) });
      } else {
        setGesture({ ...current, pointer: toWorld(event.clientX, event.clientY) });
        const target = nodeAt(event.clientX, event.clientY);
        setHoverTarget(target && target !== current.fromId ? target : null);
      }
    };
    const onUp = (event: PointerEvent) => {
      const current = gestureRef.current;
      if (current?.kind === 'pan' && !current.moved) onSelect(null);
      if (current?.kind === 'node' && current.moved) onMoveEnd(current.id);
      if (current?.kind === 'connect') {
        const target = nodeAt(event.clientX, event.clientY);
        if (target && target !== current.fromId) onConnect(current.fromId, target, current.edgeId);
      }
      setHoverTarget(null);
      setGesture(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gesture !== null, onConnect, onMoveEnd, onMoveNode, onMoveStart, onSelect, toWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNodeDrag = (event: React.PointerEvent, node: DecisionNode) => {
    event.stopPropagation();
    onSelect({ kind: 'node', id: node.id });
    if (readOnly || (event.button !== undefined && event.button !== 0)) return;
    const world = toWorld(event.clientX, event.clientY);
    const point = positions[node.id] || { x: 0, y: 0 };
    setGesture({ kind: 'node', id: node.id, offset: { x: world.x - point.x, y: world.y - point.y }, moved: false });
  };

  const startConnect = (event: React.PointerEvent, node: DecisionNode, edgeId?: string) => {
    event.stopPropagation();
    if (readOnly) return;
    const point = positions[node.id] || { x: 0, y: 0 };
    const anchor = edgeId ? edgeAnchor(point, node, edges, edgeId) : { x: point.x + NODE_WIDTH / 2, y: point.y + NODE_HEIGHT };
    setGesture({ kind: 'connect', fromId: node.id, edgeId, anchor, pointer: toWorld(event.clientX, event.clientY) });
  };

  const onDrop = (event: React.DragEvent) => {
    const type = event.dataTransfer.getData(PALETTE_DRAG_TYPE) as DecisionNodeType;
    if (!type || readOnly) return;
    event.preventDefault();
    const world = toWorld(event.clientX, event.clientY);
    onDropNode(type, { x: Math.round(world.x - NODE_WIDTH / 2), y: Math.round(world.y - NODE_HEIGHT / 2) });
  };

  const gridSize = 24 * viewport.zoom;
  const activeEdgeId = selection?.kind === 'edge' ? selection.id : null;
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;

  return (
    <div
      ref={containerRef}
      data-testid="decision-canvas"
      className={`relative h-full w-full select-none overflow-hidden bg-[#14171c] ${gesture?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.13) 1px, transparent 1.3px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={(event) => {
        if (event.button !== undefined && event.button !== 0 && event.button !== 1) return;
        setGesture({ kind: 'pan', startX: event.clientX, startY: event.clientY, origin: viewportRef.current, moved: false });
      }}
      onDragOver={(event) => { if (!readOnly && event.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) event.preventDefault(); }}
      onDrop={onDrop}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          <defs>
            {[['dt-arrow', '#64748b'], ['dt-arrow-active', '#3b82f6'], ['dt-arrow-warn', '#f59e0b']].map(([id, fill]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => {
            const fromPoint = positions[edge.from_node_id];
            if (!fromPoint) return null;
            const anchor = edgeAnchor(fromPoint, byId.get(edge.from_node_id), edges, edge.id);
            const active = activeEdgeId === edge.id || (selectedNodeId !== null && (edge.from_node_id === selectedNodeId || edge.to_node_id === selectedNodeId));
            const toPoint = edge.to_node_id ? positions[edge.to_node_id] : undefined;
            if (!toPoint) {
              // An answer without a destination: a short dashed stub the expert can drag from.
              return (
                <g key={edge.id} className="pointer-events-auto cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: 'edge', id: edge.id }); }}>
                  <path d={`M ${anchor.x} ${anchor.y} L ${anchor.x} ${anchor.y + (simOnly(edge) ? 24 : 46)}`} stroke={simOnly(edge) ? '#64748b' : '#f59e0b'} strokeWidth={1.8} strokeDasharray="4 4" markerEnd={simOnly(edge) ? undefined : 'url(#dt-arrow-warn)'} />
                </g>
              );
            }
            const { d } = edgePath(anchor, toPoint);
            return (
              <g key={edge.id} className="pointer-events-auto cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: 'edge', id: edge.id }); }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                <path d={d} fill="none" className="dt-edge" stroke={active ? '#3b82f6' : '#475569'} strokeWidth={active ? 2.4 : 1.6}
                  markerEnd={`url(#${active ? 'dt-arrow-active' : 'dt-arrow'})`} style={active ? { filter: 'drop-shadow(0 0 4px rgba(59,130,246,0.6))' } : undefined} />
              </g>
            );
          })}
          {gesture?.kind === 'connect' && (
            <path d={edgePath(gesture.anchor, { x: gesture.pointer.x - NODE_WIDTH / 2, y: gesture.pointer.y }).d}
              fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 5" markerEnd="url(#dt-arrow-active)" />
          )}
        </svg>

        {edges.map((edge) => {
          const fromPoint = positions[edge.from_node_id];
          const source = byId.get(edge.from_node_id);
          if (!fromPoint || !source || (isBranching(source) && (edge.to_node_id || simOnly(edge)))) return null;
          // Question answers are labelled on the node itself; label single "Next" links and dangling answers only when useful.
          if (edge.to_node_id && edge.label.toLowerCase() === 'next') return null;
          const anchor = edgeAnchor(fromPoint, source, edges, edge.id);
          const toPoint = edge.to_node_id ? positions[edge.to_node_id] : undefined;
          const mid = toPoint ? edgePath(anchor, toPoint).mid : { x: anchor.x, y: anchor.y + 58 };
          return (
            <button key={`label-${edge.id}`} type="button" aria-label={`Branch ${edge.label}`}
              onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: 'edge', id: edge.id }); }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toPoint || simOnly(edge) ? 'border-white/10 bg-[#232830] text-slate-300' : 'border-amber-400/60 bg-amber-500/15 text-amber-200'}`}
              style={{ left: mid.x, top: toPoint ? mid.y : anchor.y + (simOnly(edge) ? 36 : 58) }}>
              {toPoint ? edge.label : simOnly(edge) ? `${edge.label} · sim ${SIM_LABEL[parseEdgeSim(edge.condition).outcome!]}` : `${edge.label}: choose next step`}
            </button>
          );
        })}

        {nodes.map((node) => {
          const point = positions[node.id];
          if (!point) return null;
          const config = nodeTypeConfig(node.node_type);
          const Icon = config.icon;
          const selected = selectedNodeId === node.id;
          const answers = outgoing(edges, node.id);
          const canConnect = !readOnly && !isTerminal(node) && (isBranching(node) || answers.length === 0);
          const dimmed = matchIds && matchIds.size > 0 && !matchIds.has(node.id);
          const ring = selected ? 'ring-2 ring-blue-400/70 shadow-[0_0_0_6px_rgba(59,130,246,0.15),0_18px_40px_-14px_rgba(59,130,246,0.55)]'
            : hoverTarget === node.id ? 'ring-2 ring-blue-400/50'
              : matchIds?.has(node.id) ? 'ring-2 ring-yellow-300/70'
                : flaggedIds?.has(node.id) ? 'ring-1 ring-amber-400/70' : '';
          const shape = node.node_type === 'start' || isTerminal(node) ? 'rounded-[22px]' : 'rounded-2xl';
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${config.label} node: ${node.title}`}
              aria-pressed={selected}
              onPointerDown={(event) => startNodeDrag(event, node)}
              onKeyDown={(event) => { if (event.key === 'Enter') onSelect({ kind: 'node', id: node.id }); }}
              className={`group absolute border bg-[#1f242c]/95 px-3.5 pb-3 pt-3 text-left shadow-[0_14px_34px_-16px_rgba(0,0,0,0.85)] backdrop-blur transition-[box-shadow,opacity] duration-200 ${shape} ${ring} ${dimmed ? 'opacity-35' : ''} ${readOnly ? 'cursor-pointer' : 'cursor-move'}`}
              style={{
                left: point.x, top: point.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT,
                borderColor: selected ? '#60a5fa' : `${config.accent}40`,
                backgroundImage: `linear-gradient(180deg, ${config.accent}14, transparent 46%)`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${config.accent}26`, color: config.accent }}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: config.accent }}>{config.label}</span>
                {node.origin === 'ai_draft' && <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-200" title="AI draft — needs expert review"><Bot className="h-2.5 w-2.5" />Review</span>}
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-slate-100">{node.title}</p>
              {(node.media.length > 0 || node.safety_warning || node.linked_workflow_version_id) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {node.safety_warning && <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300"><ShieldAlert className="h-2.5 w-2.5" />Safety</span>}
                  {node.media.length > 0 && <span className="inline-flex items-center gap-1 rounded bg-pink-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-pink-300"><Film className="h-2.5 w-2.5" />{node.media.length}</span>}
                  {node.linked_workflow_version_id && <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300"><Workflow className="h-2.5 w-2.5" />Workflow</span>}
                </div>
              )}
              {isBranching(node) && answers.length > 0 && (
                <div className="mt-2.5 flex justify-around gap-1">
                  {answers.map((edge) => (
                    <span key={edge.id} className="relative flex min-w-0 flex-col items-center">
                      <button type="button" aria-label={`Answer ${edge.label}`}
                        onPointerDown={(event) => { event.stopPropagation(); onSelect({ kind: 'edge', id: edge.id }); }}
                        className={`max-w-[84px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${activeEdgeId === edge.id ? 'bg-blue-600 text-white' : edge.to_node_id || simOnly(edge) ? 'bg-white/[0.07] text-slate-200' : 'bg-amber-500/20 text-amber-200'}`}>
                        {edge.label}
                      </button>
                      {!readOnly && (
                        <span role="button" aria-label={`Connect answer ${edge.label}`} title="Drag to the step this answer leads to"
                          onPointerDown={(event) => startConnect(event, node, edge.id)}
                          className="absolute -bottom-[22px] h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-[#14171c] bg-slate-400 transition hover:scale-125 hover:bg-blue-500" />
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canConnect && (
                <span role="button" aria-label={`Connect from ${node.title}`}
                  title={isBranching(node) ? 'Drag to a step to add a new answer' : 'Drag to the next step'}
                  onPointerDown={(event) => startConnect(event, node)}
                  className={`absolute flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full border-2 border-[#14171c] bg-slate-500 opacity-60 transition hover:scale-125 hover:bg-blue-500 hover:opacity-100 group-hover:opacity-100 ${isBranching(node) ? '-right-2.5 top-1/2 -translate-y-1/2' : '-bottom-2.5 left-1/2 -translate-x-1/2'}`}>
                  <Plus className="h-3 w-3 text-[#14171c]" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {nodes.length <= 1 && !readOnly && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 px-6 py-4 text-center text-slate-400 backdrop-blur">
            <p className="text-sm font-semibold text-slate-200">Select the Start step, then use “Add Question”</p>
            <p className="mt-1 text-xs">Or drag steps from the library and connect them with the handles.</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex overflow-hidden rounded-xl border border-white/10 bg-[#1d2128]/95 shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
        {[
          { label: 'Zoom out', icon: Minus, onClick: () => zoomAt(1 / 1.2) },
          { label: 'Zoom in', icon: Plus, onClick: () => zoomAt(1.2) },
          { label: 'Fit tree to screen', icon: Maximize2, onClick: fit },
          { label: 'Reset zoom', icon: Crosshair, onClick: () => zoomAt(1 / viewportRef.current.zoom) },
        ].map(({ label, icon: Icon, onClick }) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={onClick} className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:bg-white/10 hover:text-white">
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="flex min-w-[48px] items-center justify-center border-l border-white/10 text-[10px] font-semibold text-slate-400" aria-live="polite">{Math.round(viewport.zoom * 100)}%</span>
      </div>

      {bounds && size.width > 640 && (
        <Minimap nodes={nodes} positions={positions} bounds={bounds} viewport={viewport} size={size} onNavigate={centreOn} />
      )}
    </div>
  );
};

const Minimap: React.FC<{
  nodes: DecisionNode[];
  positions: Record<string, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  viewport: Viewport;
  size: { width: number; height: number };
  onNavigate: (point: Point) => void;
}> = ({ nodes, positions, bounds, viewport, size, onNavigate }) => {
  const pad = 120;
  const world = {
    minX: Math.min(bounds.minX, -viewport.x / viewport.zoom) - pad,
    minY: Math.min(bounds.minY, -viewport.y / viewport.zoom) - pad,
    maxX: Math.max(bounds.maxX, (size.width - viewport.x) / viewport.zoom) + pad,
    maxY: Math.max(bounds.maxY, (size.height - viewport.y) / viewport.zoom) + pad,
  };
  const scale = Math.min(MINIMAP_W / (world.maxX - world.minX), MINIMAP_H / (world.maxY - world.minY));
  const project = (x: number, y: number) => ({ x: (x - world.minX) * scale, y: (y - world.minY) * scale });
  const view = project(-viewport.x / viewport.zoom, -viewport.y / viewport.zoom);
  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onNavigate({ x: (event.clientX - rect.left) / scale + world.minX, y: (event.clientY - rect.top) / scale + world.minY });
  };
  return (
    <div className="absolute bottom-4 right-4 rounded-xl border border-white/10 bg-[#1d2128]/95 p-1.5 shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
      <svg width={MINIMAP_W} height={MINIMAP_H} role="img" aria-label="Minimap. Click to move the view." className="cursor-pointer"
        onPointerDown={navigate} onPointerMove={(event) => { if (event.buttons === 1) navigate(event); }}>
        {nodes.map((node) => {
          const point = positions[node.id];
          if (!point) return null;
          const p = project(point.x, point.y);
          return <rect key={node.id} x={p.x} y={p.y} width={NODE_WIDTH * scale} height={NODE_HEIGHT * scale} rx={2} fill={nodeTypeConfig(node.node_type).accent} opacity={0.75} />;
        })}
        <rect x={view.x} y={view.y} width={(size.width / viewport.zoom) * scale} height={(size.height / viewport.zoom) * scale}
          fill="rgba(59,130,246,0.08)" stroke="#60a5fa" strokeWidth={1} rx={2} />
      </svg>
    </div>
  );
};
