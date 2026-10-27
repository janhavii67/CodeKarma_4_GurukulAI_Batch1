import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { User } from '../../../types/auth';
import { DashboardStats } from '../../../types/dashboard';
import {
  Plus,
  FileEdit,
  CheckSquare,
  Layers,
  FileText,
  Clock,
} from 'lucide-react';

interface WelcomeBannerProps {
  user: User | null;
  stats: DashboardStats | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasRole: (role: any) => boolean;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({
  user,
  stats,
  loading,
  hasPermission,
  hasRole,
}) => {
  const isExpert = hasRole('EXPERT');
  const isAdmin = hasRole('ADMIN');
  const isOperator = hasRole('OPERATOR');
  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve');
  const canExecute = hasPermission('procedure.execute');

  // Role display label
  const roleLabel = isAdmin
    ? 'System Administrator'
    : isExpert
    ? 'Healthcare & Diagnostics Expert'
    : isOperator
    ? 'Diagnostic Equipment Operator'
    : 'Laboratory & Clinical Trainee';

  // Role-aware mission description
  const missionText = isExpert || isAdmin
    ? 'Your clinical and technical expertise preserves critical laboratory procedures and ensures rigorous peer-reviewed standard operating procedures.'
    : isOperator
    ? 'You are operating verified equipment assets with live safety checklists, acoustic baseline verification, and fault isolation trees.'
    : 'You have access to peer-approved medical diagnostic procedures, step-by-step checklist execution, and cited knowledge assistance.';

  const pendingReviewsForUser = stats?.pending_reviews_for_user ?? 0;
  const userDrafts = stats?.user_sops_draft ?? 0;
  const userPending = stats?.user_sops_pending ?? 0;
  const latestDraftId = stats?.latest_draft_id;

  return (
    <section
      aria-labelledby="welcome-heading"
      className="rounded-2xl bg-gradient-to-r from-white via-[#F5F9FF] to-[#EAF3FF] border border-[#DCE6F0] p-6 md:p-7 shadow-xs relative overflow-hidden"
    >
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-3xl">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isExpert || isAdmin ? 'brand' : 'info'} size="md" dot>
              {roleLabel}
            </Badge>

            {canApprove && (
              <Badge variant="success" size="sm">
                Authorized Peer Reviewer
              </Badge>
            )}

            {!loading && canApprove && pendingReviewsForUser > 0 && (
              <Badge variant="warning" size="sm" className="font-semibold">
                <Clock className="w-3 h-3 mr-1 inline" />
                {pendingReviewsForUser} {pendingReviewsForUser === 1 ? 'Review' : 'Reviews'} Awaiting Decision
              </Badge>
            )}

            {!loading && userDrafts > 0 && (
              <Badge variant="neutral" size="sm">
                <FileEdit className="w-3 h-3 mr-1 inline" />
                {userDrafts} {userDrafts === 1 ? 'Draft' : 'Drafts'} in Progress
              </Badge>
            )}

            {!loading && userPending > 0 && (
              <Badge variant="info" size="sm">
                {userPending} {userPending === 1 ? 'SOP' : 'SOPs'} Under Peer Review
              </Badge>
            )}
          </div>

          <h1
            id="welcome-heading"
            className="text-2xl md:text-3xl font-bold text-[#17324D] tracking-tight"
          >
            Welcome back, {user?.name || 'Healthcare Practitioner'}
          </h1>

          <p className="text-xs md:text-sm text-[#5D7188] leading-relaxed max-w-2xl">
            {missionText}
          </p>
        </div>

        {/* Dynamic Contextual Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canCreate && (
            <Link to="/app/knowledge/new">
              <Button
                variant="primary"
                size="md"
                icon={<Plus className="w-4 h-4" />}
                className="shadow-sm font-semibold"
              >
                Capture New Knowledge
              </Button>
            </Link>
          )}

          {latestDraftId && (
            <Link to={`/app/knowledge/${latestDraftId}`}>
              <Button
                variant="secondary"
                size="md"
                icon={<FileEdit className="w-4 h-4 text-[#1976D2]" />}
                className="font-medium"
              >
                Continue Draft
              </Button>
            </Link>
          )}

          {canApprove && pendingReviewsForUser > 0 && (
            <Link to="/app/reviews">
              <Button
                variant="outline"
                size="md"
                icon={<CheckSquare className="w-4 h-4 text-[#D98B13]" />}
                className="font-medium border-amber-300 text-amber-900 bg-amber-50/60 hover:bg-amber-100/60"
              >
                Review Queue ({pendingReviewsForUser})
              </Button>
            </Link>
          )}

          {!canCreate && canExecute && (
            <Link to="/app/guided-workflows">
              <Button
                variant="primary"
                size="md"
                icon={<Layers className="w-4 h-4" />}
                className="shadow-sm font-semibold"
              >
                Start Guided Workflow
              </Button>
            </Link>
          )}

          <Link to="/app/knowledge">
            <Button
              variant="outline"
              size="md"
              icon={<FileText className="w-4 h-4 text-[#1976D2]" />}
              className="font-medium"
            >
              Browse Library
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
