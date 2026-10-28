import React from 'react';
import {
  Info,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Sparkles,
  ShieldCheck,
  Clock,
} from 'lucide-react';

interface DraftStatusBarProps {
  status: string;
  versionNo: number;
  isSaving: boolean;
  saveStatus: 'idle' | 'saved' | 'error';
  errorMessage?: string | null;
  onSave: () => void;
  canEdit: boolean;
  isDirty?: boolean;
  canSubmit?: boolean;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  onAskAssistant?: () => void;
  canApproveReview?: boolean;
  onApproveReview?: () => void;
  isApprovingReview?: boolean;
  onSubmitReview?: () => void;
  canSubmitReview?: boolean;
  isSubmittingReview?: boolean;
}

export const DraftStatusBar: React.FC<DraftStatusBarProps> = ({
  status,
  versionNo,
  isSaving,
  saveStatus,
  errorMessage,
  onSave,
  canEdit,
  isDirty: _isDirty = false,
  canSubmit = false,
  onSubmit,
  isSubmitting = false,
  onAskAssistant,
  canApproveReview = false,
  onApproveReview,
  isApprovingReview = false,
  onSubmitReview,
  canSubmitReview = false,
  isSubmittingReview = false,
}) => {
  const statusDisplay = status === 'draft' ? 'Draft' : status.replace('_', ' ');
  const submitHandler = onSubmit || onSubmitReview;
  const showSubmit = canSubmit || canSubmitReview;
  const submitting = isSubmitting || isSubmittingReview;

  const getStatusMessage = () => {
    switch (status) {
      case 'draft':
        return 'Authoring Draft • Once complete, submit for peer review to verify tools, parameters, and safety.';
      case 'in_review':
        return 'Submitted for Peer Review • Awaiting qualification and approval by a designated peer expert.';
      case 'changes_requested':
        return 'Changes Requested • Please update the required parameters or safety warnings before resubmission.';
      case 'approved':
        return 'Approved • Scheduled for immediate shopfloor deployment.';
      case 'published':
        return 'Published & Verified • Active in shopfloor procedures and grounded in AI Knowledge Assistant (RAG).';
      case 'superseded':
        return 'Superseded • Replaced by a newer approved procedure revision.';
      case 'withdrawn':
        return 'Withdrawn • Decommissioned from active shopfloor operations.';
      default:
        return 'Standard Operating Procedure lifecycle tracking.';
    }
  };

  const isPublished = status === 'published';
  const isInReview = status === 'in_review';

  return (
    <div className="bg-[#EFF7FF] border border-[#DCE8F5] rounded-xl px-4 py-3 mb-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors">
      {/* Left: Info icon + dynamic status message */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded-full bg-[#1473E6]/10 flex items-center justify-center shrink-0 text-[#1473E6]">
          {isPublished ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          ) : isInReview ? (
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          ) : (
            <Info className="w-3.5 h-3.5" />
          )}
        </div>
        <p className="text-xs sm:text-sm text-[#536780] leading-snug">
          {getStatusMessage()}
        </p>
      </div>

      {/* Right: Status badge, Version, Action buttons */}
      <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto flex-wrap">
        {/* Status / Saved feedback indicator */}
        {saveStatus === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-[#16865C] font-medium animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}

        {saveStatus === 'error' && (
          <span
            className="inline-flex items-center gap-1 text-xs text-[#D94848] font-medium"
            title={errorMessage || 'Failed to save'}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="truncate max-w-[150px]">{errorMessage || 'Save error'}</span>
          </span>
        )}

        {/* Draft • Version 1 Pill Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#BCD7F5] text-xs font-semibold text-[#1473E6] shadow-xs select-none">
          <span className="capitalize">{statusDisplay}</span>
          <span className="text-[#84B8F0]">•</span>
          <span>Version {versionNo}</span>
        </div>

        {/* Ask AI Assistant Button (when published) */}
        {isPublished && onAskAssistant && (
          <button
            type="button"
            onClick={onAskAssistant}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs shadow-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ask AI Assistant</span>
          </button>
        )}

        {/* Save Draft Action Button */}
        {canEdit && (
          <button
            id="save-draft-btn"
            type="button"
            onClick={onSave}
            disabled={isSaving || isSubmitting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#BCD7F5] bg-white hover:bg-[#F7FAFE] text-[#1473E6] font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Save Draft (Ctrl+S)"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft</span>
              </>
            )}
          </button>
        )}
        {/* Submit for Review Button */}
        {showSubmit && submitHandler && (
          <button
            id="submit-review-btn"
            type="button"
            onClick={submitHandler}
            disabled={submitting || isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white font-semibold text-xs shadow-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Submitting…</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Submit for Review</span>
              </>
            )}
          </button>
        )}

        {/* Approve & Publish Button (when in review and user can approve) */}
        {isInReview && canApproveReview && onApproveReview && (
          <button
            id="bar-approve-btn"
            type="button"
            onClick={onApproveReview}
            disabled={isApprovingReview}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
          >
            {isApprovingReview ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve &amp; Publish SOP</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
