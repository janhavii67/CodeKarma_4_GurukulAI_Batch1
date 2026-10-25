import React, { useState } from 'react';
import { StepDraft } from './voiceApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { AlertTriangle, CheckCircle, ShieldAlert, Wrench, Sparkles, HelpCircle } from 'lucide-react';

interface StepDraftReviewProps {
  initialSteps: StepDraft[];
  onStepsUpdated?: (updatedSteps: StepDraft[]) => void;
}

export const StepDraftReview: React.FC<StepDraftReviewProps> = ({
  initialSteps,
  onStepsUpdated,
}) => {
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps);

  const clearStepFlag = (index: number) => {
    const updated = [...steps];
    updated[index].needs_review = false;
    updated[index].note = 'Verified by Expert Author';
    setSteps(updated);
    if (onStepsUpdated) onStepsUpdated(updated);
  };

  const flaggedCount = steps.filter((s) => s.needs_review).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Header & Governance Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">
              AI Candidate Procedural Steps ({steps.length})
            </span>
            <Badge variant="brand" size="sm">
              <Sparkles className="w-3 h-3 mr-1" />
              origin: ai_draft
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Machine limits, feeds, and safety parameters must be verified against actual factory specifications.
          </p>
        </div>

        <div>
          {flaggedCount > 0 ? (
            <Badge variant="warning" size="sm">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {flaggedCount} Steps Need Review
            </Badge>
          ) : (
            <Badge variant="success" size="sm">
              <CheckCircle className="w-3 h-3 mr-1" />
              All Steps Verified
            </Badge>
          )}
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Submission Gate:</strong> SOP cannot be submitted to peer review while unverified flags remain. Inspect the flagged steps below and confirm tolerances.
          </span>
        </div>
      )}

      {/* Steps Sequence */}
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-xl border transition-all text-xs space-y-3 ${
              step.needs_review
                ? 'bg-amber-500/5 border-amber-500/30 shadow-sm'
                : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-mono font-bold text-[11px] text-slate-300">
                  {idx + 1}
                </span>
                <h5 className="font-semibold text-slate-100 text-sm">{step.title}</h5>
              </div>

              <div className="flex items-center gap-2">
                {step.source_segment_ids && step.source_segment_ids.length > 0 && (
                  <span className="text-[10px] font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                    Segments: #{step.source_segment_ids.join(', #')}
                  </span>
                )}
                {step.needs_review && (
                  <Badge variant="warning" size="sm">
                    Needs Review
                  </Badge>
                )}
              </div>
            </div>

            <p className="text-slate-200 text-xs leading-relaxed">{step.instruction}</p>

            {/* Safety Warning */}
            {step.safety_warning && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-[11px] text-rose-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Critical:</strong> {step.safety_warning}
                </span>
              </div>
            )}

            {/* Tools and Stop Conditions */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
              {step.tools && step.tools.length > 0 && (
                <div className="flex items-center gap-1 text-slate-300">
                  <Wrench className="w-3.5 h-3.5 text-brand-400" />
                  <span>Tools: {step.tools.join(', ')}</span>
                </div>
              )}
              {step.stop_condition && (
                <div className="text-slate-400">
                  <span className="text-slate-300 font-medium">Stop Condition:</span> {step.stop_condition}
                </div>
              )}
            </div>

            {/* Review Reason & Clearance Action */}
            {step.needs_review && (
              <div className="pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-amber-300 text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{step.note || 'Tolerances or parameters missing from audio narration.'}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearStepFlag(idx)}
                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border-amber-500/30"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  I have verified this parameter
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
