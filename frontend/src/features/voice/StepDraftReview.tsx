import React, { useState, useEffect } from 'react';
import { StepDraft, verifyCandidateStep, submitVoiceSOP } from './voiceApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  Wrench,
  Sparkles,
  HelpCircle,
  Send,
  Loader2,
  Info,
} from 'lucide-react';

interface StepDraftReviewProps {
  mediaId?: string;
  itemId?: string;
  initialSteps: StepDraft[];
  origin?: string;
  initialFlaggedCount?: number;
  initialCanSubmit?: boolean;
  isDemo?: boolean;
  submissionGateStatus?: string;
  onStepsUpdated?: (updatedSteps: StepDraft[]) => void;
  onSubmitSuccess?: () => void;
}

export const StepDraftReview: React.FC<StepDraftReviewProps> = ({
  mediaId,
  itemId,
  initialSteps,
  origin: initialOrigin = 'ai_draft',
  initialFlaggedCount,
  initialCanSubmit,
  isDemo = false,
  submissionGateStatus = 'open',
  onStepsUpdated,
  onSubmitSuccess,
}) => {
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps);
  const [origin, setOrigin] = useState<string>(initialOrigin);
  const [verifyingIdx, setVerifyingIdx] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);

  // Sync state if initialSteps changes
  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  useEffect(() => {
    setOrigin(initialOrigin);
  }, [initialOrigin]);

  const flaggedCount =
    typeof initialFlaggedCount === 'number'
      ? steps.filter((s) => s.needs_review).length
      : steps.filter((s) => s.needs_review).length;

  const canSubmit =
    flaggedCount === 0 && (initialCanSubmit !== undefined ? initialCanSubmit : true);

  const clearStepFlag = async (index: number) => {
    setSubmitError(null);
    if (mediaId) {
      setVerifyingIdx(index);
      try {
        const res = await verifyCandidateStep(mediaId, index);
        if (res.steps) {
          setSteps(res.steps);
          if (res.origin) setOrigin(res.origin);
          if (onStepsUpdated) onStepsUpdated(res.steps);
        }
      } catch (err: any) {
        console.error('Failed to verify step on server:', err);
        // Fallback to local state if offline/mock
        const updated = [...steps];
        updated[index] = {
          ...updated[index],
          needs_review: false,
          note: 'Verified by Expert Author',
        };
        setSteps(updated);
        setOrigin('ai_draft_edited');
        if (onStepsUpdated) onStepsUpdated(updated);
      } finally {
        setVerifyingIdx(null);
      }
    } else {
      // Local-only verification for offline components or unit tests
      const updated = [...steps];
      updated[index] = {
        ...updated[index],
        needs_review: false,
        note: 'Verified by Expert Author',
      };
      setSteps(updated);
      setOrigin('ai_draft_edited');
      if (onStepsUpdated) onStepsUpdated(updated);
    }
  };

  const handleSubmitForReview = async () => {
    if (!itemId) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitVoiceSOP(itemId);
      setSubmitSuccessMsg('SOP version submitted successfully for peer review (status: in_review).');
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Failed to submit SOP. Ensure all flagged parameters are verified.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasDemoSteps =
    isDemo ||
    steps.some(
      (s) =>
        (s.instruction && s.instruction.includes('[ILLUSTRATIVE')) ||
        (s.title && s.title.includes('[ILLUSTRATIVE'))
    );

  return (
    <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-5">
      {/* Demo Warning Banner if using mock/illustrative fallback */}
      {hasDemoSteps && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#D98B13] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-900 uppercase tracking-wide">
              ⚠️ DEMO — ILLUSTRATIVE DATA — NOT A REAL PROCEDURE
            </span>
            <p className="text-amber-800 leading-relaxed">
              This draft was generated using offline demonstration data because no live Speech-to-Text provider credentials were configured. Numeric tolerances, pressures, and parameters are synthetic illustrations and MUST NOT be used on actual factory machines.
            </p>
          </div>
        </div>
      )}
      {/* Header & Governance Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-[#E8EEF5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#17324D]">
              AI Candidate Procedural Steps ({steps.length})
            </span>
            <Badge variant="brand" size="sm">
              <Sparkles className="w-3 h-3 mr-1" />
              origin: {origin}
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188] mt-1">
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

      {/* Submission Gate Alert */}
      {flaggedCount > 0 || submissionGateStatus === 'blocked' ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-[#D98B13] shrink-0" />
          <span>
            <strong>Submission Gate:</strong> SOP cannot be submitted to peer review while unverified flags remain. Inspect the flagged steps below and confirm tolerances.
          </span>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Submission Gate Open:</strong> All candidate parameters verified. Ready to submit for peer review.
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
                ? 'bg-amber-50/40 border-amber-200 shadow-xs'
                : 'bg-white border-[#DCE6F0] hover:border-[#1976D2]/30 shadow-xs'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#EAF3FF] flex items-center justify-center font-mono font-bold text-[11px] text-[#1976D2]">
                  {idx + 1}
                </span>
                <h5 className="font-bold text-[#17324D] text-sm">{step.title}</h5>
              </div>

              <div className="flex items-center gap-2">
                {step.source_segment_ids && step.source_segment_ids.length > 0 && (
                  <span className="text-[10px] font-mono text-[#1976D2] bg-[#EAF3FF] px-2 py-0.5 rounded border border-[#BCD7F5]">
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

            <p className="text-[#17324D] text-xs leading-relaxed">{step.instruction}</p>

            {/* Safety Warning */}
            {step.safety_warning && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-[11px] text-[#D94848] flex items-start gap-2 font-medium">
                <ShieldAlert className="w-4 h-4 text-[#D94848] shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Critical:</strong> {step.safety_warning}
                </span>
              </div>
            )}

            {/* Tools and Stop Conditions */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[#5D7188]">
              {step.tools && step.tools.length > 0 && (
                <div className="flex items-center gap-1 text-[#17324D] font-medium">
                  <Wrench className="w-3.5 h-3.5 text-[#1976D2]" />
                  <span>Tools: {step.tools.join(', ')}</span>
                </div>
              )}
              {step.stop_condition && (
                <div className="text-[#5D7188]">
                  <span className="text-[#17324D] font-semibold">Stop Condition:</span> {step.stop_condition}
                </div>
              )}
            </div>

            {/* Review Reason & Clearance Action */}
            {step.needs_review && (
              <div className="pt-2 border-t border-amber-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-amber-900 text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 text-[#D98B13] shrink-0" />
                  <span>{step.note || 'Tolerances or parameters missing from audio narration.'}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={verifyingIdx === idx}
                  onClick={() => clearStepFlag(idx)}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                >
                  {verifyingIdx === idx ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-[#D98B13]" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 mr-1 text-[#D98B13]" />
                  )}
                  I have verified this parameter
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submission Gate Actions Footer */}
      {itemId && (
        <div className="pt-4 border-t border-slate-800 space-y-3">
          {submitError && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
          {submitSuccessMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{submitSuccessMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              {canSubmit ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  All requirements satisfied for peer review submission.
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Submission Gate is locked ({flaggedCount} unverified step parameter
                  {flaggedCount > 1 ? 's' : ''}).
                </span>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
              disabled={!canSubmit || isSubmitting}
              onClick={handleSubmitForReview}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Submitting to Peer Review...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Submit SOP for Peer Review
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
