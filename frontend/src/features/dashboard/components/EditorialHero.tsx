import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { User } from '../../../types/auth';
import { DashboardStats } from '../../../types/dashboard';
import {
  Plus,
  FileEdit,
  Clock,
  Compass,
  Sparkles,
} from 'lucide-react';

interface EditorialHeroProps {
  user: User | null;
  stats: DashboardStats | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasRole: (role: any) => boolean;
}

export const EditorialHero: React.FC<EditorialHeroProps> = ({
  user,
  stats,
  loading,
  hasPermission,
  hasRole,
}) => {
  const isExpert = hasRole('EXPERT');
  const isAdmin = hasRole('ADMIN');
  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve');

  const roleLabel = isAdmin
    ? 'System Administrator'
    : isExpert
    ? 'Healthcare & Diagnostics Expert'
    : 'Laboratory & Clinical Trainee';

  const pendingReviewsForUser = stats?.pending_reviews_for_user ?? 0;
  const userDrafts = stats?.user_sops_draft ?? 0;
  const latestDraftId = stats?.latest_draft_id;

  return (
    <section
      aria-labelledby="editorial-hero-title"
      className="relative rounded-3xl overflow-hidden bg-white border border-[#DCE6F0] shadow-sm min-h-[360px] md:min-h-[400px] flex items-center"
    >
      {/* Background Photography with Soft Gradient Fade */}
      <div
        className="absolute inset-0 pointer-events-none select-none z-0"
        aria-hidden="true"
      >
        <img
          src="/assets/expert_editorial_hero.jpg"
          alt="Senior Diagnostics & Precision Engineering Expert"
          className="w-full h-full object-cover object-right sm:object-[80%_center]"
        />
        {/* Cinematic light fade overlay: high contrast solid white on left, gentle transition into photo on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 md:via-white/90 to-white/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/60 via-transparent to-transparent md:hidden" />
      </div>

      {/* Hero Content Layer */}
      <div className="relative z-10 p-6 sm:p-8 md:p-10 max-w-2xl space-y-4">
        {/* Eyebrow & Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#EAF3FF] text-[#1976D2] border border-[#BCD7F5]">
            <Sparkles className="w-3 h-3 text-[#1976D2]" />
            Gurukul AI · Expert Workspace
          </span>

          <Badge variant={isExpert || isAdmin ? 'brand' : 'info'} size="sm" dot>
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
              {pendingReviewsForUser} Reviews Awaiting
            </Badge>
          )}

          {!loading && userDrafts > 0 && (
            <Badge variant="neutral" size="sm">
              <FileEdit className="w-3 h-3 mr-1 inline" />
              {userDrafts} Drafts
            </Badge>
          )}
        </div>

        {/* Personalized Welcome Greeting */}
        <div className="text-xs font-semibold text-[#1976D2] tracking-wide uppercase">
          Welcome back, {user?.name || 'Healthcare Practitioner'}
        </div>

        {/* Editorial Big Headline */}
        <h1
          id="editorial-hero-title"
          className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#17324D] tracking-tight leading-[1.12]"
        >
          Your Experience.<br />
          <span className="text-[#1976D2]">Their Future.</span>
        </h1>

        {/* Mission Statement Subtitle */}
        <p className="text-xs sm:text-sm md:text-base text-[#5D7188] leading-relaxed max-w-xl">
          Preserve the knowledge only experience can teach. Capture what you know and empower the next generation of skilled operators.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {canCreate && (
            <Link to="/app/knowledge/new">
              <Button
                variant="primary"
                size="md"
                icon={<Plus className="w-4 h-4" />}
                className="shadow-sm font-semibold px-5 py-2.5 rounded-xl"
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
                className="font-medium px-4 py-2.5 rounded-xl border border-[#DCE6F0]"
              >
                Continue Draft
              </Button>
            </Link>
          )}

          <Link to="/app/knowledge">
            <Button
              variant="outline"
              size="md"
              icon={<Compass className="w-4 h-4 text-[#1976D2]" />}
              className="font-medium px-4 py-2.5 rounded-xl bg-white/90 hover:bg-white"
            >
              Explore My Knowledge
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
