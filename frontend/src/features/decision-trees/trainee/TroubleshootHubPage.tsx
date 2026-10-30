import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Cpu, History, Loader2, PlayCircle, Search, Siren, Stethoscope } from 'lucide-react';
import { getApiUrl } from '../../../lib/api/client';
import { walkApi } from '../api';
import type { DecisionGuide, WalkHistoryItem } from '../types';

const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const DIFFICULTY_STYLE: Record<string, string> = { BEGINNER: 'bg-emerald-50 text-emerald-700', INTERMEDIATE: 'bg-blue-50 text-blue-700', ADVANCED: 'bg-violet-50 text-violet-700' };
const STATUS_STYLE: Record<WalkHistoryItem['status'], { label: string; className: string; icon: React.ElementType }> = {
  in_progress: { label: 'In progress', className: 'text-blue-700 bg-blue-50', icon: PlayCircle },
  resolved: { label: 'Completed', className: 'text-emerald-700 bg-emerald-50', icon: CheckCircle2 },
  unresolved: { label: 'Unresolved', className: 'text-amber-700 bg-amber-50', icon: Clock3 },
  escalated: { label: 'Sent to expert', className: 'text-rose-700 bg-rose-50', icon: Siren },
};
const formatDuration = (seconds?: number | null) => (seconds == null ? '' : seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`);

/** Trainee entry point: pick a published machine guide and follow its full branching tree. */
export const TroubleshootHubPage: React.FC = () => {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'find';
  const machineKey = params.get('machine');
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogQuery = useQuery({ queryKey: ['decision-tree-catalog'], queryFn: () => walkApi.catalog() });
  const historyQuery = useQuery({ queryKey: ['decision-tree-walk-history'], queryFn: walkApi.history });
  const catalog = catalogQuery.data;
  const inProgress = (historyQuery.data || []).filter((item) => item.status === 'in_progress');

  const term = search.trim().toLowerCase();
  const machines = useMemo(() => (catalog?.machines || []).filter((machine) => !term || machine.name.toLowerCase().includes(term)
    || (catalog?.trees || []).some((tree) => (tree.machine_id || 'general') === (machine.id || 'general') && tree.title.toLowerCase().includes(term))), [catalog, term]);
  const selectedMachine = (catalog?.machines || []).find((machine) => (machine.id || 'general') === machineKey);
  const trees = useMemo(() => (catalog?.trees || []).filter((tree) =>
    (!machineKey || (tree.machine_id || 'general') === machineKey)
    && (!term || `${tree.title} ${tree.description || ''} ${tree.problem_category} ${tree.tags.join(' ')}`.toLowerCase().includes(term))), [catalog, machineKey, term]);

  const start = async (tree: DecisionGuide) => {
    setStarting(tree.id);
    setError(null);
    try {
      const state = await walkApi.start(tree.id);
      navigate(`/app/troubleshooting/guided/${state.session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This troubleshooting guide could not be started.');
      setStarting(null);
    }
  };
  const setParam = (key: string, value: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const cardMotion = (index: number) => (reducedMotion ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(index, 8) * 0.04 } });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0f2a4a] via-[#123a66] to-[#1d4f8f] px-6 py-8 text-white sm:px-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200"><Stethoscope className="h-4 w-4" />Guided troubleshooting</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">What problem are you seeing?</h1>
        <p className="mt-2 max-w-xl text-sm text-blue-100">Choose a machine and problem to open its expert-published troubleshooting tree.</p>
        <label className="relative mt-5 block max-w-xl">
          <span className="sr-only">Search machines and problems</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a machine or symptom, e.g. vibration"
            className="w-full rounded-2xl border-0 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-lg placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-300/40" />
        </label>
      </header>

      <div role="tablist" aria-label="Troubleshooting sections" className="flex gap-1 rounded-2xl bg-slate-100 p-1 sm:w-fit">
        <button role="tab" aria-selected={tab === 'find'} type="button" onClick={() => setParam('tab', null)} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold sm:flex-none ${tab === 'find' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Find a problem</button>
        <button role="tab" aria-selected={tab === 'history'} type="button" onClick={() => setParam('tab', 'history')} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold sm:flex-none ${tab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          <History className="mr-1.5 inline h-4 w-4" />My sessions{inProgress.length ? ` (${inProgress.length} open)` : ''}
        </button>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p>}

      {tab === 'find' && inProgress.length > 0 && !machineKey && (
        <Link to={`/app/troubleshooting/guided/${inProgress[0].session_id}`} className="flex items-center gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-4 transition hover:border-blue-300">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white"><PlayCircle className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-blue-950">Resume: {inProgress[0].guide_title}</span>
            <span className="block truncate text-xs text-blue-800/80">{inProgress[0].machine_name} · at “{inProgress[0].current_step}”</span>
          </span>
          <ArrowRight className="h-5 w-5 text-blue-600" />
        </Link>
      )}

      {tab === 'find' && (catalogQuery.isLoading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading machines" /></div>
      ) : !machineKey && !term ? (
        machines.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Machines">
            {machines.map((machine, index) => (
              <motion.li key={machine.id || 'general'} {...cardMotion(index)}>
                <button type="button" onClick={() => setParam('machine', machine.id || 'general')}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
                  <div className="relative h-32 bg-gradient-to-br from-slate-800 to-slate-900">
                    {machine.cover_media
                      ? <img src={getApiUrl(`${machine.cover_media.url}?inline=true`)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:scale-105" />
                      : <Cpu className="absolute bottom-4 right-4 h-14 w-14 text-white/15" />}
                    <span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-800">{machine.tree_count} problem{machine.tree_count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-lg font-bold text-slate-900">{machine.name}</p>
                    {machine.category && <p className="text-xs text-slate-500">{machine.category}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {machine.problem_categories.slice(0, 4).map((category) => <span key={category} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{pretty(category)}</span>)}
                    </div>
                    <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-blue-600">View problems<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                  </div>
                </button>
              </motion.li>
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Cpu className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No published troubleshooting guides yet</p>
            <p className="mt-1 text-sm text-slate-500">Experts publish guides here once they are approved.</p>
          </div>
        )
      ) : (
        <section aria-label="Problems">
          {machineKey && (
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setParam('machine', null)} aria-label="Back to machines" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /></button>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Machine</p><h2 className="text-lg font-bold text-slate-900">{selectedMachine?.name || 'Machine'}</h2></div>
            </div>
          )}
          {trees.length ? (
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Problems for this machine">
              {trees.map((tree, index) => (
                <motion.li key={tree.id} {...cardMotion(index)}>
                  <button type="button" disabled={Boolean(starting)} onClick={() => void start(tree)} aria-label={`Start troubleshooting: ${tree.title}`}
                    className="group flex h-full w-full overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg disabled:cursor-wait">
                    <div className="relative w-28 shrink-0 bg-gradient-to-br from-blue-600 to-indigo-700 sm:w-36">
                      {tree.cover_media ? <img src={getApiUrl(`${tree.cover_media.url}?inline=true`)} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <Stethoscope className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/40" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${DIFFICULTY_STYLE[tree.difficulty] || 'bg-slate-100 text-slate-600'}`}>{tree.difficulty.toLowerCase()}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{pretty(tree.problem_category)}</span>
                        {tree.estimated_minutes && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"><Clock3 className="h-3 w-3" />~{tree.estimated_minutes} min</span>}
                      </div>
                      <p className="mt-2 text-base font-bold text-slate-900">{tree.title}</p>
                      {!machineKey && tree.machine_name && <p className="text-xs text-slate-500">{tree.machine_name}</p>}
                      {tree.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{tree.description}</p>}
                      <span className="mt-auto flex items-center gap-1.5 pt-3 text-sm font-semibold text-blue-600">
                        {starting === tree.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Start troubleshooting
                      </span>
                    </div>
                  </button>
                </motion.li>
              ))}
            </ul>
          ) : <p className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500">No published problems match your search.</p>}
        </section>
      ))}

      {tab === 'history' && (historyQuery.isLoading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading sessions" /></div>
      ) : (historyQuery.data || []).length ? (
        <ul className="space-y-3" aria-label="Previous sessions">
          {(historyQuery.data || []).map((item) => {
            const style = STATUS_STYLE[item.status];
            const Icon = style.icon;
            return (
              <li key={item.session_id}>
                <Link to={`/app/troubleshooting/guided/${item.session_id}`} className="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:shadow-md">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.className}`}><Icon className="h-3.5 w-3.5" />{style.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{item.guide_title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[item.machine_name, new Date(item.started_at).toLocaleString(), formatDuration(item.duration_seconds), item.result_title ? `Result: ${item.result_title}` : `${item.steps_answered} steps answered`].filter(Boolean).join(' · ')}
                    </span>
                    {item.path.length > 0 && <span className="mt-1 block truncate text-xs text-slate-400">Path: {item.path.join(' → ')}</span>}
                  </span>
                  <span className="text-sm font-semibold text-blue-600">{item.status === 'in_progress' ? 'Resume' : 'View report'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500">You haven’t started any guided troubleshooting yet.</p>)}
    </div>
  );
};
