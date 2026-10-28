import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Cpu,
  RefreshCw,
  AlertCircle,
  Calendar,
  BookOpen,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useKnowledgeList, useMachines, useCreateKnowledge } from './hooks';
import { StatusBadge } from './StatusBadge';
import { Button } from '../../components/ui/Button';
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

  const role = user?.role_id;
  const isTrainee = role === 'TRAINEE';
  const isOperator = role === 'OPERATOR';
  const isExpert = role === 'EXPERT';
  const isAdmin = role === 'ADMIN';
  const canApprove = hasPermission('knowledge.approve');

  // Count items awaiting review
  const pendingReviewCount = items.filter((i) => i.version_status === 'in_review').length;

  return (
    <div className="min-h-screen bg-[#F7FAFE] text-[#12345A] font-sans">

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Dynamic Role Perspective Hero Banner */}
        {isTrainee && (
          <div className="rounded-2xl p-6 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-white border border-emerald-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    🎓 Apprentice Learning Portal
                  </span>
                  <span className="text-xs text-emerald-700 font-medium">Logged in as {user?.name || 'Trainee'}</span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#12345A] tracking-tight">
                  Manufacturing Standard Operating Procedures
                </h1>
                <p className="text-xs sm:text-sm text-[#536780] mt-1 max-w-2xl leading-relaxed">
                  Study verified machine operating protocols, tolerance limits, and mandatory safety warnings. Click any approved SOP to begin interactive training.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
                Verified Training Curriculum
              </span>
            </div>
          </div>
        )}

        {isOperator && (
          <div className="rounded-2xl p-6 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-white border border-amber-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-600/20">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-200">
                    ⚙️ Shopfloor SOP Execution Center
                  </span>
                  <span className="text-xs text-amber-800 font-medium">Logged in as {user?.name || 'Operator'}</span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#12345A] tracking-tight">
                  Machine Operating &amp; Diagnostic Procedures
                </h1>
                <p className="text-xs sm:text-sm text-[#536780] mt-1 max-w-2xl leading-relaxed">
                  Active standard procedures for CNC milling, hydraulic presses, and precision workstations. Select a procedure to execute tool setups, operating conditions, and safety checklists.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-900 text-xs font-semibold shadow-xs">
                Production Floor Active
              </span>
            </div>
          </div>
        )}

        {isExpert && (
          <div className="rounded-2xl p-6 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-white border border-[#BCD7F5] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#1473E6] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#1473E6]/20">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1473E6] bg-[#EFF7FF] px-2.5 py-0.5 rounded-full border border-[#BCD7F5]">
                    🔬 Knowledge Engineering Studio
                  </span>
                  <span className="text-xs text-[#536780] font-medium">Authoring &amp; Peer Verification Portal</span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#12345A] tracking-tight">
                  Knowledge Library &amp; Authoring Repository
                </h1>
                <p className="text-xs sm:text-sm text-[#536780] mt-1 max-w-2xl leading-relaxed">
                  Capture tacit machining knowledge, calibrate tolerance bands, and peer-review colleague submissions for shopfloor release and AI Assistant grounding.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {canCreate && (
                <Button
                  id="create-knowledge-btn"
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowCreate(true)}
                  className="bg-[#1473E6] hover:bg-[#1060C4] text-white shadow-xs"
                >
                  + New Knowledge Item
                </Button>
              )}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="rounded-2xl p-6 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-white border border-purple-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-700/20">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100/80 px-2.5 py-0.5 rounded-full border border-purple-200">
                    🛡️ Quality &amp; Compliance Governance
                  </span>
                  <span className="text-xs text-purple-700 font-medium">Platform Administration</span>
                </div>
                <h1 className="text-2xl font-extrabold text-[#12345A] tracking-tight">
                  Enterprise Knowledge Governance
                </h1>
                <p className="text-xs sm:text-sm text-[#536780] mt-1 max-w-2xl leading-relaxed">
                  Full administrative oversight. Inspect procedure revisions, enforce two-person peer review invariants, or execute compliance force-approval overrides.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Button
                id="create-knowledge-btn"
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowCreate(true)}
                className="bg-purple-700 hover:bg-purple-800 text-white shadow-xs"
              >
                + New Knowledge Item
              </Button>
            </div>
          </div>
        )}

        {/* Pending Review Alert Banner for Reviewers & Admins */}
        {canApprove && pendingReviewCount > 0 && (
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-300 text-amber-900 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                {pendingReviewCount}
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900">
                  {pendingReviewCount} Procedure draft(s) currently awaiting formal peer review &amp; verification
                </p>
                <p className="text-[11px] text-amber-800">
                  Open any draft marked "IN REVIEW" below or navigate to the Review Queue to inspect and approve.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/reviews')}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 shadow-xs transition-colors"
            >
              Open Review Queue →
            </button>
          </div>
        )}

        {/* Search & Filters Bar in White Card */}
        <div className="bg-white rounded-2xl border border-[#DCE8F5] p-4 shadow-xs flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#536780]" />
            <input
              id="knowledge-search"
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search procedures by title or equipment…"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-[#DCE8F5] rounded-xl text-sm text-[#12345A] placeholder-[#8FA0BF] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6] transition-colors"
              aria-label="Search knowledge items"
            />
          </div>

          <select
            id="machine-filter"
            value={machineFilter}
            onChange={(e) => {
              setMachineFilter(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 bg-white border border-[#DCE8F5] rounded-xl text-sm text-[#12345A] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6] transition-colors"
            aria-label="Filter by machine"
          >
            <option value="">All Equipment</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>

          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 bg-white border border-[#DCE8F5] rounded-xl text-sm text-[#12345A] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6] transition-colors"
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
          <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 shadow-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
            <span className="text-sm flex-1 font-medium">
              {error instanceof ApiClientError ? error.message : 'Failed to load knowledge items.'}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-rose-600 hover:text-rose-800 transition-colors font-medium text-xs flex items-center gap-1"
              aria-label="Retry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading knowledge items">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white border border-[#DCE8F5] animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && items.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-[#DCE8F5] shadow-xs p-8">
            <div className="w-12 h-12 rounded-full bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center mx-auto text-[#1473E6] mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="text-[#12345A] font-bold text-lg">No knowledge items found</p>
            <p className="text-[#536780] text-sm mt-1 max-w-sm mx-auto">
              {search || machineFilter || statusFilter
                ? 'Try adjusting your filters or search keywords.'
                : canCreate
                ? 'Create your first precision equipment procedure to get started.'
                : 'No published procedures are available yet.'}
            </p>
            {canCreate && !search && !machineFilter && !statusFilter && (
              <Button
                variant="primary"
                className="mt-5 bg-[#1473E6] hover:bg-[#1060C4]"
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
            className="space-y-3"
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
                  className="group flex items-center gap-4 p-4.5 rounded-xl bg-white border border-[#DCE8F5] hover:border-[#1473E6] hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/app/knowledge/${item.id}`)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/knowledge/${item.id}`)}
                  aria-label={`Open: ${item.title}`}
                >
                  {/* Equipment icon */}
                  <div className="shrink-0 w-11 h-11 rounded-xl bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6] group-hover:bg-[#1473E6] group-hover:text-white transition-colors">
                    <Cpu className="w-5 h-5" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-[#12345A] group-hover:text-[#1473E6] transition-colors truncate">
                        {item.title}
                      </span>
                      {item.is_demo && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1473E6] bg-[#EFF7FF] border border-[#BCD7F5] rounded-full px-2 py-0.2">
                          Demo
                        </span>
                      )}
                      {isMine && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.2">
                          Mine
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[#536780] flex-wrap">
                      {item.machine && (
                        <span className="flex items-center gap-1 font-medium text-[#12345A]">
                          <Cpu className="w-3.5 h-3.5 text-[#1473E6]" />
                          {item.machine.name}
                        </span>
                      )}
                      <span className="font-mono bg-[#F7FAFE] border border-[#DCE8F5] px-1.5 py-0.2 rounded text-[11px]">
                        v{item.version_no}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#8FA0BF]" />
                        Updated {formatDate(item.version_updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Status badge & Role-Specific Action CTA */}
                  <div className="shrink-0 flex items-center gap-3">
                    <StatusBadge status={item.version_status} />
                    {item.version_status === 'in_review' ? (
                      canApprove ? (
                        item.author_id !== user?.id || isAdmin ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 group-hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors">
                            <span>Review &amp; Approve</span>
                            <span className="text-indigo-200">→</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                            <span>Inspect Draft →</span>
                          </span>
                        )
                      ) : (
                        <span className="text-xs font-semibold text-[#1473E6] group-hover:translate-x-0.5 transition-transform">
                          View Draft →
                        </span>
                      )
                    ) : item.version_status === 'published' ? (
                      isTrainee ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 group-hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs transition-colors">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Study Protocol →</span>
                        </span>
                      ) : isOperator ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 group-hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold shadow-xs transition-colors">
                          <Cpu className="w-3.5 h-3.5 text-amber-700" />
                          <span>Execute SOP →</span>
                        </span>
                      ) : (
                        <span className="hidden sm:inline-block text-xs font-semibold text-[#1473E6] group-hover:translate-x-0.5 transition-transform">
                          Open →
                        </span>
                      )
                    ) : (
                      <span className="hidden sm:inline-block text-xs font-semibold text-[#1473E6] group-hover:translate-x-0.5 transition-transform">
                        {item.version_status === 'draft' ? 'Edit Draft →' : 'Open →'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-3" aria-label="Pagination">
            <span className="text-xs text-[#536780]">
              Page {page} of {totalPages} · {total} total procedures
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-[#DCE8F5] bg-white text-[#536780] hover:text-[#12345A] hover:border-[#1473E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-[#DCE8F5] bg-white text-[#536780] hover:text-[#12345A] hover:border-[#1473E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Create Procedure Modal */}
        {showCreate && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-modal-title"
          >
            <div className="w-full max-w-md bg-white border border-[#DCE8F5] rounded-2xl shadow-2xl p-6 space-y-5">
              <div className="border-b border-[#DCE8F5] pb-3">
                <h2 id="create-modal-title" className="text-lg font-bold text-[#12345A]">
                  New Knowledge Item
                </h2>
                <p className="text-xs text-[#536780] mt-0.5">
                  Author an authoritative Standard Operating Procedure for precision machinery.
                </p>
              </div>

              {createError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="create-title" className="block text-xs font-semibold text-[#12345A] mb-1">
                    Procedure Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-title"
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. CNC Spindle Warm-Up & Concentricity Protocol"
                    className="w-full px-3 py-2 bg-white border border-[#DCE8F5] rounded-lg text-sm text-[#12345A] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6]"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="create-machine" className="block text-xs font-semibold text-[#12345A] mb-1">
                    Machine Asset <span className="text-[#8FA0BF] font-normal">(optional)</span>
                  </label>
                  <select
                    id="create-machine"
                    value={createMachineId}
                    onChange={(e) => setCreateMachineId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#DCE8F5] rounded-lg text-sm text-[#12345A] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6]"
                  >
                    <option value="">No machine (General procedure)</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DCE8F5]">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg border border-[#BCD7F5] bg-white text-xs font-semibold text-[#536780] hover:bg-[#F7FAFE]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={handleCreate}
                  className="px-5 py-2 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
