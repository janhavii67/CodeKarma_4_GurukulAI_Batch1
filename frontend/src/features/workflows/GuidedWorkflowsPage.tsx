import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api/client';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  CheckSquare,
  Wrench,
} from 'lucide-react';

interface Step {
  id: string;
  step_order: number;
  title: string;
  instruction: string;
  expected_observation?: string;
  safety_warning?: string;
  is_critical: boolean;
}

interface Procedure {
  id: string;
  title: string;
  description: string;
  machine_name?: string;
  prerequisites?: string;
  required_tools?: string;
  safety_warnings?: string;
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
  status: string;
  started_at: string;
  completed_at?: string;
  step_executions: RunStepExec[];
}

export const GuidedWorkflowsPage: React.FC = () => {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProcedure, setActiveProcedure] = useState<Procedure | null>(null);
  const [activeRun, setActiveRun] = useState<ProcedureRun | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Procedure[]>('/procedures')
      .then((data) => {
        setProcedures(data || []);
        setLoading(false);
        if (data && data.length > 0) {
          setActiveProcedure(data[0]);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const handleStartRun = async (procId: string) => {
    setStartingRun(true);
    try {
      const run = await api.post<ProcedureRun>(`/procedures/${procId}/start`, {});
      setActiveRun(run);
    } catch (err) {
      console.error(err);
    } finally {
      setStartingRun(false);
    }
  };

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
      console.error(err);
    } finally {
      setCompletingStepId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-100">Guided Operating Workflows</h1>
            <Badge variant="brand" size="sm">
              Module 03
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Ordered step checklists with mandatory verification checkpoints and safety interlocks.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading guided workflows...</div>
      ) : procedures.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-xs text-slate-400">No procedures configured.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Procedures List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Available Standard Procedures
            </h3>
            {procedures.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setActiveProcedure(p);
                  setActiveRun(null);
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeProcedure?.id === p.id
                    ? 'bg-slate-900 border-brand-500 shadow-md'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono text-brand-400">
                    {p.steps.length} Steps
                  </span>
                  <Badge variant="success" size="sm">
                    Approved
                  </Badge>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1">{p.title}</h4>
                <p className="text-xs text-slate-400 line-clamp-2">{p.description}</p>
                <div className="mt-2 text-[11px] text-slate-400">
                  Target: <span className="text-slate-300">{p.machine_name || 'Standard Machine'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Active Procedure Runner */}
          <div className="lg:col-span-2 space-y-4">
            {activeProcedure && (
              <Card
                title={activeProcedure.title}
                subtitle={`Machine: ${activeProcedure.machine_name || 'Universal'} · Ordered Execution Flow`}
                badge={
                  activeRun ? (
                    <Badge
                      variant={activeRun.status === 'COMPLETED' ? 'success' : 'warning'}
                      size="sm"
                      dot
                    >
                      {activeRun.status === 'COMPLETED' ? 'Run Completed' : 'In Progress'}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      Ready to Execute
                    </Badge>
                  )
                }
              >
                <div className="space-y-4 text-xs">
                  <p className="text-slate-300 leading-relaxed">{activeProcedure.description}</p>

                  {/* Prerequisites & Warnings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeProcedure.prerequisites && (
                      <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-300 mb-1">
                          <Wrench className="w-3.5 h-3.5 text-brand-400" />
                          Prerequisites & Tools:
                        </div>
                        <p className="text-slate-400 text-[11px]">{activeProcedure.prerequisites}</p>
                      </div>
                    )}

                    {activeProcedure.safety_warnings && (
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-600/30 text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-400 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Safety Precaution:
                        </div>
                        <p className="text-[11px] text-amber-300">{activeProcedure.safety_warnings}</p>
                      </div>
                    )}
                  </div>

                  {/* Start Run Action */}
                  {!activeRun && (
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        onClick={() => handleStartRun(activeProcedure.id)}
                        disabled={startingRun}
                        icon={<Play className="w-4 h-4" />}
                      >
                        {startingRun ? 'Initializing Checklist...' : 'Start Guided Procedure Run'}
                      </Button>
                    </div>
                  )}

                  {/* Active Steps Execution Checklist */}
                  {activeRun && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="font-bold text-slate-200">Execution Checkpoints:</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {activeRun.step_executions.filter((s) => s.is_completed).length} /{' '}
                          {activeProcedure.steps.length} Complete
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {activeProcedure.steps.map((step) => {
                          const exec = activeRun.step_executions.find((s) => s.step_id === step.id);
                          const isDone = exec?.is_completed || false;
                          const isLoading = completingStepId === step.id;

                          return (
                            <div
                              key={step.id}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isDone
                                  ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-200'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 font-bold text-brand-300">
                                      Step {step.step_order}
                                    </span>
                                    <span className="font-semibold text-slate-100">{step.title}</span>
                                    {step.is_critical && (
                                      <Badge variant="danger" size="sm">
                                        Critical Verification
                                      </Badge>
                                    )}
                                  </div>

                                  <p className="text-slate-300 leading-relaxed text-[11px] pt-1">
                                    {step.instruction}
                                  </p>

                                  {step.expected_observation && (
                                    <div className="text-[11px] font-mono text-emerald-400 pt-1">
                                      Expected Observation: {step.expected_observation}
                                    </div>
                                  )}
                                </div>

                                <Button
                                  variant={isDone ? 'primary' : 'outline'}
                                  size="sm"
                                  disabled={isLoading}
                                  onClick={() => handleToggleStep(step.id, isDone)}
                                  icon={
                                    isDone ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <CheckSquare className="w-4 h-4" />
                                    )
                                  }
                                >
                                  {isDone ? 'Verified' : 'Verify'}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {activeRun.status === 'COMPLETED' && (
                        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span className="font-semibold">
                              All checkpoints verified! Workflow logged successfully.
                            </span>
                          </div>
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
    </div>
  );
};
