import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  Video,
  FileCheck2,
  Bot,
  ArrowRight,
  Sparkles,
  Layers,
} from 'lucide-react';

interface EditorialFeatureCardsProps {
  hasPermission: (perm: string) => boolean;
  pendingReviewsCount: number;
}

export const EditorialFeatureCards: React.FC<EditorialFeatureCardsProps> = ({
  hasPermission,
  pendingReviewsCount,
}) => {
  const canCreate = hasPermission('knowledge.create');

  return (
    <section aria-labelledby="editorial-features-title" className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        
        {/* Card 1: Capture Knowledge */}
        <Card className="p-6 flex flex-col justify-between border-[#DCE6F0] hover:border-[#1976D2]/60 hover:shadow-md transition-all duration-200 group bg-white rounded-2xl">
          <div className="space-y-4">
            {/* Visual Icon Illustration */}
            <div className="w-14 h-14 rounded-2xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2] shadow-xs group-hover:scale-105 transition-transform">
              <Video className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#17324D] tracking-tight group-hover:text-[#1976D2] transition-colors">
                Capture Knowledge
              </h2>
              <p className="text-xs text-[#5D7188] mt-1.5 leading-relaxed">
                Capture machine setup tricks, troubleshooting tips, and years of hands-on experience.
              </p>
            </div>

            {/* Media Formats Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {['Video', 'Audio', 'Notes', 'Photos'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#F3F8FE] text-[#5D7188] border border-[#DCE6F0]"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <Link to={canCreate ? '/app/knowledge/new' : '/app/knowledge'} className="block">
              <Button
                variant="primary"
                size="md"
                className="w-full justify-center shadow-xs font-semibold py-2.5 rounded-xl"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Start Capturing
              </Button>
            </Link>
          </div>
        </Card>

        {/* Card 2: Review & Verify Knowledge */}
        <Card className="p-6 flex flex-col justify-between border-[#DCE6F0] hover:border-[#1976D2]/60 hover:shadow-md transition-all duration-200 group bg-white rounded-2xl relative overflow-hidden">
          <div className="space-y-4">
            {/* Header with Critical Feature Pill */}
            <div className="flex items-start justify-between">
              <div className="w-14 h-14 rounded-2xl bg-[#F8FAFD] border border-[#DCE6F0] flex items-center justify-center text-[#17324D] shadow-xs group-hover:scale-105 transition-transform">
                <FileCheck2 className="w-7 h-7 text-[#1976D2]" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 shadow-xs">
                CRITICAL feature
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#17324D] tracking-tight group-hover:text-[#1976D2] transition-colors">
                Review &amp; Verify Knowledge
              </h2>
              <p className="text-xs text-[#5D7188] mt-1.5 leading-relaxed">
                Check accuracy, add missing details, and verify knowledge before sharing it with future operators.
              </p>
            </div>

            {/* Governance note / pending reviews count */}
            <div className="flex items-center gap-2 pt-1 text-xs">
              {pendingReviewsCount > 0 ? (
                <Badge variant="warning" size="sm" className="font-semibold">
                  {pendingReviewsCount} items awaiting verification
                </Badge>
              ) : (
                <span className="text-[11px] text-[#7C8DA1] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#1976D2]" />
                  Two-person peer compliance verified
                </span>
              )}
            </div>
          </div>

          <div className="pt-6">
            <Link to="/app/reviews" className="block">
              <Button
                variant="secondary"
                size="md"
                className="w-full justify-center font-semibold py-2.5 rounded-xl border border-[#DCE6F0] text-[#17324D] hover:bg-[#F3F8FE]"
                icon={<ArrowRight className="w-4 h-4 text-[#1976D2]" />}
              >
                Review Knowledge
              </Button>
            </Link>
          </div>
        </Card>

        {/* Card 3: Knowledge Assistant */}
        <Card className="p-6 flex flex-col justify-between border-[#DCE6F0] hover:border-[#1976D2]/60 hover:shadow-md transition-all duration-200 group bg-white rounded-2xl">
          <div className="space-y-4">
            {/* Visual Icon Illustration */}
            <div className="w-14 h-14 rounded-2xl bg-[#EAF3FF] border border-[#BCD7F5] flex items-center justify-center text-[#1976D2] shadow-xs group-hover:scale-105 transition-transform">
              <Bot className="w-7 h-7 text-[#1976D2]" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#17324D] tracking-tight group-hover:text-[#1976D2] transition-colors">
                  Knowledge Assistant
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-[#1976D2] border border-blue-200">
                  AI Grounded
                </span>
              </div>
              <p className="text-xs text-[#5D7188] mt-1.5 leading-relaxed">
                Find machine-specific procedures, practical tips, and previously documented solutions.
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#7C8DA1] pt-1">
              <Sparkles className="w-3.5 h-3.5 text-[#1976D2]" />
              Grounded strictly in verified SOP documents
            </div>
          </div>

          <div className="pt-6">
            <Link to="/app/assistant" className="block">
              <Button
                variant="secondary"
                size="md"
                className="w-full justify-center font-semibold py-2.5 rounded-xl border border-[#DCE6F0] text-[#17324D] hover:bg-[#F3F8FE]"
                icon={<ArrowRight className="w-4 h-4 text-[#1976D2]" />}
              >
                Ask the Assistant
              </Button>
            </Link>
          </div>
        </Card>

      </div>
    </section>
  );
};
