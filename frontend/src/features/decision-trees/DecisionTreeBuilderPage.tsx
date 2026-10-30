import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, Bot, Check, CircleDashed, Eye, FlaskConical, GitPullRequestArrow, History, LayoutGrid, Loader2, Redo2, Save,
  Settings2, ShieldCheck, Undo2, X, XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiClientError } from '../../lib/api/client';
import { fetchAllMachines } from '../knowledge-capture/knowledgeApi';
import { decisionTreeApi } from './api';
import { autoLayout, defaultBranchLabel, isBranching, isTerminal, NODE_HEIGHT, outgoing, searchNodes } from './graph';
import { nodeTypeConfig } from './nodeTypes';
import { AIDraftDialog } from './components/AIDraftDialog';
import { BuilderCanvas, type Selection } from './components/BuilderCanvas';
import { BuilderSidebar } from './components/BuilderSidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TestPanel, type TestTab } from './components/TestPanel';
import { TreeForm } from './components/TreeForm';
import type {
  AISuggestion, ConnectFrom, DecisionEdge, DecisionNode, DecisionNodeType, DecisionVersion, NodeInput, Point, TreeIssue, VersionStatus,
} from './types';

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
type Snapshot = { nodes: DecisionNode[]; edges: DecisionEdge[] };
const HISTORY_LIMIT = 50;

const STATUS_STYLES: Record<VersionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-500/20 text-slate-200' },
  in_review: { label: 'Pending approval', className: 'bg-amber-500/20 text-amber-200' },
  published: { label: 'Published', className: 'bg-emerald-500/20 text-emerald-200' },
  withdrawn: { label: 'Withdrawn', className: 'bg-rose-500/20 text-rose-200' },
  superseded: { label: 'Superseded', className: 'bg-slate-500/20 text-slate-400' },
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

export const DecisionTreeBuilderPage: React.FC = () => {
  const { guideId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { hasPermission, user } = useAuth();
  const canReview = hasPermission('knowledge.approve');
  const reducedMotion = Boolean(useReducedMotion());

  const guideQuery = useQuery({ queryKey: ['decision-tree', guideId], queryFn: () => decisionTreeApi.getGuide(guideId), enabled: Boolean(guideId) });
  const guide = guideQuery.data;
  const versionId = searchParams.get('version') || guide?.working_version_id || undefined;
  const versionKey = useMemo(() => ['decision-tree-version', versionId], [versionId]);
  const versionQuery = useQuery({ queryKey: versionKey, queryFn: () => decisionTreeApi.getVersion(versionId!), enabled: Boolean(versionId) });
  const version = versionQuery.data;
  const nodes = useMemo(() => version?.nodes || [], [version]);
  const edges = useMemo(() => version?.edges || [], [version]);
  const canManage = Boolean(guide && user && (guide.owner_id === user.id || canReview || user.role_id === 'ADMIN'));
  const readOnly = version?.status !== 'draft' || !canManage;

  const validationQuery = useQuery({
    queryKey: ['decision-tree-validation', versionId],
    queryFn: () => decisionTreeApi.validateVersion(versionId!),
    enabled: Boolean(versionId),
  });
  const [serverIssues, setServerIssues] = useState<TreeIssue[] | null>(null);
  const issues = serverIssues || validationQuery.data?.issues || [];
  const flaggedIds = useMemo(() => new Set(issues.map((issue) => issue.node_id).filter(Boolean) as string[]), [issues]);

  const workflowsQuery = useQuery({ queryKey: ['decision-tree-workflows'], queryFn: decisionTreeApi.listWorkflows, staleTime: 60_000 });
  const mediaQuery = useQuery({
    queryKey: ['decision-tree-media', guide?.machine_id],
    queryFn: () => decisionTreeApi.listMachineMedia(guide!.machine_id!),
    enabled: Boolean(guide?.machine_id),
    staleTime: 60_000,
  });
  const machinesQuery = useQuery({ queryKey: ['decision-tree-machines'], queryFn: () => fetchAllMachines(), staleTime: 5 * 60_000 });
  const workflows = useMemo(
    () => (workflowsQuery.data || [])
      .filter((workflow) => workflow.status === 'APPROVED' && (!guide?.machine_id || !workflow.machine_id || workflow.machine_id === guide.machine_id))
      .map(({ id, title }) => ({ id, title })),
    [guide?.machine_id, workflowsQuery.data],
  );

  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [panel, setPanel] = useState<TestTab | null>(null);
  const [dialog, setDialog] = useState<'ai' | 'history' | 'details' | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; seq: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [review, setReview] = useState<{ suggestions: AISuggestion[]; aiAvailable: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const dirtyIds = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const validateTimer = useRef<ReturnType<typeof setTimeout>>();
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const centerRef = useRef<() => Point>(() => ({ x: 0, y: 0 }));

  // Seed positions per version: stored coordinates win, the rest are laid out automatically.
  const seededVersion = useRef<string>();
  useEffect(() => {
    if (!version) return;
    const first = seededVersion.current !== version.id;
    seededVersion.current = version.id;
    const layout = autoLayout(version.nodes, version.edges);
    setPositions((current) => {
      const next: Record<string, Point> = {};
      version.nodes.forEach((node) => {
        const stored = node.position_x != null && node.position_y != null ? { x: node.position_x, y: node.position_y } : null;
        next[node.id] = (!first && current[node.id]) || stored || layout[node.id];
        if (!stored && version.status === 'draft') dirtyIds.current.add(node.id);
      });
      return next;
    });
    if (first) {
      setSelection(null);
      undoStack.current = [];
      redoStack.current = [];
      setHistoryCounts({ undo: 0, redo: 0 });
      setReview(null);
    }
  }, [version]);

  const setVersion = useCallback((next: DecisionVersion) => {
    queryClient.setQueryData(versionKey, next);
  }, [queryClient, versionKey]);

  const patchVersion = useCallback((update: (current: DecisionVersion) => DecisionVersion) => {
    queryClient.setQueryData<DecisionVersion>(versionKey, (current) => (current ? update(current) : current));
  }, [queryClient, versionKey]);

  const revalidate = useCallback(() => {
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => {
      setServerIssues(null);
      void queryClient.invalidateQueries({ queryKey: ['decision-tree-validation', versionId] });
    }, 500);
  }, [queryClient, versionId]);

  const flushPositions = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!versionId || !dirtyIds.current.size || readOnly) { if (!dirtyIds.current.size) setSaveState('saved'); return; }
    const ids = [...dirtyIds.current].filter((id) => positionsRef.current[id]);
    dirtyIds.current.clear();
    setSaveState('saving');
    try {
      await decisionTreeApi.savePositions(versionId, ids.map((id) => ({ id, position_x: positionsRef.current[id].x, position_y: positionsRef.current[id].y })));
      setSaveState(dirtyIds.current.size ? 'unsaved' : 'saved');
    } catch {
      ids.forEach((id) => dirtyIds.current.add(id));
      setSaveState('error');
    }
  }, [readOnly, versionId]);

  const scheduleSave = useCallback(() => {
    setSaveState('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushPositions(); }, 700);
  }, [flushPositions]);

  useEffect(() => {
    if (version?.status === 'draft' && canManage && dirtyIds.current.size) scheduleSave();
  }, [version?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(validateTimer.current); }, []);

  // ---- History (undo / redo) --------------------------------------------

  const snapshot = useCallback((): Snapshot | null => {
    const current = queryClient.getQueryData<DecisionVersion>(versionKey);
    if (!current) return null;
    return {
      nodes: current.nodes.map((node) => ({ ...node, position_x: positionsRef.current[node.id]?.x ?? node.position_x, position_y: positionsRef.current[node.id]?.y ?? node.position_y })),
      edges: current.edges.map((edge) => ({ ...edge })),
    };
  }, [queryClient, versionKey]);

  const record = useCallback(() => {
    const snap = snapshot();
    if (!snap) return;
    undoStack.current = [...undoStack.current.slice(-(HISTORY_LIMIT - 1)), snap];
    redoStack.current = [];
    setHistoryCounts({ undo: undoStack.current.length, redo: 0 });
  }, [snapshot]);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setNotice(null);
    try {
      const result = await action();
      revalidate();
      return result;
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
      void queryClient.invalidateQueries({ queryKey: versionKey });
      return undefined;
    }
  }, [queryClient, revalidate, versionKey]);

  const restore = useCallback(async (from: React.MutableRefObject<Snapshot[]>, to: React.MutableRefObject<Snapshot[]>) => {
    if (!versionId || readOnly || !from.current.length) return;
    const target = from.current[from.current.length - 1];
    const current = snapshot();
    await flushPositions();
    const restored = await run(() => decisionTreeApi.replaceGraph(versionId, target));
    if (!restored) return;
    from.current = from.current.slice(0, -1);
    if (current) to.current = [...to.current, current];
    setHistoryCounts({ undo: undoStack.current.length, redo: redoStack.current.length });
    setVersion(restored);
    const next: Record<string, Point> = {};
    restored.nodes.forEach((node) => { next[node.id] = { x: node.position_x ?? 0, y: node.position_y ?? 0 }; });
    setPositions(next);
    setSelection(null);
  }, [flushPositions, readOnly, run, setVersion, snapshot, versionId]);

  const undo = useCallback(() => restore(undoStack, redoStack), [restore]);
  const redo = useCallback(() => restore(redoStack, undoStack), [restore]);

  // ---- Step operations ---------------------------------------------------

  const placeNear = useCallback((connect: ConnectFrom | null, fallback?: Point): Point => {
    if (connect) {
      const origin = positionsRef.current[connect.node_id];
      const source = nodes.find((node) => node.id === connect.node_id);
      if (origin && source) {
        const offset = isBranching(source) ? (outgoing(edges, source.id).length - 1) * 270 - 130 : 0;
        return { x: origin.x + offset, y: origin.y + NODE_HEIGHT + 110 };
      }
    }
    return fallback || centerRef.current();
  }, [edges, nodes]);

  const createStep = useCallback(async (type: DecisionNodeType, connect: ConnectFrom | null, title?: string, point?: Point) => {
    if (!versionId || readOnly) return;
    const at = placeNear(connect, point);
    record();
    const result = await run(() => decisionTreeApi.addNode(versionId, {
      node_type: type,
      title: title || nodeTypeConfig(type).defaultTitle,
      input_type: type === 'question' ? 'yes_no' : 'choice',
      position_x: at.x,
      position_y: at.y,
      ...(connect ? { connect_from: connect } : {}),
    }));
    if (!result) return;
    setVersion(result.version);
    setPositions((current) => ({ ...current, [result.node.id]: at }));
    setSelection({ kind: 'node', id: result.node.id });
  }, [placeNear, readOnly, record, run, setVersion, versionId]);

  /** "Add X" buttons: connect after the selected answer or step whenever that is unambiguous. */
  const quickAdd = useCallback((type: DecisionNodeType, point?: Point) => {
    let connect: ConnectFrom | null = null;
    if (selection?.kind === 'edge') {
      const edge = edges.find((e) => e.id === selection.id);
      if (edge) connect = { node_id: edge.from_node_id, edge_id: edge.id };
    } else if (selection?.kind === 'node' && !point) {
      const node = nodes.find((n) => n.id === selection.id);
      if (node && !isTerminal(node)) connect = { node_id: node.id };
    }
    void createStep(type, connect, undefined, point);
  }, [createStep, edges, nodes, selection]);

  const addAnswer = useCallback(async (nodeId: string, label?: string, toNodeId?: string) => {
    if (!versionId) return;
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    record();
    const created = await run(() => decisionTreeApi.addEdge(versionId, {
      from_node_id: nodeId, label: label || defaultBranchLabel(source, edges), to_node_id: toNodeId || null,
    }));
    if (created) patchVersion((current) => ({ ...current, edges: [...current.edges, created] }));
  }, [edges, nodes, patchVersion, record, run, versionId]);

  const updateNode = useCallback(async (id: string, patch: NodeInput) => {
    record();
    const { media_asset_ids: _media, mark_reviewed: _reviewed, ...fields } = patch;
    patchVersion((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (fields.is_start && node.id !== id) return { ...node, is_start: false };
        return node.id === id ? { ...node, ...fields, details: fields.details ?? node.details } as DecisionNode : node;
      }),
    }));
    const updated = await run(() => decisionTreeApi.updateNode(id, patch));
    if (updated) patchVersion((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === id ? updated : node)) }));
  }, [patchVersion, record, run]);

  const updateEdge = useCallback(async (id: string, patch: { label?: string; to_node_id?: string | null; condition?: string | null }) => {
    record();
    patchVersion((current) => ({ ...current, edges: current.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)) }));
    const updated = await run(() => decisionTreeApi.updateEdge(id, patch));
    if (updated) patchVersion((current) => ({ ...current, edges: current.edges.map((edge) => (edge.id === id ? updated : edge)) }));
  }, [patchVersion, record, run]);

  const deleteEdge = useCallback(async (id: string) => {
    record();
    const ok = await run(() => decisionTreeApi.deleteEdge(id));
    if (ok === undefined) return;
    patchVersion((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== id) }));
    setSelection((current) => (current?.kind === 'edge' && current.id === id ? null : current));
  }, [patchVersion, record, run]);

  const reorderAnswers = useCallback(async (nodeId: string, edgeIds: string[]) => {
    record();
    const updated = await run(() => decisionTreeApi.reorderAnswers(nodeId, edgeIds));
    if (updated) setVersion(updated);
  }, [record, run, setVersion]);

  const duplicateNode = useCallback(async (nodeId: string) => {
    record();
    const result = await run(() => decisionTreeApi.duplicateNode(nodeId));
    if (!result) return;
    const origin = positionsRef.current[nodeId] || centerRef.current();
    setVersion(result.version);
    setPositions((current) => ({ ...current, [result.node.id]: { x: origin.x + 40, y: origin.y + 40 } }));
    setSelection({ kind: 'node', id: result.node.id });
  }, [record, run, setVersion]);

  const deleteSelection = useCallback(async () => {
    if (!selection || readOnly) return;
    if (selection.kind === 'edge') {
      await deleteEdge(selection.id);
      return;
    }
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return;
    if (node.is_start) {
      setNotice({ tone: 'error', text: 'The Start step can’t be deleted. Edit it instead.' });
      return;
    }
    const incoming = edges.filter((edge) => edge.to_node_id === node.id).length;
    if ((incoming || outgoing(edges, node.id).length) && !window.confirm(`Delete “${node.title}”? Answers leading here will need a new next step. You can undo this.`)) return;
    record();
    const updated = await run(() => decisionTreeApi.deleteNode(node.id));
    if (!updated) return;
    setVersion(updated);
    setSelection(null);
  }, [deleteEdge, edges, nodes, readOnly, record, run, selection, setVersion]);

  const connect = useCallback(async (fromId: string, toId: string, edgeId?: string) => {
    if (!versionId || readOnly) return;
    const source = nodes.find((node) => node.id === fromId);
    if (!source || isTerminal(source)) return;
    if (edgeId) return updateEdge(edgeId, { to_node_id: toId });
    const existing = outgoing(edges, fromId);
    if (!isBranching(source) && existing.length) return updateEdge(existing[0].id, { to_node_id: toId });
    if (existing.some((edge) => edge.to_node_id === toId)) {
      setNotice({ tone: 'error', text: 'An answer on this question already leads to that step.' });
      return;
    }
    return addAnswer(fromId, undefined, toId);
  }, [addAnswer, edges, nodes, readOnly, updateEdge, versionId]);

  const moveNode = useCallback((id: string, point: Point) => setPositions((current) => ({ ...current, [id]: point })), []);
  const moveEnd = useCallback((id: string) => { dirtyIds.current.add(id); scheduleSave(); }, [scheduleSave]);

  const applyAutoLayout = () => {
    if (!readOnly) record();
    setPositions(autoLayout(nodes, edges));
    if (!readOnly) {
      nodes.forEach((node) => dirtyIds.current.add(node.id));
      scheduleSave();
    }
    setFitRequest((n) => n + 1);
  };

  const uploadMedia = useCallback(async (file: File) => {
    if (!guide?.machine_id) throw new Error('Link this tree to a machine first.');
    const asset = await decisionTreeApi.uploadMachineMedia(guide.machine_id, file);
    void queryClient.invalidateQueries({ queryKey: ['decision-tree-media', guide.machine_id] });
    return asset;
  }, [guide?.machine_id, queryClient]);

  // ---- Keyboard ----------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) { event.preventDefault(); void deleteSelection(); }
      else if (event.key === 'Escape') setSelection(null);
      else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void flushPositions(); }
      else if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); void undo(); }
      else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) { event.preventDefault(); void redo(); }
      else if (mod && event.key.toLowerCase() === 'd' && selection?.kind === 'node') { event.preventDefault(); void duplicateNode(selection.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelection, duplicateNode, flushPositions, redo, selection, undo]);

  // ---- Lifecycle ---------------------------------------------------------

  const refreshGuide = () => {
    void queryClient.invalidateQueries({ queryKey: ['decision-tree', guideId] });
    void queryClient.invalidateQueries({ queryKey: ['decision-trees'] });
  };

  const changeStatus = async (action: 'submit_review' | 'withdraw_submission' | 'approve' | 'reject' | 'withdraw') => {
    if (!versionId) return;
    let reason: string | undefined;
    if (action === 'reject') {
      reason = window.prompt('What should the author change?') || undefined;
      if (!reason) return;
    }
    if (action === 'withdraw' && !window.confirm('Withdraw this published tree? Trainees will no longer see it.')) return;
    if (action === 'submit_review') await flushPositions();
    setBusy(true);
    setNotice(null);
    try {
      const updated = await decisionTreeApi.changeStatus(versionId, action, reason);
      setVersion(updated);
      refreshGuide();
      setNotice({
        tone: 'success',
        text: {
          submit_review: 'Submitted for approval. Another expert must review it before it is published.',
          withdraw_submission: 'Returned to draft.',
          approve: 'Approved and published. Trainees can now follow this tree.',
          reject: 'Returned to the author with your note.',
          withdraw: 'Withdrawn. Trainees no longer see this tree.',
        }[action],
      });
    } catch (error) {
      const details = error instanceof ApiClientError ? (error.details as { issues?: TreeIssue[] } | undefined) : undefined;
      if (details?.issues) {
        setServerIssues(details.issues);
        setPanel('problems');
      }
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const startNewDraft = async () => {
    setBusy(true);
    const created = await run(() => decisionTreeApi.createVersion(guideId));
    setBusy(false);
    if (!created) return;
    queryClient.setQueryData(['decision-tree-version', created.id], created);
    refreshGuide();
    setSearchParams({ version: created.id });
  };

  const runAIReview = async () => {
    if (!versionId) return;
    setReviewing(true);
    const result = await run(() => decisionTreeApi.aiReview(versionId));
    setReviewing(false);
    if (result) {
      setServerIssues(result.issues);
      setReview({ suggestions: result.suggestions, aiAvailable: result.ai_available });
    }
  };

  const focusNode = useCallback((nodeId: string) => {
    setPanel(null);
    setSelection({ kind: 'node', id: nodeId });
    setFocusRequest((current) => ({ nodeId, seq: (current?.seq || 0) + 1 }));
  }, []);

  // The dashboard redirects here with ?ai_error= when the optional AI first draft failed.
  useEffect(() => {
    const aiError = searchParams.get('ai_error');
    if (!aiError) return;
    setNotice({ tone: 'error', text: `The tree was created, but the AI draft failed: ${aiError}. You can try “AI draft” again or build it yourself.` });
    setSearchParams((params) => { const next = new URLSearchParams(params); next.delete('ai_error'); return next; }, { replace: true });
  }, [searchParams, setSearchParams]);

  const registerCenter = useCallback((getCenter: () => Point) => { centerRef.current = getCenter; }, []);
  const matchIds = useMemo(() => new Set(searchNodes(nodes, edges, search)), [edges, nodes, search]);

  if (guideQuery.isLoading || (versionId && versionQuery.isLoading)) {
    return <div className="flex h-[60vh] items-center justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading decision tree" /></div>;
  }
  if (guideQuery.isError || !guide || !version) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-slate-600">This decision tree could not be loaded.</p>
        <Link to="/app/decision-trees" className="mt-4 inline-block text-sm font-semibold text-blue-600">Back to decision trees</Link>
      </div>
    );
  }

  const status = STATUS_STYLES[version.status];
  const openDraftId = guide.draft_version_id || guide.in_review_version_id;
  const selectedNode = selection?.kind === 'node' ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? edges.find((edge) => edge.id === selection.id) : undefined;
  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const workflowTitle = (id: string) => workflows.find((workflow) => workflow.id === id)?.title || workflowsQuery.data?.find((w) => w.id === id)?.title;
  const isAuthor = version.author_id === user?.id;
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
  const ghost = `${btn} text-slate-300 hover:bg-white/10`;
  const primary = `${btn} bg-blue-600 px-3 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_20px_-8px_rgba(37,99,235,0.8)] hover:bg-blue-500`;

  return (
    <div className="relative flex h-[calc(100vh-7.5rem)] min-h-[600px] flex-col overflow-hidden rounded-2xl border border-black/30 bg-[#14171c] text-slate-100 shadow-2xl">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] bg-[#181c22] px-3 py-2.5 sm:px-4">
        <Link to="/app/decision-trees" aria-label="Back to decision trees" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-white">{guide.title}</h1>
          <p className="truncate text-[11px] text-slate-400">{guide.machine_name || 'Any machine'} · {guide.problem_category.replace(/_/g, ' ').toLowerCase()}</p>
        </div>
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-slate-300">v{version.version_number}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.className}`}>{status.label}</span>
        {!readOnly && (
          <span className="hidden items-center gap-1 text-[11px] text-slate-400 md:flex" aria-live="polite">
            {saveState === 'saving' ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
              : saveState === 'unsaved' ? <><CircleDashed className="h-3 w-3" />Unsaved layout</>
                : saveState === 'error' ? <span className="text-rose-300">Layout not saved</span>
                  : <><Check className="h-3 w-3 text-emerald-400" />Draft saved</>}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-0.5">
          {!readOnly && (
            <>
              <button type="button" onClick={() => void flushPositions()} className={ghost} title="Save draft (Ctrl+S)"><Save className="h-3.5 w-3.5" /><span className="hidden xl:inline">Save draft</span></button>
              <button type="button" onClick={() => void undo()} disabled={!historyCounts.undo} aria-label="Undo" title="Undo (Ctrl+Z)" className={ghost}><Undo2 className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void redo()} disabled={!historyCounts.redo} aria-label="Redo" title="Redo (Ctrl+Y)" className={ghost}><Redo2 className="h-3.5 w-3.5" /></button>
            </>
          )}
          <button type="button" onClick={applyAutoLayout} disabled={!nodes.length} className={ghost} title="Auto layout"><LayoutGrid className="h-3.5 w-3.5" /><span className="hidden xl:inline">Auto layout</span></button>
          {!readOnly && <button type="button" onClick={() => setDialog('ai')} className={`${ghost} text-violet-200`}><Bot className="h-3.5 w-3.5" /><span className="hidden lg:inline">AI draft</span></button>}
          <button type="button" onClick={() => setPanel('preview')} className={ghost}><Eye className="h-3.5 w-3.5" /><span className="hidden lg:inline">Preview</span></button>
          <button type="button" onClick={() => setPanel('problems')} className={ghost}>
            <FlaskConical className="h-3.5 w-3.5" /><span className="hidden lg:inline">Test</span>
            {issues.length > 0 && <span className={`rounded-full px-1.5 text-[10px] ${errorCount ? 'bg-rose-500/25 text-rose-200' : 'bg-amber-500/25 text-amber-200'}`}>{issues.length}</span>}
          </button>
          <button type="button" onClick={() => setDialog('history')} className={ghost} aria-label="Version history" title="Version history"><History className="h-3.5 w-3.5" /></button>
          {canManage && <button type="button" onClick={() => setDialog('details')} className={ghost} aria-label="Tree details" title="Tree details"><Settings2 className="h-3.5 w-3.5" /></button>}
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          {version.status === 'draft' && canManage && (
            <button type="button" disabled={busy} onClick={() => void changeStatus('submit_review')} className={primary}><GitPullRequestArrow className="h-3.5 w-3.5" />Submit for approval</button>
          )}
          {version.status === 'in_review' && (canReview && !isAuthor ? (
            <>
              <button type="button" disabled={busy} onClick={() => void changeStatus('reject')} className={`${btn} border border-white/10 text-slate-200 hover:bg-white/10`}><XCircle className="h-3.5 w-3.5" />Request changes</button>
              <button type="button" disabled={busy} onClick={() => void changeStatus('approve')} className={primary}><ShieldCheck className="h-3.5 w-3.5" />Approve &amp; publish</button>
            </>
          ) : (
            <>
              <span className="px-1 text-[11px] text-amber-200">Waiting for another expert to approve</span>
              {canManage && <button type="button" disabled={busy} onClick={() => void changeStatus('withdraw_submission')} className={ghost}>Back to draft</button>}
            </>
          ))}
          {version.status === 'published' && canReview && (
            <button type="button" disabled={busy} onClick={() => void changeStatus('withdraw')} className={`${btn} border border-white/10 text-slate-200 hover:bg-white/10`}>Withdraw</button>
          )}
          {canManage && version.status !== 'draft' && version.status !== 'in_review' && (openDraftId ? (
            <button type="button" onClick={() => setSearchParams({ version: openDraftId })} className={primary}>Open current draft</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void startNewDraft()} className={primary}>Edit as new draft</button>
          ))}
        </div>
      </header>

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 px-4 py-2 text-xs ${notice.tone === 'error' ? 'bg-rose-500/15 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'}`}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {readOnly && version.status !== 'in_review' && (
        <p className="bg-white/[0.03] px-4 py-1.5 text-[11px] text-slate-400">
          {canManage ? 'This version is read-only. Published versions never change — edits happen in a new draft.' : 'You can view this tree. Only its author or a reviewer can change it.'}
        </p>
      )}
      {version.status === 'draft' && version.revision_reason && (
        <p className="bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-200">Reviewer note: {version.revision_reason}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <BuilderSidebar nodes={nodes} edges={edges} selection={selection} readOnly={readOnly} search={search} matchCount={matchIds.size}
          flaggedIds={flaggedIds} onSearch={setSearch} onQuickAdd={(type) => quickAdd(type)}
          onAddAnswer={() => selectedNode && void addAnswer(selectedNode.id)} onFocusNode={focusNode} />
        <div className="relative min-h-[360px] flex-1">
          <BuilderCanvas
            nodes={nodes} edges={edges} positions={positions} selection={selection} readOnly={readOnly}
            fitRequest={fitRequest} focusRequest={focusRequest} flaggedIds={flaggedIds} matchIds={search ? matchIds : undefined}
            onSelect={setSelection} onMoveStart={record} onMoveNode={moveNode} onMoveEnd={moveEnd}
            onConnect={(from, to, edgeId) => void connect(from, to, edgeId)}
            onDropNode={(type, point) => void createStep(type, null, undefined, point)}
            onViewportCenter={registerCenter}
          />
          <PropertiesPanel
            node={selectedNode} edge={selectedEdge} nodes={nodes} edges={edges} readOnly={readOnly}
            machineId={guide.machine_id} mediaLibrary={mediaQuery.data || []} workflows={workflows} simulationEnabled={Boolean(guide.simulation?.enabled)}
            onUpdateNode={(id, patch) => void updateNode(id, patch)}
            onUpdateEdge={(id, patch) => void updateEdge(id, patch)}
            onAddAnswer={(nodeId, label, toNodeId) => void addAnswer(nodeId, label, toNodeId)}
            onDeleteEdge={(id) => void deleteEdge(id)}
            onReorderAnswers={(nodeId, ids) => void reorderAnswers(nodeId, ids)}
            onCreateStep={(type, connectFrom, title) => void createStep(type, connectFrom, title)}
            onDuplicate={(id) => void duplicateNode(id)}
            onDelete={() => void deleteSelection()}
            onClose={() => setSelection(null)}
            onSelect={setSelection}
            onUpload={uploadMedia}
            onAssist={(nodeId) => decisionTreeApi.aiAssist(nodeId)}
          />
          {panel && (
            <TestPanel tab={panel} nodes={nodes} edges={edges} issues={issues} issuesLoading={validationQuery.isFetching}
              suggestions={review?.suggestions || null} aiAvailable={review ? review.aiAvailable : null} reviewing={reviewing}
              workflowTitle={workflowTitle} reducedMotion={reducedMotion} onTabChange={setPanel}
              onRefresh={() => { setServerIssues(null); void validationQuery.refetch(); }} onAIReview={() => void runAIReview()}
              onFocusNode={focusNode} onClose={() => setPanel(null)} />
          )}
        </div>
      </div>

      {dialog === 'ai' && (
        <AIDraftDialog hasSteps={nodes.length > 1}
          defaultPrompt={`Create a troubleshooting tree for ${guide.title.toLowerCase()}${guide.machine_name ? ` in a ${guide.machine_name}` : ''}.`}
          onClose={() => { setDialog(null); setFitRequest((n) => n + 1); }}
          onGenerate={async (prompt, replace) => {
            record();
            const result = await decisionTreeApi.aiDraft(versionId!, prompt, replace);
            setVersion(result.version);
            const next: Record<string, Point> = {};
            result.version.nodes.forEach((node) => { next[node.id] = { x: node.position_x ?? 0, y: node.position_y ?? 0 }; });
            setPositions(next);
            revalidate();
            return result;
          }} />
      )}

      {dialog === 'history' && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/45" onPointerDown={() => setDialog(null)}>
          <aside role="dialog" aria-modal="true" aria-label="Version history" className="h-full w-full max-w-sm overflow-y-auto border-l border-white/10 bg-[#181c22] p-4" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center"><h2 className="text-sm font-semibold">Version history</h2><button type="button" aria-label="Close" onClick={() => setDialog(null)} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
            <ol className="mt-4 space-y-2">
              {(guide.versions || []).map((entry) => (
                <li key={entry.id}>
                  <button type="button" onClick={() => { setSearchParams({ version: entry.id }); setDialog(null); }}
                    className={`w-full rounded-xl border p-3 text-left text-[12px] transition ${entry.id === version.id ? 'border-blue-400/60 bg-blue-500/10' : 'border-white/[0.06] hover:border-white/20'}`}>
                    <span className="flex items-center gap-2">
                      <strong className="text-slate-100">Version {entry.version_number}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${STATUS_STYLES[entry.status].className}`}>{STATUS_STYLES[entry.status].label}</span>
                    </span>
                    <span className="mt-1 block text-slate-400">{entry.step_count} steps · {entry.author_name || 'Unknown author'} · {new Date(entry.published_at || entry.created_at).toLocaleDateString()}</span>
                    {entry.revision_reason && <span className="mt-1 block text-slate-500">“{entry.revision_reason}”</span>}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}

      {dialog === 'details' && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-8" onPointerDown={() => setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-label="Tree details" className="w-full max-w-2xl rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <h2 className="mb-4 text-base font-semibold">Tree details</h2>
            <TreeForm machines={(machinesQuery.data?.items || []).map(({ id, name }) => ({ id, name }))} initial={guide} submitLabel="Save details"
              onCancel={() => setDialog(null)}
              onSubmit={async (values) => {
                await decisionTreeApi.updateGuide(guide.id, values);
                refreshGuide();
                setDialog(null);
                setNotice({ tone: 'success', text: 'Tree details saved.' });
              }} />
          </div>
        </div>
      )}
    </div>
  );
};
