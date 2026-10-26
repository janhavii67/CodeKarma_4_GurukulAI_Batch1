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
            <h1 className="text-2xl font-bold text-[#17324D]">Guided Operating Workflows</h1>
            <Badge variant="brand" size="sm">
              Module 03
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188]">
            Ordered step checklists with mandatory verification checkpoints and safety interlocks.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-[#7C8DA1]">Loading guided workflows...</div>
      ) : procedures.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-xs text-[#7C8DA1]">No procedures configured.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Procedures List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#7C8DA1] uppercase tracking-wider">
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
                    ? 'bg-[#EAF3FF] border-[#1976D2] shadow-sm'
                    : 'bg-white border-[#DCE6F0] hover:border-[#1976D2]/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono font-bold text-[#1976D2]">
                    {p.steps.length} Steps
                  </span>
                  <Badge variant="success" size="sm">
                    Approved
                  </Badge>
                </div>
                <h4 className="text-sm font-bold text-[#17324D] mb-1">{p.title}</h4>
                <p className="text-xs text-[#5D7188] line-clamp-2">{p.description}</p>
                <div className="mt-2 text-[11px] text-[#7C8DA1]">
                  Target: <span className="text-[#17324D] font-medium">{p.machine_name || 'Standard Equipment'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Active Procedure Runner */}
          <div className="lg:col-span-2 space-y-4">
            {activeProcedure && (
              <Card
                title={activeProcedure.title}
                subtitle={`Equipment: ${activeProcedure.machine_name || 'Universal'} · Ordered Execution Flow`}
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
                  <p className="text-[#5D7188] leading-relaxed">{activeProcedure.description}</p>

                  {/* Prerequisites & Warnings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeProcedure.prerequisites && (
                      <div className="p-3 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0]">
                        <div className="flex items-center gap-1.5 font-bold text-[#17324D] mb-1">
                          <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                          Prerequisites &amp; Tools:
                        </div>
                        <p className="text-[#5D7188] text-[11px]">{activeProcedure.prerequisites}</p>
                      </div>
                    )}

                    {activeProcedure.safety_warnings && (
                      <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900">
                        <div className="flex items-center gap-1.5 font-bold text-[#D98B13] mb-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Safety Precaution:
                        </div>
                        <p className="text-[11px] text-amber-800">{activeProcedure.safety_warnings}</p>
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
                      <div className="flex items-center justify-between pb-2 border-b border-[#E8EEF5]">
                        <span className="font-bold text-[#17324D]">Execution Checkpoints:</span>
                        <span className="text-[11px] font-mono text-[#5D7188]">
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
                                  ? 'bg-emerald-50/70 border-emerald-200 text-[#17324D]'
                                  : 'bg-white border-[#DCE6F0] text-[#17324D] shadow-xs'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#EAF3FF] font-bold text-[#1976D2] border border-[#BCD7F5]">
                                      Step {step.step_order}
                                    </span>
                                    <span className="font-bold text-[#17324D]">{step.title}</span>
                                    {step.is_critical && (
                                      <Badge variant="danger" size="sm">
                                        Critical Verification
                                      </Badge>
                                    )}
                                  </div>

                                  <p className="text-[#5D7188] leading-relaxed text-[11px] pt-1">
                                    {step.instruction}
                                  </p>

                                  {step.expected_observation && (
                                    <div className="text-[11px] font-mono font-medium text-[#15966A] pt-1">
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
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15966A] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-[#15966A]" />
                            <span className="font-bold">
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
