import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useKnowledgeList, useMachines, useCreateKnowledge } from './hooks';
import { StatusBadge } from './StatusBadge';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ApiClientError } from '../../lib/api/client';

const PAGE_SIZE = 15;

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('knowledge.create');

  // Filters
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createMachineId, setCreateMachineId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: machinesData } = useMachines();
  const machines = machinesData?.items ?? [];

  const params = {
    page,
    page_size: PAGE_SIZE,
    q: search || undefined,
    machine_id: machineFilter || undefined,
    status: statusFilter || undefined,
  };

  const { data, isLoading, isError, error, refetch } = useKnowledgeList(params);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMutation = useCreateKnowledge();

  const handleCreate = async () => {
    setCreateError(null);
    if (!createTitle.trim()) {
      setCreateError('Title is required.');
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        title: createTitle.trim(),
        machine_id: createMachineId || null,
      });
      setShowCreate(false);
      setCreateTitle('');
      setCreateMachineId('');
      navigate(`/app/knowledge/${result.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create knowledge item. Please try again.');
      }
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Knowledge Library</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Expert-authored machine procedures — Module 01
          </p>
        </div>
        {canCreate && (
          <Button
            id="create-knowledge-btn"
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreate(true)}
          >
            New Knowledge Item
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="knowledge-search"
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by title…"
            className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            aria-label="Search knowledge items"
          />
        </div>

        <select
          id="machine-filter"
          value={machineFilter}
          onChange={(e) => { setMachineFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          aria-label="Filter by machine"
        >
          <option value="">All Machines</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>

        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="changes_requested">Changes Requested</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
          <option value="superseded">Superseded</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm flex-1">
            {error instanceof ApiClientError ? error.message : 'Failed to load knowledge items.'}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-rose-300 hover:text-rose-100 transition-colors"
            aria-label="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading knowledge items">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && items.length === 0 && (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-300 font-semibold text-lg">No knowledge items found</p>
          <p className="text-slate-500 text-sm mt-1">
            {search || machineFilter || statusFilter
              ? 'Try adjusting your filters'
              : canCreate
              ? 'Create your first knowledge item to get started'
              : 'No published procedures are available yet'}
          </p>
          {canCreate && !search && !machineFilter && !statusFilter && (
            <Button
              variant="primary"
              className="mt-6"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreate(true)}
            >
              Create Knowledge Item
            </Button>
          )}
        </div>
      )}

      {/* Item list */}
      {!isLoading && items.length > 0 && (
        <div
          className="space-y-2"
          role="list"
          aria-label="Knowledge items"
          aria-live="polite"
        >
          {items.map((item) => {
            const isMine = item.author_id === user?.id;
            return (
              <div
                key={item.id}
                role="listitem"
                className="group flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/60 transition-all cursor-pointer"
                onClick={() => navigate(`/app/knowledge/${item.id}`)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/knowledge/${item.id}`)}
                aria-label={`Open: ${item.title}`}
              >
                {/* Machine icon */}
                <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/40 flex items-center justify-center text-slate-400 group-hover:text-brand-400 transition-colors">
                  <Cpu className="w-5 h-5" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-200 truncate">
                      {item.title}
                    </span>
                    {item.is_demo && (
                      <Badge variant="info" size="sm">Demo</Badge>
                    )}
                    {isMine && (
                      <Badge variant="brand" size="sm">Mine</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                    {item.machine && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {item.machine.name}
                      </span>
                    )}
                    <span>v{item.version_no}</span>
                    <span>Updated {formatDate(item.version_updated_at)}</span>
                  </div>
                </div>

                {/* Status badge */}
                <div className="shrink-0">
                  <StatusBadge status={item.version_status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2" aria-label="Pagination">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Create Modal ──────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-5">
            <h2 id="create-modal-title" className="text-lg font-bold text-slate-100">
              New Knowledge Item
            </h2>

            {createError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {createError}
              </div>
            )}

            <div>
              <label
                htmlFor="new-item-title"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1"
              >
                Title <span className="text-rose-400">*</span>
              </label>
              <input
                id="new-item-title"
                type="text"
                autoFocus
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="e.g., CNC Lathe Startup Procedure"
                maxLength={255}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <div>
              <label
                htmlFor="new-item-machine"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1"
              >
                Machine <span className="text-slate-500 font-normal normal-case">(optional)</span>
              </label>
              <select
                id="new-item-machine"
                value={createMachineId}
                onChange={(e) => setCreateMachineId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">No machine</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowCreate(false); setCreateError(null); setCreateTitle(''); setCreateMachineId(''); }}
              >
                Cancel
              </Button>
              <Button
                id="confirm-create-btn"
                variant="primary"
                className="flex-1"
                isLoading={createMutation.isPending}
                onClick={handleCreate}
              >
                Create Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
