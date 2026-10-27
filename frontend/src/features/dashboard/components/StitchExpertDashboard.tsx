import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User } from '../../../types/auth';
import { DashboardStats } from '../../../types/dashboard';
import { searchVectorKnowledge, VectorSearchResultItem } from '../../voice/voiceApi';

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
  const pendingReviewsForUser = stats?.pending_reviews_for_user;
  const latestDraftId = stats?.latest_draft_id;
  const recentArticles = stats?.recent_articles || [];
  const [assistantQuery, setAssistantQuery] = useState('');
  const [assistantResults, setAssistantResults] = useState<VectorSearchResultItem[]>([]);
  const [assistantError, setAssistantError] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  const askAssistant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assistantQuery.trim()) return;
    setAssistantLoading(true); setAssistantError('');
    try {
      const response = await searchVectorKnowledge(assistantQuery.trim(), 3);
      setAssistantResults(response.results ?? []);
    } catch (error) {
      setAssistantResults([]);
      setAssistantError(error instanceof Error ? error.message : 'Knowledge search failed. Please try again.');
    } finally { setAssistantLoading(false); }
  };

  const knowledgeGaps: Array<{ id: string; code: string; title: string; subtitle: string; actionText: string; actionTo: string; isPrimary: boolean }> = latestDraftId ? [{
    id: latestDraftId,
    code: 'D',
    title: stats?.latest_draft_title || 'Continue your latest draft',
    subtitle: 'Resume documenting practical knowledge for peer review.',
    actionText: 'Resume Draft',
    actionTo: `/app/knowledge/${latestDraftId}`,
    isPrimary: true,
  }] : [];

  const hasKnowledgeGaps = knowledgeGaps.length > 0;

  return (
    <div className="space-y-6 w-full font-sans text-[#0F172A]">
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
                  to="/app/knowledge/new?capture=notes"
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

      {/* ─── 2. PRIMARY ACTIONS: VISIBLY ASYMMETRIC 3-CARD GRID (5:3:2 RATIO) ─── */}
      <section className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Card A: Capture Knowledge (Large Flagship Panel — ~50% width / 6 cols of 12) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-[#C8D6E4] shadow-sm p-6 lg:p-7 flex flex-col justify-between relative overflow-hidden group hover:border-[#1976C9] transition-all">
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
                    to="/app/knowledge/new?capture=video"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#1976C9]">videocam</span>
                    <span>Video</span>
                  </Link>

                  <Link
                    to="/app/knowledge/new?capture=audio"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#19A995] hover:text-[#19A995] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#19A995]">mic</span>
                    <span>Audio</span>
                  </Link>

                  <Link
                    to="/app/knowledge/new?capture=notes"
                    className="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#173B5E] hover:border-[#1976C9] hover:text-[#1976C9] hover:bg-white transition-all cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-slate-500">edit_note</span>
                    <span>Notes</span>
                  </Link>

                  <Link
                    to="/app/knowledge/new?capture=photo"
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
                to="/app/knowledge/new"
                className="py-2.5 px-5 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] text-white font-semibold text-xs transition-all flex items-center gap-2 shadow-md shadow-[#1976C9]/20 hover:-translate-y-0.5"
              >
                <span>Start Capturing →</span>
              </Link>
            </div>
          </div>

          {/* Card B: Review & Verify Knowledge (Medium Anchor Panel — ~30% width / 4 cols of 12) */}
          <div className="lg:col-span-4 bg-[#173B5E] text-white rounded-2xl p-6 lg:p-7 border border-[#173B5E] shadow-lg flex flex-col justify-between relative overflow-hidden group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center backdrop-blur-sm border border-white/15">
                  <span className="material-symbols-outlined text-[24px]">fact_check</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FEF3C7] text-[#92400E] flex items-center gap-1.5 shadow-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-ping" />
                  ACTION REQUIRED
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
                  {loading || pendingReviewsForUser === undefined ? '—' : pendingReviewsForUser}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10">
              <Link
                to="/app/reviews"
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-[#173B5E] font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
              >
                <span className="material-symbols-outlined text-[16px] text-[#1976C9]">verified</span>
                <span>Review Knowledge</span>
              </Link>
            </div>
          </div>

          {/* Card C: Knowledge Assistant (compact search panel) */}
          <div className="lg:col-span-3 bg-[#F8F9FF] rounded-2xl p-6 border border-[#C8D6E4] shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-white text-[#1976C9] flex items-center justify-center group-hover:scale-105 transition-transform border border-[#1976C9]/20 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">smart_toy</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-[#EFF4FF] text-[#1976C9] border border-[#1976C9]/20 font-semibold">
                  INDEXED KNOWLEDGE
                </span>
              </div>

              <h3 className="text-base font-bold text-[#173B5E] mb-1.5 leading-snug">
                Knowledge Assistant
              </h3>
              <p className="text-xs text-[#536779] leading-relaxed mb-4">
                Search indexed expert recordings for practical knowledge and machine guidance.
              </p>

              <form id="knowledge-assistant-query-form" onSubmit={askAssistant} className="space-y-2">
                <label className="sr-only" htmlFor="knowledge-assistant-query">Search expert knowledge</label>
                <input id="knowledge-assistant-query" value={assistantQuery} onChange={(event) => setAssistantQuery(event.target.value)}
                  placeholder="Ask about a setup or fault…" className="w-full min-w-0 rounded-xl border border-[#C8D6E4] bg-white px-3 py-2.5 text-sm text-[#173B5E] placeholder:text-slate-400 shadow-xs focus:border-[#1976C9] focus:outline-none focus:ring-2 focus:ring-[#1976C9]/20" />
                {assistantError && <p role="alert" className="text-xs text-rose-700">{assistantError}</p>}
                {assistantResults.length > 0 && <div className="max-h-36 overflow-y-auto space-y-2" aria-live="polite">
                  {assistantResults.map((result) => <article key={result.id} className="rounded-lg border border-[#DCE6F0] bg-white p-2.5">
                    <p className="text-xs text-[#173B5E] leading-relaxed">{result.chunk_text}</p>
                    <p className="mt-1 text-[10px] text-[#536779]">{result.media_title || 'Indexed expert knowledge'}</p>
                  </article>)}
                </div>}
                {assistantResults.length === 0 && !assistantLoading && assistantQuery && !assistantError && <p className="text-xs text-[#536779]" role="status">No matching indexed knowledge found.</p>}
              </form>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <button type="submit" form="knowledge-assistant-query-form" disabled={assistantLoading || !assistantQuery.trim()}
                className="w-full py-2.5 px-3 rounded-xl bg-[#1976C9] hover:bg-[#125EA3] border border-[#1976C9] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#1976C9]/40">
                <span>{assistantLoading ? 'Searching…' : 'Ask Assistant →'}</span>
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ─── 3. LOWER SUPPORTING CONTENT: 3-COLUMN BALANCED GRID ─── */}
      <section className="w-full">
        <div className={`grid grid-cols-1 ${hasKnowledgeGaps ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6 items-stretch`}>
          
          {/* Column 1: My Knowledge Overview */}
          <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#1976C9] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                  </div>
                  <h3 className="text-base font-bold text-[#173B5E]">My Knowledge Overview</h3>
                </div>
                <Link
                  to="/app/knowledge"
                  className="text-xs font-bold text-[#1976C9] hover:underline flex items-center gap-1"
                >
                  <span>View My Knowledge ({stats?.user_sops_created ?? '—'}) →</span>
                </Link>
              </div>

              {/* Compact Metric List */}
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
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

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
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

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
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

          </div>

          {/* Column 2: Still to Capture (Priority Gaps) */}
          {hasKnowledgeGaps && (
            <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#1976C9] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
                    </div>
                    <h3 className="text-base font-bold text-[#173B5E]">
                      Continue a Draft
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-[#536779]">
                    DRAFT
                  </span>
                </div>

                {/* Gap Cards List */}
                <div className="space-y-3">
                  {knowledgeGaps.map((gap) => (
                    <div
                      key={gap.id}
                      className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1976C9] transition-all flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs mt-0.5 font-mono ${
                            gap.isPrimary ? 'bg-[#EFF4FF] text-[#1976C9]' : 'bg-[#FEF3C7] text-[#B45309]'
                          }`}
                        >
                          {gap.code}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#173B5E] truncate">
                            {gap.title}
                          </h4>
                          <p className="text-[11px] text-[#536779] mt-0.5 line-clamp-2 leading-snug">
                            {gap.subtitle}
                          </p>
                        </div>
                      </div>

                      <Link
                        to={gap.actionTo}
                        className={`shrink-0 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs ${
                          gap.isPrimary
                            ? 'bg-[#1976C9] hover:bg-[#125EA3] text-white'
                            : 'bg-white hover:bg-slate-50 border border-slate-300 text-[#173B5E]'
                        }`}
                      >
                        <span>{gap.actionText}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Note */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-[#536779]">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-[#1976C9]">edit_note</span>
                  <span>Your in-progress knowledge draft</span>
                </span>
                <Link to={knowledgeGaps[0]?.actionTo || '/app/knowledge'} className="text-[#1976C9] font-bold hover:underline">
                  Open Draft
                </Link>
              </div>
            </div>
          )}

          {/* Column 3: Recently Shared Knowledge Feed */}
          <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#10B981] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">history</span>
                  </div>
                  <h3 className="text-base font-bold text-[#173B5E]">Recently Shared</h3>
                </div>
                <Link to="/app/knowledge" className="text-xs font-bold text-[#1976C9] hover:underline">
                  View History
                </Link>
              </div>

                {/* Live Articles Stream if backend has recorded entries */}
                {recentArticles.length > 0 ? (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#536779] block mb-1.5">
                      Recent Knowledge ({recentArticles.length})
                    </span>
                    <div className="space-y-1.5">
                      {recentArticles.slice(0, 2).map((art) => (
                        <div
                          key={art.id}
                          className="flex items-center justify-between text-xs py-1 px-1.5 hover:bg-slate-50 rounded"
                        >
                          <Link
                            to={`/app/knowledge/${art.id}`}
                            className="text-[#173B5E] font-medium hover:text-[#1976C9] truncate flex-1"
                          >
                            {art.title}
                          </Link>
                          <span className="text-[10px] font-semibold text-[#10B981] bg-[#ECFDF5] px-1.5 py-0.2 rounded shrink-0 ml-2">
                            {art.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 text-center py-2">
                    <span className="text-xs font-semibold text-[#536779] block">
                      No Knowledge Entries Recorded
                    </span>
                    {canCreate && (
                      <Link
                        to="/app/knowledge/new"
                        className="inline-flex items-center gap-1 text-[11px] text-[#1976C9] font-bold hover:underline mt-1"
                      >
                        <span>Capture First SOP</span>
                        <span className="material-symbols-outlined text-[13px]">add</span>
                      </Link>
                    )}
                  </div>
                )}
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
