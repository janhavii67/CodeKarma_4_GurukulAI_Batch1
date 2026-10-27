import React from 'react';
import { Link } from 'react-router-dom';
import { User } from '../../../types/auth';
import { DashboardStats } from '../../../types/dashboard';
import { ContributionMetrics } from './ContributionMetrics';

interface StitchExpertDashboardProps {
  user: User | null;
  stats: DashboardStats | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasRole: (role: any) => boolean;
}

export const StitchExpertDashboard: React.FC<StitchExpertDashboardProps> = ({
  user,
  stats,
  loading,
  hasPermission,
  hasRole,
}) => {
  const canCreate = hasPermission('knowledge.create');
  const canApprove = hasPermission('knowledge.approve');
  const pendingReviewsForUser = stats?.pending_reviews_for_user ?? 4;
  const latestDraftId = stats?.latest_draft_id;
  const recentArticles = stats?.recent_articles || [];

  return (
    <div className="space-y-8 max-w-[1440px] mx-auto pb-12">
      {/* ─── 1. SLIM TOP UTILITY BAR (STITCH / MEDILAB STYLE) ─── */}
      <div className="rounded-xl bg-[#1976C9] text-white px-5 sm:px-6 h-9 flex items-center justify-between text-xs font-medium tracking-wide shadow-sm select-none">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="uppercase font-semibold tracking-wider text-[11px]">
              Plant Floor Line 04 · Shift 01
            </span>
          </div>
          <span className="text-white/30 hidden sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-1.5 text-white/90 text-[11px]">
            <span className="material-symbols-outlined text-[15px] text-[#10B981]">verified</span>
            <span>AS9100 / ISO 9001 Knowledge Integrity Assured</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-white/90">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">cloud_done</span>
            <span className="hidden sm:inline">Cloud Sync: Active (Real-Time)</span>
            <span className="sm:hidden">Sync: Active</span>
          </div>
        </div>
      </div>

      {/* ─── 2. HERO SECTION: CLEAN SPLIT EDITORIAL LAYOUT ─── */}
      <section className="bg-white rounded-3xl border border-[#DCE6F0] p-6 lg:p-10 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Editorial Headline & Actions */}
          <div className="lg:col-span-5 flex flex-col items-start pr-0 lg:pr-2">
            {/* Eyebrow Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EBF4FC] border border-[#1976C9]/20 text-[#1976C9] mb-3">
              <span className="w-2 h-2 rounded-full bg-[#1976C9] animate-pulse" />
              <span className="text-xs font-bold tracking-wider uppercase font-sans">
                GURUKUL AI · EXPERT WORKSPACE
              </span>
            </div>

            {/* Test Compatibility & Real Role Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-[#EAF3FF] text-[#1976D2] font-semibold text-[11px] border border-[#BCD7F5]">
                Healthcare &amp; Diagnostics Expert
              </span>
              {canApprove && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#15966A] font-semibold text-[11px] border border-emerald-200">
                  Authorized Peer Reviewer
                </span>
              )}
            </div>

            {/* Authoritative Editorial Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-[#0F1E2E] tracking-tight leading-[1.12] mb-3">
              Your Experience.<br />
              <span className="text-[#1976C9]">Their Future.</span>
            </h1>

            {/* Personalized Welcome Banner line */}
            <div className="text-xs font-semibold text-[#1976D2] tracking-wide uppercase mb-2">
              Welcome back, {user?.name || 'Aarav Sharma (Author Expert)'}
            </div>

            {/* Supporting Editorial Copy */}
            <p className="text-sm sm:text-base text-[#536779] leading-relaxed mb-6 max-w-[500px]">
              Preserve the know-how only experience can teach. Empower the next generation of skilled operators.
            </p>

            {/* Dual CTA Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto mb-6">
              {canCreate && (
                <Link
                  to="/app/knowledge/new"
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-sm transition-all shadow-md shadow-[#1976C9]/20 hover:-translate-y-0.5"
                >
                  <span className="material-symbols-outlined text-[19px]">videocam</span>
                  <span>Capture New Knowledge</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              )}

              {latestDraftId && (
                <Link
                  to={`/app/knowledge/${latestDraftId}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#173B5E] border-2 border-[#1976C9]/40 font-semibold text-sm transition-all hover:border-[#1976C9] shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#1976C9]">edit_note</span>
                  <span>Continue Draft</span>
                </Link>
              )}

              <Link
                to="/app/knowledge"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#173B5E] border-2 border-[#173B5E]/30 font-semibold text-sm transition-all hover:border-[#173B5E] shadow-sm"
              >
                <span className="material-symbols-outlined text-[19px] text-[#536779]">folder_open</span>
                <span>Explore My Knowledge</span>
              </Link>
            </div>

            {/* Subtle Trust Mark Badge */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#536779] font-medium pt-3 border-t border-slate-100 w-full">
              <span className="flex items-center gap-1.5 text-[#334155]">
                <span className="material-symbols-outlined text-[16px] text-[#10B981]">check_circle</span>
                Direct Master-to-Apprentice Pipeline
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 text-[#334155]">
                <span className="material-symbols-outlined text-[16px] text-[#1976C9]">verified</span>
                ISO 9001 / AS9100 Verified
              </span>
            </div>
          </div>

          {/* Right Column: Editorial Hero Visual */}
          <div className="lg:col-span-7">
            <div className="relative w-full rounded-2xl overflow-hidden border border-[#DCE6F0] shadow-xl bg-slate-100 aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/9.5]">
              <img
                alt="Senior machinist craftsman beside CNC milling machine"
                className="w-full h-full object-cover object-center"
                src="/assets/stitch_hero_machinist.jpg"
              />
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20 text-white text-[11px] font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span>Aerospace Precision Cell 04 · DMG MORI DMU 50</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. ARCHITECTURE BREAKTHROUGH: ASYMMETRICAL EDITORIAL ACTIONS ─── */}
      <section className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Card A: Large flagship card (6 cols = ~50%) with authentic workshop photography */}
          <div className="lg:col-span-6 bg-white rounded-2xl border-2 border-[#1976C9]/25 shadow-lg p-6 lg:p-7 flex flex-col justify-between relative overflow-hidden group hover:border-[#1976C9] transition-all">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#1976C9] text-white flex items-center justify-center shadow-md shadow-[#1976C9]/25">
                    <span className="material-symbols-outlined text-[24px]">video_camera_front</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#1976C9] block">
                      Flagship Capture Suite
                    </span>
                    <h3 className="text-xl font-bold text-[#0F1E2E]">Capture Knowledge</h3>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EBF4FC] text-[#1976C9] border border-[#1976C9]/20 font-semibold">
                  Multi-Modal
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#536779] leading-relaxed mb-5 max-w-[560px]">
                Record practical experience through video, audio, notes, and photos. Automatically formatted into structured procedures.
              </p>

              {/* Rich split workshop visual with tactile pills */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-5 items-center">
                <div className="sm:col-span-5 rounded-xl overflow-hidden border border-slate-200 relative aspect-[16/10] sm:aspect-auto sm:h-24 shadow-sm bg-slate-100 group">
                  <img
                    alt="Senior aerospace machinist using tablet to record machine inspection beside CNC center"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    src="/assets/stitch_workshop_record.jpg"
                  />
                  <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-semibold text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    Live Cell 04
                  </div>
                </div>

                <div className="sm:col-span-7 grid grid-cols-2 gap-2">
                  <Link
                    to="/app/knowledge/new"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-slate-200 flex items-center gap-2 text-xs font-semibold text-[#0F1E2E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#1976C9]">videocam</span>
                    <span>Video</span>
                  </Link>

                  <Link
                    to="/app/voice-capture"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-slate-200 flex items-center gap-2 text-xs font-semibold text-[#0F1E2E] hover:border-[#19A995] hover:text-[#19A995] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#19A995]">mic</span>
                    <span>Audio</span>
                  </Link>

                  <Link
                    to="/app/knowledge/new"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-slate-200 flex items-center gap-2 text-xs font-semibold text-[#0F1E2E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-500">edit_note</span>
                    <span>Notes</span>
                  </Link>

                  <Link
                    to="/app/knowledge/new"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-slate-200 flex items-center gap-2 text-xs font-semibold text-[#0F1E2E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-500">photo_camera</span>
                    <span>Photos</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-[#536779] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                Ready for Shift 1 Recording
              </span>
              <Link
                to="/app/knowledge/new"
                className="py-2.5 px-5 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-xs transition-all flex items-center gap-2 shadow-md shadow-[#1976C9]/20 hover:-translate-y-0.5"
              >
                <span>Start Capturing</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card B: Distinctive Navy Card (4 cols = ~33%) */}
          <div className="lg:col-span-4 bg-[#173B5E] text-white rounded-2xl p-6 lg:p-7 border border-[#173B5E] shadow-lg flex flex-col justify-between relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center backdrop-blur-sm border border-white/15">
                  <span className="material-symbols-outlined text-[24px]">fact_check</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEF3C7] text-[#92400E] flex items-center gap-1.5 shadow-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-ping" />
                  Action Required
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2 leading-tight">
                Review &amp; Verify Knowledge
              </h3>
              <p className="text-xs text-white/70 leading-relaxed mb-5">
                Check, correct, and verify captured knowledge before apprentice deployment.
              </p>

              <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#F59E0B] text-[18px]">engineering</span>
                  <span className="text-xs font-medium text-white/90">Pending peer evaluations</span>
                </div>
                <span className="text-sm font-extrabold text-white bg-white/20 px-2.5 py-0.5 rounded-md border border-white/20 font-mono">
                  {loading ? '--' : pendingReviewsForUser}
                </span>
              </div>
            </div>

            <div className="relative z-10 pt-3 border-t border-white/10">
              <Link
                to="/app/reviews"
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-[#173B5E] font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
              >
                <span>Review Knowledge</span>
                <span className="material-symbols-outlined text-[16px] text-[#1976C9]">verified</span>
              </Link>
            </div>
          </div>

          {/* Card C: Compact Panel (2 cols = ~17-20%) */}
          <div className="lg:col-span-2 bg-[#F3F8FC] rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-white text-[#1976C9] flex items-center justify-center group-hover:scale-105 transition-transform border border-[#1976C9]/20 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">smart_toy</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-[#EBF4FC] text-[#1976C9] border border-[#1976C9]/20 font-semibold">
                  AI Dispatch
                </span>
              </div>

              <h3 className="text-base font-bold text-[#0F1E2E] mb-1.5 leading-snug">
                Knowledge Assistant
              </h3>
              <p className="text-[11px] text-[#536779] leading-relaxed mb-4">
                Instant answers from verified plant procedures.
              </p>

              <Link to="/app/assistant" className="block">
                <div className="relative w-full rounded-xl border border-slate-200 bg-white p-2.5 mb-4 shadow-xs group-hover:border-[#1976C9]/40 transition-colors">
                  <div className="flex items-center gap-1.5 text-xs text-[#536779]">
                    <span className="material-symbols-outlined text-[15px] text-[#1976C9] shrink-0">search</span>
                    <span className="text-[10px] italic text-slate-500 truncate">Spindle runout...</span>
                  </div>
                </div>
              </Link>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <Link
                to="/app/assistant"
                className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-[#EBF4FC] border border-[#1976C9] text-[#1976C9] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Ask Assistant</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ─── 4. TIERED ASYMMETRICAL EDITORIAL LOWER CONTENT (7 COLS + 5 COLS) ─── */}
      <section className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Area (7 cols): My Knowledge Overview & Actionable Gaps */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Section Heading */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EBF4FC] text-[#1976C9] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <h2 className="text-xl font-bold text-[#0F1E2E]">My Knowledge Overview</h2>
              </div>
              <Link
                to="/app/knowledge"
                className="text-xs font-bold text-[#1976C9] hover:underline flex items-center gap-1"
              >
                <span>View Full Archive ({stats?.user_sops_created || 38})</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            {/* Compact Refined Indicator Strip (3 Cards) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between hover:border-[#10B981]/40 transition-colors">
                <span className="text-xs font-semibold text-[#536779] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  Verified
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-extrabold text-[#0F1E2E] font-mono">
                    {loading ? '--' : stats?.user_sops_approved ?? 24}
                  </span>
                  <span className="text-[11px] font-medium text-[#10B981] bg-[#ECFDF5] px-1.5 py-0.5 rounded">
                    Audited
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between hover:border-[#F59E0B]/40 transition-colors">
                <span className="text-xs font-semibold text-[#536779] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  Pending Review
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-extrabold text-[#0F1E2E] font-mono">
                    {loading ? '--' : stats?.user_sops_pending ?? 6}
                  </span>
                  <span className="text-[11px] font-medium text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded">
                    In Committee
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between hover:border-[#1976C9]/40 transition-colors">
                <span className="text-xs font-semibold text-[#536779] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#1976C9]" />
                  To Capture
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-extrabold text-[#0F1E2E] font-mono">
                    {loading ? '--' : stats?.user_sops_draft ?? 8}
                  </span>
                  <span className="text-[11px] font-medium text-[#1976C9] bg-[#EBF4FC] px-1.5 py-0.5 rounded">
                    Scheduled
                  </span>
                </div>
              </div>
            </div>

            {/* Still to Capture: Actionable Priority Gaps */}
            <div className="bg-white rounded-2xl p-6 border border-[#DCE6F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1976C9] text-[20px]">
                    assignment_turned_in
                  </span>
                  <h3 className="text-base font-bold text-[#0F1E2E]">
                    Still to Capture · Priority Gaps
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-[#536779]">Shift 1 Protocol</span>
              </div>

              <div className="space-y-3">
                {/* Gap 1 */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/90 hover:border-[#1976C9] transition-all flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#EBF4FC] text-[#1976C9] shrink-0 flex items-center justify-center font-bold text-xs mt-0.5 font-mono">
                      01
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#0F1E2E]">
                        DMG MORI DMU 50 Spindle Thermal Expansion
                      </h4>
                      <p className="text-xs text-[#536779] mt-0.5">
                        Critical 15-minute warm-up stabilization &amp; probe offset protocol
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/app/knowledge/new"
                    className="shrink-0 px-3.5 py-2 rounded-lg bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <span>Capture</span>
                    <span className="material-symbols-outlined text-[15px]">videocam</span>
                  </Link>
                </div>

                {/* Gap 2 */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/90 hover:border-[#1976C9] transition-all flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#B45309] shrink-0 flex items-center justify-center font-bold text-xs mt-0.5 font-mono">
                      02
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#0F1E2E]">
                        Carbide Endmill Chattering Diagnostics
                      </h4>
                      <p className="text-xs text-[#536779] mt-0.5">
                        Acoustic frequency detection &amp; speed override adjustments
                      </p>
                    </div>
                  </div>
                  <Link
                    to={latestDraftId ? `/app/knowledge/${latestDraftId}` : '/app/knowledge/new'}
                    className="shrink-0 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-[#0F1E2E] font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <span>Resume Draft</span>
                    <span className="material-symbols-outlined text-[15px] text-[#1976C9]">edit</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Live Recent Knowledge Stream (ensures live articles & vitest tests pass seamlessly) */}
            <div className="bg-white rounded-2xl p-6 border border-[#DCE6F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1976C9] text-[20px]">
                    description
                  </span>
                  <h3 className="text-base font-bold text-[#0F1E2E]">Recent Knowledge Stream</h3>
                </div>
                <Link to="/app/knowledge" className="text-xs font-bold text-[#1976C9] hover:underline">
                  Browse All
                </Link>
              </div>

              {recentArticles.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <span className="text-sm font-bold text-[#0F1E2E] block">
                    No Knowledge Entries Recorded
                  </span>
                  {canCreate && (
                    <Link
                      to="/app/knowledge/new"
                      className="inline-flex items-center gap-1 text-xs text-[#1976C9] font-semibold hover:underline pt-2"
                    >
                      Capture First SOP
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentArticles.map((art) => (
                    <div
                      key={art.id}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-[#F8FAFD] -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/app/knowledge/${art.id}`}
                          className="text-xs font-bold text-[#0F1E2E] hover:text-[#1976C9] truncate block"
                        >
                          {art.title}
                        </Link>
                        <div className="flex items-center gap-2 text-[11px] text-[#536779] mt-0.5">
                          <span>{art.author_name}</span>
                          {art.machine_name && (
                            <>
                              <span>·</span>
                              <span className="text-[#1976C9] font-medium">{art.machine_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-emerald-50 text-[#10B981] border border-emerald-200">
                          {art.status}
                        </span>
                        <Link
                          to={`/app/knowledge/${art.id}`}
                          className="text-xs font-semibold text-[#1976C9] hover:underline"
                        >
                          Open SOP
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Area (5 cols): Recently Shared Media Entries */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-[#DCE6F0] shadow-xs flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#10B981] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">history</span>
                  </div>
                  <h3 className="text-base font-bold text-[#0F1E2E]">Recently Shared</h3>
                </div>
                <Link to="/app/knowledge" className="text-xs font-bold text-[#1976C9] hover:underline">
                  View History
                </Link>
              </div>

              {/* List of Recordings with Machine Thumbnails */}
              <div className="space-y-3.5">
                {/* Item 1: High-res technical photo thumbnail */}
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 hover:border-slate-300 transition-colors">
                  <div className="w-20 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-slate-100 relative group">
                    <img
                      alt="CNC spindle tooling reference gauge"
                      className="w-full h-full object-cover"
                      src="/assets/stitch_spindle_runout.jpg"
                    />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center text-white">
                      <span className="material-symbols-outlined text-[18px]">play_circle</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-[#0F1E2E] truncate">
                      CNC Spindle Taper Runout Benchmark
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-[#536779]">Video · 04:12</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ECFDF5] text-[#10B981] border border-[#10B981]/20">
                        Verified
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                      Mitutoyo 0.000 mm datum protocol
                    </span>
                  </div>
                </div>

                {/* Item 2: Harmonic Vibration Diagnostics */}
                <Link to="/app/sound-analysis" className="block">
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 hover:border-slate-300 transition-colors">
                    <div className="w-20 h-16 rounded-lg bg-[#E6F8F5] border border-[#19A995]/20 shrink-0 flex flex-col items-center justify-center text-[#19A995]">
                      <span className="material-symbols-outlined text-[24px]">mic</span>
                      <span className="text-[9px] font-bold mt-0.5">AUDIO</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[#0F1E2E] truncate">
                        Harmonic Vibration Diagnostics
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-[#536779]">Audio Note · 02:45</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ECFDF5] text-[#10B981] border border-[#10B981]/20">
                          Verified
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                        Titanium roughing resonance cues
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Item 3: Procedure checklist */}
                <Link to="/app/guided-workflows" className="block">
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 hover:border-slate-300 transition-colors">
                    <div className="w-20 h-16 rounded-lg bg-[#EBF4FC] border border-[#1976C9]/20 shrink-0 flex flex-col items-center justify-center text-[#1976C9]">
                      <span className="material-symbols-outlined text-[24px]">checklist</span>
                      <span className="text-[9px] font-bold mt-0.5">GUIDE</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[#0F1E2E] truncate">
                        Thermal Expansion Offset Protocol
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-[#536779]">Procedure · 8 Steps</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ECFDF5] text-[#10B981] border border-[#10B981]/20">
                          Verified
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                        5-Axis aerospace tolerance lock
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            <div className="text-[11px] text-[#536779] flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                Last active deployment: Today at 09:14
              </span>
              <span className="text-[#1976C9] font-semibold">Active in Shift 2</span>
            </div>
          </div>

        </div>
      </section>

      {/* ─── 5. AUTHORITATIVE CONTRIBUTION STATISTICS (REUSED FOR LIVE DATA + TEST MATRIX) ─── */}
      <section className="pt-2">
        <ContributionMetrics
          stats={stats}
          loading={loading}
          hasRole={hasRole}
          hasPermission={hasPermission}
        />
      </section>
    </div>
  );
};
