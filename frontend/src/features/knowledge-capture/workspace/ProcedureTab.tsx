import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { StepEditor } from '../StepEditor';
import type { Step } from '../types';
import type { EditorMode } from './deriveEditorMode';

export interface ProcedureTabProps {
  steps: Step[];
  mode: EditorMode;
  onChange: (steps: Step[]) => void;
}

export const ProcedureTab: React.FC<ProcedureTabProps> = ({
  steps,
  mode,
  onChange,
}) => {
  const isReadOnly = mode !== 'editable';
  const flaggedCount = steps.filter((s) => s.needs_review).length;
  const incompleteCount = steps.filter(
    (s) => !s.title.trim() || !s.instruction.trim()
  ).length;

  return (
    <div
      id="tabpanel-procedure"
      role="tabpanel"
      aria-labelledby="tab-procedure"
      className="space-y-4"
    >
      {/* Summary row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs text-[#A3B1CC]">
          <span>
            {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
          {flaggedCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {flaggedCount} flagged for review
            </span>
          )}
          {incompleteCount > 0 && !isReadOnly && (
            <span className="text-rose-400">
              {incompleteCount} incomplete
            </span>
          )}
        </div>
      </div>

      {/* Step editor */}
      <div className="rounded-2xl bg-[#111A2E] border border-[#22304D] p-5">
        <StepEditor
          steps={steps}
          isReadOnly={isReadOnly}
          onChange={onChange}
        />
      </div>
    </div>
  );
};
