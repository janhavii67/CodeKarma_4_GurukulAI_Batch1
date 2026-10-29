import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  ListOrdered,
  LoaderCircle,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { Machine } from '../knowledge-capture/types';
import type { Procedure, ProcedureRun } from './types';

const GENERAL = 'General';

export interface WorkflowDetailsInput { title: string; description: string; operation: string }

interface WorkflowPickerProps {
  machine: Machine;
  workflows: Procedure[];
  archived: Procedure[];
  runs: ProcedureRun[];
  loading: boolean;
  openingId: string | null;
  busyId: string | null;
  canCreate: boolean;
  managementNotice: string;
  reducedMotion: boolean;
  isOwner: (workflow: Procedure) => boolean;
  onOpen: (workflow: Procedure) => void;
  onSaveDetails: (workflow: Procedure, details: WorkflowDetailsInput) => Promise<boolean>;
  onDuplicate: (workflow: Procedure) => void;
  onArchive: (workflow: Procedure) => void;
  onRestore: (workflow: Procedure) => void;
}

function categoryOf(workflow: Procedure) {
  return workflow.operation?.trim() || GENERAL;
}

function runProgress(workflow: Procedure, runs: ProcedureRun[]) {
  const active = runs.find((run) => run.procedure_id === workflow.id && run.status === 'IN_PROGRESS');
  const finished = runs.some((run) => run.procedure_id === workflow.id && run.status === 'COMPLETED');
  const stepIds = new Set(workflow.steps.map((step) => step.id));
  const done = active ? active.step_executions.filter((execution) => execution.is_completed && stepIds.has(execution.step_id)).length : 0;
  return { active, finished, done };
}

export function WorkflowPicker(props: WorkflowPickerProps) {
  const { machine, workflows, archived, runs, loading, openingId, busyId, canCreate, managementNotice, reducedMotion, isOwner, onOpen, onSaveDetails, onDuplicate, onArchive, onRestore } = props;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [showArchived, setShowArchived] = useState(false);

  const categories = useMemo(() => ['All', ...Array.from(new Set(workflows.map(categoryOf))).sort((a, b) => a.localeCompare(b))], [workflows]);
  const visible = workflows.filter((workflow) => {
    const text = `${workflow.title} ${workflow.description} ${categoryOf(workflow)}`.toLowerCase();
    return (category === 'All' || categoryOf(workflow) === category) && text.includes(query.trim().toLowerCase());
  });

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading workflows" aria-busy="true">
    {[0, 1, 2].map((index) => <div key={index} className="min-h-56 animate-pulse rounded-[1.4rem] border border-[#DCE6F0] bg-white p-5 motion-reduce:animate-none"><div className="h-5 w-24 rounded-full bg-[#E8EEF3]" /><div className="mt-5 h-6 w-3/4 rounded bg-[#E8EEF3]" /><div className="mt-3 h-3 w-full rounded bg-[#F0F3F6]" /><div className="mt-2 h-3 w-2/3 rounded bg-[#F0F3F6]" /><div className="mt-8 h-11 w-full rounded-full bg-[#E8EEF3]" /></div>)}
  </div>;

  return <section aria-labelledby="workflow-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">{machine.name} · <span className="font-mono normal-case tracking-normal">{machine.code}</span></p>
        <h2 id="workflow-heading" className="mt-1 text-2xl font-bold tracking-tight text-[#17324D]">Choose a workflow</h2>
        <p className="mt-1 text-sm text-[#536779]">{workflows.length === 1 ? '1 published workflow' : `${workflows.length} published workflows`} for this machine. Your progress is saved per workflow.</p>
      </div>
      {canCreate && <Link to="/app/procedures/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] active:translate-y-px motion-reduce:transition-none"><Plus size={16} />New workflow</Link>}
    </div>

    {managementNotice && <p role="status" className="rounded-xl border border-[#DCE6F0] bg-white p-3 text-xs text-[#344B60]">{managementNotice}</p>}

    {workflows.length === 0 ? <div className="rounded-[1.4rem] border border-[#DCE6F0] bg-white p-7 shadow-[0_10px_28px_-22px_rgba(23,50,77,0.34)] sm:p-9">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8F1F4] text-[#176E8A]"><ClipboardCheck size={24} /></div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">No path published yet</p>
      <h3 className="mt-2 text-xl font-bold tracking-tight text-[#17324D]">No approved procedure is available for {machine.name}</h3>
      <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[#536779]">The learning path will appear after an Expert publishes an approved procedure for this machine. This screen only displays verified content; it does not create training instructions.</p>
      {canCreate && <Link to="/app/procedures/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] active:translate-y-px motion-reduce:transition-none"><FileText size={16} />Create a procedure</Link>}
    </div> : <>
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DCE6F0] bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search workflows</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#708196]" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, description, or category" className="min-h-11 w-full rounded-xl border border-[#DCE6F0] bg-[#F8FAFB] pl-10 pr-3 text-sm text-[#17324D] outline-none focus:border-[#176E8A] focus:bg-white focus:ring-2 focus:ring-[#176E8A]/15" />
        </label>
        {categories.length > 2 && <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`min-h-9 rounded-full px-3.5 text-xs font-bold transition motion-reduce:transition-none ${category === item ? 'bg-[#17324D] text-white' : 'bg-[#F1F5F7] text-[#344B60] hover:bg-[#E8F1F4]'}`}>{item}</button>)}
        </div>}
      </div>

      {visible.length === 0 ? <p className="rounded-2xl border border-dashed border-[#C8D6E4] bg-white p-6 text-center text-sm text-[#536779]">No workflows match “{query}”{category !== 'All' ? ` in ${category}` : ''}.</p> : <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((workflow, index) => <motion.li key={workflow.id} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}>
          <WorkflowCard workflow={workflow} runs={runs} owner={isOwner(workflow)} opening={openingId === workflow.id} busy={busyId === workflow.id} disabled={Boolean(openingId)} onOpen={onOpen} onSaveDetails={onSaveDetails} onDuplicate={onDuplicate} onArchive={onArchive} />
        </motion.li>)}
      </ul>}
    </>}

    {archived.length > 0 && <div className="rounded-2xl border border-[#DCE6F0] bg-white">
      <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((open) => !open)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-sm font-bold text-[#17324D]">
        <span className="inline-flex items-center gap-2"><Archive size={16} className="text-[#536779]" />Your archived workflows ({archived.length})</span>
        <ChevronDown size={16} className={`transition-transform motion-reduce:transition-none ${showArchived ? 'rotate-180' : ''}`} />
      </button>
      {showArchived && <ul className="space-y-2 border-t border-[#E7EDF1] p-3">
        {archived.map((workflow) => <li key={workflow.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F8FAFB] px-3 py-2.5">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#344B60]">{workflow.title}</p><p className="text-[11px] text-[#708196]">{categoryOf(workflow)} · {workflow.steps.length} steps · hidden from trainees</p></div>
          <button type="button" disabled={busyId === workflow.id} onClick={() => onRestore(workflow)} aria-label={`Restore ${workflow.title}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-3 text-xs font-bold text-[#176E8A] transition hover:bg-[#F4F8FA] disabled:opacity-50 motion-reduce:transition-none"><RotateCcw size={14} />Restore</button>
        </li>)}
      </ul>}
    </div>}
  </section>;
}

interface WorkflowCardProps {
  workflow: Procedure;
  runs: ProcedureRun[];
  owner: boolean;
  opening: boolean;
  busy: boolean;
  disabled: boolean;
  onOpen: (workflow: Procedure) => void;
  onSaveDetails: (workflow: Procedure, details: WorkflowDetailsInput) => Promise<boolean>;
  onDuplicate: (workflow: Procedure) => void;
  onArchive: (workflow: Procedure) => void;
}

function WorkflowCard({ workflow, runs, owner, opening, busy, disabled, onOpen, onSaveDetails, onDuplicate, onArchive }: WorkflowCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [details, setDetails] = useState<WorkflowDetailsInput>({ title: workflow.title, description: workflow.description, operation: workflow.operation || '' });
  const { active, finished, done } = runProgress(workflow, runs);
  const stepCount = workflow.steps.length;
  const label = active ? `Resume · ${done}/${stepCount}` : finished ? 'Start again' : 'Start workflow';

  const save = async () => {
    if (!details.title.trim() || !details.description.trim()) return;
    if (await onSaveDetails(workflow, details)) setEditing(false);
  };

  return <article className="flex h-full flex-col rounded-[1.4rem] border border-[#DCE6F0] bg-white p-5 shadow-[0_10px_28px_-22px_rgba(23,50,77,0.34)] transition hover:border-[#176E8A]/40 hover:shadow-md motion-reduce:transition-none">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-[#E8F1F4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#176E8A]">{categoryOf(workflow)}</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-[#DCE6F0] px-2.5 py-1 text-[10px] font-semibold text-[#344B60]"><ShieldCheck size={12} className="text-[#176E8A]" />Approved · v{workflow.version}</span>
      {workflow.safety_warnings?.trim() && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900"><ShieldAlert size={12} />Safety alert</span>}
    </div>

    {editing ? <div className="mt-4 space-y-3">
      <label className="block text-xs font-semibold text-[#536779]">Title<input value={details.title} onChange={(event) => setDetails({ ...details, title: event.target.value })} maxLength={256} className="mt-1 w-full rounded-xl border border-[#DCE6F0] px-3 py-2 text-sm text-[#17324D] outline-none focus:border-[#176E8A]" /></label>
      <label className="block text-xs font-semibold text-[#536779]">Category<input value={details.operation} onChange={(event) => setDetails({ ...details, operation: event.target.value })} maxLength={120} placeholder="e.g. Startup, Calibration" className="mt-1 w-full rounded-xl border border-[#DCE6F0] px-3 py-2 text-sm text-[#17324D] outline-none focus:border-[#176E8A]" /></label>
      <label className="block text-xs font-semibold text-[#536779]">Description<textarea value={details.description} onChange={(event) => setDetails({ ...details, description: event.target.value })} rows={3} className="mt-1 w-full resize-y rounded-xl border border-[#DCE6F0] px-3 py-2 text-sm text-[#17324D] outline-none focus:border-[#176E8A]" /></label>
      <p className="text-[11px] leading-4 text-[#708196]">Steps, attachments, and safety content change through “Edit steps”, which saves a new workflow so in-progress runs keep their original steps.</p>
      <div className="flex gap-2"><button type="button" disabled={busy || !details.title.trim() || !details.description.trim()} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#176E8A] px-4 text-xs font-bold text-white disabled:opacity-50">{busy && <LoaderCircle size={14} className="animate-spin" />}Save details</button><button type="button" onClick={() => { setEditing(false); setDetails({ title: workflow.title, description: workflow.description, operation: workflow.operation || '' }); }} className="min-h-10 rounded-full border border-[#DCE6F0] px-4 text-xs font-semibold text-[#17324D]">Cancel</button></div>
    </div> : <>
      <h3 className="mt-4 text-lg font-bold leading-6 tracking-tight text-[#17324D]">{workflow.title}</h3>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-[#536779]">{workflow.description}</p>
    </>}

    <div className="mt-auto pt-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#536779]"><ListOrdered size={14} />{stepCount} {stepCount === 1 ? 'step' : 'steps'}{finished && !active && <span className="ml-1 inline-flex items-center gap-1 text-[#2A9D90]"><CheckCircle2 size={13} />Completed before</span>}</p>
      {active && <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#DCE6F0]" role="progressbar" aria-label={`${workflow.title} progress`} aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={done}><div className="h-full rounded-full bg-[#36B3A8]" style={{ width: `${stepCount ? (done / stepCount) * 100 : 0}%` }} /></div>}
      <button type="button" disabled={disabled || editing} onClick={() => onOpen(workflow)} aria-label={`${label}: ${workflow.title}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#17324D] px-5 text-sm font-bold text-white transition hover:bg-[#0F2236] active:translate-y-px disabled:opacity-50 motion-reduce:transition-none">
        {opening ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{opening ? 'Opening…' : label}
      </button>
      {owner && !editing && <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#E7EDF1] pt-3" aria-label={`Manage ${workflow.title}`}>
        <button type="button" disabled={busy} onClick={() => setEditing(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[#344B60] hover:bg-[#F4F8FA]" aria-label={`Edit details of ${workflow.title}`}><PencilLine size={13} />Details</button>
        <Link to={`/app/procedures/new?from=${encodeURIComponent(workflow.id)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[#344B60] hover:bg-[#F4F8FA]" aria-label={`Edit steps of ${workflow.title}`}><ListOrdered size={13} />Edit steps</Link>
        <button type="button" disabled={busy} onClick={() => onDuplicate(workflow)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[#344B60] hover:bg-[#F4F8FA]" aria-label={`Duplicate ${workflow.title}`}><Copy size={13} />Duplicate</button>
        {confirmArchive ? <span className="inline-flex items-center gap-1"><button type="button" disabled={busy} onClick={() => { setConfirmArchive(false); onArchive(workflow); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100" aria-label={`Confirm archive ${workflow.title}`}>Confirm archive</button><button type="button" onClick={() => setConfirmArchive(false)} className="min-h-9 rounded-full px-2 text-xs text-[#536779]">Cancel</button></span>
          : <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[#344B60] hover:bg-[#F4F8FA]" aria-label={`Archive ${workflow.title}`}><Archive size={13} />Archive</button>}
      </div>}
    </div>
  </article>;
}
