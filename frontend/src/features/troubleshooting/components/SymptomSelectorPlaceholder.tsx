import React from 'react';
import { Stethoscope, AlertCircle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

export interface SymptomSelectorPlaceholderProps {
  disabled?: boolean;
}

export const SymptomSelectorPlaceholder: React.FC<SymptomSelectorPlaceholderProps> = ({
  disabled = true,
}) => {
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Stethoscope className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Symptom & Machine Selector
          </h3>
          <p className="text-[11px] text-slate-400">
            Select machine and observed fault symptom
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
      <div className="space-y-4">
        <div>
          <label
            htmlFor="machine-select-placeholder"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Target Machine
          </label>
          <select
            id="machine-select-placeholder"
            disabled={disabled}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 cursor-not-allowed opacity-70 focus:outline-none"
            aria-disabled="true"
          >
            <option value="">(No approved guides available — selector disabled)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="symptom-select-placeholder"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Observed Symptom / Machine Alarm
          </label>
          <select
            id="symptom-select-placeholder"
            disabled={disabled}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 cursor-not-allowed opacity-70 focus:outline-none"
            aria-disabled="true"
          >
            <option value="">(Select a machine first — selector disabled)</option>
          </select>
        </div>

        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Deterministic Selection:</strong> Sessions only start when an approved, published guide version is bound to the exact machine and symptom. No arbitrary exploration or invented diagnoses.
          </span>
        </div>
      </div>
    </Card>
  );
};
