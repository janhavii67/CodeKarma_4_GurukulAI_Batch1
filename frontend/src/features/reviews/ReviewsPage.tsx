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

    // Frontend pre-check for clear UX
    if (selectedItem.author_id === user?.id) {
      setErrorMsg(
        'System Governance Rule: Authors are strictly forbidden from approving or reviewing their own drafts (Invariant 3). A separate expert must review this SOP.'
      );
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/reviews/${selectedItem.article_id}/decision`, {
        decision,
        comments: comments || undefined,
      });

      setSuccessMsg(`Procedure successfully ${decision === 'APPROVED' ? 'Approved & Published' : 'Rejected'}.`);
      setSelectedItem(null);
      setComments('');
      fetchQueue();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit review decision.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-100">Peer Review Governance Queue</h1>
            <Badge variant="warning" size="sm">
              Module 06
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Strict two-person rule enforcement. Authors cannot approve their own submissions.
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

      {/* Governance Banner */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <span className="font-semibold text-slate-200">Strict Peer Review Governance Active</span>
          <p className="text-slate-400 leading-relaxed">
            Every procedure or revision submitted by an engineer must undergo peer validation by a qualified reviewer.
            Self-approvals trigger an automatic rejection policy (403 self_review_forbidden).
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Queue List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading review queue...</div>
      ) : queue.length === 0 ? (
        <Card>
          <div className="py-12 text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-200">Review Backlog Clear</h3>
            <p className="text-xs text-slate-400">No pending knowledge articles awaiting peer review.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => {
            const isOwnSubmission = item.author_id === user?.id;
            return (
              <Card
                key={item.article_id}
                className="hover:border-slate-700 transition-colors p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm" dot>
                      Pending Review
                    </Badge>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {item.category}
                    </span>
                    {isOwnSubmission && (
                      <Badge variant="danger" size="sm">
                        Your Submission (Cannot Self-Approve)
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>

                  <p className="text-xs text-slate-400 line-clamp-1">{item.content_preview}</p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                    <span>
                      Author: <strong className="text-slate-300">{item.author_name}</strong>
                    </span>
                    <span>·</span>
                    <span>Machine: {item.machine_name || 'General'}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
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
                  }}
                  icon={<CheckSquare className="w-3.5 h-3.5" />}
                >
                  Inspect & Decide
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Decision Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <Badge variant="warning" size="sm" className="mb-1">
                  Peer Review Evaluation
                </Badge>
                <h2 className="text-base font-bold text-slate-100">{selectedItem.title}</h2>
                <p className="text-xs text-slate-400">
                  Author: {selectedItem.author_name} · Machine: {selectedItem.machine_name || 'General'}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-300 block mb-1">Content Preview:</span>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs leading-relaxed max-h-48 overflow-y-auto">
                  {selectedItem.content_preview}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Reviewer Engineering Comments / Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="State technical verification findings, tolerance checks, or required revisions..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={() => setSelectedItem(null)}>
                Cancel
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleDecision('REJECTED')}
                  className="text-rose-400 border-rose-900/60 hover:bg-rose-950/30"
                  icon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Reject Revision
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleDecision('APPROVED')}
                  className="bg-emerald-600 hover:bg-emerald-500"
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                >
                  Approve & Publish SOP
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
