import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import {
  FileText,
  Plus,
  CheckSquare,
  Layers,
  Volume2,
  Cpu,
  Wrench,
  Mic,
  ArrowRight,
} from 'lucide-react';

interface QuickActionsGridProps {
  hasPermission: (perm: string) => boolean;
  pendingReviewsCount: number;
}

interface ActionCardProps {
  title: string;
  desc: string;
  route: string;
  icon: React.ReactNode;
  badge?: string;
  isPrimary?: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({
  title,
  desc,
  route,
  icon,
  badge,
  isPrimary = false,
}) => (
  <Link
    to={route}
    className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between group shadow-xs hover:shadow-md ${
      isPrimary
        ? 'bg-white hover:bg-[#F5F9FF] border-[#1976D2] ring-1 ring-[#1976D2]/20'
        : 'bg-white hover:bg-[#F8FAFD] border-[#DCE6F0] hover:border-[#1976D2]/40'
    }`}
  >
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPrimary
              ? 'bg-[#1976D2] text-white shadow-xs'
              : 'bg-[#EAF3FF] text-[#1976D2]'
          }`}
        >
          {icon}
        </div>
        {badge && (
          <Badge variant={isPrimary ? 'brand' : 'neutral'} size="sm">
            {badge}
          </Badge>
        )}
      </div>

      <h3
        className={`text-sm font-bold transition-colors ${
          isPrimary
            ? 'text-[#1976D2]'
            : 'text-[#17324D] group-hover:text-[#1976D2]'
        }`}
      >
        {title}
      </h3>
      <p className="text-xs text-[#5D7188] mt-1 line-clamp-2 leading-relaxed">
        {desc}
      </p>
    </div>

    <div className="mt-4 pt-2.5 border-t border-[#E8EEF5] flex items-center justify-between text-xs text-[#7C8DA1] group-hover:text-[#1976D2]">
      <span className="text-[11px] font-semibold">Launch Module</span>
      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
    </div>
  </Link>
);

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  hasPermission,
  pendingReviewsCount,
}) => {
  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve');
  const canAnalyzeAudio = hasPermission('audio.analyze');
  const canExecute = hasPermission('procedure.execute');
  const canTroubleshoot = hasPermission('troubleshoot.use');

  return (
    <section aria-labelledby="quick-actions-heading">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2
            id="quick-actions-heading"
            className="text-base font-bold text-[#17324D] flex items-center gap-2"
          >
            Operational Quick Actions
          </h2>
          <p className="text-xs text-[#5D7188]">
            Direct entry into verified knowledge authoring, review workflows, and diagnostics
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Most prominent primary action based on permissions */}
        {canCreate ? (
          <ActionCard
            title="Capture New SOP"
            desc="Author structured medical diagnostic SOPs with verified step safety warnings."
            route="/app/knowledge/new"
            icon={<Plus className="w-4 h-4" />}
            badge="Authoring"
            isPrimary
          />
        ) : canApprove && pendingReviewsCount > 0 ? (
          <ActionCard
            title="Review Queue"
            desc={`${pendingReviewsCount} pending SOPs waiting for two-person peer approval.`}
            route="/app/reviews"
            icon={<CheckSquare className="w-4 h-4" />}
            badge={`${pendingReviewsCount} Pending`}
            isPrimary
          />
        ) : (
          <ActionCard
            title="Guided Workflows"
            desc="Execute interactive procedures with mandatory checkpoint safety verifications."
            route="/app/guided-workflows"
            icon={<Layers className="w-4 h-4" />}
            badge="Checklists"
            isPrimary
          />
        )}

        {/* Knowledge Library */}
        <ActionCard
          title="Knowledge Library"
          desc="Search authoritative clinical and equipment procedures with version history."
          route="/app/knowledge"
          icon={<FileText className="w-4 h-4" />}
          badge="Verified"
        />

        {/* Peer Review Queue (if not already primary) */}
        {canApprove && !(!canCreate && pendingReviewsCount > 0) && (
          <ActionCard
            title="Review Queue"
            desc="Strict two-person governance preventing self-approval on diagnostic SOPs."
            route="/app/reviews"
            icon={<CheckSquare className="w-4 h-4" />}
            badge={pendingReviewsCount > 0 ? `${pendingReviewsCount} Awaiting` : 'Active'}
          />
        )}

        {/* Guided Workflows (if not primary) */}
        {(canCreate || canApprove) && canExecute && (
          <ActionCard
            title="Guided Workflows"
            desc="Interactive checklists with mandatory safety verifications and run logs."
            route="/app/guided-workflows"
            icon={<Layers className="w-4 h-4" />}
            badge="Interactive"
          />
        )}

        {/* Machine Assets */}
        <ActionCard
          title="Equipment & Machines"
          desc="Live equipment catalog with tooling associations, runout tolerances, and SOP links."
          route="/app/machines"
          icon={<Cpu className="w-4 h-4" />}
          badge="Live DB"
        />

        {/* Voice Capture */}
        <ActionCard
          title="Voice-to-Knowledge"
          desc="Hands-free laboratory audio transcription with automatic technical term extraction."
          route="/app/voice-capture"
          icon={<Mic className="w-4 h-4" />}
          badge="AI Audio"
        />

        {/* Sound Analysis (if permitted) */}
        {canAnalyzeAudio && (
          <ActionCard
            title="Sound Diagnostics"
            desc="Calibrated acoustic matching against reference baselines to isolate mechanical drift."
            route="/app/sound-analysis"
            icon={<Volume2 className="w-4 h-4" />}
            badge="Acoustics"
          />
        )}

        {/* Troubleshooting (if permitted) */}
        {canTroubleshoot && (
          <ActionCard
            title="Troubleshooting Trees"
            desc="Expert decision trees for symptom isolation, runout checks, and tooling wear."
            route="/app/troubleshooting"
            icon={<Wrench className="w-4 h-4" />}
            badge="Diagnostics"
          />
        )}
      </div>
    </section>
  );
};
