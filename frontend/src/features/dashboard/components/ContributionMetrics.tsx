import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { DashboardStats } from '../../../types/dashboard';
import {
  FileText,
  CheckCircle2,
  Clock,
  Mic,
  TrendingUp,
  Cpu,
  Layers,
  CheckSquare,
  ArrowUpRight,
} from 'lucide-react';

interface ContributionMetricsProps {
  stats: DashboardStats | null;
  loading: boolean;
  hasRole: (role: any) => boolean;
  hasPermission: (perm: string) => boolean;
}

function formatCapturedDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ReactNode;
  accentBg: string;
  accentText: string;
  linkTo?: string;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  caption,
  icon,
  accentBg,
  accentText,
  linkTo,
  loading = false,
}) => {
  const content = (
    <Card
      className={`h-full p-4 transition-all duration-200 border-[#DCE6F0] ${
        linkTo
          ? 'hover:border-[#1976D2]/60 hover:shadow-md cursor-pointer group'
          : 'hover:border-[#DCE6F0]'
      }`}
    >
      <div className="flex items-center justify-between text-[#5D7188] mb-2">
        <span className="text-xs font-semibold text-[#5D7188] tracking-tight">{label}</span>
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${accentBg} ${accentText}`}
        >
          {icon}
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <span className="text-2xl font-extrabold text-[#17324D] font-mono tracking-tight">
          {loading ? (
            <span className="inline-block w-12 h-6 bg-slate-200 animate-pulse rounded" />
          ) : (
            value
          )}
        </span>
        {linkTo && (
          <span className="text-xs text-[#7C8DA1] group-hover:text-[#1976D2] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      <span className="text-[11px] text-[#7C8DA1] mt-1.5 block leading-tight truncate">
        {caption}
      </span>
    </Card>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block focus:outline-none focus:ring-2 focus:ring-[#1976D2] rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
};

export const ContributionMetrics: React.FC<ContributionMetricsProps> = ({
  stats,
  loading,
  hasRole,
  hasPermission,
}) => {
  const isExpert = hasRole('EXPERT');
  const isAdmin = hasRole('ADMIN');
  const canApprove = hasPermission('knowledge.approve');
  const isAuthorRole = isExpert || isAdmin;

  if (isAuthorRole) {
    return (
      <section aria-label="Author and Expert Contribution Metrics">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#17324D] uppercase tracking-wider">
            Operational Contribution Metrics
          </h2>
          <span className="text-[11px] text-[#7C8DA1]">Real database-backed counts</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          <MetricCard
            label="SOPs Created"
            value={stats?.user_sops_created ?? 0}
            caption="Authored by your account"
            icon={<FileText className="w-4 h-4" />}
            accentBg="bg-[#EAF3FF]"
            accentText="text-[#1976D2]"
            linkTo="/app/knowledge"
            loading={loading}
          />

          <MetricCard
            label="Approved SOPs"
            value={stats?.user_sops_approved ?? 0}
            caption="Peer-verified standards"
            icon={<CheckCircle2 className="w-4 h-4" />}
            accentBg="bg-emerald-50"
            accentText="text-[#15966A]"
            linkTo="/app/knowledge"
            loading={loading}
          />

          {canApprove ? (
            <MetricCard
              label="Assigned Reviews"
              value={stats?.pending_reviews_for_user ?? 0}
              caption="Peer queue awaiting decision"
              icon={<Clock className="w-4 h-4" />}
              accentBg="bg-amber-50"
              accentText="text-[#D98B13]"
              linkTo="/app/reviews"
              loading={loading}
            />
          ) : (
            <MetricCard
              label="Pending Review"
              value={stats?.user_sops_pending ?? 0}
              caption="Submitted, awaiting peer decision"
              icon={<Clock className="w-4 h-4" />}
              accentBg="bg-amber-50"
              accentText="text-[#D98B13]"
              loading={loading}
            />
          )}

          <MetricCard
            label="Expertise Captured"
            value={formatCapturedDuration(stats?.user_captured_duration_seconds ?? 0)}
            caption="Audited audio/video recordings"
            icon={<Mic className="w-4 h-4" />}
            accentBg="bg-violet-50"
            accentText="text-violet-600"
            loading={loading}
          />

          <MetricCard
            label="SOP Revisions"
            value={stats?.user_revisions_count ?? 0}
            caption="Version iterations authored"
            icon={<TrendingUp className="w-4 h-4" />}
            accentBg="bg-sky-50"
            accentText="text-sky-600"
            loading={loading}
          />

          <MetricCard
            label="Equipment Covered"
            value={stats?.user_machines_contributed ?? 0}
            caption="Distinct machines documented"
            icon={<Cpu className="w-4 h-4" />}
            accentBg="bg-slate-100"
            accentText="text-[#17324D]"
            linkTo="/app/machines"
            loading={loading}
          />
        </div>
      </section>
    );
  }

  // Trainee and Operator View
  return (
    <section aria-label="Trainee Operational Metrics">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#17324D] uppercase tracking-wider">
          Diagnostic & Learning Metrics
        </h2>
        <span className="text-[11px] text-[#7C8DA1]">Real verified operational records</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Approved SOPs"
          value={stats?.approved_articles ?? 0}
          caption="Verified clinical procedures"
          icon={<CheckCircle2 className="w-4 h-4" />}
          accentBg="bg-emerald-50"
          accentText="text-[#15966A]"
          linkTo="/app/knowledge"
          loading={loading}
        />

        <MetricCard
          label="Guided Checklists"
          value={stats?.procedures_count ?? 0}
          caption="Step-by-step procedures"
          icon={<Layers className="w-4 h-4" />}
          accentBg="bg-amber-50"
          accentText="text-[#D98B13]"
          linkTo="/app/guided-workflows"
          loading={loading}
        />

        <MetricCard
          label="Checklists Completed"
          value={stats?.user_procedures_completed ?? 0}
          caption="Executed procedure runs"
          icon={<CheckSquare className="w-4 h-4" />}
          accentBg="bg-blue-50"
          accentText="text-[#1976D2]"
          linkTo="/app/guided-workflows"
          loading={loading}
        />

        <MetricCard
          label="Active Machines"
          value={stats?.total_machines ?? 0}
          caption="Operational diagnostic assets"
          icon={<Cpu className="w-4 h-4" />}
          accentBg="bg-[#EAF3FF]"
          accentText="text-[#1976D2]"
          linkTo="/app/machines"
          loading={loading}
        />
      </div>
    </section>
  );
};
