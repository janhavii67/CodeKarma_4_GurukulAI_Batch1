import React, { useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Step } from './types';
import { StepCard } from './StepCard';
import { Button } from '../../components/ui/Button';

interface StepEditorProps {
  steps: Step[];
  isReadOnly: boolean;
  onChange: (steps: Step[]) => void;
}

const makeBlankStep = (order: number): Step => ({
  order,
  title: '',
  instruction: '',
  tools: [],
  safety_warning: null,
  expected_result: null,
  stop_condition: null,
  needs_review: false,
  source_segment_ids: [],
  ai_generated: false,
  note: null,
});

export const StepEditor: React.FC<StepEditorProps> = ({ steps, isReadOnly, onChange }) => {
  const reorder = useCallback(
    (updated: Step[]) => {
      // Re-assign `order` to match array index (1-based)
      onChange(updated.map((s, i) => ({ ...s, order: i + 1 })));
    },
    [onChange]
  );

  const handleChange = (index: number, updated: Step) => {
    const next = [...steps];
    next[index] = updated;
    reorder(next);
  };

  const handleDelete = (index: number) => {
    const next = steps.filter((_, i) => i !== index);
    reorder(next);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...steps];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    reorder(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const next = [...steps];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    reorder(next);
  };

  const handleAdd = () => {
    reorder([...steps, makeBlankStep(steps.length + 1)]);
  };

  if (steps.length === 0 && isReadOnly) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No steps have been recorded for this version.
      </div>
    );
  }

  return (
    <section aria-label="Procedure Steps">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Steps
          <span className="ml-2 text-slate-500 font-normal normal-case">
            ({steps.length} / 100)
          </span>
        </h3>
        {!isReadOnly && steps.length < 100 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={handleAdd}
            id="add-step-btn"
          >
            Add Step
          </Button>
        )}
      </div>

      {steps.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed border-slate-700 py-12 text-center cursor-pointer hover:border-brand-500/40 transition-colors"
          role="button"
          tabIndex={0}
          onClick={handleAdd}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="Add first step"
        >
          <Plus className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-400 text-sm font-medium">Add your first step</p>
          <p className="text-slate-600 text-xs mt-1">
            Capture the procedure step by step
          </p>
        </div>
      ) : (
        <div className="space-y-3" role="list" aria-label="Step list">
          {steps.map((step, i) => (
            <div key={i} role="listitem">
              <StepCard
                step={step}
                index={i}
                isReadOnly={isReadOnly}
                totalSteps={steps.length}
                onChange={(updated) => handleChange(i, updated)}
                onDelete={() => handleDelete(i)}
                onMoveUp={() => handleMoveUp(i)}
                onMoveDown={() => handleMoveDown(i)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
