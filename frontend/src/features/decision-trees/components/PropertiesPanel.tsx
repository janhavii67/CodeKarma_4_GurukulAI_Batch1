import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Bot, Check, ChevronDown, Copy, FileText, Film, Image as ImageIcon, Loader2, Music, Plus,
  RefreshCw, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { getApiUrl } from '../../../lib/api/client';
import { isBranching, isTerminal, outgoing } from '../graph';
import { PALETTE, STEP_DESTINATIONS, nodeTypeConfig } from '../nodeTypes';
import type {
  AIAssistResult, ConnectFrom, DecisionEdge, DecisionNode, DecisionNodeType, MediaRef, NodeDetails, NodeInput,
} from '../types';
import type { Selection } from './BuilderCanvas';
import { AnswerSimFields, NodeSimFields } from './SimulationFields';

type ListKey = 'corrective_actions' | 'ppe' | 'precautions' | 'restricted_operations' | 'possible_causes' | 'recommended_actions';

export interface PropertiesPanelProps {
  node?: DecisionNode;
  edge?: DecisionEdge;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  readOnly: boolean;
  machineId?: string | null;
  mediaLibrary: MediaRef[];
  workflows: Array<{ id: string; title: string }>;
  onUpdateNode: (id: string, patch: NodeInput) => void;
  onUpdateEdge: (id: string, patch: { label?: string; to_node_id?: string | null; condition?: string | null }) => void;
  /** Show trainee-simulator scenario fields (the tree has the simulator enabled). */
  simulationEnabled?: boolean;
  /** Adds an answer (or a single next-step link) optionally pointing at an existing step. */
  onAddAnswer: (nodeId: string, label?: string, toNodeId?: string) => void;
  onDeleteEdge: (id: string) => void;
  onReorderAnswers: (nodeId: string, edgeIds: string[]) => void;
  onCreateStep: (type: DecisionNodeType, connect: ConnectFrom, title?: string) => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onUpload: (file: File) => Promise<MediaRef>;
  onAssist: (nodeId: string) => Promise<AIAssistResult>;
}

const inputClass = 'w-full rounded-lg border border-white/[0.08] bg-[#14171c] px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60';
const labelClass = 'mb-1 block text-[11px] font-semibold text-slate-400';

/** Text field that keeps a local draft and commits once on blur (or Enter for single lines). */
export const CommitField: React.FC<{
  label: string; value: string; placeholder?: string; multiline?: boolean; disabled: boolean; onCommit: (value: string) => void; id?: string;
}> = ({ label, value, placeholder, multiline, disabled, onCommit, id }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  const fieldId = id || `dt-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fieldId} className="block">
      <span className={labelClass}>{label}</span>
      {multiline ? (
        <textarea id={fieldId} rows={3} value={draft} placeholder={placeholder} disabled={disabled}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} className={`${inputClass} resize-y`} />
      ) : (
        <input id={fieldId} value={draft} placeholder={placeholder} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={inputClass} />
      )}
    </label>
  );
};

const Section: React.FC<{ title: string; defaultOpen?: boolean; badge?: React.ReactNode; children: React.ReactNode }> = ({ title, defaultOpen = true, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-white/[0.06] pt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} />{title}{badge && <span className="ml-auto">{badge}</span>}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
};

/** Editable list of short strings (PPE, possible causes, …). */
const ListField: React.FC<{ label: string; items: string[]; placeholder: string; disabled: boolean; onChange: (items: string[]) => void }> = ({
  label, items, placeholder, disabled, onChange,
}) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  };
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <ul className="space-y-1.5" aria-label={label}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-slate-200">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span className="flex-1">{item}</span>
            {!disabled && <button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-slate-500 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="mt-1.5 flex gap-1.5">
          <input value={draft} placeholder={placeholder} aria-label={`Add to ${label}`} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className={inputClass} />
          <button type="button" onClick={add} aria-label={`Add ${label}`} className="rounded-lg border border-white/10 px-2.5 text-slate-300 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

/** Pick what an answer leads to: an existing step or a brand-new one created and linked in one go. */
const DestinationSelect: React.FC<{
  edge?: DecisionEdge; source: DecisionNode; nodes: DecisionNode[]; disabled: boolean; label: string;
  onChoose: (value: { existing?: string | null; create?: DecisionNodeType }) => void;
}> = ({ edge, source, nodes, disabled, label, onChoose }) => (
  <select
    aria-label={label}
    disabled={disabled}
    value={edge?.to_node_id || ''}
    onChange={(event) => {
      const value = event.target.value;
      if (value.startsWith('new:')) onChoose({ create: value.slice(4) as DecisionNodeType });
      else onChoose({ existing: value || null });
    }}
    className={`${inputClass} ${edge && !edge.to_node_id ? 'border-amber-400/60' : ''}`}
  >
    <option value="">— Choose next step —</option>
    <optgroup label="Create a new step">
      {STEP_DESTINATIONS.map(({ type, label: typeLabel }) => <option key={type} value={`new:${type}`}>New {typeLabel}</option>)}
    </optgroup>
    <optgroup label="Go to an existing step">
      {nodes.filter((node) => node.id !== source.id && !node.is_start).map((node) => (
        <option key={node.id} value={node.id}>{nodeTypeConfig(node.node_type).label}: {node.title}</option>
      ))}
    </optgroup>
  </select>
);

const mediaIcon = (kind: string) => (kind === 'image' ? ImageIcon : kind === 'video' ? Film : kind === 'audio' ? Music : FileText);

interface UploadState { id: string; name: string; status: 'uploading' | 'done' | 'error'; message?: string }

const MediaManager: React.FC<{
  node: DecisionNode; readOnly: boolean; machineId?: string | null; library: MediaRef[];
  onChange: (ids: string[]) => void; onUpload: (file: File) => Promise<MediaRef>;
}> = ({ node, readOnly, machineId, library, onChange, onUpload }) => {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const ids = node.media.map((media) => media.id);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let next = [...ids];
    const replacing = replaceTarget.current;
    replaceTarget.current = null;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}`;
      setUploads((current) => [...current, { id: key, name: file.name, status: 'uploading' }]);
      try {
        const asset = await onUpload(file);
        next = replacing ? next.map((id) => (id === replacing ? asset.id : id)) : [...next, asset.id];
        setUploads((current) => current.map((u) => (u.id === key ? { ...u, status: 'done' } : u)));
      } catch (error) {
        setUploads((current) => current.map((u) => (u.id === key ? { ...u, status: 'error', message: error instanceof Error ? error.message : 'Upload failed' } : u)));
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {node.media.length === 0 && <p className="text-[12px] text-slate-500">No attachments yet.</p>}
      <ul className="space-y-1.5" aria-label="Attachments">
        {node.media.map((media) => {
          const Icon = mediaIcon(media.kind);
          return (
            <li key={media.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              {media.kind === 'image'
                ? <img src={getApiUrl(`${media.url}?inline=true`)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10 text-pink-300"><Icon className="h-4 w-4" /></span>}
              <a href={getApiUrl(`${media.url}?inline=true`)} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title="Preview in a new tab">
                <span className="block truncate text-[12px] font-medium text-slate-100 hover:underline">{media.title}</span>
                <span className="block text-[10px] uppercase text-slate-500">{media.kind}</span>
              </a>
              {!readOnly && (
                <>
                  <button type="button" aria-label={`Replace ${media.title}`} title="Replace" disabled={!machineId}
                    onClick={() => { replaceTarget.current = media.id; fileInput.current?.click(); }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Remove ${media.title}`} title="Remove" onClick={() => onChange(ids.filter((id) => id !== media.id))}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {uploads.length > 0 && (
        <ul className="space-y-1" aria-label="Upload status" aria-live="polite">
          {uploads.map((upload) => (
            <li key={upload.id} className={`flex items-center gap-2 text-[11px] ${upload.status === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>
              {upload.status === 'uploading' ? <Loader2 className="h-3 w-3 animate-spin" /> : upload.status === 'done' ? <Check className="h-3 w-3 text-emerald-400" /> : <X className="h-3 w-3" />}
              <span className="truncate">{upload.name}{upload.message ? ` — ${upload.message}` : upload.status === 'done' ? ' — uploaded' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        machineId ? (
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" multiple hidden accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt"
              data-testid="node-media-upload" onChange={(event) => { void handleFiles(event.target.files); event.target.value = ''; }} />
            <button type="button" onClick={() => { replaceTarget.current = null; fileInput.current?.click(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 hover:bg-white/10">
              <Upload className="h-3.5 w-3.5" />Upload files
            </button>
            {library.length > 0 && (
              <select aria-label="Attach from machine library" value="" className={`${inputClass} flex-1 py-1.5`}
                onChange={(event) => event.target.value && onChange([...ids, event.target.value])}>
                <option value="">Attach from library…</option>
                {library.filter((media) => !ids.includes(media.id)).map((media) => <option key={media.id} value={media.id}>{media.title} ({media.kind})</option>)}
              </select>
            )}
          </div>
        ) : <p className="text-[12px] text-slate-500">Link this tree to a machine to upload or attach its media.</p>
      )}
    </div>
  );
};

const AssistPanel: React.FC<{
  node: DecisionNode; readOnly: boolean; onAssist: (id: string) => Promise<AIAssistResult>;
  onAddAnswer: (label: string) => void; onAddQuestion: (title: string) => void; onAddSafety: (text: string) => void;
  onAttach: (id: string) => void; onLinkWorkflow: (id: string) => void; onLinkKnowledge: (id: string) => void;
}> = ({ node, readOnly, onAssist, onAddAnswer, onAddQuestion, onAddSafety, onAttach, onLinkWorkflow, onLinkKnowledge }) => {
  const [state, setState] = useState<{ loading: boolean; result?: AIAssistResult; error?: string }>({ loading: false });
  useEffect(() => setState({ loading: false }), [node.id]);
  const run = async () => {
    setState({ loading: true });
    try {
      setState({ loading: false, result: await onAssist(node.id) });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'AI suggestions are unavailable.' });
    }
  };
  const chip = 'inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11.5px] text-violet-100 hover:border-violet-300 disabled:opacity-50';
  const { result } = state;
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => void run()} disabled={state.loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/80 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
        {state.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Suggest improvements
      </button>
      {state.error && <p role="alert" className="text-[12px] text-rose-300">{state.error}</p>}
      {result && (
        <div className="space-y-3 text-[12px]">
          {!result.ai_available && <p className="text-amber-200">The AI model is unavailable; showing matching approved resources only.</p>}
          {result.rationale && <p className="text-slate-400">{result.rationale}</p>}
          {isBranching(node) && result.answers.length > 0 && (
            <div><span className={labelClass}>Answer options</span><div className="flex flex-wrap gap-1.5">
              {result.answers.map((answer) => <button key={answer} type="button" disabled={readOnly} className={chip} onClick={() => onAddAnswer(answer)}><Plus className="h-3 w-3" />{answer}</button>)}
            </div></div>
          )}
          {result.follow_up_questions.length > 0 && !isTerminal(node) && (
            <div><span className={labelClass}>Follow-up questions</span><div className="flex flex-col gap-1.5">
              {result.follow_up_questions.map((question) => <button key={question} type="button" disabled={readOnly} className={`${chip} justify-start text-left`} onClick={() => onAddQuestion(question)}><Plus className="h-3 w-3 shrink-0" />{question}</button>)}
            </div></div>
          )}
          {result.safety.length > 0 && (
            <div><span className={labelClass}>Safety</span><div className="flex flex-col gap-1.5">
              {result.safety.map((text) => <button key={text} type="button" disabled={readOnly} className={`${chip} justify-start border-rose-400/30 bg-rose-500/10 text-left text-rose-100`} onClick={() => onAddSafety(text)}><Plus className="h-3 w-3 shrink-0" />{text}</button>)}
            </div></div>
          )}
          {result.knowledge.length > 0 && (
            <div><span className={labelClass}>Approved knowledge</span><ul className="space-y-1.5">
              {result.knowledge.map((source) => (
                <li key={source.id} className="rounded-lg bg-white/[0.03] p-2">
                  <p className="font-semibold text-slate-200">{source.title}{source.section ? ` — ${source.section}` : ''}</p>
                  {source.excerpt && <p className="mt-0.5 line-clamp-2 text-slate-400">{source.excerpt}</p>}
                  {source.knowledge_version_id && !readOnly && <button type="button" className="mt-1 text-[11px] font-semibold text-blue-300 hover:underline" onClick={() => onLinkKnowledge(source.knowledge_version_id!)}>Cite as this step's reference</button>}
                </li>
              ))}
            </ul></div>
          )}
          {result.media.length > 0 && (
            <div><span className={labelClass}>Related media</span><div className="flex flex-wrap gap-1.5">
              {result.media.map((media) => <button key={media.id} type="button" disabled={readOnly || node.media.some((m) => m.id === media.id)} className={chip} onClick={() => onAttach(media.id)}><Film className="h-3 w-3" />{media.title}</button>)}
            </div></div>
          )}
          {result.workflows.length > 0 && (
            <div><span className={labelClass}>Related Guided Workflows</span><div className="flex flex-wrap gap-1.5">
              {result.workflows.map((workflow) => <button key={workflow.id} type="button" disabled={readOnly} className={chip} onClick={() => onLinkWorkflow(workflow.id)}>{workflow.title}</button>)}
            </div></div>
          )}
          <p className="text-[10.5px] text-slate-500">Suggestions are drafts. Nothing changes until you add it, and every step still needs expert review.</p>
        </div>
      )}
    </div>
  );
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = (props) => {
  const { node, edge, nodes, edges, readOnly, onUpdateNode, onUpdateEdge, onClose, onSelect } = props;
  if (!node && !edge) return null;

  const panelClass = 'absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto rounded-t-2xl border border-white/10 bg-[#1b1f26]/[0.98] p-4 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:max-h-none lg:w-[340px] lg:rounded-2xl';

  if (edge) {
    const source = nodes.find((n) => n.id === edge.from_node_id);
    if (!source) return null;
    return (
      <aside aria-label="Answer properties" className={panelClass} onPointerDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">{isBranching(source) ? 'Answer' : 'Next step'}</span>
          <div className="ml-auto flex gap-1">
            {!readOnly && <button type="button" onClick={() => props.onDeleteEdge(edge.id)} aria-label="Delete answer" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}
            <button type="button" onClick={onClose} aria-label="Close properties" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[12px] text-slate-400">From <button type="button" className="font-semibold text-slate-200 hover:underline" onClick={() => onSelect({ kind: 'node', id: source.id })}>{source.title}</button></p>
          {isBranching(source) && <CommitField label="Answer text" value={edge.label} disabled={readOnly} onCommit={(label) => label.trim() && onUpdateEdge(edge.id, { label: label.trim() })} />}
          <div>
            <span className={labelClass}>Leads to</span>
            <DestinationSelect edge={edge} source={source} nodes={nodes} disabled={readOnly} label="Answer leads to"
              onChoose={({ existing, create }) => create ? props.onCreateStep(create, { node_id: source.id, edge_id: edge.id }) : onUpdateEdge(edge.id, { to_node_id: existing ?? null })} />
          </div>
        </div>
      </aside>
    );
  }

  const current = node!;
  const config = nodeTypeConfig(current.node_type);
  const details: NodeDetails = current.details || {};
  const setDetails = (patch: Partial<NodeDetails>) => onUpdateNode(current.id, { details: { ...details, ...patch } });
  const answers = outgoing(edges, current.id);
  const listField = (key: ListKey, label: string, placeholder: string) => (
    <ListField label={label} items={(details[key] as string[] | undefined) || []} placeholder={placeholder} disabled={readOnly}
      onChange={(items) => setDetails({ [key]: items } as Partial<NodeDetails>)} />
  );
  const titleLabel = { question: 'Question', start: 'Problem shown to trainees', result: 'Result', safety: 'Safety step title' }[current.node_type as string] || 'Title';
  const instructionsLabel = {
    start: 'Problem description', question: 'Description', action: 'Inspection instructions', safety: 'Safety instructions',
    media: 'What to compare', workflow: 'When to use this workflow', result: 'Result summary',
  }[current.node_type as string] || 'Instructions';

  return (
    <aside aria-label="Node properties" className={panelClass} onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: config.accent }}>{config.label}</span>
        <div className="ml-auto flex gap-1">
          {!readOnly && !current.is_start && (
            <>
              <button type="button" onClick={() => props.onDuplicate(current.id)} aria-label="Duplicate step" title="Duplicate" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Copy className="h-4 w-4" /></button>
              <button type="button" onClick={props.onDelete} aria-label="Delete step" title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close properties" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {current.origin === 'ai_draft' && (
        <div className="mb-3 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-[12px] text-violet-100">
          <p className="flex items-center gap-1.5 font-semibold"><Bot className="h-3.5 w-3.5" />AI-drafted step</p>
          <p className="mt-1 text-violet-200/80">Check the wording and facts against approved knowledge. Editing the step, or confirming below, marks it reviewed.</p>
          {details.unsourced && <p className="mt-1 text-amber-200">No approved source supported this step — add the machine-specific details yourself.</p>}
          {!readOnly && <button type="button" onClick={() => onUpdateNode(current.id, { mark_reviewed: true })} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-violet-500"><Check className="h-3.5 w-3.5" />Mark as reviewed</button>}
        </div>
      )}

      <div className="space-y-3">
        {!current.is_start && (
          <label className="block">
            <span className={labelClass}>Step type</span>
            <select value={current.node_type} disabled={readOnly} onChange={(e) => onUpdateNode(current.id, { node_type: e.target.value as DecisionNodeType })} className={inputClass}>
              {PALETTE.map((entry) => <option key={entry.type} value={entry.type}>{entry.label}</option>)}
            </select>
          </label>
        )}
        <CommitField label={titleLabel} value={current.title} disabled={readOnly} onCommit={(title) => title.trim() && onUpdateNode(current.id, { title: title.trim() })} />
        <CommitField label={instructionsLabel} multiline value={current.instructions} disabled={readOnly} onCommit={(instructions) => onUpdateNode(current.id, { instructions })} />

        {isBranching(current) && (
          <Section title={`Answers (${answers.length})`}>
            <ul className="space-y-2" aria-label="Answers">
              {answers.map((answer, index) => (
                <li key={answer.id} className={`rounded-xl border p-2.5 ${answer.to_node_id ? 'border-white/[0.06] bg-white/[0.02]' : 'border-amber-400/40 bg-amber-500/5'}`}>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1"><CommitField id={`answer-${answer.id}`} label={`Answer ${index + 1}`} value={answer.label} disabled={readOnly} onCommit={(label) => label.trim() && onUpdateEdge(answer.id, { label: label.trim() })} /></div>
                    {!readOnly && (
                      <div className="flex flex-col pt-4">
                        <button type="button" aria-label={`Move ${answer.label} up`} disabled={index === 0} onClick={() => props.onReorderAnswers(current.id, swap(answers.map((a) => a.id), index, index - 1))} className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label={`Move ${answer.label} down`} disabled={index === answers.length - 1} onClick={() => props.onReorderAnswers(current.id, swap(answers.map((a) => a.id), index, index + 1))} className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    {!readOnly && <button type="button" aria-label={`Delete answer ${answer.label}`} onClick={() => props.onDeleteEdge(answer.id)} className="mt-4 rounded-md p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                  <div className="mt-2">
                    <DestinationSelect edge={answer} source={current} nodes={nodes} disabled={readOnly} label={`Next step for ${answer.label}`}
                      onChoose={({ existing, create }) => create ? props.onCreateStep(create, { node_id: current.id, edge_id: answer.id }) : onUpdateEdge(answer.id, { to_node_id: existing ?? null })} />
                  </div>
                  {props.simulationEnabled && <AnswerSimFields edge={answer} disabled={readOnly} onChange={(condition) => onUpdateEdge(answer.id, { condition })} />}
                </li>
              ))}
            </ul>
            {!readOnly && <button type="button" onClick={() => props.onAddAnswer(current.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-400/40 px-3 py-1.5 text-[12px] font-semibold text-blue-200 hover:bg-blue-500/10"><Plus className="h-3.5 w-3.5" />Add answer</button>}
          </Section>
        )}

        {!isBranching(current) && !isTerminal(current) && (
          <Section title="Next step">
            <DestinationSelect edge={answers[0]} source={current} nodes={nodes} disabled={readOnly} label="Next step"
              onChoose={({ existing, create }) => {
                if (create) props.onCreateStep(create, answers[0] ? { node_id: current.id, edge_id: answers[0].id } : { node_id: current.id });
                else if (answers[0]) onUpdateEdge(answers[0].id, { to_node_id: existing ?? null });
                else if (existing) props.onAddAnswer(current.id, undefined, existing);
              }} />
          </Section>
        )}

        {props.simulationEnabled && (
          <Section title="Simulation scenario" defaultOpen={false} badge={<span className="rounded bg-amber-500/20 px-1.5 text-[9px] font-bold uppercase text-amber-200">Sim</span>}>
            <NodeSimFields node={current} disabled={readOnly} onUpdate={(patch) => onUpdateNode(current.id, patch)} />
          </Section>
        )}

        <Section title="Guidance for trainees" defaultOpen={!['result', 'start'].includes(current.node_type)}>
          <CommitField label="Explanation — why this matters" multiline value={current.help_text || ''} disabled={readOnly} placeholder="Explain in simple words why this step is important" onCommit={(help_text) => onUpdateNode(current.id, { help_text })} />
          <CommitField label="What to observe" multiline value={current.expected_observation || ''} disabled={readOnly} placeholder="Sound, reading or visual sign to look for" onCommit={(expected_observation) => onUpdateNode(current.id, { expected_observation })} />
          {current.node_type === 'question' && <TermsField terms={details.technical_terms || []} disabled={readOnly} onChange={(technical_terms) => setDetails({ technical_terms })} />}
        </Section>

        {current.node_type === 'action' && (
          <Section title="Action details">
            {listField('corrective_actions', 'Corrective actions', 'e.g. Re-seat the connector')}
            <CommitField label="Completion condition" value={details.completion_condition || ''} disabled={readOnly} placeholder="When is this step done?" onCommit={(completion_condition) => setDetails({ completion_condition })} />
          </Section>
        )}

        {current.node_type === 'result' && (
          <Section title="Result report">
            {listField('possible_causes', 'Possible causes', 'e.g. Worn gantry bearing')}
            {listField('recommended_actions', 'Recommended next actions', 'e.g. Request a service engineer')}
            <CommitField label="Escalation instructions" multiline value={details.escalation || ''} disabled={readOnly} placeholder="Who to contact and when" onCommit={(escalation) => setDetails({ escalation })} />
          </Section>
        )}

        <Section title="Safety" defaultOpen={current.node_type === 'safety' || Boolean(current.safety_warning)}>
          <CommitField label="Safety warning" multiline value={current.safety_warning || ''} disabled={readOnly} placeholder="Shown prominently before the trainee continues" onCommit={(safety_warning) => onUpdateNode(current.id, { safety_warning })} />
          {current.node_type === 'safety' && (
            <>
              {listField('ppe', 'PPE requirements', 'e.g. Insulated gloves')}
              {listField('precautions', 'Required precautions', 'e.g. Wait 5 minutes after power-off')}
              {listField('restricted_operations', 'Restricted operations', 'e.g. Do not open the HV cabinet')}
            </>
          )}
        </Section>

        <Section title={`Media (${current.media.length})`} defaultOpen={current.node_type === 'media' || current.media.length > 0}>
          <MediaManager node={current} readOnly={readOnly} machineId={props.machineId} library={props.mediaLibrary}
            onChange={(ids) => onUpdateNode(current.id, { media_asset_ids: ids })} onUpload={props.onUpload} />
        </Section>

        {['workflow', 'action', 'result', 'question'].includes(current.node_type) && (
          <Section title="Guided Workflow" defaultOpen={current.node_type === 'workflow' || Boolean(current.linked_workflow_version_id)}>
            <select aria-label="Linked guided workflow" value={current.linked_workflow_version_id || ''} disabled={readOnly}
              onChange={(e) => onUpdateNode(current.id, { linked_workflow_version_id: e.target.value || null })} className={inputClass}>
              <option value="">No linked workflow</option>
              {props.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.title}</option>)}
            </select>
          </Section>
        )}

        {!readOnly && (
          <Section title="AI assistant" defaultOpen={false} badge={<Sparkles className="h-3 w-3 text-violet-300" />}>
            <AssistPanel node={current} readOnly={readOnly} onAssist={props.onAssist}
              onAddAnswer={(label) => props.onAddAnswer(current.id, label)}
              onAddQuestion={(title) => props.onCreateStep('question', { node_id: current.id }, title)}
              onAddSafety={(text) => onUpdateNode(current.id, { safety_warning: [current.safety_warning, text].filter(Boolean).join('\n') })}
              onAttach={(id) => onUpdateNode(current.id, { media_asset_ids: [...current.media.map((m) => m.id), id] })}
              onLinkWorkflow={(id) => onUpdateNode(current.id, { linked_workflow_version_id: id })}
              onLinkKnowledge={(id) => onUpdateNode(current.id, { linked_knowledge_version_id: id })} />
          </Section>
        )}
      </div>
    </aside>
  );
};

const TermsField: React.FC<{ terms: Array<{ term: string; definition: string }>; disabled: boolean; onChange: (terms: Array<{ term: string; definition: string }>) => void }> = ({ terms, disabled, onChange }) => {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  return (
    <div>
      <span className={labelClass}>Technical terms</span>
      <ul className="space-y-1.5" aria-label="Technical terms">
        {terms.map((entry, index) => (
          <li key={`${entry.term}-${index}`} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[12px]">
            <span className="flex-1"><strong className="text-slate-100">{entry.term}</strong> <span className="text-slate-400">— {entry.definition}</span></span>
            {!disabled && <button type="button" aria-label={`Remove ${entry.term}`} onClick={() => onChange(terms.filter((_, i) => i !== index))} className="text-slate-500 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="mt-1.5 grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" aria-label="New term" className={inputClass} />
          <input value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="Simple definition" aria-label="New term definition" className={inputClass} />
          <button type="button" aria-label="Add term" onClick={() => { if (term.trim() && definition.trim()) { onChange([...terms, { term: term.trim(), definition: definition.trim() }]); setTerm(''); setDefinition(''); } }}
            className="rounded-lg border border-white/10 px-2.5 text-slate-300 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

function swap(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
