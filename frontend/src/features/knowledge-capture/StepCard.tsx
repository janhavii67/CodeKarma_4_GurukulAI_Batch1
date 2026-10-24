import React, { useCallback, useRef, useState } from 'react';
import { GripVertical, ChevronDown, ChevronUp, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { Step } from './types';
import { Button } from '../../components/ui/Button';

interface StepCardProps {
  step: Step;
  index: number;
  isReadOnly: boolean;
  totalSteps: number;
  onChange: (updated: Step) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const TA_BASE =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 resize-none transition-colors';

const INPUT_BASE =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors';

const LabelText: React.FC<{ children: React.ReactNode; optional?: boolean }> = ({
  children,
  optional,
}) => (
  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
    {children}
    {optional && <span className="ml-1 text-slate-500 normal-case font-normal">(optional)</span>}
  </label>
);

export const StepCard: React.FC<StepCardProps> = ({
  step,
  index,
  isReadOnly,
  totalSteps,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [toolInput, setToolInput] = useState('');
  const toolInputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback(
    <K extends keyof Step>(key: K, value: Step[K]) => {
      onChange({ ...step, [key]: value });
    },
    [onChange, step]
  );

  const addTool = () => {
    const t = toolInput.trim();
    if (!t || step.tools.includes(t)) return;
    patch('tools', [...step.tools, t]);
    setToolInput('');
    toolInputRef.current?.focus();
  };

  const removeTool = (tool: string) => {
    patch('tools', step.tools.filter((x) => x !== tool));
  };

  const needsReviewHighlight = step.needs_review
    ? 'border-amber-500/50 bg-amber-500/5'
    : 'border-slate-700/60 bg-slate-800/30';

  return (
    <div
      id={`step-card-${index}`}
      className={`rounded-xl border transition-colors ${needsReviewHighlight} overflow-hidden`}
      role="region"
      aria-label={`Step ${index + 1}: ${step.title || '(untitled)'}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/40 border-b border-slate-700/40">
        {/* Drag handle placeholder (visual only) */}
        {!isReadOnly && (
          <span className="text-slate-600 cursor-grab shrink-0" aria-hidden>
            <GripVertical className="w-4 h-4" />
          </span>
        )}

        <span className="text-[11px] font-mono font-bold text-brand-400 shrink-0 select-none">
          STEP {index + 1}
        </span>

        {step.needs_review && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5"
            title="Flagged for review — must be manually verified"
          >
            <AlertTriangle className="w-3 h-3" />
            Needs Review
          </span>
        )}

        {step.ai_generated && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded-full px-2 py-0.5">
            AI
          </span>
        )}

        <div className="flex-1 truncate text-sm font-medium text-slate-300 select-none">
          {step.title || <span className="text-slate-500 italic">Untitled step</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={index === 0}
                className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Move step up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={index === totalSteps - 1}
                className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Move step down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                aria-label={`Delete step ${index + 1}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse step' : 'Expand step'}
          >
            {expanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <LabelText>Step Title</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-200">{step.title || '—'}</p>
            ) : (
              <input
                id={`step-${index}-title`}
                type="text"
                value={step.title}
                onChange={(e) => patch('title', e.target.value)}
                placeholder="Brief title for this step"
                maxLength={255}
                className={INPUT_BASE}
                aria-label="Step title"
              />
            )}
          </div>

          {/* Instruction */}
          <div>
            <LabelText>Instruction</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{step.instruction || '—'}</p>
            ) : (
              <textarea
                id={`step-${index}-instruction`}
                value={step.instruction}
                onChange={(e) => patch('instruction', e.target.value)}
                placeholder="Detailed instruction for the operator…"
                maxLength={5000}
                rows={4}
                className={TA_BASE}
                aria-label="Step instruction"
              />
            )}
          </div>

          {/* Tools */}
          <div>
            <LabelText optional>Tools Required</LabelText>
            <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Tool tags">
              {step.tools.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 text-xs bg-slate-700/60 text-slate-300 rounded-full px-2.5 py-0.5 border border-slate-600"
                >
                  {tool}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeTool(tool)}
                      className="ml-0.5 text-slate-500 hover:text-rose-400 transition-colors"
                      aria-label={`Remove tool: ${tool}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {step.tools.length === 0 && (
                <span className="text-xs text-slate-500 italic">No tools specified</span>
              )}
            </div>
            {!isReadOnly && (
              <div className="flex gap-2">
                <input
                  ref={toolInputRef}
                  type="text"
                  value={toolInput}
                  onChange={(e) => setToolInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } }}
                  placeholder="Add a tool (press Enter)"
                  maxLength={100}
                  className={`${INPUT_BASE} flex-1`}
                  aria-label="Add tool"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTool}>
                  Add
                </Button>
              </div>
            )}
          </div>

          {/* Safety Warning */}
          <div>
            <LabelText optional>
              <span className="text-amber-400">⚠</span> Safety Warning
            </LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {step.safety_warning || <span className="text-slate-500">—</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-safety`}
                value={step.safety_warning ?? ''}
                onChange={(e) => patch('safety_warning', e.target.value || null)}
                placeholder="Any safety precautions the operator must follow…"
                maxLength={2000}
                rows={2}
                className={`${TA_BASE} border-amber-700/40 focus:ring-amber-500 focus:border-amber-500`}
                aria-label="Safety warning"
              />
            )}
          </div>

          {/* Expected Result */}
          <div>
            <LabelText optional>Expected Result</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {step.expected_result || <span className="text-slate-500">—</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-expected`}
                value={step.expected_result ?? ''}
                onChange={(e) => patch('expected_result', e.target.value || null)}
                placeholder="What should the operator observe when step succeeds…"
                maxLength={2000}
                rows={2}
                className={TA_BASE}
                aria-label="Expected result"
              />
            )}
          </div>

          {/* Stop Condition */}
          <div>
            <LabelText optional>Stop Condition</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {step.stop_condition || <span className="text-slate-500">—</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-stop`}
                value={step.stop_condition ?? ''}
                onChange={(e) => patch('stop_condition', e.target.value || null)}
                placeholder="Condition that should halt this step or entire procedure…"
                maxLength={2000}
                rows={2}
                className={`${TA_BASE} border-rose-800/40 focus:ring-rose-500 focus:border-rose-500`}
                aria-label="Stop condition"
              />
            )}
          </div>

          {/* Note */}
          <div>
            <LabelText optional>Note</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {step.note || <span className="text-slate-500">—</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-note`}
                value={step.note ?? ''}
                onChange={(e) => patch('note', e.target.value || null)}
                placeholder="Additional notes or observations…"
                maxLength={1000}
                rows={2}
                className={TA_BASE}
                aria-label="Step note"
              />
            )}
          </div>

          {/* Needs Review flag */}
          {!isReadOnly && (
            <div className="flex items-center gap-3 pt-1 border-t border-slate-700/40">
              <input
                id={`step-${index}-needs-review`}
                type="checkbox"
                checked={step.needs_review}
                onChange={(e) => patch('needs_review', e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <label
                htmlFor={`step-${index}-needs-review`}
                className="text-sm text-slate-300 select-none cursor-pointer"
              >
                Flag for expert review
                <span className="ml-1 text-[11px] text-slate-500">
                  (stays flagged until explicitly verified)
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
