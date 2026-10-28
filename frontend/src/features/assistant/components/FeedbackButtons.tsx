import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, X, AlertTriangle, Send } from 'lucide-react';
import { submitFeedback } from '../api';
import type { FeedbackReason } from '../types';

interface FeedbackButtonsProps {
  messageId: string;
}

const REASON_OPTIONS: { label: string; value: FeedbackReason; description: string }[] = [
  { value: 'incorrect', label: 'Incorrect Details', description: 'Parameters or instructions are inaccurate' },
  { value: 'missing_source', label: 'Missing Source', description: 'Lacks citation to verified SOP or chunk' },
  { value: 'outdated', label: 'Outdated Info', description: 'Procedure has been superseded or updated' },
  { value: 'irrelevant', label: 'Irrelevant Content', description: 'Does not apply to target machine or query' },
  { value: 'conflicting', label: 'Conflicting Guidance', description: 'Contradictory steps between documents' },
  { value: 'insufficient', label: 'Insufficient Evidence', description: 'Missing critical troubleshooting steps' },
];

export const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({ messageId }) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedReason, setSelectedReason] = useState<FeedbackReason>('incorrect');
  const [comment, setComment] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackType, setFeedbackType] = useState<'helpful' | 'problem' | null>(null);

  const handleHelpfulClick = async () => {
    if (submitted || submitting) return;
    setSubmitting(true);
    try {
      // Helpful feedback uses 'missing_source' or default triage
      await submitFeedback({
        message_id: messageId,
        rating: 5,
        reason: 'missing_source', // Fallback benign rating category
        comment: 'Helpful answer',
      });
      setFeedbackType('helpful');
      setSubmitted(true);
    } catch (err) {
      console.warn('Feedback submission failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleProblemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        message_id: messageId,
        rating: 1,
        reason: selectedReason,
        comment: comment.trim() || undefined,
      });
      setFeedbackType('problem');
      setSubmitted(true);
      setIsModalOpen(false);
    } catch (err) {
      console.warn('Feedback submission failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center space-x-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
        <Check className="w-3.5 h-3.5" />
        <span>
          {feedbackType === 'helpful'
            ? 'Marked as helpful, thank you!'
            : 'Feedback received, thank you!'}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center space-x-2 pt-2">
        <button
          type="button"
          onClick={handleHelpfulClick}
          disabled={submitting}
          className="inline-flex items-center space-x-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          title="Mark this response as helpful"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>Helpful</span>
        </button>

        <span className="text-slate-300">|</span>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={submitting}
          className="inline-flex items-center space-x-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
          title="Report an issue with this answer"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          <span>Report Problem</span>
        </button>
      </div>

      {/* Report Problem Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2 text-slate-900 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Report Assistant Response Issue</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleProblemSubmit} className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Select Reason Category <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {REASON_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedReason === opt.value
                          ? 'border-blue-500 bg-blue-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={opt.value}
                        checked={selectedReason === opt.value}
                        onChange={() => setSelectedReason(opt.value)}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="ml-2.5">
                        <span className="text-xs font-semibold text-slate-800 block">
                          {opt.label}
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight">
                          {opt.description}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Additional Details (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Explain what was incorrect or missing..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 resize-none"
                  maxLength={1000}
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
