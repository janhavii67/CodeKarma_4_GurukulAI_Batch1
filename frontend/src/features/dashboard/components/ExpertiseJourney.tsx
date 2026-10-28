import React from 'react';
import { Card } from '../../../components/ui/Card';
import { DashboardStats } from '../../../types/dashboard';
import { ShieldCheck, Award, CheckCircle2 } from 'lucide-react';

interface ExpertiseJourneyProps {
  stats: DashboardStats | null;
  loading: boolean;
  hasRole: (role: any) => boolean;
}

export const ExpertiseJourney: React.FC<ExpertiseJourneyProps> = ({
  stats,
  loading,
  hasRole,
}) => {
  const isExpert = hasRole('EXPERT');
  const isAdmin = hasRole('ADMIN');
  const isAuthorRole = isExpert || isAdmin;

  const created = stats?.user_sops_created ?? 0;
  const approved = stats?.user_sops_approved ?? 0;
  const proceduresCompleted = stats?.user_procedures_completed ?? 0;

  // Quality approval rate (defensible calculation based on real records)
  const approvalRate = created > 0 ? Math.round((approved / created) * 100) : 100;

  // Quality Milestone thresholds (based on peer-verified approved outcomes)
  let nextTarget = 3;
  let milestoneTitle = '3 Peer-Approved SOPs (Author Baseline)';
  let milestoneCurrent = approved;

  if (isAuthorRole) {
    if (approved >= 3 && approved < 5) {
      nextTarget = 5;
      milestoneTitle = '5 Peer-Approved SOPs (Clinical Standardizer)';
    } else if (approved >= 5 && approved < 10) {
      nextTarget = 10;
      milestoneTitle = '10 Peer-Approved SOPs (Senior Protocol Specialist)';
    } else if (approved >= 10) {
      nextTarget = approved + 5;
      milestoneTitle = `${nextTarget} Peer-Approved SOPs`;
    }
  } else {
    // Trainee / Operator checklist execution milestone
    milestoneCurrent = proceduresCompleted;
    if (proceduresCompleted < 3) {
      nextTarget = 3;
      milestoneTitle = '3 Procedure Checklists Executed';
    } else if (proceduresCompleted < 5) {
      nextTarget = 5;
      milestoneTitle = '5 Procedure Checklists Executed (Operator Level 1)';
    } else {
      nextTarget = proceduresCompleted + 5;
      milestoneTitle = `${nextTarget} Procedure Checklists Executed`;
    }
  }

  const progressPercent = Math.min(
    Math.round((milestoneCurrent / nextTarget) * 100),
    100
  );

  return (
    <Card
      title={isAuthorRole ? 'Quality & Governance Milestone' : 'Execution & Training Progress'}
      subtitle={
        isAuthorRole
          ? 'Milestones evaluated strictly through two-person peer approval'
          : 'Checklist compliance and verified procedural executions'
      }
      className="p-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Milestone Progress Bar */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#17324D] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#1976D2]" />
              {milestoneTitle}
            </span>
            <span className="font-mono font-bold text-[#1976D2]">
              {loading ? '--' : `${milestoneCurrent} / ${nextTarget}`} ({loading ? '--' : `${progressPercent}%`})
            </span>
          </div>

          <div
            className="w-full h-2.5 rounded-full bg-[#EAF3FF] overflow-hidden border border-[#DCE6F0]"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Milestone Progress"
          >
            <div
              className="h-full bg-gradient-to-r from-[#1976D2] to-[#1677F2] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loading ? 0 : progressPercent}%` }}
            />
          </div>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-[#5D7188] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[#15966A] shrink-0 mt-0.5" />
            <span>
              {isAuthorRole
                ? 'Strict Governance Rule: Milestones reward verified accuracy and safety. Procedural speed or volume never substitutes for peer-verified compliance.'
                : 'Safety Protocol: Every step in guided checklists enforces mandatory safety observations before marking completion.'}
            </span>
          </div>
        </div>

        {/* Quality Metrics Box */}
        <div className="border-t md:border-t-0 md:border-l border-[#E8EEF5] md:pl-6 pt-4 md:pt-0 flex flex-col justify-center space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5D7188]">
              {isAuthorRole ? 'Peer Approval Rate:' : 'Completion Reliability:'}
            </span>
            <span className="font-mono font-bold text-[#15966A] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15966A]" />
              {loading ? '--' : `${approvalRate}%`}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5D7188]">
              {isAuthorRole ? 'Approved Contributions:' : 'Checklists Logged:'}
            </span>
            <span className="font-mono font-bold text-[#17324D]">
              {loading ? '--' : isAuthorRole ? approved : proceduresCompleted}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5D7188]">Evaluation Rule:</span>
            <span className="text-[11px] font-semibold text-[#1976D2]">
              {isAuthorRole ? 'Two-Person Rule' : 'ISO Checklist Standard'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
