import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  LoaderCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wrench,
} from 'lucide-react';
import { api, getApiUrl } from '../../lib/api/client';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import type { Machine } from '../knowledge-capture/types';
import { MACHINE_DIARY_MACHINE_LABELS } from '../knowledge/machineDiaryApi';
import { useAuth } from '../../hooks/useAuth';

type Stage = 1 | 2 | 3;

interface ProcedureStep {
  id: string;
  step_order: number;
  title: string;
  instruction: string;
  expected_observation?: string | null;
  safety_warning?: string | null;
  is_critical: boolean;
  details?: Record<string, unknown>;
}

interface Procedure {
  id: string;
  title: string;
  description: string;
  machine_id: string | null;
  machine_name?: string | null;
  status: string;
  version: number;
  prerequisites?: string | null;
  required_tools?: string | null;
  safety_warnings?: string | null;
  operating_conditions?: string | null;
  steps: ProcedureStep[];
  updated_at: string;
}

interface RunStep {
  id: string;
  step_id: string;
  is_completed: boolean;
  operator_notes?: string | null;
  verified_at?: string | null;
}

interface ProcedureRun {
  id: string;
  procedure_id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | string;
  started_at: string;
  completed_at?: string | null;
  step_executions: RunStep[];
}

interface ProcedureReference {
  id: string;
  title: string;
  kind: string;
  machine_id: string | null;
  url?: string | null;
  verification_status?: string | null;
  mime?: string | null;
}

const theme = {
  page: 'bg-[#F5F8FC] text-[#17324D]',
  panel: 'rounded-[1.4rem] border border-[#DCE6F0] bg-white shadow-[0_10px_28px_-22px_rgba(23,50,77,0.34)]',
  muted: 'text-[#536779]',
};

function explainError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isVerified(status?: string | null): boolean {
  return ['verified', 'approved', 'published'].includes((status || '').toLowerCase());
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function curvePath(stepCount: number): string {
  if (stepCount < 2) return '';
  const xAt = (index: number) => index % 2 === 0 ? 70 : 30;
  const yAt = (index: number) => index * 160 + 32;
  return Array.from({ length: stepCount - 1 }, (_, index) => {
    const x1 = xAt(index);
    const x2 = xAt(index + 1);
    const y1 = yAt(index);
    const y2 = yAt(index + 1);
    return `${index === 0 ? `M ${x1} ${y1}` : ''} C ${x1} ${y1 + 60}, ${x2} ${y2 - 60}, ${x2} ${y2}`;
  }).join(' ');
}

export function GuidedWorkflowsPage() {
  const { hasPermission } = useAuth();
  const [stage, setStage] = useState<Stage>(1);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machineError, setMachineError] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [run, setRun] = useState<ProcedureRun | null>(null);
  const [references, setReferences] = useState<ProcedureReference[]>([]);
  const [failedReferenceIds, setFailedReferenceIds] = useState<Set<string>>(() => new Set());
  const [referenceNotice, setReferenceNotice] = useState('');
  const [loadingMission, setLoadingMission] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [missionError, setMissionError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [performed, setPerformed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [operatorNotes, setOperatorNotes] = useState('');

  useEffect(() => {
    let mounted = true;
    setMachinesLoading(true);
    fetchMachines({ page_size: 100 })
      .then((result) => {
        if (!mounted) return;
        const supportedNames = new Set<string>(MACHINE_DIARY_MACHINE_LABELS);
        setMachines(result.items.filter((machine) => supportedNames.has(machine.name)));
      })
      .catch((error: unknown) => {
        if (mounted) setMachineError(explainError(error));
      })
      .finally(() => {
        if (mounted) setMachinesLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const stepExecutions = useMemo(() => {
    const byStepId = new Map<string, RunStep>();
    run?.step_executions.forEach((execution) => byStepId.set(execution.step_id, execution));
    return byStepId;
  }, [run]);

  const completedCount = procedure?.steps.filter((step) => stepExecutions.get(step.id)?.is_completed).length || 0;
  const stepCount = procedure?.steps.length || 0;
  const allStepsCompleted = stepCount > 0 && completedCount === stepCount;
  const serverConfirmedComplete = run?.status === 'COMPLETED' && allStepsCompleted && Boolean(run.completed_at);
  const firstIncompleteIndex = procedure?.steps.findIndex((step) => !stepExecutions.get(step.id)?.is_completed) ?? -1;
  const furthestAvailableIndex = firstIncompleteIndex === -1 ? Math.max(0, stepCount - 1) : firstIncompleteIndex;
  const currentStep = procedure?.steps[activeIndex];
  const currentExecution = currentStep ? stepExecutions.get(currentStep.id) : undefined;
  const needsStepVerification = Boolean(currentStep && (currentStep.is_critical || currentStep.expected_observation || currentStep.safety_warning));
  const needsSafetyAcknowledgement = Boolean(procedure?.safety_warnings?.trim());
  const currentStepComplete = Boolean(currentExecution?.is_completed);
  const canMarkComplete = performed && (!needsStepVerification || verified) && (!needsSafetyAcknowledgement || safetyAcknowledged);

  const resetStepChecks = useCallback(() => {
    setPerformed(false);
    setVerified(false);
    setOperatorNotes('');
  }, []);

  const selectMachine = async (machine: Machine) => {
    setSelectedMachine(machine);
    setStage(2);
    setProcedure(null);
    setRun(null);
    setReferences([]);
    setFailedReferenceIds(new Set());
    setReferenceNotice('');
    setMissionError('');
    setActiveIndex(0);
    setSafetyAcknowledged(false);
    resetStepChecks();
    setLoadingMission(true);
    try {
      const procedures = await api.get<Procedure[]>(`/procedures?machine_id=${encodeURIComponent(machine.id)}`);
      const machineProcedures = procedures
        .filter((item) => item.status === 'APPROVED' && item.machine_id === machine.id && item.steps?.length)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      const selectedProcedure = machineProcedures[0];
      if (!selectedProcedure) return;
      setProcedure(selectedProcedure);

      const runs = await api.get<ProcedureRun[]>('/procedures/runs/my/all');
      const existingRun = runs.find((item) => item.procedure_id === selectedProcedure.id && item.status === 'IN_PROGRESS');
      const activeRun = existingRun || await api.post<ProcedureRun>(`/procedures/${selectedProcedure.id}/start`, {});
      setRun(activeRun);
      const incomplete = selectedProcedure.steps.findIndex((step) => !activeRun.step_executions.find((execution) => execution.step_id === step.id)?.is_completed);
      setActiveIndex(incomplete < 0 ? Math.max(0, selectedProcedure.steps.length - 1) : incomplete);

      try {
        const assets = await api.get<ProcedureReference[]>(`/procedures/${selectedProcedure.id}/assets`);
        const compatible = assets.filter((asset) => asset.machine_id === machine.id && isVerified(asset.verification_status));
        setReferences(compatible);
        setFailedReferenceIds(new Set());
        if (assets.length && !compatible.length) setReferenceNotice('This procedure has reference media, but none is marked verified for this machine.');
      } catch {
        setReferenceNotice('Reference media is unavailable for your current permissions.');
      }
    } catch (error) {
      setMissionError(explainError(error));
    } finally {
      setLoadingMission(false);
    }
  };

  const moveToStep = (index: number) => {
    if (!procedure || index < 0 || index >= procedure.steps.length || index > furthestAvailableIndex) return;
    setActiveIndex(index);
    resetStepChecks();
  };

  const markCurrentStepComplete = async () => {
    if (!procedure || !run || !currentStep || !canMarkComplete || currentStepComplete) return;
    setSavingStep(true);
    setMissionError('');
    try {
      const updated = await api.post<ProcedureRun>(
        `/procedures/runs/${run.id}/step/${currentStep.id}`,
        { is_completed: true, operator_notes: operatorNotes.trim() || undefined },
      );
      setRun(updated);
      resetStepChecks();
      const count = procedure.steps.filter((step) => updated.step_executions.find((execution) => execution.step_id === step.id)?.is_completed).length;
      if (count === procedure.steps.length && (updated.status !== 'COMPLETED' || !updated.completed_at)) {
        setMissionError('All checkpoints are marked complete, but the server has not confirmed procedure completion yet. Refresh the run status before finishing.');
      }
    } catch (error) {
      setMissionError(explainError(error));
    } finally {
      setSavingStep(false);
    }
  };

  const startOver = () => {
    setStage(1);
    setSelectedMachine(null);
    setProcedure(null);
    setRun(null);
    setReferences([]);
    setFailedReferenceIds(new Set());
    setMissionError('');
    setReferenceNotice('');
    setActiveIndex(0);
    setSafetyAcknowledged(false);
    resetStepChecks();
  };

  const stageItems = [
    { number: 1, title: 'Select Machine' },
    { number: 2, title: 'Guided Mission' },
    { number: 3, title: 'Review & Complete' },
  ] as const;

  return (
    <main className={`${theme.page} min-h-[100dvh] px-4 py-6 sm:px-6 lg:px-10`}>
      <div className="w-full space-y-6 sm:space-y-8">
        <header className="grid gap-5 border-b border-[#DCE6F0] pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:pb-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C8DCE7] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">
              <Sparkles size={13} aria-hidden="true" /> Your learning path
            </span>
            <h1 className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.045em] text-[#17324D]">Learn one checkpoint at a time.</h1>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[#536779]">
              Follow the approved procedure in order. Your progress is saved from verified checkpoints, and completed steps stay available to revisit.
            </p>
          </div>
          {stage > 1 && <button type="button" onClick={startOver} className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl border border-[#DCE6F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#17324D] transition hover:border-[#176E8A]/50 hover:bg-[#F7FBFC] active:translate-y-px motion-reduce:transition-none sm:justify-self-end"><ArrowLeft size={16} /> Change machine</button>}
        </header>

        <nav aria-label="Guided workflow stages" className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:gap-3">
          {stageItems.map((item, index) => {
            const complete = stage > item.number;
            const active = stage === item.number;
            return <div key={item.number} className="flex items-center gap-2 sm:gap-3">
              {index > 0 && <span aria-hidden="true" className={`h-px w-5 sm:w-8 ${complete || active ? 'bg-[#176E8A]' : 'bg-[#CBD5E1]'}`} />}
              <span aria-current={active ? 'step' : undefined} className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 ${active ? 'bg-[#176E8A] text-white' : complete ? 'bg-[#E3EEF2] text-[#176E8A]' : 'bg-white text-[#708196] ring-1 ring-[#DCE6F0]'}`}>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">{complete ? <Check size={13} /> : item.number}</span>{item.title}
              </span>
            </div>;
          })}
        </nav>

        {machineError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Could not load registered machines: {machineError}</div>}
        {missionError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{missionError}</div>}

        {stage === 1 && <section aria-labelledby="machine-heading" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">Start here</p>
              <h2 id="machine-heading" className="mt-1 text-2xl font-bold tracking-tight text-[#17324D]">Choose your machine</h2>
              <p className="mt-1 text-sm text-[#536779]">We’ll find its latest approved procedure and saved progress.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#536779] ring-1 ring-[#DCE6F0]">{MACHINE_DIARY_MACHINE_LABELS.length} registered machine types</span>
          </div>
          {machinesLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading machine choices" aria-busy="true">{MACHINE_DIARY_MACHINE_LABELS.map((label: string) => <div key={label} className={`${theme.panel} min-h-48 animate-pulse p-5 motion-reduce:animate-none`}><div className="h-12 w-12 rounded-2xl bg-[#E8EEF3]" /><div className="mt-6 h-5 w-2/3 rounded bg-[#E8EEF3]" /><div className="mt-3 h-3 w-1/2 rounded bg-[#F0F3F6]" /></div>)}</div> : machines.length === 0 ? <div className={`${theme.panel} p-7 sm:p-9`}><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EEF3F6] text-[#536779]"><Wrench size={22} /></div><h3 className="mt-4 text-lg font-bold text-[#17324D]">No supported machines are registered yet</h3><p className="mt-2 max-w-[58ch] text-sm leading-6 text-[#536779]">A learning path appears after a supported machine and its approved procedure are available.</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {MACHINE_DIARY_MACHINE_LABELS.map((label: string, index: number) => {
              const machine = machines.find((item) => item.name === label);
              return <button key={label} type="button" disabled={!machine || loadingMission} onClick={() => machine && void selectMachine(machine)} className={`${theme.panel} group relative min-h-48 overflow-hidden p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#176E8A]/50 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none`}>
                <span className="absolute right-4 top-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#A0ADBA]">0{index + 1}</span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8F1F4] text-[#176E8A] transition-transform group-hover:scale-[1.04] motion-reduce:transform-none"><Wrench size={22} /></span>
                <span className="mt-5 block text-lg font-bold tracking-tight text-[#17324D]">{label}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-[#708196]">{machine ? machine.code : 'Not registered'}</span>
                <span className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#176E8A] px-4 text-xs font-bold text-white transition group-hover:bg-[#125C74] active:translate-y-px motion-reduce:transition-none">
                  {loadingMission && selectedMachine?.id === machine?.id ? 'Loading path…' : 'Open learning path'} <ArrowRight size={14} />
                </span>
              </button>;
            })}
          </div>}
        </section>}

        {stage === 2 && <section aria-labelledby="mission-heading" className="space-y-5">
          <div className="grid gap-5 rounded-[1.6rem] border border-[#DCE6F0] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,50,77,0.4)] sm:grid-cols-[minmax(0,1fr)_minmax(230px,0.55fr)] sm:items-center sm:p-7">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">Guided workflow · {selectedMachine?.code || 'Registered machine'}</p>
              <h2 id="mission-heading" className="mt-2 text-2xl font-bold tracking-tight text-[#17324D] sm:text-3xl">{selectedMachine?.name || 'Your machine'} learning path</h2>
              {procedure && <><p className="mt-2 text-sm font-semibold text-[#344B60]">{procedure.title} · approved version {procedure.version}</p><p className="mt-1 max-w-[62ch] whitespace-pre-line text-sm leading-6 text-[#536779]">{procedure.description}</p></>}
              {!procedure && <p className="mt-2 text-sm leading-6 text-[#536779]">Loading the latest approved procedure and your saved checkpoints.</p>}
            </div>
            {procedure && <div className="rounded-2xl bg-[#F4F8FA] p-4 sm:p-5">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Your progress</p><p className="mt-1 text-sm font-semibold text-[#17324D]">{completedCount} of {stepCount} checkpoints</p></div><span className="font-mono text-2xl font-bold tracking-tight text-[#176E8A]">{stepCount ? Math.round((completedCount / stepCount) * 100) : 0}%</span></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#DCE6F0]" role="progressbar" aria-label="Procedure progress" aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={completedCount}><div className="h-full rounded-full bg-[#1677F8] transition-all duration-300" style={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} /></div>
              <p className="mt-2 text-[11px] text-[#536779]">{serverConfirmedComplete ? 'All checkpoints have been recorded.' : `Step ${Math.min(activeIndex + 1, stepCount)} of ${stepCount} · future steps unlock in order.`}</p>
            </div>}
          </div>

          {loadingMission && <div className={`${theme.panel} grid gap-5 p-5 sm:grid-cols-[0.8fr_1.5fr] sm:p-7`} aria-label="Loading approved procedure" aria-busy="true"><div className="space-y-3"><div className="h-5 w-2/3 animate-pulse rounded bg-[#E8EEF3] motion-reduce:animate-none" />{[1, 2, 3, 4].map((row) => <div key={row} className="h-12 animate-pulse rounded-xl bg-[#F0F3F6] motion-reduce:animate-none" />)}</div><div className="space-y-4"><div className="h-8 w-1/3 animate-pulse rounded bg-[#E8EEF3] motion-reduce:animate-none" /><div className="h-36 animate-pulse rounded-2xl bg-[#F0F3F6] motion-reduce:animate-none" /><div className="h-20 animate-pulse rounded-2xl bg-[#F0F3F6] motion-reduce:animate-none" /></div></div>}
          {!loadingMission && !missionError && selectedMachine && !procedure && <div className={`${theme.panel} p-7 sm:p-9`}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8F1F4] text-[#176E8A]"><ClipboardCheck size={24} /></div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">No path published yet</p>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-[#17324D]">No approved procedure is available for {selectedMachine.name}</h3>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[#536779]">The learning path will appear after an Expert publishes an approved procedure for this machine. This screen only displays verified content; it does not create training instructions.</p>
            {hasPermission('procedure.create') && <Link to="/app/procedures/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1677F8] px-5 text-sm font-bold text-white transition hover:bg-[#125EA3] active:translate-y-px motion-reduce:transition-none"><FileText size={16} />Create a procedure</Link>}
          </div>}

          {!loadingMission && procedure && !run && <div className={`${theme.panel} p-6`}>
            <h3 className="font-bold text-[#173B5E]">The procedure run could not be opened</h3>
            <p className={`mt-1 text-sm ${theme.muted}`}>Retry to resume an existing run or start the approved procedure.</p>
            <button type="button" onClick={() => selectedMachine && void selectMachine(selectedMachine)} className="mt-4 rounded-lg bg-[#1677F8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125EA3]">Retry</button>
          </div>}

          {!loadingMission && procedure && run && currentStep && <>
            {procedure.safety_warnings?.trim() && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><div><p className="font-bold">Procedure safety alert</p><p className="mt-1 whitespace-pre-line leading-6">{procedure.safety_warnings}</p></div></div>}
            {(procedure.prerequisites || procedure.required_tools || procedure.operating_conditions) && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {procedure.prerequisites && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Before you start</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.prerequisites}</p></div>}
              {procedure.required_tools && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Required tools</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.required_tools}</p></div>}
              {procedure.operating_conditions && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Operating conditions</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.operating_conditions}</p></div>}
            </div>}

            <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.6fr)]">
              <section aria-labelledby="path-heading" className={`${theme.panel} overflow-hidden p-4 sm:p-6`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1677F8]">Your checkpoints</p><h3 id="path-heading" className="mt-1 text-lg font-bold tracking-tight text-[#17324D]">Learning path</h3></div>
                  <span className="rounded-full bg-[#F4F8FA] px-3 py-1.5 text-[10px] font-semibold text-[#536779]">{completedCount}/{stepCount} done</span>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F4F8FA] p-3">
                  <div><p className="text-xs font-bold text-[#17324D]">{serverConfirmedComplete ? 'Path completed' : `Up next · Step ${furthestAvailableIndex + 1}`}</p><p className="mt-0.5 text-[11px] text-[#536779]">{serverConfirmedComplete ? 'Revisit a completed checkpoint any time.' : 'Continue with the next eligible checkpoint.'}</p></div>
                  <button type="button" onClick={() => moveToStep(serverConfirmedComplete ? Math.max(0, stepCount - 1) : furthestAvailableIndex)} disabled={!stepCount || savingStep} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1677F8] px-4 text-xs font-bold text-white transition hover:bg-[#125EA3] active:translate-y-px disabled:opacity-50 motion-reduce:transition-none">{serverConfirmedComplete ? 'Review last step' : 'Continue'} <ArrowRight size={14} /></button>
                </div>
                <div className="relative mx-auto mt-6 max-w-xl" style={{ height: `${stepCount * 160}px` }}>
                  {stepCount > 1 && <>
                    <svg aria-hidden="true" className="absolute inset-0 hidden h-full w-full sm:block" viewBox={`0 0 100 ${stepCount * 160}`} preserveAspectRatio="none"><path d={curvePath(stepCount)} fill="none" stroke="#D6E2E9" strokeWidth="1.5" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" /></svg>
                    <div aria-hidden="true" className="absolute left-1/2 top-8 w-px -translate-x-1/2 border-l-2 border-dashed border-[#D6E2E9] sm:hidden" style={{ height: `${(stepCount - 1) * 160}px` }} />
                  </>}
                  <ol aria-label="Procedure learning steps" className="relative h-full">
                    {procedure.steps.map((step, index) => {
                      const done = Boolean(stepExecutions.get(step.id)?.is_completed);
                      const isCurrent = index === activeIndex;
                      const locked = index > furthestAvailableIndex;
                      const requiresVerification = Boolean(step.is_critical || step.expected_observation || step.safety_warning);
                      const status = done ? 'Completed' : locked ? 'Locked' : isCurrent && requiresVerification ? 'Current · verification required' : isCurrent ? 'Current' : 'Available';
                      const blurb = step.instruction.replace(/\s+/g, ' ').trim();
                      return <li key={step.id} style={{ top: `${index * 160}px` }} className={`absolute left-1/2 -translate-x-1/2 sm:left-[70%] transition-opacity duration-300 ${index % 2 === 1 ? 'sm:left-[30%]' : ''}`}>
                        <button type="button" disabled={locked || savingStep} onClick={() => moveToStep(index)} aria-current={isCurrent ? 'step' : undefined} aria-label={`Step ${step.step_order}: ${step.title}, ${status}`} className={`group relative grid h-16 w-16 place-items-center rounded-full border-[3px] text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1677F8]/20 disabled:cursor-not-allowed motion-reduce:transition-none ${done ? 'border-[#1677F8] bg-[#1677F8] text-white shadow-[0_8px_20px_-12px_rgba(22,119,248,0.65)] hover:bg-[#125EA3]' : isCurrent ? 'border-[#1677F8] bg-white text-[#1677F8] shadow-[0_0_0_7px_rgba(22,119,248,0.09)]' : locked ? 'border-[#D8E0E6] bg-[#F4F6F8] text-[#9AA7B2]' : 'border-[#B7CDD7] bg-white text-[#1677F8] hover:border-[#1677F8]'} ${locked ? 'opacity-75' : ''}`}>
                          {done ? <Check size={25} aria-hidden="true" /> : locked ? <LockKeyhole size={20} aria-hidden="true" /> : <span>{step.step_order}</span>}
                          {isCurrent && <span aria-hidden="true" className="absolute inset-[-8px] rounded-full border border-[#1677F8]/25 animate-pulse" />}
                          <span className={`absolute top-[4.5rem] left-1/2 w-[min(250px,76vw)] -translate-x-1/2 text-center sm:top-1/2 sm:w-56 sm:-translate-y-1/2 sm:translate-x-0 ${index % 2 === 0 ? 'sm:right-[calc(100%+1rem)] sm:left-auto sm:text-right' : 'sm:left-[calc(100%+1rem)] sm:right-auto sm:text-left'}`}>
                            <span className={`block text-xs font-bold leading-4 ${isCurrent ? 'text-[#102844]' : done ? 'text-[#1677F8]' : locked ? 'text-[#8292A0]' : 'text-[#344B60]'}`}>{step.title}</span>
                            <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-[#647A96]">{blurb}</span>
                            <span className={`mt-1 inline-block text-[9px] font-bold uppercase tracking-[0.12em] ${done || isCurrent ? 'text-[#1677F8]' : 'text-[#8292A0]'}`}>{status}</span>
                          </span>
                        </button>
                      </li>;
                    })}
                  </ol>
                </div>
                <p className="mt-4 border-t border-[#E7EDF1] pt-3 text-[11px] leading-5 text-[#536779]">Earlier completed checkpoints stay open for review. Later steps unlock only after this procedure records the current checkpoint complete.</p>
              </section>

              <article className={`${theme.panel} overflow-hidden`}>
                <div className="border-b border-[#E7EDF1] bg-[#F8FAFB] p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#1677F8] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">STEP {activeIndex + 1} OF {stepCount}</span>{currentStep.is_critical && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-900"><ShieldCheck size={13} />Critical checkpoint</span>}{currentStepComplete && <span className="inline-flex items-center gap-1 rounded-full border border-[#C8DCE7] bg-white px-3 py-1 text-[10px] font-bold text-[#1677F8]"><CheckCircle2 size={13} />Saved</span>}</div>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-[#102844] sm:text-3xl">{currentStep.title}</h3>
                  <p className="mt-3 max-w-[68ch] whitespace-pre-line text-sm leading-7 text-[#344B60]">{currentStep.instruction}</p>
                </div>
                <div className="space-y-4 p-5 sm:p-7">
                  {currentStep.safety_warning && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">Safety warning</p><p className="mt-1 whitespace-pre-line leading-6">{currentStep.safety_warning}</p></div></div>}
                  {currentStep.expected_observation && <div className="rounded-2xl border border-[#DCE6F0] bg-[#F6F9FA] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Expected observation</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#17324D]">{currentStep.expected_observation}</p></div>}
                  {stringList(currentStep.details?.tools ?? currentStep.details?.materials).length > 0 && <div><h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Tools and materials</h4><ul className="mt-2 flex flex-wrap gap-2">{stringList(currentStep.details?.tools ?? currentStep.details?.materials).map((tool) => <li key={tool} className="rounded-full bg-[#F1F5F7] px-3 py-1.5 text-xs font-medium text-[#344B60]">{tool}</li>)}</ul></div>}
                  {stringList(currentStep.details?.quality_checkpoints).length > 0 && <div className="rounded-2xl border border-[#DCE6F0] p-4"><h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Checks listed for this step</h4><ul className="mt-2 space-y-2">{stringList(currentStep.details?.quality_checkpoints).map((check) => <li key={check} className="flex items-start gap-2 text-sm leading-6 text-[#344B60]"><Check size={15} className="mt-1 shrink-0 text-[#1677F8]" />{check}</li>)}</ul></div>}
                  {typeof currentStep.details?.note === 'string' && currentStep.details.note.trim() && <div className="rounded-2xl border-l-4 border-[#1677F8] bg-[#F4F8FA] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#708196]">Step note</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#344B60]">{currentStep.details.note}</p></div>}
                  {references.length > 0 && <section aria-labelledby="reference-heading">
                    <div className="flex items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1677F8]">Approved learning materials</p><h4 id="reference-heading" className="mt-1 text-sm font-bold text-[#102844]">Verified references for this procedure</h4></div><span className="text-[10px] text-[#708196]">{references.length} item{references.length === 1 ? '' : 's'}</span></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">{references.map((asset) => <ProcedureReferenceCard key={asset.id} asset={asset} failed={failedReferenceIds.has(asset.id)} onMediaError={() => setFailedReferenceIds((current) => new Set(current).add(asset.id))} />)}</div>
                  </section>}
                  {referenceNotice && <p className="text-xs text-[#536779]">{referenceNotice}</p>}

                  {currentStepComplete ? <div className="flex items-start gap-3 rounded-2xl border border-[#C8DCE7] bg-[#F0F6F8] p-4 text-sm text-[#102844]"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#1677F8]" /><div><p className="font-bold">Checkpoint saved</p>{currentExecution?.verified_at && <p className="mt-1 text-xs text-[#536779]">Recorded {new Date(currentExecution.verified_at).toLocaleString()}</p>}<p className="mt-1 text-xs text-[#536779]">You can revisit this completed step without changing your progress.</p></div></div> : <div className="space-y-4 rounded-2xl border border-[#DCE6F0] bg-[#FAFBFC] p-4 sm:p-5">
                    <div><p className="text-sm font-bold text-[#17324D]">Record this checkpoint</p><p className="mt-1 text-xs leading-5 text-[#536779]">Your confirmation is saved to this procedure run.</p></div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={performed} onChange={(event) => setPerformed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#176E8A]" /><span>I performed this checkpoint according to the approved procedure.</span></label>
                    {needsStepVerification && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#176E8A]" /><span>I checked the expected observation and applicable safety conditions.</span></label>}
                    {needsSafetyAcknowledgement && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#176E8A]" /><span>I reviewed the procedure-level safety alert before proceeding.</span></label>}
                    <label className="block text-xs font-semibold text-[#536779]">Operator observation <span className="font-normal">(optional)</span><textarea value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} maxLength={500} rows={3} placeholder="Record an observation for this checkpoint" className="mt-1.5 w-full resize-y rounded-xl border border-[#DCE6F0] bg-white px-3.5 py-3 text-sm font-normal text-[#17324D] outline-none focus:border-[#176E8A] focus:ring-2 focus:ring-[#176E8A]/15" /></label>
                    <ButtonMarkComplete disabled={!canMarkComplete || savingStep} loading={savingStep} onClick={() => void markCurrentStepComplete()} />
                    {!canMarkComplete && <p className="text-xs text-[#536779]">Complete the confirmation checks shown for this approved step before saving it.</p>}
                  </div>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EEF5] pt-4">
                    <button type="button" disabled={activeIndex === 0 || savingStep} onClick={() => moveToStep(activeIndex - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-4 text-sm font-semibold text-[#17324D] transition hover:bg-[#F4F8FA] disabled:opacity-40 motion-reduce:transition-none"><ArrowLeft size={16} />Previous</button>
                    {activeIndex < stepCount - 1 ? <button type="button" disabled={!currentStepComplete || savingStep} onClick={() => moveToStep(activeIndex + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Continue to next step<ArrowRight size={16} /></button> : <button type="button" disabled={!serverConfirmedComplete || savingStep} onClick={() => setStage(3)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Review completed path<ArrowRight size={16} /></button>}
                  </div>
                </div>
              </article>
            </div>
          </>}
        </section>}

        {stage === 3 && procedure && run && selectedMachine && <section aria-labelledby="review-heading" className="w-full max-w-4xl space-y-5">
          <div className={`${theme.panel} overflow-hidden`}>
            <div className="border-b border-[#DCE6F0] bg-[#F7FAFB] p-6 sm:p-9">
              <div className={`grid h-14 w-14 place-items-center rounded-2xl ${serverConfirmedComplete ? 'bg-[#E3EEF2] text-[#176E8A]' : 'bg-amber-100 text-amber-800'}`}>{serverConfirmedComplete ? <CheckCircle2 size={30} /> : <AlertTriangle size={28} />}</div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#176E8A]">Stage 3 · Review &amp; Complete</p>
              <h2 id="review-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-[#17324D]">{serverConfirmedComplete ? 'Procedure complete' : 'Completion needs confirmation'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#536779]">{serverConfirmedComplete ? 'The backend has recorded every checkpoint as complete.' : 'The procedure is not marked complete by the server. Review the remaining checks before finishing.'}</p>
            </div>
            <div className="space-y-5 p-6 sm:p-9">
              <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#F4F8FA] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Machine</dt><dd className="mt-1 font-bold text-[#17324D]">{selectedMachine.name}</dd></div><div className="rounded-2xl bg-[#F4F8FA] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Approved procedure</dt><dd className="mt-1 font-bold text-[#17324D]">{procedure.title} · v{procedure.version}</dd></div></dl>
              <div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#17324D]">Recorded checkpoints</span><span className="font-bold text-[#17324D]">{completedCount} / {stepCount}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#DCE6F0]" role="progressbar" aria-label="Completed checkpoints" aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={completedCount}><div className="h-full rounded-full bg-[#176E8A] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} /></div></div>
              <ul className="space-y-2">{procedure.steps.map((step) => { const done = Boolean(stepExecutions.get(step.id)?.is_completed); return <li key={step.id} className="flex items-start gap-3 rounded-2xl border border-[#E7EDF1] p-3 text-sm"><span className={done ? 'mt-0.5 text-[#176E8A]' : 'mt-0.5 text-amber-700'}>{done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><span className="flex-1 text-[#344B60]">{step.step_order}. {step.title}</span><span className={`text-[10px] font-bold uppercase tracking-wide ${done ? 'text-[#176E8A]' : 'text-amber-800'}`}>{done ? 'Completed' : 'Remaining'}</span></li>; })}</ul>
              <div className="flex flex-wrap justify-end gap-3 border-t border-[#E7EDF1] pt-5"><button type="button" onClick={() => setStage(2)} className="inline-flex min-h-11 items-center rounded-full border border-[#DCE6F0] bg-white px-5 text-sm font-semibold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none">Return to procedure</button><button type="button" onClick={startOver} disabled={!serverConfirmedComplete} className="inline-flex min-h-11 items-center rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Finish workflow</button></div>
            </div>
          </div>
        </section>}
      </div>
    </main>
  );
}

function ButtonMarkComplete({ disabled, loading, onClick }: { disabled: boolean; loading: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#176E8A] px-5 text-sm font-bold text-white transition hover:bg-[#125C74] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">
    {loading ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{loading ? 'Saving checkpoint…' : 'Mark Complete'}
  </button>;
}

function ProcedureReferenceCard({ asset, failed, onMediaError }: { asset: ProcedureReference; failed: boolean; onMediaError: () => void }) {
  const url = getApiUrl(asset.url || `/media/${asset.id}`);
  const icon = asset.kind === 'video' ? <PlayCircle size={18} /> : asset.kind === 'audio' ? <Volume2 size={18} /> : asset.kind === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />;
  const openLink = <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-3 text-xs font-bold text-[#176E8A] hover:bg-[#F4F8FA]" aria-label={`Open or download ${asset.title}`}><ExternalLink size={14} />Open file</a>;

  return <article className="min-w-0 rounded-2xl border border-[#DCE6F0] bg-white p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F1F4] text-[#176E8A]">{icon}</span>
      <div className="min-w-0 flex-1"><h5 className="break-words text-sm font-bold leading-5 text-[#17324D]">{asset.title}</h5><p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#176E8A]"><CheckCircle2 size={12} />Verified for this machine</p></div>
    </div>
    {failed ? <div className="mt-3 rounded-xl bg-[#F4F6F8] p-3"><p className="text-xs leading-5 text-[#536779]">The embedded preview could not be loaded. Open the approved file to view it.</p><div className="mt-2">{openLink}</div></div> : <div className="mt-3">
      {asset.kind === 'video' && <><video aria-label={`${asset.title} preview`} controls preload="metadata" className="max-h-64 w-full rounded-xl bg-[#17212B]" crossOrigin="use-credentials" onError={onMediaError}><source src={url} type={asset.mime || undefined} /></video><p className="mt-2 text-[10px] text-[#708196]">Use the player controls to view this approved reference.</p></>}
      {asset.kind === 'audio' && <><audio aria-label={`${asset.title} preview`} controls preload="metadata" className="w-full" crossOrigin="use-credentials" onError={onMediaError}><source src={url} type={asset.mime || undefined} /></audio><p className="mt-2 text-[10px] text-[#708196]">Use the player controls to listen to this approved reference.</p></>}
      {asset.kind === 'image' && <><a href={url} target="_blank" rel="noreferrer" aria-label={`Open full-size ${asset.title}`}><img src={url} alt={asset.title} crossOrigin="use-credentials" onError={onMediaError} className="max-h-64 w-full rounded-xl border border-[#E7EDF1] bg-[#F4F6F8] object-contain" /></a><p className="mt-2 text-[10px] text-[#708196]">Select the image to open the full-size file.</p></>}
      {asset.kind === 'document' && <div className="rounded-xl bg-[#F6F9FA] p-3"><p className="text-xs leading-5 text-[#536779]">Open this approved document in a new tab. The browser can preview supported PDFs and download other file types.</p><div className="mt-2">{openLink}</div></div>}
      {!['video', 'audio', 'image', 'document'].includes(asset.kind) && <div className="rounded-xl bg-[#F6F9FA] p-3"><p className="text-xs leading-5 text-[#536779]">This file type has no embedded preview. Open or download the approved file.</p><div className="mt-2">{openLink}</div></div>}
    </div>}
  </article>;
}
