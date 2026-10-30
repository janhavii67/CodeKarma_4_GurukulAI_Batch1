import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive, ArchiveRestore, Clock3, Copy, GitFork, GitBranch, Layers, Loader2, Plus, Search, Trash2, Users,
} from 'lucide-react';
import { getApiUrl } from '../../lib/api/client';
import { fetchAllMachines } from '../knowledge-capture/knowledgeApi';
import { decisionTreeApi } from './api';
import { TreeForm } from './components/TreeForm';
import type { DecisionGuide, TreeStatus } from './types';

const STATUS: Record<TreeStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  pending_approval: { label: 'Pending approval', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-slate-400 ring-slate-200' },
};
const FILTERS: Array<{ key: 'all' | TreeStatus; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'draft', label: 'Drafts' }, { key: 'pending_approval', label: 'Pending approval' },
  { key: 'published', label: 'Published' }, { key: 'archived', label: 'Archived' },
];
const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const DecisionTreesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [machineFilter, setMachineFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TreeStatus>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const guidesQuery = useQuery({ queryKey: ['decision-trees', 'all'], queryFn: () => decisionTreeApi.listGuides({ includeArchived: true }) });
  const machinesQuery = useQuery({ queryKey: ['decision-tree-machines'], queryFn: () => fetchAllMachines(), staleTime: 5 * 60_000 });
  const machines = (machinesQuery.data?.items || []).map(({ id, name }) => ({ id, name }));
  const all = guidesQuery.data || [];

  const categories = useMemo(() => Array.from(new Set(all.map((guide) => guide.problem_category))).sort(), [all]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((guide) =>
      (statusFilter === 'all' ? guide.status !== 'archived' : guide.status === statusFilter)
      && (!machineFilter || guide.machine_id === machineFilter)
      && (!categoryFilter || guide.problem_category === categoryFilter)
      && (!term || `${guide.title} ${guide.problem_category} ${guide.machine_name || ''} ${guide.tags.join(' ')}`.toLowerCase().includes(term)));
  }, [all, categoryFilter, machineFilter, search, statusFilter]);
  const byMachine = useMemo(() => {
    const groups = new Map<string, DecisionGuide[]>();
    filtered.forEach((guide) => groups.set(guide.machine_name || 'Any machine', [...(groups.get(guide.machine_name || 'Any machine') || []), guide]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const recent = useMemo(() => [...all].filter((g) => g.status !== 'archived').sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4), [all]);
  const counts = useMemo(() => ({
    total: all.filter((g) => g.status !== 'archived').length,
    published: all.filter((g) => g.status === 'published').length,
    pending: all.filter((g) => g.status === 'pending_approval').length,
    sessions: all.reduce((sum, g) => sum + g.stats.sessions, 0),
  }), [all]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['decision-trees'] });
  const act = async (guide: DecisionGuide, action: 'duplicate' | 'archive' | 'restore' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Delete the draft tree “${guide.title}”? This cannot be undone.`)) return;
    setError(null);
    setBusyId(guide.id);
    try {
      if (action === 'duplicate') {
        const copy = await decisionTreeApi.duplicateGuide(guide.id);
        navigate(`/app/decision-trees/${copy.id}`);
        return;
      }
      if (action === 'archive') await decisionTreeApi.archiveGuide(guide.id);
      if (action === 'restore') await decisionTreeApi.restoreGuide(guide.id);
      if (action === 'delete') await decisionTreeApi.deleteGuide(guide.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  const field = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-[#14171c] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1.3px)', backgroundSize: '22px 22px' }} />
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">Expert workspace</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Decision Trees</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">Turn troubleshooting expertise into approved, step-by-step paths trainees follow one question at a time.</p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-blue-600/30 hover:bg-blue-500">
            <Plus className="h-4 w-4" />Create decision tree
          </button>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Trees', counts.total, Layers], ['Published', counts.published, GitBranch], ['Pending approval', counts.pending, Clock3], ['Trainee sessions', counts.sessions, Users]].map(([label, value, Icon]) => {
            const I = Icon as React.ElementType;
            return (
              <div key={label as string} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><I className="h-3.5 w-3.5" />{label as string}</dt>
                <dd className="mt-1 text-2xl font-bold">{value as number}</dd>
              </div>
            );
          })}
        </dl>
      </header>

      {showCreate && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">New decision tree</h2>
          <TreeForm machines={machines} submitLabel="Create and open builder" allowAIDraft onCancel={() => setShowCreate(false)}
            onSubmit={async (values, aiPrompt) => {
              const guide = await decisionTreeApi.createGuide(values);
              void refresh();
              let suffix = '';
              if (aiPrompt && guide.working_version_id) {
                try {
                  await decisionTreeApi.aiDraft(guide.working_version_id, aiPrompt, false);
                } catch (err) {
                  suffix = `?ai_error=${encodeURIComponent(err instanceof Error ? err.message : 'AI draft failed')}`;
                }
              }
              navigate(`/app/decision-trees/${guide.id}${suffix}`);
            }} />
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}

      {recent.length > 0 && statusFilter === 'all' && !search && !machineFilter && !categoryFilter && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Recently edited</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((guide) => (
              <Link key={guide.id} to={`/app/decision-trees/${guide.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${STATUS[guide.status].className}`}>{STATUS[guide.status].label}</span>
                <p className="mt-2 line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-blue-700">{guide.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{guide.machine_name || 'Any machine'} · {new Date(guide.updated_at).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {FILTERS.map(({ key, label }) => (
            <button key={key} role="tab" aria-selected={statusFilter === key} type="button" onClick={() => setStatusFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${statusFilter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search decision trees</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems, tags or machines" className={`${field} w-full pl-9`} />
        </label>
        <label><span className="sr-only">Filter by machine</span>
          <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} className={field}>
            <option value="">All machines</option>
            {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Filter by problem category</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={field}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}
          </select>
        </label>
      </div>

      {guidesQuery.isLoading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading decision trees" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <GitFork className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">{all.length ? 'No trees match these filters' : 'No decision trees yet'}</p>
          <p className="mt-1 text-sm text-slate-500">Create one for a machine problem trainees run into often.</p>
        </div>
      ) : (
        byMachine.map(([machineName, guides]) => (
          <section key={machineName} aria-labelledby={`machine-${machineName}`}>
            <h2 id={`machine-${machineName}`} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              {machineName}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{guides.length}</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {guides.map((guide) => (
                <li key={guide.id} className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
                  <Link to={`/app/decision-trees/${guide.id}`} className="absolute inset-0 z-0" aria-label={`Open ${guide.title}`} />
                  <div className="relative h-24 bg-gradient-to-br from-[#1b2230] to-[#0f141b]">
                    {guide.cover_media && <img src={getApiUrl(`${guide.cover_media.url}?inline=true`)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${STATUS[guide.status].className}`}>{STATUS[guide.status].label}</span>
                    <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{guide.difficulty.toLowerCase()}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="text-base font-semibold text-slate-900">{guide.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{pretty(guide.problem_category)} · {guide.severity.toLowerCase()} severity</p>
                    {guide.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{guide.description}</p>}
                    <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
                      {([['Steps', guide.stats.steps], ['Questions', guide.stats.questions], ['Results', guide.stats.results], ['Sessions', guide.stats.sessions]] as const).map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-slate-50 py-1.5"><dd className="text-sm font-bold text-slate-800">{value}</dd><dt className="text-[10px] text-slate-500">{label}</dt></div>
                      ))}
                    </dl>
                    <div className="relative z-10 mt-3 flex items-center gap-1 border-t border-slate-100 pt-3 text-xs">
                      <span className="mr-auto text-slate-400">v{guide.stats.versions} · {new Date(guide.updated_at).toLocaleDateString()}</span>
                      {busyId === guide.id ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
                        <>
                          <button type="button" onClick={() => void act(guide, 'duplicate')} aria-label={`Duplicate ${guide.title}`} title="Duplicate" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy className="h-4 w-4" /></button>
                          {guide.is_archived
                            ? <button type="button" onClick={() => void act(guide, 'restore')} aria-label={`Restore ${guide.title}`} title="Restore" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ArchiveRestore className="h-4 w-4" /></button>
                            : <button type="button" onClick={() => void act(guide, 'archive')} aria-label={`Archive ${guide.title}`} title="Archive" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Archive className="h-4 w-4" /></button>}
                          {guide.status === 'draft' && guide.stats.versions === 1 && (
                            <button type="button" onClick={() => void act(guide, 'delete')} aria-label={`Delete ${guide.title}`} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};
