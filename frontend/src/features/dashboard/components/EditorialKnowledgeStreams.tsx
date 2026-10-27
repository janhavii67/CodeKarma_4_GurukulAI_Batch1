import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { DashboardStats } from '../../../types/dashboard';
import {
  CheckCircle2,
  Clock,
  FileText,
  Play,
  Mic,
  ArrowRight,
  ShieldCheck,
  Video,
  Plus,
} from 'lucide-react';

interface EditorialKnowledgeStreamsProps {
  stats: DashboardStats | null;
  loading: boolean;
  canCreateKnowledge: boolean;
}

export const EditorialKnowledgeStreams: React.FC<EditorialKnowledgeStreamsProps> = ({
  stats,
  loading,
  canCreateKnowledge,
}) => {
  const recentArticles = stats?.recent_articles || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* ─── COLUMN 1: MY KNOWLEDGE (3 COLS) ─── */}
      <div className="lg:col-span-3 space-y-3">
        <h2 className="text-base font-bold text-[#17324D] tracking-tight">
          My Knowledge
        </h2>

        <div className="space-y-3">
          {/* Verified Knowledge Stat */}
          <Link to="/app/knowledge" className="block focus:outline-none focus:ring-2 focus:ring-[#1976D2] rounded-2xl">
            <Card className="p-4 bg-white border-[#DCE6F0] hover:border-[#1976D2]/60 hover:shadow-sm transition-all duration-150 flex items-center justify-between group rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#15966A] flex items-center justify-center border border-emerald-200 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#5D7188] block">
                    Verified Knowledge
                  </span>
                  <span className="text-xl font-bold font-mono text-[#17324D]">
                    {loading ? '--' : stats?.user_sops_approved ?? 0}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7C8DA1] group-hover:text-[#1976D2] group-hover:translate-x-0.5 transition-all" />
            </Card>
          </Link>

          {/* Pending Review Stat */}
          <Link to="/app/reviews" className="block focus:outline-none focus:ring-2 focus:ring-[#1976D2] rounded-2xl">
            <Card className="p-4 bg-white border-[#DCE6F0] hover:border-[#D98B13]/60 hover:shadow-sm transition-all duration-150 flex items-center justify-between group rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-[#D98B13] flex items-center justify-center border border-amber-200 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#5D7188] block">
                    Pending Review
                  </span>
                  <span className="text-xl font-bold font-mono text-[#17324D]">
                    {loading ? '--' : stats?.user_sops_pending ?? 0}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7C8DA1] group-hover:text-[#D98B13] group-hover:translate-x-0.5 transition-all" />
            </Card>
          </Link>

          {/* Knowledge to Preserve Stat */}
          <Link to="/app/knowledge" className="block focus:outline-none focus:ring-2 focus:ring-[#1976D2] rounded-2xl">
            <Card className="p-4 bg-white border-[#DCE6F0] hover:border-[#1976D2]/60 hover:shadow-sm transition-all duration-150 flex items-center justify-between group rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1976D2] flex items-center justify-center border border-[#BCD7F5] shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#5D7188] block">
                    Knowledge to Preserve
                  </span>
                  <span className="text-xl font-bold font-mono text-[#17324D]">
                    {loading ? '--' : stats?.user_sops_created ?? 0}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7C8DA1] group-hover:text-[#1976D2] group-hover:translate-x-0.5 transition-all" />
            </Card>
          </Link>
        </div>
      </div>

      {/* ─── COLUMN 2: RECENT KNOWLEDGE STREAM (5 COLS) ─── */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#17324D] tracking-tight">
            Recent Knowledge Stream
          </h2>
          <Link
            to="/app/knowledge"
            className="text-xs text-[#1976D2] hover:underline font-medium"
          >
            View all ({recentArticles.length})
          </Link>
        </div>

        <Card className="p-0 border-[#DCE6F0] rounded-2xl overflow-hidden bg-white">
          {loading ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl" />
              ))}
            </div>
          ) : recentArticles.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3FF] text-[#1976D2] flex items-center justify-center mx-auto">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-[#17324D] block">
                  No Knowledge Entries Recorded
                </span>
                <span className="text-xs text-[#5D7188] block mt-1">
                  Standard Operating Procedures will appear here once authored or synchronized.
                </span>
              </div>
              {canCreateKnowledge && (
                <div className="pt-2">
                  <Link to="/app/knowledge/new">
                    <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />}>
                      Capture First SOP
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[#E8EEF5]">
              {recentArticles.slice(0, 4).map((art) => {
                const isApproved = ['approved', 'published'].includes(art.status?.toLowerCase());
                return (
                  <li
                    key={art.id}
                    className="p-3.5 hover:bg-[#F8FAFD] transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/app/knowledge/${art.id}`}
                        className="text-xs font-bold text-[#17324D] hover:text-[#1976D2] truncate block"
                      >
                        {art.title}
                      </Link>
                      <div className="flex items-center gap-2 text-[11px] text-[#7C8DA1] mt-0.5">
                        <span>{art.author_name}</span>
                        {art.machine_name && (
                          <>
                            <span>·</span>
                            <span className="text-[#1976D2]">{art.machine_name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          isApproved
                            ? 'bg-emerald-50 text-[#15966A] border border-emerald-200'
                            : 'bg-amber-50 text-[#D98B13] border border-amber-200'
                        }`}
                      >
                        {isApproved ? 'Verified' : 'Pending'}
                      </span>
                      <Link to={`/app/knowledge/${art.id}`}>
                        <Button variant="ghost" size="sm" className="p-1 h-auto text-xs">
                          <ArrowRight className="w-3.5 h-3.5 text-[#7C8DA1] hover:text-[#1976D2]" />
                        </Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ─── COLUMN 3: RECENTLY SHARED (4 COLS) ─── */}
      <div className="lg:col-span-4 space-y-3">
        <h2 className="text-base font-bold text-[#17324D] tracking-tight">
          Recently Shared
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
          
          {/* Card: Video Procedure */}
          <Card className="p-3.5 border-[#DCE6F0] rounded-2xl bg-white hover:border-[#1976D2]/60 hover:shadow-xs transition-all flex items-center gap-3 group">
            <div className="w-14 h-14 rounded-xl bg-slate-900 relative overflow-hidden shrink-0 flex items-center justify-center text-white shadow-xs">
              <img
                src="/assets/lab_hero_banner.jpg"
                alt="Setup technique"
                className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-[#17324D] group-hover:text-[#1976D2] truncate block">
                CNC Machine Setup Techniques
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#15966A] border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </span>
                <span className="text-[10px] text-[#7C8DA1]">Video SOP</span>
              </div>
            </div>
          </Card>

          {/* Card: Voice Note Audio */}
          <Link to="/app/voice-capture" className="block focus:outline-none">
            <Card className="p-3.5 border-[#DCE6F0] rounded-2xl bg-white hover:border-[#1976D2]/60 hover:shadow-xs transition-all flex items-center gap-3 group">
              <div className="w-14 h-14 rounded-xl bg-[#EAF3FF] border border-[#BCD7F5] shrink-0 flex items-center justify-center text-[#1976D2] group-hover:scale-105 transition-transform">
                <Mic className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-[#17324D] group-hover:text-[#1976D2] truncate block">
                  Tool Wear Warning Signs
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#15966A] border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                  <span className="text-[10px] text-[#7C8DA1]">Voice Note</span>
                </div>
              </div>
            </Card>
          </Link>

          {/* Card: Diagnostics Inspection */}
          <Link to="/app/sound-analysis" className="block focus:outline-none">
            <Card className="p-3.5 border-[#DCE6F0] rounded-2xl bg-white hover:border-[#1976D2]/60 hover:shadow-xs transition-all flex items-center gap-3 group">
              <div className="w-14 h-14 rounded-xl bg-slate-100 border border-[#DCE6F0] shrink-0 flex items-center justify-center text-[#17324D] group-hover:scale-105 transition-transform">
                <Video className="w-6 h-6 text-[#1976D2]" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-[#17324D] group-hover:text-[#1976D2] truncate block">
                  Machine Procedure Tolerances
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#15966A] border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                  <span className="text-[10px] text-[#7C8DA1]">Acoustic baseline</span>
                </div>
              </div>
            </Card>
          </Link>

        </div>
      </div>

    </div>
  );
};
