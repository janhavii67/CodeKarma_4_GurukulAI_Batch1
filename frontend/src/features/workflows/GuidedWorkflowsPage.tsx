import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  LayoutGrid,
  ListOrdered,
  LoaderCircle,
  LockKeyhole,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wrench,
} from 'lucide-react';
import { api } from '../../lib/api/client';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import type { Machine } from '../knowledge-capture/types';
import { MACHINE_DIARY_MACHINE_LABELS } from '../knowledge/machineDiaryApi';
import { useAuth } from '../../hooks/useAuth';
import { LearningRoad, LearningRoadSkeleton, type RoadItem } from './LearningRoad';
import { StepViewerBody } from './StepViewer';
import { WorkflowPicker, type WorkflowDetailsInput } from './WorkflowPicker';
import { requiresVerification, stepAssetIds, stepChecklist, stepContentKinds } from './stepContent';
import type { Procedure, ProcedureReference, ProcedureRun, ReferenceLoadState, RunStep } from './types';

type Stage = 1 | 2 | 3 | 4;
type MobileView = 'path' | 'step';

const theme = {
  page: 'bg-[#F5F8FC] text-[#17324D]',
  panel: 'rounded-[1.4rem] border border-[#DCE6F0] bg-white shadow-[0_10px_28px_-22px_rgba(23,50,77,0.34)]',
  muted: 'text-[#536779]',
};

function explainError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export function GuidedWorkflowsPage() {
  const { hasPermission, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReducedMotion = Boolean(useReducedMotion());
  const canManage = hasPermission('procedure.create');
  const [stage, setStage] = useState<Stage>(1);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machineError, setMachineError] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [workflows, setWorkflows] = useState<Procedure[]>([]);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [archivedWorkflows, setArchivedWorkflows] = useState<Procedure[]>([]);
  const [myRuns, setMyRuns] = useState<ProcedureRun[]>([]);
  const [managementNotice, setManagementNotice] = useState('');
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null);
  const [openingWorkflowId, setOpeningWorkflowId] = useState<string | null>(null);
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [run, setRun] = useState<ProcedureRun | null>(null);
  const [references, setReferences] = useState<ProcedureReference[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceLoadState>('idle');
  const [referenceError, setReferenceError] = useState('');
  const [failedReferenceIds, setFailedReferenceIds] = useState<Set<string>>(() => new Set());
  const [loadingMission, setLoadingMission] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [missionError, setMissionError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileView, setMobileView] = useState<MobileView>('path');
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [performed, setPerformed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [operatorNotes, setOperatorNotes] = useState('');
  const [checklistState, setChecklistState] = useState<Record<string, boolean[]>>({});
  const [celebrateStepId, setCelebrateStepId] = useState<string | null>(null);
  const roadScrollRef = useRef<HTMLDivElement>(null);
  const stepViewerRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!celebrateStepId) return undefined;
    const timer = window.setTimeout(() => setCelebrateStepId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [celebrateStepId]);

  const stepExecutions = useMemo(() => {
    const byStepId = new Map<string, RunStep>();
    run?.step_executions.forEach((execution) => byStepId.set(execution.step_id, execution));
    return byStepId;
  }, [run]);

  const referencesById = useMemo(() => new Map(references.map((asset) => [asset.id, asset])), [references]);
  const stepAttachedIds = useMemo(() => new Set(procedure?.steps.flatMap(stepAssetIds) ?? []), [procedure]);
  const procedureReferences = references.filter((asset) => !stepAttachedIds.has(asset.id));
  const referencesForStep = useCallback((stepIndex: number) => {
    const step = procedure?.steps[stepIndex];
    if (!step) return [];
    return stepAssetIds(step).map((id) => referencesById.get(id)).filter((asset): asset is ProcedureReference => Boolean(asset));
  }, [procedure, referencesById]);

  const completedCount = procedure?.steps.filter((step) => stepExecutions.get(step.id)?.is_completed).length || 0;
  const stepCount = procedure?.steps.length || 0;
  const allStepsCompleted = stepCount > 0 && completedCount === stepCount;
  const serverConfirmedComplete = run?.status === 'COMPLETED' && allStepsCompleted && Boolean(run.completed_at);
  const firstIncompleteIndex = procedure?.steps.findIndex((step) => !stepExecutions.get(step.id)?.is_completed) ?? -1;
  const furthestAvailableIndex = firstIncompleteIndex === -1 ? Math.max(0, stepCount - 1) : firstIncompleteIndex;
  const percentComplete = stepCount ? Math.round((completedCount / stepCount) * 100) : 0;
  const currentStep = procedure?.steps[activeIndex];
  const currentExecution = currentStep ? stepExecutions.get(currentStep.id) : undefined;
  const needsStepVerification = Boolean(currentStep && requiresVerification(currentStep));
  const needsSafetyAcknowledgement = Boolean(procedure?.safety_warnings?.trim());
  const currentStepComplete = Boolean(currentExecution?.is_completed);
  const currentChecklist = currentStep ? stepChecklist(currentStep) : [];
  const currentChecklistState = currentStep ? checklistState[currentStep.id] ?? [] : [];
  const checklistComplete = currentChecklist.every((_, index) => currentChecklistState[index]);
  const canMarkComplete = performed && (!needsStepVerification || verified) && (!needsSafetyAcknowledgement || safetyAcknowledged) && checklistComplete;
  const currentStepReferences = referencesForStep(activeIndex);
  const missingAttachmentCount = currentStep && referenceState === 'loaded' ? stepAssetIds(currentStep).length - currentStepReferences.length : 0;

  const roadItems: RoadItem[] = (procedure?.steps ?? []).map((step, index) => {
    const done = Boolean(stepExecutions.get(step.id)?.is_completed);
    const locked = index > furthestAvailableIndex;
    const isCurrent = index === activeIndex;
    const status = done ? 'Completed' : locked ? 'Locked' : isCurrent && requiresVerification(step) ? 'Current · verification required' : isCurrent ? 'Current' : 'Available';
    return { step, done, locked, status, kinds: stepContentKinds(step, referencesForStep(index)) };
  });

  // Keep the selected node in view inside the desktop road panel, which scrolls on its own.
  useEffect(() => {
    const container = roadScrollRef.current;
    if (!container || container.scrollHeight <= container.clientHeight || typeof container.scrollBy !== 'function') return;
    const node = container.querySelector<HTMLElement>(`[data-step-node="${activeIndex}"]`);
    if (!node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    container.scrollBy({ top: nodeRect.top - containerRect.top - containerRect.height / 2, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [activeIndex, procedure, prefersReducedMotion]);

  const resetStepChecks = useCallback(() => {
    setPerformed(false);
    setVerified(false);
    setOperatorNotes('');
  }, []);

  const resetMission = () => {
    setProcedure(null);
    setRun(null);
    setReferences([]);
    setReferenceState('idle');
    setReferenceError('');
    setFailedReferenceIds(new Set());
    setMissionError('');
    setActiveIndex(0);
    setMobileView('path');
    setNavigatorOpen(false);
    setChecklistState({});
    setSafetyAcknowledged(false);
    resetStepChecks();
  };

  const loadReferences = async (workflow: Procedure, machine: Machine) => {
    setReferenceState('loading');
    setReferenceError('');
    try {
      const assets = await api.get<ProcedureReference[]>(`/procedures/${workflow.id}/assets`);
      // The API already enforces access; unverified items are shown with a status badge rather than hidden.
      setReferences(assets.filter((asset) => !asset.machine_id || asset.machine_id === machine.id));
      setFailedReferenceIds(new Set());
      setReferenceState('loaded');
    } catch (error) {
      setReferences([]);
      setReferenceError(explainError(error));
      setReferenceState('error');
    }
  };

  const loadWorkflowLists = async (machine: Machine) => {
    const [procedures, runs] = await Promise.all([
      api.get<Procedure[]>(`/procedures?machine_id=${encodeURIComponent(machine.id)}`),
      api.get<ProcedureRun[]>('/procedures/runs/my/all'),
    ]);
    const published = procedures
      .filter((item) => item.status === 'APPROVED' && item.machine_id === machine.id && item.steps?.length)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setWorkflows(published);
    setMyRuns(runs);
    setWorkflowsLoaded(true);
    if (canManage) {
      try {
        const mine = await api.get<Procedure[]>(`/procedures/mine/all?machine_id=${encodeURIComponent(machine.id)}`);
        setArchivedWorkflows(mine.filter((item) => item.status === 'ARCHIVED'));
      } catch (error) {
        setManagementNotice(`Your archived workflows could not be loaded: ${explainError(error)}`);
      }
    }
    return { published, runs };
  };

  const openWorkflow = async (workflow: Procedure, machine: Machine, runs: ProcedureRun[]) => {
    resetMission();
    setOpeningWorkflowId(workflow.id);
    setProcedure(workflow);
    setStage(3);
    setLoadingMission(true);
    try {
      const existingRun = runs.find((item) => item.procedure_id === workflow.id && item.status === 'IN_PROGRESS');
      const activeRun = existingRun || await api.post<ProcedureRun>(`/procedures/${workflow.id}/start`, {});
      setRun(activeRun);
      const incomplete = workflow.steps.findIndex((step) => !activeRun.step_executions.find((execution) => execution.step_id === step.id)?.is_completed);
      setActiveIndex(incomplete < 0 ? Math.max(0, workflow.steps.length - 1) : incomplete);
      await loadReferences(workflow, machine);
    } catch (error) {
      setMissionError(explainError(error));
    } finally {
      setLoadingMission(false);
      setOpeningWorkflowId(null);
    }
  };

  const selectMachine = async (machine: Machine) => {
    setSelectedMachine(machine);
    setStage(2);
    resetMission();
    setWorkflows([]);
    setWorkflowsLoaded(false);
    setArchivedWorkflows([]);
    setManagementNotice('');
    setLoadingWorkflows(true);
    try {
      const { published, runs } = await loadWorkflowLists(machine);
      // A single workflow opens directly; with several, the trainee chooses on the selection screen.
      if (published.length === 1) await openWorkflow(published[0], machine, runs);
    } catch (error) {
      setMissionError(explainError(error));
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const showWorkflowList = async () => {
    if (!selectedMachine) return;
    resetMission();
    setStage(2);
    setLoadingWorkflows(true);
    try {
      await loadWorkflowLists(selectedMachine);
    } catch (error) {
      setMissionError(explainError(error));
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const manage = async (workflow: Procedure, action: () => Promise<unknown>, success: string) => {
    if (!selectedMachine) return false;
    setBusyWorkflowId(workflow.id);
    setManagementNotice('');
    try {
      await action();
      await loadWorkflowLists(selectedMachine);
      setManagementNotice(success);
      return true;
    } catch (error) {
      setManagementNotice(explainError(error));
      return false;
    } finally {
      setBusyWorkflowId(null);
    }
  };

  const isOwner = (workflow: Procedure) => canManage && Boolean(user && (workflow.author_id === user.id || user.role_id === 'ADMIN'));
  const saveDetails = (workflow: Procedure, details: WorkflowDetailsInput) => manage(workflow,
    () => api.patch(`/procedures/${workflow.id}`, { title: details.title.trim(), description: details.description.trim(), operation: details.operation.trim() }),
    `Saved details for “${details.title.trim()}”.`);

  const moveToStep = (index: number) => {
    if (!procedure || index < 0 || index >= procedure.steps.length || index > furthestAvailableIndex) return false;
    setActiveIndex(index);
    resetStepChecks();
    return true;
  };

  const openStep = (index: number) => {
    if (!moveToStep(index)) return;
    setMobileView('step');
    window.requestAnimationFrame(() => {
      const viewer = stepViewerRef.current;
      if (!viewer || typeof viewer.scrollIntoView !== 'function') return;
      const top = viewer.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) viewer.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const toggleChecklistItem = (index: number) => {
    if (!currentStep) return;
    setChecklistState((current) => {
      const next = [...(current[currentStep.id] ?? [])];
      next[index] = !next[index];
      return { ...current, [currentStep.id]: next };
    });
  };

  const markCurrentStepComplete = async () => {
    if (!procedure || !run || !currentStep || !canMarkComplete || currentStepComplete) return;
    setSavingStep(true);
    setMissionError('');
    try {
      // The backend records completion only for the run's current step, so sync it first.
      let activeRun = run;
      if (typeof activeRun.current_step_order === 'number' && activeRun.current_step_order !== currentStep.step_order) {
        activeRun = await api.patch<ProcedureRun>(`/procedures/runs/${run.id}/current-step`, { step_order: currentStep.step_order });
        setRun(activeRun);
      }
      const updated = await api.post<ProcedureRun>(
        `/procedures/runs/${activeRun.id}/step/${currentStep.id}`,
        { is_completed: true, operator_notes: operatorNotes.trim() || undefined },
      );
      setRun(updated);
      resetStepChecks();
      if (updated.step_executions.find((execution) => execution.step_id === currentStep.id)?.is_completed) setCelebrateStepId(currentStep.id);
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

  // The AI Tutor starts or resumes a run and links here with ?run_id=; open that exact workflow.
  const linkedRunId = searchParams.get('run_id');
  useEffect(() => {
    if (!linkedRunId || machinesLoading) return undefined;
    let active = true;
    void (async () => {
      try {
        const linked = await api.get<ProcedureRun & { workflow?: Procedure | null }>(`/procedures/runs/${encodeURIComponent(linkedRunId)}`);
        const workflow = linked.workflow;
        if (!workflow || !workflow.machine_id) throw new Error('This workflow session is no longer available. Choose a machine to continue.');
        if (!active) return;
        const machine = machines.find((item) => item.id === workflow.machine_id)
          ?? ({ id: workflow.machine_id, name: workflow.machine_name || 'Machine', code: '' } as Machine);
        setSelectedMachine(machine);
        await openWorkflow(workflow, machine, [linked]);
        loadWorkflowLists(machine).catch(() => undefined);
      } catch (error) {
        if (active) setMissionError(explainError(error));
      } finally {
        if (active) setSearchParams((params) => { const next = new URLSearchParams(params); next.delete('run_id'); return next; }, { replace: true });
      }
    })();
    return () => { active = false; };
    // Runs once per linked run after the machine list is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRunId, machinesLoading]);

  const startOver = () => {
    setStage(1);
    setSelectedMachine(null);
    setWorkflows([]);
    setWorkflowsLoaded(false);
    setArchivedWorkflows([]);
    setManagementNotice('');
    resetMission();
  };

  const stageItems = [
    { number: 1, title: 'Select Machine' },
    { number: 2, title: 'Choose Workflow' },
    { number: 3, title: 'Guided Mission' },
    { number: 4, title: 'Review & Complete' },
  ] as const;

  const continueLabel = serverConfirmedComplete ? 'Review completion' : completedCount === 0 ? 'Start learning' : `Continue · Step ${furthestAvailableIndex + 1}`;
  const showSwitchWorkflow = workflows.length > 1 || canManage;

  return (
    <main className={`${theme.page} min-h-[100dvh] px-4 py-6 sm:px-6 lg:px-10`}>
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
        <header className="grid gap-5 overflow-hidden rounded-3xl border border-[#173B5E] bg-gradient-to-br from-[#0b2545] via-[#123a66] to-[#1d4f8f] px-6 py-6 text-white shadow-[0_12px_30px_rgba(10,37,69,0.16)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-8 sm:py-7">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D6E6FF]">
              <Sparkles size={13} aria-hidden="true" /> Your learning path
            </span>
            <h1 className="mt-4 text-[clamp(2rem,3.2vw,2.75rem)] font-extrabold leading-[1.08] tracking-[-0.04em] text-white">Learn one checkpoint at a time.</h1>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[#D0DEEF]">
              Follow the approved procedure in order. Your progress is saved from verified checkpoints, and completed steps stay available to revisit.
            </p>
          </div>
          {stage > 1 && <button type="button" onClick={startOver} className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 active:translate-y-px motion-reduce:transition-none sm:justify-self-end"><ArrowLeft size={16} /> Change machine</button>}
        </header>

        <nav aria-label="Guided workflow stages" className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:gap-3">
          {stageItems.map((item, index) => {
            const complete = stage > item.number;
            const active = stage === item.number;
            return <div key={item.number} className="flex items-center gap-2 sm:gap-3">
              {index > 0 && <span aria-hidden="true" className={`h-px w-5 sm:w-8 ${complete || active ? 'bg-[#2478F5]' : 'bg-[#CBD5E1]'}`} />}
              <span aria-current={active ? 'step' : undefined} className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 ${active ? 'bg-[#2478F5] text-white' : complete ? 'bg-[#E7F0FF] text-[#2478F5]' : 'bg-white text-[#708196] ring-1 ring-[#DCE6F0]'}`}>
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
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2478F5]">Start here</p>
              <h2 id="machine-heading" className="mt-1 text-2xl font-bold tracking-tight text-[#17324D]">Choose your machine</h2>
              <p className="mt-1 text-sm text-[#536779]">We’ll list its approved workflows and your saved progress.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#536779] ring-1 ring-[#DCE6F0]">{MACHINE_DIARY_MACHINE_LABELS.length} registered machine types</span>
          </div>
          {machinesLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading machine choices" aria-busy="true">{MACHINE_DIARY_MACHINE_LABELS.map((label: string) => <div key={label} className={`${theme.panel} min-h-48 animate-pulse p-5 motion-reduce:animate-none`}><div className="h-12 w-12 rounded-2xl bg-[#E8EEF3]" /><div className="mt-6 h-5 w-2/3 rounded bg-[#E8EEF3]" /><div className="mt-3 h-3 w-1/2 rounded bg-[#F0F3F6]" /></div>)}</div> : machines.length === 0 ? <div className={`${theme.panel} p-7 sm:p-9`}><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EEF3F6] text-[#536779]"><Wrench size={22} /></div><h3 className="mt-4 text-lg font-bold text-[#17324D]">No supported machines are registered yet</h3><p className="mt-2 max-w-[58ch] text-sm leading-6 text-[#536779]">A learning path appears after a supported machine and its approved procedure are available.</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {MACHINE_DIARY_MACHINE_LABELS.map((label: string, index: number) => {
              const machine = machines.find((item) => item.name === label);
              return <button key={label} type="button" disabled={!machine || loadingWorkflows} onClick={() => machine && void selectMachine(machine)} className={`${theme.panel} group relative min-h-48 overflow-hidden p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#2478F5]/50 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none`}>
                <span className="absolute right-4 top-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#A0ADBA]">0{index + 1}</span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8F1FF] text-[#2478F5] transition-transform group-hover:scale-[1.04] motion-reduce:transform-none"><Wrench size={22} /></span>
                <span className="mt-5 block text-lg font-bold tracking-tight text-[#17324D]">{label}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-[#708196]">{machine ? machine.code : 'Not registered'}</span>
                <span className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#2478F5] px-4 text-xs font-bold text-white transition group-hover:bg-[#1768DF] active:translate-y-px motion-reduce:transition-none">
                  {loadingWorkflows && selectedMachine?.id === machine?.id ? 'Loading workflows…' : 'Open workflows'} <ArrowRight size={14} />
                </span>
              </button>;
            })}
          </div>}
        </section>}

        {stage === 2 && selectedMachine && (loadingWorkflows || workflowsLoaded) && <WorkflowPicker
          machine={selectedMachine}
          workflows={workflows}
          archived={archivedWorkflows}
          runs={myRuns}
          loading={loadingWorkflows && !workflowsLoaded}
          openingId={openingWorkflowId}
          busyId={busyWorkflowId}
          canCreate={canManage}
          managementNotice={managementNotice}
          reducedMotion={prefersReducedMotion}
          isOwner={isOwner}
          onOpen={(workflow) => void openWorkflow(workflow, selectedMachine, myRuns)}
          onSaveDetails={saveDetails}
          onDuplicate={(workflow) => void manage(workflow, () => api.post(`/procedures/${workflow.id}/duplicate`, {}), `Duplicated “${workflow.title}”. The copy is published for trainees.`)}
          onArchive={(workflow) => void manage(workflow, () => api.post(`/procedures/${workflow.id}/archive`, {}), `Archived “${workflow.title}”. Trainees no longer see it.`)}
          onRestore={(workflow) => void manage(workflow, () => api.post(`/procedures/${workflow.id}/restore`, {}), `Restored “${workflow.title}”.`)}
        />}

        {stage === 3 && procedure && <section aria-labelledby="mission-heading" className="space-y-5">
          <div className="relative overflow-hidden rounded-[1.8rem] border border-[#DCE6F0] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,50,77,0.4)] sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#E8F1FF]" />
            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.5fr)] lg:items-center">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2478F5]">Guided workflow · {selectedMachine?.name || 'Registered machine'} <span className="font-mono normal-case tracking-normal text-[#708196]">{selectedMachine?.code}</span></p>
                <h2 id="mission-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-[#17324D] sm:text-3xl">{procedure.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F8FA] px-2.5 py-1 text-[11px] font-semibold text-[#344B60]"><ShieldCheck size={13} className="text-[#2478F5]" />Approved version {procedure.version}</span>
                  {procedure.operation?.trim() && <span className="rounded-full bg-[#E8F1FF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2478F5]">{procedure.operation}</span>}
                  {showSwitchWorkflow && <button type="button" onClick={() => void showWorkflowList()} disabled={savingStep} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#DCE6F0] bg-white px-3 text-[11px] font-bold text-[#17324D] transition hover:bg-[#F4F8FA] disabled:opacity-50 motion-reduce:transition-none"><LayoutGrid size={13} />All workflows</button>}
                </div>
                <p className="mt-3 max-w-[62ch] whitespace-pre-line text-sm leading-6 text-[#536779]">{procedure.description}</p>
              </div>
              {run ? <div className="rounded-2xl bg-[#17324D] p-5 text-white">
                <div className="flex items-end justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#AFCBFF]">Your progress</p><p className="mt-1 text-sm font-semibold">{serverConfirmedComplete ? `All ${stepCount} steps complete` : `Step ${furthestAvailableIndex + 1} of ${stepCount}`}</p></div>
                  <motion.span key={percentComplete} initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-3xl font-bold tracking-tight">{percentComplete}%</motion.span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Procedure progress" aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={completedCount}><motion.div initial={false} animate={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 100, damping: 20 }} className="h-full rounded-full bg-[#4C8DFF]" /></div>
                <p className="mt-2 text-[11px] text-[#B8C7D6]">{completedCount} of {stepCount} checkpoints recorded{serverConfirmedComplete ? '' : ' · future steps unlock in order'}</p>
                <button type="button" disabled={savingStep} onClick={() => serverConfirmedComplete ? setStage(4) : openStep(furthestAvailableIndex)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-[#17324D] transition hover:bg-[#E8F1FF] active:translate-y-px disabled:opacity-50 motion-reduce:transition-none">
                  {serverConfirmedComplete ? <Trophy size={16} /> : <ArrowRight size={16} />}{continueLabel}
                </button>
              </div> : loadingMission ? <div className="h-44 animate-pulse rounded-2xl bg-[#17324D]/90 motion-reduce:animate-none" /> : null}
            </div>
          </div>

          {loadingMission && <div className="grid gap-5 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]" aria-label="Loading approved procedure" aria-busy="true">
            <div className="rounded-[1.8rem] bg-[#17324D] p-5"><LearningRoadSkeleton /></div>
            <div className={`${theme.panel} space-y-4 p-5 sm:p-7`}><div className="h-8 w-1/3 animate-pulse rounded bg-[#E8EEF3] motion-reduce:animate-none" /><div className="h-36 animate-pulse rounded-2xl bg-[#F0F3F6] motion-reduce:animate-none" /><div className="h-20 animate-pulse rounded-2xl bg-[#F0F3F6] motion-reduce:animate-none" /></div>
          </div>}

          {!loadingMission && !run && <div className={`${theme.panel} p-6`}>
            <h3 className="font-bold text-[#173B5E]">The procedure run could not be opened</h3>
            <p className={`mt-1 text-sm ${theme.muted}`}>Retry to resume an existing run or start the approved procedure.</p>
            <button type="button" onClick={() => selectedMachine && void openWorkflow(procedure, selectedMachine, myRuns)} className="mt-4 rounded-lg bg-[#1976C9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125EA3]">Retry</button>
          </div>}

          {!loadingMission && run && currentStep && <>
            {(procedure.safety_warnings?.trim() || procedure.prerequisites || procedure.required_tools || procedure.operating_conditions) && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {procedure.safety_warnings?.trim() && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:col-span-2 xl:col-span-1"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><div><p className="font-bold">Procedure safety alert</p><p className="mt-1 whitespace-pre-line leading-6">{procedure.safety_warnings}</p></div></div>}
              {procedure.prerequisites && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Before you start</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.prerequisites}</p></div>}
              {procedure.required_tools && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Required tools</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.required_tools}</p></div>}
              {procedure.operating_conditions && <div className={`${theme.panel} p-4`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Operating conditions</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{procedure.operating_conditions}</p></div>}
            </div>}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
              <section aria-labelledby="path-heading" className={`overflow-hidden rounded-[1.8rem] bg-[#17324D] shadow-[0_24px_50px_-30px_rgba(23,50,77,0.8)] lg:sticky lg:top-4 ${mobileView === 'step' ? 'hidden lg:block' : ''}`}>
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#AFCBFF]">Your checkpoints</p><h3 id="path-heading" className="mt-1 text-lg font-bold tracking-tight text-white">Learning path</h3></div>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-[#CFE0EC]">{completedCount}/{stepCount} done</span>
                </div>
                <div ref={roadScrollRef} className="px-3 pb-2 pt-4 sm:px-5 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:overscroll-contain">
                  <LearningRoad
                    items={roadItems}
                    activeIndex={activeIndex}
                    nextIndex={furthestAvailableIndex}
                    completedCount={completedCount}
                    complete={serverConfirmedComplete}
                    disabled={savingStep}
                    reducedMotion={prefersReducedMotion}
                    celebrateStepId={celebrateStepId}
                    onSelect={openStep}
                  />
                </div>
                <p className="border-t border-white/10 px-5 py-3 text-[11px] leading-5 text-[#9AAEC2] sm:px-6">Completed checkpoints stay open for review. Later steps unlock only after this procedure records the current checkpoint complete.</p>
              </section>

              <article ref={stepViewerRef} aria-labelledby="step-heading" className={`${theme.panel} scroll-mt-4 overflow-hidden ${mobileView === 'path' ? 'hidden lg:block' : ''}`}>
                <div className="border-b border-[#E7EDF1] bg-gradient-to-br from-[#F8FAFB] to-[#EEF5F7] p-5 sm:p-7">
                  <button type="button" onClick={() => setMobileView('path')} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-3.5 text-xs font-bold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none lg:hidden"><MapIcon size={14} />Back to learning path</button>
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#2478F5] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">STEP {activeIndex + 1} OF {stepCount}</span>{currentStep.is_critical && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-900"><ShieldCheck size={13} />Critical checkpoint</span>}{currentStepComplete && <span className="inline-flex items-center gap-1 rounded-full border border-[#C8D9F0] bg-white px-3 py-1 text-[10px] font-bold text-[#2478F5]"><CheckCircle2 size={13} />Saved</span>}</div>
                  <h3 id="step-heading" className="mt-4 text-2xl font-bold tracking-tight text-[#17324D] sm:text-3xl">{currentStep.title}</h3>
                  <div aria-hidden="true" className="mt-5 flex gap-1.5">
                    {roadItems.map((item, index) => <span key={item.step.id} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${index === activeIndex ? 'bg-[#17324D]' : item.done ? 'bg-[#4C8DFF]' : item.locked ? 'bg-[#DCE6F0]' : 'bg-[#ADC8EE]'}`} />)}
                  </div>
                  <button type="button" aria-expanded={navigatorOpen} aria-controls="step-navigator" onClick={() => setNavigatorOpen((open) => !open)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-3.5 text-xs font-bold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none">
                    <ListOrdered size={14} />All steps ({stepCount})<ChevronDown size={14} className={`transition-transform duration-200 motion-reduce:transition-none ${navigatorOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {navigatorOpen && <motion.ol id="step-navigator" aria-label="Step navigator" initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-[#DCE6F0] bg-white p-2">
                      {roadItems.map((item, index) => <li key={item.step.id}>
                        <button type="button" disabled={item.locked || savingStep} onClick={() => { setNavigatorOpen(false); openStep(index); }} aria-current={index === activeIndex ? 'step' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition motion-reduce:transition-none disabled:cursor-not-allowed ${index === activeIndex ? 'bg-[#E8F1FF] font-bold text-[#17324D]' : item.locked ? 'text-[#8292A0]' : 'text-[#344B60] hover:bg-[#F4F8FA]'}`}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${item.done ? 'bg-[#4C8DFF] text-white' : item.locked ? 'bg-[#EEF2F5] text-[#8292A0]' : 'bg-[#2478F5] text-white'}`}>{item.done ? <Check size={14} /> : item.locked ? <LockKeyhole size={12} /> : item.step.step_order}</span>
                          <span className="min-w-0 flex-1 truncate">{item.step.title}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#708196]">{item.done ? 'Done' : item.locked ? 'Locked' : 'Open'}</span>
                        </button>
                      </li>)}
                    </motion.ol>}
                  </AnimatePresence>
                </div>
                <motion.div key={currentStep.id} initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }} className="space-y-6 p-5 sm:p-7">
                  <StepViewerBody
                    step={currentStep}
                    stepReferences={currentStepReferences}
                    missingAttachmentCount={missingAttachmentCount}
                    procedureReferences={procedureReferences}
                    referenceState={referenceState}
                    referenceError={referenceError}
                    onRetryReferences={() => selectedMachine && void loadReferences(procedure, selectedMachine)}
                    failedReferenceIds={failedReferenceIds}
                    onMediaError={(assetId) => setFailedReferenceIds((current) => new Set(current).add(assetId))}
                    onRetryMedia={(assetId) => setFailedReferenceIds((current) => { const next = new Set(current); next.delete(assetId); return next; })}
                    checklistChecked={currentChecklistState}
                    checklistReadOnly={currentStepComplete}
                    onToggleCheck={toggleChecklistItem}
                    reducedMotion={prefersReducedMotion}
                  />
                  {referenceState === 'error' && stepAssetIds(currentStep).length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                    <p><span className="font-bold">Shared procedure materials could not be loaded.</span> {referenceError}</p>
                    <button type="button" onClick={() => selectedMachine && void loadReferences(procedure, selectedMachine)} className="min-h-9 rounded-full border border-rose-200 bg-white px-3 font-bold">Retry</button>
                  </div>}

                  {currentStepComplete ? <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="flex items-start gap-3 rounded-2xl border border-[#C6DAFF] bg-[#EFF6FF] p-4 text-sm text-[#17324D]"><CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#1768DF]" /><div><p className="font-bold">Checkpoint saved</p>{currentExecution?.verified_at && <p className="mt-1 text-xs text-[#536779]">Recorded {new Date(currentExecution.verified_at).toLocaleString()}</p>}<p className="mt-1 text-xs text-[#536779]">You can revisit this completed step without changing your progress.</p></div></motion.div> : <div className="space-y-4 rounded-2xl border border-[#DCE6F0] bg-[#FAFBFC] p-4 sm:p-5">
                    <div><p className="text-sm font-bold text-[#17324D]">Record this checkpoint</p><p className="mt-1 text-xs leading-5 text-[#536779]">Your confirmation is saved to this procedure run.</p></div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={performed} onChange={(event) => setPerformed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#2478F5]" /><span>I performed this checkpoint according to the approved procedure.</span></label>
                    {needsStepVerification && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#2478F5]" /><span>I checked the expected observation and applicable safety conditions.</span></label>}
                    {needsSafetyAcknowledgement && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#344B60]"><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#C8D6E4] accent-[#2478F5]" /><span>I reviewed the procedure-level safety alert before proceeding.</span></label>}
                    <label className="block text-xs font-semibold text-[#536779]">Operator observation <span className="font-normal">(optional)</span><textarea value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} maxLength={500} rows={3} placeholder="Record an observation for this checkpoint" className="mt-1.5 w-full resize-y rounded-xl border border-[#DCE6F0] bg-white px-3.5 py-3 text-sm font-normal text-[#17324D] outline-none focus:border-[#2478F5] focus:ring-2 focus:ring-[#2478F5]/15" /></label>
                    <ButtonMarkComplete disabled={!canMarkComplete || savingStep} loading={savingStep} onClick={() => void markCurrentStepComplete()} />
                    {!canMarkComplete && <p className="text-xs text-[#536779]">{checklistComplete ? 'Complete the confirmation checks shown for this approved step before saving it.' : 'Tick every item in this step’s checklist, then complete the confirmation checks before saving it.'}</p>}
                  </div>}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8EEF5] pt-4">
                    <button type="button" disabled={activeIndex === 0 || savingStep} onClick={() => openStep(activeIndex - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-4 text-sm font-semibold text-[#17324D] transition hover:bg-[#F4F8FA] disabled:opacity-40 motion-reduce:transition-none"><ArrowLeft size={16} />Previous</button>
                    {activeIndex < stepCount - 1 ? <button type="button" disabled={!currentStepComplete || savingStep} onClick={() => openStep(activeIndex + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2478F5] px-5 text-sm font-bold text-white transition hover:bg-[#1768DF] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Continue to next step<ArrowRight size={16} /></button> : <button type="button" disabled={!serverConfirmedComplete || savingStep} onClick={() => setStage(4)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2478F5] px-5 text-sm font-bold text-white transition hover:bg-[#1768DF] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Review completed path<ArrowRight size={16} /></button>}
                  </div>
                </motion.div>
              </article>
            </div>
          </>}
        </section>}

        {stage === 4 && procedure && run && selectedMachine && <section aria-labelledby="review-heading" className="mx-auto max-w-3xl space-y-5">
          <div className={`${theme.panel} overflow-hidden`}>
            <div className="border-b border-[#DCE6F0] bg-[#F7FAFB] p-6 sm:p-9">
              <div className={`grid h-14 w-14 place-items-center rounded-2xl ${serverConfirmedComplete ? 'bg-[#E7F0FF] text-[#2478F5]' : 'bg-amber-100 text-amber-800'}`}>{serverConfirmedComplete ? <CheckCircle2 size={30} /> : <AlertTriangle size={28} />}</div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#2478F5]">Stage 4 · Review &amp; Complete</p>
              <h2 id="review-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-[#17324D]">{serverConfirmedComplete ? 'Procedure complete' : 'Completion needs confirmation'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#536779]">{serverConfirmedComplete ? 'The backend has recorded every checkpoint as complete.' : 'The procedure is not marked complete by the server. Review the remaining checks before finishing.'}</p>
            </div>
            <div className="space-y-5 p-6 sm:p-9">
              <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#F4F8FA] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Machine</dt><dd className="mt-1 font-bold text-[#17324D]">{selectedMachine.name}</dd></div><div className="rounded-2xl bg-[#F4F8FA] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#708196]">Approved procedure</dt><dd className="mt-1 font-bold text-[#17324D]">{procedure.title} · v{procedure.version}</dd></div></dl>
              <div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#17324D]">Recorded checkpoints</span><span className="font-bold text-[#17324D]">{completedCount} / {stepCount}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#DCE6F0]" role="progressbar" aria-label="Completed checkpoints" aria-valuemin={0} aria-valuemax={stepCount} aria-valuenow={completedCount}><div className="h-full rounded-full bg-[#2478F5] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${stepCount ? (completedCount / stepCount) * 100 : 0}%` }} /></div></div>
              <ul className="space-y-2">{procedure.steps.map((step) => { const done = Boolean(stepExecutions.get(step.id)?.is_completed); return <li key={step.id} className="flex items-start gap-3 rounded-2xl border border-[#E7EDF1] p-3 text-sm"><span className={done ? 'mt-0.5 text-[#2478F5]' : 'mt-0.5 text-amber-700'}>{done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span><span className="flex-1 text-[#344B60]">{step.step_order}. {step.title}</span><span className={`text-[10px] font-bold uppercase tracking-wide ${done ? 'text-[#2478F5]' : 'text-amber-800'}`}>{done ? 'Completed' : 'Remaining'}</span></li>; })}</ul>
              <div className="flex flex-wrap justify-end gap-3 border-t border-[#E7EDF1] pt-5"><button type="button" onClick={() => setStage(3)} className="inline-flex min-h-11 items-center rounded-full border border-[#DCE6F0] bg-white px-5 text-sm font-semibold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none">Return to procedure</button>{showSwitchWorkflow && <button type="button" onClick={() => void showWorkflowList()} className="inline-flex min-h-11 items-center rounded-full border border-[#DCE6F0] bg-white px-5 text-sm font-semibold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none">Choose another workflow</button>}<button type="button" onClick={startOver} disabled={!serverConfirmedComplete} className="inline-flex min-h-11 items-center rounded-full bg-[#2478F5] px-5 text-sm font-bold text-white transition hover:bg-[#1768DF] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">Finish workflow</button></div>
            </div>
          </div>
        </section>}
      </div>
    </main>
  );
}

function ButtonMarkComplete({ disabled, loading, onClick }: { disabled: boolean; loading: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2478F5] px-5 text-sm font-bold text-white transition hover:bg-[#1768DF] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none">
    {loading ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{loading ? 'Saving checkpoint…' : 'Mark Complete'}
  </button>;
}
