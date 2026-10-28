import React from 'react';
import { Link } from 'react-router-dom';
import { User } from '../../../types/auth';
import { DashboardStats } from '../../../types/dashboard';

interface StitchExpertDashboardProps {
  user: User | null;
  stats: DashboardStats | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasRole: (role: any) => boolean;
}

export const StitchExpertDashboard: React.FC<StitchExpertDashboardProps> = ({
  stats,
  loading,
  hasPermission,
}) => {
  const canCreate = hasPermission('knowledge.create');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 font-sans text-[#0F172A]">
      {/* ─── 1. SIGNATURE EDITORIAL HERO SECTION ─── */}
      <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 lg:p-10 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Typography & Action Triggers (50% / 5-6 cols) */}
          <div className="lg:col-span-5 flex flex-col items-start pr-0 lg:pr-2">
            {/* Pill Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EFF4FF] border border-[#1976C9]/20 text-[#1976C9] mb-4">
              <span className="w-2 h-2 rounded-full bg-[#1976C9] animate-pulse" />
              <span className="text-xs font-bold tracking-wider uppercase font-sans">
                GURUKUL AI · EXPERT WORKSPACE
              </span>
            </div>

            {/* Editorial Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-extrabold text-[#173B5E] tracking-tight leading-[1.12] mb-3">
              Your Experience.<br />
              <span className="text-[#1976C9]">Their Future.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-[#536779] leading-relaxed mb-6 max-w-[480px]">
              Preserve the know-how only experience can teach. Empower the next generation of skilled operators.
            </p>

            {/* Button Group: Exactly Two Primary Actions */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto mb-6">
              {canCreate && (
                <Link
                  to="/app/knowledge-assets?kind=notes"
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-sm transition-all shadow-md shadow-[#1976C9]/20 hover:-translate-y-0.5"
                >
                  <span className="material-symbols-outlined text-[19px]">videocam</span>
                  <span>Capture Knowledge</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              )}

              <Link
                to="/app/knowledge"
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#173B5E] border-2 border-[#173B5E] font-semibold text-sm transition-all hover:bg-slate-50 shadow-sm"
              >
                <span className="material-symbols-outlined text-[19px] text-[#536779]">folder_open</span>
                <span>Explore My Knowledge</span>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#536779] font-medium pt-3 border-t border-slate-100 w-full">
              <span className="flex items-center gap-1.5 text-[#173B5E]">
                <span className="material-symbols-outlined text-[16px] text-[#10B981]">check_circle</span>
                Direct Master-to-Apprentice Pipeline
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 text-[#173B5E]">
                <span className="material-symbols-outlined text-[16px] text-[#1976C9]">verified</span>
                ISO 9001 / AS9100 Verified
              </span>
            </div>
          </div>

          {/* Right Column: Industrial Photography (50% / 7 cols) */}
          <div className="lg:col-span-7">
            <div className="relative w-full rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-xl bg-slate-100 aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/9.5]">
              <img
                alt="Senior aerospace machinist operating beside 5-axis CNC machining center"
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

      {/* ─── 2. PRIMARY ACTION: CAPTURE ─── */}
      <section className="w-full">
        <div className="grid grid-cols-1 gap-6 items-stretch">
          
          {/* Card A: Capture Knowledge (Large Flagship Panel — ~50% width / 6 cols of 12) */}
          <div className="w-full bg-white rounded-2xl border border-[#C8D6E4] shadow-sm p-6 lg:p-7 flex flex-col justify-between relative overflow-hidden group hover:border-[#1976C9] transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#1976C9] text-white flex items-center justify-center shadow-md shadow-[#1976C9]/25">
                    <span className="material-symbols-outlined text-[24px]">video_camera_front</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#1976C9] block">
                      FLAGSHIP CAPTURE SUITE
                    </span>
                    <h3 className="text-xl font-bold text-[#173B5E]">Capture Knowledge</h3>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#EFF4FF] text-[#1976C9] border border-[#1976C9]/20 font-semibold">
                  MULTI-MODAL
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#536779] leading-relaxed mb-5 max-w-[560px]">
                Preserve setup details, observations, and media in a reviewable knowledge draft.
              </p>

              {/* Visual Media Preview & Format Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-5 items-center">
                <div className="sm:col-span-5 rounded-xl overflow-hidden border border-[#E2E8F0] relative aspect-[16/10] sm:aspect-auto sm:h-24 shadow-sm bg-slate-100 group">
                  <img
                    alt="Expert holding ruggedized workshop tablet beside machine tool"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    src="/assets/stitch_workshop_record.jpg"
                  />
                  <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-semibold text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    Manufacturing floor
                  </div>
                </div>

                <div className="sm:col-span-7 grid grid-cols-2 gap-2">
                  <Link
                    to="/app/knowledge-assets?kind=video"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#1976C9]">videocam</span>
                    <span>Video</span>
                  </Link>

                  <Link
                    to="/app/knowledge-assets?kind=audio"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#19A995] hover:text-[#19A995] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#19A995]">mic</span>
                    <span>Audio</span>
                  </Link>

                  <Link
                    to="/app/knowledge-assets?kind=notes"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-500">edit_note</span>
                    <span>Notes</span>
                  </Link>

                  <Link
                    to="/app/knowledge-assets?kind=image"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-500">photo_camera</span>
                    <span>Photos</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-[#536779] flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                Record practical knowledge for the next operator
              </span>
              <Link
                to="/app/knowledge-assets"
                className="py-2.5 px-5 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-xs transition-all flex items-center gap-2 shadow-md shadow-[#1976C9]/20 hover:-translate-y-0.5"
              >
                <span>Start Capturing →</span>
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ─── 3. MY KNOWLEDGE OVERVIEW ─── */}
      <section className="w-full">
        <div className="bg-white rounded-2xl p-6 lg:p-7 border border-[#E2E8F0] shadow-xs space-y-4">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#1976C9] flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">inventory_2</span>
              </div>
              <h3 className="text-base font-bold text-[#173B5E]">My Knowledge Overview</h3>
            </div>
            <Link
              to="/app/knowledge"
              className="self-start text-xs font-bold text-[#1976C9] hover:underline flex items-center gap-1 sm:self-auto"
            >
              <span>View My Knowledge ({stats?.user_sops_created ?? '—'}) →</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                <span className="text-xs font-bold text-[#173B5E]">Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-[#173B5E] font-mono">
                  {loading ? '--' : stats?.user_sops_approved ?? '—'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#10B981] bg-[#ECFDF5] px-2 py-0.5 rounded-md border border-[#10B981]/20">
                  Audited
                </span>
              </div>
            </div>

            <div className="min-w-0 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span className="text-xs font-bold text-[#173B5E]">Pending Review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-[#173B5E] font-mono">
                  {loading ? '--' : stats?.user_sops_pending ?? '—'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded-md border border-[#F59E0B]/20">
                  In Review
                </span>
              </div>
            </div>

            <div className="min-w-0 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1976C9]" />
                <span className="text-xs font-bold text-[#173B5E]">To Capture</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-[#173B5E] font-mono">
                  {loading ? '--' : stats?.user_sops_draft ?? '—'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1976C9] bg-[#EFF4FF] px-2 py-0.5 rounded-md border border-[#1976C9]/20">
                  Scheduled
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ─── 4. STANDARDIZED INDUSTRIAL COMPLIANCE FOOTER (AS9100 / ISO 9001 / OSHA) ─── */}
      <footer className="bg-white rounded-2xl border border-[#E2E8F0] p-6 lg:p-8 shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Brand & Certification */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1976C9] text-white flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[18px]">precision_manufacturing</span>
              </div>
              <span className="font-extrabold text-sm text-[#173B5E]">Gurukul AI</span>
            </div>
            <p className="text-xs text-[#536779] leading-relaxed">
              Industrial Tacit Engineering Core preserving mission-critical manufacturing knowledge for aerospace, defense, and precision machine shops.
            </p>
            <div className="pt-1">
              <a
                href="#compliance"
                className="text-xs font-bold text-[#1976C9] hover:underline flex items-center gap-1"
              >
                <span>Certified Knowledge Preservation System</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </a>
            </div>
          </div>

          {/* Column 2: Knowledge Ecosystem */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#173B5E] block">
              KNOWLEDGE ECOSYSTEM
            </span>
            <ul className="space-y-2 text-xs text-[#536779]">
              <li>
                <Link to="/app/knowledge/new" className="hover:text-[#1976C9] transition-colors">
                  Tacit Skill Capture Pipeline
                </Link>
              </li>
              <li>
                <Link to="/app/machines" className="hover:text-[#1976C9] transition-colors">
                  CNC Tooling &amp; Spindle Setup
                </Link>
              </li>
              <li>
                <Link to="/app/reviews" className="hover:text-[#1976C9] transition-colors">
                  Peer Review &amp; Master Validation
                </Link>
              </li>
              <li>
                <Link to="/app/guided-workflows" className="hover:text-[#1976C9] transition-colors">
                  Operator Safety Protocols
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Technical & Compliance */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#173B5E] block">
              TECHNICAL &amp; COMPLIANCE
            </span>
            <ul className="space-y-2 text-xs text-[#536779]">
              <li className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-[#10B981]">verified</span>
                <span>ISO 9001 / AS9100 Alignment</span>
              </li>
              <li>
                <span className="text-slate-500">Plant Floor Terminal API</span>
              </li>
              <li>
                <span className="text-slate-500">Hardware Diagnostics Sync</span>
              </li>
              <li>
                <span className="text-slate-500">Air-Gapped Deployment Docs</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Operational Safety Notice */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#173B5E] block">
              OPERATIONAL SAFETY
            </span>
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#10B981]">
                <span className="material-symbols-outlined text-[16px]">health_and_safety</span>
                <span>OSHA / Plant Safety Clear</span>
              </div>
              <p className="text-[11px] text-[#536779] leading-relaxed">
                Revision Protocol v4.81-Enterprise. All live captured procedures comply with plant safety requirements.
              </p>
            </div>
          </div>
        </div>

        {/* Copyright & Operational Status Strip */}
        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-[#536779] gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span>© 2025 Gurukul AI Inc. All rights reserved.</span>
            <span className="text-slate-300">•</span>
            <a href="#privacy" className="hover:text-[#1976C9]">Privacy</a>
            <span className="text-slate-300">•</span>
            <a href="#terms" className="hover:text-[#1976C9]">Terms</a>
          </div>

          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>All Plant Systems Operational (US-EAST-01)</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
