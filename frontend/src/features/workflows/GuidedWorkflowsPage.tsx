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
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  ShieldCheck,
  Video,
  Volume2,
  Wrench,
} from 'lucide-react';
import { api, getApiUrl } from '../../lib/api/client';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import type { Machine } from '../knowledge-capture/types';
import { getSupportedMachineLabel, getSupportedMachineOptions } from '../machines/supportedMachines';

type Stage = 1 | 2 | 3;

interface ProcedureStep {
  id: string;
  step_order: number;
  title: string;
  instruction: string;
  expected_observation?: string | null;
  safety_warning?: string | null;
  is_critical: boolean;
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
  page: 'min-h-full bg-[#F5F8FC] text-[#173B5E]',
  panel: 'rounded-2xl border border-[#E2E8F0] bg-white shadow-sm',
  muted: 'text-[#536779]',
};

function explainError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isVerified(status?: string | null): boolean {
  return ['verified', 'approved', 'published'].includes((status || '').toLowerCase());
}

export function GuidedWorkflowsPage() {
  const [stage, setStage] = useState<Stage>(1);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machineError, setMachineError] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [run, setRun] = useState<ProcedureRun | null>(null);
  const [references, setReferences] = useState<ProcedureReference[]>([]);
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
        setMachines(result.items);
      })
      .catch((error: unknown) => {
        if (mounted) setMachineError(explainError(error));
      })
      .finally(() => {
        if (mounted) setMachinesLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const machineOptions = useMemo(() => getSupportedMachineOptions(machines), [machines]);
  const selectedMachineLabel = selectedMachine
    ? getSupportedMachineLabel(selectedMachine) || selectedMachine.name
    : 'Selected machine';

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
    <main className={`${theme.page} px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-[#1976C9]/20 bg-[#EFF4FF] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1976C9]">
              Expert workspace · Guided workflow
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#173B5E] sm:text-4xl">Guided Workflow</h1>
            <p className={`mt-2 max-w-2xl text-sm leading-6 ${theme.muted}`}>
              Follow the approved procedure checkpoints in sequence. Progress reflects recorded verification only.
            </p>
          </div>
          {stage > 1 && <button type="button" onClick={startOver} className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold text-[#1976C9] transition hover:bg-[#EFF4FF] sm:self-auto"><ArrowLeft size={16} /> Change machine</button>}
        </header>

        <nav aria-label="Guided workflow stages" className={`${theme.panel} p-4 sm:p-5`}>
          <ol className="grid grid-cols-3 gap-2 sm:gap-5">
            {stageItems.map((item, index) => {
              const complete = stage > item.number;
              const active = stage === item.number;
              return <li key={item.number} className="relative flex items-center gap-2 sm:gap-3">
                {index > 0 && <span aria-hidden="true" className={`absolute -left-2.5 top-4 hidden h-px w-4 sm:block ${complete || active ? 'bg-[#1976C9]' : 'bg-[#DCE6F0]'}`} />}
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold ${complete ? 'border-[#10B981] bg-[#ECFDF5] text-[#059669]' : active ? 'border-[#1976C9] bg-[#EFF4FF] text-[#1976C9]' : 'border-[#DCE6F0] bg-white text-[#8292A3]'}`}>
                  {complete ? <Check size={16} /> : item.number}
                </span>
                <span className={`text-[11px] font-semibold leading-tight sm:text-sm ${active ? 'text-[#173B5E]' : theme.muted}`}>{item.title}</span>
              </li>;
            })}
          </ol>
        </nav>

        {machineError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Could not load registered machines: {machineError}</div>}
        {missionError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{missionError}</div>}

        {stage === 1 && <section aria-labelledby="machine-heading" className="space-y-4">
          <div>
            <h2 id="machine-heading" className="text-xl font-bold text-[#173B5E]">Select the machine</h2>
            <p className={`mt-1 text-sm ${theme.muted}`}>Choose the registered equipment to load its approved procedure.</p>
          </div>
          {machinesLoading ? <div className={`${theme.panel} flex items-center gap-3 p-6 text-sm ${theme.muted}`}><LoaderCircle className="animate-spin text-[#1976C9]" size={20} />Loading registered machines…</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {machineOptions.map(({ label, machine }, index) => {
              return <button key={label} type="button" disabled={!machine || loadingMission} onClick={() => machine && void selectMachine(machine)} className={`${theme.panel} group min-h-44 p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#1976C9]/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55`}>
                <span className={`grid h-12 w-12 place-items-center rounded-xl ${index % 2 === 0 ? 'bg-[#EFF4FF] text-[#1976C9]' : 'bg-[#EAF8F4] text-[#15966A]'}`}><Wrench size={23} /></span>
                <span className="mt-5 block text-lg font-bold text-[#173B5E]">{label}</span>
                <span className={`mt-1 block text-xs ${theme.muted}`}>{machine ? machine.code : 'Not registered'}</span>
                {loadingMission && selectedMachine?.id === machine?.id && <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#1976C9]"><LoaderCircle size={14} className="animate-spin" />Loading procedure</span>}
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1976C9]">Open workflow <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
              </button>;
            })}
          </div>}
        </section>}

        {stage === 2 && <section aria-labelledby="mission-heading" className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-[#C8D6E4] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1976C9]">Stage 2 · Guided Mission</p>
              <h2 id="mission-heading" className="mt-1 text-xl font-bold text-[#173B5E]">{selectedMachineLabel}</h2>
              {procedure && <p className={`mt-1 text-sm ${theme.muted}`}>{procedure.title} · Approved version {procedure.version}</p>}
            </div>
            {procedure && <div className="min-w-44 sm:text-right">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#536779] sm:justify-end"><span>Step {stepCount ? activeIndex + 1 : 0} of {stepCount} · {completedCount} complete</span><span>{stepCount ? Math.round((completedCount / stepCount) * 100) : 0}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EAF0F6]"><div className="h-full rounded-full bg-[#1976C9] transition-all duration-500" style={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} /></div>
            </div>}
          </div>

          {loadingMission && <div className={`${theme.panel} flex items-center gap-3 p-8 text-sm ${theme.muted}`}><LoaderCircle className="animate-spin text-[#1976C9]" size={20} />Loading the approved machine procedure…</div>}
          {!loadingMission && !missionError && selectedMachine && !procedure && <div className={`${theme.panel} p-7 sm:p-9`}>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#EFF4FF] text-[#1976C9]"><ClipboardCheck size={24} /></div>
            <h3 className="mt-4 text-lg font-bold text-[#173B5E]">No approved procedure is available for {selectedMachineLabel}</h3>
            <p className={`mt-2 max-w-2xl text-sm leading-6 ${theme.muted}`}>Guided steps appear here after an expert creates and approves a procedure for this machine. This workflow does not create or invent operating instructions.</p>
            <Link to="/app/procedures/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3]"><FileText size={16} />Go to Create Procedure</Link>
          </div>}

          {!loadingMission && procedure && !run && <div className={`${theme.panel} p-6`}>
            <h3 className="font-bold text-[#173B5E]">The procedure run could not be opened</h3>
            <p className={`mt-1 text-sm ${theme.muted}`}>Retry to resume an existing run or start the approved procedure.</p>
            <button type="button" onClick={() => selectedMachine && void selectMachine(selectedMachine)} className="mt-4 rounded-lg bg-[#1976C9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125EA3]">Retry</button>
          </div>}

          {!loadingMission && procedure && run && currentStep && <>
            {procedure.safety_warnings?.trim() && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><div><p className="font-bold">Procedure safety alert</p><p className="mt-1 whitespace-pre-line leading-6">{procedure.safety_warnings}</p></div></div>}
            {(procedure.prerequisites || procedure.required_tools) && <div className={`${theme.panel} grid gap-4 p-4 sm:grid-cols-2`}>
              {procedure.prerequisites && <div><p className="text-xs font-bold uppercase tracking-wide text-[#536779]">Prerequisites</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#173B5E]">{procedure.prerequisites}</p></div>}
              {procedure.required_tools && <div><p className="text-xs font-bold uppercase tracking-wide text-[#536779]">Required tools</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#173B5E]">{procedure.required_tools}</p></div>}
            </div>}

            <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.6fr)]">
              <aside className={`${theme.panel} p-4 sm:p-5`}>
                <h3 className="text-sm font-bold text-[#173B5E]">Procedure checkpoints</h3>
                <ol className="mt-4 space-y-1">
                  {procedure.steps.map((step, index) => {
                    const done = Boolean(stepExecutions.get(step.id)?.is_completed);
                    const isCurrent = index === activeIndex;
                    const locked = index > furthestAvailableIndex;
                    const requiresVerification = Boolean(step.is_critical || step.expected_observation || step.safety_warning);
                    return <li key={step.id}>
                      <button type="button" disabled={locked || savingStep} onClick={() => moveToStep(index)} aria-current={isCurrent ? 'step' : undefined} className={`relative flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${isCurrent ? 'bg-[#EFF4FF] ring-1 ring-[#1976C9]/25' : locked ? 'cursor-not-allowed opacity-45' : 'hover:bg-[#F5F8FC]'}`}>
                        <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : isCurrent ? 'border-[#1976C9] bg-white text-[#1976C9]' : 'border-[#DCE6F0] bg-white text-[#8292A3]'}`}>{done ? <Check size={15} /> : step.step_order}</span>
                        <span className="min-w-0 flex-1"><span className="block text-xs font-semibold leading-5 text-[#173B5E]">{step.title}</span><span className={`mt-1 block text-[10px] font-medium uppercase tracking-wide ${done ? 'text-emerald-700' : isCurrent ? 'text-[#1976C9]' : 'text-[#8292A3]'}`}>{done ? 'Completed' : locked ? 'Not started' : isCurrent && requiresVerification ? 'Requires verification' : isCurrent ? 'In progress' : 'Ready'}</span></span>
                        {step.is_critical && <ShieldCheck size={15} className="mt-1 shrink-0 text-amber-600" aria-label="Critical verification" />}
                      </button>
                    </li>;
                  })}
                </ol>
                <p className="mt-4 border-t border-[#E8EEF5] pt-3 text-[11px] text-[#536779]">Future checkpoints become available after the current step is recorded complete.</p>
              </aside>

              <article className={`${theme.panel} overflow-hidden`}>
                <div className="border-b border-[#E8EEF5] bg-gradient-to-r from-white to-[#F5F9FF] p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[#BCD7F5] bg-[#EFF4FF] px-2.5 py-1 text-[11px] font-bold text-[#1976C9]">STEP {activeIndex + 1} OF {stepCount}</span>{currentStep.is_critical && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"><ShieldCheck size={13} />Critical verification</span>}</div>
                  <h3 className="mt-4 text-xl font-bold text-[#173B5E] sm:text-2xl">{currentStep.title}</h3>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#344B60]">{currentStep.instruction}</p>
                </div>
                <div className="space-y-4 p-5 sm:p-7">
                  {currentStep.safety_warning && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">Safety warning</p><p className="mt-1 whitespace-pre-line leading-6">{currentStep.safety_warning}</p></div></div>}
                  {currentStep.expected_observation && <div className="rounded-xl border border-[#C8D6E4] bg-[#F5F8FC] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#536779]">Expected observation</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#173B5E]">{currentStep.expected_observation}</p></div>}
                  {references.length > 0 && <div><h4 className="text-sm font-bold text-[#173B5E]">Verified media for this procedure</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{references.map((asset) => {
                    const url = getApiUrl(asset.url || `/media/${asset.id}`);
                    return <div key={asset.id} className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EFF4FF] text-[#1976C9]">{asset.kind === 'video' ? <Video size={17} /> : asset.kind === 'audio' ? <Volume2 size={17} /> : asset.kind === 'image' ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#173B5E]">{asset.title}</span><span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 size={12} />Verified reference</span></span>
                      {asset.kind === 'video' && <video aria-label={`${asset.title} preview`} controls className="max-h-16 max-w-24 rounded" crossOrigin="use-credentials"><source src={url} type={asset.mime || undefined} /></video>}
                      {asset.kind === 'audio' && <audio aria-label={`${asset.title} preview`} controls className="w-28" crossOrigin="use-credentials"><source src={url} type={asset.mime || undefined} /></audio>}
                      {asset.kind === 'image' && <a href={url} target="_blank" rel="noreferrer" aria-label={`Preview ${asset.title}`}><img src={url} alt={asset.title} crossOrigin="use-credentials" className="h-12 w-12 rounded-lg border border-[#E2E8F0] object-cover" /></a>}
                      {asset.kind === 'document' && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1976C9]">Open</a>}
                    </div>;
                  })}</div></div>}
                  {referenceNotice && <p className="text-xs text-[#536779]">{referenceNotice}</p>}

                  {currentStepComplete ? <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={19} className="mt-0.5 shrink-0" /><div><p className="font-bold">Checkpoint recorded complete</p>{currentExecution?.verified_at && <p className="mt-1 text-xs">Verified {new Date(currentExecution.verified_at).toLocaleString()}</p>}</div></div> : <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-[#FBFCFE] p-4">
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-[#344B60]"><input type="checkbox" checked={performed} onChange={(event) => setPerformed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#C8D6E4] accent-[#1976C9]" /><span>I performed this checkpoint according to the approved procedure.</span></label>
                    {needsStepVerification && <label className="flex cursor-pointer items-start gap-3 text-sm text-[#344B60]"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#C8D6E4] accent-[#1976C9]" /><span>I checked the expected observation and applicable safety conditions.</span></label>}
                    {needsSafetyAcknowledgement && <label className="flex cursor-pointer items-start gap-3 text-sm text-[#344B60]"><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#C8D6E4] accent-[#1976C9]" /><span>I reviewed the procedure-level safety alert before proceeding.</span></label>}
                    <label className="block text-xs font-semibold text-[#536779]">Operator observation <span className="font-normal">(optional)</span><textarea value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} maxLength={500} rows={2} placeholder="Record an observation for this checkpoint" className="mt-1.5 w-full resize-y rounded-lg border border-[#DCE6F0] bg-white px-3 py-2 text-sm font-normal text-[#173B5E] outline-none focus:border-[#1976C9] focus:ring-2 focus:ring-[#1976C9]/15" /></label>
                    <ButtonMarkComplete disabled={!canMarkComplete || savingStep} loading={savingStep} onClick={() => void markCurrentStepComplete()} />
                    {!canMarkComplete && <p className="text-xs text-[#536779]">Complete the required confirmation checks to record this checkpoint.</p>}
                  </div>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EEF5] pt-4">
                    <button type="button" disabled={activeIndex === 0 || savingStep} onClick={() => moveToStep(activeIndex - 1)} className="inline-flex items-center gap-2 rounded-lg border border-[#DCE6F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#173B5E] transition hover:bg-[#F5F8FC] disabled:opacity-40"><ArrowLeft size={16} />Previous Step</button>
                    {activeIndex < stepCount - 1 ? <button type="button" disabled={!currentStepComplete || savingStep} onClick={() => moveToStep(activeIndex + 1)} className="inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3] disabled:cursor-not-allowed disabled:opacity-45">Next Step<ArrowRight size={16} /></button> : <button type="button" disabled={!serverConfirmedComplete || savingStep} onClick={() => setStage(3)} className="inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3] disabled:cursor-not-allowed disabled:opacity-45">Review &amp; Complete<ArrowRight size={16} /></button>}
                  </div>
                </div>
              </article>
            </div>
          </>}
        </section>}

        {stage === 3 && procedure && run && selectedMachine && <section aria-labelledby="review-heading" className="mx-auto max-w-3xl space-y-5">
          <div className={`${theme.panel} overflow-hidden`}>
            <div className={`p-6 sm:p-9 ${serverConfirmedComplete ? 'bg-gradient-to-br from-emerald-50 to-white' : 'bg-gradient-to-br from-amber-50 to-white'}`}>
              <div className={`grid h-14 w-14 place-items-center rounded-2xl ${serverConfirmedComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{serverConfirmedComplete ? <CheckCircle2 size={30} /> : <AlertTriangle size={28} />}</div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#536779]">Stage 3 · Review &amp; Complete</p>
              <h2 id="review-heading" className="mt-2 text-2xl font-extrabold text-[#173B5E]">{serverConfirmedComplete ? 'Procedure complete' : 'Completion needs confirmation'}</h2>
              <p className={`mt-2 text-sm leading-6 ${theme.muted}`}>{serverConfirmedComplete ? 'The backend has recorded every checkpoint as complete.' : 'The procedure is not marked complete by the server. Review the remaining checks before finishing.'}</p>
            </div>
            <div className="space-y-5 p-6 sm:p-9">
              <dl className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-[#F5F8FC] p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Machine</dt><dd className="mt-1 font-bold text-[#173B5E]">{selectedMachineLabel}</dd></div><div className="rounded-xl bg-[#F5F8FC] p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Approved procedure</dt><dd className="mt-1 font-bold text-[#173B5E]">{procedure.title} · v{procedure.version}</dd></div></dl>
              <div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#173B5E]">Recorded checkpoints</span><span className="font-bold text-[#173B5E]">{completedCount} / {stepCount}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EAF0F6]"><div className={`h-full rounded-full transition-all ${serverConfirmedComplete ? 'bg-[#10B981]' : 'bg-[#1976C9]'}`} style={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} /></div></div>
              <ul className="space-y-2">{procedure.steps.map((step) => { const done = Boolean(stepExecutions.get(step.id)?.is_completed); return <li key={step.id} className="flex items-start gap-3 rounded-lg border border-[#E8EEF5] p-3 text-sm"><span className={done ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-amber-600'}>{done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><span className="flex-1 text-[#344B60]">{step.step_order}. {step.title}</span><span className={`text-[11px] font-bold uppercase ${done ? 'text-emerald-700' : 'text-amber-700'}`}>{done ? 'Completed' : 'Remaining'}</span></li>; })}</ul>
              <div className="flex flex-wrap justify-end gap-3 border-t border-[#E8EEF5] pt-5"><button type="button" onClick={() => setStage(2)} className="rounded-lg border border-[#DCE6F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#173B5E] transition hover:bg-[#F5F8FC]">Return to procedure</button><button type="button" onClick={startOver} disabled={!serverConfirmedComplete} className="rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3] disabled:cursor-not-allowed disabled:opacity-45">Finish workflow</button></div>
            </div>
          </div>
        </section>}
      </div>
    </main>
  );
}

function ButtonMarkComplete({ disabled, loading, onClick }: { disabled: boolean; loading: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-[#1976C9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#125EA3] disabled:cursor-not-allowed disabled:opacity-45">
    {loading ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{loading ? 'Saving checkpoint…' : 'Mark Complete'}
  </button>;
}
