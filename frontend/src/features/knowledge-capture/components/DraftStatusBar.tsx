import React from 'react';
import { Info, Save, Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

interface DraftStatusBarProps {
  status: string;
  versionNo: number;
  isSaving: boolean;
  saveStatus: 'idle' | 'saved' | 'error';
  errorMessage?: string | null;
  onSave: () => void;
  canEdit: boolean;
  isDirty?: boolean;
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
  onSubmitReview,
  canSubmitReview = false,
  isSubmittingReview = false,
}) => {
  const statusDisplay = status === 'draft' ? 'Draft' : status.replace('_', ' ');

  return (
    <div className="bg-[#EFF7FF] border border-[#DCE8F5] rounded-xl px-4 py-3 mb-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors">
      {/* Left: Info icon + message */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded-full bg-[#1473E6]/10 flex items-center justify-center shrink-0 text-[#1473E6]">
          <Info className="w-3.5 h-3.5" />
        </div>
        <p className="text-xs sm:text-sm text-[#536780] leading-snug">
          Save your draft or submit it for peer review when it is ready.
        </p>
      </div>

      {/* Right: Status badge, Version, Save Draft button */}
      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto flex-wrap">
        {/* Status / Saved feedback indicator */}
        {saveStatus === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-[#16865C] font-medium animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}

        {saveStatus === 'error' && (
          <span className="inline-flex items-center gap-1 text-xs text-[#D94848] font-medium" title={errorMessage || 'Failed to save'}>
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

        {/* Save Draft Action Button */}
        {canEdit && (
          <button
            id="save-draft-btn"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white font-semibold text-xs shadow-xs transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#1473E6]/40"
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
        {canSubmitReview && onSubmitReview && (
          <button type="button" onClick={onSubmitReview} disabled={isSaving || isSubmittingReview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#173B5E] hover:bg-[#102C49] text-white font-semibold text-xs shadow-xs disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#19A995]/50">
            {isSubmittingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{isSubmittingReview ? 'Submitting…' : 'Submit for Review'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
