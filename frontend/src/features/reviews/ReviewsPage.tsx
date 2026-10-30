import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';
import {
  CheckSquare,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  X,
} from 'lucide-react';

interface ReviewQueueItem {
  article_id: string;
  title: string;
  category: string;
  machine_name?: string;
  author_id: string;
  author_name: string;
  version: number;
  submitted_at: string;
  content_preview: string;
  requires_ai_draft_acknowledgment?: boolean;
}

export const ReviewsPage: React.FC = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [comments, setComments] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [acknowledgedAiDraft, setAcknowledgedAiDraft] = useState(false);

  const fetchQueue = () => {
    setLoading(true);
    api
      .get<ReviewQueueItem[]>('/reviews/queue')
      .then((data) => {
        setQueue(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedItem) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    // Frontend pre-check: allow Admin override
    if (selectedItem.author_id === user?.id && user?.role_id !== 'ADMIN') {
      setErrorMsg(
        'System Governance Rule: Authors cannot review their own drafts. An authorized peer reviewer must approve this submission.'
      );
      return;
    }

    if (decision === 'APPROVED' && selectedItem.requires_ai_draft_acknowledgment && !acknowledgedAiDraft) {
      setErrorMsg('Acknowledge that you checked the AI draft against its source before publishing.');
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/reviews/${selectedItem.article_id}/decision`, {
        decision,
        comments: comments || undefined,
        acknowledged_ai_draft: decision === 'APPROVED' && acknowledgedAiDraft,
      });

      setSuccessMsg(`Procedure successfully ${decision === 'APPROVED' ? 'Approved & Published' : 'Rejected'}.`);
      setSelectedItem(null);
      setComments('');
      setAcknowledgedAiDraft(false);
      fetchQueue();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit review decision.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#17324D]">Peer Review Governance Queue</h1>
            <Badge variant="warning" size="sm">
              Module 06
            </Badge>
          </div>
          <p className="text-xs text-[#5D7188]">
            Strict two-person rule enforcement. Authors cannot approve their own submissions (Administrators hold compliance override).
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchQueue}
          icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Refresh Queue
        </Button>
      </div>

      <div className="text-xs text-[#536779]">Signed in as {user?.name} · {user?.role_id}</div>

      {/* Governance Banner */}
      <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-[#D98B13] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <span className="font-semibold text-amber-900">Strict Peer Review Governance Active</span>
          <p className="text-amber-800 leading-relaxed">
            Every procedure or revision submitted by an expert must undergo peer validation by a qualified reviewer.
            Self-approvals trigger an automatic rejection policy (403 self_review_forbidden).
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15966A] text-xs flex items-center gap-2 font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Queue List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#7C8DA1]">Loading review queue...</div>
      ) : queue.length === 0 ? (
        <Card>
          <div className="py-12 text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-[#15966A] mx-auto" />
            <h3 className="text-sm font-semibold text-[#17324D]">Review Backlog Clear</h3>
            <p className="text-xs text-[#5D7188]">No pending knowledge articles awaiting peer review.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => {
            const isOwnSubmission = item.author_id === user?.id;
            return (
              <Card
                key={item.article_id}
                className="hover:border-[#1976D2]/50 hover:shadow-md transition-all p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm" dot>
                      Pending Review
                    </Badge>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#F3F8FE] text-[#5D7188] border border-[#DCE6F0]">
                      {item.category}
                    </span>
                    {isOwnSubmission && (
                      <Badge variant="danger" size="sm">
                        Your Submission (Cannot Self-Approve)
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-[#17324D]">{item.title}</h3>

                  <p className="text-xs text-[#5D7188] line-clamp-1">{item.content_preview}</p>

                  <div className="flex items-center gap-4 text-[11px] text-[#7C8DA1] pt-1">
                    <span>
                      Author: <strong className="text-[#17324D]">{item.author_name}</strong>
                    </span>
                    <span>·</span>
                    <span>Machine: {item.machine_name || 'General'}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#7C8DA1]" />
                      {new Date(item.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedItem(item);
                    setErrorMsg(null);
                    setAcknowledgedAiDraft(false);
                  }}
                  icon={<CheckSquare className="w-3.5 h-3.5" />}
                >
                  Inspect &amp; Decide
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Decision Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE6F0] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#E8EEF5] pb-3">
              <div>
                <Badge variant="warning" size="sm" className="mb-1">
                  Peer Review Evaluation
                </Badge>
                <h2 className="text-base font-bold text-[#17324D]">{selectedItem.title}</h2>
                <p className="text-xs text-[#5D7188]">
                  Author: {selectedItem.author_name} · Machine: {selectedItem.machine_name || 'General'}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-[#7C8DA1] hover:text-[#17324D] transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[#D94848] text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {selectedItem.author_id === user?.id && user?.role_id !== 'ADMIN' && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Strict Two-Person Rule:</strong> You authored this SOP. An authorized peer reviewer must approve it.
                  </span>
                </div>
                <span className="text-amber-100">Sign in with a separate reviewer account to continue.</span>
              </div>
            )}

            {user?.role_id === 'ADMIN' && selectedItem.author_id === user?.id && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
                <span>🛡️ <strong>Admin Governance Override:</strong> You hold administrative compliance authority to approve this procedure.</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-[#17324D] block mb-1">Content Preview:</span>
                <div className="p-3.5 rounded-xl bg-[#F3F8FE] border border-[#DCE6F0] text-[#17324D] text-xs leading-relaxed max-h-48 overflow-y-auto">
                  {selectedItem.content_preview}
                </div>
              </div>

              <div>
                <label className="block text-[#17324D] mb-1 font-semibold">
                  Reviewer Engineering Comments / Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="State technical verification findings, tolerance checks, or required revisions..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl p-2.5 text-[#17324D] text-xs focus:bg-white focus:border-[#1976D2] outline-none"
                />
              </div>
            </div>

            {selectedItem.requires_ai_draft_acknowledgment && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={acknowledgedAiDraft}
                  onChange={(event) => setAcknowledgedAiDraft(event.target.checked)}
                  className="mt-0.5"
                  aria-label="Acknowledge AI draft verification"
                />
                <span>I reviewed this AI-generated draft against its source transcript and verified its procedures, parameters, and safety details before publishing.</span>
              </label>
            )}

            <div className="pt-3 border-t border-[#E8EEF5] flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={() => setSelectedItem(null)}>
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleDecision('REJECTED')}
                  className="text-[#D94848] border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                  icon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Reject Revision
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionLoading || Boolean(selectedItem.requires_ai_draft_acknowledgment && !acknowledgedAiDraft)}
                  onClick={() => handleDecision('APPROVED')}
                  className="bg-[#15966A] hover:bg-[#12815B] border border-[#15966A] text-white"
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                >
                  Approve &amp; Publish SOP
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
