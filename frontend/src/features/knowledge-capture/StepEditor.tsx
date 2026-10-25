import React, { useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Step } from './types';
import { StepCard } from './StepCard';

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

  const handleDuplicate = (index: number) => {
    const toCopy = steps[index];
    const copied: Step = {
      ...toCopy,
      order: steps.length + 1,
      title: toCopy.title ? `${toCopy.title} (Copy)` : '',
    };
    const next = [...steps];
    next.splice(index + 1, 0, copied);
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
      <div className="text-center py-8 text-[#536780] text-sm italic">
        No steps have been recorded for this version.
      </div>
    );
  }

  return (
    <section aria-label="Procedure Steps" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#12345A] uppercase tracking-wider flex items-center gap-1.5">
          <span>Steps</span>
          <span className="text-xs text-[#536780] font-normal normal-case">
            ({steps.length} / 100)
          </span>
        </h3>
        {!isReadOnly && steps.length < 100 && (
          <button
            type="button"
            onClick={handleAdd}
            id="add-step-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Step</span>
          </button>
        )}
      </div>

      {steps.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed border-[#BCD7F5] bg-[#F7FAFE] py-10 text-center cursor-pointer hover:border-[#1473E6] hover:bg-[#EFF7FF] transition-all"
          role="button"
          tabIndex={0}
          onClick={handleAdd}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="Add first step"
        >
          <div className="w-10 h-10 rounded-full bg-white border border-[#BCD7F5] text-[#1473E6] flex items-center justify-center mx-auto mb-2 shadow-xs">
            <Plus className="w-5 h-5" />
          </div>
          <p className="text-[#12345A] text-sm font-semibold">Add your first step</p>
          <p className="text-[#536780] text-xs mt-0.5">
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
                onDuplicate={() => handleDuplicate(i)}
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
