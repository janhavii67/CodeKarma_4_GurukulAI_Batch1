import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiClientError } from '../../lib/api/client';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  CheckSquare,
  Wrench,
  History,
  Layers,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  X,
  Plus,
  ArrowRight,
} from 'lucide-react';

const formatWorkflowValue = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry));
  if (typeof value === 'string' && value.trim()) return [value];
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${key}: ${String(entry)}`);
  return [];
};

interface Step {
  id: string;
  step_order: number;
  title: string;
  instruction: string;
  expected_observation?: string;
  safety_warning?: string;
  is_critical: boolean;
  details: Record<string, any>;
}

interface WorkflowSource {
  version_id: string;
  item_id: string;
  version_no: number;
  title: string;
  summary?: string;
  machine_name?: string;
  steps_count: number;
}

interface Procedure {
  id: string;
  title: string;
  description: string;
  machine_id?: string;
  machine_name?: string;
  machine_model?: string;
  operation?: string;
  troubleshooting_guidance?: string;
  prerequisites?: string;
  required_tools?: string;
  safety_warnings?: string;
  operating_conditions?: string;
  knowledge_version_id?: string;
  version?: number | string;
  source_refs: Array<Record<string, any>>;
  steps: Step[];
}

interface RunStepExec {
  id: string;
  step_id: string;
  is_completed: boolean;
  operator_notes?: string;
  verified_at?: string;
}

interface ProcedureRun {
  id: string;
  procedure_id: string;
  operator_id?: string;
  status: string;
  started_at: string;
  completed_at?: string;
  current_step_order: number;
  issues: Array<Record<string, any>>;
  workflow?: Procedure;
  step_executions: RunStepExec[];
}

export const GuidedWorkflowsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canCreateProcedure = hasPermission('procedure.create');

  // Active view tab: 'execute' | 'history'
  const [activeTab, setActiveTab] = useState<'execute' | 'history'>('execute');

  // Execution states
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loadingProcedures, setLoadingProcedures] = useState(true);
  const [procedureError, setProcedureError] = useState<string | null>(null);
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [activeProcedure, setActiveProcedure] = useState<Procedure | null>(null);
  const [activeRun, setActiveRun] = useState<ProcedureRun | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);

  // History states
  const [runs, setRuns] = useState<ProcedureRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');

  // Run detail modal states
  const [inspectRunId, setInspectRunId] = useState<string | null>(null);
  const [inspectedRun, setInspectedRun] = useState<ProcedureRun | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Modals for backend gaps
  const [deleteRunTarget, setDeleteRunTarget] = useState<ProcedureRun | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [workflowSources, setWorkflowSources] = useState<WorkflowSource[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [issueResponse, setIssueResponse] = useState<{ issue: Record<string, any>; guidance_status: string; guidance: Array<Record<string, any>> } | null>(null);

  const fetchWorkflowSources = async (search = sourceSearch) => {
    setLoadingSources(true);
    setSourceError(null);
    try {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const rows = await api.get<WorkflowSource[]>(`/procedures/sources${query}`);
      setWorkflowSources(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setSourceError(err instanceof ApiClientError ? err.message : 'Could not load approved knowledge sources.');
    } finally {
      setLoadingSources(false);
    }
  };

  const handleCreateWorkflowDraft = async (source: WorkflowSource) => {
    setCreatingDraft(true);
    setSourceError(null);
    try {
      const draft = await api.post<{ item_id: string }>(`/procedures/drafts/from-knowledge/${source.version_id}`, {});
      setIsCreateModalOpen(false);
      navigate(`/app/knowledge/${draft.item_id}`);
    } catch (err) {
      setSourceError(err instanceof ApiClientError ? err.message : 'Could not start a workflow draft.');
    } finally {
      setCreatingDraft(false);
    }
  };

  // Fetch approved procedures
  const fetchProcedures = (search = workflowSearch) => {
    setLoadingProcedures(true);
    setProcedureError(null);
    api
      .get<Procedure[]>(`/procedures${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProcedures(list);
        if (list.length > 0 && !activeProcedure) {
          setActiveProcedure(list[0]);
        }
        setLoadingProcedures(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve procedures.';
        setProcedureError(msg);
        setProcedures([]);
        setLoadingProcedures(false);
      });
  };

  // Fetch operator execution runs
  const fetchMyRuns = () => {
    setLoadingRuns(true);
    setRunsError(null);
    api
      .get<ProcedureRun[]>('/procedures/runs/my/all')
      .then((data) => {
        setRuns(Array.isArray(data) ? data : []);
        setLoadingRuns(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to retrieve execution run logs.';
        setRunsError(msg);
        setRuns([]);
        setLoadingRuns(false);
      });
  };

  useEffect(() => {
    fetchProcedures();
  }, []);

  useEffect(() => {
    const runId = searchParams.get('run_id');
    if (!runId) return;
    api.get<ProcedureRun>(`/procedures/runs/${encodeURIComponent(runId)}`).then((run) => {
      setActiveRun(run);
      if (run.workflow) setActiveProcedure(run.workflow);
      setActiveTab('execute');
    }).catch((err) => console.error('Could not resume linked workflow session:', err));
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchMyRuns();
    }
  }, [activeTab]);

  // Start a new execution run
  const handleStartRun = async (procId: string) => {
    setStartingRun(true);
    try {
      const run = await api.post<ProcedureRun>(`/procedures/${procId}/start`, {});
      if (run.workflow) setActiveProcedure(run.workflow);
      setActiveRun(run);
    } catch (err) {
      console.error('Failed to start run:', err);
    } finally {
      setStartingRun(false);
    }
  };

  // Toggle checklist step completion
  const handleToggleStep = async (stepId: string, currentStatus: boolean) => {
    if (!activeRun) return;
    setCompletingStepId(stepId);
    try {
      const updatedRun = await api.post<ProcedureRun>(
        `/procedures/runs/${activeRun.id}/step/${stepId}`,
        {
          is_completed: !currentStatus,
          operator_notes: !currentStatus ? 'Verified by operator.' : undefined,
        }
      );
      setActiveRun(updatedRun);
    } catch (err) {
      console.error('Failed to complete step:', err);
    } finally {
      setCompletingStepId(null);
    }
  };

  const handleNavigateStep = async (stepOrder: number) => {
    if (!activeRun) return;
    try {
      const updated = await api.patch<ProcedureRun>(`/procedures/runs/${activeRun.id}/current-step`, { step_order: stepOrder });
      setActiveRun(updated);
      setIssueResponse(null);
      setIssueText('');
    } catch (err) {
      console.error('Failed to navigate workflow step:', err);
    }
  };

  const handleReportIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeRun || !activeProcedure) return;
    const current = activeProcedure.steps.find((step) => step.step_order === activeRun.current_step_order);
    if (!current || !issueText.trim()) return;
    try {
      const response = await api.post<{ issue: Record<string, any>; guidance_status: string; guidance: Array<Record<string, any>> }>(
        `/procedures/runs/${activeRun.id}/issues`,
        { step_id: current.id, description: issueText.trim() },
      );
      setIssueResponse(response);
      const refreshed = await api.get<ProcedureRun>(`/procedures/runs/${activeRun.id}`);
      setActiveRun(refreshed);
    } catch (err) {
      console.error('Failed to report workflow issue:', err);
    }
  };

  // Inspect run details modal
  const handleInspectRun = (runId: string) => {
    setInspectRunId(runId);
    setLoadingInspect(true);
    setInspectError(null);
    setInspectedRun(null);

    api
      .get<ProcedureRun>(`/procedures/runs/${runId}`)
      .then((data) => {
        setInspectedRun(data);
        setLoadingInspect(false);
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : 'Failed to load run details.';
        setInspectError(msg);
        setLoadingInspect(false);
      });
  };

  // Resume an in-progress run in execution tab
  const handleResumeRun = async (run: ProcedureRun) => {
    const proc = run.workflow || procedures.find((p) => p.id === run.procedure_id);
    if (proc) setActiveProcedure(proc);
    setActiveRun(run);
    setActiveTab('execute');
  };

  // Filtered runs
  const filteredRuns = runs.filter((r) => {
    const proc = procedures.find((p) => p.id === r.procedure_id);
    const title = proc?.title || '';
    const matchesSearch =
      !historySearch.trim() ||
      title.toLowerCase().includes(historySearch.toLowerCase()) ||
      r.id.toLowerCase().includes(historySearch.toLowerCase());
    const matchesStatus =
      historyStatusFilter === 'ALL' || r.status === historyStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const activeStep = activeRun && activeProcedure
    ? activeProcedure.steps.find((step) => step.step_order === activeRun.current_step_order)
    : undefined;
  const activeStepExecution = activeStep && activeRun
    ? activeRun.step_executions.find((execution) => execution.step_id === activeStep.id)
    : undefined;
  const completedCount = activeRun?.step_executions.filter((execution) => execution.is_completed).length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#DCE6F0]">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2] shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#17324D]">Guided Operating Workflows</h1>
                <Badge variant="brand" size="sm">
                  Module 03 · Execution &amp; Audits
                </Badge>
              </div>
              <p className="text-xs text-[#5D7188] mt-0.5">
                Ordered step checklists with mandatory verification checkpoints and non-repudiable audit trails.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('execute')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'execute'
                  ? 'bg-white text-[#17324D] font-semibold shadow-xs'
                  : 'text-[#5D7188] hover:text-[#17324D]'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-[#1976D2]" />
              <span>Interactive Execution</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-[#17324D] font-semibold shadow-xs'
                  : 'text-[#5D7188] hover:text-[#17324D]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-[#1976D2]" />
              <span>Run History &amp; Audits</span>
            </button>
          </div>

          {canCreateProcedure && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setIsCreateModalOpen(true); fetchWorkflowSources(''); }}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Author Procedure
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: INTERACTIVE WORKFLOW EXECUTION */}
      {activeTab === 'execute' && (
        <>
          {procedureError && (
            <Alert variant="error" title="Failed to Load Workflows">
              {procedureError}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => fetchProcedures()}>
                  Retry Request
                </Button>
              </div>
            </Alert>
          )}

          {loadingProcedures ? (
            <div className="py-16 text-center">
              <LoadingSpinner size="lg" message="Loading approved procedures catalog..." />
            </div>
          ) : procedures.length === 0 ? (
            <EmptyState
              icon={<Layers className="w-6 h-6 text-[#1976D2]" />}
              title="No Standard Procedures Found"
              description="No approved standard operating procedures are currently registered in the database."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Procedures List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-xs font-bold text-[#7C8DA1] uppercase tracking-wider">
                    Available Procedures ({procedures.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchProcedures()}
                    icon={<RefreshCw className="w-3 h-3" />}
                  >
                    Refresh
                  </Button>
                </div>

                <form onSubmit={(event) => { event.preventDefault(); fetchProcedures(); }} className="flex gap-2">
                  <Input aria-label="Search approved workflows" value={workflowSearch} onChange={(event) => setWorkflowSearch(event.target.value)} placeholder="Search by workflow, operation, or machine" className="flex-1 text-xs" />
                  <Button type="submit" size="sm" variant="secondary" icon={<Search className="w-3.5 h-3.5" />}>Search</Button>
                </form>

                <div className="space-y-2.5">
                  {procedures.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActiveProcedure(p);
                        setActiveRun(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        activeProcedure?.id === p.id
                          ? 'bg-[#EAF3FF] border-[#1976D2] shadow-xs'
                          : 'bg-white border-[#DCE6F0] hover:border-[#1976D2]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-mono font-bold text-[#1976D2]">
                          {p.steps.length} Steps
                        </span>
                        <Badge variant="success" size="sm">
                          Approved SOP
                        </Badge>
                      </div>
                      <h4 className="text-sm font-bold text-[#17324D] mb-1">{p.title}</h4>
                      <p className="text-xs text-[#5D7188] line-clamp-2 leading-relaxed">{p.description}</p>
                      <div className="mt-2.5 text-[11px] text-[#7C8DA1] flex items-center gap-1.5 border-t border-[#DCE6F0]/60 pt-2">
                        <span>Target:</span>
                        <span className="text-[#17324D] font-medium">{p.machine_name || 'Machine not specified'}{p.machine_model ? ` · ${p.machine_model}` : ''}</span>
                        <span className="ml-auto text-slate-500">v{p.version}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Procedure Runner */}
              <div className="lg:col-span-2 space-y-4">
                {activeProcedure && (
                  <Card
                    title={activeProcedure.title}
                    subtitle={`Machine: ${activeProcedure.machine_name || 'Not specified'}${activeProcedure.machine_model ? ` · ${activeProcedure.machine_model}` : ''} · Approved revision v${activeProcedure.version}`}
                    badge={
                      activeRun ? (
                        <Badge
                          variant={activeRun.status === 'COMPLETED' ? 'success' : 'warning'}
                          size="sm"
                          dot
                        >
                          {activeRun.status === 'COMPLETED' ? 'Run Completed' : 'Run In Progress'}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Ready to Execute
                        </Badge>
                      )
                    }
                  >
                    <div className="space-y-4 text-xs">
                      <p className="text-[#5D7188] leading-relaxed">{activeProcedure.description}</p>
                      {activeProcedure.operation && <p className="text-sm text-[#40566D]"><strong>Operation:</strong> {activeProcedure.operation}</p>}

                      {/* Prerequisites & Warnings */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeProcedure.troubleshooting_guidance && (
                          <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE6F0] md:col-span-2">
                            <div className="font-bold text-[#17324D] mb-1">Approved troubleshooting notes</div>
                            <p className="text-[#5D7188] text-[11px] leading-relaxed whitespace-pre-line">{activeProcedure.troubleshooting_guidance}</p>
                          </div>
                        )}
                        {activeProcedure.prerequisites && (
                          <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                            <div className="flex items-center gap-1.5 font-bold text-[#17324D] mb-1">
                              <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                              Prerequisites:
                            </div>
                            <p className="text-[#5D7188] text-[11px] leading-relaxed">
                              {activeProcedure.prerequisites}
                            </p>
                          </div>
                        )}

                        {activeProcedure.required_tools && (
                          <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                            <div className="font-bold text-[#17324D] mb-1">Required tools and materials</div>
                            <p className="text-[#5D7188] text-[11px] leading-relaxed">{activeProcedure.required_tools}</p>
                          </div>
                        )}
                        {activeProcedure.operating_conditions && (
                          <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                            <div className="font-bold text-[#17324D] mb-1">Documented machine parameters</div>
                            <p className="text-[#5D7188] text-[11px] leading-relaxed">{activeProcedure.operating_conditions}</p>
                          </div>
                        )}
                        {activeProcedure.safety_warnings && (
                          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900">
                            <div className="flex items-center gap-1.5 font-bold text-[#D98B13] mb-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Mandatory Safety Interlock:
                            </div>
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              {activeProcedure.safety_warnings}
                            </p>
                          </div>
                        )}
                      </div>

                      {activeProcedure.source_refs?.length > 0 && (
                        <div className="rounded-xl border border-[#DCE6F0] p-3">
                          <div className="font-bold text-[#17324D] mb-2">Approved source references</div>
                          <ul className="space-y-1.5">
                            {activeProcedure.source_refs.map((source, index) => (
                              <li key={`${source.version_id || source.media_id || index}`} className="text-[11px] text-[#5D7188]">
                                {source.item_id ? <a className="text-[#1976D2] underline" href={`/app/knowledge/${source.item_id}`}>{source.title || 'Knowledge source'}</a> : source.media_id && source.kind === 'image' ? <a href={`/api/v1/media/${source.media_id}`} target="_blank" rel="noreferrer" className="text-[#1976D2] underline">{source.title || source.original_name || 'Approved image'}</a> : (source.title || source.original_name || 'Supporting media')}
                                {source.version_no ? ` · v${source.version_no}` : ''}
                                {source.media_id && source.kind === 'image' && <img src={`/api/v1/media/${source.media_id}`} alt={source.title || 'Workflow reference diagram'} className="mt-2 max-h-48 rounded border border-[#DCE6F0]" />}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Start Run Button */}
                      {!activeRun && (
                        <div className="pt-2">
                          <Button
                            variant="primary"
                            onClick={() => handleStartRun(activeProcedure.id)}
                            disabled={startingRun}
                            icon={<Play className="w-4 h-4" />}
                          >
                            {startingRun ? 'Starting workflow...' : 'Start workflow'}
                          </Button>
                        </div>
                      )}

                      {/* One-step execution view; navigation never records completion. */}
                      {activeRun && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between pb-2 border-b border-[#E8EEF5]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#17324D]">Workflow steps</span>
                              <span className="text-[10px] font-mono text-[#7C8DA1]">Run #{activeRun.id.slice(0, 8)}</span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-[#1976D2]">
                              {completedCount} of{' '}
                              {activeProcedure.steps.length} Steps Verified
                            </span>
                          </div>

                          {activeStep ? (
                            <div className="rounded-xl border border-[#BCD7F5] bg-white p-5 shadow-xs space-y-4" aria-live="polite">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-[#17324D]">Step {activeRun.current_step_order} of {activeProcedure.steps.length}</span>
                                <span className="text-xs text-[#5D7188]">{activeStepExecution?.is_completed ? 'Recorded complete' : 'Not recorded complete'}</span>
                              </div>
                              <div className="h-2 rounded bg-[#E8EEF5]"><div className="h-2 rounded bg-[#1976D2] transition-all" style={{ width: `${(activeRun.current_step_order / activeProcedure.steps.length) * 100}%` }} /></div>
                              <h3 className="text-lg font-bold text-[#17324D]">{activeStep.title}</h3>
                              <p className="text-base leading-relaxed text-[#40566D]">{activeStep.instruction}</p>
                              {activeStep.safety_warning && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Safety:</strong> {activeStep.safety_warning}</div>}
                              {activeStep.is_critical && <Badge variant="danger" size="sm">Critical checkpoint</Badge>}
                              {formatWorkflowValue(activeStep.details?.tools || activeStep.details?.materials).length > 0 && <div><strong className="text-[#17324D]">Tools and materials</strong><ul className="list-disc pl-5 text-sm text-[#5D7188]">{formatWorkflowValue(activeStep.details?.tools || activeStep.details?.materials).map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
                              {formatWorkflowValue(activeStep.details?.parameters).length > 0 && <div><strong className="text-[#17324D]">Documented parameters</strong><ul className="list-disc pl-5 text-sm text-[#5D7188]">{formatWorkflowValue(activeStep.details?.parameters).map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
                              {activeStep.expected_observation && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Expected result / checkpoint:</strong> {activeStep.expected_observation}</div>}
                              {formatWorkflowValue(activeStep.details?.quality_checkpoints).length > 0 && <div><strong className="text-[#17324D]">Quality checkpoints</strong><ul className="list-disc pl-5 text-sm text-[#5D7188]">{formatWorkflowValue(activeStep.details?.quality_checkpoints).map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
                              {activeStepExecution?.is_completed && activeStepExecution.verified_at && <p className="text-xs text-emerald-700">You recorded this step complete at {new Date(activeStepExecution.verified_at).toLocaleTimeString()}.</p>}

                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8EEF5] pt-3">
                                <Button variant="outline" size="sm" disabled={activeRun.current_step_order <= 1 || activeRun.status !== 'IN_PROGRESS'} onClick={() => handleNavigateStep(activeRun.current_step_order - 1)}>Previous step</Button>
                                <Button variant={activeStepExecution?.is_completed ? 'secondary' : 'primary'} size="sm" disabled={!!activeStepExecution?.is_completed || activeRun.status !== 'IN_PROGRESS' || completingStepId === activeStep.id} onClick={() => handleToggleStep(activeStep.id, false)} icon={<CheckSquare className="w-4 h-4" />}>
                                  {activeStepExecution?.is_completed ? 'Completion recorded' : 'I completed this step'}
                                </Button>
                                <Button variant="outline" size="sm" disabled={activeRun.current_step_order >= activeProcedure.steps.length || activeRun.status !== 'IN_PROGRESS'} onClick={() => handleNavigateStep(activeRun.current_step_order + 1)}>Next step <ArrowRight className="w-4 h-4 ml-1" /></Button>
                              </div>

                              <form onSubmit={handleReportIssue} className="border-t border-[#E8EEF5] pt-3 space-y-2">
                                <label className="block font-semibold text-[#17324D]" htmlFor="workflow-issue">Problem or unclear instruction</label>
                                <textarea id="workflow-issue" value={issueText} onChange={(event) => setIssueText(event.target.value)} maxLength={1000} rows={2} className="w-full rounded-lg border border-[#DCE6F0] p-2 text-sm" placeholder="Describe what is unclear or what went wrong" />
                                <Button type="submit" size="sm" variant="secondary" disabled={!issueText.trim()}>Report problem and find approved guidance</Button>
                              </form>
                              {issueResponse && <div className="rounded-lg border border-[#DCE6F0] bg-[#F8FAFD] p-3 space-y-2">
                                <strong className="text-[#17324D]">{issueResponse.guidance_status === 'matched_published_knowledge' ? 'Approved troubleshooting references' : 'No approved troubleshooting guidance found. Pause and ask a supervisor before proceeding.'}</strong>
                                {issueResponse.guidance.map((source, index) => <div key={`${source.source_id}-${index}`} className="text-xs text-[#5D7188]"><span className="font-semibold">{source.title}</span><p>{source.text}</p>{source.item_id && <a className="text-[#1976D2] underline" href={`/app/knowledge/${source.item_id}`}>View source document</a>}</div>)}
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/app/troubleshooting?workflow_run_id=${encodeURIComponent(activeRun.id)}&workflow_issue_id=${encodeURIComponent(String(issueResponse.issue.id))}&issue=${encodeURIComponent(String(issueResponse.issue.description || ''))}`)}>Continue in Troubleshooting</Button>
                              </div>}
                            </div>
                          ) : <Alert variant="error" title="Step unavailable">This workflow revision has an invalid step sequence. Stop and report the issue.</Alert>}

                          {activeRun.status === 'COMPLETED' && (
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15966A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                              <div className="flex items-center gap-2.5">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                <div>
                                  <span className="font-bold text-sm text-emerald-950 block">
                                    All checkpoints verified! Workflow logged successfully.
                                  </span>
                                  <span className="text-xs text-emerald-800">
                                    Audit execution record stored in the compliance database.
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setActiveTab('history')}
                                icon={<History className="w-3.5 h-3.5" />}
                              >
                                View Run Audit Logs
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: RUN HISTORY & AUDITS (Resource 3 Core Implementation) */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* History Search & Filters */}
          <div className="bg-white p-3.5 rounded-xl border border-[#DCE6F0] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search historical runs by procedure title or run ID..."
                leftIcon={<Search className="w-4 h-4 text-[#7C8DA1]" />}
                className="w-full text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={historyStatusFilter}
                aria-label="Filter runs by execution status"
                onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                className="text-xs bg-[#F3F8FE] border border-[#DCE6F0] rounded-lg px-3 py-2.5 text-[#17324D] focus:outline-none focus:border-[#1976D2]"
              >
                <option value="ALL">All Run Statuses</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>

              <Button
                variant="secondary"
                size="sm"
                onClick={fetchMyRuns}
                icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingRuns ? 'animate-spin' : ''}`} />}
              >
                Refresh Runs
              </Button>
            </div>
          </div>

          {runsError && (
            <Alert variant="error" title="Failed to Load Run History">
              {runsError}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={fetchMyRuns}>
                  Retry Request
                </Button>
              </div>
            </Alert>
          )}

          {loadingRuns ? (
            <div className="py-16 text-center">
              <LoadingSpinner size="lg" message="Loading operator execution runs from compliance log..." />
            </div>
          ) : filteredRuns.length === 0 ? (
            <EmptyState
              icon={<History className="w-6 h-6 text-[#1976D2]" />}
              title="No Execution Runs Found"
              description={
                historySearch || historyStatusFilter !== 'ALL'
                  ? 'No execution runs match your search filters.'
                  : 'You have not executed any guided workflows yet. Switch to Interactive Execution to start your first procedure.'
              }
              action={
                historySearch || historyStatusFilter !== 'ALL' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryStatusFilter('ALL');
                    }}
                  >
                    Reset Filters
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setActiveTab('execute')} icon={<Play className="w-3.5 h-3.5" />}>
                    Start First Procedure Run
                  </Button>
                )
              }
            />
          ) : (
            <div className="bg-white rounded-xl border border-[#DCE6F0] overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFD] border-b border-[#DCE6F0] text-[#5D7188]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Run ID</th>
                    <th className="py-3 px-4 font-semibold">Standard Operating Procedure</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Checkpoints</th>
                    <th className="py-3 px-4 font-semibold">Started At</th>
                    <th className="py-3 px-4 font-semibold">Completed At</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EEF5]">
                  {filteredRuns.map((r) => {
                    const proc = procedures.find((p) => p.id === r.procedure_id);
                    const completedStepsCount = r.step_executions.filter((s) => s.is_completed).length;
                    const totalStepsCount = r.step_executions.length;

                    return (
                      <tr key={r.id} className="hover:bg-[#F3F8FE]/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#1976D2]">
                          #{r.id.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#17324D]">
                          {proc?.title || `Procedure ${r.procedure_id.slice(0, 8)}`}
                          <span className="block text-[10px] font-normal text-[#5D7188]">
                            {proc?.machine_name || 'Standard Analyzer'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={r.status === 'COMPLETED' ? 'success' : 'warning'}
                            size="sm"
                            dot
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#17324D]">
                          {completedStepsCount} / {totalStepsCount} verified
                        </td>
                        <td className="py-3 px-4 text-[#5D7188] whitespace-nowrap">
                          {new Date(r.started_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-[#5D7188] whitespace-nowrap">
                          {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleInspectRun(r.id)}
                              icon={<Eye className="w-3.5 h-3.5 text-[#1976D2]" />}
                            >
                              Inspect Log
                            </Button>

                            {r.status === 'IN_PROGRESS' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleResumeRun(r)}
                                icon={<ArrowRight className="w-3.5 h-3.5" />}
                              >
                                Resume
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteRunTarget(r)}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              icon={<Trash2 className="w-3.5 h-3.5" />}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* INSPECT RUN LOG DETAIL MODAL */}
      {inspectRunId && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#DCE6F0] flex items-center justify-between bg-[#F8FAFD]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#17324D]">Procedure Execution Audit Log</h3>
                  <p className="text-xs font-mono text-[#5D7188]">Run ID: {inspectRunId}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectRunId(null)}
                className="w-8 h-8 rounded-lg hover:bg-[#E8EEF5] flex items-center justify-center text-[#5D7188]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {loadingInspect ? (
                <div className="py-12 text-center">
                  <LoadingSpinner size="md" message="Loading verification checklist log..." />
                </div>
              ) : inspectError ? (
                <Alert variant="error" title="Log Error">
                  {inspectError}
                </Alert>
              ) : inspectedRun ? (
                <>
                  {/* Status Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-[#F3F8FE] rounded-xl border border-[#DCE6F0]">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-0.5">Execution Status</span>
                      <Badge
                        variant={inspectedRun.status === 'COMPLETED' ? 'success' : 'warning'}
                        size="sm"
                        dot
                      >
                        {inspectedRun.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-0.5">Start Time</span>
                      <span className="font-medium text-[#17324D]">
                        {new Date(inspectedRun.started_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#7C8DA1] block mb-0.5">Completion Time</span>
                      <span className="font-medium text-[#17324D]">
                        {inspectedRun.completed_at ? new Date(inspectedRun.completed_at).toLocaleString() : 'In Progress'}
                      </span>
                    </div>
                  </div>

                  {/* Step Executions Table */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[#17324D] block">
                      Verification Checkpoint Logs ({inspectedRun.step_executions.length})
                    </span>

                    <div className="border border-[#DCE6F0] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFD] border-b border-[#DCE6F0] text-[#5D7188]">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">Checkpoint</th>
                            <th className="py-2.5 px-3 font-semibold">Status</th>
                            <th className="py-2.5 px-3 font-semibold">Verified Timestamp</th>
                            <th className="py-2.5 px-3 font-semibold">Operator Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8EEF5]">
                          {inspectedRun.step_executions.map((s, index) => (
                            <tr key={s.id} className="hover:bg-[#F3F8FE]/60">
                              <td className="py-2.5 px-3 font-medium text-[#17324D]">
                                Step {index + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant={s.is_completed ? 'success' : 'neutral'} size="sm">
                                  {s.is_completed ? 'Verified' : 'Pending'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-[#5D7188] font-mono text-[11px]">
                                {s.verified_at ? new Date(s.verified_at).toLocaleTimeString() : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-[#5D7188] italic text-[11px]">
                                {s.operator_notes || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-[#DCE6F0] bg-[#F8FAFD] flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setInspectRunId(null)}>
                Close Run Log
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE RUN AUDIT MODAL (WITH BACKEND GAP FLAG) */}
      {deleteRunTarget && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#D98B13] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#17324D]">Run Log Deletion Request</h3>
                <p className="text-xs text-[#5D7188] mt-0.5">
                  Target Run ID: <span className="font-mono font-semibold text-[#17324D]">#{deleteRunTarget.id.slice(0, 8)}</span>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 leading-relaxed">
              <span className="font-semibold block mb-1">Notice: Regulatory Compliance Invariant</span>
              The backend API does not implement a <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[10px]">DELETE /api/v1/procedures/runs/&#123;id&#125;</code> endpoint. In accordance with ISO 13485 and GMP standards, equipment procedure runs are permanent compliance audit trails that cannot be erased or modified after execution.
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteRunTarget(null)}>
                Understood &amp; Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create a workflow as a knowledge draft from a currently approved source. */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#17324D]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#BCD7F5] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#DCE6F0] flex items-center justify-between bg-[#F8FAFD]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2]">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#17324D]">Start a workflow draft</h3>
                  <p className="text-[11px] text-[#5D7188]">Choose an approved source. You will review and edit it before submitting through the normal approval flow.</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-[#E8EEF5] flex items-center justify-center text-[#5D7188]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <form onSubmit={(event) => { event.preventDefault(); fetchWorkflowSources(); }} className="flex gap-2">
                <Input aria-label="Search approved workflow sources" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search approved knowledge" className="flex-1" />
                <Button type="submit" variant="secondary" disabled={loadingSources} icon={<Search className="w-4 h-4" />}>Search</Button>
              </form>
              {sourceError && <Alert variant="error" title="Could not load source">{sourceError}</Alert>}
              {loadingSources ? <LoadingSpinner size="md" message="Finding approved step-based knowledge..." /> : workflowSources.length === 0 ? (
                <EmptyState icon={<Layers className="w-5 h-5" />} title="No approved workflow sources found" description="Publish a knowledge item with ordered steps before creating a guided workflow." />
              ) : (
                <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                  {workflowSources.map((source) => (
                    <div key={source.version_id} className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE6F0] p-3">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-[#17324D] truncate">{source.title}</h4>
                        <p className="text-[11px] text-[#5D7188] mt-1">{source.machine_name || 'Machine not specified'} · v{source.version_no} · {source.steps_count} documented steps</p>
                        {source.summary && <p className="text-xs text-[#5D7188] mt-1 line-clamp-2">{source.summary}</p>}
                      </div>
                      <Button size="sm" variant="primary" disabled={creatingDraft} onClick={() => handleCreateWorkflowDraft(source)}>{creatingDraft ? 'Creating…' : 'Use source'}</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-[#DCE6F0] bg-[#F8FAFD] flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
