import React from 'react';
import { Link } from 'react-router-dom';

interface StitchExpertDashboardProps {
  hasPermission: (perm: string) => boolean;
}

export const StitchExpertDashboard: React.FC<StitchExpertDashboardProps> = ({
  hasPermission,
}) => {
  const canCreate = hasPermission('knowledge.create');

  return (
    <div className="w-full space-y-7 font-sans text-[#0F172A] pb-10">
      {/* ─── 1. SIGNATURE HERO WORKSPACE SECTION ─── */}
      <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 lg:p-8 xl:p-10 shadow-xs overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 xl:gap-10 items-stretch">
          {/* Left Column: Typography, Actions & Trust Badges (~33% / 4 cols on xl) */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between py-1">
            <div>
              {/* Pill Eyebrow Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4F8FE] border border-[#D9E5F2] text-[#1677F8] mb-4">
                <span className="w-2.5 h-2.5 rounded-full border border-[#1677F8] flex items-center justify-center">
                  <span className="w-1 h-1 rounded-full bg-[#1677F8]" />
                </span>
                <span className="text-[11px] font-bold tracking-wider uppercase">
                  GURUKUL AI · EXPERT WORKSPACE
                </span>
              </div>

              {/* Editorial Headline */}
              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-serif text-[#08264A] tracking-tight leading-[1.12] mb-3">
                Your Experience.<br />
                <span className="text-[#1677F8]">Their Future.</span>
              </h1>

              {/* Subtitle */}
              <p className="text-sm text-[#647A96] leading-relaxed mb-6 max-w-lg">
                Preserve the know-how only experience can teach. Empower the next generation of skilled operators.
              </p>

              {/* Button Group: Two Primary Actions */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                {canCreate && (
                  <Link
                    to="/app/knowledge-assets?kind=notes"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1677F8] hover:bg-[#125EA3] text-white font-semibold text-sm transition-all shadow-md shadow-[#1677F8]/20 hover:-translate-y-0.5"
                  >
                    <span className="material-symbols-outlined text-[19px]">edit_note</span>
                    <span>Capture Knowledge</span>
                    <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
                  </Link>
                )}

                <Link
                  to="/app/knowledge"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-[#F4F8FE] text-[#08264A] border border-[#D9E5F2] font-semibold text-sm transition-all shadow-xs"
                >
                  <span>Explore My Knowledge</span>
                </Link>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-6 pt-5 border-t border-slate-100 w-full text-xs text-[#647A96]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[17px]">graphic_eq</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-800 leading-tight">Direct Master-to-Apprentice Pipeline</div>
                  <div className="text-[11px] text-slate-400">ISO 9001 / AS9100 Verified</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[17px]">verified</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-800 leading-tight">Trusted by Leading Industries</div>
                  <div className="text-[11px] text-slate-400">Global Compliance &amp; Safety</div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column: Industrial Machinist Video Card (~42% / 5 cols) */}
          <div className="lg:col-span-4 xl:col-span-5">
            <div className="relative w-full h-full min-h-[320px] rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-md bg-slate-100 flex items-center justify-center">
              <img
                alt="Aerospace Precision Machining"
                className="w-full h-full object-cover object-center"
                src="/assets/stitch_hero_machinist.jpg"
              />
              <div className="absolute bottom-3 left-3 bg-[#08264A]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white text-xs font-medium flex items-center gap-2.5 shadow-sm">
                <span className="w-5 h-5 rounded-full bg-[#1677F8] text-white flex items-center justify-center text-[10px]">
                  ▶
                </span>
                <span>Aerospace Precision Machining</span>
                <span className="text-slate-300 text-xs ml-1 font-mono">2:48</span>
              </div>
            </div>
          </div>

          {/* Right Column: 4 Vertical Media Metric Tiles (~25% / 3 cols) */}
          <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-3 justify-between h-full">
            <Link
              to="/app/knowledge-assets?kind=video"
              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3.5 px-4 flex items-center gap-3.5 hover:border-[#1677F8] hover:bg-white hover:shadow-xs transition-all flex-1"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1E293B] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">play_arrow</span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">Video</div>
                <div className="text-xs text-slate-500 font-medium">12 items</div>
              </div>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=audio"
              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3.5 px-4 flex items-center gap-3.5 hover:border-[#1677F8] hover:bg-white hover:shadow-xs transition-all flex-1"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0284c7] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">graphic_eq</span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">Audio</div>
                <div className="text-xs text-slate-500 font-medium">8 items</div>
              </div>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=image"
              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3.5 px-4 flex items-center gap-3.5 hover:border-[#1677F8] hover:bg-white hover:shadow-xs transition-all flex-1"
            >
              <div className="w-10 h-10 rounded-xl bg-[#08264A] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">Photos</div>
                <div className="text-xs text-slate-500 font-medium">24 items</div>
              </div>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=notes"
              className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3.5 px-4 flex items-center gap-3.5 hover:border-[#1677F8] hover:bg-white hover:shadow-xs transition-all flex-1"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">description</span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">Documents</div>
                <div className="text-xs text-slate-500 font-medium">15 items</div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 2. FLAGSHIP CAPTURE SUITE SECTION ─── */}
      <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 lg:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1677F8] text-white flex items-center justify-center shadow-md shadow-[#1677F8]/20">
              <span className="material-symbols-outlined text-[22px]">photo_camera</span>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1677F8] block">
                FLAGSHIP CAPTURE SUITE
              </span>
              <h2 className="text-2xl font-serif font-bold text-[#08264A]">Capture Knowledge</h2>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border border-[#38bdf8]/60 text-[#0284c7] bg-[#f0f9ff]">
            MULTI-MODAL
          </span>
        </div>

        <p className="text-sm text-[#647A96] mb-6">
          Preserve setup details, observations, and media in a reviewable knowledge draft.
        </p>

        {/* 3 Components Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Machine Setup Preview Card (~33% / 4 cols) */}
          <div className="lg:col-span-4 relative rounded-2xl overflow-hidden border border-[#E2E8F0] min-h-[220px] bg-slate-100 flex items-center justify-center">
            <img
              src="/assets/stitch_workshop_record.jpg"
              alt="Machine Setup"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute bottom-3 left-3 bg-[#08264A]/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white text-xs font-medium flex items-center gap-2 shadow-xs">
              <span className="w-4 h-4 rounded-full bg-[#1677F8] text-white flex items-center justify-center text-[10px]">
                ▶
              </span>
              <span>Machine Setup</span>
            </div>
          </div>

          {/* 2x2 Format Selectors (~42% / 5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <Link
              to="/app/knowledge-assets?kind=video"
              aria-label="Video"
              className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-sm font-semibold text-[#08264A] hover:border-[#1677F8] hover:bg-white hover:text-[#1677F8] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#1677F8]">play_circle</span>
                <span>Video</span>
              </div>
              <span className="text-slate-400 text-base">›</span>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=audio"
              aria-label="Audio"
              className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-sm font-semibold text-[#08264A] hover:border-[#1677F8] hover:bg-white hover:text-[#1677F8] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#0284c7]">graphic_eq</span>
                <span>Audio</span>
              </div>
              <span className="text-slate-400 text-base">›</span>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=notes"
              aria-label="Notes"
              className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-sm font-semibold text-[#08264A] hover:border-[#1677F8] hover:bg-white hover:text-[#1677F8] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#0f766e]">description</span>
                <span>Notes</span>
              </div>
              <span className="text-slate-400 text-base">›</span>
            </Link>

            <Link
              to="/app/knowledge-assets?kind=image"
              aria-label="Photos"
              className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-sm font-semibold text-[#08264A] hover:border-[#1677F8] hover:bg-white hover:text-[#1677F8] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#1677F8]">photo_library</span>
                <span>Photos</span>
              </div>
              <span className="text-slate-400 text-base">›</span>
            </Link>
          </div>

          {/* Action Trigger (~25% / 3 cols) */}
          <div className="lg:col-span-3 flex flex-col justify-center gap-4">
            <Link
              to="/app/knowledge-assets"
              className="w-full py-4 px-6 rounded-xl bg-[#1677F8] hover:bg-[#125EA3] text-white font-semibold text-sm transition-all flex items-center justify-between shadow-md shadow-[#1677F8]/25 hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[20px]">edit_note</span>
                <span>Start Capturing</span>
              </div>
              <span className="material-symbols-outlined text-[19px]">arrow_forward</span>
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
              <span>Record practical knowledge for the next operator</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. KNOWLEDGE ECOSYSTEM SECTION ─── */}
      <section className="bg-gradient-to-r from-[#071f3d] via-[#092a54] to-[#0c3970] rounded-3xl p-7 lg:p-9 xl:p-10 text-white shadow-md relative overflow-hidden">
        {/* Subtle decorative mesh overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(rgba(56,189,248,0.3) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Gurukul AI Brand & Introduction (~25% / 3 cols) */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col items-start pr-0 lg:pr-4">
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="w-8 h-8 rounded-lg bg-[#1677F8] flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[19px] text-white">hub</span>
              </div>
              <span className="font-bold text-xs tracking-wider uppercase text-slate-200">
                Gurukul AI
              </span>
            </div>

            <h2 className="text-3xl lg:text-4xl font-serif font-bold text-white tracking-tight mb-3">
              Knowledge Ecosystem
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              A connected platform to capture, manage, verify and share industrial knowledge.
            </p>

            <Link
              to="/app/knowledge"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/30 text-white hover:bg-white/10 text-xs font-semibold transition-all shadow-xs"
            >
              <span>Explore Ecosystem</span>
              <span>→</span>
            </Link>
          </div>

          {/* Right: 4 Ecosystem Cards in a clean row (~75% / 9 cols) */}
          <div className="lg:col-span-8 xl:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            {/* Card 1: Knowledge Capture */}
            <div className="bg-white rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284c7] flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px]">person_outline</span>
                </div>
                <h3 className="text-sm font-bold text-[#08264A] mb-1.5">
                  Knowledge Capture
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Record, document and validate expert knowledge from the field.
                </p>
              </div>
              <Link
                to="/app/knowledge-assets"
                className="mt-5 pt-3.5 border-t border-slate-100 text-xs font-semibold text-[#1677F8] hover:text-[#0284c7] inline-flex items-center gap-1"
              >
                <span>Learn more</span>
                <span>→</span>
              </Link>
            </div>

            {/* Card 2: Knowledge Library */}
            <div className="bg-white rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284c7] flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px]">menu_book</span>
                </div>
                <h3 className="text-sm font-bold text-[#08264A] mb-1.5">
                  Knowledge Library
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Search and access verified knowledge anytime, anywhere.
                </p>
              </div>
              <Link
                to="/app/knowledge"
                className="mt-5 pt-3.5 border-t border-slate-100 text-xs font-semibold text-[#1677F8] hover:text-[#0284c7] inline-flex items-center gap-1"
              >
                <span>Access Library</span>
                <span>→</span>
              </Link>
            </div>

            {/* Card 3: My Knowledge */}
            <div className="bg-white rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284c7] flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px]">group</span>
                </div>
                <h3 className="text-sm font-bold text-[#08264A] mb-1.5">
                  My Knowledge
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Manage your contributions and track your learning progress.
                </p>
              </div>
              <Link
                to="/app/knowledge"
                className="mt-5 pt-3.5 border-t border-slate-100 text-xs font-semibold text-[#1677F8] hover:text-[#0284c7] inline-flex items-center gap-1"
              >
                <span>Go to My Knowledge</span>
                <span>→</span>
              </Link>
            </div>

            {/* Card 4: Guided Workflows */}
            <div className="bg-white rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284c7] flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px]">account_tree</span>
                </div>
                <h3 className="text-sm font-bold text-[#08264A] mb-1.5">
                  Guided Workflows
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Follow structured processes for consistent and safe operations.
                </p>
              </div>
              <Link
                to="/app/guided-workflows"
                className="mt-5 pt-3.5 border-t border-slate-100 text-xs font-semibold text-[#1677F8] hover:text-[#0284c7] inline-flex items-center gap-1"
              >
                <span>Explore Workflows</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. METRICS / STATS BAR ─── */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] p-6 lg:p-7 shadow-xs">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 lg:gap-8 items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[21px]">description</span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-[#08264A] tracking-tight leading-none">80+</div>
              <div className="text-xs text-slate-500 mt-1">Expert Knowledge Domains</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[21px]">precision_manufacturing</span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-[#08264A] tracking-tight leading-none">500+</div>
              <div className="text-xs text-slate-500 mt-1">Machines &amp; Equipment</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[21px]">assignment</span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-[#08264A] tracking-tight leading-none">1500+</div>
              <div className="text-xs text-slate-500 mt-1">Procedures &amp; Documents</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[21px]">view_in_ar</span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-[#08264A] tracking-tight leading-none">30+</div>
              <div className="text-xs text-slate-500 mt-1">Industries Supported</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#1677F8] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[21px]">public</span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-[#08264A] tracking-tight leading-none">50+</div>
              <div className="text-xs text-slate-500 mt-1">Global Customers</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. FOOTER ─── */}
      <footer className="pt-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
        <div>© 2025 Gurukul AI Inc. All rights reserved.</div>
        <div className="flex items-center gap-5">
          <span className="hover:text-slate-800 cursor-pointer">Privacy</span>
          <span>|</span>
          <span className="hover:text-slate-800 cursor-pointer">Terms</span>
          <span>|</span>
          <span className="hover:text-slate-800 cursor-pointer">Help</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <span className="w-2 h-2 rounded-full bg-[#10B981]" />
          <span>All Systems Operational (US-EAST-01)</span>
        </div>
      </footer>
    </div>
  );
};
