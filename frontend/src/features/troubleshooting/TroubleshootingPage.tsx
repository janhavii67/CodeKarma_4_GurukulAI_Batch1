import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, ApiClientError } from '../../lib/api/client';
import { useAuth } from '../../hooks/useAuth';
import { useMachines } from '../knowledge-capture/hooks';
import { selectableMachines } from '../machines/registeredMachines';
import { ArrowLeft, ArrowRight, CircleHelp, FileText, Route, Search, ShieldAlert, Wrench } from 'lucide-react';

interface WorkflowCheck {
  index: number;
  title: string;
  instruction: string;
  why_relevant?: string;
  tools?: string[];
  materials?: string[];
  parameters?: Array<Record<string, unknown>> | string[];
  safety_warning?: string | null;
  expected_observation?: string | null;
  quality_checkpoints?: string[];
  authorized_role?: string | null;
  source_refs: SourceRef[];
}
interface SourceRef {
  item_id: string;
  version_id: string;
  version_no: number;
  source_id: string;
  title: string;
  category?: string;
  excerpt?: string;
  section?: string | null;
  score?: number;
}
interface SessionResponse {
  id: string;
  reported_symptom: string;
  machine_id?: string | null;
  process_id?: string | null;
  problem_category?: string | null;
  workflow_run_id?: string | null;
  workflow_issue_id?: string | null;
  context: Record<string, any>;
  source_refs: SourceRef[];
  checks: WorkflowCheck[];
  current_check_index: number;
  status: 'in_progress' | 'resolved' | 'unresolved' | 'escalated' | 'closed';
  started_at: string;
  ended_at?: string | null;
  responses: Array<{ id: string; check_index: number; outcome: string; observation?: string; recorded_at: string }>;
  escalation?: { id: string; reason: string; status: string } | null;
}
interface MachineOption { id: string; name: string; model_number?: string; }
interface ProcessOption { id: string; name: string; code?: string | null; }

const outcomeLabels = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'unknown', label: 'Unable to check' },
  { value: 'issue_persists', label: 'Issue persists' },
  { value: 'resolved', label: 'Resolved' },
] as const;

export const TroubleshootingPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canCreateKnowledge = hasPermission('knowledge.create');
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const machineQuery = useMachines();
  const machines = selectableMachines(machineQuery.data?.items ?? []) as MachineOption[];
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [active, setActive] = useState<SessionResponse | null>(null);
  const [topics, setTopics] = useState<SourceRef[]>([]);
  const [symptom, setSymptom] = useState(searchParams.get('issue') || '');
  const [machineId, setMachineId] = useState('');
  const [processId, setProcessId] = useState('');
  const [category, setCategory] = useState('');
  const [operation, setOperation] = useState('');
  const [checkedAlready, setCheckedAlready] = useState('');
  const [observation, setObservation] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftLink, setDraftLink] = useState<string | null>(null);

  const refreshSessions = async () => {
    try {
      const rows = await api.get<SessionResponse[]>('/troubleshooting/sessions/my/all');
      setSessions(rows);
    } catch { /* the form remains usable; the API reports errors on explicit actions */ }
  };

  useEffect(() => {
    void refreshSessions();
    api.get<ProcessOption[]>('/troubleshooting/processes').then(setProcesses).catch(() => setProcesses([]));
  }, []);

  const loadSession = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const row = await api.get<SessionResponse>(`/troubleshooting/sessions/${id}`);
      setActive(row);
      setDraftLink(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not open this troubleshooting session.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) void loadSession(sessionId);
  }, [searchParams]);

  const searchTopics = async () => {
    if (symptom.trim().length < 2) return;
    try {
      const query = new URLSearchParams({ q: [symptom, category, operation].filter(Boolean).join(' ') });
      if (machineId) query.set('machine_id', machineId);
      setTopics(await api.get<SourceRef[]>(`/troubleshooting/topics?${query.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Approved knowledge search failed.');
    }
  };

  const startSession = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, string | undefined> = {
        reported_symptom: symptom.trim(), machine_id: machineId || undefined,
        process_id: processId || undefined,
        problem_category: category || undefined, operation_context: operation.trim() || undefined,
        checked_already: checkedAlready.trim() || undefined,
      };
      const runId = searchParams.get('workflow_run_id');
      const issueId = searchParams.get('workflow_issue_id');
      if (runId && issueId) {
        payload.workflow_run_id = runId;
        payload.workflow_issue_id = issueId;
      }
      const row = await api.post<SessionResponse>('/troubleshooting/sessions', payload);
      setActive(row);
      await refreshSessions();
      setTopics([]);
      setDraftLink(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start the investigation.');
    } finally { setBusy(false); }
  };

  const recordOutcome = async (outcome: string) => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.post<SessionResponse>(`/troubleshooting/sessions/${active.id}/checks/${active.current_check_index}/outcome`, {
        outcome, observation: observation.trim() || undefined,
      });
      setActive(updated);
      setObservation('');
      await refreshSessions();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not record the outcome.');
    } finally { setBusy(false); }
  };

  const navigateCheck = async (index: number) => {
    if (!active) return;
    setBusy(true);
    try {
      setActive(await api.patch<SessionResponse>(`/troubleshooting/sessions/${active.id}/current-check`, { check_index: index }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not open that check.');
    } finally { setBusy(false); }
  };

  const escalate = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || escalationReason.trim().length < 3) return;
    setBusy(true);
    try {
      const updated = await api.post<SessionResponse>(`/troubleshooting/sessions/${active.id}/escalate`, { reason: escalationReason.trim() });
      setActive(updated);
      setEscalationReason('');
      await refreshSessions();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not escalate this case.');
    } finally { setBusy(false); }
  };

  const createKnowledgeDraft = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const draft = await api.post<{ item_id: string }>(`/troubleshooting/sessions/${active.id}/knowledge-draft`, {});
      setDraftLink(draft.item_id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not prepare a knowledge draft.');
    } finally { setBusy(false); }
  };

  const activeCheck = useMemo(() => active?.checks[active.current_check_index] || null, [active]);
  const outcomes = useMemo(() => new Map((active?.responses || []).map((r) => [r.check_index, r])), [active]);

  const formatValues = (values?: string[] | Array<Record<string, unknown>>) => (values || []).map((value) => {
    if (typeof value === 'string') return value;
    return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(' · ');
  });

  return (
    <div className="w-full space-y-5 px-4 py-6 sm:px-6">
      <header className="flex items-start gap-3 border-b border-[#DCE6F0] pb-4">
        <div className="rounded-xl border border-[#BCD7F5] bg-[#EAF3FF] p-2.5 text-[#1976D2]"><Wrench className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-[#17324D]">Troubleshooting</h1>
          <p className="mt-1 text-sm text-[#5D7188]">Review checks and references from approved manufacturing knowledge.</p>
        </div>
      </header>

      <Link to="/app/troubleshooting/guided" className="group flex items-center gap-4 rounded-2xl border border-[#BCD7F5] bg-gradient-to-r from-[#EAF3FF] to-white p-4 transition hover:border-[#1976D2] hover:shadow-md">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1976D2] text-white"><Route className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#17324D]">Guided troubleshooting</span>
          <span className="block text-sm text-[#5D7188]">Pick a machine and problem, then answer one question at a time along an expert-approved decision tree.</span>
        </span>
        <ArrowRight className="h-5 w-5 text-[#1976D2] transition group-hover:translate-x-1" />
      </Link>

      <Alert variant="warning" title="Investigation support">
        This helps organize an investigation; it does not certify a diagnosis or confirm that a machine is safe to operate. Only perform checks your role is authorized to do. Pause and escalate if a check is unclear or involves maintenance.
      </Alert>
      {error && <Alert variant="error" title="Unable to continue">{error}</Alert>}

      {!active ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card title="Describe what you observed" subtitle="The system searches published knowledge and will show a limitation if no relevant procedure is available.">
            {searchParams.get('workflow_run_id') && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This investigation will be linked to the reported Guided Workflow issue.</div>}
            <form onSubmit={startSession} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="problem">Problem or symptom</label>
                <textarea id="problem" value={symptom} onChange={(e) => setSymptom(e.target.value)} maxLength={2000} minLength={3} required rows={3} className="w-full rounded-lg border border-[#DCE6F0] p-3 text-sm focus:border-blue-500 focus:outline-none" placeholder="Describe the vibration, sound, dimension issue, defect, or unexpected behavior." />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="machine">Machine (optional)</label>
                  <select id="machine" value={machineId} onChange={(e) => setMachineId(e.target.value)} className="w-full rounded-lg border border-[#DCE6F0] bg-white p-2.5 text-sm">
                    <option value="">Not selected</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}{machine.model_number ? ` · ${machine.model_number}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="process">Manufacturing process (optional)</label>
                  <select id="process" value={processId} onChange={(e) => setProcessId(e.target.value)} className="w-full rounded-lg border border-[#DCE6F0] bg-white p-2.5 text-sm">
                    <option value="">Not selected</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.name}{process.code ? ` · ${process.code}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="category">Problem category (optional)</label>
                  <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-[#DCE6F0] bg-white p-2.5 text-sm">
                    <option value="">Not selected</option><option value="vibration_noise">Vibration or noise</option><option value="dimension_tolerance">Dimensions or tolerance</option><option value="surface_finish">Surface finish</option><option value="tool_wear">Tool wear or failure</option><option value="unexpected_behavior">Unexpected behavior</option><option value="workflow_step">Workflow step issue</option><option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="operation">Current operation or step (optional)</label>
                <Input id="operation" value={operation} onChange={(e) => setOperation(e.target.value)} maxLength={1000} placeholder="Operation, part, or workflow step" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#17324D]" htmlFor="checked">What has already been checked? (optional)</label>
                <textarea id="checked" value={checkedAlready} onChange={(e) => setCheckedAlready(e.target.value)} maxLength={2000} rows={2} className="w-full rounded-lg border border-[#DCE6F0] p-2.5 text-sm" placeholder="Record completed checks or measurements; include units when documented." />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={searchTopics} disabled={symptom.trim().length < 2} icon={<Search className="h-4 w-4" />}>Search approved topics</Button>
                <Button type="submit" variant="primary" disabled={busy || symptom.trim().length < 3}>{busy ? 'Searching approved knowledge…' : 'Start investigation'}</Button>
              </div>
            </form>
            {topics.length > 0 && <div className="mt-5 space-y-2 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-[#17324D]">Matching published sources</h3>{topics.slice(0, 5).map((source) => <SourceCard key={`${source.version_id}-${source.source_id}`} source={source} />)}</div>}
          </Card>

          <Card title="Your sessions" subtitle="Resume an investigation or review its recorded outcomes.">
            {sessions.length === 0 ? <EmptyState icon={<FileText className="h-5 w-5" />} title="No saved sessions" description="Your troubleshooting sessions will appear here." /> : <div className="space-y-2">{sessions.map((session) => <button key={session.id} type="button" onClick={() => void loadSession(session.id)} className="w-full rounded-lg border border-[#DCE6F0] p-3 text-left hover:bg-slate-50"><span className="block text-sm font-semibold text-[#17324D] line-clamp-2">{session.reported_symptom}</span><span className="mt-1 block text-xs text-slate-500">{new Date(session.started_at).toLocaleString()} · {session.status.replace('_', ' ')}</span></button>)}</div>}
          </Card>
        </div>
      ) : loading ? <LoadingSpinner size="lg" message="Loading saved investigation…" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><Badge variant={active.status === 'in_progress' ? 'info' : active.status === 'resolved' ? 'success' : 'warning'}>{active.status.replace('_', ' ')}</Badge><p className="mt-2 text-lg font-semibold text-[#17324D]">{active.reported_symptom}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setActive(null); setDraftLink(null); }}>New investigation</Button>{active.workflow_run_id && <Button size="sm" variant="secondary" onClick={() => navigate(`/app/guided-workflows?run_id=${encodeURIComponent(active.workflow_run_id!)}`)}>Return to workflow</Button>}</div>
          </div>

          {active.source_refs.length === 0 && <Alert variant="warning" title="No relevant approved source found">There is not enough published evidence to provide a reliable check sequence. Do not infer a cause from this result. Escalate to a supervisor or maintenance expert.</Alert>}
          {active.source_refs.length > 0 && <section className="space-y-2"><h2 className="text-sm font-semibold text-[#17324D]">Approved source references</h2>{active.source_refs.slice(0, 6).map((source) => <SourceCard key={`${source.version_id}-${source.source_id}`} source={source} />)}</section>}

          {active.status === 'in_progress' && activeCheck ? (
            <Card title={`Documented check ${active.current_check_index + 1} of ${active.checks.length}`} subtitle="This check is copied from an approved source. Outcomes do not establish a root cause unless the source explicitly says so.">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-[#5D7188]">Progress <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${((active.current_check_index + 1) / active.checks.length) * 100}%` }} /></div></div>
                <h2 className="text-lg font-bold text-[#17324D]">{activeCheck.title}</h2>
                <p className="whitespace-pre-wrap text-base leading-relaxed text-[#40566D]">{activeCheck.instruction}</p>
                {activeCheck.why_relevant && <p className="text-xs text-slate-500">{activeCheck.why_relevant}</p>}
                {activeCheck.safety_warning && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Source safety note:</strong> {activeCheck.safety_warning}</div>}
                {activeCheck.authorized_role && <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Source authorization:</strong> {activeCheck.authorized_role}</div>}
                {formatValues([...(activeCheck.tools || []), ...(activeCheck.materials || [])]).length > 0 && <div><strong className="text-sm text-[#17324D]">Tools and materials documented</strong><ul className="list-disc pl-5 text-sm text-slate-600">{formatValues([...(activeCheck.tools || []), ...(activeCheck.materials || [])]).map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
                {formatValues(activeCheck.parameters).length > 0 && <div className="rounded-lg bg-blue-50 p-3"><strong className="text-sm text-[#17324D]">Documented parameters</strong><ul className="list-disc pl-5 text-sm text-slate-700">{formatValues(activeCheck.parameters).map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
                {activeCheck.expected_observation && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Expected observation:</strong> {activeCheck.expected_observation}</div>}
                {!!activeCheck.quality_checkpoints?.length && <div><strong className="text-sm text-[#17324D]">Quality checkpoints</strong><ul className="list-disc pl-5 text-sm text-slate-600">{activeCheck.quality_checkpoints.map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
                <div><label htmlFor="observation" className="mb-1 block text-sm font-semibold text-[#17324D]">Your observation (optional)</label><textarea id="observation" value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={2000} rows={2} className="w-full rounded-lg border border-[#DCE6F0] p-2.5 text-sm" placeholder="Record what you observed. Include units only as provided by the source." /></div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><Button variant="outline" disabled={busy || active.current_check_index <= 0} onClick={() => void navigateCheck(active.current_check_index - 1)} icon={<ArrowLeft className="h-4 w-4" />}>Previous check</Button><div className="flex flex-wrap gap-2">{outcomeLabels.map((outcome) => <Button key={outcome.value} size="sm" variant={outcome.value === 'resolved' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void recordOutcome(outcome.value)}>{outcome.label}</Button>)}</div></div>
              </div>
            </Card>
          ) : active.status === 'in_progress' ? <Card title="No supported check sequence" subtitle="Relevant sources may be available, but they do not contain symptom-matched ordered steps that can safely be presented as checks."><p className="text-sm text-slate-600">Review the cited excerpts above and escalate for a qualified assessment. The system has not generated a procedure.</p></Card> : (
            <Card title="Investigation summary" subtitle="Recorded checks and outcomes are retained with the source revision shown at session start.">
              <div className="space-y-2">{active.checks.map((check, index) => { const result = outcomes.get(index); return <div key={index} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#17324D]">{index + 1}. {check.title}</strong><Badge variant={result?.outcome === 'pass' ? 'success' : result?.outcome === 'fail' ? 'danger' : 'neutral'}>{result?.outcome || 'not checked'}</Badge></div>{result?.observation && <p className="mt-1 text-sm text-slate-600">{result.observation}</p>}</div>; })}</div>
            </Card>
          )}

          {active.status === 'in_progress' && <form onSubmit={escalate} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><label htmlFor="escalation-reason" className="block text-sm font-semibold text-amber-950">Stop and escalate this case</label><Input id="escalation-reason" value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} maxLength={2000} placeholder="Explain why expert or maintenance review is needed." /><Button type="submit" size="sm" variant="secondary" disabled={busy || escalationReason.trim().length < 3} icon={<ShieldAlert className="h-4 w-4" />}>Escalate to expert</Button></form>}

          {active.workflow_run_id && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Linked Guided Workflow issue: {active.workflow_issue_id}. Troubleshooting has not changed the workflow step completion state.</div>}
          {canCreateKnowledge && active.status !== 'in_progress' && <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => void createKnowledgeDraft()} disabled={busy}>Prepare knowledge draft for expert review</Button>{draftLink && <a href={`/app/knowledge/${draftLink}`} className="text-sm font-semibold text-blue-700 underline">Open draft in Knowledge Editor</a>}</div>}
          <div className="flex justify-end"><Button variant="outline" onClick={() => { setActive(null); void refreshSessions(); }}>Back to sessions</Button></div>
        </div>
      )}
    </div>
  );
};

const SourceCard: React.FC<{ source: SourceRef }> = ({ source }) => (
  <div className="rounded-lg border border-[#DCE6F0] bg-white p-3">
    <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><div className="min-w-0 flex-1"><a href={`/app/knowledge/${source.item_id}`} className="text-sm font-semibold text-blue-700 underline">{source.title}</a><div className="text-xs text-slate-500">Approved revision v{source.version_no}{source.section ? ` · ${source.section}` : ''}{source.category ? ` · ${source.category}` : ''}</div>{source.excerpt && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{source.excerpt}</p>}</div><CircleHelp className="h-4 w-4 text-slate-400" /></div>
  </div>
);
