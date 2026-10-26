import React from 'react';
import { GitFork, ShieldAlert } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';

export const DecisionTreeViewerPlaceholder: React.FC = () => {
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
          <GitFork className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Deterministic Decision Tree Canvas
          </h3>
          <p className="text-[11px] text-slate-400">
            Interactive diagnostic step execution & safety stops
          </p>
        </div>
      </div>
      <Badge variant="warning" size="sm">
        PLACEHOLDER
      </Badge>
    </div>
  );

  return (
    <Card header={headerContent} className="border-slate-800 bg-slate-900/60 shadow-lg">
      <div>
        <EmptyState
          icon={<GitFork className="w-7 h-7 text-slate-400" />}
          title="No Active Troubleshooting Session"
          description="Decision tree canvas will render step-by-step verification nodes, mandatory checks, and approved corrective actions once a session starts."
          className="border-slate-800/80 bg-slate-950/30 py-8"
        />

        {/* Tree Architecture Preview (Non-functional schematic) */}
        <div className="mt-6 border border-slate-800/80 rounded-xl p-4 bg-slate-950/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              Diagnostic Node Lifecycle (Rule Engine Specification)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Pure Deterministic DAG
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-[11px]">
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col items-center">
              <span className="font-semibold text-sky-300 mb-1">1. Check Node</span>
              <span className="text-[10px] text-slate-400">Trainee enters measured parameter</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col items-center">
              <span className="font-semibold text-amber-300 mb-1">2. Server Rule</span>
              <span className="text-[10px] text-slate-400">Backend calculates deterministic next node</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col items-center">
              <span className="font-semibold text-rose-300 mb-1">3. Stop / Action</span>
              <span className="text-[10px] text-slate-400">Mandatory halt if hazard; otherwise approved fix</span>
            </div>
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col items-center">
              <span className="font-semibold text-emerald-300 mb-1">4. Verification</span>
              <span className="text-[10px] text-slate-400">Resolved only if verification criteria pass</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-400 border-t border-slate-800/60 pt-2.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Safety Rule: The backend rejects arbitrary node traversal. No LLM chooses branches or modifies machine states.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
