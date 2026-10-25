import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertTriangle,
  Copy,
  MoreVertical,
} from 'lucide-react';
import type { Step } from './types';

interface StepCardProps {
  step: Step;
  index: number;
  isReadOnly: boolean;
  totalSteps: number;
  onChange: (updated: Step) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate?: () => void;
}

const TA_BASE =
  'w-full bg-white border border-[#DCE8F5] rounded-lg px-3 py-2 text-sm text-[#12345A] placeholder-[#8FA0BF] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6] resize-none transition-colors';

const INPUT_BASE =
  'w-full bg-white border border-[#DCE8F5] rounded-lg px-3 py-2 text-sm text-[#12345A] placeholder-[#8FA0BF] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/20 focus:border-[#1473E6] transition-colors';

const LabelText: React.FC<{ children: React.ReactNode; optional?: boolean }> = ({
  children,
  optional,
}) => (
  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#536780] mb-1">
    {children}
    {optional && <span className="ml-1 text-[#8FA0BF] normal-case font-normal">(optional)</span>}
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
  onDuplicate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolInput, setToolInput] = useState('');
  const toolInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

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
    ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-400/20'
    : 'border-[#DCE8F5] bg-white hover:border-[#BCD7F5]';

  return (
    <div
      id={`step-card-${index}`}
      className={`rounded-xl border transition-all duration-150 ${needsReviewHighlight} shadow-xs overflow-hidden`}
      role="region"
      aria-label={`Step ${index + 1}: ${step.title || '(untitled)'}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-3.5 py-3 bg-[#F7FAFE]/80 border-b border-[#DCE8F5]">
        {/* Blue Circle Numbered Badge matching Reference Image */}
        <div className="w-6 h-6 rounded-full bg-[#1473E6] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs select-none">
          {index + 1}
        </div>
        <span className="sr-only">STEP {index + 1}</span>

        {/* Step Title & Preview */}
        <div
          className="flex-1 min-w-0 cursor-pointer select-none"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#12345A] truncate">
              {step.title || <span className="text-[#8FA0BF] italic font-normal">Untitled step</span>}
            </span>

            {step.needs_review && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.2 shrink-0"
                title="Flagged for review — must be manually verified"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                Needs Review
              </span>
            )}

            {step.ai_generated && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-1.5 py-0.2 shrink-0">
                AI
              </span>
            )}
          </div>

          {/* Short preview when collapsed */}
          {!expanded && (
            <p className="text-xs text-[#536780] truncate mt-0.5 max-w-[280px] sm:max-w-md">
              {step.instruction ? step.instruction : 'No instructions entered yet…'}
            </p>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isReadOnly && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 rounded-md text-[#536780] hover:text-[#12345A] hover:bg-white transition-colors"
                aria-label={`Step ${index + 1} options`}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-[#DCE8F5] py-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveUp();
                    }}
                    disabled={index === 0}
                    className="w-full text-left px-3 py-1.5 text-[#536780] hover:text-[#12345A] hover:bg-[#F7FAFE] disabled:opacity-40 flex items-center gap-2"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Move Up</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveDown();
                    }}
                    disabled={index === totalSteps - 1}
                    className="w-full text-left px-3 py-1.5 text-[#536780] hover:text-[#12345A] hover:bg-[#F7FAFE] disabled:opacity-40 flex items-center gap-2"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Move Down</span>
                  </button>
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate();
                      }}
                      className="w-full text-left px-3 py-1.5 text-[#536780] hover:text-[#12345A] hover:bg-[#F7FAFE] flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate</span>
                    </button>
                  )}
                  <div className="border-t border-[#DCE8F5] my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Step</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Expand / Collapse Chevron */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 rounded-md text-[#536780] hover:text-[#12345A] hover:bg-white transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse step' : 'Expand step'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Reorder visual grip */}
          {!isReadOnly && (
            <span className="text-[#8FA0BF] cursor-grab shrink-0 p-0.5" aria-hidden title="Drag to reorder">
              <GripVertical className="w-4 h-4" />
            </span>
          )}
        </div>
      </div>

      {/* Expanded Body Form */}
      {expanded && (
        <div className="p-4 space-y-4 bg-white animate-in fade-in duration-100">
          {/* Title */}
          <div>
            <LabelText>Step Title</LabelText>
            {isReadOnly ? (
              <p className="text-sm font-semibold text-[#12345A]">{step.title || '—'}</p>
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
              <p className="text-sm text-[#536780] whitespace-pre-wrap">{step.instruction || '—'}</p>
            ) : (
              <textarea
                id={`step-${index}-instruction`}
                value={step.instruction}
                onChange={(e) => patch('instruction', e.target.value)}
                placeholder="Detailed instruction for the operator…"
                maxLength={5000}
                rows={3}
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
                  className="inline-flex items-center gap-1 text-xs bg-[#EFF7FF] text-[#1473E6] rounded-full px-2.5 py-0.5 border border-[#BCD7F5]"
                >
                  {tool}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeTool(tool)}
                      className="ml-0.5 text-[#84B8F0] hover:text-rose-600 transition-colors"
                      aria-label={`Remove tool: ${tool}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {step.tools.length === 0 && (
                <span className="text-xs text-[#8FA0BF] italic">No tools specified</span>
              )}
            </div>
            {!isReadOnly && (
              <div className="flex gap-2">
                <input
                  ref={toolInputRef}
                  type="text"
                  value={toolInput}
                  onChange={(e) => setToolInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTool();
                    }
                  }}
                  placeholder="Add a tool (press Enter)"
                  maxLength={100}
                  className={`${INPUT_BASE} flex-1`}
                  aria-label="Add tool"
                />
                <button
                  type="button"
                  onClick={addTool}
                  className="px-3 py-1.5 rounded-lg border border-[#BCD7F5] bg-white hover:bg-[#F7FAFE] text-xs font-semibold text-[#1473E6] transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Safety Warning */}
          <div>
            <LabelText optional>
              <span className="text-amber-500">⚠</span> Safety Warning
            </LabelText>
            {isReadOnly ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 whitespace-pre-wrap">
                {step.safety_warning || <span className="text-[#8FA0BF] italic">None</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-safety`}
                value={step.safety_warning ?? ''}
                onChange={(e) => patch('safety_warning', e.target.value || null)}
                placeholder="Any safety precautions the operator must follow…"
                maxLength={2000}
                rows={2}
                className={`${TA_BASE} border-amber-300 focus:ring-amber-500/20 focus:border-amber-500 bg-amber-50/20`}
                aria-label="Safety warning"
              />
            )}
          </div>

          {/* Expected Result */}
          <div>
            <LabelText optional>Expected Result</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-[#536780] whitespace-pre-wrap">
                {step.expected_result || <span className="text-[#8FA0BF] italic">—</span>}
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
              <p className="text-sm text-[#536780] whitespace-pre-wrap">
                {step.stop_condition || <span className="text-[#8FA0BF] italic">—</span>}
              </p>
            ) : (
              <textarea
                id={`step-${index}-stop`}
                value={step.stop_condition ?? ''}
                onChange={(e) => patch('stop_condition', e.target.value || null)}
                placeholder="Condition that should halt this step or entire procedure…"
                maxLength={2000}
                rows={2}
                className={`${TA_BASE} border-rose-200 focus:ring-rose-500/20 focus:border-rose-400 bg-rose-50/10`}
                aria-label="Stop condition"
              />
            )}
          </div>

          {/* Note */}
          <div>
            <LabelText optional>Note</LabelText>
            {isReadOnly ? (
              <p className="text-sm text-[#536780] whitespace-pre-wrap">
                {step.note || <span className="text-[#8FA0BF] italic">—</span>}
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
            <div className="flex items-center gap-2.5 pt-2 border-t border-[#DCE8F5]">
              <input
                id={`step-${index}-needs-review`}
                type="checkbox"
                checked={step.needs_review}
                onChange={(e) => patch('needs_review', e.target.checked)}
                className="w-4 h-4 rounded border-[#BCD7F5] text-[#1473E6] focus:ring-[#1473E6]/30 cursor-pointer"
              />
              <label
                htmlFor={`step-${index}-needs-review`}
                className="text-xs font-medium text-[#12345A] select-none cursor-pointer"
              >
                Flag for expert review
                <span className="ml-1 text-[11px] text-[#536780]">
                  (steps flagged until explicitly verified)
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
