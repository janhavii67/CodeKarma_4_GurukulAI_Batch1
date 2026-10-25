import React, { useEffect, useRef } from 'react';
import { X, Eye } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { KnowledgeItemDetail, Step } from '../types';

interface PreviewDialogProps {
  data: KnowledgeItemDetail;
  /** Local (possibly unsaved) form values for preview */
  localTitle: string;
  localSummary: string;
  localDescription: string;
  localSteps: Step[];
  isDirty: boolean;
  onClose: () => void;
}

export const PreviewDialog: React.FC<PreviewDialogProps> = ({
  data,
  localTitle,
  localSummary,
  localDescription,
  localSteps,
  isDirty,
  onClose,
}) => {
  const v = data.version;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the close button when dialog opens
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Trap focus within dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-3xl bg-[#0A1020] border border-[#22304D] rounded-2xl shadow-2xl"
      >
        {/* Dialog header */}
        <div className="flex items-center justify-between p-5 border-b border-[#22304D]">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-slate-400" />
            <h2 id="preview-dialog-title" className="text-sm font-semibold text-slate-200">
              Preview
              {isDirty && (
                <span className="ml-2 text-xs font-normal text-amber-400">
                  (not saved)
                </span>
              )}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview content — read-only rendering of current local state */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {localTitle || <span className="text-slate-500 italic">Untitled</span>}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              v{v.version_no} · {v.status} · {v.origin.replace(/_/g, ' ')} origin
              {v.updated_at ? ` · Updated ${formatDate(v.updated_at)}` : ''}
            </p>
          </div>

          {/* Machine */}
          {data.machine && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">{data.machine.name}</span>
              <span>({data.machine.code})</span>
            </div>
          )}

          {/* Summary */}
          {localSummary && (
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Summary</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {localSummary}
              </p>
            </div>
          )}

          {/* Description */}
          {localDescription && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Description</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {localDescription}
              </p>
            </div>
          )}

          {/* Steps */}
          {localSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Procedure ({localSteps.length} steps)
              </p>
              <div className="space-y-3">
                {localSteps.map((step, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 ${
                      step.needs_review
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-slate-700/40 bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-mono font-bold text-blue-400">
                        STEP {i + 1}
                      </span>
                      {step.needs_review && (
                        <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                          Needs Review
                        </span>
                      )}
                      {step.ai_generated && (
                        <span className="text-[10px] text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded-full px-2 py-0.5">
                          AI
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mb-1">
                      {step.title || <span className="text-slate-500 italic">Untitled</span>}
                    </p>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {step.instruction}
                    </p>
                    {step.safety_warning && (
                      <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-300">
                        ⚠ {step.safety_warning}
                      </div>
                    )}
                    {step.tools.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {step.tools.map((t) => (
                          <span
                            key={t}
                            className="text-[11px] bg-slate-700/60 text-slate-300 rounded-full px-2.5 py-0.5 border border-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {localSteps.length === 0 && (
            <p className="text-sm text-slate-500 italic">No steps added yet.</p>
          )}
        </div>

        <div className="p-4 border-t border-[#22304D] flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
};
